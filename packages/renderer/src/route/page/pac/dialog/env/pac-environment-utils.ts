import type { PacFrontMatter } from "@app/main/types";

import {
    buildNumberPatch,
    buildStringPatch,
    readNumberText,
    readString,
} from "../pac-meta-dialog-utils";
import {
    REASONING_OPTIONS,
    type PacEnvironmentForm,
    type ReasoningOption,
    type TriState,
} from "./pac-environment-types";

function readTriState(
    value: PacFrontMatter,
    key: "streaming" | "persist" | "strict",
): TriState {
    const current = value[key];
    return typeof current === "boolean" ? (current ? "true" : "false") : "unset";
}

function readReasoning(value: PacFrontMatter): ReasoningOption {
    const current = value.reasoning;
    return REASONING_OPTIONS.some((option) => option.value === current)
        ? (current as ReasoningOption)
        : "provider-default";
}

function readHistoryText(value: PacFrontMatter): string {
    if (value.history === null) return "-1";
    if (typeof value.history === "number") return String(value.history);
    return "";
}

function toText(value: unknown): string {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return "";
    return String(value);
}

function toTrimmedText(value: unknown): string {
    return toText(value).trim();
}

export function createInitialEnvironmentForm(
    value: PacFrontMatter,
): PacEnvironmentForm {
    return {
        requireModel: readString(value, "requireModel"),
        maxSteps: readNumberText(value, "maxSteps"),
        streaming: readTriState(value, "streaming"),
        reasoning: readReasoning(value),
        persist: readTriState(value, "persist"),
        historyText: readHistoryText(value),
        temperature: readNumberText(value, "temperature"),
        maxOutputTokens: readNumberText(value, "maxOutputTokens"),
        toolCallConcurrency: readNumberText(value, "toolCallConcurrency"),
        strict: readTriState(value, "strict"),
    };
}

function normalizeForm(form: PacEnvironmentForm): PacEnvironmentForm {
    return {
        ...form,
        requireModel: toText(form.requireModel),
        maxSteps: toText(form.maxSteps),
        historyText: toText(form.historyText),
        temperature: toText(form.temperature),
        maxOutputTokens: toText(form.maxOutputTokens),
        toolCallConcurrency: toText(form.toolCallConcurrency),
    };
}

export function hasEnvironmentChanges(
    initial: PacEnvironmentForm,
    form: PacEnvironmentForm,
): boolean {
    const normalized = normalizeForm(form);
    return (Object.keys(initial) as Array<keyof PacEnvironmentForm>).some(
        (key) => initial[key] !== normalized[key],
    );
}

function parseTriState(value: TriState): boolean | undefined {
    return value === "unset" ? undefined : value === "true";
}

function parseHistory(
    text: unknown,
):
    | { ok: true; value: number | null | undefined }
    | { ok: false; error: string } {
    const trimmed = toTrimmedText(text);
    if (!trimmed) return { ok: true, value: undefined };

    const count = Number(trimmed);
    if (!Number.isFinite(count) || !Number.isInteger(count) || count < -1) {
        return {
            ok: false,
            error: "历史条数必须是 -1、0 或正整数。",
        };
    }

    return { ok: true, value: count === -1 ? null : count };
}

export function buildEnvironmentPatch(
    initial: PacEnvironmentForm,
    value: PacFrontMatter,
    form: PacEnvironmentForm,
):
    | { ok: true; patch: Partial<PacFrontMatter> }
    | { ok: false; error: string } {
    const normalized = normalizeForm(form);

    const numberFields = [
        { label: "最大步数 maxSteps", text: normalized.maxSteps },
        { label: "采样温度 temperature", text: normalized.temperature },
        { label: "输出 token 上限 maxOutputTokens", text: normalized.maxOutputTokens },
        { label: "工具并发上限 toolCallConcurrency", text: normalized.toolCallConcurrency },
    ];

    for (const field of numberFields) {
        const trimmed = toTrimmedText(field.text);
        if (trimmed && !Number.isFinite(Number(trimmed))) {
            return { ok: false, error: `${field.label} 必须是数字。` };
        }
    }

    const history = parseHistory(normalized.historyText);
    if (!history.ok) return history;

    const patch: Partial<PacFrontMatter> = {};

    if (initial.requireModel !== normalized.requireModel) {
        patch.requireModel = buildStringPatch(
            value.requireModel,
            normalized.requireModel,
        );
    }

    if (initial.maxSteps !== normalized.maxSteps) {
        patch.maxSteps = buildNumberPatch(value.maxSteps, normalized.maxSteps);
    }

    if (initial.streaming !== normalized.streaming) {
        patch.streaming = parseTriState(normalized.streaming);
    }

    if (initial.reasoning !== normalized.reasoning) {
        patch.reasoning = normalized.reasoning;
    }

    if (initial.persist !== normalized.persist) {
        patch.persist = parseTriState(normalized.persist);
    }

    if (initial.historyText !== normalized.historyText) {
        patch.history = history.value;
    }

    if (initial.temperature !== normalized.temperature) {
        patch.temperature = buildNumberPatch(
            value.temperature,
            normalized.temperature,
        );
    }

    if (initial.maxOutputTokens !== normalized.maxOutputTokens) {
        patch.maxOutputTokens = buildNumberPatch(
            value.maxOutputTokens,
            normalized.maxOutputTokens,
        );
    }

    if (initial.toolCallConcurrency !== normalized.toolCallConcurrency) {
        patch.toolCallConcurrency = buildNumberPatch(
            value.toolCallConcurrency,
            normalized.toolCallConcurrency,
        );
    }

    if (initial.strict !== normalized.strict) {
        patch.strict = parseTriState(normalized.strict);
    }

    return { ok: true, patch };
}