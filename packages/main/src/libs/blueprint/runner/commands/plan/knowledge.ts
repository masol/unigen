/**
 * ============================================================================
 * 【P-know · 知识检索门面:人类工作流先验】
 * ============================================================================
 * "人类通常怎么完成这类事情?"的唯一检索入口。
 * 空实现:恒返回空 → 退化为 LLM 凭常识模拟人类思维。
 * 接入真实知识库后无缝增强(经验丰富的人类同行给出的参考流程)。
 */

export interface SkeletonHit {
    /** 人类处理此类任务的思维流程(分步描述) */
    procedure: string;
    source?: string;
}

export interface OutputSpecHit {
    /** 同类成果的规范/格式参考 */
    spec: string;
    /** 人类评判这类成果质量的维度 */
    qualityDimensions: string[];
    source?: string;
}

export interface NodeTemplateHit {
    /** 相似思维环节的 prompt 模板 */
    template: string;
    kind: string;
    source?: string;
}

export interface KnowledgeDB {
    /** 检索"人类通常怎么完成这类事情,分几步想" */
    searchProcedure(query: string, limit: number): Promise<SkeletonHit[]>;
    /** 检索同类成果的输出规范与质量维度 */
    searchOutputSpec(query: string, limit: number): Promise<OutputSpecHit[]>;
    /** 检索相似思维环节的 prompt 模板 */
    searchNodeTemplate(query: string, kind: string, limit: number): Promise<NodeTemplateHit[]>;
}

class EmptyKnowledgeDB implements KnowledgeDB {
    async searchProcedure(): Promise<SkeletonHit[]> { return []; }
    async searchOutputSpec(): Promise<OutputSpecHit[]> { return []; }
    async searchNodeTemplate(): Promise<NodeTemplateHit[]> { return []; }
}

export const globalKnowledgeDB: KnowledgeDB = new EmptyKnowledgeDB();