import { KcDirName, MetaDirname, SkillsDirName } from "$libs/const.js";
import type { KbRegistry } from "$libs/searchsrv/tables/kb-registry.js";
import type { SkillTable } from "$libs/searchsrv/tables/skill-table.js";
import Logger from "electron-log/main.js";
import { join } from "node:path";
import { metaDirName, type IProjectContext } from "../../type.js";
import { BaseProjectController } from "../base.js";
import { isDirectory, ProjectSearchDB } from "./project-search-db.js";

export const lanceDirName = "lance";

export class LanceDB extends BaseProjectController {
    static readonly serviceKey = Symbol.for("project.controller.LanceDB");

    static ensure(ctx: IProjectContext): LanceDB {
        return this.coreEnsure(this, ctx);
    }

    #opened = false;
    #search?: ProjectSearchDB;

    constructor(ctx: IProjectContext) {
        super(ctx);
    }

    get opened(): boolean {
        return this.#opened && this.#search?.opened === true;
    }

    get search(): ProjectSearchDB {
        if (!this.#search) {
            throw new Error("[LanceDB] 检索库尚未打开，无法访问 search。");
        }
        return this.#search;
    }

    get skill(): SkillTable {
        return this.search.skill;
    }

    get kb(): KbRegistry {
        return this.search.kb;
    }

    /**
     * 打开项目级检索库。
     *
     * 打开失败只记录日志并释放资源，不向上抛异常。
     * 首次同步由 ProjectSearchDB 根据 markFirstCreate() 自行完成，
     * 此处不参与任何同步决策。
     *
     * 允许重入：若上一次打开残留了未释放的实例，先 close 再重建。
     */
    async open(): Promise<void> {
        if (this.opened) return;

        if (this.#search) {
            this.close();
        }

        try {
            const dbDir = join(this.ctx.path, metaDirName, lanceDirName);

            const search = new ProjectSearchDB(
                dbDir,
                this.ctx.getPath([MetaDirname, KcDirName]),
                this.ctx.getPath([MetaDirname, SkillsDirName]),
            );
            this.#search = search;

            if (!(await isDirectory(dbDir))) {
                search.markFirstCreate();
            }

            await search.open();

            if (!search.opened) {
                Logger.warn("[LanceDB] 检索库未打开，LanceDB 不可用。");
                return;
            }

            this.#opened = true;
        } catch (error) {
            Logger.error("[LanceDB] 打开失败，LanceDB 不可用。", error);
            this.close();
        }
    }

    /**
     * 响应全局 Embedding 变化。
     *
     * 项目管理处监听 appLife.onEmbedSwitch 后调用本函数即可。
     * 禁用/降级不会重建：旧索引保留，检索自动退化为 FTS；
     * 仅模型/维度真正变更时，由 ProjectSearchDB.onEmbeddingChanged
     * 内部从源目录全量重灌。
     */
    async onEmbedSwitch(): Promise<void> {
        try {
            if (!this.opened) {
                await this.open();
                return;
            }
            await this.search.refreshEmbedding();
        } catch (error) {
            Logger.error("[LanceDB] 响应 Embedding 变更失败。", error);
        }
    }

    close(): void {
        this.#search?.close();
        this.#search = undefined;
        this.#opened = false;
    }
}