import { throwUnprocessable } from "$libs/utils/err.js";

// packages/main/src/libs/loader/skill/remote.ts
export async function installSkillFromUrl(url: string): Promise<never> {
    throwUnprocessable(`Skill URL 安装暂未实现: ${url}`);
}