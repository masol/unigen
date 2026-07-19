/**
 * ============================================================================
 * 【P-test · 顶层 DAG 生成测试】
 * ============================================================================
 *  1. validateNodes 纯代码单测：覆盖连边推导的全部拒绝路径;
 *  2. GDag 层构建 + 整体序列化重构;
 *  3. designDag 集成测试(真实 LLM)：类需求描述 → 合法顶层 DAG。
 */
import { describe, expect, it } from 'vitest';
import { GDag, type PNode } from '../graph/gdag.js';
import type { DagNode } from '../schema/node.js';
import { designDag, makeTopTask, validateNodes } from './dag.js';

function N(name: string, inputs: string[], outputs: string[]): DagNode {
    const io = (n: string) => ({ name: n, intent: `${n}(测试用)` });
    return { name, intent: `${name}(测试用)`, inputs: inputs.map(io), outputs: outputs.map(io) };
}

describe('validateNodes:代码级图校验', () => {

    it('合法链式图通过', () => {
        expect(validateNodes([
            N('解析原始清单', ['原始清单'], ['结构化条目']),
            N('汇总生成报告', ['结构化条目'], ['最终报告']),
        ])).toEqual([]);
    });

    it('拒绝节点重名', () => {
        const errs = validateNodes([N('处理', ['a'], ['b']), N('处理', ['b'], ['c'])]);
        expect(errs.some(e => e.includes('节点名重复'))).toBe(true);
    });

    it('拒绝同一数据被多节点产出', () => {
        const errs = validateNodes([N('甲', ['a'], ['x']), N('乙', ['a'], ['x'])]);
        expect(errs.some(e => e.includes('重复产出'))).toBe(true);
    });

    it('拒绝自环(输入即输出)', () => {
        const errs = validateNodes([N('原地打转', ['a'], ['a'])]);
        expect(errs.some(e => e.includes('自环'))).toBe(true);
    });

    it('拒绝成环', () => {
        const errs = validateNodes([
            N('甲', ['x'], ['a']),
            N('乙', ['a'], ['b']),
            N('丙', ['b'], ['x', '终品']),
        ]);
        expect(errs.some(e => e.includes('循环'))).toBe(true);
    });

    it('拒绝多个终端产物(无贡献分支)', () => {
        const errs = validateNodes([
            N('主链', ['原料'], ['成品']),
            N('旁支', ['原料'], ['废料']),
        ]);
        expect(errs.some(e => e.includes('多个终端产物'))).toBe(true);
    });
});

describe('GDag:层构建与整体序列化重构', () => {

    function P(n: DagNode): PNode {
        return { ...n, id: crypto.randomUUID(), status: 'pending', dag: null, error: null };
    }

    it('createLayer 按 io 名称自动连边', () => {
        const d = new GDag();
        const a = P(N('抽取', ['原文'], ['要点']));
        const b = P(N('成稿', ['要点'], ['终稿']));
        const layer = d.createLayer([a, b], true);
        const g = d.getGraph(layer)!;
        expect(g.order).toBe(2);
        expect(g.size).toBe(1);
        expect(g.hasEdge(a.id, b.id)).toBe(true);
        expect(d.terminalArtifacts(layer)).toEqual(['终稿']);
    });

    it('toJSON/fromJSON 完整重构(含子图挂载)', () => {
        const d = new GDag();
        const a = P(N('总加工', ['输入'], ['输出']));
        const root = d.createLayer([a], true);
        const s1 = P(N('子步一', ['输入'], ['半成品']));
        const s2 = P(N('子步二', ['半成品'], ['输出']));
        const sub = d.createLayer([s1, s2]);
        d.attachSubDag(a.id, sub);

        const revived = GDag.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));
        expect(revived.rootId).toBe(root);
        const ra = revived.findNode(a.id)!;
        expect(ra.node.status).toBe('expanded');
        expect(ra.node.dag).toBe(sub);
        expect(revived.getGraph(sub)!.order).toBe(2);
        expect(revived.scan('pending').length).toBe(2);
    });
});

describe.skipIf(!process.env.PLAN_LLM_TEST)('designDag:顶层生成(LLM)', () => {

    it('从用户描述得到合法顶层 DAG', async () => {
        const pctx = makeTestPctx(); // @TODO: 对齐项目现有的测试上下文构造器
        const desc = `我有一批客户访谈的录音转写文本(每场一个txt)。
我想得到一份市场洞察报告:归纳客户的共性痛点、按主题聚类、
每个主题给出典型原话引用,最后输出一份markdown报告。`;

        const result = await designDag(makeTopTask(desc), pctx);

        expect(result.text.length).toBeGreaterThan(0);
        expect(validateNodes(result.nodes)).toEqual([]);

        const d = new GDag();
        const pnodes = result.nodes.map(n => ({
            ...n, id: crypto.randomUUID(),
            status: 'pending' as const, dag: null, error: null,
        }));
        const layer = d.createLayer(pnodes, true);
        expect(d.terminalArtifacts(layer).length).toBe(1);
    }, 300_000);
});