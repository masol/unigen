import { Schema } from 'electron-store';
import { AppConfig } from '$types/appconfig.js';
import { providerSchema } from './provider.schema.js';
import { keybindingsSchema } from './common.schema.js';

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
    maximized: {
        type: 'boolean',
        default: true
    },
    disableHA: {
        type: 'boolean',
        default: false,
    },
    model_endpoint: {
        type: 'string',
        default: ""
    },
    embed_model: {
        type: 'string',
        default: ""
    },
    local_model: {
        type: "string",
        default: ""
    },
    autoupdate: {
        type: "boolean",
        default: true,
    },
    models: {
        type: 'array',
        default: [],
        items: providerSchema // 引入服务商 schema
    },
    keybindings: keybindingsSchema,
};
