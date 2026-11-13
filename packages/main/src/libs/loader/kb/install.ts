// packages/main/src/libs/loader/kb/install.ts
// packages/main/src/libs/loader/kb/install.ts
import { openGlobalSearch } from "$libs/searchsrv/index.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { globalKbDir } from "$libs/utils/sys/dir.js";
import AdmZip from "adm-zip";
import { ensureDir, move, pathExists, remove } from "fs-extra";
import { randomUUID } from "node:crypto";
import { basename, extname, join, posix } from "node:path";
import { getErrorMessage } from "radashi";
import {
    entryDirName,
    extractZipSubtree,
    findShallowestFileEntry,
    safeInstallDirName,
} from "../zip.js";
import { installKnowledgeBaseFromUrl } from "./remote.js";

export interface InstalledKnowledgeBase {
    source: string;
    targetDir: string;
}

/**
 * 安装知识库。
 *
 * - URL：交给 remote.ts 占位实现，当前直接抛错；
 * - 本地文件：按 ZIP 解压到 globalKbDir() 下的一级目录。
 *
 * ZIP 内必须存在 meta.json。若 meta.json 位于某个子目录中，则安装该子目录内容；
 * 若位于根目录，则使用 zip 文件名作为安装目录名。
 *
 * 安装完成后只对该目标目录做单库增量同步，不触发全量扫描。
 */
export async function installKnowledgeBase(
    source: string,
): Promise<InstalledKnowledgeBase> {
    const trimmed = source.trim();
    if (!trimmed) {
        throw new Error("知识库来源不能为空");
    }

    if (/^https?:\/\//i.test(trimmed)) {
        return installKnowledgeBaseFromUrl(trimmed);
    }

    const result = await installKnowledgeBaseFromZip(trimmed);

    const db = await openGlobalSearch();
    if (!db.opened) {
        throwUnprcessable("[Kb] 全局检索库未就绪。");
    }

    // 单库增量：只读刚安装的目录，不扫描 res/data 全量。
    await db.kb.syncKnowledgeBaseFromDir(result.targetDir);

    return result;
}

async function installKnowledgeBaseFromZip(
    filePath: string,
): Promise<InstalledKnowledgeBase> {
    const zip = new AdmZip(filePath);
    const metaEntry = findShallowestFileEntry(zip, "meta.json");

    if (!metaEntry) {
        throw new Error("ZIP 中未找到 meta.json");
    }

    try {
        const meta = JSON.parse(zip.readAsText(metaEntry)) as unknown;
        if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
            throw new Error("meta.json 必须是 JSON 对象");
        }
    } catch (error) {
        throwUnprcessable(
            `meta.json 解析失败: ${getErrorMessage(error)}`,
        );
    }

    const rootDir = entryDirName(metaEntry.entryName);
    const rootName = rootDir
        ? posix.basename(rootDir.replace(/\/+$/, ""))
        : basename(filePath, extname(filePath));
    const dirName = safeInstallDirName(rootName);

    const root = globalKbDir();
    const targetDir = join(root, dirName);

    if (await pathExists(targetDir)) {
        throw new Error(`知识库已存在: ${targetDir}`);
    }

    const tempDir = join(root, `.install-${randomUUID()}`);

    await ensureDir(root);
    await ensureDir(tempDir);

    try {
        await extractZipSubtree(zip, rootDir, tempDir);

        if (!(await pathExists(join(tempDir, "meta.json")))) {
            throw new Error("ZIP 解压后缺少 meta.json");
        }

        await move(tempDir, targetDir, { overwrite: false });
    } catch (error) {
        await remove(tempDir).catch(() => undefined);
        throw error;
    }

    return {
        source: filePath,
        targetDir,
    };
}