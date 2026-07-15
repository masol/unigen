/**
 * 黑板：graphology 有向图承载全部状态，同时就是术语表。
 * 节点两类: artifact / method；边方向统一为依赖方向:
 *   artifact --input_of--> method --produces--> artifact
 * 图为唯一真相源：无独立队列；失败/被拦截的尝试全部留在图上（不删），
 * 供 X4 换路引用与事后审计。持久化 = graph.export() 整图落盘。
 */
import { DirectedGraph } from "graphology";
import { topologicalSort, willCreateCycle } from "graphology-dag";

export type Modality = "text" | "concept" | "image" | "audio" | "video" | "binary";
export type ArtifactStatus = "source" | "derivable" | "pending" | "blocked";
export type MethodStatus = "open" | "closed" | "blocked";

export interface ArtifactAttrs {
    kind: "artifact";
    modality: Modality;
    definition: string;
    status: ArtifactStatus;
    aliases: string[];
    needsReview: boolean;      // 对齐低置信时标记，人工确认用
    blockReason?: string;
}
export interface MethodAttrs {
    kind: "method";
    transform: string;
    gate: "A" | "B";
    status: MethodStatus;
    rejected: { input: string; reason: string }[]; // 被拦截的边意图，留痕不删
    blockReason?: string;
}

export function normalizeId(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
}

/** 廉价字符串相似度（Dice bigram），预筛用；高相似才触发 X3 复核 */
export function diceSim(a: string, b: string): number {
    if (a === b) return 1;
    const bg = (s: string) => {
        const g: string[] = [];
        for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2));
        return g;
    };
    const A = bg(a), B = bg(b);
    if (!A.length || !B.length) return 0;
    const m = new Map<string, number>();
    for (const x of B) m.set(x, (m.get(x) ?? 0) + 1);
    let inter = 0;
    for (const x of A) {
        const c = m.get(x) ?? 0;
        if (c > 0) { inter++; m.set(x, c - 1); }
    }
    return (2 * inter) / (A.length + B.length);
}

export class Blackboard {
    readonly g: DirectedGraph;
    private methodSeq = new Map<string, number>();

    constructor(g?: DirectedGraph) {
        this.g = g ?? new DirectedGraph({ type: "directed", multi: false });
    }

