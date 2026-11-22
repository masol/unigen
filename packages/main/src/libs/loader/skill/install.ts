// packages/main/src/libs/loader/skill/install.ts
import { openGlobalSearch } from "$libs/searchsrv/index.js";
import { parseSkillFile } from "$libs/searchsrv/skill-loader.js";
import { throwUnprocessable } from "$libs/utils/err.js";
import { globalSkillDir } from "$libs/utils/sys/dir.js";
import { ensureDir, move, pathExists, remove } from "fs-extra";
import { randomUUID } from "node:crypto";
import { basename, join, posix } from "node:path";
import {
    entryDirName,
    extractArchive,
    findShallowestFile,
    safeArchiveRelativeName,
    safeInstallDirName,
} from "../archive.js";
import { installSkillFromUrl } from "./remote.js";

export interface InstalledSkill {
    source: string;
    targetDir: string;
}

function archiveBaseName(filePath: string): string {
    const fileName = basename(filePath);
    const stripped = fileName.replace(
        /\.(?:tar\.bz2|tar\.gz|tgz|tar|zip|bz2)$/i,
        "",
    );
    return stripped || fileName;
}

/**
 * 安装 Skill。
 *
 * - URL：交给 remote.ts 占位实现，当前直接抛错；
 * - 本地文件：按归档解压到 globalSkillDir() 下的一级目录。
 *
 * 归档内必须存在 SKILL.md。若 SKILL.md 位于某个子目录中，则安装该子目录内容；
 * 若位于根目录，则使用归档文件名作为安装目录名。
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

    return installSkillFromArchive(trimmed);
}

async function installSkillFromArchive(
    filePath: string,
): Promise<InstalledSkill> {
    const skillEntry = await findShallowestFile(filePath, "SKILL.md");

    if (!skillEntry) {
        throw new Error("归档中未找到 SKILL.md");
    }

    const skillPath = safeArchiveRelativeName(skillEntry.path);
    if (!skillPath) {
        throw new Error("SKILL.md 路径非法");
    }

    const rootDir = entryDirName(skillPath);
    const rootName = rootDir
        ? posix.basename(rootDir.replace(/\/+$/, ""))
        : archiveBaseName(filePath);
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
        await extractArchive({
            archivePath: filePath,
            targetDir: tempDir,
            stripPrefix: rootDir,
        });

        if (!(await pathExists(join(tempDir, "SKILL.md")))) {
            throw new Error("归档解压后缺少 SKILL.md");
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
            throwUnprocessable(
                "安装的 Skill 无效（缺少 name/description 或正文）",
            );
        }

        const db = await openGlobalSearch();
        if (!db.opened) {
            throwUnprocessable("全局检索库未就绪，无法注册 Skill");
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