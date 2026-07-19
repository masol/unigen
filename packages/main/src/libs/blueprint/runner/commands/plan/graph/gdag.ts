/**
 * ============================================================================
 * 【P-graph · GDag：DirectedGraph 数组 + 根 id + 产物注册表】
 * ============================================================================
 *  - PNode 是 DagNode 的代码级派生：附加 id(uuid)/status/dag(子图指针)。
 *    LLM 不产出也不见这些字段。
 *  - 每一层是一个独立 DirectedGraph：图节点 = PNode(attrs)，
 *    边 = 数据流(producer → consumer，edge attrs 记 artifact 名)。
 *    PNode.dag 指向子层 DirectedGraph 的 id —— 节点即 DAG，递归由此表达。
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
import type { SerializedGraph } from "graphology-types";
import { ARTIFACT_FUZZY_THRESHOLD } from "../config.js";
import type { DagNode } from "../schema/node.js";

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

/** 代码级运行时节点：从 DagNode 派生，LLM 不产出、不可见 */
export interface PNode extends DagNode {
    id: string;
    status: NodeStatus;
    /** 子图 id；null = 未展开(叶子)。展开 = 把本节点当作交付目标设计子 DAG */
    dag: string | null;
    /** conflict 时的矛盾描述，回喂重生成用 */
    error: string | null;
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

export class GDag {
    #graphs = new Map<string, DirectedGraph>();
    rootId: string | null = null;

    #artifacts = new Map<string, RegArtifact>(); // 正式名 → 记录
    #fuse: Fuse<RegArtifact> | null = null;

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
     */
    async registerArtifact(
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
            d.#graphs.set(id, DirectedGraph.from(data));
        }
        for (const a of j.artifacts) d.#artifacts.set(a.name, a);
        return d;
    }
}