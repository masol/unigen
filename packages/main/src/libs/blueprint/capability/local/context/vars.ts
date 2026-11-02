import type { VarBuckets } from "../type.js";

/**
 * PAC 内置变量命名空间。
 *
 *  _BI_input   : 用户当前录入(文本/语音/文件路径等的 JSON 序列化)
 *  _BI_history : 历史消息的 JSON 序列化(字符串,给模板展开用)
 *  _BI_tool    : 工具目录(编译期生成)
 *  _BI_skill   : 技能清单(编译期生成)
 *  _T_xxx      : KV 存储变量,运行期读 PrjDB,支持 front matter.setDefault 默认值
 */
export const BI_PREFIX = "_BI_";
export const STORAGE_PREFIX = "_T_";

export const INPUT_VAR = `${BI_PREFIX}input`;
export const HISTORY_VAR = `${BI_PREFIX}history`;
export const TOOL_DOC_VAR = `${BI_PREFIX}tool`;
export const SKILL_DOC_VAR = `${BI_PREFIX}skill`;

export function emptyBuckets(): VarBuckets {
    return { bi: [], storage: [], unknown: [], all: [] };
}

/** 按前缀把模板中出现的变量分桶。保序 + 去重。 */
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