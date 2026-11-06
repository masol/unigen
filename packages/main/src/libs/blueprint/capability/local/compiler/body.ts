/**
 * PAC 正文后处理钩子（预留，不实现）。
 *
 * 未来可引入 LLM 介入，例如：
 * - 检查正文是否可转化为纯代码；
 * - 检查系统提示词是否存在结构缺失；
 * - 根据工具/技能/输出契约自动补全说明。
 *
 */
export function refinePacBody(_body: string, _sourcePath: string): never {
    // TODO: LLM-assisted body refinement.
    throw new Error("refinePacBody 尚未实现");
}