// packages/main/src/libs/loader/kb/service.ts
import { KcDirName } from "$libs/const.js";
import type { GlobalSearchDB } from "$libs/searchsrv/index.js";
import { openGlobalSearch } from "$libs/searchsrv/index.js";
import { throwPrecondition } from "$libs/utils/err.js";
import { dataCenter } from "$libs/utils/sys/data.js";
import { globalKbDir } from "$libs/utils/sys/dir.js";
import type {
    KbCollection,
    KbDoc,
    KbDocInput,
    KnowledgeBaseUpsertInput,
} from "$types/shared/api/kb.js";
import Logger from "electron-log/main.js";
import { copy, ensureDir, move, pathExists, remove } from "fs-extra";
import { randomUUID } from "node:crypto";
import { stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join } from "node:path";
import { safeInstallDirName } from "../zip.js";

const META_FILE = "meta.json";

interface KbMetaFile {
    name: string;
    desc: string;
    files: string[];
    disabled?: boolean;
}

function docKind(fileName: string): string {
    return extname(fileName).replace(/^\./, "").toLowerCase() || "file";
}

function resolveKnowledgeBaseDir(root: string, id: string): string {
    const trimmed = id.trim();

    if (
        !trimmed ||
        trimmed === "." ||
        trimmed === ".." ||
        /[\\/]/.test(trimmed)
    ) {
        throwPrecondition(`非法知识库 id: ${JSON.stringify(id)}`);
    }

    return join(root, trimmed);
}

async function resolveKnowledgeBaseId(
    inputId: string | undefined,
    name: string,
    root: string,
): Promise<string> {
    const raw = inputId?.trim();
    if (raw) {
        resolveKnowledgeBaseDir(root, raw);
        return raw;
    }

    const base = safeInstallDirName(name) || `kb-${randomUUID()}`;
    let candidate = base;

    for (let index = 1; await pathExists(join(root, candidate)); index++) {
        candidate = `${base}-${index}`;
    }

    return candidate;
}

/**
 * 解析知识库 id 对应的真实目录。
 *
 * catalog 不持久化 path，id 即目录名；真实目录按 data 优先、res 兜底
 * 解析。这与 syncSystemKC 的合并语义一致（同名时 data 覆盖 res）。
 *
 * 只用于把路径返回给客户端；不写入 catalog，避免出现“第二份 truth”。
 */
async function resolveKbDir(id: string): Promise<string> {
    const dataDir = join(globalKbDir(), id);
    if (await pathExists(dataDir)) return dataDir;

    return join(dataCenter.pathInRes(KcDirName), id);
}

async function prepareDocuments(
    docs: KbDocInput[],
    kbId: string,
    tempDir: string,
    finalDir: string,
): Promise<{ files: string[]; docs: KbDoc[] }> {
    const used = new Set<string>();
    const files: string[] = [];
    const out: KbDoc[] = [];

    for (const doc of docs) {
        const source = doc.path?.trim();
        if (!source) {
            throwPrecondition(
                `知识库文件缺少 path: ${doc.name || doc.id || ""}`,
            );
        }

        if (!isAbsolute(source)) {
            throwPrecondition(`知识库文件路径必须为绝对路径: ${source}`);
        }

        const info = await stat(source).catch(() => null);
        if (!info?.isFile()) {
            throwPrecondition(`知识库文件不存在或不是文件: ${source}`);
        }

        const fileName = basename(source);
        if (!fileName) {
            throwPrecondition(`无法解析知识库文件名: ${source}`);
        }

        let unique = fileName;
        let index = 1;
        while (used.has(unique)) {
            const ext = extname(fileName);
            const stem = ext ? fileName.slice(0, -ext.length) : fileName;
            unique = `${stem}-${index++}${ext}`;
        }

        used.add(unique);

        await copy(source, join(tempDir, unique), { overwrite: false });

        files.push(unique);
        out.push({
            id: doc.id?.trim() || `${kbId}:${unique}`,
            name: doc.name?.trim() || fileName,
            path: join(finalDir, unique),
            size: info.size,
            kind: doc.kind?.trim() || docKind(fileName),
            status: doc.status ?? "ready",
        });
    }

    return { files, docs: out };
}

