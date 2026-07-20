/**
 * ============================================================================
 * 【P-graph · GDag：DirectedGraph 数组 + 根 id + 产物注册表】
 * ============================================================================
 *  - PNode 是 DagNode 的代码级派生：附加 id(uuid)/status/dag(子图指针)/facets。
 *    LLM 不产出也不见这些字段。
 *  - facets = 与 status 生命周期正交的并行判定维度，三态 pending/yes/no。
 *    【为何不用 tag】tag 只能表达"是"，区分不出"未判定"与"判定为否"，
 *    外层重入架构下会导致同一判定被反复重算(LLM 调用不幂等)。
 *    【为何是 Record 而非逐属性字段】新增维度不改 schema；旧存档缺省
 *    读出 'pending'，语义恰好正确("新维度在旧节点上尚未判定")。
 *  - 每一层是一个独立 DirectedGraph：图节点 = PNode(attrs)，
 *    边 = 数据流(producer → consumer，edge attrs 记 artifact 名)。
 *    PNode.dag 指向子层 DirectedGraph 的 id —— 节点即 DAG，递归由此表达。
 *  - 遍历归 GDag：walk(异步访问器/同层 filter/skip/stop/并行度) + topoNodes。
 *    并行度是【全局】闸门(共享信号量)：DFS 递归下逐层限流会按深度相乘，
 *    限不住真实并发。"看到节点做什么"是 pass 的事，不在此出现。
 *  - registerArtifact 内部整体串行(promise 链)：查重→检索→LLM 裁决→写入
 *    是长 async 链，并行 walk 下交错执行会使查重在写入前失效。
 *  - 持久化 = { rootId, graphs: [{id, data}], artifacts }，graphology 自带
 *    export/import，可完整重构。这是自由中间格式，最终转 capabilities 表
 *    是最后一遍的事。
 *  - 产物注册表全局唯一：新名字先 Fuse 找疑似，命中交 LLM 裁决归一，
 *    别名留痕。dataSchema 槽位供后续 pass 以 JSON Schema+description
 *    逐遍细化(含长度判断 → Map-Reduce 拆分)。
 */
import { getSmartModel } from "$libs/model/index.js";
import type { IRunnerContext } from '$types/blueprint/context.js';
import { generateText } from "ai";
import Logger from "electron-log/main.js";
import Fuse from "fuse.js";
import { DirectedGraph } from "graphology";
import { topologicalSort } from "graphology-dag";
import type { SerializedGraph } from "graphology-types";
import { ARTIFACT_FUZZY_THRESHOLD } from "../config.js";
import type { DagNode, Io } from "../schema/node.js";

/**
 * 节点生命周期(对齐 capability 的演进路径)：
 *  pending       刚登记，仅有 name/intent/io，等待处理
 *  expanding     处理中(正在为其设计子 DAG 或细化数据结构)
 *  expanded      已展开，dag 指向子图；自身退化为归约视图
 *  awaiting_code 设计完毕，等待生成可执行载体(code/workflow/提示词)
 *  done          已落为 capability
 *  conflict      被校验/评审判定矛盾，等待重生成
 */
export type NodeStatus =
    | 'pending' | 'expanding' | 'expanded'
    | 'awaiting_code' | 'done' | 'conflict';

// ── facets：并行判定维度(三态) ───────────────────────────────────────────

export type TriState = 'pending' | 'yes' | 'no';
export type Facets = Record<string, TriState>;

/** facet 名字典。新维度只在此加名字，不改任何结构 */
export const FacetNames = {
    /** 弱模型单次调用可胜任 */
    simple: 'simple',
    /** 确定性代码可直接实现(不需要语义理解) */
    codeable: 'codeable',
    /** 存在现成库/工具可直接调用(检索当前为空实现，恒 no) */
    lib: 'lib',
    // 未来：split(需要数据拆分)、quality(需要质量闸)……
} as const;

/** 三态读取：缺省(旧存档/新维度)即 pending */
export function getFacet(n: PNode, facet: string): TriState {
    return n.facets?.[facet] ?? 'pending';
}

/** 叶子可执行判定：任一执行途径成立即可落码 */
export function isExecutable(n: PNode): boolean {
    return getFacet(n, FacetNames.simple) === 'yes'
        || getFacet(n, FacetNames.codeable) === 'yes'
        || getFacet(n, FacetNames.lib) === 'yes';
}

