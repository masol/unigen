// packages/main/src/libs/loader/skill/uninstall.ts
import { openGlobalSearch } from "$libs/searchsrv/index.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { globalSkillDir } from "$libs/utils/sys/dir.js";
import { remove } from "fs-extra";
import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * 卸载 Skill：删除磁盘目录 + 从检索库移除。
 *
 * 只允许删除 globalSkillDir() 下的 skill，避免误删 res 目录等只读资源。
 * 先删文件再删索引：文件删除失败时索引保持不变；索引删除失败时文件已删除，
 * 下次全量同步会清理掉残留索引。
 */
export async function uninstallSkill(id: string): Promise<void> {
    const trimmed = id.trim();
    if (!trimmed) {
        throwUnprcessable("Skill id 不能为空");
    }

    const db = await openGlobalSearch();
    if (!db.opened) {
        throwUnprcessable("全局检索库未就绪，无法删除 Skill");
    }

    const row = await db.skill.getById(trimmed);
    if (!row) {
        throwUnprcessable(`Skill 不存在: ${trimmed}`);
    }

    const root = resolve(globalSkillDir());
    const target = resolve(row.path);
    const rel = relative(root, target);

    if (
        !rel ||
        rel === ".." ||
        rel.startsWith(`..${sep}`) ||
        isAbsolute(rel)
    ) {
        throwUnprcessable(
            `不允许删除非用户安装目录的 Skill: ${row.path}`,
        );
    }

    await remove(target);
    await db.skill.deleteSkill(trimmed);
}