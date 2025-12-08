// index.type.ts

import type { ModelMessage, LanguageModelUsage } from 'ai';
import type { z } from 'zod';

// ============================================================================
// 标签和配置
// ============================================================================

export const validTags = [
    'fast', 'powerful', 'balanced',
    'image', 'image_modify', 'video', 'video_modify',
    'speech', 'speech_modify', 'music', 'music_modify'
] as const;

export type LLMTag = typeof validTags[number];

/**
 * LLM配置接口
 */
export interface LLMConfig {
    id: string;
    provider: string;
    apiKey: string;
    name: string; // name保存了模型名称
    tag: LLMTag;
    // weight: number; // 暂未启用。防止干扰试听。
    enabled?: boolean;
    temperature?: number;
    maxTokens?: number;
    [key: string]: unknown;
}

// ============================================================================
// 调用结果接口
// ============================================================================

/**
 * 基础调用结果接口
 */
export interface CallResult {
    success: boolean;
    response?: string;
    error?: Error;
    responseTime: number;
}

/**
 * JSON调用结果接口
 */
export interface JSONCallResult extends CallResult {
    json?: unknown;
}

/**
 * 生成对象结果接口
 */
export interface GenerateObjectResult<T> {
    success: boolean;
    object?: T;
    finishReason?: string;
    usage?: LanguageModelUsage;
    error?: Error;
    responseTime: number;
}

// ============================================================================
// LLMWrapper 相关接口
// ============================================================================

/**
 * 生成对象选项
 */
export interface GenerateObjectOptions {
    mode?: 'auto' | 'json' | 'tool';
    schemaName?: string;
    schemaDescription?: string;
}

/**
 * LLMWrapper 接口
 */
export interface ILLMWrapper {
    /**
     * 调用 LLM
     * @param input 输入内容（字符串、数字或消息数组）
     * @returns 调用结果
     */
    call(input: string | number | ModelMessage[]): Promise<CallResult>;

    /**
     * 调用 LLM 并返回 JSON（基于文本解析）
     * @param input 输入内容
     * @param maxRetries 最大重试次数，默认2次
     * @returns JSON调用结果
     */
    callJSON(
        input: string | number | ModelMessage[],
        maxRetries?: number
    ): Promise<JSONCallResult>;

    /**
     * 使用 schema 生成结构化对象（推荐使用）
     * @param input 输入内容
     * @param schema Zod schema
     * @param options 生成选项
     * @returns 生成对象结果
     */
    generateObject<T extends z.ZodType>(
        input: string | number | ModelMessage[],
        schema: T,
        options?: GenerateObjectOptions
    ): Promise<GenerateObjectResult<z.infer<T>>>;

    /**
     * 流式调用 LLM
     * @param input 输入内容
     * @param onChunk 数据块回调函数
     * @returns 调用结果
     */
    callStream(
        input: string | number | ModelMessage[],
        onChunk: (chunk: string) => void
    ): Promise<CallResult>;

    /**
     * 获取配置信息
     * @returns LLM配置
     */
    getConfig(): LLMConfig;
}

// ============================================================================
// LLMManager 相关接口
// ============================================================================

/**
 * 实例状态接口
 */
export interface InstanceState {
    wrapper: ILLMWrapper; // 使用ILLMWrapper接口类型
    config: LLMConfig;
    isAvailable: boolean;
    errorCount: number;
    totalCalls: number;
    successCalls: number;
    averageResponseTime: number;
    lastError?: Error;
    lastSuccessTime?: number;
    consecutiveErrors: number;
}

/**
 * 实例状态信息接口（用于状态查询）
 */
export interface InstanceStatusInfo {
    id: string;
    name: string;
    provider: string;
    isAvailable: boolean;
    errorCount: number;
    successRate: number;
    averageResponseTime: number;
    totalCalls: number;
    consecutiveErrors: number;
    lastError?: string;
    lastSuccessTime?: number;
}

/**
 * LLM管理器配置选项接口
 */
export interface LLMManagerOptions {
    /** 连续错误次数上限，默认3次 */
    maxConsecutiveErrors?: number;
    /** 错误冷却时间（毫秒），默认30000ms */
    errorCooldownTime?: number;
}

/**
 * LLM管理器接口
 */
export interface ILLMManager {
    /**
     * 初始化 LLM 实例
     * @param configs LLM配置数组
     */
    init(configs: LLMConfig[]): Promise<void>;

    /**
     * 添加 LLM 实例
     * @param config LLM配置
     * @returns 是否添加成功
     */
    addLLM(config: LLMConfig): boolean;

    /**
     * 删除 LLM 实例
     * @param id 实例ID
     * @returns 是否删除成功
     */
    removeLLM(id: string): boolean;

    /**
     * 删除所有 LLM 实例
     */
    removeAllLLMs(): void;

    /**
     * 调用 LLM，失败后重试其他实例
     * @param message 输入消息
     * @param maxRetries 最大重试次数，默认2次
     * @returns 调用结果
     */
    call(message: string | number, maxRetries?: number): Promise<CallResult>;

    /**
     * 调用 LLM 获取JSON响应，失败后重试其他实例
     * @param message 输入消息
     * @param maxRetries 最大重试次数，默认2次
     * @returns JSON调用结果
     */
    callJSON(message: string | number, maxRetries?: number): Promise<JSONCallResult>;

    /**
     * 流式调用 LLM，失败后重试其他实例
     * @param message 输入消息
     * @param onChunk 数据块回调函数
     * @param maxRetries 最大重试次数，默认2次
     * @returns 调用结果
     */
    callStream(
        message: string | number,
        onChunk: (chunk: string) => void,
        maxRetries?: number
    ): Promise<CallResult>;

    /**
     * 获取所有实例状态
     * @returns 实例状态信息数组
     */
    getInstancesStatus(): InstanceStatusInfo[];

    /**
     * 获取最佳性能的实例
     * @returns 最佳实例的ID，如果没有可用实例则返回null
     */
    getBestPerformingInstance(): string | null;

    /**
     * 重置所有实例状态
     */
    resetAllInstances(): void;

    /**
     * 重置特定实例状态
     * @param id 实例ID
     * @returns 是否重置成功
     */
    resetInstance(id: string): boolean;

    /**
     * 获取实例数量
     * @returns 实例总数
     */
    getInstanceCount(): number;

    /**
     * 获取可用实例数量
     * @returns 可用实例数量
     */
    getAvailableInstanceCount(): number;

    /**
     * 手动设置实例可用性
     * @param id 实例ID
     * @param isAvailable 是否可用
     * @returns 是否设置成功
     */
    setInstanceAvailability(id: string, isAvailable: boolean): boolean;
}
