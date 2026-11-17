import type { PacFrontMatter } from "@app/main/types";

/**
 * 元信息对话框共享的数据契约。
 *
 * 仅包含所有对话框共享的 props 形状与值读取/构建工具；
 * 各对话框的 UI 与表单状态各自实现，互不复用。
 */
export interface PacMetaDialogCommonProps {
    value: Partial<PacFrontMatter>;
    onClose?: (result: Partial<PacFrontMatter>) => void;
    onCancel?: () => void;
}

export type JsonParseResult =
    | { ok: true; value: unknown }
    | { ok: false; error: string };

export function readString(
    meta: Partial<PacFrontMatter>,
    key: keyof PacFrontMatter,
): string {
    const value = meta[key];
    return typeof value === "string" ? value : "";
}

export function readStringArray(
    meta: Partial<PacFrontMatter>,
    key: keyof PacFrontMatter,
): string[] {
    const value = meta[key];
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string");
}

export function readBoolean(
    meta: Partial<PacFrontMatter>,
    key: keyof PacFrontMatter,
    fallback: boolean,
): boolean {
    const value = meta[key];
    return typeof value === "boolean" ? value : fallback;
}

export function readNumberText(
    meta: Partial<PacFrontMatter>,
    key: keyof PacFrontMatter,
): string {
    const value = meta[key];
    return typeof value === "number" ? String(value) : "";
}

export function readJsonText(
    meta: Partial<PacFrontMatter>,
    key: keyof PacFrontMatter,
): string {
    const value = meta[key];
    if (value === undefined) return "";
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return "";
    }
}

export function parseJson(text: string): JsonParseResult {
    const trimmed = text.trim();
    if (!trimmed) return { ok: true, value: undefined };
    try {
        return { ok: true, value: JSON.parse(trimmed) };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : "JSON 解析失败",
        };
    }
}

/**
 * 构建字符串字段 patch。
 *
 * - 原值不存在且输入为空：返回 undefined（mergePacMeta 跳过，不新增字段）；
 * - 其余情况返回输入值，允许把已有字段改为空串。
 */
export function buildStringPatch(
    original: unknown,
    next: string,
): string | undefined {
    if (typeof original !== "string" && next === "") return undefined;
    return next;
}

/**
 * 构建字符串数组字段 patch。
 *
 * - 原值不存在且输入为空：返回 undefined（不新增字段）；
 * - 其余情况返回数组（含空数组，允许清空已有字段）。
 */
export function buildStringArrayPatch(
    original: unknown,
    next: string[],
): string[] | undefined {
    if (!Array.isArray(original) && next.length === 0) return undefined;
    return next;
}

/**
 * 构建任意数组字段 patch（如 tools）。语义同 buildStringArrayPatch。
 */
export function buildArrayPatch(
    original: unknown,
    next: unknown[],
): unknown[] | undefined {
    if (!Array.isArray(original) && next.length === 0) return undefined;
    return next;
}

/**
 * 构建 JSON 值字段 patch（inputs / setDefault / model / timeout）。
 *
 * 空输入返回 undefined：原值存在时不会删除字段（mergePacMeta 跳过 undefined），
 * 各对话框 UI 会以提示说明可用 `{}` 表达空对象。
 */
export function buildJsonPatch(
    original: unknown,
    next: unknown,
): unknown | undefined {
    if (next === undefined && original === undefined) return undefined;
    return next;
}

/**
 * 构建数字字段 patch。空输入返回 undefined（不修改）。
 * 非法数字应在调用方先行校验。
 */
export function buildNumberPatch(
    original: unknown,
    text: string,
): number | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return undefined;
    return parsed;
}

/**
 * 构建布尔字段 patch。
 *
 * 原值不存在且用户保持默认值时跳过，避免把默认值显式写入文件。
 */
export function buildBooleanPatch(
    original: unknown,
    next: boolean,
    defaultValue: boolean,
): boolean | undefined {
    if (original === undefined && next === defaultValue) return undefined;
    return next;
}

/** 将多行文本解析为去空的字符串数组。 */
export function parseLines(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}