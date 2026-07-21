/**
 * ============================================================================
 * 【P-know · 知识检索门面:人类工作流先验】
 * ============================================================================
 */
import { RAG_RERANK_KEEP } from "./config.js";

export interface SkeletonHit {
    /** 人类处理此类任务的思维流程(分步描述) */
    procedure: string;
    source?: string;
    /** 命中分数(0-1)，用于强匹配判定 */
    score?: number;
}

export interface OutputSpecHit {
    spec: string;
    qualityDimensions: string[];
    source?: string;
    score?: number;
}

export interface NodeTemplateHit {
    template: string;
    kind: string;
    source?: string;
    score?: number;
}

/**
 * 节点级检索结果（强匹配时直接 EXPAND）
 */
export interface NodePriorHit {
    /** 人类对该类思维环节的标准工作流概述 */
    procedure: string;
    /** 相似度分数(0-1) */
    score: number;
    source?: string;
}

export interface KnowledgeDB {
    /** 检索"人类通常怎么完成这类事情,分几步想" */
    searchProcedure(query: string, limit: number): Promise<SkeletonHit[]>;
    /** 检索同类成果的输出规范与质量维度 */
    searchOutputSpec(query: string, limit: number): Promise<OutputSpecHit[]>;
    /** 检索相似思维环节的 prompt 模板 */
    searchNodeTemplate(query: string, kind: string, limit: number): Promise<NodeTemplateHit[]>;
    /**
     * 节点级检索：给定一个具体思维环节（name+intent），检索人类对该类环节的标准工作流
     * 用于 P2 expand 的强匹配短路
     */
    searchNodePrior?(name: string, intent: string, limit: number): Promise<NodePriorHit[]>;
}

class EmptyKnowledgeDB implements KnowledgeDB {
    async searchProcedure(): Promise<SkeletonHit[]> { return []; }
    async searchOutputSpec(): Promise<OutputSpecHit[]> { return []; }
    async searchNodeTemplate(): Promise<NodeTemplateHit[]> { return []; }
    async searchNodePrior(): Promise<NodePriorHit[]> { return []; }
}

export const globalKnowledgeDB: KnowledgeDB = new EmptyKnowledgeDB();

/** 节点级强匹配阈值（@TODO: 实际接入后由校准数据决定） */
export const NODE_PRIOR_STRONG_THRESHOLD = 0.8;

/** Rerank 保留数（默认 top-3） */
export { RAG_RERANK_KEEP };
