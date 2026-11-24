// packages/main/src/libs/store/stable.schema.ts
import { StableConfig } from '$types/appconfig.js';
import { Schema } from 'electron-store';

/**
 * 单个引擎的用户配置 schema。
 *
 * `additionalProperties: true` 是**有意**的：允许写入本 schema 尚未声明的
 * 字段。原先 `additionalProperties: false` 时，任何新增配置项若忘记同步到
 * schema，都会让整次 set() 被 ajv 拒绝，且写入路径只 warn，
 * 表现为「设置静默丢失」。这里改为 true，未知字段原样保留。
 *
 * `required: ['enabled']` 保留：`enabled` 是引擎配置的唯一必填语义字段
 * （读取点全都依赖它判断“是否启用”），且所有写入都经过
 * `pickEngineConfig()`（见 api/common/code.ts），必然携带布尔值。
 */
const codeRuntimeEngineSchema = {
    type: 'object' as const,
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
 * 引擎集合（`codeRuntime.engines` 与 `codeRuntimeStatus.engines` 共用语义）。
 *
 * **工具无关**：键是开放集合。
 *
 *   - 新增引擎**不需要**修改本 schema —— 写入未在这里列举的引擎键会被
 *     `additionalProperties: true` 接受（只是不做字段级校验）；
 *   - 把新引擎补进 `properties` 是**可选**的收紧：能获得
 *     `codeRuntimeEngineSchema` 的字段级校验与 `enabled` 默认值，
 *     而不是必须的“登记”；
 *   - 读取侧已经把“键缺失”等价于“默认关闭”（`pickEngineConfig(undefined)`
 *     → `{ enabled: false }`；工具层 `cfg.engines?.x?.enabled` 全是可选链），
 *     因此 `default` 里也不必逐项列举。
 *
 * 为什么不用 `additionalProperties: codeRuntimeEngineSchema`（更彻底的
 * 工具无关写法）：ajv 的 `useDefaults` 只在 `properties` / `items` 内插
 * 默认值，写在 `additionalProperties` 里时，`required: ['enabled']` 会因为
 * 缺省值没被注入而拒绝写入 `{ python: {} }` —— 结果是"为了工具无关反而
 * 更容易写盘失败"。列举已知引擎 + `additionalProperties: true` 是当前
 * 版本下风险最低的组合。
 */
const codeRuntimeEnginesSchema = {
    type: 'object' as const,
    additionalProperties: true,
    // 不再 enumerate 具体引擎：缺失键等价于“全关”，详见上方注释。
    default: {},
    properties: {
        python: codeRuntimeEngineSchema,
        nodejs: codeRuntimeEngineSchema,
        aria2: codeRuntimeEngineSchema,
        ffmpeg: codeRuntimeEngineSchema,
    },
};

/**
 * 单个引擎的持久化状态 schema。
 *
 * 这里已改为 `additionalProperties: true`。原先
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
        // 版本化别名）；社区构建的归档还可能把二进制埋在子目录里（如
        // npm 镜像上的 ffmpeg）。这两种情况下用
        // `installedRoot + 相对路径` 复算都会指向不存在的文件。
        // `assertReady` 优先使用本字段，缺失时回落到复算并回填。
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
        // 不逐项列出引擎：缺失键等价于“默认关闭”，由读取侧收敛
        // （见 codeRuntimeEnginesSchema 注释）。
        default: { engines: {} },
        properties: {
            engines: codeRuntimeEnginesSchema,
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
                // 不会被 ajv 拒绝。
                additionalProperties: true,
                default: {},
                properties: {
                    python: codeRuntimeEngineStatusSchema,
                    nodejs: codeRuntimeEngineStatusSchema,
                    aria2: codeRuntimeEngineStatusSchema,
                    ffmpeg: codeRuntimeEngineStatusSchema,
                },
            },
            updatedAt: { type: 'number', default: 0 },
        },
    },
    npmRegistryCache: npmRegistryCacheSchema,
};