/** 代码级运行时节点：从 DagNode 派生，LLM 不产出、不可见 */
export interface PNode extends DagNode {
    id: string;
    status: NodeStatus;
    /** 子图 id；null = 未展开(叶子)。展开 = 把本节点当作交付目标设计子 DAG */
    dag: string | null;
    /** conflict 时的矛盾描述，回喂重生成用 */
    error: string | null;
    /** 并行判定维度。禁止经 updateNode 整体打补丁(浅合并会整包覆盖)，用 setFacet */
    facets: Facets;
    /**
     * 强制裁决留痕(与 error 的 conflict 语义分离)：非空 = 该节点是被
     * 深度熔断等机制"强制"落叶的，判定结果不可信，转代码时必须特殊对待。
     */
    forcedNote?: string;
}

export interface RegArtifact {
    name: string;           // 归一后的正式名
    intent: string;
    aliases: string[];      // 归一吸收的别名，留痕供审计
    dataSchema: unknown | null; // 后续 pass 的细化槽位，第一遍恒为 null
}

export interface GDagJSON {
    rootId: string | null;
    graphs: { id: string; data: SerializedGraph }[];
    artifacts: RegArtifact[];
}

// ── 遍历访问器协议 ──────────────────────────────────────────────────────────

export interface WalkEntry {
    graphId: string;
    /** 根层为 0 */
    depth: number;
    node: PNode;
}
/** 'skip' = 不下潜该节点的子图；'stop' = 终止整个遍历；void = 正常继续 */
export type WalkControl = 'skip' | 'stop' | void;
export type WalkVisitor = (e: WalkEntry) => Promise<WalkControl> | WalkControl;

export interface WalkOptions {
    startGraphId?: string;
    /** 同层筛选。只控制"是否调用访问器"，不阻断下潜(被筛掉的已展开节点，其子层照常遍历) */
    filter?: (n: PNode) => boolean;
    /**
     * 并行访问器上限，默认 1 = 严格 DFS 顺序、错误即时上抛。
     * >1 时：访问器并行执行(全局共享闸门，不是逐层上限)；同层访问顺序
     * 不再保证；'stop' 尽力而为(已在跑的分支会跑完)；任一分支出错
     * 【不会】中断其余在跑分支——全部落定后统一抛出(单错原样抛，
     * 多错 AggregateError)。绝不留下遍历结束后仍在后台改图的脱缰任务。
     */
    concurrency?: number;
}

interface WalkState {
    stopped: boolean;
    errors: unknown[];
}

/** 极简计数信号量：walk 并行访问器的全局闸门 */
class Semaphore {
    #waiters: (() => void)[] = [];
    #free: number;
    constructor(n: number) { this.#free = Math.max(1, n); }
    async acquire(): Promise<void> {
        if (this.#free > 0) { this.#free--; return; }
        await new Promise<void>(resolve => this.#waiters.push(resolve));
    }
    release(): void {
        const next = this.#waiters.shift();
        if (next) next(); else this.#free++;
    }
}

export class GDag {
    #graphs = new Map<string, DirectedGraph>();
    rootId: string | null = null;

    #artifacts = new Map<string, RegArtifact>(); // 正式名 → 记录
    #fuse: Fuse<RegArtifact> | null = null;
    /** registerArtifact 串行闸门(见 registerArtifact 注释) */
    #regChain: Promise<unknown> = Promise.resolve();

    // ── 产物注册表(Fuse 快筛 + LLM 归一) ───────────────────────────────────

    #rebuildFuse(): void {
        this.#fuse = new Fuse([...this.#artifacts.values()], {
            keys: [
                { name: "name", weight: 0.6 },
                { name: "intent", weight: 0.3 },
                { name: "aliases", weight: 0.1 },
            ],
            includeScore: true,
            threshold: 0.6, // 宽召回，精判交给阈值 + LLM
        });
    }

