import { z } from 'zod';

// 提取 layers 数组成员为独立 schema，便于复用
export const DocumentSplitLayerSchema = z
    .object({
        core_mission: z
            .string()
            .describe('该层的核心使命，即该层要回答或解决的核心问题。'),

        split_method: z
            .string()
            .describe('该层采用的拆分方法名称。'),

        method_description: z
            .array(
                z
                    .string()
                    .describe('对拆分方法的一条具体说明，描述该方法的某个应用要点。')
            )
            .describe('对该层拆分方法的详细说明，逐条解释如何应用该方法。'),

        quality_standards: z
            .array(
                z
                    .string()
                    .describe('判断该层拆分是否合格的一条可检查标准。')
            )
            .describe('判断该层拆分是否合格的质量标准列表。'),
    })
    .describe('单个拆分层级，描述该层的使命、拆分方法与质量标准。');

// 导出 layers 数组成员的类型，供后续使用
export type DocumentSplitLayer = z.infer<typeof DocumentSplitLayerSchema>;

export const DocumentSplitConstitutionSchema = z
    .object({
        layerCount: z
            .number()
            .int()
            .positive()
            .describe('拆分层级数量，表示文档被拆分为几层。'),

        basis: z
            .string()
            .describe('层级决策依据，说明为什么选择该层数。'),

        layers: z
            .array(DocumentSplitLayerSchema)
            .describe('分层数组，按从第一层到最后一层的顺序排列。'),
    })
    .describe('文档拆分宪法的结构化表示，包含层数、依据与分层数组。');

export type DocumentSplitConstitution = z.infer<
    typeof DocumentSplitConstitutionSchema
>;