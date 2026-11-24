// packages/main/src/api/common/code.cfg.ts
//
// 本机工具 / 代码运行时的静态定义。
// 新增工具时优先只改这里；主进程与 renderer 的类型由 runtimeIdSchema 收敛。

import { z } from "zod";

export const runtimeIdSchema = z.enum(["python", "nodejs", "aria2", "ffmpeg"]);
export type RuntimeId = z.infer<typeof runtimeIdSchema>;

export const RUNTIME_IDS = [
    "python",
    "nodejs",
    "aria2",
    "ffmpeg",
] as const satisfies readonly RuntimeId[];

/**
 * 由 codeRuntimeManager 托管的运行时。
 *
 * aria2 / ffmpeg 是工具类运行时，不是“代码运行时”，但仍复用同一套安装 /
 * 验证 / 工具注册流程，因此也纳入该清单。
 */
export const CODE_RUNTIME_IDS = [
    "python",
    "nodejs",
    "aria2",
    "ffmpeg",
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
    /**
     * 卡片标题行的小标签（例如 aria2 的「下载加速」、ffmpeg 的「音视频」）。
     *
     * 为什么不直接由 `kind` 映射文案：`kind` 是粗粒度分类
     * （language / sandbox / utility），同一分类下的运行时语义差异很大 ——
     * aria2 是下载工具、ffmpeg 是音视频处理器，都归为 utility 却需要不同
     * 文案。让服务器逐项声明，UI 就不必再写 `id === "aria2"` 这类
     * 硬编码判断（见 RuntimeCard.svelte）。
     */
    badge?: string;
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
        badge: "下载加速",
        approximateDownloadMB: 5,
        testSnippet: "aria2c --version",
    },
    ffmpeg: {
        id: "ffmpeg",
        name: "FFmpeg",
        kind: "utility",
        // 同样保持笼统：ffmpeg 的能力面极大（转码 / 裁剪 / 抽帧 / 封装 /
        // 滤镜……），罗列具体动作反而容易让用户以为只支持列出的那些。
        tagline: "让 AI 处理音视频：转码、裁剪、抽帧、封装。",
        // tabler 标准图标；语义上比通用的 IconCode 更贴合本工具。
        icon: "IconPhotoVideo",
        badge: "音视频",
        // Jellyfin 便携构建（win64 ~65MB）是主源；npm 备源更大（~134MB）。
        approximateDownloadMB: 70,
        testSnippet: "ffmpeg -version",
    },
};