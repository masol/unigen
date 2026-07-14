
export enum ModelTags {
    // —— 类别 ——
    Embedding = 'embedding',
    Rerank = 'rerank',
    TextGeneration = 'text-generation',
    ImageGeneration = 'image-generation',
    MT = 'mt',               // 机器翻译。

    // —— 版本区别 ——
    Ultra = 'ultra',   // 旗舰版
    Plus = 'plus',     // 专业版
    Flash = 'flash',   // 轻量版
    Micro = 'micro',   // 端侧版

    // —— 输入/输出能力 ——
    Search = 'search',       // 联网搜索
    Reasoning = 'reasoning', // 思考模式
    Vision = 'vision',       // 视觉理解
    Video = 'video',         // 视频理解
    Tool = 'tool',           // 函数调用
    Audio = 'audio',         // 语音理解
    Outline = 'outline',     // 支持 Constrained Decoding（约束解码 / 结构化输出）
    Math = 'math',           // 数学推理优化。
    Code = 'code',           // 代码生成优化。
}
const T = ModelTags;

// 常用能力组合
const CHAT = [T.TextGeneration, T.Tool];
const CHAT_V = [T.TextGeneration, T.Tool, T.Vision];
const REASON = [T.TextGeneration, T.Tool, T.Reasoning];
const REASON_V = [T.TextGeneration, T.Tool, T.Reasoning, T.Vision];
const OMNI = [T.TextGeneration, T.Tool, T.Vision, T.Audio];
const OMNI_R = [T.TextGeneration, T.Tool, T.Vision, T.Audio, T.Reasoning];
const OMNI_FULL = [T.TextGeneration, T.Tool, T.Vision, T.Audio, T.Video];
// 代码 / 数学专精：默认自带深度思考（Reasoning）
const CODE = [T.TextGeneration, T.Tool, T.Reasoning, T.Code];
const MATH = [T.TextGeneration, T.Tool, T.Reasoning, T.Math];

interface BaseSpec {
    match: string;          // baseName 包含此子串即命中（小写）
    abilities: ModelTags[];
    inctx?: number;
    outctx?: number;
    score?: number;
}


// ============================================================================
// 常用上下文/输出档位常量（2026 H2：普遍进入 256K~1M+ 时代）
// ============================================================================

export const CTX = {
    K8: 8_192,
    K16: 16_384,
    K32: 32_768,
    K64: 65_536,
    K128: 131_072,
    K200: 200_000,
    K256: 262_144,
    K512: 524_288,
    M1: 1_000_000,
    M1_ACTUAL: 1_048_576, // 2^20，部分厂商真实值
    M2: 2_097_152,
    M10: 10_000_000,
} as const;

export const OUT = {
    K4: 4_096,
    K8: 8_192,
    K16: 16_384,
    K32: 32_768,
    K64: 65_536,
    K100: 100_000,
    K128: 131_072, // 长推理模型可达
} as const;

