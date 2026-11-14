// packages/renderer/src/lib/store/local/model-config.store.svelte.ts
import type { SectionId } from '$lib/components/leftside/model-config/model-config.types';
import { safeApi } from '$lib/utils/api';
import { hooks } from "$lib/utils/hook";
import type { ReasoningLevel } from '@app/main/types';
import type { ResolvedSettings } from '../../../../../main/src/types/blueprint/settings';

const KeyName = "chat_settings";
const SAVE_DEBOUNCE_MS = 500;

const REASONING_LEVELS: readonly ReasoningLevel[] = [
    'provider-default',
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function asPositiveInt(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
        ? value
        : null;
}

function asNonNegativeNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : null;
}

function asReasoningLevel(value: unknown): ReasoningLevel | null {
    return typeof value === 'string' &&
        REASONING_LEVELS.includes(value as ReasoningLevel)
        ? (value as ReasoningLevel)
        : null;
}

/**
 * 读取历史消息配置。
 * 语义对齐 ResolvedSettingsSchema.history：
 *   -1   → 全部历史
 *    0   → 禁用
 *    N>0 → 最近 N 条
 * 其它值（含 null / 非整数 / <-1）视为“未覆盖”。
 */
function readHistoryValue(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= -1
        ? value
        : null;
}

function readUserSelModel(value: unknown): {
    enabled: boolean;
    default: string;
    map: Record<string, string>;
} {
    if (typeof value === 'string') {
        return { enabled: value.length > 0, default: value, map: {} };
    }

    if (isRecord(value)) {
        const map: Record<string, string> = {};
        let defaultModel = '';

        for (const [key, entry] of Object.entries(value)) {
            if (typeof entry !== 'string' || !entry) continue;

            if (key === 'default') {
                defaultModel = entry;
            } else {
                map[key] = entry;
            }
        }

        return {
            enabled: defaultModel.length > 0 || Object.keys(map).length > 0,
            default: defaultModel,
            map,
        };
    }

    return { enabled: false, default: '', map: {} };
}

function readTimeoutTotalMs(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
    }

    if (
        isRecord(value) &&
        typeof value.totalMs === 'number' &&
        Number.isFinite(value.totalMs) &&
        value.totalMs > 0
    ) {
        return value.totalMs;
    }

    return null;
}

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * ModelConfigStore
 *
 * 左侧栏「模型请求设置」面板的唯一真源。
 * - 所有字段均为 $state；payload / overrideCount 为派生。
 * - overrideCount 统计“覆盖意图”，与 UI 开关状态一一对应。
 * - payload 只包含有值的覆盖项；打开了覆盖但未填值时不会发送空值。
 */
class ModelConfigStore {
    /* ── 基础 ── */
    maxSteps = $state<number | null>(null);
    streaming = $state<boolean | null>(null);
    reasoning = $state<ReasoningLevel | null>(null);

    /* ── 历史消息（-1 全部 / 0 禁用 / N>0 最近 N 条） ── */
    history = $state<number | null>(null);

    /* ── 模型选择 ── */
    userSelModelEnabled = $state(false);
    userSelModelDefault = $state('');
    userSelModelMap = $state<Record<string, string>>({});
    requireModelEntries = $state<string[]>([]);

    /* ── 采样与输出 ── */
    temperature = $state<number | null>(null);
    maxOutputTokens = $state<number | null>(null);

    /* ── 工具与超时 ── */
    toolCallConcurrency = $state<number | null>(null);
    strict = $state<boolean | null>(null);
    timeoutTotalMs = $state<number | null>(null);

    /* ── 异步状态 ── */
    isLoading = $state(true);
    isSaving = $state(false);
    saveError = $state<string | null>(null);
    lastSavedAt = $state<number | null>(null);

    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private lastSavedPayload = '';

    constructor() {
        hooks.hook("project:loaded", async () => {
            // 先加载 requireModel 列表，再读取设置，避免 payload 在两者之间抖动。
            await this.loadRequire();
            await this.loadSettings();
        });
    }

    private async loadRequire() {
        this.requireModelEntries = [
            // '负责长篇内容创作与改写的写作 Agent（writer）',
            // '负责事实核查与质量审查的审查 Agent（reviewer）',
            // '负责多步骤任务拆解的规划 Agent（planner）',
        ];
    }

