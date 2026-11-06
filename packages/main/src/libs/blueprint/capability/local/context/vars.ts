import type { VarBuckets } from "../type.js";

/**
 * PAC 内置变量命名空间。
 *
 *  _BI_input     : 用户当前录入(文本/语音/文件路径等)
 *  _BI_history   : 当前 agent 的历史消息(ModelMessage[]，受 settings.history 约束)
 *  _BI_histories : 整树历史对象，key 为 "root" 或子 agent 的 compiled.id
 *                  - .root       : 完整会话历史(不受 settings.history 约束)
 *                  - .<agentId>  : 指定子 agent 的内存历史
 *                  含 `/` 的 key 请用 `{{lookup _BI_histories "sub/foo"}}` 访问
 *  _BI_tool      : 工具目录(编译期生成)
 *  _BI_setting   : 当前 agent 的 ResolvedSettings
 *  _T_xxx        : KV 存储变量,运行期读 PrjDB,支持 front matter.setDefault 默认值
 *
 * 注:技能不再由编译期一等公民承担;如需 skill 能力,通过 tools 声明的内建工具完成。
 */
export const BI_PREFIX = "_BI_";
export const STORAGE_PREFIX = "_T_";

export const INPUT_VAR = `${BI_PREFIX}input`;
export const HISTORY_VAR = `${BI_PREFIX}history`;
export const HISTORIES_VAR = `${BI_PREFIX}histories`;
export const TOOL_DOC_VAR = `${BI_PREFIX}tool`;
export const SETTING_VAR = `${BI_PREFIX}setting`;

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