// tree.ts
import type { PacNode } from "$types/shared/api/pac.js";
import fs from "node:fs/promises";
import path from "node:path";
import { GLOB_IGNORE, MD_EXT } from "./constants.js";
import { entryPath, globEntries } from "./glob.js";
import {
    dirnameRel,
    normalizeGlobPath,
    resolveRootAbs,
    toApiPath,
} from "./paths.js";

function sortPacNode(node: PacNode): void {
    if (!node.children) return;

    node.children.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === "folder" ? -1 : 1;
        }
        return a.name.localeCompare(b.name, "zh-Hans-CN", {
            numeric: true,
            sensitivity: "base",
        });
    });

    for (const child of node.children) {
        sortPacNode(child);
    }
}

function createEmptyRoot(rootAbs: string): PacNode {
    return {
        id: "root",
        name: path.basename(rootAbs) || "pac",
        type: "folder",
        path: "/",
        children: [],
    };
}

export async function listPacTree(root: string): Promise<PacNode> {
    const rootAbs = resolveRootAbs(root);

    try {
        const rootStat = await fs.stat(rootAbs);
        if (!rootStat.isDirectory()) {
            return createEmptyRoot(rootAbs);
        }
    } catch (_err) {
        return createEmptyRoot(rootAbs);
    }

    const rootNode = createEmptyRoot(rootAbs);
    const folders = new Map<string, PacNode>([["", rootNode]]);

    const ensureFolder = (rel: string): PacNode => {
        if (!rel) return rootNode;

        const existed = folders.get(rel);
        if (existed) return existed;

        const parentRel = dirnameRel(rel);
        const parent = ensureFolder(parentRel);
        const node: PacNode = {
            id: toApiPath(rel),
            name: path.posix.basename(rel),
            type: "folder",
            path: toApiPath(rel),
            children: [],
        };

        parent.children!.push(node);
        folders.set(rel, node);
        return node;
    };

    const [fileEntries, dirEntries] = await Promise.all([
        globEntries("**/*.md", {
            cwd: rootAbs,
            onlyFiles: true,
            objectMode: true,
            stats: true,
            dot: false,
            followSymbolicLinks: false,
            ignore: GLOB_IGNORE,
            suppressErrors: true,
        }),
        globEntries("**/*", {
            cwd: rootAbs,
            onlyDirectories: true,
            objectMode: true,
            dot: false,
            followSymbolicLinks: false,
            ignore: GLOB_IGNORE,
            suppressErrors: true,
        }),
    ]);

    for (const entry of dirEntries) {
        const rel = normalizeGlobPath(entryPath(entry));
        if (rel) ensureFolder(rel);
    }

    for (const entry of fileEntries) {
        const rel = normalizeGlobPath(entryPath(entry));
        if (!rel.endsWith(MD_EXT)) continue;

        const parent = ensureFolder(dirnameRel(rel));
        parent.children!.push({
            id: toApiPath(rel),
            name: path.posix.basename(rel),
            type: "file",
            path: toApiPath(rel),
            updatedAt: entry.stats?.mtimeMs,
        });
    }

    sortPacNode(rootNode);

    return rootNode;
}