// 顺序敏感：更具体的放前面
export const BASE_MODELS: BaseSpec[] = [
    // ===== OpenAI =====
    { match: 'gpt-5-mini', abilities: [...OMNI_R, T.Flash], inctx: CTX.K256, outctx: OUT.K128, score: 88 },
    { match: 'gpt-5-nano', abilities: [...OMNI_R, T.Micro], inctx: CTX.K256, outctx: OUT.K128, score: 82 },
    { match: 'gpt-5', abilities: [...OMNI_R], inctx: CTX.K256, outctx: OUT.K128, score: 95 },
    { match: 'o4-mini', abilities: [...REASON_V], inctx: CTX.K200, outctx: OUT.K100, score: 89 },
    { match: 'o3-pro', abilities: [...REASON_V, T.Ultra], inctx: CTX.K200, outctx: OUT.K100, score: 92 },
    { match: 'o3-mini', abilities: [...REASON], inctx: CTX.K200, outctx: OUT.K100, score: 85 },
    { match: 'o3', abilities: [...REASON_V], inctx: CTX.K200, outctx: OUT.K100, score: 91 },
    { match: 'o1-mini', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K64, score: 80 },
    { match: 'o1-pro', abilities: [...REASON_V, T.Ultra], inctx: CTX.K200, outctx: OUT.K100, score: 89 },
    { match: 'o1', abilities: [...REASON_V], inctx: CTX.K200, outctx: OUT.K100, score: 87 },
    { match: 'gpt-4.1-nano', abilities: [...CHAT_V, T.Micro], inctx: CTX.M1, outctx: OUT.K32, score: 78 },
    { match: 'gpt-4.1-mini', abilities: [...CHAT_V, T.Flash], inctx: CTX.M1, outctx: OUT.K32, score: 83 },
    { match: 'gpt-4.1', abilities: [...CHAT_V], inctx: CTX.M1, outctx: OUT.K32, score: 88 },
    { match: 'gpt-4o-mini', abilities: [...OMNI, T.Flash], inctx: CTX.K128, outctx: OUT.K16, score: 78 },
    { match: 'gpt-4o', abilities: [...OMNI], inctx: CTX.K128, outctx: OUT.K16, score: 86 },
    { match: 'gpt-4-turbo', abilities: [...CHAT_V], inctx: CTX.K128, outctx: OUT.K4, score: 83 },
    { match: 'gpt-4', abilities: [...CHAT], inctx: CTX.K8, outctx: OUT.K4, score: 80 },
    // gpt-3.5：早期 completion 血统，结构化输出支持不完整 → 进入 CD 黑名单
    { match: 'gpt-3.5', abilities: [...CHAT, T.Flash], inctx: CTX.K16, outctx: OUT.K4, score: 65 },
    { match: 'chatgpt-4o', abilities: [...OMNI], inctx: CTX.K128, outctx: OUT.K16, score: 84 },

    // ===== Anthropic =====
    { match: 'claude-opus-4', abilities: [...REASON_V, T.Ultra], inctx: CTX.K200, outctx: OUT.K32, score: 93 },
    { match: 'claude-sonnet-4', abilities: [...REASON_V, T.Plus], inctx: CTX.M1, outctx: OUT.K64, score: 90 },
    { match: 'claude-haiku-4', abilities: [...REASON_V, T.Flash], inctx: CTX.K200, outctx: OUT.K32, score: 82 },
    { match: 'claude-3-7-sonnet', abilities: [...REASON_V], inctx: CTX.K200, outctx: OUT.K64, score: 89 },
    { match: 'claude-3-5-sonnet', abilities: [...CHAT_V], inctx: CTX.K200, outctx: OUT.K8, score: 87 },
    { match: 'claude-3-5-haiku', abilities: [...CHAT_V, T.Flash], inctx: CTX.K200, outctx: OUT.K8, score: 76 },
    { match: 'claude-3-opus', abilities: [...CHAT_V, T.Ultra], inctx: CTX.K200, outctx: OUT.K4, score: 85 },
    { match: 'claude-3-sonnet', abilities: [...CHAT_V], inctx: CTX.K200, outctx: OUT.K4, score: 80 },
    { match: 'claude-3-haiku', abilities: [...CHAT_V, T.Flash], inctx: CTX.K200, outctx: OUT.K4, score: 70 },
    { match: 'claude', abilities: [...REASON_V], inctx: CTX.K200, outctx: OUT.K32, score: 87 },

    // ===== Google Gemini =====
    { match: 'gemini-2.5-pro', abilities: [...OMNI_R, T.Video, T.Plus], inctx: CTX.M1_ACTUAL, outctx: OUT.K64, score: 92 },
    { match: 'gemini-2.5-flash-lite', abilities: [...OMNI, T.Video, T.Micro], inctx: CTX.M1_ACTUAL, outctx: OUT.K64, score: 80 },
    { match: 'gemini-2.5-flash', abilities: [...OMNI_R, T.Video, T.Flash], inctx: CTX.M1_ACTUAL, outctx: OUT.K64, score: 86 },
    { match: 'gemini-2.0-flash-lite', abilities: [...OMNI, T.Video, T.Micro], inctx: CTX.M1_ACTUAL, outctx: OUT.K8, score: 76 },
    { match: 'gemini-2.0-flash', abilities: [...OMNI_FULL, T.Flash], inctx: CTX.M1_ACTUAL, outctx: OUT.K8, score: 83 },
    { match: 'gemini-1.5-pro', abilities: [...CHAT_V, T.Video, T.Audio, T.Plus], inctx: CTX.M2, outctx: OUT.K8, score: 84 },
    { match: 'gemini-1.5-flash', abilities: [...CHAT_V, T.Video, T.Flash], inctx: CTX.M1_ACTUAL, outctx: OUT.K8, score: 77 },
    { match: 'gemini-3', abilities: [...OMNI_R, T.Video, T.Plus], inctx: CTX.M1, outctx: OUT.K64, score: 93 },
    { match: 'gemini', abilities: [...OMNI, T.Video], inctx: CTX.M1_ACTUAL, outctx: OUT.K64, score: 84 },
    { match: 'gemma-3', abilities: [...CHAT_V], inctx: CTX.K128, outctx: OUT.K8, score: 74 },
    { match: 'gemma', abilities: [...CHAT], inctx: CTX.K32, outctx: OUT.K8, score: 68 },

    // ===== DeepSeek（2026：主力已到 V4，普遍思考 + 1M） =====
    { match: 'deepseek-v4', abilities: [...REASON], inctx: CTX.M1, outctx: OUT.K64, score: 90 },
    { match: 'deepseek-r1', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K64, score: 90 },
    { match: 'deepseek-reasoner', abilities: [...REASON], inctx: CTX.M1, outctx: OUT.K64, score: 90 },
    { match: 'deepseek-math', abilities: [...MATH], inctx: CTX.K128, outctx: OUT.K32, score: 83 },
    { match: 'deepseek-coder', abilities: [...CODE], inctx: CTX.K128, outctx: OUT.K16, score: 82 },
    { match: 'deepseek-v3.1', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K64, score: 89 },
    { match: 'deepseek-v3', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 86 },
    { match: 'deepseek-chat', abilities: [...REASON], inctx: CTX.M1, outctx: OUT.K64, score: 88 },
    { match: 'deepseek-vl', abilities: [...CHAT_V], inctx: CTX.K32, outctx: OUT.K8, score: 80 },
    { match: 'deepseek', abilities: [...REASON], inctx: CTX.M1, outctx: OUT.K64, score: 87 },

    // ===== Alibaba Qwen（2026：主力已到 3.7，普遍思考 + 1M） =====
    { match: 'qwen3.7-coder', abilities: [...CODE], inctx: CTX.M1, outctx: OUT.K64, score: 87 },
    { match: 'qwen3.7-max', abilities: [...REASON_V, T.Ultra], inctx: CTX.M1, outctx: OUT.K64, score: 89 },
    { match: 'qwen3.7-vl', abilities: [...REASON_V, T.Video], inctx: CTX.M1, outctx: OUT.K32, score: 87 },
    { match: 'qwen3.7', abilities: [...REASON], inctx: CTX.M1, outctx: OUT.K64, score: 88 },
    { match: 'qwen3.5-max', abilities: [...REASON_V, T.Ultra], inctx: CTX.M1, outctx: OUT.K64, score: 87 },
    { match: 'qwen3.5', abilities: [...REASON], inctx: CTX.M1, outctx: OUT.K64, score: 86 },
    { match: 'qwen3-max', abilities: [...REASON_V, T.Ultra], inctx: CTX.M1, outctx: OUT.K32, score: 86 },
    { match: 'qwen3-vl', abilities: [...REASON_V, T.Video], inctx: CTX.M1, outctx: OUT.K32, score: 85 },
    { match: 'qwen3-coder', abilities: [...CODE], inctx: CTX.M1, outctx: OUT.K64, score: 85 },
    { match: 'qwen3-math', abilities: [...MATH], inctx: CTX.K256, outctx: OUT.K32, score: 83 },
    { match: 'qwen3', abilities: [...REASON], inctx: CTX.K256, outctx: OUT.K32, score: 84 },
    { match: 'qwen2.5-max', abilities: [...CHAT, T.Ultra], inctx: CTX.K128, outctx: OUT.K8, score: 83 },
    { match: 'qwen2.5-vl', abilities: [...CHAT_V, T.Video], inctx: CTX.K128, outctx: OUT.K8, score: 82 },
    { match: 'qwen2.5-coder', abilities: [...CODE], inctx: CTX.K128, outctx: OUT.K16, score: 81 },
    { match: 'qwen2.5-math', abilities: [...MATH], inctx: CTX.K128, outctx: OUT.K16, score: 80 },
    { match: 'qwen2.5', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 80 },
    { match: 'qwen-max', abilities: [...CHAT, T.Ultra], inctx: CTX.K32, outctx: OUT.K8, score: 83 },
    { match: 'qwen-plus', abilities: [...REASON, T.Plus], inctx: CTX.M1, outctx: OUT.K32, score: 82 },
    { match: 'qwen-turbo', abilities: [...CHAT, T.Flash], inctx: CTX.M1, outctx: OUT.K16, score: 74 },
    { match: 'qwen-mt', abilities: [T.MT, T.TextGeneration], inctx: CTX.K16, outctx: OUT.K8, score: 79 }, // 通义千问-翻译
    { match: 'qwen-vl', abilities: [...CHAT_V], inctx: CTX.K32, outctx: OUT.K8, score: 79 },
    { match: 'qwq', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K32, score: 84 },
    { match: 'qvq', abilities: [...REASON_V], inctx: CTX.K128, outctx: OUT.K32, score: 82 },
    { match: 'qwen', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 80 },

    // ===== Moonshot / Kimi =====
    { match: 'kimi-k2', abilities: [...CHAT], inctx: CTX.K256, outctx: OUT.K16, score: 87 },
    { match: 'kimi-thinking', abilities: [...REASON_V], inctx: CTX.K256, outctx: OUT.K64, score: 86 },
    { match: 'kimi-latest', abilities: [...CHAT_V], inctx: CTX.K128, outctx: OUT.K8, score: 82 },
    { match: 'moonshot-v1-128k', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 80 },
    { match: 'moonshot', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 78 },
    { match: 'kimi', abilities: [...CHAT_V], inctx: CTX.K128, outctx: OUT.K8, score: 82 },

    // ===== Zhipu GLM（2026：主力已到 5.2，普遍思考 + 1M） =====
    { match: 'glm-5.2-air', abilities: [...REASON, T.Flash], inctx: CTX.M1, outctx: OUT.K64, score: 84 },
    { match: 'glm-5.2v', abilities: [...REASON_V, T.Video], inctx: CTX.K256, outctx: OUT.K32, score: 86 },
    { match: 'glm-5.2', abilities: [...REASON], inctx: CTX.M1, outctx: OUT.K128, score: 88 },
    { match: 'glm-5', abilities: [...REASON], inctx: CTX.M1, outctx: OUT.K128, score: 87 },
    { match: 'glm-4.6', abilities: [...REASON_V], inctx: CTX.K200, outctx: OUT.K128, score: 86 },
    { match: 'glm-4.5v', abilities: [...REASON_V, T.Video], inctx: CTX.K64, outctx: OUT.K16, score: 84 },
    { match: 'glm-4.5-air', abilities: [...REASON, T.Flash], inctx: CTX.K128, outctx: OUT.K64, score: 81 },
    { match: 'glm-4.5', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K128, score: 85 },
    { match: 'glm-4-plus', abilities: [...CHAT, T.Plus], inctx: CTX.K128, outctx: OUT.K16, score: 81 },
    { match: 'glm-4-flash', abilities: [...CHAT, T.Flash], inctx: CTX.K128, outctx: OUT.K16, score: 70 },
    { match: 'glm-4v', abilities: [...CHAT_V], inctx: CTX.K8, outctx: OUT.K4, score: 78 },
    { match: 'glm-z1', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K32, score: 84 },
    { match: 'glm-zero', abilities: [...REASON], inctx: CTX.K32, outctx: OUT.K16, score: 80 },
    { match: 'glm-4', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K16, score: 80 },

    // ===== Baidu ERNIE =====
    { match: 'ernie-4.5', abilities: [...REASON_V], inctx: CTX.K128, outctx: OUT.K16, score: 84 },
    { match: 'ernie-x1', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K16, score: 83 },
    { match: 'ernie-4.0', abilities: [...CHAT, T.Ultra], inctx: CTX.K128, outctx: OUT.K8, score: 80 },
    { match: 'ernie', abilities: [...CHAT], inctx: CTX.K32, outctx: OUT.K8, score: 76 },

    // ===== ByteDance Doubao =====
    { match: 'doubao-1.5-vision', abilities: [...CHAT_V], inctx: CTX.K128, outctx: OUT.K16, score: 83 },
    { match: 'doubao-1.5-pro', abilities: [...CHAT, T.Plus], inctx: CTX.K256, outctx: OUT.K16, score: 84 },
    { match: 'doubao-1.5-thinking', abilities: [...REASON_V], inctx: CTX.K128, outctx: OUT.K32, score: 86 },
    { match: 'doubao-pro', abilities: [...CHAT_V, T.Plus], inctx: CTX.K256, outctx: OUT.K8, score: 81 },
    { match: 'doubao-lite', abilities: [...CHAT, T.Flash], inctx: CTX.K32, outctx: OUT.K8, score: 70 },
    { match: 'doubao-seed', abilities: [...REASON_V], inctx: CTX.K256, outctx: OUT.K32, score: 85 },
    { match: 'doubao', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 78 },

    // ===== Tencent Hunyuan =====
    { match: 'hunyuan-t1', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K16, score: 83 },
    { match: 'hunyuan-turbos', abilities: [...CHAT, T.Flash], inctx: CTX.K128, outctx: OUT.K8, score: 80 },
    { match: 'hunyuan-large', abilities: [...CHAT, T.Ultra], inctx: CTX.K128, outctx: OUT.K8, score: 82 },
    { match: 'hunyuan-vision', abilities: [...CHAT_V], inctx: CTX.K32, outctx: OUT.K8, score: 79 },
    { match: 'hunyuan', abilities: [...CHAT], inctx: CTX.K32, outctx: OUT.K8, score: 77 },

    // ===== MiniMax =====
    { match: 'minimax-m1', abilities: [...REASON], inctx: CTX.M1, outctx: OUT.K64, score: 86 },
    { match: 'minimax-text', abilities: [...CHAT], inctx: CTX.M1, outctx: OUT.K16, score: 84 },
    { match: 'minimax', abilities: [...CHAT], inctx: CTX.K256, outctx: OUT.K8, score: 82 },
    { match: 'abab', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 76 },

    // ===== xAI Grok =====
    { match: 'grok-4', abilities: [...REASON_V, T.Search, T.Ultra], inctx: CTX.K256, outctx: OUT.K64, score: 92 },
    { match: 'grok-3-mini', abilities: [...REASON, T.Flash], inctx: CTX.K128, outctx: OUT.K32, score: 82 },
    { match: 'grok-3', abilities: [...REASON_V, T.Search], inctx: CTX.K128, outctx: OUT.K32, score: 88 },
    { match: 'grok-2-vision', abilities: [...CHAT_V], inctx: CTX.K32, outctx: OUT.K8, score: 82 },
    { match: 'grok-2', abilities: [...CHAT, T.Search], inctx: CTX.K128, outctx: OUT.K8, score: 83 },
    { match: 'grok', abilities: [...REASON_V, T.Search], inctx: CTX.K128, outctx: OUT.K32, score: 85 },

    // ===== Meta Llama（开源） =====
    { match: 'llama-4-maverick', abilities: [...CHAT_V, T.Plus], inctx: CTX.M1, outctx: OUT.K16, score: 85 },
    { match: 'llama-4-scout', abilities: [...CHAT_V, T.Flash], inctx: CTX.M10, outctx: OUT.K16, score: 82 },
    { match: 'llama-4', abilities: [...CHAT_V], inctx: CTX.M1, outctx: OUT.K16, score: 84 },
    { match: 'llama-3.3', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 80 },
    { match: 'llama-3.2-vision', abilities: [...CHAT_V], inctx: CTX.K128, outctx: OUT.K8, score: 77 },
    { match: 'llama-3.2', abilities: [...CHAT, T.Micro], inctx: CTX.K128, outctx: OUT.K8, score: 72 },
    { match: 'llama-3.1', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 78 },
    { match: 'llama', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 74 },

    // ===== Mistral（开源/闭源混合） =====
    { match: 'mistral-large', abilities: [...CHAT_V, T.Ultra], inctx: CTX.K128, outctx: OUT.K8, score: 84 },
    { match: 'mistral-medium', abilities: [...CHAT_V, T.Plus], inctx: CTX.K128, outctx: OUT.K8, score: 82 },
    { match: 'mistral-small', abilities: [...CHAT_V, T.Flash], inctx: CTX.K128, outctx: OUT.K8, score: 76 },
    { match: 'magistral', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K32, score: 83 },
    { match: 'pixtral', abilities: [...CHAT_V], inctx: CTX.K128, outctx: OUT.K8, score: 79 },
    { match: 'codestral', abilities: [...CODE], inctx: CTX.K256, outctx: OUT.K16, score: 80 },
    { match: 'devstral', abilities: [...CODE], inctx: CTX.K128, outctx: OUT.K16, score: 80 },
    { match: 'ministral', abilities: [...CHAT, T.Micro], inctx: CTX.K128, outctx: OUT.K8, score: 70 },
    { match: 'mixtral', abilities: [...CHAT], inctx: CTX.K32, outctx: OUT.K8, score: 72 },
    { match: 'mistral', abilities: [...CHAT], inctx: CTX.K32, outctx: OUT.K8, score: 74 },

    // ===== Microsoft Phi（开源，端侧） =====
    { match: 'phi-4', abilities: [...REASON, T.Micro], inctx: CTX.K16, outctx: OUT.K16, score: 76 },
    { match: 'phi-3.5-vision', abilities: [...CHAT_V, T.Micro], inctx: CTX.K128, outctx: OUT.K4, score: 68 },
    { match: 'phi-3', abilities: [...CHAT, T.Micro], inctx: CTX.K128, outctx: OUT.K4, score: 66 },
    { match: 'phi', abilities: [...CHAT, T.Micro], inctx: CTX.K16, outctx: OUT.K4, score: 68 },

    // ===== NVIDIA Nemotron（开源） =====
    { match: 'nemotron', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K16, score: 82 },

    // ===== 01.AI Yi =====
    { match: 'yi-lightning', abilities: [...CHAT, T.Flash], inctx: CTX.K16, outctx: OUT.K4, score: 80 },
    { match: 'yi-vision', abilities: [...CHAT_V], inctx: CTX.K16, outctx: OUT.K4, score: 76 },
    { match: 'yi-large', abilities: [...CHAT, T.Ultra], inctx: CTX.K32, outctx: OUT.K8, score: 81 },
    { match: 'yi-', abilities: [...CHAT], inctx: CTX.K32, outctx: OUT.K8, score: 76 },

    // ===== StepFun =====
    { match: 'step-3', abilities: [...REASON_V, T.Video], inctx: CTX.K256, outctx: OUT.K32, score: 86 },
    { match: 'step-2', abilities: [...CHAT], inctx: CTX.K16, outctx: OUT.K8, score: 80 },
    { match: 'step-1v', abilities: [...CHAT_V], inctx: CTX.K32, outctx: OUT.K8, score: 78 },
    { match: 'step-1', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 78 },
    { match: 'step-', abilities: [...CHAT_V], inctx: CTX.K128, outctx: OUT.K8, score: 79 },

    // ===== Baichuan =====
    { match: 'baichuan', abilities: [...CHAT], inctx: CTX.K32, outctx: OUT.K8, score: 76 },

    // ===== Cohere =====
    { match: 'command-a', abilities: [...CHAT, T.Search, T.Ultra], inctx: CTX.K256, outctx: OUT.K8, score: 83 },
    { match: 'command-r-plus', abilities: [...CHAT, T.Search, T.Plus], inctx: CTX.K128, outctx: OUT.K4, score: 80 },
    { match: 'command-r', abilities: [...CHAT, T.Search], inctx: CTX.K128, outctx: OUT.K4, score: 76 },
    { match: 'command', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K4, score: 74 },
    { match: 'aya', abilities: [...CHAT], inctx: CTX.K8, outctx: OUT.K4, score: 72 },

    // ===== IBM Granite（开源） =====
    { match: 'granite', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 72 },

    // ===== Perplexity Sonar =====
    { match: 'sonar-reasoning', abilities: [...REASON, T.Search], inctx: CTX.K128, outctx: OUT.K8, score: 83 },
    { match: 'sonar-pro', abilities: [...CHAT, T.Search, T.Plus], inctx: CTX.K200, outctx: OUT.K8, score: 82 },
    { match: 'sonar', abilities: [...CHAT, T.Search], inctx: CTX.K128, outctx: OUT.K8, score: 78 },

    // ===== 蚂蚁 Ling / Ring（开源） =====
    { match: 'ring', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K16, score: 80 },
    { match: 'ling', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 78 },

    // ===== 机器翻译（MT）专用模型 =====
    { match: 'seed-mt', abilities: [T.MT, T.TextGeneration], inctx: CTX.K32, outctx: OUT.K16, score: 80 }, // 字节
    { match: 'hunyuan-mt', abilities: [T.MT, T.TextGeneration], inctx: CTX.K32, outctx: OUT.K8, score: 79 }, // 腾讯
    { match: 'towerinstruct', abilities: [T.MT, T.TextGeneration], inctx: CTX.K8, outctx: OUT.K4, score: 74 }, // Unbabel Tower
    { match: 'madlad', abilities: [T.MT, T.TextGeneration], inctx: CTX.K8, outctx: OUT.K4, score: 70 }, // Google MADLAD-400
    { match: 'nllb', abilities: [T.MT, T.TextGeneration], inctx: CTX.K8, outctx: OUT.K4, score: 70 }, // Meta NLLB
    { match: 'opus-mt', abilities: [T.MT, T.TextGeneration], inctx: CTX.K8, outctx: OUT.K4, score: 66 }, // Helsinki

    // ===== 图像生成模型 =====
    { match: 'gpt-image', abilities: [T.ImageGeneration, T.Vision], score: 88 },
    { match: 'dall-e', abilities: [T.ImageGeneration], score: 80 },
    { match: 'imagen', abilities: [T.ImageGeneration], score: 85 },
    { match: 'seedream', abilities: [T.ImageGeneration], score: 84 },
    { match: 'cogview', abilities: [T.ImageGeneration], score: 78 },
    { match: 'wanx', abilities: [T.ImageGeneration], score: 78 },
    { match: 'wan', abilities: [T.ImageGeneration], score: 76 },
    { match: 'flux', abilities: [T.ImageGeneration], score: 84 },
    { match: 'stable-diffusion', abilities: [T.ImageGeneration], score: 78 },
    { match: 'hunyuan-image', abilities: [T.ImageGeneration], score: 80 },
    { match: 'qwen-image', abilities: [T.ImageGeneration], score: 82 },

    // ===== Embedding 模型 =====
    { match: 'gemini-embedding', abilities: [T.Embedding], inctx: CTX.K8, score: 88 },
    { match: 'text-embedding-3', abilities: [T.Embedding], inctx: CTX.K8, score: 85 },
    { match: 'text-embedding-v', abilities: [T.Embedding], inctx: CTX.K8, score: 84 }, // 阿里 v3/v4
    { match: 'text-embedding', abilities: [T.Embedding], inctx: CTX.K8, score: 80 },
    { match: 'qwen3-embedding', abilities: [T.Embedding], inctx: CTX.K32, score: 87 },
    { match: 'bge-m3', abilities: [T.Embedding], inctx: CTX.K8, score: 84 },
    { match: 'bge', abilities: [T.Embedding], inctx: 512, score: 78 },
    { match: 'jina-embeddings', abilities: [T.Embedding], inctx: CTX.K8, score: 82 },
    { match: 'embed-', abilities: [T.Embedding], inctx: CTX.K8, score: 80 }, // cohere embed

    // ===== Rerank 模型 =====
    { match: 'qwen3-reranker', abilities: [T.Rerank], score: 85 },
    { match: 'bge-reranker', abilities: [T.Rerank], score: 82 },
    { match: 'jina-reranker', abilities: [T.Rerank], score: 82 },
    { match: 'rerank', abilities: [T.Rerank], score: 80 },
];



