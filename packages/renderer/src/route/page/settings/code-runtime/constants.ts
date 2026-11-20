import type { CodeRuntimeStatus } from './types';

/**
 * 只保留 UI 状态到文案/样式的映射。
 * 支持的语言清单由服务器返回（见 service.ts），这里不做任何硬编码。
 */
export const STATUS_LABEL: Record<CodeRuntimeStatus, string> = {
    disabled: '未启用',
    preparing: '准备中',
    ready: '已就绪',
    failed: '启动失败',
};

export const STATUS_CLASS: Record<CodeRuntimeStatus, string> = {
    disabled: 'bg-muted text-muted-foreground',
    preparing: 'bg-amber-500/10 text-amber-700',
    ready: 'bg-emerald-500/10 text-emerald-700',
    failed: 'bg-destructive/10 text-destructive',
};