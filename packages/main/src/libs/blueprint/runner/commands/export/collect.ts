import { PrjDB } from '$libs/project/controllers/drizzle/index.js';
import { BlueprintKind } from '$types/index.js';
import { ListItem } from '$types/shared/api/list.js';
import path from 'path';
import type { ExportFlags, WriteJob } from './types.js';

const PAGE_SIZE = 200;

function listAll(prjdb: PrjDB, kind: BlueprintKind): ListItem[] {
    const items: ListItem[] = [];
    let pageIndex = 0;
    for (; ;) {
        const res = prjdb.list({ kind, pageIndex, pageSize: PAGE_SIZE });
        items.push(...res.items);
        if (items.length >= res.total || res.items.length === 0) break;
        pageIndex += 1;
    }
    return items;
}

export function collectJobs(
    prjdb: PrjDB,
    targetPath: string,
    flags: ExportFlags,
): WriteJob[] {
    const jobs: WriteJob[] = [];

    if (!flags.noMetag) {
        for (const item of listAll(prjdb, 'metag')) {
            const id = item.name;
            jobs.push({
                kind: 'metag',
                filePath: path.join(targetPath, 'metag', `${id}.mg`),
                load: () => prjdb.getContent({ kind: 'metag', id, content: false }),
            });
        }
    }

    if (!flags.noCap) {
        for (const item of listAll(prjdb, 'capa')) {
            const id = item.name;
            jobs.push({
                kind: 'capa',
                filePath: path.join(targetPath, 'capa', `${id}.capa`),
                load: () => prjdb.getContent({ kind: 'capa', id, content: false }),
                codePath: path.join(targetPath, 'capa', `${id}.code`),
                loadCode: () => prjdb.getContent({ kind: 'capa', id, content: true }),
            });
        }
    }

    if (!flags.noEntry || !flags.noRes) {
        for (const item of listAll(prjdb, 'glossary')) {
            const id = item.name;
            const isRes = id.startsWith('_');
            const isEntry = id.startsWith('entry_');

            if (isEntry && !flags.noEntry) {
                jobs.push({
                    kind: 'entry',
                    filePath: path.join(targetPath, 'entry', `${id}.kv`),
                    load: () => prjdb.getContent({ kind: 'glossary', id, content: true }),
                });
            } else if (isRes && !flags.noRes) {
                jobs.push({
                    kind: 'res',
                    filePath: path.join(targetPath, 'res', `${id}.kv`),
                    load: () => prjdb.getContent({ kind: 'glossary', id, content: true }),
                });
            }
        }
    }

    return jobs;
}