// ============================================================================
// 数据表 1：厂商识别规则（关键词 → provider）
// ============================================================================

export const PROVIDER_RULES: Array<{ provider: string; keywords: string[] }> = [
    { provider: 'openai', keywords: ['gpt', 'o1', 'o3', 'o4', 'chatgpt', 'dall-e', 'text-embedding', 'davinci', 'whisper', 'sora'] },
    { provider: 'anthropic', keywords: ['claude'] },
    { provider: 'google', keywords: ['gemini', 'gemma', 'imagen', 'palm', 'veo'] },
    { provider: 'alibaba', keywords: ['qwen', 'qwq', 'qvq', 'wan', 'tongyi', 'wanx'] },
    { provider: 'deepseek', keywords: ['deepseek'] },
    { provider: 'moonshot', keywords: ['moonshot', 'kimi'] },
    { provider: 'zhipu', keywords: ['glm', 'chatglm', 'cogview', 'cogvideo'] },
    { provider: 'baidu', keywords: ['ernie', 'wenxin'] },
    { provider: 'bytedance', keywords: ['doubao', 'seed', 'seedream', 'seedance'] },
    { provider: 'tencent', keywords: ['hunyuan'] },
    { provider: 'minimax', keywords: ['minimax', 'abab'] },
    { provider: 'xai', keywords: ['grok'] },
    { provider: 'meta', keywords: ['llama'] },
    { provider: 'mistral', keywords: ['mistral', 'mixtral', 'codestral', 'ministral', 'pixtral', 'magistral', 'devstral'] },
    { provider: 'baai', keywords: ['bge'] },
    { provider: 'jina', keywords: ['jina'] },
    { provider: '01ai', keywords: ['yi-'] },
    { provider: 'stepfun', keywords: ['step-'] },
    { provider: 'cohere', keywords: ['command', 'rerank', 'aya', 'embed-'] },
    { provider: 'microsoft', keywords: ['phi-', 'phi3', 'phi4'] },
    { provider: 'nvidia', keywords: ['nemotron', 'nvidia'] },
    { provider: 'inclusionai', keywords: ['ling-', 'ring-'] }, // 蚂蚁
    { provider: 'baichuan', keywords: ['baichuan'] },
    { provider: 'sensetime', keywords: ['sensechat', 'nova'] },
    { provider: 'ibm', keywords: ['granite'] },
    { provider: 'perplexity', keywords: ['sonar', 'pplx'] },
];
