import { LLMManager } from './manager.js';
import type { LLMConfig } from './index.type.js';
import { logger } from '../logger.js';
import type { LLMTag } from './index.type.js';

// LLM 中心管理类
export class LLMCenter {
    private managers: Map<LLMTag, LLMManager> = new Map();

    constructor() {
        // 初始化三个管理器
        this.managers.set('fast', new LLMManager());
        this.managers.set('powerful', new LLMManager());
        this.managers.set('balanced', new LLMManager());
    }

    /**
     * 只读访问器 - fast 管理器
     */
    get fast(): LLMManager {
        return this.managers.get('fast')!;
    }

    /**
     * 只读访问器 - powerful 管理器
     */
    get powerful(): LLMManager {
        return this.managers.get('powerful')!;
    }

    /**
     * 只读访问器 - balanced 管理器
     */
    get balanced(): LLMManager {
        return this.managers.get('balanced')!;
    }

    /**
     * 初始化所有 LLM 实例，根据 tag 分配到对应的管理器
     */
    init(configs: LLMConfig[]): void {
        console.log(`LLMCenter 开始初始化，共 ${configs.length} 个配置...`);

        // 按 tag 分组配置
        const configsByTag: Record<LLMTag, LLMConfig[]> = {
            fast: [],
            powerful: [],
            balanced: []
        };

        for (const config of configs) {
            if (!config.enabled) {
                console.log(`配置 ${config.name} 被禁用，跳过`);
                continue;
            }

            const tag = config.tag as LLMTag;
            if (tag && configsByTag[tag]) {
                configsByTag[tag].push(config);
            } else {
                console.warn(`配置 ${config.name} 的 tag "${config.tag}" 无效，跳过`);
            }
        }

        // 初始化各个管理器
        for (const [tag, tagConfigs] of Object.entries(configsByTag) as [LLMTag, LLMConfig[]][]) {
            if (tagConfigs.length > 0) {
                console.log(`初始化 ${tag} 管理器，配置数量: ${tagConfigs.length}`);
                const manager = this.managers.get(tag)!;
                manager.init(tagConfigs);
            }
        }

        console.log('LLMCenter 初始化完成');
        this.printSummary();
    }

    /**
     * 添加 LLM 实例到对应的管理器
     */
    addLLM(config: LLMConfig): boolean {
        const tag = config.tag as LLMTag;
        const manager = this.managers.get(tag);

        if (!manager) {
            console.error(`无效的 tag: ${config.tag}`);
            return false;
        }

        return manager.addLLM(config);
    }

    /**
     * 从指定管理器删除 LLM 实例
     */
    removeLLM(tag: LLMTag, id: string): boolean {
        const manager = this.managers.get(tag);
        if (!manager) {
            console.error(`无效的 tag: ${tag}`);
            return false;
        }

        return manager.removeLLM(id);
    }

    /**
     * 删除所有 LLM 实例
     */
    removeAllLLMs(): void {
        this.managers.forEach((manager, tag) => {
            console.log(`清空 ${tag} 管理器...`);
            manager.removeAllLLMs();
        });
        console.log('LLMCenter 已清空所有实例');
    }

    /**
     * 根据 tag 获取管理器
     */
    getManager(tag: LLMTag): LLMManager | undefined {
        return this.managers.get(tag);
    }

    /**
     * 获取所有管理器的状态摘要
     */
    getAllStatus(): Record<LLMTag, ReturnType<LLMManager['getInstancesStatus']>> {
        return {
            fast: this.fast.getInstancesStatus(),
            powerful: this.powerful.getInstancesStatus(),
            balanced: this.balanced.getInstancesStatus()
        };
    }

    /**
     * 获取统计摘要
     */
    getSummary(): {
        fast: { total: number; available: number };
        powerful: { total: number; available: number };
        balanced: { total: number; available: number };
        totalInstances: number;
        totalAvailable: number;
    } {
        const fastTotal = this.fast.getInstanceCount();
        const fastAvailable = this.fast.getAvailableInstanceCount();

        const powerfulTotal = this.powerful.getInstanceCount();
        const powerfulAvailable = this.powerful.getAvailableInstanceCount();

        const balancedTotal = this.balanced.getInstanceCount();
        const balancedAvailable = this.balanced.getAvailableInstanceCount();

        return {
            fast: { total: fastTotal, available: fastAvailable },
            powerful: { total: powerfulTotal, available: powerfulAvailable },
            balanced: { total: balancedTotal, available: balancedAvailable },
            totalInstances: fastTotal + powerfulTotal + balancedTotal,
            totalAvailable: fastAvailable + powerfulAvailable + balancedAvailable
        };
    }

    /**
     * 打印统计摘要
     */
    printSummary(): void {
        const summary = this.getSummary();
        logger.info('\n========== LLMCenter 统计摘要 ==========');
        logger.info(`Fast 管理器: ${summary.fast.available}/${summary.fast.total} 可用`);
        logger.info(`Powerful 管理器: ${summary.powerful.available}/${summary.powerful.total} 可用`);
        logger.info(`Balanced 管理器: ${summary.balanced.available}/${summary.balanced.total} 可用`);
        logger.info(`总计: ${summary.totalAvailable}/${summary.totalInstances} 可用`);
        logger.info('======================================\n');
    }

