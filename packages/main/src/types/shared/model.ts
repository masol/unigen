
/**
 * 模型核心能力枚举：用于调用方按任务场景（如代码生成、推理、轻量文本）筛选
 */
export enum ModelAbility {
    TextGeneration = 'text-generation',
    // CodeGeneration = 'code-generation',
    Reasoning = 'reasoning', // 强推理模型
    Embedding = 'embedding',
    Rerank = 'rerank',
    Vision = 'vision', // 视觉理解
    Video = "video",   // 视频理解
    Func = "func", // 函数调用
    Audio = 'audio', // 语音理解
}

/**
 * 接口协议枚举：区分不同的调用标准
 */
export enum ProviderProtocol {
    OpenAI = 'openai',
    Ollama = 'ollama',
    Anthropic = 'anthropic',
    GoogleVertex = 'google-vertex',
    Xai = 'xai',
    HuggingFace = 'huggingface',
}

/**
 * 支持的输入/输出模态
 */
// export type Modality = 'text' | 'image' | 'audio' | 'video';

/**
 * 计费模式：免费、按 Token 计费、按次数计费、本地免费
 */
// export type PricingType = 'free' | 'per-token' | 'per-request' | 'local';

export interface Model {
    id: string;              // 唯一标识符（例如: "gpt-4o", "deepseek-reasoner"）
    abilities: ModelAbility[]; // 模型具备的能力列表（改用枚举数组，支持多功能模型）
    // inputModalities: Modality[];  // 输入模态
    // outputModalities: Modality[]; // 输出模态

    // 上下文与限制
    inctx?: number;           // 输入上下文窗口 (Tokens)
    outctx?: number;          // 最大输出限制 (Tokens)
    score?: number;           // 能力评分

    // 计费扩展
    // pricingType?: PricingType;
    // incost_1m?: number;      // 每百万输入 Token 的费用（美元/人民币）
    // outcost_1m?: number;     // 每百万输出 Token 的费用（美元/人民币）

    // 状态控制
    // isLocal: boolean;        // 是否为本地运行模型（如 Ollama）
}

export interface Provider {
    id: string;              // 唯一标识（例如: "openai", "local-ollama"）id被当作名称来处理了。 
    protocol?: ProviderProtocol; // 接口协议枚举
    baseUrl: string;
    apiKey?: string;         // 部分本地服务商可选
    maxConn?: number;    // 服务商级别的全局最大并发数 (账户总并发限制--maxConnections,不再设置RPC/TPM)        
    // 网络配置
    proxyUrl?: string;       // 独立代理设置
    headers?: Record<string, string>; // 自定义请求头
    disabled?: boolean,
    models: Model[];         // 该服务商持有的模型列表
}

/**
 * 远端拉取的「可选模型」条目，适配 Command 组件。
 * id 作为 value；label/description 用于展示与搜索；
 * preset 为选中后自动填充表单的数据。
 */
export interface ModelOption {
    id: string;
    label?: string;
    description?: string;
    group?: string;
    preset?: Partial<Model>;
}