async function listDocumentsFromSearch(
    db: GlobalSearchDB,
    kbId: string,
    kbDir: string,
): Promise<KbDoc[]> {
    const table = await db.kb.ensure(kbId);
    const rows = (await table
        .ensureTable()
        .query()
        .select([
            "id",
            "source",
            "title",
            "metadata",
            "created_at",
            "updated_at",
        ])
        .toArray()) as Array<Record<string, unknown>>;

    const bySource = new Map<string, KbDoc>();

    for (const row of rows) {
        const source = String(row.source ?? "").trim();
        if (!source || bySource.has(source)) continue;

        const name = basename(source);

        bySource.set(source, {
            id: `${kbId}:${source}`,
            name,
            path: join(kbDir, source),
            size: 0,
            kind: docKind(name),
            status: "ready",
        });
    }

    return Array.from(bySource.values()).sort(
        (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
}

/**
 * 获取全部知识库类别。
 *
 * 只从 searchsrv 的 kb_catalog 读取，不扫描目录；
 * docs 从对应 KbTable 的 chunk source 聚合得到，同样不读目录。
 *
 * path 不持久化：id 即目录名，返回时按 data→res 解析真实目录拼出。
 */
export async function listKnowledgeBases(): Promise<KbCollection[]> {
    const db = await openGlobalSearch();
    if (!db.opened) {
        throwPrecondition("[Kb] 全局检索库未就绪。");
    }

    const entries = await db.kb.listCatalogEntries();
    const collections: KbCollection[] = [];

    for (const entry of entries) {
        const kbDir = await resolveKbDir(entry.id);
        let docs: KbDoc[] = [];

        try {
            docs = await listDocumentsFromSearch(db, entry.id, kbDir);
        } catch (error) {
            Logger.warn(
                `[Kb] 读取知识库文档列表失败，已返回空 docs: ${entry.id}`,
                error,
            );
        }

        collections.push({
            id: entry.id,
            name: entry.name,
            description: entry.description,
            docs,
            updatedAt:
                typeof entry.updated_at === "string" && entry.updated_at
                    ? entry.updated_at
                    : new Date().toISOString(),
            path: kbDir,
        });
    }

    return collections;
}

/**
 * 新建或更新知识库。
 *
 * 语义为“全量替换”：
 *   1. 在临时目录按 docs[].path 拷贝文件；
 *   2. 写入 meta.json；
 *   3. 用临时目录替换目标目录；
 *   4. 只对该知识库做增量同步（重建该库 chunk 表 + upsert 目录单条）。
 *
 * 第 4 步刻意不走 syncSystemKC：单库变更不应触发 res/data 全量扫描与
 * 全表重建。跨进程持久化的 LanceDB 表与目录单条由 KbRegistry 增量维护。
 *
 * id 为空时按 name 生成安全目录名；重名追加序号。
 */
export async function upsertKnowledgeBase(
    input: KnowledgeBaseUpsertInput,
): Promise<KbCollection> {
    const name = input.name.trim();
    if (!name) {
        throwPrecondition("知识库名称不能为空。");
    }

    const description = input.description.trim();
    const root = globalKbDir();
    await ensureDir(root);

    const id = await resolveKnowledgeBaseId(input.id, name, root);
    const finalDir = resolveKnowledgeBaseDir(root, id);
    const tempDir = join(root, `.upsert-${randomUUID()}`);

    await ensureDir(tempDir);

    let backupDir: string | null = null;

    try {
        const prepared = await prepareDocuments(
            input.docs ?? [],
            id,
            tempDir,
            finalDir,
        );

        const meta: KbMetaFile = {
            name,
            desc: description,
            files: prepared.files,
        };

        // fs-extra 为 CJS 包，ESM 下其命名导出的静态推断不可靠
        // （writeJSON 常缺失）。这里直接用 node:fs/promises 写 JSON。
        await writeFile(
            join(tempDir, META_FILE),
            JSON.stringify(meta, null, 2),
            "utf8",
        );

        const existed = await pathExists(finalDir);
        if (existed) {
            backupDir = join(root, `.backup-${id}-${randomUUID()}`);
            await move(finalDir, backupDir, { overwrite: false });
        }

        try {
            await move(tempDir, finalDir, { overwrite: false });
        } catch (error) {
            if (backupDir) {
                await move(backupDir, finalDir, { overwrite: true }).catch(
                    () => undefined,
                );
            }
            throw error;
        }

        if (backupDir) {
            await remove(backupDir).catch((error) => {
                Logger.warn(`[Kb] 清理知识库备份失败: ${backupDir}`, error);
            });
        }

        const db = await openGlobalSearch();
        if (!db.opened) {
            throwPrecondition("[Kb] 全局检索库未就绪。");
        }

        // 单库增量：只读 finalDir、只重建该库表、只 upsert 目录单条。
        await db.kb.syncKnowledgeBaseFromDir(finalDir);

        return {
            id,
            name,
            description,
            docs: prepared.docs,
            updatedAt: new Date().toISOString(),
            path: finalDir,
        };
    } catch (error) {
        await remove(tempDir).catch(() => undefined);
        throw error;
    }
}

/**
 * 删除知识库：先删本地目录，再单库增量删除 searchsrv 表与目录条目。
 * 不触发任何全量扫描。
 */
export async function deleteKnowledgeBase(id: string): Promise<void> {
    const trimmed = id.trim();
    const root = globalKbDir();
    const targetDir = resolveKnowledgeBaseDir(root, trimmed);

    if (await pathExists(targetDir)) {
        await remove(targetDir);
    } else {
        Logger.warn(
            `[Kb] 知识库目录不存在，仅清理检索库: ${targetDir}`,
        );
    }

    const db = await openGlobalSearch();
    if (!db.opened) {
        throwPrecondition("[Kb] 全局检索库未就绪。");
    }

    await db.kb.removeKnowledgeBase(trimmed);
}