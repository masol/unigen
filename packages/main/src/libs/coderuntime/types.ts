// packages/main/src/libs/coderuntime/types.ts
//
// 代码运行时核心类型。被 manager / engines / tools / init 共享。

import type {
    CodeRuntimeEngineConfig,
    CodeRuntimeEngineId,
} from "$types/appconfig.js";

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
 *
 * 实现约定：各引擎以 **class** 形式实现此接口（而非模块级 `const` 对象），
 * 类实例由 `CodeRuntimeManager` 在构造函数中 `new` 出来（见
 * `engines/index.js` 的 `ENGINE_CLASSES`）。这样：
 *   - 引擎可以携带**实例级**私有字段，便于测试；
 *   - 避免模块级副作用，对 tree-shake 友好；
 *   - 便于未来切换为依赖注入。
 */
export interface EngineRuntimeHandler {
    readonly id: CodeRuntimeEngineId;

    /** 当前平台是否有内置默认下载源 */
    hasDefaultArchive(platform: NodeJS.Platform, arch: NodeJS.Architecture): boolean;

    /**
     * 按平台返回**候选**归档下载 URL 列表。
     *
     * 顺序语义：由引擎给出"官方 + 若干镜像"的候选清单；
     * 具体排序由调用方通过 `probeUrls + sortByLatency` 决定。
     * 返回 `undefined` 表示当前平台无内置源，manager 会提示用户配置 `archiveUrl`。
     */
    getDefaultArchiveUrls(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string[] | undefined;

    /** 按平台返回解压后入口可执行文件的相对路径 */
    getDefaultExecutableRelativePath(platform: NodeJS.Platform): string | undefined;

    /** 按平台返回解压后默认需要剥离的路径前缀（若有） */
    getDefaultExtractStripPrefix?(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string | undefined;

    /**
     * 可选：返回给定归档的期望 SHA256（hex 小写）。
     *
     * 只有当调用方未显式提供 `archiveUrl`（走内置源）时，manager 才会
     * 采用此值；用户自定义 `archiveUrl` 时 hash 无意义（不同镜像的
     * 内容可能不同），需要用户显式配置 `archiveSha256`。
     */
    getExpectedSha256?(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string | undefined;

    /**
     * 解压后、验证前执行的平台定制化步骤。
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