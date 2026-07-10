import { z } from 'zod';

/**
 * FewShotExample 结构
 */
export const FewShotExampleSchema = z.object({
    scenario: z.string().optional(),
    input: z.array(z.string()),
    thoughtProcess: z.string().optional(),
    output: z.array(z.string()),
    kind: z.enum(["pass", "fail"]).optional(),
});

export type FewShotExample = z.infer<typeof FewShotExampleSchema>;



// 控制此cap对io数据的chunk处理模式。
export const ChunkProcessingMode = z.enum([
    /**
   * 1. 整体处理 (Bulk/Batch Processing)
   * 将所有 Chunk 完全加载到内存中，作为一个整体进行批处理。
   */
    'bulk', //（默认）
    /**
    * 2. 并发/并行处理 (Concurrent/Parallel Processing)
    * 独立读取 Chunk 后，One by One并行处理，最后汇总。-- kv为数组，并且flatten模式才会真正持久化(每个处理都可以持久化)
    */
    'obo',
]);
export type ChunkProcessingMode = z.infer<typeof ChunkProcessingMode>;
