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
};