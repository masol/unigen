import fsExtra from 'fs-extra';
import { writeFile } from 'fs/promises';
import type { WriteJob } from './types.js';

export interface WriteResult {
    filePath: string;
    codePath?: string;
}

export async function runJob(job: WriteJob): Promise<WriteResult> {
    await fsExtra.ensureDir(dirOf(job.filePath));
    await writeFile(job.filePath, job.load(), 'utf8');

    const result: WriteResult = { filePath: job.filePath };

    if (job.codePath && job.loadCode) {
        const code = job.loadCode();
        if (code !== '') {
            await writeFile(job.codePath, code, 'utf8');
            result.codePath = job.codePath;
        }
    }

    return result;
}

function dirOf(filePath: string): string {
    const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return idx === -1 ? '.' : filePath.slice(0, idx);
}