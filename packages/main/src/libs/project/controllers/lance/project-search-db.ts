import type {
    EmbeddingState,
} from "$libs/searchsrv/embedding/embedding-manager.js";
import { SKILL_TABLE } from "$libs/searchsrv/schema.js";
import { SearchDbBase } from "$libs/searchsrv/search-db-base.js";
import { KbRegistry } from "$libs/searchsrv/tables/kb-registry.js";
import { SkillTable } from "$libs/searchsrv/tables/skill-table.js";
import Logger from "electron-log/main.js";
import { stat } from "node:fs/promises";

export async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

/**
 * 项目级检索库。
 *
 * 完全复用 searchsrv 的 SearchDbBase / SkillTable / KbRegistry。
 *
 * 同步策略：
 * - 首次创建目录：必须同步一次。
 *   · 嵌入已就绪 → 由 onEmbeddingChanged 以真实向量同步
 *   · 嵌入未就绪 → 由 onEmbeddingReady 以零向量占位同步
 * - 嵌入真正变更（模型/维度不同）：onEmbeddingChanged 全量重灌。
 * - 嵌入禁用/降级：基类只调用 onEmbeddingReady，保留旧索引，
 *   检索自动退化为 FTS；恢复同一模型时不重建。
 * - 非首次创建且嵌入无变化：不同步，保留现有索引。
 */
export class ProjectSearchDB extends SearchDbBase {
    #skill: SkillTable | null = null;
    #kb: KbRegistry | null = null;
    #firstCreate = false;

    constructor(
        private readonly dir: string,
        private readonly kcDir: string,
        private readonly skillsDir: string,
    ) {
        Logger.debug("kcdir,skillsDir...", kcDir, skillsDir, dir)
        super();
    }

    protected dbPath(): string {
        return this.dir;
    }

    /** 由 LanceDB.open() 在目录首次创建时调用。 */
    markFirstCreate(): void {
        this.#firstCreate = true;
    }

    get skill(): SkillTable {
        if (!this.#skill) {
            throw new Error("[LanceDB] skill 表未就绪。");
        }
        return this.#skill;
    }

    get kb(): KbRegistry {
        if (!this.#kb) {
            throw new Error("[LanceDB] 知识库注册表未就绪。");
        }
        return this.#kb;
    }

    async #ensureTables(): Promise<void> {
        if (!this.#skill) {
            this.#skill = new SkillTable(this, SKILL_TABLE);
            await this.#skill.init();
        }
        this.#kb ??= new KbRegistry(this);
    }

    protected async onEmbeddingReady(): Promise<void> {
        if (!this.opened) return;
        await this.#ensureTables();

        if (this.#firstCreate) {
            this.#firstCreate = false;
            await this.syncFromDirectories();
        }
    }

    protected async onEmbeddingChanged(
        _previous: EmbeddingState | null,
    ): Promise<void> {
        if (!this.opened) return;
        await this.#ensureTables();

        // 嵌入真正变更时，无论是否首次都必须全量重灌。
        this.#firstCreate = false;
        await this.syncFromDirectories();
    }

    async syncFromDirectories(): Promise<void> {
        if (!this.opened) return;

        if (await isDirectory(this.skillsDir)) {
            await this.skill.syncSkillsFromDirectory(this.skillsDir);
        } else {
            Logger.debug(
                `[LanceDB] 项目级skills 目录不存在，跳过技能入库: ${this.skillsDir}`,
            );
        }

        if (await isDirectory(this.kcDir)) {
            await this.kb.syncKnowledgeBasesFromDirectory(this.kcDir);
        } else {
            Logger.debug(
                `[LanceDB] 项目级kc 目录不存在，跳过知识库入库: ${this.kcDir}`,
            );
        }
    }

    close(): void {
        this.#skill?.close();
        this.#kb?.closeAll();

        this.#skill = null;
        this.#kb = null;

        super.close();
    }
}