    private async loadSettings() {
        this.isLoading = true;
        this.saveError = null;

        let loaded = false;

        try {
            const raw: unknown = await safeApi().project.get(KeyName);
            const setting = isRecord(raw) ? raw : {};

            this.resetAll();

            this.maxSteps = asPositiveInt(setting.maxSteps);
            this.streaming = asBoolean(setting.streaming);
            this.reasoning = asReasoningLevel(setting.reasoning);
            this.history = readHistoryValue(setting.history);

            const model = readUserSelModel(setting.userSelModel);
            this.userSelModelEnabled = model.enabled;
            this.userSelModelDefault = model.default;
            this.userSelModelMap = model.map;

            this.temperature = asNonNegativeNumber(setting.temperature);
            this.maxOutputTokens = asPositiveInt(setting.maxOutputTokens);
            this.toolCallConcurrency = asPositiveInt(
                setting.toolCallConcurrency,
            );
            this.strict = asBoolean(setting.strict);
            this.timeoutTotalMs = readTimeoutTotalMs(setting.timeout);

            this.lastSavedPayload = JSON.stringify(this.payload);
            loaded = true;
        } catch (error) {
            this.saveError = toErrorMessage(error);
        } finally {
            // 加载失败时不要让初始默认值触发一次覆盖保存。
            if (!loaded) {
                this.lastSavedPayload = JSON.stringify(this.payload);
            }

            this.isLoading = false;
        }
    }

    private async saveSettings() {
        if (this.isLoading) return;

        const payload = this.payload as Partial<ResolvedSettings>;
        const serialized = JSON.stringify(payload);

        if (serialized === this.lastSavedPayload) return;

        this.isSaving = true;
        this.saveError = null;

        let saved = false;

        try {
            await safeApi().project.set({
                key: KeyName,
                value: payload,
            });

            this.lastSavedPayload = serialized;
            this.lastSavedAt = Date.now();
            saved = true;
        } catch (error) {
            this.saveError = toErrorMessage(error);
        } finally {
            this.isSaving = false;

            // 保存期间如果又发生变化，成功后再补一次保存；失败则不自动重试。
            if (
                saved &&
                JSON.stringify(this.payload) !== this.lastSavedPayload
            ) {
                this.scheduleSave();
            }
        }
    }

    scheduleSave(delayMs = SAVE_DEBOUNCE_MS): void {
        if (this.isLoading) return;

        if (this.saveTimer) clearTimeout(this.saveTimer);

        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            void this.saveSettings();
        }, delayMs);
    }

    /* ── 覆盖计数：与 UI 开关状态同源，按分组汇总 ── */
    readonly overrideCountBySection: Record<SectionId, number> = $derived({
        model:
            (this.userSelModelEnabled ? 1 : 0) +
            (this.reasoning !== null ? 1 : 0),
        basic:
            (this.maxSteps !== null ? 1 : 0) +
            (this.streaming !== null ? 1 : 0) +
            (this.history !== null ? 1 : 0),
        sampling:
            (this.temperature !== null ? 1 : 0) +
            (this.maxOutputTokens !== null ? 1 : 0),
        tools:
            (this.toolCallConcurrency !== null ? 1 : 0) +
            (this.strict !== null ? 1 : 0) +
            (this.timeoutTotalMs !== null ? 1 : 0),
    });

    readonly overrideCount = $derived(
        Object.values(this.overrideCountBySection).reduce((a, b) => a + b, 0),
    );

    readonly isDirty = $derived(this.overrideCount > 0);

    /* ── 载荷组装：只发送有值的覆盖项 ── */
    readonly payload = $derived.by((): Record<string, unknown> => {
        const s: Record<string, unknown> = {};
        if (this.maxSteps !== null) s.maxSteps = this.maxSteps;
        if (this.streaming !== null) s.streaming = this.streaming;
        if (this.reasoning !== null) s.reasoning = this.reasoning;
        if (this.history !== null) s.history = this.history;

        if (this.userSelModelEnabled) {
            const defaultModel = this.userSelModelDefault.trim();
            const map = Object.fromEntries(
                Object.entries(this.userSelModelMap).filter(([, v]) => v),
            );

            if (this.requireModelEntries.length === 0) {
                if (defaultModel) s.userSelModel = defaultModel;
            } else {
                const modelPayload: Record<string, string> = { ...map };

                if (defaultModel) {
                    modelPayload.default = defaultModel;
                }

                if (Object.keys(modelPayload).length > 0) {
                    s.userSelModel = modelPayload;
                }
            }
        }

        if (this.temperature !== null) s.temperature = this.temperature;
        if (this.maxOutputTokens !== null)
            s.maxOutputTokens = this.maxOutputTokens;
        if (this.toolCallConcurrency !== null)
            s.toolCallConcurrency = this.toolCallConcurrency;
        if (this.strict !== null) s.strict = this.strict;
        if (this.timeoutTotalMs !== null)
            s.timeout = { totalMs: this.timeoutTotalMs };

        return s;
    });

    resetAll(): void {
        this.maxSteps = null;
        this.streaming = null;
        this.reasoning = null;
        this.history = null;
        this.userSelModelEnabled = false;
        this.userSelModelDefault = '';
        this.userSelModelMap = {};
        this.temperature = null;
        this.maxOutputTokens = null;
        this.toolCallConcurrency = null;
        this.strict = null;
        this.timeoutTotalMs = null;
    }
}

const KEY = Symbol.for('unigen.renderer.modelConfigStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const modelConfigStore: ModelConfigStore = ((globalThis as any)[KEY] ??=
    new ModelConfigStore());