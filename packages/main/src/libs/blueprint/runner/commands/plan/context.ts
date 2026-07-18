/**
 * ============================================================================
 * 【P-01 · 规划上下文 PlanContext】(附 BACKGROUND.md)
 * ============================================================================
 * 贯穿全部 pass 的唯一上下文。规划复杂度已不允许状态靠变量在函数间传递:
 *  - capabilities + metag + KV 是唯一真相源,本对象是它们的唯一门面;
 *  - KV 落盘规范:_#${capId}_${suffix},所有 pass 中间产物必须经此落盘;
 *  - 工具检索由代码完成并缓存:进入任何 LLM 调用之前解析好、注入提示词,
 *    LLM 不再自行查询;无命中时假定业界已知工具(assumed=true),不断链;
 *  - trace() 追加式留痕:批判意见/被拒原因/回炉记录全部留存,供审计与换路。
 */
import { PrjDB } from '$libs/project/controllers/drizzle/index.js';
import { globalToolDB } from '$libs/tooldb/index.js'; // @TODO: 对齐实际导入路径
import type { IRunnerContext } from '$types/blueprint/context.js';
import { KV_TRACE, TOOL_SEARCH_LIMIT } from './config.js';

export interface ResolvedTool {
    id: string;
    name: string;
    description: string;
    source?: string;
    /** searchTools 无命中时由代码假定的业界工具:链不断,交付时汇总为(需确认)清单 */
    assumed: boolean;
}

export interface TraceEntry {
    pass: string;
    note: string;
    payload?: unknown;
    at: string;
}

export class PlanContext {
    private toolCache = new Map<string, ResolvedTool[]>();

    constructor(
        readonly ctx: IRunnerContext,
        readonly prjdb: PrjDB,
        readonly rootCapId: string,
    ) { }

    /** KV 键规范:全模块唯一的拼键处 */
    static kvKey(capId: string, suffix: string): string {
        return `_#${capId}_${suffix}`;
    }

    kvSet<T>(capId: string, suffix: string, value: T): void {
        this.prjdb.set(PlanContext.kvKey(capId, suffix), value); // @TODO: 确认 PrjDB.set 签名
    }

    kvGet<T>(capId: string, suffix: string): T | null {
        return this.prjdb.get<T>(PlanContext.kvKey(capId, suffix)) ?? null;
    }

    /** 追加式留痕:只增不删 */
    trace(capId: string, pass: string, note: string, payload?: unknown): void {
        const prev = this.kvGet<TraceEntry[]>(capId, KV_TRACE) ?? [];
        prev.push({ pass, note, payload, at: new Date().toISOString() });
        this.kvSet(capId, KV_TRACE, prev);
    }

    /** 代码侧工具解析(带缓存)。空结果合法:由链路层提名 + assumeTool 兜底 */
    async resolveTools(query: string): Promise<ResolvedTool[]> {
        const cached = this.toolCache.get(query);
        if (cached) return cached;
        const hits = await globalToolDB.searchTools(query, { limit: TOOL_SEARCH_LIMIT });
        const tools = hits.map((h) => ({
            id: h.id, name: h.name, description: h.description, source: h.source,
            assumed: false,
        }));
        this.toolCache.set(query, tools);
        return tools;
    }

    /** 无命中兜底:假定一个已知工具继续,绝不因缺工具断链 */
    assumeTool(name: string, description: string): ResolvedTool {
        return { id: `assumed::${name}`, name, description, assumed: true };
    }

    notify(title: string, body: string): void {
        this.ctx.notify(title, body);
    }
}