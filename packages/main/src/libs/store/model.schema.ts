import { ModelAbility } from '$types/appconfig.js';

export const modelSchema = {
    type: 'object',
    required: ['id', 'abilities', 'inputModalities', 'outputModalities', 'inctx', 'outctx', 'pricingType', 'isLocal'],
    properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        abilities: {
            type: 'array',
            items: {
                type: 'string',
                enum: Object.values(ModelAbility)
            }
        },
        inputModalities: {
            type: 'array',
            items: {
                type: 'string',
                enum: ['text', 'image', 'audio', 'video']
            }
        },
        outputModalities: {
            type: 'array',
            items: {
                type: 'string',
                enum: ['text', 'image', 'audio', 'video']
            }
        },
        inctx: { type: 'number' },
        outctx: { type: 'number' },
        pricingType: {
            type: 'string',
            enum: ['free', 'per-token', 'per-request', 'local']
        },
        incost_1m: { type: 'number' },
        outcost_1m: { type: 'number' },
        isLocal: { type: 'boolean' }
    }
};
