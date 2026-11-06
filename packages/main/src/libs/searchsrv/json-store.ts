import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonFileStore<T> {
    constructor(
        private readonly file: string,
        private readonly fallback: T,
    ) { }

    async load(): Promise<T> {
        try {
            const raw = await readFile(this.file, "utf8");
            return JSON.parse(raw) as T;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === "ENOENT" || error instanceof SyntaxError) {
                return this.fallback;
            }
            throw error;
        }
    }

    async save(value: T): Promise<void> {
        await mkdir(dirname(this.file), { recursive: true });
        const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
        await rename(tmp, this.file);
    }
}