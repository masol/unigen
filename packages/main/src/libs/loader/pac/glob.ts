import fg, { type Entry, type Options } from "fast-glob";

function isEntry(value: unknown): value is Entry {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    if (!("path" in value) || !("name" in value)) {
        return false;
    }
    return typeof value.path === "string" && typeof value.name === "string";
}

function isEntryArray(value: unknown): value is Entry[] {
    return Array.isArray(value) && value.every(isEntry);
}

export async function globEntries(
    pattern: string,
    options: Options & { objectMode: true },
): Promise<Entry[]> {
    const result: unknown = await fg(pattern, options);
    if (!isEntryArray(result)) {
        throw new Error(
            "fast-glob 未返回 Entry[]，请检查 objectMode: true 选项是否生效",
        );
    }
    return result;
}

export function entryPath(entry: unknown): string {
    if (!isEntry(entry)) {
        throw new Error(
            "fast-glob 返回了非 Entry 结构，请检查 objectMode: true 选项",
        );
    }
    return entry.path;
}