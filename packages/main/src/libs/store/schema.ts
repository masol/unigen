import { AppConfig } from '$types/appconfig.js';
import { Schema } from 'electron-store';
import { keybindingsSchema } from './common.schema.js';
import { mcpServerSchema } from './mcp.schema.js';
import { providerSchema } from './provider.schema.js';

export const configSchema: Schema<AppConfig> = {
    theme: {
        type: 'string',
        enum: ['light', 'dark', 'system'],
        default: 'light',
    },
    lang: {
        type: 'string',
        default: 'zh-CN',
    },
    itemsPerPage: {
        type: 'integer',
        default: 10,
        minimum: 5,
        maximum: 30
    },
    fontSize: {
        type: 'integer',
        default: 16,
        minimum: 6,
        maximum: 80
    },
    lineHeight: {
        type: 'integer',
        default: 26,
        minimum: 3,
        maximum: 50
    },
    concurrency: {
        type: 'integer',
        default: 12,
        minimum: 1,
        maximum: 3000
    },
    lineNumbers: {
        type: 'boolean',
        default: true
    },
    maximized: {
        type: 'boolean',
        default: true
    },
    disableHA: {
        type: 'boolean',
        default: false,
    },
    embed_model: {
        type: 'string',
        default: ""
    },
    telemetry: {
        type: 'string',
        default: ""
    },
    rerank_model: {
        type: "string",
        default: ""
    },
    fts_tokenizer: {
        type: 'string',
        enum: ['jieba', 'icu', 'simple'],
        default: 'jieba',
    },
    autoupdate: {
        type: "boolean",
        default: true,
    },
    parallelRun: {
        type: "boolean",
        default: false,
    },
    rmblueprint: {
        type: "boolean",
        default: false,
    },
    showDevUI: {
        type: "boolean",
        default: false,
    },
    task_dir: {
        type: "string",
        default: "",
    },
    model_dir: {
        type: "string",
        default: "",
    },
    models: {
        type: 'array',
        default: [],
        items: providerSchema // 引入服务商 schema
    },
    mcpServers: {
        type: 'array',
        default: [],
        items: mcpServerSchema,
    },
    keybindings: keybindingsSchema,

    // ── Markdown 阅读外观 ─────────────────────────────────────
    markdownFontSize: {
        type: 'integer',
        default: 15,
        minimum: 10,
        maximum: 40,
    },
    markdownLineHeight: {
        type: 'number',
        default: 1.7,
        minimum: 1.2,
        maximum: 3.0,
    },
    markdownFontFamily: {
        type: 'string',
        enum: ['system', 'sans', 'serif'],
        default: 'system',
    },
    markdownCodeFontSize: {
        type: 'integer',
        default: 13,
        minimum: 8,
        maximum: 30,
    },
    markdownMaxWidth: {
        type: 'integer',
        default: 860,
        minimum: 0,
        maximum: 2000,
    },
    markdownAutoCollapseCode: {
        type: 'integer',
        default: 0,
        minimum: 0,
        maximum: 1000,
    },
};