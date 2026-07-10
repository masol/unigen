import { ModelTags } from "$types/shared/model.js";

// 版本标签从低到高
export const VERSION_ORDER: ModelTags[] = [
    ModelTags.Micro,
    ModelTags.Flash,
    ModelTags.Plus,
    ModelTags.Ultra,
];

/** 取模型标签中最高的版本 rank;无版本标签返回 -1 */
export function versionRank(tags: ModelTags[]): number {
    let rank = -1;
    for (let i = 0; i < VERSION_ORDER.length; i++) {
        if (tags.includes(VERSION_ORDER[i])) rank = i;
    }
    return rank;
}

/** 传入的最低版本要求对应的 rank;未传返回 -1(任意) */
export function requiredVersionRank(preferVersion?: ModelTags): number {
    if (!preferVersion) return -1;
    return VERSION_ORDER.indexOf(preferVersion); // 非版本标签返回 -1,视为无要求
}