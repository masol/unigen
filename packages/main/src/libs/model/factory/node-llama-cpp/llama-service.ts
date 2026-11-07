import { appLife } from '$libs/utils/tapable/applife.js';
import Logger from 'electron-log/main.js';
import { getLlama, type Llama } from 'node-llama-cpp';

interface LlamaServiceGlobal {
    llamaPromise: Promise<Llama> | null;
    unregisterBeforeQuit: (() => void) | null;
}

const KEY = Symbol.for('unigen.singleton.llamaService');

/**
 * 通过 globalThis + Symbol.for 获取全局状态槽位。
 * 这样即使本模块被打包成多份（ESM/CJS 双包等），
 * llamaPromise 和退出钩子也始终指向同一个全局变量。
 */
function getGlobalState(): LlamaServiceGlobal {
    const g = globalThis as unknown as Record<symbol, LlamaServiceGlobal | undefined>;
    if (!g[KEY]) {
        g[KEY] = { llamaPromise: null, unregisterBeforeQuit: null };
    }
    return g[KEY]!;
}

/**
 * 全局唯一的 Llama 实例（懒加载）。
 * 由 localEmbeding / rerankManager 共享，避免重复初始化后端。
 * 首次调用时注册进程退出清理钩子。
 */
export function getLlamaInstance(): Promise<Llama> {
    const state = getGlobalState();

    if (!state.llamaPromise) {
        state.llamaPromise = getLlama().catch((err) => {
            Logger.error('[LlamaService] 初始化 Llama 失败:', err);
            // 允许后续重试
            state.llamaPromise = null;
            throw err;
        });
    }

    // 退出钩子只注册一次；disposeLlamaInstance() 会撤销，
    // 之后再次调用 getLlamaInstance() 会重新注册。
    state.unregisterBeforeQuit ??= appLife.beforeQuit.tapPromise(
        'LlamaService',
        async () => {
            Logger.debug('[LlamaService] 正在清理 Llama 实例...');
            await disposeLlamaInstance();
            Logger.debug('[LlamaService] Llama 实例清理完成。');
        },
    );

    return state.llamaPromise;
}

/**
 * 释放全局 Llama 实例（进程退出或显式重置）。
 * 调用后再次 getLlamaInstance() 会重新初始化。
 */
export async function disposeLlamaInstance(): Promise<void> {
    const state = getGlobalState();

    state.unregisterBeforeQuit?.();
    state.unregisterBeforeQuit = null;

    const pending = state.llamaPromise;
    state.llamaPromise = null;
    if (!pending) return;

    try {
        const llama = await pending;
        await llama.dispose();
        Logger.info('[LlamaService] Llama 实例已释放');
    } catch (err) {
        Logger.error('[LlamaService] 释放 Llama 实例出错:', err);
    }
}