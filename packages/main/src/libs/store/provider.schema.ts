import { ProviderProtocol } from '$types/shared/model.js';
import { modelSchema } from './model.schema.js';

export const providerSchema = {
    type: 'object',
    additionalProperties: false,

    required: ['id', 'baseUrl', 'models'],

    properties: {
        // 唯一标识，同时作为显示名称
        id: {
            type: 'string',
            minLength: 1
        },

        // 接口协议
        protocol: {
            type: 'string',
            enum: Object.values(ProviderProtocol)
        },

        // OpenAI / Ollama / LM Studio 等服务地址
        baseUrl: {
            type: 'string',
            minLength: 1
        },

        proxyUrl: {
            type: 'string',
        },

        // API Key（本地服务可省略）
        apiKey: {
            type: 'string'
        },

        // 服务商级别最大并发数
        maxConn: {
            type: 'integer',
            minimum: 1
        },

        // 自定义请求头
        headers: {
            type: 'object',
            additionalProperties: {
                type: 'string'
            }
        },

        // 是否禁用
        disabled: {
            type: 'boolean'
        },

        // 模型列表
        models: {
            type: 'array',
            items: modelSchema
        }
    }
};