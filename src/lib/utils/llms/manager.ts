import { LLMWrapper } from "./instance.js";
import type { LLMConfig, CallResult, JSONCallResult } from './index.type.js'

// 实例状态接口
interface InstanceState {
    wrapper: LLMWrapper;
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

export type InstanceStatus = {
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

export class LLMManager {
    private instances: Map<string, InstanceState> = new Map();
    private currentIndex: number = 0;
    private readonly maxConsecutiveErrors = 3; // 连续错误次数上限
    private readonly errorCooldownTime = 30000; // 错误冷却时间（30秒）

    constructor() { }

    /**
     * 创建实例状态
     */
    private createInstanceState(config: LLMConfig): InstanceState {
        const processedConfig = { ...config };
        const wrapper = new LLMWrapper(processedConfig);

        return {
            wrapper,
            config: processedConfig,
            isAvailable: true,
            errorCount: 0,
            totalCalls: 0,
            successCalls: 0,
            averageResponseTime: 0,
            consecutiveErrors: 0
        };
    }

    /**
     * 初始化 LLM 实例
     */
    init(configs: LLMConfig[]) {
        console.log(`开始初始化 ${configs.length} 个 LLM 配置...`);

        let successCount = 0;

        for (const config of configs) {
            if (!config.enabled) {
                console.error(`${config.name}被禁用，忽略之。`);
                continue;
            }
            try {
                const instanceState = this.createInstanceState(config);
                this.instances.set(config.id, instanceState);
                successCount++;
                console.log(`成功初始化${instanceState.config.provider}实例: ${instanceState.config.name}`);
            } catch (error) {
                console.error(`初始化实例失败: ${config.name}`, error);
            }
        }

        console.log(`LLM 管理器初始化完成，共创建 ${successCount} 个实例`);
    }

    /**
     * 添加 LLM 实例
     */
    addLLM(config: LLMConfig): boolean {
        try {
            const instanceState = this.createInstanceState(config);
            this.instances.set(config.id, instanceState);
            console.log(`成功添加 LLM 实例: ${instanceState.config.name}`);
            return true;
        } catch (error) {
            console.error(`添加 LLM 实例失败: ${config.name}`, error);
            return false;
        }
    }

    /**
     * 删除 LLM 实例
     */
    removeLLM(id: string): boolean {
        const removed = this.instances.delete(id);
        if (removed) {
            console.log(`已删除 LLM 实例: ${id}`);
            this.currentIndex = 0; // 重置索引
        }
        return removed;
    }

    /**
     * 删除所有 LLM 实例
     */
    removeAllLLMs(): void {
        const instanceCount = this.instances.size;
        this.instances.clear();
        this.currentIndex = 0;
        console.log(`已删除所有 LLM 实例，共删除 ${instanceCount} 个实例`);
    }

    /**
     * 检查实例是否可用
     */
    private isInstanceUsable(state: InstanceState): boolean {
        if (!state.isAvailable) {
            return false;
        }

        // 如果连续错误次数过多，检查是否在冷却期
        if (state.consecutiveErrors >= this.maxConsecutiveErrors) {
            const now = Date.now();
            const lastErrorTime = state.lastError ? Date.now() : 0;
            if (now - lastErrorTime < this.errorCooldownTime) {
                return false;
            }
            // 冷却期过后，重置连续错误计数
            state.consecutiveErrors = 0;
        }

        return true;
    }

    /**
     * 获取下一个可用的 LLM 实例 (Round Robin)
     */
    private getNextAvailableInstance(): InstanceState | null {
        const availableStates = Array.from(this.instances.values())
            .filter(state => this.isInstanceUsable(state));

        if (availableStates.length === 0) {
            return null;
        }

        // Round Robin 选择
        const state = availableStates[this.currentIndex % availableStates.length];
        this.currentIndex++;

        return state;
    }

    /**
     * 更新实例统计信息
     */
    private updateInstanceStats(state: InstanceState, result: CallResult): void {
        state.totalCalls++;

        if (result.success) {
            state.successCalls++;
            state.consecutiveErrors = 0;  // 重置连续错误计数
            state.lastSuccessTime = Date.now();

            // 更新平均响应时间
            const totalTime = state.averageResponseTime * (state.successCalls - 1) + result.responseTime;
            state.averageResponseTime = totalTime / state.successCalls;
        } else {
            state.errorCount++;
            state.consecutiveErrors++;
            state.lastError = result.error;

            // 如果连续错误过多，暂时标记为不可用
            if (state.consecutiveErrors >= this.maxConsecutiveErrors) {
                console.warn(`实例 ${state.config.name} 连续错误 ${state.consecutiveErrors} 次，暂时禁用`);
            }
        }
    }

    /**
     * 调用 LLM，失败后重试其他实例
     */
    async call(message: string, maxRetries: number = 2): Promise<CallResult> {
        let lastError: Error | undefined;
        const attemptedInstances = new Set<string>();

        // 总尝试次数 = 1次初始调用 + maxRetries次重试
        const totalAttempts = 1 + maxRetries;

        for (let attempt = 0; attempt < totalAttempts; attempt++) {
            const state = this.getNextAvailableInstance();

            if (!state) {
                lastError = new Error('没有可用的 LLM 实例');
                break;
            }

            // 如果这个实例已经尝试过，跳过
            if (attemptedInstances.has(state.config.id)) {
                continue;
            }

            attemptedInstances.add(state.config.id);

            console.log(`尝试调用实例: ${state.config.name} (第${attempt + 1}次尝试)`);

            const result = await state.wrapper.call(message);
            this.updateInstanceStats(state, result);

            if (result.success) {
                console.log(`调用成功: ${state.config.name}`);
                return result;
            } else {
                lastError = result.error;
                console.warn(`调用失败: ${state.config.name}`, result.error?.message);
            }
        }

        return {
            success: false,
            error: lastError || new Error('所有重试都失败了'),
            responseTime: 0
        };
    }

    /**
     * 调用 LLM 获取JSON响应，失败后重试其他实例
     */
    async callJSON(message: string, maxRetries: number = 2): Promise<JSONCallResult> {
        let lastError: Error | undefined;
        const attemptedInstances = new Set<string>();

        // 总尝试次数 = 1次初始调用 + maxRetries次重试
        const totalAttempts = 1 + maxRetries;

        for (let attempt = 0; attempt < totalAttempts; attempt++) {
            const state = this.getNextAvailableInstance();

            if (!state) {
                lastError = new Error('没有可用的 LLM 实例');
                break;
            }

            // 如果这个实例已经尝试过，跳过
            if (attemptedInstances.has(state.config.id)) {
                continue;
            }

            attemptedInstances.add(state.config.id);

            console.log(`尝试JSON调用实例: ${state.config.name} (第${attempt + 1}次尝试)`);

            const result = await state.wrapper.callJSON(message);
            this.updateInstanceStats(state, result);

            if (result.success) {
                console.log(`JSON调用成功: ${state.config.name}`);
                return result;
            } else {
                lastError = result.error;
                console.warn(`JSON调用失败: ${state.config.name}`, result.error?.message);
            }
        }

        return {
            success: false,
            error: lastError || new Error('所有JSON调用重试都失败了'),
            responseTime: 0
        };
    }

    /**
     * 流式调用 LLM，失败后重试其他实例
     */
    async callStream(
        message: string,
        onChunk: (chunk: string) => void,
        maxRetries: number = 2
    ): Promise<CallResult> {
        let lastError: Error | undefined;
        const attemptedInstances = new Set<string>();

        // 总尝试次数 = 1次初始调用 + maxRetries次重试
        const totalAttempts = 1 + maxRetries;

        for (let attempt = 0; attempt < totalAttempts; attempt++) {
            const state = this.getNextAvailableInstance();

            if (!state) {
                lastError = new Error('没有可用的 LLM 实例');
                break;
            }

            // 如果这个实例已经尝试过，跳过
            if (attemptedInstances.has(state.config.id)) {
                continue;
            }

            attemptedInstances.add(state.config.id);

            console.log(`尝试流式调用实例: ${state.config.name} (第${attempt + 1}次尝试)`);

            const result = await state.wrapper.callStream(message, onChunk);
            this.updateInstanceStats(state, result);

            if (result.success) {
                console.log(`流式调用成功: ${state.config.name}`);
                return result;
            } else {
                lastError = result.error;
                console.warn(`流式调用失败: ${state.config.name}`, result.error?.message);
            }
        }

        return {
            success: false,
            error: lastError || new Error('所有流式调用重试都失败了'),
            responseTime: 0
        };
    }

    /**
     * 获取所有实例状态
     */
    getInstancesStatus(): Array<InstanceStatus> {
        return Array.from(this.instances.values()).map(state => ({
            id: state.config.id,
            name: state.config.name,
            provider: state.config.provider,
            isAvailable: this.isInstanceUsable(state),
            errorCount: state.errorCount,
            successRate: state.totalCalls > 0 ?
                Math.round((state.successCalls / state.totalCalls) * 100) : 0,
            averageResponseTime: Math.round(state.averageResponseTime),
            totalCalls: state.totalCalls,
            consecutiveErrors: state.consecutiveErrors,
            lastError: state.lastError?.message,
            lastSuccessTime: state.lastSuccessTime
        }));
    }

    /**
     * 获取最佳性能的实例
     */
    getBestPerformingInstance(): string | null {
        const availableStates = Array.from(this.instances.values())
            .filter(state => this.isInstanceUsable(state) && state.totalCalls > 0);

        if (availableStates.length === 0) {
            return null;
        }

        // 使用原生sort方法进行多条件排序
        const sortedStates = availableStates.sort((a, b) => {
            const aSuccessRate = a.successCalls / a.totalCalls;
            const bSuccessRate = b.successCalls / b.totalCalls;

            // 首先按成功率排序（降序）
            if (aSuccessRate !== bSuccessRate) {
                return bSuccessRate - aSuccessRate;
            }

            // 成功率相同时，按响应时间排序（升序）
            return a.averageResponseTime - b.averageResponseTime;
        });

        return sortedStates[0].config.id;
    }

    /**
     * 重置所有实例状态
     */
    resetAllInstances(): void {
        this.instances.forEach(state => {
            state.isAvailable = true;
            state.errorCount = 0;
            state.totalCalls = 0;
            state.successCalls = 0;
            state.averageResponseTime = 0;
            state.consecutiveErrors = 0;
            state.lastError = undefined;
            state.lastSuccessTime = undefined;
        });

        this.currentIndex = 0;
        console.log('已重置所有 LLM 实例状态');
    }

    /**
     * 重置特定实例状态
     */
    resetInstance(id: string): boolean {
        const state = this.instances.get(id);
        if (!state) {
            return false;
        }

        state.isAvailable = true;
        state.errorCount = 0;
        state.consecutiveErrors = 0;
        state.lastError = undefined;

        console.log(`已重置实例 ${state.config.name} 的状态`);
        return true;
    }

    /**
     * 获取实例数量
     */
    getInstanceCount(): number {
        return this.instances.size;
    }

    /**
     * 获取可用实例数量
     */
    getAvailableInstanceCount(): number {
        return Array.from(this.instances.values())
            .filter(state => this.isInstanceUsable(state)).length;
    }

    /**
     * 手动设置实例可用性
     */
    setInstanceAvailability(id: string, isAvailable: boolean): boolean {
        const state = this.instances.get(id);
        if (!state) {
            return false;
        }

        state.isAvailable = isAvailable;
        if (isAvailable) {
            state.consecutiveErrors = 0; // 重新启用时重置错误计数
        }

        console.log(`实例 ${state.config.name} 可用性设置为: ${isAvailable}`);
        return true;
    }
}
