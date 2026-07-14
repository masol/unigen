/**
 * ============================================================================
 * 目录：src/planner —— 规划核心（Planning Core / 主循环编排）
 * ============================================================================
 * 【子任务】中枢。把「一个目标」编译成「一条结构合法、依赖清晰的 HDDL 域」，串起
 * bootstrap→拆解主循环→拓扑编译→交 solver。任务书 1.4 与 §3 伪码。规划器只编译静态路径，
 * 不做动态执行(§1)：不做容错/重试/环境反馈循环(那些在外层执行器)。
 *
 * 【接口】
 * - bootstrap(task):Promise<BootstrapResult> —— 调 P4 初始化 GraphStore：登记 initStates/
 *   primitiveActions/targetAttributes。primitives 标 type:'primitive'；targets 作队列种子。
 * - decompose(target,vocab):Promise<Method[]> (经 P5) —— 单步拆解，必须返回多 method(OR)，
 *   每 method 含 subAttributes(AND)+ordering。P5 兼拦截器：isGrounded 则触底、methods 可空。
 *   ⚠ 由 planner 用 withPerspective 包一层(P5 最易错)。
 * - decomposeLoop() —— 主 while 循环，严格按 §3 伪码，不得偷改语义：
 *     queue=[...targetAttributes]
 *     while queue:
 *       t=lexicon.normalize(queue.shift())
 *       if graph.has(t)&&status(t)=='known': continue
 *       if !graph.has(t): graph.addCompound(t,{status:'pending'})
 *       methods=withPerspective(()=>decompose(t,lexicon.vocabulary()))
 *       for m in methods:                       // OR
 *         methodNode=graph.addMethod(t,m.ordering)
 *         for sub in m.subAttributes:           // AND
 *           id=lexicon.align(sub).matchedId ?? lexicon.register(sub)   // P6
 *           if !willCreateCycle(id,methodNode) && !isRecursionAbuse(pathTo(id)):
 *             graph.addEdge(id,methodNode); queue.push(id)
 *           else: 记录被拦截原因→局部重试/标记冲突(不静默吞)
 *       if graph.closeKnown(t): setKnown(t)     // 真闭包，非乐观
 * - compileToHDDL(graph):Promise<HddlDomain> —— topo() 后对每个 compound 跑 P7(套
 *   withPerspective)，输出 (:task)/(:method)，汇总为 HddlDomain(含 primitives)。
 *
 * 【易错点】
 * - 所有进图名字先 normalize(词表不漂移=验收 1)。
 * - align 低置信不自动合并：拿 'new' 走 register 并透传「待确认」标记(不阻塞主流程)。
 * - closeKnown 必须真闭包，禁止拆完即乐观 known(验收 3)。
 * - 拦截分支必须留痕可重试，不能让节点悄悄悬空(§7.1)。
 * - 输出 HddlDomain 要能直接喂 solver(SolveInput 契约)。
 * - 依赖：src/prompts(P4/P5/P7)、src/perspective、src/graph、src/lexicon、src/types、src/telemetry。
 */
/**
 * 规划核心（§3）。bootstrap → decomposeLoop → compileToHDDL。严格按伪码，语义不偷改。
 * v1：perspective 层省略为直通（真实版 P5/P7 套 withPerspective）。
 */
import { GraphStore } from './graph.js';
import { LexiconManager } from './lexicon.js';
import { llmBootstrap, llmDecompose } from './llm.js';
import type { BootstrapResult, ExtractedGoal, HddlDomain } from './types.js';

export interface PlannerOutput { hddl: HddlDomain; initFacts: string[]; graph: GraphStore; }

export async function runPlanner(goal: ExtractedGoal, _prior: unknown[]): Promise<PlannerOutput> {
    const lex = new LexiconManager();
    const graph = new GraphStore();

    // 1) bootstrap（P4）
    const boot: BootstrapResult = await llmBootstrap(goal.goal);
    for (const p of boot.primitiveActions) graph.addPrimitive(lex.register(p.eff[0] ?? p.name)); // 触底效果作 primitive 节点
    const targets = boot.targetAttributes.map((t) => lex.register(t));

    // 2) decomposeLoop（主 while，OR/AND，环 + 递归拦截，真闭包回填）
    const queue: string[] = [...targets];
    const pathTo = new Map<string, string[]>(targets.map((t) => [t, [t]]));

    while (queue.length) {
        const t = lex.normalize(queue.shift()!);
        if (graph.has(t) && graph.status(t) === 'known') continue;
        if (!graph.has(t)) graph.addCompound(t);

        const dec = await llmDecompose(t, lex.vocabulary());
        if (dec.isGrounded) { graph.setKnown(t); continue; }

        for (const m of dec.methods) {                          // OR
            const subs: string[] = [];
            for (const sub of m.subAttributes) {                  // AND
                const a = lex.align(sub);
                const id = a.decision === 'reuse' ? a.matchedId! : lex.register(sub); // 低置信=new，不自动合并
                if (a.decision === 'reuse') console.log(`  [lexicon] "${sub}" → reuse "${id}" (conf=${a.confidence.toFixed(2)})`);

                const childPath = [...(pathTo.get(t) ?? [t]), id];
                if (graph.willCreateCycle(id, t)) { console.log(`  [guard] 拦截成环 ${id}->${t}`); continue; }
                if (graph.isRecursionAbuse(childPath)) { console.log(`  [guard] 拦截病态递归 @${id}`); continue; }

                if (!graph.has(id)) graph.addCompound(id);
                graph.addDependency(id, t); subs.push(id);
                pathTo.set(id, childPath); queue.push(id);
            }
            graph.addMethod(t, subs, m.ordering);                 // 记录 OR 组
        }
        if (graph.closeKnown(t)) graph.setKnown(t);             // 真闭包，非乐观
    }

    // 二次收敛：拓扑逆序回填 known（子先于父）
    for (const id of graph.topo()) if (graph.type(id) === 'compound' && graph.closeKnown(id)) graph.setKnown(id);

    // 3) compileToHDDL（P7，此处直通）
    const order = graph.topo();
    const hddl: HddlDomain = {
        primitives: boot.primitiveActions,
        tasks: order
            .filter((id) => graph.type(id) === 'compound')
            .map((id) => ({
                task: id,
                methods: graph.methodsOf(id).map((m, i) => ({ name: `${id}_m${i}`, subtasks: m.subtasks, ordering: m.ordering })),
            })),
    };

    return { hddl, initFacts: boot.initStates, graph };
}
