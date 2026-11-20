import type { Component } from 'svelte';
import LlamaCppConfig from './configs/LlamaCppConfig.svelte';

/**
 * 环境类型 → 详情页配置组件。
 * 新增环境类型时在此注册即可，EnvironmentDetail 无需改动。
 *
 * 所有配置组件的 props 约定：
 *   { environmentId: string, config: Record<string, unknown>,
 *     onPatch: (patch: Record<string, unknown>) => void }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<string, Component<any>> = {
    llamacpp: LlamaCppConfig,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveEnvironmentConfig(kind: string): Component<any> | null {
    return REGISTRY[kind] ?? null;
}