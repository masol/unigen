// ============================================================================
// 类型与枚举定义
// ============================================================================

export enum ModelTags {
    // —— 类别 ——
    Embedding = 'embedding',
    Rerank = 'rerank',
    TextGeneration = 'text-generation',
    ImageGeneration = 'image-generation',

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
}

export interface ModelFeatures {
    rawId: string;
    provider: string;       // 厂商
    baseName: string;       // 基座模型名
    versionOrDate: string;  // 版本/日期快照
    isSnapshot: boolean;    // 是否固定快照
    abilities: ModelTags[]; // 能力标签集合
    inctx?: number;         // 输入上下文窗口 (Tokens)
    outctx?: number;        // 最大输出限制 (Tokens)
    score?: number;         // 能力评分 (0-100 预估)
}

// ============================================================================
// 常用上下文/输出档位常量（2026 H2：普遍进入 256K~1M+ 时代）
// ============================================================================

const CTX = {
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

const OUT = {
    K4: 4_096,
    K8: 8_192,
    K16: 16_384,
    K32: 32_768,
    K64: 65_536,
    K100: 100_000,
    K128: 131_072, // 长推理模型可达
} as const;

// 2026 H2 现代默认档位：非旗舰对话模型的最低预期
const DEFAULT_INCTX = CTX.K256;         // 提高默认输入窗口（原为 128K）
const DEFAULT_OUT = OUT.K16;            // 提高默认输出（原为 8K）
const DEFAULT_REASON_OUT = OUT.K64;     // 推理模型默认输出

// ============================================================================
// 数据表 1：厂商识别规则（关键词 → provider）
// ============================================================================

const PROVIDER_RULES: Array<{ provider: string; keywords: string[] }> = [
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

// ============================================================================
// 数据表 2：基座模型特征表（少量精确数据，其余靠推断）
// ============================================================================

const T = ModelTags;

// 常用能力组合
const CHAT = [T.TextGeneration, T.Tool];
const CHAT_V = [T.TextGeneration, T.Tool, T.Vision];
const REASON = [T.TextGeneration, T.Tool, T.Reasoning];
const REASON_V = [T.TextGeneration, T.Tool, T.Reasoning, T.Vision];
const OMNI = [T.TextGeneration, T.Tool, T.Vision, T.Audio];
const OMNI_R = [T.TextGeneration, T.Tool, T.Vision, T.Audio, T.Reasoning];
const OMNI_FULL = [T.TextGeneration, T.Tool, T.Vision, T.Audio, T.Video];

interface BaseSpec {
    match: string;          // baseName 包含此子串即命中（小写）
    abilities: ModelTags[];
    inctx?: number;
    outctx?: number;
    score?: number;
}

// 顺序敏感：更具体的放前面
const BASE_MODELS: BaseSpec[] = [
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

    // ===== DeepSeek =====
    { match: 'deepseek-reasoner', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K64, score: 90 },
    { match: 'deepseek-r1', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K64, score: 90 },
    { match: 'deepseek-v3.1', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K64, score: 89 },
    { match: 'deepseek-v3', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 86 },
    { match: 'deepseek-chat', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 86 },
    { match: 'deepseek-coder', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 82 },
    { match: 'deepseek-vl', abilities: [...CHAT_V], inctx: CTX.K32, outctx: OUT.K8, score: 80 },
    { match: 'deepseek', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 85 },

    // ===== Alibaba Qwen（进入 1M 时代，qwen3 系列） =====
    { match: 'qwen3-max', abilities: [...REASON_V, T.Ultra], inctx: CTX.M1, outctx: OUT.K32, score: 90 },
    { match: 'qwen3-vl', abilities: [...REASON_V, T.Video], inctx: CTX.M1, outctx: OUT.K32, score: 87 },
    { match: 'qwen3-coder', abilities: [...CHAT], inctx: CTX.M1, outctx: OUT.K64, score: 86 },
    { match: 'qwen3', abilities: [...REASON], inctx: CTX.K256, outctx: OUT.K32, score: 85 },
    { match: 'qwen2.5-max', abilities: [...CHAT, T.Ultra], inctx: CTX.K128, outctx: OUT.K8, score: 84 },
    { match: 'qwen2.5-vl', abilities: [...CHAT_V, T.Video], inctx: CTX.K128, outctx: OUT.K8, score: 82 },
    { match: 'qwen2.5-coder', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 82 },
    { match: 'qwen2.5', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 81 },
    { match: 'qwen-max', abilities: [...CHAT, T.Ultra], inctx: CTX.K32, outctx: OUT.K8, score: 84 },
    { match: 'qwen-plus', abilities: [...CHAT, T.Plus], inctx: CTX.M1, outctx: OUT.K32, score: 82 },
    { match: 'qwen-turbo', abilities: [...CHAT, T.Flash], inctx: CTX.M1, outctx: OUT.K16, score: 74 },
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

    // ===== Zhipu GLM =====
    { match: 'glm-4.6', abilities: [...REASON_V], inctx: CTX.K200, outctx: OUT.K128, score: 88 },
    { match: 'glm-4.5v', abilities: [...REASON_V, T.Video], inctx: CTX.K64, outctx: OUT.K16, score: 85 },
    { match: 'glm-4.5-air', abilities: [...REASON, T.Flash], inctx: CTX.K128, outctx: OUT.K64, score: 82 },
    { match: 'glm-4.5', abilities: [...REASON], inctx: CTX.K128, outctx: OUT.K128, score: 87 },
    { match: 'glm-4-plus', abilities: [...CHAT, T.Plus], inctx: CTX.K128, outctx: OUT.K16, score: 82 },
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

    // ===== ByteDance Doubao（接上文） =====
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
    { match: 'codestral', abilities: [...CHAT], inctx: CTX.K256, outctx: OUT.K8, score: 80 },
    { match: 'devstral', abilities: [...CHAT], inctx: CTX.K128, outctx: OUT.K8, score: 80 },
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
// 数据表 2.5：约束解码（Constrained Decoding）黑名单
// ----------------------------------------------------------------------------
// 设计原则（最佳实践）：
//   1) CD 覆盖面 ≥ Tool。凡对话模型默认「派生」Outline 能力，无需逐条硬编码。
//   2) 仅对「已知不支持结构化输出」的少数模型用黑名单剔除，避免维护地狱。
//   3) 匹配基于 baseName 子串，命中即视为不支持 CD。
// ============================================================================

const NO_OUTLINE_MATCHERS: string[] = [
    'gpt-3.5',        // 早期 completion 血统，json_schema 支持不完整
    'davinci',        // 纯 completion，无结构化输出
    'gpt-4-turbo',    // 早期 4-turbo API 仅 json_object，无严格 json_schema（保守剔除）
    'gpt-4-0',        // gpt-4 早期快照
    'claude-3-opus',  // Anthropic 早期，结构化输出仅靠 tool 间接实现，非原生 CD
    'claude-3-sonnet',
    'claude-3-haiku',
];

// ============================================================================
// 数据表 3：ID 关键词兜底推断（当基座表未命中时使用）
// ============================================================================

const KEYWORD_TAGS: Array<{ re: RegExp; tag: ModelTags }> = [
    { re: /embedding|embed(?!ded)|bge(?!-reranker)/, tag: ModelTags.Embedding },
    { re: /rerank|reranker/, tag: ModelTags.Rerank },
    { re: /image|dall-?e|imagen|cogview|flux|diffusion|draw|paint|wanx?|seedream/, tag: ModelTags.ImageGeneration },
    { re: /reason|thinking|think|-r1\b|reasoner|-o1\b|-o3\b|qwq|qvq|glm-z|magistral/, tag: ModelTags.Reasoning },
    { re: /vl\b|vision|visual|-v\d|multimodal|omni|pixtral/, tag: ModelTags.Vision },
    { re: /video|veo|sora|cogvideo|seedance/, tag: ModelTags.Video },
    { re: /audio|voice|speech|whisper|tts|asr|realtime/, tag: ModelTags.Audio },
    { re: /search|web|sonar|online/, tag: ModelTags.Search },
];

const VERSION_TAGS: Array<{ re: RegExp; tag: ModelTags }> = [
    { re: /ultra|max\b|opus|-a\b/, tag: ModelTags.Ultra },
    { re: /plus|pro(?!mpt)|large|maverick/, tag: ModelTags.Plus },
    { re: /flash|turbo|lite|mini|haiku|air|small|fast/, tag: ModelTags.Flash },
    { re: /micro|nano|tiny|edge|端侧|0\.5b|1\.5b|1b\b|3b\b|scout/, tag: ModelTags.Micro },
];

// ============================================================================
// 核心解析函数
// ============================================================================

const VERSION_REGEX = /(?:\d{4}-?\d{2}-?\d{2}|v\d+(?:\.\d+)?|latest|preview|exp|instruct|chat)/i;

/**
 * 解析模型 ID → 基座模型 + 特征
 */
export function parseModel(modelId: string): ModelFeatures | null {
    if (!modelId || typeof modelId !== 'string') return null;

    const raw = modelId.trim();
    const lower = raw.toLowerCase();

    // 1. 识别厂商
    let provider = 'unknown';
    for (const rule of PROVIDER_RULES) {
        if (rule.keywords.some((k) => lower.includes(k))) {
            provider = rule.provider;
            break;
        }
    }

    // 2. 提取版本 / 日期快照
    const dateMatch = raw.match(/\d{4}-?\d{2}-?\d{2}/);
    const versionMatch = raw.match(VERSION_REGEX);
    const versionOrDate = versionMatch ? versionMatch[0] : 'latest';
    const isSnapshot = Boolean(dateMatch);

    // 3. 计算 baseName（去除日期尾缀）
    const baseName = raw
        .replace(/\d{4}-?\d{2}-?\d{2}/g, '')            // 去日期
        .replace(/[:@](latest|preview|exp)$/gi, '')     // 去 tag 尾缀
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();

    // 4. 命中基座特征表
    const spec = BASE_MODELS.find((s) => baseName.includes(s.match));

    let abilities: ModelTags[];
    let inctx: number | undefined;
    let outctx: number | undefined;
    let score: number | undefined;

    if (spec) {
        abilities = [...spec.abilities];
        inctx = spec.inctx;
        outctx = spec.outctx;
        score = spec.score;
    } else {
        // 5. 未命中 → 关键词兜底推断
        abilities = inferAbilitiesByKeyword(lower);
        const category = abilities.find((a) =>
            [T.Embedding, T.Rerank, T.ImageGeneration].includes(a),
        );
        // 预估：文本类默认给 2026 H2 现代主流档位（256K 输入 / 16K 输出）
        if (category === T.Embedding) { inctx = CTX.K8; score = 72; }
        else if (category === T.Rerank) { score = 72; }
        else if (category === T.ImageGeneration) { score = 74; }
        else {
            inctx = DEFAULT_INCTX; // 256K（提高后的默认值）
            // 若推断为推理模型 → 拉高输出上限
            outctx = abilities.includes(T.Reasoning) ? DEFAULT_REASON_OUT : DEFAULT_OUT;
            score = 72;
        }
    }

    // 6. 补充版本标签（Ultra/Plus/Flash/Micro）
    appendVersionTags(lower, abilities);

    // 7. 补充能力标签（search/vision/reasoning 等命名信号）
    appendKeywordTags(lower, abilities);

    // 8. 一致性修正：显式含 thinking/reasoning 关键词 → 确保开启推理并提升输出上限
    if (
        abilities.includes(T.TextGeneration) &&
        /thinking|think|reason|-r1\b|reasoner/.test(lower) &&
        !abilities.includes(T.Reasoning)
    ) {
        abilities.push(T.Reasoning);
    }
    if (abilities.includes(T.Reasoning) && (!outctx || outctx < OUT.K16)) {
        outctx = DEFAULT_REASON_OUT; // 推理模型需要更大输出预算
    }

    // 9. 派生「约束解码（Outline）」能力
    //    规则：所有文本生成模型默认支持 CD（覆盖面 ≥ Tool），
    //         但命中黑名单的少数模型除外。
    applyOutlineAbility(baseName, abilities);

    return {
        rawId: raw,
        provider,
        baseName,
        versionOrDate,
        isSnapshot,
        abilities: dedupe(abilities),
        inctx,
        outctx,
        score,
    };
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 关键词推断能力（基座未命中时的核心兜底） */
function inferAbilitiesByKeyword(lower: string): ModelTags[] {
    const tags = new Set<ModelTags>();

    for (const { re, tag } of KEYWORD_TAGS) {
        if (re.test(lower)) tags.add(tag);
    }

    const isEmbedding = tags.has(T.Embedding);
    const isRerank = tags.has(T.Rerank);
    const isImage = tags.has(T.ImageGeneration);

    // 非嵌入/重排/图像 → 默认文本生成 + 工具调用
    if (!isEmbedding && !isRerank && !isImage) {
        tags.add(T.TextGeneration);
        tags.add(T.Tool);
    }

    // 互斥清理：嵌入/重排模型剥离对话能力
    if (isEmbedding || isRerank) {
        tags.delete(T.TextGeneration);
        tags.delete(T.Tool);
        tags.delete(T.Vision);
        tags.delete(T.Reasoning);
        tags.delete(T.Audio);
        tags.delete(T.Video);
        tags.delete(T.Search);
    }

    return Array.from(tags);
}

/** 追加版本标签（互斥取第一命中） */
function appendVersionTags(lower: string, abilities: ModelTags[]): void {
    const hasVersionTag = abilities.some((a) =>
        [T.Ultra, T.Plus, T.Flash, T.Micro].includes(a),
    );
    if (hasVersionTag) return;

    for (const { re, tag } of VERSION_TAGS) {
        if (re.test(lower)) {
            abilities.push(tag);
            break;
        }
    }
}

/** 追加基于关键词的补充能力标签 */
function appendKeywordTags(lower: string, abilities: ModelTags[]): void {
    const set = new Set(abilities);
    if (!set.has(T.TextGeneration)) return; // 仅对文本类补充

    for (const { re, tag } of KEYWORD_TAGS) {
        if ([T.Embedding, T.Rerank, T.ImageGeneration].includes(tag)) continue;
        if (re.test(lower)) set.add(tag);
    }

    abilities.length = 0;
    abilities.push(...set);
}

/**
 * 派生「约束解码 / 结构化输出（Outline）」能力。
 *
 * 工程决策依据：
 *  - 约束解码本质是【推理引擎】层面的能力（outlines / xgrammar / lm-format-enforcer，
 *    以及各闭源 API 的 response_format=json_schema），其覆盖面 ≥ 函数调用（Tool）。
 *  - 因此采用「默认支持 + 黑名单剔除」策略，而非逐条硬编码，避免维护地狱。
 *
 * 规则：
 *  1. 仅文本生成模型（TextGeneration）才有 CD 意义；
 *     Embedding / Rerank / 纯 ImageGeneration 无文本 token 生成，跳过。
 *  2. 命中 NO_OUTLINE_MATCHERS 黑名单的少数老模型 → 不授予 Outline。
 *  3. 其余文本模型 → 默认授予 Outline。
 */
function applyOutlineAbility(baseName: string, abilities: ModelTags[]): void {
    if (!abilities.includes(T.TextGeneration)) return;

    const blocked = NO_OUTLINE_MATCHERS.some((m) => baseName.includes(m));
    if (blocked) return;

    if (!abilities.includes(T.Outline)) {
        abilities.push(T.Outline);
    }
}

/** 数组去重（保持顺序） */
function dedupe<T>(arr: T[]): T[] {
    return Array.from(new Set(arr));
}

// ============================================================================
// 便捷 API
// ============================================================================

export function getBaseModel(modelId: string): string {
    return parseModel(modelId)?.baseName ?? 'unknown';
}

export function hasAbility(modelId: string, tag: ModelTags): boolean {
    return parseModel(modelId)?.abilities.includes(tag) ?? false;
}

export function getModelCategory(modelId: string): ModelTags | 'unknown' {
    const abilities = parseModel(modelId)?.abilities ?? [];
    if (abilities.includes(ModelTags.Embedding)) return ModelTags.Embedding;
    if (abilities.includes(ModelTags.Rerank)) return ModelTags.Rerank;
    if (abilities.includes(ModelTags.ImageGeneration)) return ModelTags.ImageGeneration;
    if (abilities.includes(ModelTags.TextGeneration)) return ModelTags.TextGeneration;
    return 'unknown';
}

/**
 * 是否支持函数调用（Tool / Function Calling）。
 */
export function supportsToolCalling(modelId: string): boolean {
    return hasAbility(modelId, ModelTags.Tool);
}

/**
 * 是否支持约束解码 / 结构化输出（Constrained Decoding / Structured Output）。
 *
 * 语义说明：
 *  - 返回 true 表示该模型可稳定地按 JSON Schema / 正则 / 语法约束生成结构化输出。
 *  - 覆盖面通常 ≥ supportsToolCalling（工具调用可视为 CD 的一种应用）。
 */
export function supportsConstrainedDecoding(modelId: string): boolean {
    return hasAbility(modelId, ModelTags.Outline);
}

/**
 * 是否为推理（思考）模型。
 */
export function isReasoningModel(modelId: string): boolean {
    return hasAbility(modelId, ModelTags.Reasoning);
}