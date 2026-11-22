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
            },
        },
        properties: {
            enabled: { type: 'boolean', default: false },
            engines: {
                type: 'object',
                additionalProperties: false,
                required: ['python', 'nodejs'],
                default: {
                    python: { enabled: true },
                    nodejs: { enabled: true },
                },
                properties: {
                    python: codeRuntimeEngineSchema,
                    nodejs: codeRuntimeEngineSchema,
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
                    python: codeRuntimeEngineStatusSchema,
                    nodejs: codeRuntimeEngineStatusSchema,
                },
            },
            updatedAt: { type: 'number', default: 0 },
        },
    },
    npmRegistryCache: npmRegistryCacheSchema,
};