    /* ---------- 持久化：图即全部状态 ---------- */
    export(): unknown { return this.g.export(); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static from(serialized: any): Blackboard {
        const g = new DirectedGraph({ type: "directed", multi: false });
        g.import(serialized);
        return new Blackboard(g);
    }

    /* ---------- artifact ---------- */
    addArtifact(id: string, attrs: Omit<ArtifactAttrs, "kind" | "aliases" | "needsReview"> & { needsReview?: boolean }): string {
        if (this.g.hasNode(id)) return id;
        this.g.addNode(id, {
            kind: "artifact", aliases: [], needsReview: attrs.needsReview ?? false,
            modality: attrs.modality, definition: attrs.definition, status: attrs.status,
        } satisfies ArtifactAttrs);
        return id;
    }
    artifact(id: string): ArtifactAttrs | null {
        return this.g.hasNode(id) && this.g.getNodeAttribute(id, "kind") === "artifact"
            ? (this.g.getNodeAttributes(id) as ArtifactAttrs) : null;
    }
    setArtifactStatus(id: string, status: ArtifactStatus, reason?: string) {
        this.g.mergeNodeAttributes(id, { status, ...(reason ? { blockReason: reason } : {}) });
    }
    addAlias(id: string, alias: string) {
        const a = this.artifact(id);
        if (a && !a.aliases.includes(alias)) this.g.setNodeAttribute(id, "aliases", [...a.aliases, alias]);
    }
    artifacts(filter?: (a: ArtifactAttrs, id: string) => boolean): { id: string; attrs: ArtifactAttrs }[] {
        const out: { id: string; attrs: ArtifactAttrs }[] = [];
        this.g.forEachNode((id, attrs) => {
            if (attrs.kind !== "artifact") return;
            const a = attrs as ArtifactAttrs;
            if (!filter || filter(a, id)) out.push({ id, attrs: a });
        });
        return out;
    }

    /* ---------- method ---------- */
    addMethod(outputId: string, transform: string, gate: "A" | "B"): string {
        const n = (this.methodSeq.get(outputId) ?? 0) + 1;
        this.methodSeq.set(outputId, n);
        const mid = `${outputId}::m${n}`;
        this.g.addNode(mid, { kind: "method", transform, gate, status: "open", rejected: [] } satisfies MethodAttrs);
        this.g.addDirectedEdge(mid, outputId, { rel: "produces" });
        return mid;
    }
    method(mid: string): MethodAttrs | null {
        return this.g.hasNode(mid) && this.g.getNodeAttribute(mid, "kind") === "method"
            ? (this.g.getNodeAttributes(mid) as MethodAttrs) : null;
    }
    setMethodStatus(mid: string, status: MethodStatus, reason?: string) {
        this.g.mergeNodeAttributes(mid, { status, ...(reason ? { blockReason: reason } : {}) });
    }
    recordRejected(mid: string, input: string, reason: string) {
        const m = this.method(mid)!;
        this.g.setNodeAttribute(mid, "rejected", [...m.rejected, { input, reason }]);
    }
    /** 产出某 artifact 的全部 method（OR 组） */
    methodsOf(artifactId: string): { id: string; attrs: MethodAttrs }[] {
        const out: { id: string; attrs: MethodAttrs }[] = [];
        this.g.forEachInNeighbor(artifactId, (mid, attrs) => {
            if (attrs.kind === "method") out.push({ id: mid, attrs: attrs as MethodAttrs });
        });
        return out;
    }
    /** 某 method 的全部 input artifact（AND 组） */
    inputsOf(mid: string): string[] {
        return this.g.inNeighbors(mid).filter((n) => this.g.getNodeAttribute(n, "kind") === "artifact");
    }
    outputOf(mid: string): string {
        return this.g.outNeighbors(mid).find((n) => this.g.getNodeAttribute(n, "kind") === "artifact")!;
    }

    /* ---------- 环检测 + 加边（预判，禁止回滚式写法） ---------- */
    tryAddInputEdge(inputId: string, mid: string): { ok: true } | { ok: false; reason: string } {
        if (this.g.hasEdge(inputId, mid)) return { ok: true };
        if (willCreateCycle(this.g, inputId, mid)) return { ok: false, reason: "cycle" };
        this.g.addDirectedEdge(inputId, mid, { rel: "input_of" });
        return { ok: true };
    }

    /* ---------- 递归守门：final→节点 的祖先链深度 + 重复模式 ---------- */
    /** 沿 produces→input_of 反向上溯（即沿出边），取该 artifact 到 final 的最短链 */
    ancestorChain(artifactId: string, finalId: string): string[] {
        // BFS: artifact --input_of--> method --produces--> artifact ...
        const prev = new Map<string, string | null>([[artifactId, null]]);
        const q = [artifactId];
        while (q.length) {
            const cur = q.shift()!;
            if (cur === finalId) {
                const chain: string[] = [];
                let p: string | null = cur;
                while (p) { chain.push(p); p = prev.get(p) ?? null; }
                return chain.filter((n) => this.g.getNodeAttribute(n, "kind") === "artifact");
            }
            for (const nx of this.g.outNeighbors(cur)) {
                if (!prev.has(nx)) { prev.set(nx, cur); q.push(nx); }
            }
        }
        return [artifactId];
    }
    isRecursionAbuse(chain: string[], maxDepth: number, maxRepeat: number): string | null {
        if (chain.length > maxDepth) return `depth>${maxDepth}`;
        const c = new Map<string, number>();
        for (const id of chain) {
            const n = (c.get(id) ?? 0) + 1;
            c.set(id, n);
            if (n > maxRepeat) return `repeat(${id})>${maxRepeat}`;
        }
        return null;
    }

    /* ---------- 真闭包回填（可能级联），返回是否有变化 ---------- */
    backfill(): boolean {
        let changed = false, pass = true;
        while (pass) {
            pass = false;
            this.g.forEachNode((mid, attrs) => {
                if (attrs.kind !== "method" || attrs.status !== "open") return;
                const inputs = this.inputsOf(mid);
                if (inputs.length === 0) return;
                const allReady = inputs.every((i) => {
                    const s = this.artifact(i)!.status;
                    return s === "source" || s === "derivable";
                });
                if (allReady) {
                    this.setMethodStatus(mid, "closed");
                    const out = this.outputOf(mid);
                    if (this.artifact(out)!.status === "pending") this.setArtifactStatus(out, "derivable");
                    changed = pass = true;
                }
            });
        }
        return changed;
    }

    /* ---------- 阻塞传播：input blocked→method blocked；全 method blocked→artifact 待换路 ---------- */
    propagateBlocked(): string[] {
        const needReroute: string[] = [];
        let pass = true;
        while (pass) {
            pass = false;
            this.g.forEachNode((mid, attrs) => {
                if (attrs.kind !== "method" || attrs.status !== "open") return;
                const bad = this.inputsOf(mid).find((i) => this.artifact(i)!.status === "blocked");
                if (bad) {
                    this.setMethodStatus(mid, "blocked", `input_blocked:${bad}`);
                    pass = true;
                }
            });
        }
        for (const { id, attrs } of this.artifacts((a) => a.status === "pending")) {
            const ms = this.methodsOf(id);
            if (ms.length > 0 && ms.every((m) => m.attrs.status === "blocked")) needReroute.push(id);
            void attrs;
        }
        return needReroute;
    }

    /* ---------- 编译：closed method 子图 → 拓扑排序 → 正向蓝图（纯代码，无 LLM） ---------- */
    compile(finalId: string) {
        // 从 final 反向收集可达的 closed method 闭包
        const keepM = new Set<string>();
        const visit = (aid: string) => {
            for (const { id: mid, attrs } of this.methodsOf(aid)) {
                if (attrs.status !== "closed" || keepM.has(mid)) continue;
                keepM.add(mid);
                for (const i of this.inputsOf(mid)) visit(i);
            }
        };
        visit(finalId);
        // 子图拓扑排序（在全图上排，再过滤出 method）
        const order = topologicalSort(this.g).filter((n) => keepM.has(n));
        return order.map((mid, i) => ({
            step: i + 1,
            method_id: mid,
            transform: this.method(mid)!.transform,
            gate: this.method(mid)!.gate,
            inputs: this.inputsOf(mid),
            output: this.outputOf(mid),
        }));
    }

    /* ---------- 失败报告：断点在哪、试过什么、为何失败 ---------- */
    report(finalId: string) {
        const blockedArtifacts = this.artifacts((a) => a.status === "blocked").map(({ id, attrs }) => ({
            id, definition: attrs.definition, reason: attrs.blockReason ?? "unknown",
            triedMethods: this.methodsOf(id).map((m) => ({
                transform: m.attrs.transform, status: m.attrs.status,
                reason: m.attrs.blockReason, rejected: m.attrs.rejected,
            })),
        }));
        return { final: finalId, finalStatus: this.artifact(finalId)?.status, blockedArtifacts };
    }

    /* ---------- 词表摘要（喂给 X2/X4 作 allowed_vocabulary） ---------- */
    registrySummary(): string {
        return this.artifacts()
            .map(({ id, attrs }) => `- ${id} [${attrs.modality}|${attrs.status}]: ${attrs.definition}`)
            .join("\n") || "(空)";
    }
    sourcesSummary(): string {
        return this.artifacts((a) => a.status === "source")
            .map(({ id, attrs }) => `- ${id} [${attrs.modality}]: ${attrs.definition}`)
            .join("\n") || "(无)";
    }
}