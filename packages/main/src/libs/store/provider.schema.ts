import { ProviderProtocol } from '$types/appconfig.js';
import { modelSchema } from './model.schema.js';

export const providerSchema = {
    type: 'object',
    required: ['id', 'baseUrl', 'models'],
    properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        protocol: {
            type: 'string',
            enum: Object.values(ProviderProtocol)
        },
        baseUrl: { type: 'string' },
        apiKey: { type: 'string' },
        rateLimits: {
            type: 'object',
            properties: {
                rpc: { type: 'number' },
                tpm: { type: 'number' },
                maxConn: { type: 'number' }
            }
        },
        proxyUrl: { type: 'string' },
        headers: {
            type: 'object',
            additionalProperties: { type: 'string' }
        },
        models: {
            type: 'array',
            items: modelSchema // 引入模型 schema
        }
    }
};
