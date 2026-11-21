// packages/main/src/libs/loader/kb/install.ts
import { openGlobalSearch } from "$libs/searchsrv/index.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { globalKbDir } from "$libs/utils/sys/dir.js";
import { ensureDir, move, pathExists, remove } from "fs-extra";
import { randomUUID } from "node:crypto";
import { basename, join, posix } from "node:path";
import { getErrorMessage } from "radashi";
import {
    entryDirName,
    extractArchive,
    findShallowestFile,
    safeArchiveRelativeName,
    safeInstallDirName,
} from "../archive.js";
import { installKnowledgeBaseFromUrl } from "./remote.js";

export interface InstalledKnowledgeBase {
    source: string;
    targetDir: string;
}

function stripBom(value: string): string {
    return value.length > 0 && value.charCodeAt(0) === 0xfeff
        ? value.slice(1)
        : value;
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
 * 安装知识库。
 *
 * - URL：交给 remote.ts 占位实现，当前直接抛错；
 * - 本地文件：按归档解压到 globalKbDir() 下的一级目录。
 *
 * 归档内必须存在 meta.json。若 meta.json 位于某个子目录中，则安装该子目录内容；
 * 若位于根目录，则使用归档文件名作为安装目录名。
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

    const result = await installKnowledgeBaseFromArchive(trimmed);

    const db = await openGlobalSearch();
    if (!db.opened) {
        throwUnprcessable("[Kb] 全局检索库未就绪。");
    }

    // 单库增量：只读刚安装的目录，不扫描 res/data 全量。
    await db.kb.syncKnowledgeBaseFromDir(result.targetDir);

    return result;
}

async function installKnowledgeBaseFromArchive(
    filePath: string,
): Promise<InstalledKnowledgeBase> {
    const metaEntry = await findShallowestFile(filePath, "meta.json");

    if (!metaEntry) {
        throw new Error("归档中未找到 meta.json");
    }

    const metaPath = safeArchiveRelativeName(metaEntry.path);
    if (!metaPath) {
        throw new Error("meta.json 路径非法");
    }

    try {
        const meta = JSON.parse(
            stripBom((await metaEntry.read()).toString("utf8")),
        ) as unknown;
        if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
            throw new Error("meta.json 必须是 JSON 对象");
        }
    } catch (error) {
        throwUnprcessable(
            `meta.json 解析失败: ${getErrorMessage(error)}`,
        );
    }

    const rootDir = entryDirName(metaPath);
    const rootName = rootDir
        ? posix.basename(rootDir.replace(/\/+$/, ""))
        : archiveBaseName(filePath);
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
        await extractArchive({
            archivePath: filePath,
            targetDir: tempDir,
            stripPrefix: rootDir,
        });

        if (!(await pathExists(join(tempDir, "meta.json")))) {
            throw new Error("归档解压后缺少 meta.json");
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