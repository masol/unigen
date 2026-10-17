import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import type { JsonValue, PacFrontMatter, VarBuckets } from "./type.js";

/**
 * PAC 模板变量约定
 * ---------------------------------------------
 * {{_BI_xxx}}  内置变量。编译期/运行期由框架生成。
 *              目前提供 _BI_tool(工具目录)。
 * {{_T_xxx}}   内部存储变量。运行期由 loadStorageVars() 提供值。
 * {{_F_xxx}}   front matter 变量。编译期直接从 front matter 取值。
 * {{xxx}}      其它路径,视为 Handlebars 常规表达式(project.xxx / inputs.xxx / config.xxx)。
 */

export const BI_PREFIX = "_BI_";
export const STORAGE_PREFIX = "_T_";
export const FM_PREFIX = "_F_";

/** 工具目录变量名 */
export const TOOL_DOC_VAR = `${BI_PREFIX}tool`;

export function emptyBuckets(): VarBuckets {
    return { bi: [], storage: [], frontMatter: [], unknown: [], all: [] };
}

/**
 * 按前缀把模板中出现的变量分桶。
 * @param names 由 template.ts 的 AST 扫描得到,已去重
 */
export function classifyVars(names: string[]): VarBuckets {
    const b = emptyBuckets();
    for (const n of names) {
        if (!b.all.includes(n)) b.all.push(n);
        if (n.startsWith(BI_PREFIX)) b.bi.push(n);
        else if (n.startsWith(STORAGE_PREFIX)) b.storage.push(n);
        else if (n.startsWith(FM_PREFIX)) b.frontMatter.push(n);
        else b.unknown.push(n);
    }
    return b;
}

/**
 * 取 _F_xxx 的值。
 * 优先取 vars 表(显式声明),其次取 front matter 顶层同名键,最后退回 xxx(去掉前缀)。
 */
export function resolveFrontMatterValue(
    varName: string,
    fm: PacFrontMatter,
): JsonValue | undefined {
    const bare = varName.slice(FM_PREFIX.length);
    const table = fm.vars;
    if (table && typeof table === "object" && bare in table) {
        return (table as Record<string, JsonValue>)[bare];
    }
    if (bare in fm) return fm[bare] as JsonValue;
    return undefined;
}

/** 编译期求出全部 _F_ 变量的值(静态,不依赖 ctx) */
export function resolveFrontMatterVars(
    names: string[],
    fm: PacFrontMatter,
    sourcePath: string,
): Record<string, JsonValue> {
    const out: Record<string, JsonValue> = {};
    for (const n of names) {
        const v = resolveFrontMatterValue(n, fm);
        if (v === undefined) {
            Logger.warn(
                `[PAC] ${sourcePath}: 变量 ${n} 在 front matter 中未声明,渲染为空串。` +
                `(请在 front matter 的 vars.<name> 中声明)`,
            );
            continue;
        }
        out[n] = v;
    }
    return out;
}

/** _BI_ 变量的编译期静态值(当前只有 _BI_tool) */
export function resolveBuiltinVars(names: string[]): Record<string, JsonValue> {
    return names.filter((n) => n === TOOL_DOC_VAR).length > 0
        ? { [TOOL_DOC_VAR]: null } // null 表示"运行期再填",实际由 template 覆盖
        : {};
}

/**
 * ======================================================================
 *  _T_xxx 变量加载 —— 留空,由你来填。
 * ======================================================================
 *
 * 运行期被调用,返回 { "_T_xxx": value, ... }。
 *
 * ctx 在此可用,可以从项目 KV / 记忆库 / 内部存储中读取。
 * 当前实现为空(返回空对象),未声明的 _T_ 变量在模板中渲染为空串。
 */
export async function loadStorageVars(
    names: string[],
    ctx: IRunnerContext,
): Promise<Record<string, JsonValue>> {
    // ---------------------------------------------------------------
    // TODO: 在此实现 _T_ 变量的真实加载逻辑。
    //
    // 可用信息:
    //   names  —— 本 agent 正文中用到的 _T_ 变量名列表
    //   ctx    —— 运行上下文(含 prj / cmd / abort 信号)
    //
    // 返回值要求: { [name]: value } 形式,供模板直接取用。
    // 例:
    //   const prjdb = PrjDB.ensure(ctx.prj);
    //   const out: Record<string, JsonValue> = {};
    //   for (const n of names) out[n] = prjdb.get(n.slice(STORAGE_PREFIX.length)) ?? "";
    //   return out;
    // ---------------------------------------------------------------
    void names;
    void ctx;
    if (names.length > 0) {
        Logger.debug(`[PAC] loadStorageVars 尚未实现,跳过 ${names.length} 个变量:`, names);
    }
    return {};
}