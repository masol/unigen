import { throwUnprocessable } from "$libs/utils/err.js";

// packages/main/src/libs/loader/kb/remote.ts
export async function installKnowledgeBaseFromUrl(
    url: string,
): Promise<never> {
    throwUnprocessable(`知识库 URL 安装暂未实现: ${url}`);
}