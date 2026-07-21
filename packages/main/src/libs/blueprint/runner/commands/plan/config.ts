import { isNumber } from "radashi";

export const MAX_ITERATIONS = 100;
export const TOOL_SEARCH_LIMIT = 8;
export const ARTIFACT_FUZZY_THRESHOLD = 0.35;
export const RAG_SKELETON_LIMIT = 5;
export const RAG_TEMPLATE_LIMIT = 3;

const DEF_DESIGN_ROUNDS = 6;
const DEF_EXPAND_DEPTH = 6;

export const EXPAND_CONCURRENCY = 4;
export const PHYSICAL_SPLIT_SIZES = ['large', 'unbounded'] as const;
export const ERRORCHECK_RISK_LEVELS = ['medium', 'high'] as const;

export const RAG_DEFAULT_TOPK = 8;
export const RAG_RERANK_KEEP = 3;

export const LIBRARY_INTENT_HINTS = {
    index: ['建库', '索引', '入库', '收集', '汇总', '沉淀'],
    retrieve: ['检索', '查找', '召回', '查询', '查证', '引用'],
} as const;

export const StepNames = {
    dag: 'dag',
    state: 'state',
} as const;

function getNumber(args: Record<string, string>, key: string, defValue: number): number {
    if (args[key]) {
        const round = parseInt(args[key]);
        if (isNumber(round) && round > 0) {
            return round;
        }
    }
    return defValue;
}

export function getExpandDepth(args: Record<string, string>): number {
    return getNumber(args, 'expand-depth', DEF_EXPAND_DEPTH);
}

export function getDesignRounds(args: Record<string, string>): number {
    return getNumber(args, 'rounds', DEF_DESIGN_ROUNDS);
}