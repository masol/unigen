import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import Handlebars, { type TemplateDelegate } from "handlebars";
import {
    HISTORY_VAR, INPUT_VAR, SKILL_DOC_VAR, TOOL_DOC_VAR,
    loadHistoryVar, loadInputVar, loadStorageVars,
} from "./context/index.js";
import type { CompiledPacAgent, JsonValue } from "./type.js";

/* ------------------------------------------------------------------ *
 * 变量扫描 —— 直接复用 Handlebars.Visitor。
 * ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PathNode = any;

class VariableCollector extends Handlebars.Visitor {
    readonly names = new Set<string>();

    PathExpression(path: PathNode): void {
        if (path?.data === true) return;
        if ((path?.depth ?? 0) !== 0) return;
        if (typeof path?.original !== "string") return;
        this.names.add(path.original);
    }
}

export function scanTemplateVars(template: string): string[] {
    if (!template || template.trim().length === 0) return [];
    const ast = Handlebars.parse(template);
    const collector = new VariableCollector();
    collector.accept(ast);
    return [...collector.names];
}

/* ------------------------------------------------------------------ *
 * 编译 + 渲染
 * ------------------------------------------------------------------ */

const COMPILE_OPTS: CompileOptions = { noEscape: true };

const cache = new WeakMap<CompiledPacAgent, {
    system?: TemplateDelegate;
    user?: TemplateDelegate;
}>();

function getDelegates(c: CompiledPacAgent) {
    let e = cache.get(c);
    if (!e) {
        e = {};
        if (c.systemTemplate) e.system = Handlebars.compile(c.systemTemplate, COMPILE_OPTS);
        if (c.userTemplate) e.user = Handlebars.compile(c.userTemplate, COMPILE_OPTS);
        cache.set(c, e);
    }
    return e;
}

/** FM 中已被框架消费的字段,渲染时不再暴露到模板上下文根。 */
const RESERVED = new Set([
    "name", "description", "inputs", "outputs",
    "tools", "maxSteps", "skills",
    "userTemplate", "userTemplatePath",
    "setDefault", "streaming", "thinking", "history",
]);

function stripReserved(fm: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fm)) {
        if (!RESERVED.has(k)) out[k] = v;
    }
    return out;
}

const warnedAgents = new WeakSet<CompiledPacAgent>();

function warnMissingVarsOnce(c: CompiledPacAgent, finalCtx: Record<string, unknown>): void {
    if (warnedAgents.has(c)) return;
    warnedAgents.add(c);
    for (const v of c.vars.unknown) {
        const root = v.split(".")[0];
        if (!root || !(root in finalCtx)) {
            Logger.warn(
                `[PAC] ${c.sourcePath}: 模板引用了未定义变量 {{${v}}} ` +
                `(根段 "${root}" 不在渲染上下文中),将渲染为空字符串。`,
            );
        }
    }
}

/**
 * 构建模板上下文(系统/用户模板共用)。
 *
 * {{_BI_history}} 读取的是"调用前"的历史(不含本轮 user 消息,因为渲染发生在
 * 把本轮 user 并入 messages 之前,见 agent.ts)。
 *
 * @param allowBodyFallback 仅根调用传 true;子 agent 调用必须 false。
 */
async function buildContext(
    c: CompiledPacAgent,
    ctx: IRunnerContext,
    inputs: Record<string, unknown>,
    effectiveDefaults: Record<string, JsonValue>,
    allowBodyFallback: boolean,
): Promise<Record<string, unknown>> {
    const fm = c.config as Record<string, unknown>;

    const storage = await loadStorageVars(c.vars.storage, ctx, effectiveDefaults);

    const biVars: Record<string, JsonValue | string> = {};
    for (const name of c.vars.bi) {
        if (name === TOOL_DOC_VAR) {
            biVars[name] = c.toolDoc;
        } else if (name === SKILL_DOC_VAR) {
            biVars[name] = c.skillDoc;
        } else if (name === INPUT_VAR) {
            biVars[name] = await loadInputVar(ctx, inputs, allowBodyFallback);
        } else if (name === HISTORY_VAR) {
            biVars[name] = await loadHistoryVar(ctx, c.id, c.settings.history);
        } else {
            Logger.warn(`[PAC] ${c.sourcePath}: 未知内置变量 ${name},渲染为空串`);
            biVars[name] = "";
        }
    }

    const builtins: Record<string, unknown> = {
        project: ctx.prj,
        command: ctx.cmd,
        inputs,
        outputs: c.config.outputs ?? null,
        ...stripReserved(fm),
    };

    const final: Record<string, unknown> = {
        ...builtins,
        ...biVars,
        ...storage,
    };

    warnMissingVarsOnce(c, final);
    return final;
}

export async function renderSystemPrompt(
    c: CompiledPacAgent,
    ctx: IRunnerContext,
    inputs: Record<string, unknown>,
    effectiveDefaults: Record<string, JsonValue>,
    allowBodyFallback: boolean,
): Promise<string> {
    const d = getDelegates(c).system;
    if (!d) return "";
    const tplCtx = await buildContext(c, ctx, inputs, effectiveDefaults, allowBodyFallback);
    return d(tplCtx);
}

export async function buildUserPrompt(
    c: CompiledPacAgent,
    ctx: IRunnerContext,
    inputs: Record<string, unknown>,
    effectiveDefaults: Record<string, JsonValue>,
    allowBodyFallback: boolean,
): Promise<string> {
    const d = getDelegates(c).user;
    if (!d) {
        Logger.warn(`[PAC] ${c.sourcePath}: userTemplate 为空,返回空用户提示词`);
        return "";
    }
    const tplCtx = await buildContext(c, ctx, inputs, effectiveDefaults, allowBodyFallback);
    return d(tplCtx);
}