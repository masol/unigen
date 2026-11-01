import { getInput } from "$libs/blueprint/glossary/input.js";
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import type { JsonValue, PacFrontMatter, VarBuckets } from "./type.js";

/**
 * PAC 模板变量约定
 * ---------------------------------------------
 * {{_BI_xxx}}  内置变量。编译期/运行期由框架生成。
 *              目前提供:
 *                _BI_tool  —— 工具目录(编译期静态)
 *                _BI_skill —— 技能清单(编译期静态)
 *                _BI_input —— 用户原始录入信息(运行期由 loadInputVar 提供)
 * {{_T_xxx}}   内部存储变量。运行期由 loadStorageVars() 提供值,
 *              可在 front matter 的 setDefault 中声明默认值。
 * {{xxx}}      其它路径,视为 Handlebars 常规表达式(project.xxx / inputs.xxx / config.xxx)。
 */

export const BI_PREFIX = "_BI_";
export const STORAGE_PREFIX = "_T_";

/** 工具目录变量名 */
export const TOOL_DOC_VAR = `${BI_PREFIX}tool`;
/** 技能清单变量名 */
export const SKILL_DOC_VAR = `${BI_PREFIX}skill`;
/** 用户原始输入变量名 */
export const INPUT_VAR = `${BI_PREFIX}input`;

export function emptyBuckets(): VarBuckets {
    return { bi: [], storage: [], unknown: [], all: [] };
}

/**
 * 按前缀把模板中出现的变量分桶。保序 + 去重。
 */
export function classifyVars(names: string[]): VarBuckets {
    const b = emptyBuckets();
    const seen = new Set<string>();
    for (const n of names) {
        if (seen.has(n)) continue;
        seen.add(n);
        b.all.push(n);
        if (n.startsWith(BI_PREFIX)) {
            b.bi.push(n);
        } else if (n.startsWith(STORAGE_PREFIX)) {
            b.storage.push(n);
        } else {
            b.unknown.push(n);
        }
    }
    return b;
}

/**
 * 从 front matter 提取 _T_ 变量默认值。
 * 返回 bare key 映射(不含 _T_ 前缀),便于与 inheritedDefaults 合并。
 */
export function resolveOwnDefaults(fm: PacFrontMatter): Record<string, JsonValue> {
    const table = fm.setDefault;
    if (!table || typeof table !== "object" || Array.isArray(table)) {
        return {};
    }
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(table)) {
        out[k] = v as JsonValue;
    }
    return out;
}

/**
 * ======================================================================
 *  _T_xxx 变量加载。
 * ======================================================================
 *
 * 查找优先级:
 *   1. 任务 KV 存储(PrjDB)—— 用户/运行时写入的真实值
 *   2. defaults —— 由 setDefault 继承 + 自身声明合并而来的默认值
 *   3. 空串
 */
export async function loadStorageVars(
    names: string[],
    ctx: IRunnerContext,
    defaults: Record<string, JsonValue>,
): Promise<Record<string, JsonValue>> {
    const out: Record<string, JsonValue> = {};
    if (names.length === 0) return out;

    const prjdb = PrjDB.ensure(ctx.prj);

    for (const n of names) {
        const bare = n.startsWith(STORAGE_PREFIX) ? n.slice(STORAGE_PREFIX.length) : n;
        const stored = prjdb.get(bare);
        if (stored !== null && stored !== undefined) {
            out[n] = stored as JsonValue;
        } else if (bare in defaults) {
            out[n] = defaults[bare];
        } else {
            Logger.debug(`[PAC] _T_${bare} 未在存储中找到,且无 setDefault,渲染为空串`);
            out[n] = "";
        }
    }

    return out;
}

/**
 * ======================================================================
 *  _BI_input 变量加载。
 * ======================================================================
 *
 * 代表"本次调用的用户录入信息"。两种情形:
 *
 * 1. **根调用**(agent.run → runWithInputs 时传 isRoot=true):
 *      - inputs 非空 → 序列化为 JSON(来自 UI 的结构化字段)
 *      - inputs 为空 → 回退到 ctx.cmd.body 或 getInput()(来自 UI 的自由文本)
 *    即允许 "body fallback"。
 *
 * 2. **子 agent 调用**(父 agent 把它当 Tool 调用,buildAgentTool.execute):
 *      - 不论 inputs 是否为空,都只序列化 inputs,**绝不借用 ctx.cmd.body**。
 *    否则就会出现子 agent 看到的其实是根用户的原始输入这种"幽灵上下文"
 *    bug —— 父 LLM 以为自己把 {} 传给了子工具,子工具却读到了根 body。
 *
 * @param allowBodyFallback 仅根调用传 true;子 agent 调用必须传 false(或默认)。
 */
export async function loadInputVar(
    ctx: IRunnerContext,
    inputs: Record<string, unknown>,
    allowBodyFallback = false,
): Promise<string> {
    if (inputs && Object.keys(inputs).length > 0) {
        return JSON.stringify(inputs, null, 2);
    }

    if (!allowBodyFallback) {
        // 子 agent 调用场景:父传了空对象或全可选字段都没传。
        // 返回字面量 "{}" 让 LLM 清楚看到自己收到了一次"无额外字段"的调用,
        // 而不是误把根上下文的 body 当成自己的输入。
        return "{}";
    }

    let input = ctx.cmd?.body;
    if (!input) {
        const got = getInput(ctx, ctx.prj.inputName ?? "script");
        input = got.length > 0 ? got.join("\n") : "";
    }
    return input;
}