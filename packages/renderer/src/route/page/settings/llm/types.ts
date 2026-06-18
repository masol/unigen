import {
    IconCloud,
    IconDeviceDesktop,
    IconBolt,
    IconBrandOpenai,
    IconBrandGoogle,
    IconSparkles,
    IconMoodSmile,
    IconMessage,
    IconBrain,
    IconDatabase,
    IconArrowsSort,
    IconEye,
    IconMicrophone,
    IconVideo,
    IconFunction
} from "@tabler/icons-svelte";

export type { Model, ModelOption } from "@app/main/types"
import type { ModelAbility, ProviderProtocol, Provider } from "@app/main/types"
export type ProviderConfig = Omit<Provider, "models">

export type { ProviderProtocol, ModelAbility }
/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

export function getProviderIcon(provider: Provider): typeof IconCloud {
    const id = provider.id.toLowerCase();
    // const name = (provider.name ?? "").toLowerCase();
    const url = provider.baseUrl.toLowerCase();
    if (
        id.includes("openai") ||
        // name.includes("openai") ||
        url.includes("openai")
    )
        return IconBrandOpenai;
    if (
        id.includes("anthropic") ||
        // name.includes("anthropic") ||
        url.includes("anthropic")
    )
        return IconSparkles;
    if (
        id.includes("deepseek") ||
        // name.includes("deepseek") ||
        url.includes("deepseek")
    )
        return IconBolt;
    if (
        id.includes("google") ||
        // name.includes("google") ||
        id.includes("vertex") ||
        url.includes("googleapis")
    )
        return IconBrandGoogle;
    if (
        id.includes("huggingface") ||
        id.includes("hf")
    )
        return IconMoodSmile;
    if (
        id.includes("ollama") ||
        // name.includes("ollama") ||
        url.includes("localhost") ||
        url.includes("127.0.0.1")
    )
        return IconDeviceDesktop;
    return IconCloud;
}

/* ═══════════════════════════════════════════════════════════
   Label / Icon Maps
   ═══════════════════════════════════════════════════════════ */

export const abilityLabels: Record<ModelAbility, string> = {
    "text-generation": "文本",
    // : "代码",
    "reasoning": "推理",
    "embedding": "嵌入",
    "rerank": "重排",
    "vision": "图像",
    "audio": "音频",
    "func": "函数",
    "video": "视频",
};

export const abilityIcons: Record<ModelAbility, typeof IconMessage> = {
    "text-generation": IconMessage,
    // [ModelAbility.CodeGeneration]: IconCode,
    "reasoning": IconBrain,
    "embedding": IconDatabase,
    "rerank": IconArrowsSort,
    "vision": IconEye,
    "audio": IconMicrophone,
    "func": IconFunction,
    "video": IconVideo,
};

export const allAbilities: Record<string, ModelAbility> = {
    text: 'text-generation' as ModelAbility,
    reasoning: 'reasoning' as ModelAbility,
    embedding: 'embedding' as ModelAbility,
    rerank: 'rerank' as ModelAbility,
    vision: 'vision' as ModelAbility,
    audio: 'audio' as ModelAbility,
    func: 'func' as ModelAbility,
    video: 'video' as ModelAbility
};

export const protocolLabels: Record<ProviderProtocol, string> = {
    "openai": "OpenAI",
    "ollama": "Ollama",
    "anthropic": "Anthropic",
    "google-vertex": "Vertex AI",
    "huggingface": "HuggingFace",
};


export const allProtocols: Record<string, ProviderProtocol> = {
    openai: "openai" as ProviderProtocol,
    ollama: "ollama" as ProviderProtocol,
    anthropic: "anthropic" as ProviderProtocol,
    vertex: "google-vertex" as ProviderProtocol,
    huggingface: "huggingface" as ProviderProtocol
};

export function formatTokens(n: number): string {
    // 使用英美语系 (en-US) 保证输出 k, M, B
    return new Intl.NumberFormat('en-US', {
        notation: 'compact',      // 开启紧凑格式（k, M, B）
        compactDisplay: 'short',  // 简短模式：k, M，若为 long 则会显示 thousand, million
        maximumFractionDigits: 1  // 最多保留1位小数
    }).format(n);
}

export interface ProviderPreset {
    id: string;
    label: string;
    protocol: ProviderProtocol;
    baseUrl: string;
    website: string;
    maxconn: number;
    note: string;
}

export type KnownProvider = Array<{
    heading: string,
    presets: ProviderPreset[]
}>


/** 所有能力 / 模态 / 计费模式（用于渲染选择项） */
export const ALL_ABILITIES: ModelAbility[] = Object.values(allAbilities);
