import { z } from "zod";

/** 值绑定：声明节点读/写数据层的哪个 key，及其行为。 */
export const bindingSchema = z.object({
    readKey: z.string(),
    writeKey: z.string().optional(),
    readonly: z.boolean().optional(),
    track: z.boolean().optional(),
    schema: z.string().optional(),
});

export type Binding = z.infer<typeof bindingSchema>;