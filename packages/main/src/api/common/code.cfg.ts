// packages/main/src/api/common/code.cfg.ts
//
// 本机工具 / 代码运行时的静态定义。
// 新增工具时优先只改这里；主进程与 renderer 的类型由 runtimeIdSchema 收敛。

import { z } from "zod";

export const runtimeIdSchema = z.enum(["python", "nodejs", "aria2"]);
export type RuntimeId = z.infer<typeof runtimeIdSchema>;

export const RUNTIME_IDS = [
    "python",
    "nodejs",
    "aria2",
] as const satisfies readonly RuntimeId[];

/**
 * 由 codeRuntimeManager 托管的运行时。
 *
 * aria2 是工具类运行时，不是“代码运行时”，但仍复用同一套安装 / 验证 /
 * 工具注册流程，因此也纳入该清单。
 */
export const CODE_RUNTIME_IDS = [
    "python",
    "nodejs",
    "aria2",
] as const satisfies readonly RuntimeId[];
export type CodeRuntimeId = (typeof CODE_RUNTIME_IDS)[number];

const CODE_RUNTIME_ID_SET = new Set<RuntimeId>(CODE_RUNTIME_IDS);

export function isCodeRuntimeId(id: RuntimeId): id is CodeRuntimeId {
    return CODE_RUNTIME_ID_SET.has(id);
}

export type RuntimeKind = "language" | "sandbox" | "utility";

export interface RuntimeInfo {
    id: RuntimeId;
    name: string;
    kind: RuntimeKind;
    tagline: string;
    icon?: string;
    approximateDownloadMB?: number;
    /** 就绪后点击"测试一下"运行的代码片段 */
    testSnippet: string;
    /**
     * 主进程是否已经接入该工具。
     * false 表示仅完成界面预留，Switch 会禁用，避免误导用户。
     */
    available?: boolean;
}

export const RUNTIME_INFO: Record<RuntimeId, RuntimeInfo> = {
    python: {
        id: "python",
        name: "Python",
        kind: "language",
        // 描述保持笼统：语言本身做的事太多、不同用户场景差异巨大，
        // 唯一稳定让用户理解的价值就是「让 AI 可以使用这门语言、并调用其生态」。
        tagline: "让 AI 使用 Python 工作，并利用 Python 生态。",
        icon: "IconBrandPython",
        approximateDownloadMB: 120,
        testSnippet: "print(1 + 1)",
    },
    nodejs: {
        id: "nodejs",
        name: "Node.js",
        kind: "language",
        tagline: "让 AI 使用 Node.js 工作，并利用 npm 生态。",
        icon: "IconBrandNodejs",
        approximateDownloadMB: 60,
        testSnippet: "console.log(1 + 1)",
    },
    aria2: {
        id: "aria2",
        name: "aria2",
        kind: "utility",
        tagline: "多线程下载工具，为模型与依赖提供更稳定、快速的下载。",
        icon: "IconDownload",
        approximateDownloadMB: 5,
        testSnippet: "aria2c --version",
    },
};