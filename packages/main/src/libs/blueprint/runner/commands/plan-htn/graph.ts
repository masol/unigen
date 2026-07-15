/**
 * ============================================================================
 * 目录：src/graph —— AND-OR 图存储与受控递归（GraphStore）
 * ============================================================================
 * 【子任务】落实 §4「AND-OR 图与受控递归」——区别于普通依赖图的核心、早期最易做错处。
 * graphology + graphology-dag 承载拓扑与依赖，结构健全性交代码，语义留 LLM。任务书 1.2。
 *
 * 【AND-OR 建模(§4.1)】
 * - OR：一个 compound 挂多个候选 method，满足任一即可 → addMethod 可多次。
 * - AND：一个 method 内 subtask 全满足+守 ordering 才成立 → addMethod 记 subtaskIds+ordering。
 * - ⚠ 禁止 compound 退化成「只一套固定分解」(丢掉方法选择)。验收要求≥1 compound 带≥2 method。
 *
 * 【接口】
 * - 节点属性 {status:'known'|'pending', type:'primitive'|'compound'|'unknown'}
 * - addCompound/addPrimitive(id,attrs); addMethod(compoundId,ordering):methodId;
 *   addEdge(childId,methodId)  // method→子任务 的 AND 依赖
 * - willCreateCycle(src,dst):boolean —— 加边前 graphology-dag 预判再加。
 *   ⚠ 硬规则：禁止 add-then-detect-then-rollback 回滚式写法。
 * - isRecursionAbuse(path):boolean —— 受控递归守门(§4.2)。递归 method 合法且常见
 *   (「运输所有包裹=运一个+运剩下」)，不能见环就拦。判据=深度上限+重复模式检测
 *   (同一分解模式在同一路径重复>N 次才判异常)。区分合法递归/死循环是最关键最易错点。
 * - topo():string[] —— 拓扑序供编译。
 * - closeKnown(node):boolean —— 真闭包回填：仅当某 method 全部子任务触底到 primitive/known
 *   才标 known。⚠ 禁止「拆完即乐观标 known」。是「路径真可执行」而非「看起来拆完」的闸门。
 *
 * 【两层环治理分工(§6.1/§7.1)】
 * - 目标依赖层：无环(willCreateCycle 编译期健全性)。
 * - method 分解层：允许受控递归(isRecursionAbuse)。
 * - v2 Prolog tabling 管求解期终止；本目录管编译期拦截，互补。
 *
 * 【实现要求】
 * - 深度上限 N、重复模式窗口做可配置常量。
 * - 被拦截时不静默丢弃：返回/上抛可读原因，供主循环记录并触发局部重试/标记冲突。
 * - 依赖：graphology、graphology-dag、src/types、src/telemetry(可选)。
 */
/**
 * GraphStore：AND-OR 图 + 受控递归（§4）。v1 自带最小图与 DFS 环检测。
 * 真实版：graphology + graphology-dag（willCreateCycle 加边前预判，禁回滚写法）。
 */
import type { NodeStatus, NodeType } from './types.js';

interface Node { id: string; type: NodeType; status: NodeStatus; }
interface MethodNode { id: string; parent: string; subtasks: string[]; ordering: 'sequential' | 'parallel'; }

export class GraphStore {
    private nodes = new Map<string, Node>();
    private methods = new Map<string, MethodNode[]>(); // compound -> 多 method(OR)
    private edges = new Map<string, Set<string>>();     // child -> methodNode (AND 依赖)

    private static RECURSION_DEPTH = 4;   // 深度上限（受控递归）
    private static REPEAT_LIMIT = 2;      // 同一模式在同路径重复上限

    has(id: string) { return this.nodes.has(id); }
    status(id: string) { return this.nodes.get(id)?.status; }
    type(id: string) { return this.nodes.get(id)?.type; }

    addNode(id: string, type: NodeType, status: NodeStatus = 'pending') {
        if (!this.nodes.has(id)) this.nodes.set(id, { id, type, status });
    }
    addCompound(id: string) { this.addNode(id, 'compound'); }
    addPrimitive(id: string) { this.addNode(id, 'primitive', 'known'); }
    setKnown(id: string) { const n = this.nodes.get(id); if (n) n.status = 'known'; }

    // 一个 compound 挂一条 method（可多次调用 = OR）
    addMethod(compound: string, subtasks: string[], ordering: 'sequential' | 'parallel'): string {
        const mid = `${compound}::m${(this.methods.get(compound)?.length ?? 0)}`;
        const arr = this.methods.get(compound) ?? []; arr.push({ id: mid, parent: compound, subtasks, ordering });
        this.methods.set(compound, arr); return mid;
    }
    methodsOf(compound: string): MethodNode[] { return this.methods.get(compound) ?? []; }

    // 加边前预判环（child 依赖成立才能满足 method；child->compound 形成依赖）
    willCreateCycle(child: string, compound: string): boolean {
        // 若 compound 已（间接）依赖 child，则 child->compound 成环
        return this.dependsOn(compound, child);
    }
    addDependency(child: string, compound: string) {
        (this.edges.get(child) ?? this.edges.set(child, new Set()).get(child)!).add(compound);
    }
    private dependsOn(from: string, target: string): boolean {
        // from 的所有 method 子任务是否可达 target
        const seen = new Set<string>(); const stack = [from];
        while (stack.length) {
            const cur = stack.pop()!; if (cur === target) return true; if (seen.has(cur)) continue; seen.add(cur);
            for (const m of this.methodsOf(cur)) stack.push(...m.subtasks);
        }
        return false;
    }

    // 受控递归守门：深度上限 + 重复模式检测。区分「合法递归」与「死循环」，不见环就拦。
    isRecursionAbuse(path: string[]): boolean {
        if (path.length > GraphStore.RECURSION_DEPTH * 3) return true;
        const counts = new Map<string, number>();
        for (const p of path) { const c = (counts.get(p) ?? 0) + 1; counts.set(p, c); if (c > GraphStore.REPEAT_LIMIT) return true; }
        return false;
    }

    // 真闭包回填：仅当存在某 method，其全部子任务都 known/primitive，才把该 compound 标 known。
    closeKnown(compound: string): boolean {
        for (const m of this.methodsOf(compound)) {
            if (m.subtasks.every((s) => this.status(s) === 'known' || this.type(s) === 'primitive')) return true;
        }
        return false;
    }

    // 拓扑序（子任务先于 compound）。v1 简易 Kahn。
    topo(): string[] {
        const indeg = new Map<string, number>(); const adj = new Map<string, string[]>();
        for (const id of this.nodes.keys()) { indeg.set(id, 0); adj.set(id, []); }
        for (const [compound, ms] of this.methods) for (const m of ms) for (const s of m.subtasks) {
            if (!this.nodes.has(s)) continue;
            adj.get(s)!.push(compound); indeg.set(compound, (indeg.get(compound) ?? 0) + 1);
        }
        const q = [...indeg].filter(([, d]) => d === 0).map(([k]) => k); const out: string[] = [];
        while (q.length) { const n = q.shift()!; out.push(n); for (const nx of adj.get(n) ?? []) { const d = indeg.get(nx)! - 1; indeg.set(nx, d); if (d === 0) q.push(nx); } }
        return out;
    }

    dump() {
        return [...this.nodes.values()].map((n) => ({
            id: n.id, type: n.type, status: n.status, methods: this.methodsOf(n.id).map((m) => m.subtasks),
        }));
    }
}