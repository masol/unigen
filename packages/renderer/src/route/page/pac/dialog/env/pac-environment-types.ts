export const REASONING_OPTIONS = [
    { value: "provider-default", label: "自动（Provider 默认）" },
    { value: "none", label: "关闭推理" },
    { value: "minimal", label: "极简推理" },
    { value: "low", label: "快速推理" },
    { value: "medium", label: "平衡推理" },
    { value: "high", label: "深度推理" },
    { value: "xhigh", label: "极限推理" },
    { value: "max", label: "最大推理" },
] as const;

export type ReasoningOption = (typeof REASONING_OPTIONS)[number]["value"];

export type TriState = "unset" | "true" | "false";

export const TRI_STATE_OPTIONS = [
    { value: "unset", label: "未设置", icon: "○", tone: "muted" },
    { value: "true", label: "开启", icon: "✓", tone: "positive" },
    { value: "false", label: "关闭", icon: "✕", tone: "negative" },
] as const;

export interface PacEnvironmentForm {
    requireModel: string;
    maxSteps: string;
    streaming: TriState;
    reasoning: ReasoningOption;
    persist: TriState;
    historyText: string;
    temperature: string;
    maxOutputTokens: string;
    toolCallConcurrency: string;
    strict: TriState;
}