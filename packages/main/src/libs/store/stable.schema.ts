import { StableConfig } from '$types/appconfig.js';
import { Schema } from 'electron-store';

const codeRuntimeEngineSchema = {
    type: 'object' as const,
    additionalProperties: false,
    required: ['enabled'],
    default: { enabled: true },
    properties: {
        enabled: { type: 'boolean' as const, default: true },
        version: { type: 'string' as const },
        archiveUrl: { type: 'string' as const },
        archiveSha256: { type: 'string' as const },
        extractStripPrefix: { type: 'string' as const },
        executableRelativePath: { type: 'string' as const },
        registry: { type: 'string' as const },
    },
};

/**
 * aria2 引擎配置 schema。
 *
 * 字段集与 python / nodejs 保持一致（enabled / version / archiveUrl / ...），
 * 仅 **default 值不同**：aria2 对多数用户是可选的下载工具，Linux / macOS
 * 还需要系统包管理器安装，默认为 `false` 更符合语义；python / nodejs 作为
 * 语言运行时默认开启。
 *
 * 这个变体同时也是 schema 的"单一真相源"：`CodeRuntimeManager` 与
 * `api/common/code.ts` 的白名单重建逻辑始终按 `CodeRuntimeEngineId`
 * 生成三个键，因此这里的 `properties` 必须逐一显式声明 `aria2`；
 * `additionalProperties: false` 下任何未声明的键都会让
 * `stableConfig().set("codeRuntime", ...)` 被 electron-store 拒绝。
 */
const codeRuntimeAria2EngineSchema = {
    ...codeRuntimeEngineSchema,
    default: { enabled: false },
};

/**
 * 单个引擎的持久化状态 schema。
 *
 * ⚠️ `additionalProperties: false` + 写入路径（`#writeStatus`）内部
 * try/catch 只 warn 的组合，意味着**任何一个在 `CodeRuntimeEngineStatus`
 * 上新增的字段都必须同步到这里**：漏写不会让写入抛错传播，而是让整个
 * `set("codeRuntimeStatus", ...)` 被拒绝、状态悄悄留在内存里，表现为
 * 「重启后进度 / 版本信息回退到上一次成功写盘的值」。这类问题极难从
 * 日志定位，修改类型时请一并核对本对象。
 */
const codeRuntimeEngineStatusSchema = {
    type: 'object' as const,
    additionalProperties: false,
    required: ['state'],
    default: { state: 'not_ready' },
    properties: {
        state: {
            type: 'string' as const,
            enum: ['not_ready', 'installing', 'ready', 'failed', 'interrupted'],
            default: 'not_ready',
        },
        installedRoot: { type: 'string' as const },
        // 入口可执行文件的完整路径（权威来源）。
        //
        // 与 installedRoot 分离的原因：系统已安装的运行时可能探测到与
        // `executableRelativePath` 不一致的二进制名（如 aria2c-1.37 这类
        // 版本化别名），此时用 `installedRoot + 相对路径` 复算会指向不存在
        // 的文件。`assertReady` 优先使用本字段，缺失时回落到复算并回填。
        executablePath: { type: 'string' as const },
        lastError: { type: 'string' as const },
        lastCheckAt: { type: 'number' as const },
        phase: { type: 'string' as const },
        message: { type: 'string' as const },
        progress: { type: 'number' as const },
        verifiedVersion: { type: 'string' as const },
    },
};

/**
 * npm registry 测速缓存。
 *
 * 故意**不设 default**：语义上"没有缓存" ≠ "空缓存"，用 `get()` 返回
 * `undefined` 表达最直观；同时避免 electron-store 在首次初始化时写入
 * 一个无意义的占位对象。
 *
 * `checkedAt === 0` 由应用层作为"已手动失效"的哨兵值使用（见 nodejs.ts），
 * schema 上仍是合法 number。
 */
const npmRegistryCacheSchema = {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
        url: { type: 'string' as const },
        checkedAt: { type: 'number' as const },
        isChina: { type: 'boolean' as const },
    },
};

export const stableSchema: Schema<StableConfig> = {
    isChina: {
        type: 'boolean',
        default: true,
    },
    isChinaCheckedAt: {
        type: 'number',
        default: 0,
    },
    search_inited: {
        type: 'boolean',
        default: false,
    },
    codeRuntime: {
        type: 'object',
        additionalProperties: false,
        required: ['enabled', 'engines'],
        default: {
            enabled: false,
            engines: {
                python: { enabled: true },
                nodejs: { enabled: true },
                aria2: { enabled: false },
            },
        },
        properties: {
            enabled: { type: 'boolean', default: false },
            engines: {
                type: 'object',
                additionalProperties: false,
                // 注意：`required` 刻意 **不包含** `aria2`。
                //
                // 升级前的旧 store 里 `codeRuntime.engines` 只有
                // python / nodejs；若把 aria2 列进 `required`，用户既有的
                // `set` 调用都会被 electron-store 拒绝。运行期的写入路径
                // （`CodeRuntimeManager` 与 `setRuntimeEnabled`）都会通过
                // 各自的 `pickEngineConfig` 补齐 aria2，所以 required 无需
                // 覆盖它也能保证"写出的式子"合法。
                required: ['python', 'nodejs'],
                default: {
                    python: { enabled: true },
                    nodejs: { enabled: true },
                    aria2: { enabled: false },
                },
                properties: {
                    python: codeRuntimeEngineSchema,
                    nodejs: codeRuntimeEngineSchema,
                    aria2: codeRuntimeAria2EngineSchema,
                },
            },
        },
    },
    codeRuntimeStatus: {
        type: 'object',
        additionalProperties: false,
        required: ['engines', 'updatedAt'],
        default: {
            engines: {},
            updatedAt: 0,
        },
        properties: {
            engines: {
                type: 'object',
                additionalProperties: false,
                default: {},
                properties: {
                    // 与 `codeRuntime.engines.properties` 一一对应：
                    // `CodeRuntimeManager.#writeStatus` 会按
                    // `KNOWN_ENGINE_IDS` 逐个写入，缺失的引擎一旦被写入就
                    // 会被 `additionalProperties: false` 拒绝。
                    python: codeRuntimeEngineStatusSchema,
                    nodejs: codeRuntimeEngineStatusSchema,
                    aria2: codeRuntimeEngineStatusSchema,
                },
            },
            updatedAt: { type: 'number', default: 0 },
        },
    },
    npmRegistryCache: npmRegistryCacheSchema,
};