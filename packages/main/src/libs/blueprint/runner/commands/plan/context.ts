/**
 * ============================================================================
 * 【P-01 · 规划上下文 PlanContext】
 * ============================================================================
 */
import { PrjDB } from '$libs/project/controllers/drizzle/index.js';
import { globalToolDB } from '$libs/tooldb/index.js';
import { ProjectDbKeys } from '$libs/utils/db/dbkeys.js';
import { throwUnprcessable } from '$libs/utils/err.js';
import type { IRunnerContext } from '$types/blueprint/context.js';
import type { GDagJSON } from '$types/index.js';
import Logger from 'electron-log/main.js';
import validator from 'validator';
import { StepNames, TOOL_SEARCH_LIMIT } from './config.js';
import { GDag } from './graph/gdag.js';

export interface ResolvedTool {
    id: string;
    name: string;
    description: string;
    source?: string;
    assumed: boolean;
}

export interface TraceEntry {
    pass: string;
    note: string;
    payload?: unknown;
    at: string;
}

interface PlanState {
    gdag: GDagJSON | null;
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

    persist(): void {
        const state: PlanState = {
            gdag: this.#gdag ? this.#gdag.toJSON() : null
        };
        this.prjdb.set(this.getJsonName(StepNames.state), state);
    }

    restore(): boolean {
        const state = this.prjdb.get<PlanState>(this.getJsonName(StepNames.state));
        if (!state) return false;
        this.#gdag = state.gdag ? GDag.fromJSON(state.gdag) : null;
        return true;
    }

    getJsonName(nodeName: string): string {
        return `.${this.rootCapId}_${nodeName}`;
    }
    getResName(nodeName: string): string {
        return `_${this.rootCapId}_${nodeName}`;
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
        const errMsg = this.#invalidations[nodeName] || [];
        errMsg.push(reason);
        this.#invalidations[nodeName] = errMsg;
    }

    reportFatalConflict(nodeName: string, reason: string): never {
        this.addConflict(nodeName, reason);
        throw new ConflictSignal();
    }

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

    const pctx = new PlanContext(ctx, prjdb, rootCapid);
    pctx.restore();
    return pctx;
}