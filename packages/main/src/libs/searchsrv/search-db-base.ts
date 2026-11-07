import type { EmbedType } from "$libs/model/factory/type.js";
import type { Connection } from "@lancedb/lancedb";
import Logger from "electron-log/main.js";
import PQueue from "p-queue";
import { throwPrecondition } from "../utils/err.js";
import {
    EmbeddingManager,
    type EmbeddingFailure,
    type EmbeddingState,
    type EmbeddingStatus,
} from "./embedding/embedding-manager.js";
import { getLanceRuntime, type LanceRuntime } from "./lance-runtime.js";

export abstract class SearchDbBase {
    protected readonly embedding = new EmbeddingManager();
    protected readonly queue = new PQueue({ concurrency: 1 });

    #db: Connection | null = null;
    #lance: LanceRuntime | null = null;
    #opened = false;
    #rebuilding = false;

    protected abstract dbPath(): string;

    protected abstract onEmbeddingChanged(
        previous: EmbeddingState | null,
    ): Promise<void>;

    protected async onEmbeddingReady(): Promise<void> { }

    get opened(): boolean {
        return this.#opened && !!this.#db;
    }

    get embedReady(): boolean {
        return this.embedding.ready;
    }

    get rebuilding(): boolean {
        return this.#rebuilding;
    }

    get embeddingState(): EmbeddingState | null {
        return this.embedding.state;
    }

    /** 供外部查询 Embedding 的三态：disabled / ready / degraded */
    get embeddingStatus(): EmbeddingStatus {
        return this.embedding.status;
    }

    /** 是否因加载/调用失败而临时禁用了 Embedding（检索已退化为 FTS） */
    get embeddingDegraded(): boolean {
        return this.embedding.degraded;
    }

    /** 降级原因；未降级时为 null */
    get embeddingFailure(): EmbeddingFailure | null {
        return this.embedding.failure;
    }

    get db(): Connection {
        if (!this.#db) {
            throwPrecondition("[Search] 数据库未打开。");
        }
        return this.#db;
    }

    get lanceInst(): LanceRuntime {
        if (!this.#lance) {
            throwPrecondition("[Search] LanceDB 运行时未加载。");
        }
        return this.#lance;
    }

    get embedSize(): number {
        return this.embedding.embedSize;
    }

    doEmbedding(batch: string[], type: EmbedType): Promise<number[][]> {
        return this.embedding.doEmbedding(batch, type);
    }

    /**
     * 打开检索库：失败不向上抛异常，只记录错误并释放连接。
     */
    async open(): Promise<void> {
        if (this.opened) return;

        try {
            this.#lance = await getLanceRuntime();
            this.#db = await this.#lance.connect(this.dbPath(), {
                storageOptions: { timeout: "10s" },
            });
            this.#opened = true;

            Logger.debug(`[Search] 数据库已连接: ${this.dbPath()}`);
        } catch (error) {
            Logger.error(
                `[Search] 数据库打开失败: ${this.dbPath()}`,
                error,
            );
            this.close();
            return;
        }

        try {
            await this.#syncEmbedding();
        } catch (error) {
            // Embedding 异常已在内部降级；此处兜底建表等初始化异常
            Logger.error(
                "[Search] 检索库初始化失败，已释放数据库连接。",
                error,
            );
            this.close();
        }
    }

    async refreshEmbedding(): Promise<void> {
        if (!this.opened) {
            await this.open();
            return;
        }

        await this.#syncEmbedding();
    }

    async #syncEmbedding(): Promise<void> {
        const previous = await this.#readAppliedState();
        const current = await this.#ensureEmbedding();

        if (!current) {
            // 未配置 / 降级：检索已退化为 FTS，保留旧索引，不重建。
            // 不清除 applied state：恢复同一 Embedding 模型时无需重建。
            // 注意：禁用期间写入的数据会以零向量入库，恢复后这些零向量
            // 会参与向量检索（相似度低，通常排在后面）。如需严格避免，
            // 应在禁用期间避免写入。
            await this.onEmbeddingReady();
            return;
        }

        const changed =
            !previous ||
            previous.modelKey !== current.modelKey ||
            previous.dimension !== current.dimension;

        if (changed) {
            this.#rebuilding = true;
            try {
                await this.queue.add(async () => {
                    const changeText = previous
                        ? `${previous.modelKey} -> ${current.modelKey}`
                        : `首次就绪 ${current.modelKey}`;

                    Logger.info(
                        `[Search] Embedding ${changeText}, dim=${current.dimension}`,
                    );

                    await this.onEmbeddingChanged(previous);
                    await this.#markAppliedSafe();
                });
            } catch (error) {
                Logger.error(
                    "[Search] 按新 Embedding 重建检索表失败，已临时禁用 Embedding，检索退化为全文检索。",
                    error,
                );
                this.embedding.invalidate(error);
            } finally {
                this.#rebuilding = false;
            }
            return;
        }

        await this.onEmbeddingReady();
        await this.#markAppliedSafe();
    }

    async #readAppliedState(): Promise<EmbeddingState | null> {
        try {
            return await this.embedding.loadAppliedState();
        } catch (error) {
            Logger.warn(
                "[Search] 读取 Embedding 应用状态失败，按首次就绪处理。",
                error,
            );
            return null;
        }
    }

    async #ensureEmbedding(): Promise<EmbeddingState | null> {
        try {
            return await this.embedding.ensureReady();
        } catch (error) {
            // 配置非法 / Provider 缺失 / 模型加载失败 / 维度探测失败：
            // 标记为 degraded 并退化为 FTS，不向上抛。
            Logger.error(
                "[Search] Embedding 加载失败，已临时禁用，检索退化为全文检索。",
                error,
            );
            this.embedding.invalidate(error);
            return null;
        }
    }

    async #markAppliedSafe(): Promise<void> {
        try {
            await this.embedding.markApplied();
        } catch (error) {
            Logger.warn(
                "[Search] 记录 Embedding 应用状态失败，下次启动将重新校验。",
                error,
            );
        }
    }

    close(): void {
        this.queue.clear();
        this.#db?.close();
        this.#db = null;
        this.#lance = null;
        this.#opened = false;
        Logger.debug("[Search] 数据库连接已关闭。");
    }
}