    /** 解析到正式名(含别名命中)；不存在返回 null */
    resolveName(name: string): string | null {
        if (this.#artifacts.has(name)) return name;
        for (const a of this.#artifacts.values())
            if (a.aliases.includes(name)) return a.name;
        return null;
    }

    /**
     * 登记产物，返回归一后的正式名。
     * 精确命中直接归一；Fuse 疑似(score ≤ 阈值)交 LLM 裁决；否则新建。
     *
     * 【整体串行】"查重→Fuse 检索→LLM 裁决→写入"是长 async 链。并行展开
     * (walk concurrency>1)下多条链交错执行时，查重/候选名单在写入前就已
     * 过期(同名双建、裁决对象缺漏)。注册表是全局唯一真相源，此处以
     * promise 链整体排队；相对 LLM 调用本身，排队代价可忽略。
     */
    async registerArtifact(
        cand: { name: string; intent: string },
        ctx: IRunnerContext,
    ): Promise<string> {
        const run = this.#regChain.then(() => this.#registerArtifactImpl(cand, ctx));
        this.#regChain = run.then(() => undefined, () => undefined); // 失败不断链
        return run;
    }

    async #registerArtifactImpl(
        cand: { name: string; intent: string },
        ctx: IRunnerContext,
    ): Promise<string> {
        const exact = this.resolveName(cand.name);
        if (exact) return exact;

        if (!this.#fuse) this.#rebuildFuse();
        const suspects = this.#fuse!
            .search(`${cand.name} ${cand.intent}`)
            .filter(h => (h.score ?? 1) <= ARTIFACT_FUZZY_THRESHOLD)
            .map(h => h.item);

        if (suspects.length > 0) {
            const same = await this.#judgeSame(cand, suspects, ctx);
            if (same) {
                if (!same.aliases.includes(cand.name)) same.aliases.push(cand.name);
                Logger.debug(`[gdag] 产物归一：「${cand.name}」→「${same.name}」`);
                this.#rebuildFuse();
                return same.name;
            }
        }

        this.#artifacts.set(cand.name, {
            name: cand.name, intent: cand.intent, aliases: [], dataSchema: null,
        });
        this.#rebuildFuse();
        return cand.name;
    }

