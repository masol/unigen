import type { ModelTags, Provider, ProviderProtocol } from "@app/main/types";
import {
    IconArrowsSort,
    IconBolt,
    IconBrain,
    IconBrandGoogle,
    IconBrandOpenai,
    IconCirclePlus,
    IconCloud,
    IconCpu,
    IconDatabase,
    IconDeviceDesktop,
    IconDiamond,
    IconEye,
    IconJson,
    IconMessage,
    IconMicrophone,
    IconMoodSmile,
    IconPhoto,
    IconSparkles,
    IconTool,
    IconVideo,
    IconWorld
} from "@tabler/icons-svelte";

export type { Model, ModelOption } from "@app/main/types";
export type ProviderConfig = Omit<Provider, "models">

export type { ModelTags as ModelAbility, ProviderProtocol };
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

export const tagLabels: Record<ModelTags, string> = {
    // 功能标签。
    "text-generation": "文本",
    "image-generation": "绘图",
    "embedding": "嵌入",
    "rerank": "重排",
    //版本:
    "ultra": "旗舰版",
    "plus": "专业版",
    "flash": "轻量版",
    "micro": "端侧版",
    // 输入/输出能力
    "search": "联网",
    "reasoning": "思考",
    "vision": "图像",
    "audio": "音频",
    "tool": "工具",
    "video": "视频",
    "outline": "格式",
};

export const tagIcons: Record<ModelTags, typeof IconMessage> = {
    // 功能标签
    "text-generation": IconMessage,
    "image-generation": IconPhoto,
    "embedding": IconDatabase,
    "rerank": IconArrowsSort,

    // 版本 (新增补齐)
    "ultra": IconDiamond,
    "plus": IconCirclePlus,
    "flash": IconBolt,
    "micro": IconCpu,

    // 输入/输出能力
    "search": IconWorld,      // 新增补齐
    "reasoning": IconBrain,
    "vision": IconEye,
    "audio": IconMicrophone,
    "tool": IconTool,
    "video": IconVideo,
    "outline": IconJson,
};

// 1. 功能与核心任务标签
export const FUNCTION_TAGS: Record<string, ModelTags> = {
    text: 'text-generation' as ModelTags,
    image: 'image-generation' as ModelTags,
    embedding: 'embedding' as ModelTags,
    rerank: 'rerank' as ModelTags,
};

export const VERSION_TAGS: Record<string, ModelTags> = {
    // 版本划分
    ultra: 'ultra' as ModelTags,
    plus: 'plus' as ModelTags,
    flash: 'flash' as ModelTags,
    micro: 'micro' as ModelTags,
}

// 2. 版本、输入输出及附加能力标签
export const CAPABILITY_TAGS: Record<string, ModelTags> = {

    // 输入/输出与核心能力
    search: 'search' as ModelTags,
    reasoning: 'reasoning' as ModelTags,
    vision: 'vision' as ModelTags,
    audio: 'audio' as ModelTags,
    tool: 'tool' as ModelTags,
    video: 'video' as ModelTags,
    outline: 'outline' as ModelTags,
};

export const protocolLabels: Record<ProviderProtocol, string> = {
    "openai-compatible": "OpenAI兼容",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google-vertex": "Google AI",
    "xai": "xai",
    "ollama": "Ollama",
    "huggingface": "HusggingFace",
    "deepseek": "Deepseek",
};


export const allProtocols: Record<string, ProviderProtocol> = {
    openaiCompatible: "openai-compatible" as ProviderProtocol,
    openai: "openai" as ProviderProtocol,
    anthropic: "anthropic" as ProviderProtocol,
    vertex: "google-vertex" as ProviderProtocol,
    xai: "xai" as ProviderProtocol,
    ollama: "ollama" as ProviderProtocol,
    huggingface: "huggingface" as ProviderProtocol,
    deepseek: "deepseek" as ProviderProtocol
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


/** 所有能力 / 模态 / 计费模式（组合两个变量，用于渲染选择项） */
export const ALL_ABILITIES: ModelTags[] = [
    ...Object.values(FUNCTION_TAGS),
    ...Object.values(VERSION_TAGS),
    ...Object.values(CAPABILITY_TAGS),
];