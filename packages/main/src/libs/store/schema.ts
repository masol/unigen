import { Schema } from 'electron-store';
import { AppConfig } from '$types/appconfig.js'

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
    }
};