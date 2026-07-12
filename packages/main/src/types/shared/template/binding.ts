import { z } from "zod";

/** 值绑定：声明节点读/写数据层的哪个 key，及其行为。 */
export const bindingSchema = z.object({
    key: z.string(),
    readonly: z.boolean().optional(),
    /** 是否监听外部（main 或其它组件）对该 key 的变更；默认 false = 本组件是唯一变更源 */
    track: z.boolean().optional()
});

export type Binding = z.infer<typeof bindingSchema>;