const stringArraySchema = {
    type: 'array',
    items: {
        type: 'string',
    },
};

export const keybindingsSchema = {
    type: 'object',
    default: {},
    additionalProperties: stringArraySchema,
};