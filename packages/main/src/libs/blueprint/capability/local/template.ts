import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import Handlebars, { type TemplateDelegate } from "handlebars";
import type { CompiledPacAgent, JsonValue, PacFrontMatter } from "./type.js";
import {
    TOOL_DOC_VAR,
    loadStorageVars,
    resolveFrontMatterValue,
} from "./vars.js";

/* ------------------------------------------------------------------ *
 * AST 扫描:提取模板中真正被引用的变量名
 * ------------------------------------------------------------------ */

const LITERAL_TYPES = new Set([
    "StringLiteral", "NumberLiteral", "BooleanLiteral",
    "UndefinedLiteral", "NullLiteral", "Hash", "CommentStatement",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

function fromPath(p: AnyNode, out: Set<string>): void {
    if (!p || typeof p !== "object") return;

    if (Array.isArray(p)) {
        p.forEach((x) => fromPath(x, out));
        return;
    }
    if (typeof p.type !== "string") return;

    switch (p.type) {
        case "PathExpression":
            if ((p.depth ?? 0) === 0 && typeof p.original === "string") {
                out.add(p.original);
            }
            break;
        case "SubExpression":
            fromProgram(p.program, out);
            (p.params ?? []).forEach((x: AnyNode) => fromPath(x, out));
            break;
        default:
            if (!LITERAL_TYPES.has(p.type)) {
                Logger.debug(`[PAC] 模板扫描:忽略节点类型 ${p.type}`);
            }
            break;
    }
}

function fromProgram(program: AnyNode, out: Set<string>): void {
    if (!program || !Array.isArray(program.body)) return;
    for (const node of program.body) {
        if (!node || typeof node.type !== "string") continue;
        switch (node.type) {
            case "MustacheStatement":
            case "BlockStatement":
                fromPath(node.path, out);
                fromProgram(node.program, out);
                fromProgram(node.inverse, out);
                break;
            case "PartialStatement":
            case "Decorator":
                fromPath(node.path, out);
                fromProgram(node.program, out);
                break;
            case "SubExpression":
                fromProgram(node.program, out);
                (node.params ?? []).forEach((x: AnyNode) => fromPath(x, out));
                break;
            case "PathExpression":
                fromPath(node, out);
                break;
            default:
                break;
        }
    }
}

export function scanTemplateVars(template: string): string[] {
    const out = new Set<string>();
    if (!template || template.trim().length === 0) return [];
    try {
        fromProgram(Handlebars.parse(template), out);
    } catch (e) {
        Logger.warn("[PAC] 模板解析失败,降级为正则扫描:", e);
        const re = /\{\{\{?\s*([#^]?)([A-Za-z_$][\w$]*(?:\.[\w$]+)*)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(template))) {
            if (m[1]) continue;
            const p = m[2];
            const root = p.split(".")[0];
            if (root) out.add(root);
        }
    }
    return [...out];
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

const RESERVED = new Set([
    "name", "description", "inputs", "outputs",
    "tools", "maxSteps", "userTemplate", "vars",
]);

function stripReserved(fm: PacFrontMatter): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fm)) {
        if (!RESERVED.has(k)) out[k] = v;
    }
    return out;
}

/**
 * 构建模板上下文。
 * project 直接透传 ctx.prj,具体字段由项目上下文接口决定,模板按需访问({{project.xxx}})。
 */
async function buildContext(
    c: CompiledPacAgent,
    ctx: IRunnerContext,
    inputs: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const fm = c.config;

    // 1. _T_ 变量:运行期由实现方填充
    const storage = await loadStorageVars(c.vars.storage, ctx);

    // 2. _F_ 变量:按原变量名注入
    const fmVars: Record<string, JsonValue> = {};
    for (const name of c.vars.frontMatter) {
        const v = resolveFrontMatterValue(name, fm);
        fmVars[name] = v === undefined ? "" : v;
    }

    // 3. _BI_ 变量
    const biVars: Record<string, JsonValue> = {};
    for (const name of c.vars.bi) {
        if (name === TOOL_DOC_VAR) biVars[name] = c.toolDoc;
    }

    // 4. 内置块
    const builtins: Record<string, unknown> = {
        project: ctx.prj,          // 透传,具体字段由模板按需访问
        command: ctx.cmd,
        inputs,
        outputs: fm.outputs ?? null,
        ...stripReserved(fm),
    };

    return {
        ...builtins,
        ...biVars,
        ...fmVars,
        ...storage, // 实现方返回的同名键优先
    };
}

export async function renderSystemPrompt(
    c: CompiledPacAgent,
    ctx: IRunnerContext,
    inputs: Record<string, unknown>,
): Promise<string> {
    const d = getDelegates(c).system;
    if (!d) return "";
    const tplCtx = await buildContext(c, ctx, inputs);
    return d(tplCtx);
}

export async function buildUserPrompt(
    c: CompiledPacAgent,
    ctx: IRunnerContext,
    inputs: Record<string, unknown>,
): Promise<string> {
    const d = getDelegates(c).user;
    if (d) {
        const tplCtx = await buildContext(c, ctx, inputs);
        return d(tplCtx);
    }
    const body = ctx.cmd?.body;
    if (typeof body === "string" && body.length > 0) return body;
    if (inputs && Object.keys(inputs).length > 0) {
        return JSON.stringify(inputs, null, 2);
    }
    return "";
}