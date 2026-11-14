// model-config/model-config.types.ts

import type { ReasoningLevel } from '@app/main/types';
import { IconBrain, IconRobot, IconTemperature, IconTool, type Icon } from '@tabler/icons-svelte';

/** 每个可覆盖设置的值：null 表示“不覆盖”——不向 RunnerParam.settings 传该字段 */
export type Auto<T> = T | null;

/** 设置分组 id；与 NAV_SECTIONS 及 store 的 overrideCountBySection 必须同步 */
export type SectionId = 'model' | 'basic' | 'sampling' | 'tools';

/** 左侧导航分组 */
export type NavSection = {
    id: SectionId;
    label: string;
    description: string;
    icon: Icon;
};

export const NAV_SECTIONS: NavSection[] = [
    { id: 'model', label: '模型与推理', description: '模型选择与思考深度', icon: IconRobot },
    { id: 'basic', label: '运行基础', description: '步数、流式与历史消息', icon: IconBrain },
    { id: 'sampling', label: '采样与输出', description: '创意度与输出上限', icon: IconTemperature },
    { id: 'tools', label: '工具与超时', description: '并发、严格模式与超时', icon: IconTool },
];

/** 推理级别的语义标签映射 */
export const REASONING_LABELS: Record<ReasoningLevel, string> = {
    'provider-default': '自动（Provider 默认）',
    none: '关闭推理',
    minimal: '极简推理',
    low: '快速推理',
    medium: '平衡推理',
    high: '深度推理',
    xhigh: '极限推理',
    max: '最大推理',
};

/** 温度 → 语义化标签 */
export function temperatureLabel(t: number): string {
    if (t <= 0.3) return '稳定 · 严谨';
    if (t <= 0.7) return '平衡';
    return '灵感 · 创意';
}

/** 解析 ProviderID::ModelID 为友好展示 */
export function prettyModel(value: string): string {
    const [pid, mid] = value.split('::');
    return `${pid} / ${mid}`;
}