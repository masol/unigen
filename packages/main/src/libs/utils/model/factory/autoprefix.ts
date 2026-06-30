import type { EmbedResult, EmbedManyResult } from "ai";
import type { EmbedingOp, EmbedingImpl, EmbedType, EmbedingOptions } from "./type.js";

export class AutoPrefixEmbed implements EmbedingOp {
    readonly strategy: "nomic" | "bge" | "" = "";
    constructor(readonly impl: EmbedingImpl, modelId: string) {
        if (modelId.includes('nomic')) {
            this.strategy = "nomic";
        } else if (modelId.includes("bge")) {
            this.strategy = "bge";
        } else {
            this.strategy = ""
        }
    }

    formatInput(text: string, type: 'query' | 'document'): string {
        // 策略 1：如果是 Nomic 模型
        if (this.strategy === 'nomic') {
            return type === 'query' ? `search_query: ${text}` : `search_document: ${text}`;
        }

        // 策略 2：如果是 BGE 模型 (BGE 只有 query 需要加特定中文前缀，document 不需要)
        if (this.strategy === "bge") {
            return type === 'query' ? `为该电子文本生成嵌入式表示：${text}` : text;
        }

        // 策略 3：标准模型（如 OpenAI 规范模型等），直接返回原文本
        return text;
    }

    async embed(value: string, type: EmbedType, opts?: EmbedingOptions): Promise<EmbedResult> {
        const realValue = this.formatInput(value, type);
        return this.impl.embed(realValue, opts);
    }

    async embedMany(values: string[], type: EmbedType, opts?: EmbedingOptions): Promise<EmbedManyResult> {
        const realValues = values.map(v => this.formatInput(v, type))
        return await this.impl.embedMany(realValues, opts);
    }
}
