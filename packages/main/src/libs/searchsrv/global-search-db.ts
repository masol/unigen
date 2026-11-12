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
import { scanSkillsFromDirectory } from "./skill-loader.js";
import { KbRegistry } from "./tables/kb-registry.js";
import { KbTable } from "./tables/kb-table.js";
import { SkillTable, type SkillInput } from "./tables/skill-table.js";
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

        // 合并多个技能根后再一次性 syncSkills（replaceAll），避免多次
        // syncSkillsFromDirectory 之间互相覆盖（后者会清空前者）。
        // 同一 id 时按顺序后者覆盖前者：data 目录（用户安装）优先于 res。
        const dirs = [
            dataCenter.pathInRes(SkillsDirName),
            dataCenter.pathInData(SkillsDirName),
        ];

        const merged = new Map<string, SkillInput>();

        for (const dir of dirs) {
            if (!(await pathExists(dir))) continue;

            const skills = await scanSkillsFromDirectory(dir);
            for (const skill of skills) {
                merged.set(skill.id, {
                    id: skill.id,
                    name: skill.name,
                    description: skill.description,
                    path: skill.path,
                    dir: skill.dir,
                    text: skill.text,
                    metadata: skill.metadata,
                });
            }
        }

        Logger.debug(
            `[Search] 系统 Skill 同步: 目录数=${dirs.length}, 合并后条目数=${merged.size}`,
        );

        await skTable.syncSkills(Array.from(merged.values()));
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
     *
     * 每次就绪都会对每张表执行 alignVectorSize 做自愈：
     * 历史遗留的 1 维表（首次无 embed 时创建、后续未触发全量重建）
     * 会在这一步被按当前 embedSize 修复，无需用户清 search_inited。
     * 维度一致时只做一次 schema 读，无 embedding 成本。
     */
    protected async onEmbeddingReady(): Promise<void> {
        if (!this.opened) return;

        this.#tool ??= new ToolTable(this, TOOL_TABLE);
        await this.#tool.init();
        await this.#tool.alignVectorSize();

        this.#skill ??= new SkillTable(this, SKILL_TABLE);
        await this.#skill.init();
        await this.#skill.alignVectorSize();

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