    /**
     * 重置所有管理器的状态
     */
    resetAll(): void {
        console.log('重置所有管理器状态...');
        this.managers.forEach((manager, tag) => {
            console.log(`重置 ${tag} 管理器...`);
            manager.resetAllInstances();
        });
        console.log('LLMCenter 所有管理器已重置');
    }

    /**
     * 重置指定管理器的状态
     */
    resetManager(tag: LLMTag): boolean {
        const manager = this.managers.get(tag);
        if (!manager) {
            console.error(`无效的 tag: ${tag}`);
            return false;
        }

        manager.resetAllInstances();
        console.log(`${tag} 管理器已重置`);
        return true;
    }

    /**
     * 获取最佳性能的实例（跨所有管理器）
     */
    getBestPerformingInstance(): {
        tag: LLMTag;
        instanceId: string;
    } | null {
        const candidates: Array<{ tag: LLMTag; instanceId: string; manager: LLMManager }> = [];

        for (const [tag, manager] of this.managers.entries()) {
            const bestId = manager.getBestPerformingInstance();
            if (bestId) {
                candidates.push({ tag, instanceId: bestId, manager });
            }
        }

        if (candidates.length === 0) {
            return null;
        }

        // 如果只有一个候选，直接返回
        if (candidates.length === 1) {
            return { tag: candidates[0].tag, instanceId: candidates[0].instanceId };
        }

        // 比较候选实例的性能
        let best = candidates[0];
        let bestStats = best.manager.getInstancesStatus()
            .find(s => s.id === best.instanceId)!;

        for (let i = 1; i < candidates.length; i++) {
            const candidate = candidates[i];
            const stats = candidate.manager.getInstancesStatus()
                .find(s => s.id === candidate.instanceId)!;

            // 比较成功率和响应时间
            if (stats.successRate > bestStats.successRate ||
                (stats.successRate === bestStats.successRate &&
                    stats.averageResponseTime < bestStats.averageResponseTime)) {
                best = candidate;
                bestStats = stats;
            }
        }

        return { tag: best.tag, instanceId: best.instanceId };
    }

    /**
     * 检查是否有可用的实例
     */
    hasAvailableInstances(): boolean {
        return this.getSummary().totalAvailable > 0;
    }

    /**
     * 检查指定管理器是否有可用实例
     */
    hasAvailableInstancesInManager(tag: LLMTag): boolean {
        const manager = this.managers.get(tag);
        return manager ? manager.getAvailableInstanceCount() > 0 : false;
    }

    /**
     * 获取第一个有可用实例的管理器（速度优先）
     * 默认顺序: fast -> balanced -> powerful
     * @param order 查找顺序，可以是完整的三个标签数组，或者只提供前两个
     * @returns 第一个有可用实例的管理器，如果都没有则返回 null
     */
    speedFirst(
        order: [LLMTag, LLMTag, LLMTag] | [LLMTag, LLMTag] = ['fast', 'balanced', 'powerful']
    ): LLMManager | null {
        return this.getFirstAvailableByOrder(order);
    }

    /**
     * 获取第一个有可用实例的管理器（性能优先）
     * 默认顺序: powerful -> balanced -> fast
     * @param order 查找顺序，可以是完整的三个标签数组，或者只提供前两个
     * @returns 第一个有可用实例的管理器，如果都没有则返回 null
     */
    powerFirst(
        order: [LLMTag, LLMTag, LLMTag] | [LLMTag, LLMTag] = ['powerful', 'balanced', 'fast']
    ): LLMManager | null {
        return this.getFirstAvailableByOrder(order);
    }

    /**
     * 根据指定顺序获取第一个有可用实例的管理器（私有方法）
     */
    private getFirstAvailableByOrder(
        order: [LLMTag, LLMTag, LLMTag] | [LLMTag, LLMTag]
    ): LLMManager | null {
        const fullOrder = this.completeOrder(order);

        for (const tag of fullOrder) {
            const manager = this.managers.get(tag);
            if (manager && manager.getAvailableInstanceCount() > 0) {
                return manager;
            }
        }

        return null;
    }

    /**
     * 补全查找顺序（私有辅助方法）
     * 如果只提供两个标签，自动补全第三个
     */
    private completeOrder(order: [LLMTag, LLMTag, LLMTag] | [LLMTag, LLMTag]): [LLMTag, LLMTag, LLMTag] {
        if (order.length === 3) {
            return order;
        }

        const allTags: LLMTag[] = ['fast', 'balanced', 'powerful'];
        const missingTag = allTags.find(tag => !order.includes(tag))!;

        return [...order, missingTag] as [LLMTag, LLMTag, LLMTag];
    }
}

export const llmCenter = new LLMCenter();