import { throwNotfound, throwPrecondition } from "$libs/utils/err.js";
import Logger from "electron-log/main.js";
import { TableSkill } from "./tables/skill.js";
import type { ILanceDB } from "./type.js";

/**
 * Skill 分类管理器
 *
 * 由于 Skill 表按 category 拆分成多张同 schema 表，
 * 无法通过 lanceDB.addTable() 静态注册；改由本管理器维护一张
 *   category(string) → TableSkill
 * 的映射。
 *
 * 典型用法：
 *   const reg = new SkillTableRegistry(lancedb);
 *   const t = await reg.ensureSkillCate("coding");
 *   await t.autoAdd([{ id, name, text, tags, skill, ... }]);
 *   const q = await t.autoSearch("如何实现...");
 */
export class SkillRegistry {
    private tables = new Map<string, TableSkill>();
    private readonly prefix: string;

    constructor(private readonly lancedb: ILanceDB, prefix = "skill_") {
        this.prefix = prefix;
    }

    /** category → 物理表名（做基本合法化处理） */
    buildTableName(category: string): string {
        const safe = category
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, "_")
            .replace(/^_+|_+$/g, "");
        if (!safe) {
            throwPrecondition(`[Skill] 非法 category: "${category}"`)
        }
        return `${this.prefix}${safe}`;
    }

    /**
     * 确保某个 category 对应的表已加载/创建；已存在则复用内存实例
     */
    async ensureSkillCate(category: string): Promise<TableSkill> {
        const cached = this.tables.get(category);
        if (cached) return cached;

        const tableName = this.buildTableName(category);
        const t = new TableSkill(this.lancedb, tableName);
        await t.init(this.lancedb.db);
        this.tables.set(category, t);
        Logger.debug(`[Skill] 分类 [${category}] → 表 [${tableName}] 已就绪`);
        return t;
    }

    /**
     * 严格获取：未加载则抛错（不会隐式创建）
     */
    getSkillCate(category: string): TableSkill {
        const t = this.tables.get(category);
        if (!t) {
            throwNotfound(`[Skill] 分类 [${category}] 未加载，请先调用 ensureSkillCate`)
        }
        return t;
    }

    /** 尝试获取：未加载返回 undefined */
    tryGetSkillCate(category: string): TableSkill | undefined {
        return this.tables.get(category);
    }

    /** 是否已加载 */
    has(category: string): boolean {
        return this.tables.has(category);
    }

    /** 已加载 category 列表 */
    listLoaded(): string[] {
        return Array.from(this.tables.keys());
    }

    /** 关闭单个 category 表 */
    async close(category: string): Promise<void> {
        const t = this.tables.get(category);
        if (t) {
            await t.close();
            this.tables.delete(category);
        }
    }

    /** 关闭全部（应用退出时调用） */
    async closeAll(): Promise<void> {
        const all = Array.from(this.tables.values());
        this.tables.clear();
        await Promise.all(all.map((t) => t.close()));
    }

    /** 从底层数据库删除该 category 表（危险操作） */
    async dropSkillCate(category: string): Promise<void> {
        const tableName = this.buildTableName(category);
        await this.close(category);
        await this.lancedb.db.dropTable(tableName);
        Logger.debug(`[Skill] 已删除表 [${tableName}]`);
    }
}