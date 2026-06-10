import { Schema } from 'electron-store';
import { AppConfig } from '$types/appconfig.js'

export const configSchema: Schema<AppConfig> = {
    windowState: {
        type: 'object',
        properties: {
            width: { type: 'number', minimum: 100, default: 1280 },
            height: { type: 'number', minimum: 100, default: 720 },
            x: { type: 'number' },
            y: { type: 'number' },
            isMaximized: { type: 'boolean', default: false }
        },
        default: {
            width: 1280,
            height: 720,
            isMaximized: true,
        },
        required: ['width', 'height'],
    },
    theme: {
        type: 'string',
        enum: ['light', 'dark', 'system'],
        default: 'light',
    },
    lang: {
        type: 'string',
        default: 'zh-CN',
    },
};