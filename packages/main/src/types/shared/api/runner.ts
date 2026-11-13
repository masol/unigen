// packages/main/src/types/shared/api/runner.ts

import { ResolvedSettingsSchema, type ResolvedSettings } from '$types/blueprint/settings.js';
import { z } from 'zod';

export const RunnerParamSchema = z.object({
    msg: z.string(),
    sessId: z.string(),
    seq: z.number(),
    msgId: z.string(),
    timestamp: z.number(),
    mode: z.enum(["cmd", "rerun"]).nullish(),
    files: z.array(z.string()).optional(),
    /**
     * 本次请求的临时运行配置，作为 agent front matter settings 的覆盖层。
     *
     * 未声明的字段沿用编译期 settings / 默认值；声明了的字段在运行期合并后生效。
     */
    settings: ResolvedSettingsSchema.partial().optional(),
    /**
     * 本次请求临时追加的本地技能名称列表。--只对根agent有效。
     *
     * 值为id,不附加buildin::,mcp::这样的前缀了。运行期与 PAC front matter 的 skills 合并去重。
     */
    skills: z.array(z.string()).optional(),
    tools: z.array(z.string()).optional(),
});

export type RunnerParam = z.infer<typeof RunnerParamSchema>;

/**
 * 重新导出 ResolvedSettings，降低调用方从深层路径导入的影响面。
 */
export type { ResolvedSettings };
