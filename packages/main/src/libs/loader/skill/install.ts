// packages/main/src/libs/loader/skill/install.ts
import { openGlobalSearch } from "$libs/searchsrv/index.js";
import { parseSkillFile } from "$libs/searchsrv/skill-loader.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { globalSkillDir } from "$libs/utils/sys/dir.js";
import AdmZip from "adm-zip";
import { ensureDir, move, pathExists, remove } from "fs-extra";
import { randomUUID } from "node:crypto";
import { basename, extname, join, posix } from "node:path";
import {
    entryDirName,
    extractZipSubtree,
    findShallowestFileEntry,
    safeInstallDirName,
} from "../zip.js";
import { installSkillFromUrl } from "./remote.js";

export interface InstalledSkill {
    source: string;
    targetDir: string;
}

/**
 * 安装 Skill。
 *
 * - URL：交给 remote.ts 占位实现，当前直接抛错；
 * - 本地文件：按 ZIP 解压到 globalSkillDir() 下的一级目录。
 *
 * ZIP 内必须存在 SKILL.md。若 SKILL.md 位于某个子目录中，则安装该子目录内容；
 * 若位于根目录，则使用 zip 文件名作为安装目录名。
 *
 * 解压成功后会解析该 skill 并增量写入检索库；只有检索库写入成功才算安装成功，
 * 任一步失败都会回滚已解压目录。
 */
export async function installSkill(source: string): Promise<InstalledSkill> {
    const trimmed = source.trim();
    if (!trimmed) {
        throw new Error("Skill 来源不能为空");
    }

    if (/^https?:\/\//i.test(trimmed)) {
        return installSkillFromUrl(trimmed);
    }

    return installSkillFromZip(trimmed);
}

async function installSkillFromZip(
    filePath: string,
): Promise<InstalledSkill> {
    const zip = new AdmZip(filePath);
    const skillEntry = findShallowestFileEntry(zip, "SKILL.md");

    if (!skillEntry) {
        throw new Error("ZIP 中未找到 SKILL.md");
    }

    const rootDir = entryDirName(skillEntry.entryName);
    const rootName = rootDir
        ? posix.basename(rootDir.replace(/\/+$/, ""))
        : basename(filePath, extname(filePath));
    const dirName = safeInstallDirName(rootName);

    const root = globalSkillDir();
    const targetDir = join(root, dirName);

    if (await pathExists(targetDir)) {
        throw new Error(`Skill 已存在: ${targetDir}`);
    }

    const tempDir = join(root, `.install-${randomUUID()}`);

    await ensureDir(root);
    await ensureDir(tempDir);

    try {
        await extractZipSubtree(zip, rootDir, tempDir);

        if (!(await pathExists(join(tempDir, "SKILL.md")))) {
            throw new Error("ZIP 解压后缺少 SKILL.md");
        }

        await move(tempDir, targetDir, { overwrite: false });
    } catch (error) {
        await remove(tempDir).catch(() => undefined);
        throw error;
    }

    try {
        const scanned = await parseSkillFile(
            join(targetDir, "SKILL.md"),
            root,
        );
        if (!scanned) {
            throwUnprcessable(
                "安装的 Skill 无效（缺少 name/description 或正文）",
            );
        }

        const db = await openGlobalSearch();
        if (!db.opened) {
            throwUnprcessable("全局检索库未就绪，无法注册 Skill");
        }

        await db.skill.addSkill({
            id: scanned.id,
            name: scanned.name,
            description: scanned.description,
            path: scanned.path,
            dir: scanned.dir,
            text: scanned.text,
            metadata: scanned.metadata,
        });
    } catch (error) {
        await remove(targetDir).catch(() => undefined);
        throw error;
    }

    return {
        source: filePath,
        targetDir,
    };
}