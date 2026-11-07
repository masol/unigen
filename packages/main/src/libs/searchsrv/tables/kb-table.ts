// tables/kb-table.ts
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { Schema } from "apache-arrow";
import { getKbSchema } from "../schema.js";
import type { SearchDbBase } from "../search-db-base.js";
import { SearchTableBase } from "../search-table-base.js";
import type { SearchOptions, SearchRow } from "../types.js";

/**
 * 已切分好的 chunk。调用方已完成切分，本表不再二次 split。
 * 适用于外部已按业务语义切好段落的场景。
 */
export interface KbChunkInput {
    /** 全局唯一 chunk id，需由调用方保证。 */
    id: string;
    /** chunk 正文，检索与 embedding 均基于此字段。 */
    text: string;
    /** 所属文档标题，参与 FTS。 */
    title?: string;
    /** 来源标识（文件名 / URL 等），便于回溯。 */
    source?: string;
    /** 任意附加信息，序列化后存入 metadata 字段。 */
    metadata?: Record<string, unknown>;
}

/**
 * 一整篇长文档。调用方直接传原文，addDocument 内部完成切分。
 * 推荐新接入方优先使用此结构，避免自己实现 chunk 边界。
 */
export interface KbDocumentInput {
    /**
     * 文档 id，用于生成 chunk id（`${id}_chunk_${index}`）。
     * 同一文档重复写入会产生不同 chunk id，不会自动覆盖旧 chunk；
     * 更新文档前请先自行删除旧数据或重建知识库。
     */
    id: string;
    /** 文档原文，内部按 chunkSize/chunkOverlap 切分。 */
    text: string;
    /** 文档标题；缺省时 chunk 的 title 为空串。 */
    title?: string;
    /** 来源标识（文件名 / URL 等）；缺省为空串。 */
    source?: string;
    /**
     * 附加信息。会被合并进每个 chunk 的 metadata，
     * 并额外注入 docId / chunkIndex / totalChunks。
     */
    metadata?: Record<string, unknown>;
}

/** 检索返回的 chunk 行。一次检索可能命中同一文档的多个 chunk。 */
export interface KbChunkRow extends Record<string, unknown> {
    id: string;
    text: string;
    title: string;
    source: string;
    vector?: number[];
    metadata?: string;
    created_at?: string;
    updated_at?: string;
}

const KB_CHUNK_SIZE = 800;
const KB_CHUNK_OVERLAP = 120;

export class KbTable extends SearchTableBase<KbChunkRow> {
    constructor(host: SearchDbBase, name: string) {
        super(host, name);
    }

    protected schema(vecSize: number): Schema {
        return getKbSchema(vecSize);
    }

    protected ftsColumns(): string[] {
        return ["title", "text"];
    }

    /**
     * 写入一整篇长文档：内部按递归字符 splitter 切 chunk，
     * 每个 chunk 作为独立记录写入。检索时返回的是命中的 chunk。
     *
     * 适合“一次喂一篇文档”的接入方式；已完成切分的场景请用 addChunks。
     */
    async addDocument(doc: KbDocumentInput): Promise<void> {
        const chunks = await this.buildDocumentChunks(doc);
        if (chunks.length === 0) return;

        await this.addChunks(chunks);
    }

    /**
     * 全量替换写入多篇文档。
     *
     * 用于目录同步：同一知识库目录下的所有文件一次性重建，
     * 避免重复 add 产生重复 chunk。
     */
    async replaceDocuments(docs: KbDocumentInput[]): Promise<void> {
        const chunks: KbChunkInput[] = [];

        for (const doc of docs) {
            chunks.push(...(await this.buildDocumentChunks(doc)));
        }

        await this.replaceChunks(chunks);
    }

    /**
     * 写入已切分好的 chunk。调用方负责切分粒度。
     *
     * chunk id 必须全局唯一；重复 id 不会自动去重。
     */
    async addChunks(chunks: KbChunkInput[]): Promise<void> {
        await this.add(this.toRecords(chunks));
    }

    /**
     * 全量替换 chunk。空数组会清空表内数据但保留 schema/索引。
     */
    async replaceChunks(chunks: KbChunkInput[]): Promise<void> {
        await this.replaceAll(this.toRecords(chunks));
    }

    /**
     * 检索 chunk。返回命中段落，而非整篇文档。
     * 需要整篇文档语义时，由调用方按 metadata.docId 聚合。
     */
    async searchChunks(
        queryText: string,
        opts: SearchOptions = {},
    ): Promise<KbChunkRow[]> {
        return this.search(queryText, {
            mode: "hybrid",
            ...opts,
        });
    }

    private async buildDocumentChunks(
        doc: KbDocumentInput,
    ): Promise<KbChunkInput[]> {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: KB_CHUNK_SIZE,
            chunkOverlap: KB_CHUNK_OVERLAP,
            separators: ["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""],
        });

        const chunks = await splitter.splitText(doc.text);
        if (chunks.length === 0) return [];

        return chunks.map((chunkText, index) => ({
            id: `${doc.id}_chunk_${index}`,
            text: chunkText,
            title: doc.title ?? "",
            source: doc.source ?? "",
            metadata: {
                ...(doc.metadata ?? {}),
                docId: doc.id,
                chunkIndex: index,
                totalChunks: chunks.length,
            },
        }));
    }

    private toRecords(chunks: KbChunkInput[]): SearchRow[] {
        const now = new Date().toISOString();

        return chunks.map((chunk) => ({
            id: chunk.id,
            text: chunk.text,
            title: chunk.title ?? "",
            source: chunk.source ?? "",
            metadata: JSON.stringify(chunk.metadata ?? {}),
            created_at: now,
            updated_at: now,
        }));
    }
}