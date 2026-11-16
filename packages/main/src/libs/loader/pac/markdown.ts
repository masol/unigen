import { throwUnprcessable } from "$libs/utils/err.js";
import matter from "@11ty/gray-matter";

function stripBom(value: string): string {
    return value.length > 0 && value.charCodeAt(0) === 0xfeff
        ? value.slice(1)
        : value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

export function toJsonObject(value: unknown): Record<string, unknown> {
    if (value === undefined) {
        return {};
    }

    if (!isPlainObject(value)) {
        throwUnprcessable("front-matter 必须是 JSON 对象");
    }

    let jsonText: string;
    try {
        jsonText = JSON.stringify(value, (_key, item) => {
            if (item === undefined) {
                throwUnprcessable("front-matter 不支持 undefined");
            }
            if (
                typeof item === "function" ||
                typeof item === "symbol" ||
                typeof item === "bigint"
            ) {
                throwUnprcessable("front-matter 必须是可 JSON 序列化的对象");
            }
            if (typeof item === "number" && !Number.isFinite(item)) {
                throwUnprcessable("front-matter 不支持 NaN / Infinity");
            }
            return item;
        });
    } catch (err) {
        if (err instanceof Error) throw err;
        throwUnprcessable("front-matter 不是合法 JSON");
    }

    const parsed = JSON.parse(jsonText) as unknown;
    if (!isPlainObject(parsed)) {
        throwUnprcessable("front-matter 必须是 JSON 对象");
    }

    return parsed;
}

export function parsePacMarkdown(raw: string): {
    meta: Record<string, unknown>;
    content: string;
} {
    const parsed = matter(stripBom(raw));
    return {
        meta: toJsonObject(parsed.data),
        content: parsed.content,
    };
}

export function stringifyPacMarkdown(
    meta: Record<string, unknown>,
    content: string,
): string {
    if (typeof content !== "string") {
        throwUnprcessable("content 必须是字符串");
    }
    return matter.stringify(content, toJsonObject(meta));
}