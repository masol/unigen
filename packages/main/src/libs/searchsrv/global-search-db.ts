import { KcDirName, SkillsDirName } from "$libs/const.js";
import { dataCenter } from "$libs/utils/sys/data.js";
import Logger from "electron-log/main.js";
import { pathExists } from "fs-extra";
import PQueue from "p-queue";
import { lanceGlobalDir } from "../utils/sys/dir.js";
import type { EmbeddingState } from "./embedding/embedding-manager.js";
import { KB_PREFIX, SKILL_TABLE, TOOL_TABLE } from "./schema.js";
import { SearchDbBase } from "./search-db-base.js";
import type { SearchTableBase } from "./search-table-base.js";
import { KbRegistry } from "./tables/kb-registry.js";
import { KbTable } from "./tables/kb-table.js";
import { SkillTable } from "./tables/skill-table.js";
import { ToolTable } from "./tables/tool-table.js";

const GLOBAL_SEARCH_DB_KEY = Symbol.for("unigen.singleton.globalSearchDB");

export class GlobalSearchDB extends SearchDbBase {
    static get instance(): GlobalSearchDB {
        return getGlobalSearchDB();
    }

    #tool: ToolTable | null = null;
    #skill: SkillTable | null = null;
    #kb: KbRegistry | null = null;

    protected dbPath(): string {
        return lanceGlobalDir();
    }

    get tool(): ToolTable {
        if (!this.#tool) {
            throw new Error(
                "[Search] tool 表未就绪：请先调用 open()。",
            );
        }
        return this.#tool;
    }

    get skill(): SkillTable {
        if (!this.#skill) {
            throw new Error(
                "[Search] skill 表未就绪：请先调用 open()。",
            );
        }
        return this.#skill;
    }

    get kb(): KbRegistry {
        if (!this.#kb) {
            throw new Error("[Search] 知识库注册表未就绪。");
        }
        return this.#kb;
    }

    public async syncSystemSkills(): Promise<void> {
        const skTable = this.skill;
        await this.syncPathsInOrder(
            [
                dataCenter.pathInRes(SkillsDirName),
                dataCenter.pathInData(SkillsDirName),
            ],
            (path) => skTable.syncSkillsFromDirectory(path),
        );
    }

    public async syncSystemKC(): Promise<void> {
        const kcTable = this.kb;
        await this.syncPathsInOrder(
            [
                dataCenter.pathInRes(KcDirName),
                dataCenter.pathInData(KcDirName),
            ],
            (path) => kcTable.syncKnowledgeBasesFromDirectory(path),
        );
    }

    private async syncPathsInOrder(
        paths: string[],
        sync: (path: string) => Promise<void>,
    ): Promise<void> {
        const queue = new PQueue({ concurrency: 1 });

        for (const path of paths) {
            await queue.add(async () => {
                if (await pathExists(path)) {
                    await sync(path);
                }
            });
        }
    }

    /**
     * 无论是否配置 embed_model 都初始化 tool/skill。
     * - 已存在表：直接打开，FTS 可用
     * - 不存在表：无 embedding 时用 1 维占位向量建空表，FTS 可用；
     *   之后配置 embedding 会由 onEmbeddingChanged -> reindexAll 重建
     */
    protected async onEmbeddingReady(): Promise<void> {
        if (!this.opened) return;

        this.#tool ??= new ToolTable(this, TOOL_TABLE);
        await this.#tool.init();

        this.#skill ??= new SkillTable(this, SKILL_TABLE);
        await this.#skill.init();

        this.#kb ??= new KbRegistry(this);
    }

    protected async onEmbeddingChanged(
        previous: EmbeddingState | null,
    ): Promise<void> {
        Logger.info(
            `[Search] 开始按新 Embedding 重建全局检索表，旧模型=${previous?.modelKey ?? "none"
            }`,
        );

        await this.onEmbeddingReady();
        await this.reindexAll();

        Logger.info("[Search] 全局检索表已按新 Embedding 重建完成。");
    }

    async reindexAll(): Promise<void> {
        if (!this.opened || !this.embedReady) return;

        const names = await this.db.tableNames();

        for (const name of names) {
            if (!this.isManagedTable(name)) continue;

            const table = await this.resolveManagedTable(name);
            const rows = await table.queryAll();
            await table.rebuild(rows);

            Logger.debug(
                `[Search] 表 [${name}] 已按新向量维度重建，行数=${rows.length}`,
            );
        }
    }

    private isManagedTable(name: string): boolean {
        return (
            name === TOOL_TABLE ||
            name === SKILL_TABLE ||
            name.startsWith(KB_PREFIX)
        );
    }

    private async resolveManagedTable(
        name: string,
    ): Promise<SearchTableBase> {
        if (name === TOOL_TABLE) return this.tool;
        if (name === SKILL_TABLE) return this.skill;

        const loaded = this.kb
            .entries()
            .find(([, table]) => table.name === name);
        if (loaded) return loaded[1];

        const table = new KbTable(this, name);
        await table.init();
        return table;
    }

    close(): void {
        this.#tool?.close();
        this.#skill?.close();
        this.#kb?.closeAll();

        this.#tool = null;
        this.#skill = null;
        this.#kb = null;

        super.close();
    }
}

export function getGlobalSearchDB(): GlobalSearchDB {
    const g = globalThis as unknown as Record<
        symbol,
        GlobalSearchDB | undefined
    >;

    return (g[GLOBAL_SEARCH_DB_KEY] ??= new GlobalSearchDB());
}