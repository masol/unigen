import { BASE_MODELS, CTX, ModelTags, OUT, PROVIDER_RULES } from "./base_models";
// ============================================================================
// 类型与枚举定义
// ============================================================================


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

const T = ModelTags;

// 2026 H2 现代默认档位：非旗舰对话模型的最低预期
const DEFAULT_INCTX = CTX.K256;         // 提高默认输入窗口（原为 128K）
const DEFAULT_OUT = OUT.K16;            // 提高默认输出（原为 8K）
const DEFAULT_REASON_OUT = OUT.K64;     // 推理模型默认输出



// ============================================================================
// 数据表 2：基座模型特征表（少量精确数据，其余靠推断）
// ============================================================================

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
    // 专用 MT 引擎（非通用 LLM，通常仅输出译文，无 json_schema 约束能力）
    'opus-mt',
    'nllb',
    'madlad',
];

// ============================================================================
// 数据表 3：ID 关键词兜底推断（当基座表未命中时使用）
// ============================================================================

const KEYWORD_TAGS: Array<{ re: RegExp; tag: ModelTags }> = [
    { re: /embedding|embed(?!ded)|bge(?!-reranker)/, tag: ModelTags.Embedding },
    { re: /rerank|reranker/, tag: ModelTags.Rerank },
    { re: /image|dall-?e|imagen|cogview|flux|diffusion|draw|paint|wanx?|seedream/, tag: ModelTags.ImageGeneration },
    // —— 机器翻译：以边界形式识别 -mt-，避免误伤 "format"、"prompt" 等 ——
    { re: /(?:^|[-_/])mt(?:[-_./]|$)|translat|翻译/, tag: ModelTags.MT },
    // —— 代码 / 数学专精（边界匹配，避免误伤 "encode"、"format"）——
    { re: /(?:^|[-_/])coder?(?:[-_./]|$)|代码/, tag: ModelTags.Code },
    { re: /(?:^|[-_/])math(?:[-_./]|$)|数学/, tag: ModelTags.Math },
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

// 类别标签集合：这些标签互斥于「补充能力」逻辑（用于 appendKeywordTags 跳过判断）
const CATEGORY_TAGS: ModelTags[] = [T.Embedding, T.Rerank, T.ImageGeneration];

// 生成/推理类功能标签：类别模型（Embedding/Rerank/Image/MT）需一并剥离，仅留类别 + 版本
const LLM_FUNCTIONAL_TAGS: ModelTags[] = [
    T.TextGeneration, T.Tool, T.Vision, T.Reasoning,
    T.Audio, T.Video, T.Search, T.Outline, T.Math, T.Code,
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
        else if (abilities.includes(T.MT)) {
            // 专用翻译模型：上下文一般较小
            inctx = CTX.K32; outctx = DEFAULT_OUT; score = 73;
        }
        else {
            inctx = DEFAULT_INCTX; // 256K（提高后的默认值）
            // 若推断为推理模型 → 拉高输出上限
            outctx = abilities.includes(T.Reasoning) ? DEFAULT_REASON_OUT : DEFAULT_OUT;
            score = 72;
        }
    }

    // 6. 补充版本标签（Ultra/Plus/Flash/Micro）
    appendVersionTags(lower, abilities);

    // 7. 补充能力标签（search/vision/reasoning/mt/math/code 等命名信号）
    appendKeywordTags(lower, abilities);

    // 8. 一致性修正
    // 8a. 显式含 thinking/reasoning 关键词 → 确保开启推理
    if (
        abilities.includes(T.TextGeneration) &&
        /thinking|think|reason|-r1\b|reasoner/.test(lower) &&
        !abilities.includes(T.Reasoning)
    ) {
        abilities.push(T.Reasoning);
    }
    // 8b. 代码 / 数学专精 → 依据你的判断规则，默认自带深度思考能力
    if (
        (abilities.includes(T.Code) || abilities.includes(T.Math)) &&
        abilities.includes(T.TextGeneration) &&
        !abilities.includes(T.Reasoning)
    ) {
        abilities.push(T.Reasoning);
    }
    // 8c. 推理模型需要更大的输出预算
    if (abilities.includes(T.Reasoning) && (!outctx || outctx < OUT.K16)) {
        outctx = DEFAULT_REASON_OUT;
    }
    // 8d. MT 是独立品类（同 嵌入/重排/绘图）：剥离所有 LLM 功能标签
    //     （含 base 表带入的 TextGeneration / Outline 等），仅保留 MT + 版本标签。
    enforceMtExclusivity(abilities);

    // 9. 派生「约束解码（Outline）」能力
    //    规则：所有文本生成模型默认支持 CD（覆盖面 ≥ Tool），
    //         但命中黑名单的少数模型除外。
    //    注：MT 已在 8d 剥离 TextGeneration，此处自动跳过，不会误授 Outline。
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
    const isMT = tags.has(T.MT);

    // 非嵌入/重排/图像/翻译 → 默认文本生成 + 工具调用
    // （代码 / 数学模型本质仍是文本生成，走此分支；MT 是独立品类，不走）
    if (!isEmbedding && !isRerank && !isImage && !isMT) {
        tags.add(T.TextGeneration);
        tags.add(T.Tool);
    }

    // 代码 / 数学专精 → 默认自带深度思考
    if (tags.has(T.Code) || tags.has(T.Math)) {
        tags.add(T.Reasoning);
    }

    // 互斥清理：嵌入/重排/翻译（MT）模型剥离一切 LLM 功能标签，仅保留自身类别
    if (isEmbedding || isRerank || isMT) {
        for (const tag of LLM_FUNCTIONAL_TAGS) tags.delete(tag);
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

/**
 * 追加基于关键词的补充能力标签。
 * 仅对文本类模型生效；类别标签（Embedding/Rerank/Image）不在此补充。
 * MT / Math / Code / Search / Vision / Reasoning 等命名信号均可在此叠加。
 * 注：MT 模型不含 TextGeneration，函数开头即返回，不会被误加功能标签。
 */
function appendKeywordTags(lower: string, abilities: ModelTags[]): void {
    const set = new Set(abilities);
    if (!set.has(T.TextGeneration)) return; // 仅对文本类补充

    for (const { re, tag } of KEYWORD_TAGS) {
        if (CATEGORY_TAGS.includes(tag)) continue; // 跳过类别标签
        if (re.test(lower)) set.add(tag);
    }

    abilities.length = 0;
    abilities.push(...set);
}

/**
 * MT（机器翻译）品类排他：与嵌入/重排/绘图同理，翻译模型不应携带
 * text-generation / tool / outline 等对话类功能标签。命中 MT 时，
 * 剥离所有 LLM 功能标签，仅保留 MT 本身与版本标签（Ultra/Plus/Flash/Micro）。
 *
 * 该修正覆盖两条路径：
 *  - 基座表命中（如 qwen-mt 的 [MT, TextGeneration]）；
 *  - 关键词兜底（inferAbilitiesByKeyword 已先剥离，此处幂等）。
 */
function enforceMtExclusivity(abilities: ModelTags[]): void {
    if (!abilities.includes(T.MT)) return;

    const kept = abilities.filter((a) => !LLM_FUNCTIONAL_TAGS.includes(a));
    abilities.length = 0;
    abilities.push(...kept);
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
 *     Embedding / Rerank / MT / 纯 ImageGeneration 无文本 token 生成，跳过。
 *  2. 命中 NO_OUTLINE_MATCHERS 黑名单的少数老模型 / 专用 MT 引擎 → 不授予 Outline。
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

/**
 * 返回模型「主类别」。
 * 优先级：Embedding > Rerank > ImageGeneration > MT > TextGeneration。
 * MT（机器翻译）虽仍生成文本，但语义上是独立品类，故排在 TextGeneration 之前。
 */
export function getModelCategory(modelId: string): ModelTags | 'unknown' {
    const abilities = parseModel(modelId)?.abilities ?? [];
    if (abilities.includes(ModelTags.Embedding)) return ModelTags.Embedding;
    if (abilities.includes(ModelTags.Rerank)) return ModelTags.Rerank;
    if (abilities.includes(ModelTags.ImageGeneration)) return ModelTags.ImageGeneration;
    if (abilities.includes(ModelTags.MT)) return ModelTags.MT;
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

/**
 * 是否为机器翻译（MT）模型。
 */
export function isTranslationModel(modelId: string): boolean {
    return hasAbility(modelId, ModelTags.MT);
}

/**
 * 是否为代码专精模型（含代码生成/补全优化）。
 */
export function isCodeModel(modelId: string): boolean {
    return hasAbility(modelId, ModelTags.Code);
}

/**
 * 是否为数学专精模型（数学推理优化）。
 */
export function isMathModel(modelId: string): boolean {
    return hasAbility(modelId, ModelTags.Math);
}