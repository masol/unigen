import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import Handlebars, { type TemplateDelegate } from "handlebars";
import { buildHistoriesMap, loadHistoryForTemplate } from "./agent/history.js";
import type { PacRunState } from "./agent/types.js";
import {
    HISTORIES_VAR, HISTORY_VAR, INPUT_VAR, SETTING_VAR, TOOL_DOC_VAR,
    loadInputVar, loadStorageVars,
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
    "tools", "skills", "knowledgeBases", "maxSteps",
    "userTemplate", "userTemplatePath",
    "setDefault", "streaming", "reasoning", "persist", "history",
    "timeout", "temperature", "maxOutputTokens", "toolCallConcurrency", "strict",
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
 * **BI 变量按根段加载**：模板中的 `{{_BI_input.foo}}` / `{{_BI_history.length}}`
 * 会被扫描为 `_BI_input.foo` / `_BI_history.length` 这类带子路径的名字。
 * 渲染时 Handlebars 沿 parts 逐级查找，因此 `_BI_input` / `_BI_history` /
 * `_BI_histories` 必须以完整对象存在，扁平键写入无效。这里按首段归并，命中
 * 已知内置变量后一次性加载根对象，保证 `{{_BI_x}}` 与 `{{_BI_x.y}}` 两种写法都正确。
 *
 * - `_BI_history`  ：当前 agent 的历史（受 settings.history 约束）；
 * - `_BI_histories`：整树历史对象，`.root` 为完整会话历史，其它 key 为
 *                    子 agent 的 compiled.id；含 `/` 的 key 请用 `lookup` 访问；
 * - `_BI_setting`  ：当前 agent 的 ResolvedSettings。
 *
 * `_BI_history` / `_BI_histories` 读取的都是"调用前"的历史（不含本轮 user /
 * assistant 占位），数据源与执行路径一致：根 agent 走 PrjDB，子 agent 走
 * PacRunState 内存历史。
 *
 * @param isRoot 仅根 agent 为 true；控制 `_BI_input` 是否允许回退到 ctx.cmd.body。
 */
async function buildContext(
    c: CompiledPacAgent,
    ctx: IRunnerContext,
    state: PacRunState,
    inputs: Record<string, unknown>,
    effectiveDefaults: Record<string, JsonValue>,
    isRoot: boolean,
): Promise<Record<string, unknown>> {
    const fm = c.config as Record<string, unknown>;

    const storage = await loadStorageVars(c.vars.storage, ctx, effectiveDefaults);

    const biVars: Record<string, unknown> = {};
    const loadedRoots = new Set<string>();

    for (const name of c.vars.bi) {
        const root = name.split(".")[0];
        if (!root) continue;
        if (loadedRoots.has(root)) continue;

        if (root === TOOL_DOC_VAR) {
            loadedRoots.add(root);
            biVars[root] = c.toolDoc;
        } else if (root === INPUT_VAR) {
            loadedRoots.add(root);
            biVars[root] = await loadInputVar(ctx, inputs, isRoot);
        } else if (root === HISTORY_VAR) {
            loadedRoots.add(root);
            biVars[root] = await loadHistoryForTemplate(ctx, state, c, isRoot);
        } else if (root === HISTORIES_VAR) {
            loadedRoots.add(root);
            biVars[root] = await buildHistoriesMap(ctx, state);
        } else if (root === SETTING_VAR) {
            loadedRoots.add(root);
            biVars[root] = c.settings;
        } else {
            // 未知内置变量：扁平键写入空串，保留旧行为并告警一次。
            Logger.warn(
                `[PAC] ${c.sourcePath}: 未知内置变量 {{${name}}},渲染为空串`,
            );
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
    state: PacRunState,
    inputs: Record<string, unknown>,
    effectiveDefaults: Record<string, JsonValue>,
    isRoot: boolean,
): Promise<string> {
    const d = getDelegates(c).system;
    if (!d) return "";
    const tplCtx = await buildContext(c, ctx, state, inputs, effectiveDefaults, isRoot);
    return d(tplCtx);
}

export async function buildUserPrompt(
    c: CompiledPacAgent,
    ctx: IRunnerContext,
    state: PacRunState,
    inputs: Record<string, unknown>,
    effectiveDefaults: Record<string, JsonValue>,
    isRoot: boolean,
): Promise<string> {
    const d = getDelegates(c).user;
    if (!d) {
        Logger.warn(`[PAC] ${c.sourcePath}: userTemplate 为空,返回空用户提示词`);
        return "";
    }
    const tplCtx = await buildContext(c, ctx, state, inputs, effectiveDefaults, isRoot);
    return d(tplCtx);
}