// packages/main/src/libs/coderuntime/types.ts
//
// 代码运行时核心类型。被 manager / engines / tools / bootstrap 共享。

import type {
    CodeRuntimeEngineConfig,
    CodeRuntimeEngineId,
} from "$types/appconfig.js";

/**
 * 阶段回调。由 manager 注入，用于把 SDK 内的执行情况转发到任务进度系统。
 */
export interface EngineProgressReporter {
    report(phase: string, message: string, progress: number): void;
    warn(warning: {
        id: string;
        level: "info" | "warn" | "error";
        code: string;
        message: string;
        detail?: string;
    }): void;
}

/**
 * 引擎安装后的运行期上下文。
 * 工具调用 `assertReady` 时返回，工具据此执行代码。
 */
export interface ReadyRuntime {
    engine: CodeRuntimeEngineId;
    executablePath: string;
    rootDir: string;
}

/** 后处理上下文（解压后，可执行文件被验证前）。 */
export interface PostExtractContext {
    /** 运行时根目录（解压完成） */
    rootDir: string;
    /** 入口可执行文件的绝对路径 */
    executablePath: string;
    /** 下载缓存目录（供后处理下载 get-pip.py 等辅助文件） */
    downloadDir: string;
    /** 引擎配置（可能带 registry / version） */
    engineConfig: CodeRuntimeEngineConfig;
}

/**
 * 单个引擎的处理逻辑：管理器只通过此接口与具体语言交互，
 * 避免每个语言散落到全局代码里。
 */
export interface EngineRuntimeHandler {
    readonly id: CodeRuntimeEngineId;

    /** 当前平台是否有内置默认下载源 */
    hasDefaultArchive(platform: NodeJS.Platform, arch: NodeJS.Architecture): boolean;

    /** 按平台返回归档下载 URL 的默认值；不支持时返回 undefined */
    getDefaultArchiveUrl(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string | undefined;

    /** 按平台返回解压后入口可执行文件的相对路径 */
    getDefaultExecutableRelativePath(platform: NodeJS.Platform): string | undefined;

    /** 按平台返回解压后默认需要剥离的路径前缀（若有） */
    getDefaultExtractStripPrefix?(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string | undefined;

    /**
     * 解压后、验证前执行的平台定制化步骤。
     * 例如 Windows python embeddable 需要启用 site-packages 并安装 pip。
     */
    applyPostExtract?(ctx: PostExtractContext): Promise<void>;

    /**
     * 验证可执行文件；成功时返回版本描述字符串，失败抛错。
     */
    verifyExecutable(
        executablePath: string,
        ctx: { timeoutMs?: number },
    ): Promise<string>;
}