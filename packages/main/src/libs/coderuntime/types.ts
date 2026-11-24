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

    /**
     * 可选：归档是否来自 GitHub Release。
     *
     * true 时 manager 会把 `isGithub` 传给下载器，从而在中国区自动注入
     * GitHub 代理并使用浏览器 UA。
     */
    isGithubArchive?: boolean;

    /** 当前平台是否有内置默认下载源 */
    hasDefaultArchive(platform: NodeJS.Platform, arch: NodeJS.Architecture): boolean;

    /**
     * 可选：探测**系统已安装**的运行时（例如用户通过系统包管理器安装的
     * `aria2c`），返回**绝对**可执行文件路径；未检测到返回 `null`。
     *
     * 语义约定：
     *   - 只在平台没有内置下载源（`hasDefaultArchive()` 为 false）时才
     *     有意义；manager 仍会先检查托管安装目录，托管安装优先；
     *   - 命中后 manager 会调用 `verifyExecutable()` 验证一次，然后把状态
     *     标记为 `ready`（`installedRoot` 为可执行文件所在目录），
     *     **不下载、不解压**；
     *   - 返回必须是绝对路径：manager 依赖它做后续存在性检查与日志归因，
     *     裸命令名（交由 PATH 解析）会让状态不可复现；
     *   - 实现方**不需要**自己执行 `--version`，验证由 manager 统一完成，
     *     避免同一动作重复 spawn。
     */
    detectSystemExecutable?(): Promise<string | null>;

    /**
     * 可选：既没有内置下载源、也没有探测到系统运行时时的错误文案。
     *
     * 会直接抛给调用方并展示在设置界面，因此应当写成面向用户的话：
     * 说明缺什么、怎么装、装完怎么继续。缺省由 manager 使用通用文案。
     */
    getMissingRuntimeMessage?(): string;

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
     * 可选：是否为该平台启用 tar 归档中的**符号链接**解压。
     *
     * 默认 false（保持通用安全策略：跳过链接）。引擎明确知道官方归档
     * 依赖符号链接时（例如 Node.js Unix tar.gz 的 `bin/npm`、`bin/npx`、
     * `bin/corepack`），可返回 true；此时的校验由通用解压器内部完成：
     *   - 允许 `SymbolicLink` 条目，附加逃逸校验（与 node-tar 防护互补）；
     *   - **硬链接仍然拒绝**，不因本参数放宽。
     *
     * 提醒：Windows 创建符号链接需要特权 / 开发者模式；不该在此返回
     * true 除非调用方明确需要且接受潜在权限弹窗。
     */
    getExtractAllowSymlinks?(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): boolean;

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