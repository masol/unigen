const stringRecordSchema = {
    type: 'object',
    additionalProperties: {
        type: 'string',
    },
} as const;

const stdioTransportSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'command'],
    properties: {
        type: {
            type: 'string',
            enum: ['stdio'],
        },
        command: {
            type: 'string',
            minLength: 1,
        },
        args: {
            type: 'array',
            items: {
                type: 'string',
            },
        },
        env: stringRecordSchema,
        cwd: {
            type: 'string',
        },
    },
} as const;

const sseTransportSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'url'],
    properties: {
        type: {
            type: 'string',
            enum: ['sse'],
        },
        url: {
            type: 'string',
            minLength: 1,
        },
        headers: stringRecordSchema,
    },
} as const;

const httpTransportSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'url'],
    properties: {
        type: {
            type: 'string',
            enum: ['http'],
        },
        url: {
            type: 'string',
            minLength: 1,
        },
        headers: stringRecordSchema,
    },
} as const;

export const mcpServerSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'transport'],
    properties: {
        id: {
            type: 'string',
            minLength: 1,
        },
        name: {
            type: 'string',
        },
        enabled: {
            type: 'boolean',
        },
        transport: {
            oneOf: [
                stdioTransportSchema,
                sseTransportSchema,
                httpTransportSchema,
            ],
        },
    },
} as const;