    async #judgeSame(
        cand: { name: string; intent: string },
        suspects: RegArtifact[],
        ctx: IRunnerContext,
    ): Promise<RegArtifact | null> {
        const list = suspects
            .map((s, i) => `${i + 1}. name=「${s.name}」 intent=「${s.intent}」`)
            .join("\n");
        const { text } = await generateText({
            model: getSmartModel(undefined, ctx),
            instructions: `你是数据产物归一裁判。判断"新产物"与候选中的某一项是否指同一份数据。
判据是数据内容本质相同、仅命名/措辞不同。用途不同、粒度不同、加工阶段不同的，一律视为不同。
若与第 k 项相同，只输出数字 k；若全都不同，只输出 0。不要输出其他任何内容。`,
            prompt: `新产物：name=「${cand.name}」 intent=「${cand.intent}」\n候选：\n${list}`,
        });
        const k = parseInt(text.trim(), 10);
        if (Number.isInteger(k) && k >= 1 && k <= suspects.length) {
            return suspects[k - 1];
        }
        return null;
    }

    getArtifact(name: string): RegArtifact | null {
        const formal = this.resolveName(name);
        return formal ? this.#artifacts.get(formal)! : null;
    }
    allArtifacts(): RegArtifact[] { return [...this.#artifacts.values()]; }

    // ── 图管理 ──────────────────────────────────────────────────────────────

    /**
     * 用一批 PNode 建一个新层：图节点 = PNode，边由代码按 io 名称匹配连出。
     * simple graph:同一对节点间的多份数据流合并为一条边，
     * 边属性 artifacts 记全部数据名。LLM 从不涉足连边。
     */
    createLayer(nodes: PNode[], asRoot = false): string {
        const g = new DirectedGraph();
        const producer = new Map<string, string>(); // artifact 正式名 → node.id
        for (const n of nodes) {
            g.addNode(n.id, { ...n });
            for (const o of n.outputs) producer.set(o.name, n.id);
        }
        for (const n of nodes) {
            for (const i of n.inputs) {
                const from = producer.get(i.name);
                if (!from || from === n.id) continue;
                if (g.hasEdge(from, n.id)) {
                    const prev = g.getEdgeAttribute(from, n.id, 'artifacts') as string[];
                    g.setEdgeAttribute(from, n.id, 'artifacts', [...prev, i.name]);
                } else {
                    g.addEdge(from, n.id, { artifacts: [i.name] });
                }
            }
        }
        const id = crypto.randomUUID();
        this.#graphs.set(id, g);
        if (asRoot) this.rootId = id;
        return id;
    }

    getGraph(id: string): DirectedGraph | null { return this.#graphs.get(id) ?? null; }

    /**
     * 丢弃一个层(展开的边界对账失败回滚用)。根层禁删。
     * 注意：该层经 registerArtifact 写入注册表的产物/别名【不】回滚——
     * 注册表是追加式留痕，残留别名无害。@todo 若污染成为实际问题再引入事务。
     */
    dropGraph(id: string): void {
        if (id === this.rootId) throw new Error(`[gdag] 根层禁止丢弃：${id}`);
        this.#graphs.delete(id);
    }

    /** 全局定位节点(跨所有层) */
    findNode(nodeId: string): { graphId: string; node: PNode } | null {
        for (const [gid, g] of this.#graphs) {
            if (g.hasNode(nodeId)) {
                return { graphId: gid, node: g.getNodeAttributes(nodeId) as PNode };
            }
        }
        return null;
    }

    updateNode(nodeId: string, patch: Partial<PNode>): void {
        const hit = this.findNode(nodeId);
        if (!hit) throw new Error(`[gdag] 节点不存在：${nodeId}`);
        const g = this.#graphs.get(hit.graphId)!;
        g.mergeNodeAttributes(nodeId, patch);
    }

    /**
     * facet 专用写入：读-改-写整个 facets 对象，绕开浅合并覆盖问题。
     * 注意：写入的是新对象，调用方手头的 PNode 快照不会随之更新，
     * 需要最新值时用 findNode 重读。
     */
    setFacet(nodeId: string, facet: string, value: TriState): void {
        const hit = this.findNode(nodeId);
        if (!hit) throw new Error(`[gdag] 节点不存在：${nodeId}`);
        const g = this.#graphs.get(hit.graphId)!;
        g.setNodeAttribute(nodeId, 'facets', { ...hit.node.facets, [facet]: value });
    }

    /**
     * 展开节点：把子层挂到 node.dag。
     * 这是递归的全部机制——展开时以该节点的 inputs 为初始数据、
     * outputs 为交付目标，调用同一套 designDag 得到子节点清单。
     */
    attachSubDag(nodeId: string, subGraphId: string): void {
        this.updateNode(nodeId, { dag: subGraphId, status: 'expanded' });
    }

    /** harness 扫描：遍历全部层，收集处于指定状态的节点 */
    scan(status: NodeStatus): { graphId: string; node: PNode }[] {
        const out: { graphId: string; node: PNode }[] = [];
        for (const [gid, g] of this.#graphs) {
            g.forEachNode((_, attrs) => {
                const n = attrs as PNode;
                if (n.status === status) out.push({ graphId: gid, node: n });
            });
        }
        return out;
    }

    // ── 上游数据池：展开的可用输入集合(代码遍历收集) ────────────────────────

    /**
     * 节点在其层内的可用数据池 = 同层全部祖先节点的 outputs + 本层初始数据，
     * 再剔除节点自己 inputs 已占用的名字。同名多来源时首见者胜(名字全局
     * 归一，intent 等价)。
     *
     * 【只看同层，不跨层上收】跨层可用会让子层消费父作用域数据 →
     * 父节点 inputs 级联改写一路传导到根，与"外层重入"架构相性极差。
     * @todo 跨层数据池需先有依赖追踪，与 plan 工作流化一并考虑。
     */
    upstreamPool(graphId: string, nodeId: string): Io[] {
        const g = this.#graphs.get(graphId);
        if (!g || !g.hasNode(nodeId)) return [];

        // 同层祖先：反向 BFS
        const ancestors = new Set<string>();
        const queue = [nodeId];
        while (queue.length > 0) {
            const cur = queue.shift()!;
            g.forEachInNeighbor(cur, (nb) => {
                if (!ancestors.has(nb)) { ancestors.add(nb); queue.push(nb); }
            });
        }

        const self = g.getNodeAttributes(nodeId) as PNode;
        const taken = new Set(self.inputs.map(i => i.name));
        const pool = new Map<string, Io>();
        const add = (io: Io): void => {
            if (!taken.has(io.name) && !pool.has(io.name)) pool.set(io.name, io);
        };

        for (const aid of ancestors) {
            const a = g.getNodeAttributes(aid) as PNode;
            for (const o of a.outputs) add(o);
        }
        // 本层初始数据(无层内产出者的 inputs)：从各节点 inputs 捞 intent
        const produced = new Set<string>();
        g.forEachNode((_, attrs) => {
            for (const o of (attrs as PNode).outputs) produced.add(o.name);
        });
        g.forEachNode((_, attrs) => {
            for (const i of (attrs as PNode).inputs)
                if (!produced.has(i.name)) add(i);
        });
        return [...pool.values()];
    }

    /**
     * 展开选用池内数据后的父节点 inputs 增量回写：只加不删，并重连该层的边。
     * 【只加不删】删除"子层未用到的原 input"会使兄弟节点产物变成悬空终端，
     * 破坏该层已通过校验的不变式；未用输入的清理属于未来的裁剪 pass。
     * 新增输入只可能来自同层祖先/初始数据(upstreamPool 保证)，重连不会成环。
     */
    addNodeInputs(graphId: string, nodeId: string, extra: Io[]): void {
        if (extra.length === 0) return;
        const g = this.#graphs.get(graphId);
        if (!g || !g.hasNode(nodeId)) throw new Error(`[gdag] 节点不存在：${nodeId}`);
        const node = g.getNodeAttributes(nodeId) as PNode;
        const have = new Set(node.inputs.map(i => i.name));
        const added = extra.filter(io => !have.has(io.name));
        if (added.length === 0) return;
        g.setNodeAttribute(nodeId, 'inputs', [...node.inputs, ...added]);

        // 重连：找到新增数据的层内产出者，补边(与 createLayer 同一推导规则)
        const producer = new Map<string, string>();
        g.forEachNode((nid, attrs) => {
            for (const o of (attrs as PNode).outputs) producer.set(o.name, nid);
        });
        for (const io of added) {
            const from = producer.get(io.name);
            if (!from || from === nodeId) continue; // 初始数据/自产，无边
            if (g.hasEdge(from, nodeId)) {
                const prev = g.getEdgeAttribute(from, nodeId, 'artifacts') as string[];
                if (!prev.includes(io.name))
                    g.setEdgeAttribute(from, nodeId, 'artifacts', [...prev, io.name]);
            } else {
                g.addEdge(from, nodeId, { artifacts: [io.name] });
            }
        }
        Logger.debug(`[gdag] 「${node.name}」inputs 增量回写：${added.map(a => a.name).join("、")}`);
    }

    // ── 遍历 ────────────────────────────────────────────────────────────────

    /** 层内拓扑序节点。层在 attach 前已过无环校验，topologicalSort 不会抛 */
    topoNodes(graphId: string): PNode[] {
        const g = this.#graphs.get(graphId);
        if (!g) return [];
        return topologicalSort(g).map(id => g.getNodeAttributes(id) as PNode);
    }

    /** 层深度表：graphId → depth(根层 0)。沿 node.dag 指针推导，不另存父指针 */
    layerDepths(): Map<string, number> {
        const depths = new Map<string, number>();
        if (!this.rootId) return depths;
        const rec = (gid: string, d: number): void => {
            if (depths.has(gid)) return;
            depths.set(gid, d);
            const g = this.#graphs.get(gid);
            if (!g) return;
            g.forEachNode((_, attrs) => {
                const sub = (attrs as PNode).dag;
                if (sub) rec(sub, d + 1);
            });
        };
        rec(this.rootId, 0);
        return depths;
    }

    /**
     * 深度优先遍历：每层按拓扑序，逐节点调用异步访问器，然后下潜其子图。
     * 【关键语义】访问器返回后【重读】node.dag 再决定下潜——访问器若在
     * 访问中为节点挂上了子图(attachSubDag)，walk 会顺势钻进新层继续。
     * 递归展开 pass 因此只需一次 walk，不需要外层 while。
     *
     * 返回 true = 完整走完；false = 被访问器 'stop' 终止。
     * 并发语义见 WalkOptions.concurrency。
     */
    async walk(visitor: WalkVisitor, opts: WalkOptions = {}): Promise<boolean> {
        const start = opts.startGraphId ?? this.rootId;
        if (!start) return true;
        const depth = this.layerDepths().get(start) ?? 0;
        const concurrency = Math.max(1, opts.concurrency ?? 1);
        const state: WalkState = { stopped: false, errors: [] };
        const sem = new Semaphore(concurrency);

        await this.#walkLayer(start, depth, visitor, opts.filter, concurrency, sem, state);

        if (state.errors.length === 1) throw state.errors[0];
        if (state.errors.length > 1)
            throw new AggregateError(state.errors,
                `[gdag] walk 并行分支 ${state.errors.length} 处失败`);
        return !state.stopped;
    }

    async #walkLayer(
        gid: string, depth: number,
        visitor: WalkVisitor, filter: ((n: PNode) => boolean) | undefined,
        concurrency: number, sem: Semaphore, state: WalkState,
    ): Promise<void> {
        const g = this.#graphs.get(gid);
        if (!g) return;
        const order = topologicalSort(g); // 快照：访问中新挂的子图不影响本层迭代

        const runNode = async (nid: string): Promise<void> => {
            if (state.stopped) return;
            const node = g.getNodeAttributes(nid) as PNode;
            if (!filter || filter(node)) {
                await sem.acquire();
                let ctrl: WalkControl;
                try {
                    if (state.stopped) return; // 等闸期间可能已停
                    ctrl = await visitor({ graphId: gid, depth, node });
                } finally {
                    sem.release();
                }
                if (ctrl === 'stop') { state.stopped = true; return; }
                if (ctrl === 'skip') return;
            }
            // 重读：访问器可能刚挂了子图(attachSubDag)
            const fresh = g.getNodeAttributes(nid) as PNode;
            if (fresh.dag)
                await this.#walkLayer(fresh.dag, depth + 1, visitor, filter, concurrency, sem, state);
        };

        if (concurrency <= 1) {
            // 串行：严格 DFS 顺序，错误直接上抛(不存在需要等待落定的兄弟分支)
            for (const nid of order) {
                if (state.stopped) return;
                await runNode(nid);
            }
        } else {
            /*
             * 并行：兄弟节点(含各自的下潜链)并发跑，访问器受全局信号量限流。
             * 单分支出错只记账并阻止新分支启动，绝不提前返回——必须等
             * 全部在飞分支落定，walk 返回后才能保证没有后台任务还在改图。
             */
            await Promise.all(order.map(nid =>
                runNode(nid).catch(err => {
                    state.errors.push(err);
                    state.stopped = true;
                })
            ));
        }
    }

    // ── 层边界 ──────────────────────────────────────────────────────────────

    /** 层内初始数据：无层内产出者的 input 名(子层者应恰落在父节点 inputs 内) */
    initialArtifacts(graphId: string): string[] {
        const g = this.#graphs.get(graphId);
        if (!g) return [];
        const produced = new Set<string>();
        g.forEachNode((_, attrs) => {
            for (const o of (attrs as PNode).outputs) produced.add(o.name);
        });
        const out = new Set<string>();
        g.forEachNode((_, attrs) => {
            for (const i of (attrs as PNode).inputs)
                if (!produced.has(i.name)) out.add(i.name);
        });
        return [...out];
    }

    /** 层内终端产物：产出后无人消费的 artifact 名(根层唯一者即最终交付物) */
    terminalArtifacts(graphId: string): string[] {
        const g = this.#graphs.get(graphId);
        if (!g) return [];
        const consumed = new Set<string>();
        g.forEachNode((_, attrs) => {
            for (const i of (attrs as PNode).inputs) consumed.add(i.name);
        });
        const out: string[] = [];
        g.forEachNode((_, attrs) => {
            for (const o of (attrs as PNode).outputs)
                if (!consumed.has(o.name)) out.push(o.name);
        });
        return out;
    }

    // ── 持久化：DirectedGraph 数组 + 根 id + 注册表，可完整重构 ────────────

    toJSON(): GDagJSON {
        return {
            rootId: this.rootId,
            graphs: [...this.#graphs.entries()].map(([id, g]) => ({
                id, data: g.export(),
            })),
            artifacts: [...this.#artifacts.values()],
        };
    }

    static fromJSON(j: GDagJSON): GDag {
        const d = new GDag();
        d.rootId = j.rootId;
        for (const { id, data } of j.graphs) {
            /*
             * 用 DirectedGraph.from 按序列化数据内嵌的 options 重构，
             * 不再手工 new + import——正是"手工实例 options 与数据内嵌
             * options 不一致"触发了 inconsistent multi 异常。
             * 现在全模块只产 simple graph，options 恒一致。
             */
            const g = DirectedGraph.from(data);
            // 旧存档兼容：facets 缺省补空对象(读出即全 pending，语义正确)
            g.forEachNode((nid, attrs) => {
                if (!(attrs as PNode).facets) g.setNodeAttribute(nid, 'facets', {});
            });
            d.#graphs.set(id, g);
        }
        for (const a of j.artifacts) d.#artifacts.set(a.name, a);
        return d;
    }
}