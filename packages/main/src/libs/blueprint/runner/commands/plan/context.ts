/**
 * ============================================================================
 * 【P-01 · 规划上下文 PlanContext】(附 BACKGROUND.md)
 * ============================================================================
 * 贯穿全部 pass 的唯一上下文。规划复杂度已不允许状态靠变量在函数间传递:
 *  - capabilities + metag + KV 是唯一真相源,本对象是它们的唯一门面;
 *  - 状态落盘规范:除 rootCapId 外的全部规划状态(gdag/蓝图/…)合成一个 blob,
 *    persist() 经 getJsonName(StepNames.state) 整体落盘一个键;
 *    restore() 在拿到 capId 后一次性恢复。步骤代码禁止零散 set,
 *    每经过一个有意义的点调用一次 persist() 即可;
 *  - 工具检索由代码完成并缓存:进入任何 LLM 调用之前解析好、注入提示词,
 *    LLM 不再自行查询;无命中时假定业界已知工具(assumed=true),不断链;
 *  - trace() 追加式留痕:批判意见/被拒原因/回炉记录全部留存,供审计与换路。
 */
import { PrjDB } from '$libs/project/controllers/drizzle/index.js';
import { globalToolDB } from '$libs/tooldb/index.js'; // @TODO: 对齐实际导入路径
import { ProjectDbKeys } from '$libs/utils/db/dbkeys.js';
import { throwUnprcessable } from '$libs/utils/err.js';
import type { IRunnerContext } from '$types/blueprint/context.js';
import Logger from 'electron-log/main.js';
import validator from 'validator';
import { StepNames, TOOL_SEARCH_LIMIT } from './config.js';
import { GDag, type GDagJSON } from './graph/gdag.js';

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

/** 整体落盘的状态 blob:PlanContext 中除 rootCapId 外的一切。新 pass 的状态在此加字段 */
interface PlanState {
    gdag: GDagJSON | null;
    /** 顶层蓝图(text + nodes):后续细化的上下文锚点 */
    // blueprint: DagDesignResult | null;
}

export class ConflictSignal extends Error {
    constructor() {
        super('Compiler loop conflict signal');
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ConflictSignal);
        }
    }
}

export class PlanContext {
    private toolCache = new Map<string, ResolvedTool[]>();
    // nodename --> errorInfo;
    #invalidations: Record<string, string[]> = {};

    #gdag: GDag | null = null;

    constructor(
        readonly ctx: IRunnerContext,
        readonly prjdb: PrjDB,
        readonly rootCapId: string,
    ) { }

    get gdag(): GDag {
        if (!this.#gdag) this.#gdag = new GDag();
        return this.#gdag;
    }

    // ── 整体持久化:一个键,一个 blob ────────────────────────────────────────

    /** 有意义的点调用一次:全部状态(除 rootCapId)整体落盘 */
    persist(): void {
        const state: PlanState = {
            gdag: this.#gdag ? this.#gdag.toJSON() : null
        };
        Logger.debug("state=", JSON.stringify(state, null, 2))
        this.prjdb.set(this.getJsonName(StepNames.state), state);
    }

    /** 拿到 capId 后恢复全部状态。无存档返回 false(全新规划) */
    restore(): boolean {
        const state = this.prjdb.get<PlanState>(this.getJsonName(StepNames.state));
        if (!state) return false;
        this.#gdag = state.gdag ? GDag.fromJSON(state.gdag) : null;
        // this.blueprint = state.blueprint ?? null;
        return true;
    }

    getJsonName(nodeName: string): string {
        return `.${this.rootCapId}_${nodeName}`
    }
    getResName(nodeName: string): string {
        return `_${this.rootCapId}_${nodeName}`
    }

    getNodeError(node: string): string | null {
        let err = null;
        if (this.#invalidations[node]) {
            err = this.#invalidations[node].join('\n');
            delete this.#invalidations[node];
        }
        return err;
    }

    addConflict(nodeName: string, reason: string): void {
        const errMsg = this.#invalidations[nodeName] || []
        errMsg.push(reason);
        this.#invalidations[nodeName] = errMsg;
    }

    reportFatalConflict(nodeName: string, reason: string): never {
        this.addConflict(nodeName, reason);
        throw new ConflictSignal();
    }

    // /** KV 键规范:全模块唯一的拼键处 */
    // static kvKey(capId: string, suffix: string): string {
    //     return `_#${capId}_${suffix}`;
    // }

    // kvSet<T>(capId: string, suffix: string, value: T): void {
    //     this.prjdb.set(PlanContext.kvKey(capId, suffix), value);
    // }

    // kvGet<T>(capId: string, suffix: string): T | null {
    //     return this.prjdb.get<T>(PlanContext.kvKey(capId, suffix)) ?? null;
    // }

    // /** 追加式留痕:只增不删 */
    // trace(capId: string, pass: string, note: string, payload?: unknown): void {
    //     const prev = this.kvGet<TraceEntry[]>(capId, KV_TRACE) ?? [];
    //     prev.push({ pass, note, payload, at: new Date().toISOString() });
    //     this.kvSet(capId, KV_TRACE, prev);
    // }

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


export function createPlanContext(ctx: IRunnerContext): PlanContext {
    const args = ctx.cmd.args ?? {};
    let rootCapid: string;
    const prjdb: PrjDB = PrjDB.ensure(ctx.prj);
    if (args.cap === "new") {
        rootCapid = crypto.randomUUID();
    } else if (validator.isUUID(args.cap)) {
        rootCapid = args.cap;
    } else {
        if (args.cap) {
            const msg = `[plan] --cap=new|UUID,但是输入了${args.cap}`;
            Logger.error(msg);
            throwUnprcessable(msg);
        }
        const entry = prjdb.get<string>(ProjectDbKeys.entry_capa);
        if (!entry) {
            const msg = `[plan] 当前系统未指定入口Capa,请使用--cap=new|UUID来指定规划入口。`;
            Logger.error(msg);
            throwUnprcessable(msg);
        }
        rootCapid = entry;
    }

    const pctx = new PlanContext(ctx, prjdb, rootCapid)
    // capId 已确定:立即恢复全部历史状态(全新规划时无存档,restore 返回 false)
    pctx.restore();
    return pctx;
}