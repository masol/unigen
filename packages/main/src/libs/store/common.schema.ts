// const stringArraySchema = {
//     type: 'array',
//     items: {
//         type: 'string',
//     },
// };

export const keybindingsSchema = {
    type: 'object',
    properties: {},
    // 不设 default，交由 ConfigService.ensureDefaultKeybindings() 决定
    // default: {},
    // additionalProperties: stringArraySchema,
};