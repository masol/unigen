// packages/main/src/libs/store/stable.schema.ts
import { StableConfig } from '$types/appconfig.js';
import { Schema } from 'electron-store';

const codeRuntimeEngineSchema = {
    type: 'object' as const,
    // 放松校验：允许写入本 schema 尚未声明的字段。
    // 原先 additionalProperties: false 时，任何新增配置项若忘记同步到
    // schema，都会让整次 set() 被 ajv 拒绝，且写入路径只 warn，
    // 表现为「设置静默丢失」。这里改为 true，未知字段原样保留。
    additionalProperties: true,
    required: ['enabled'],
    /**
     * 新安装默认全关。用户必须逐项明确启用某个本机工具 / 语言运行时，
     * 避免首次启动即触发下载或向 AI 暴露可执行能力。
     */
    default: { enabled: false },
    properties: {
        enabled: { type: 'boolean' as const, default: false },
        version: { type: 'string' as const },
        archiveUrl: { type: 'string' as const },
        archiveSha256: { type: 'string' as const },
        extractStripPrefix: { type: 'string' as const },
        executableRelativePath: { type: 'string' as const },
        registry: { type: 'string' as const },
    },
};

/**
 * 单个引擎的持久化状态 schema。
 *
 * 注意：这里已改为 `additionalProperties: true`。原先
 * `additionalProperties: false` + `#writeStatus` 内部 try/catch 只 warn
 * 的组合，会导致在 `CodeRuntimeEngineStatus` 上新增字段而忘记同步到
 * 本对象时，整个 `set("codeRuntimeStatus", ...)` 被拒绝、状态悄悄留在
 * 内存里，重启后进度 / 版本信息回退，且极难从日志定位。
 *
 * 现在未知字段会被接受并持久化；但仍建议新增字段时同步声明类型，
 * 以便获得默认值与类型校验的好处。
 */
const codeRuntimeEngineStatusSchema = {
    type: 'object' as const,
    additionalProperties: true,
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
    // 允许附加字段（例如将来新增的测速明细），避免缓存结构演进时写盘失败。
    additionalProperties: true,
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
        additionalProperties: true,
        required: ['engines'],
        default: {
            engines: {
                python: { enabled: false },
                nodejs: { enabled: false },
                aria2: { enabled: false },
            },
        },
        properties: {
            engines: {
                type: 'object',
                // 新增引擎（如 uv、bun）时无需先改 schema 即可写盘。
                additionalProperties: true,
                required: ['python', 'nodejs', 'aria2'],
                default: {
                    python: { enabled: false },
                    nodejs: { enabled: false },
                    aria2: { enabled: false },
                },
                properties: {
                    python: codeRuntimeEngineSchema,
                    nodejs: codeRuntimeEngineSchema,
                    aria2: codeRuntimeEngineSchema,
                },
            },
        },
    },
    codeRuntimeStatus: {
        type: 'object',
        additionalProperties: true,
        required: ['engines', 'updatedAt'],
        default: {
            engines: {},
            updatedAt: 0,
        },
        properties: {
            engines: {
                type: 'object',
                // 与 codeRuntime.engines 同步放松：未知引擎 ID 的状态
                // 不会再被 ajv 拒绝。
                additionalProperties: true,
                default: {},
                properties: {
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