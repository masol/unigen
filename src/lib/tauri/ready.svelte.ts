import { browser } from '$app/environment';

let tauriReady = false;
let readyPromise: Promise<void> | null = null;

export async function waitForTauri() {
    if (!browser) return;
    if (tauriReady) return;

    if (readyPromise) return readyPromise;

    readyPromise = new Promise((resolve) => {
        // 检查 __TAURI__ 是否存在
        const checkTauri = () => {
            // @ts-expect-error 忽略错误．
            if (window.__TAURI__) {
                tauriReady = true;
                resolve();
            } else {
                setTimeout(checkTauri, 100);
            }
        };

        // 延迟一点时间确保 IPC 准备好
        setTimeout(checkTauri, 500);
    });

    return readyPromise;
}

export function isTauriReady() {
    return tauriReady;
}