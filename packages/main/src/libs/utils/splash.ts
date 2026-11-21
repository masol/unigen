import { BrowserWindow } from "electron";
import Logger from "electron-log/main.js";

const KEY = Symbol.for("unigen.singleton.splashState");
const MIN_VISIBLE_MS = 300;

interface SplashState {
    win: BrowserWindow | null;
    shownAt: number;
    closed: boolean;
}

const g = globalThis as unknown as Record<symbol, SplashState | undefined>;

function getState(): SplashState {
    return (g[KEY] ??= { win: null, shownAt: 0, closed: true });
}

function looksLikeMainWindow(win: BrowserWindow): boolean {
    if (win.isDestroyed()) return false;
    if ((win as unknown as Record<string, unknown>).__isSplashScreen) return false;
    if ((win as unknown as Record<string, unknown>).__isAgentWindow) return false;
    return true;
}

/**
 * 将已展示的 splash 窗口注册到单例状态。
 *
 * 主窗口在 `ready-to-show` / `show` / `showWindow` 时通过 `closeSplash()` 主动关闭。
 * 这里的调用路径**不由 splash 自身推断主窗口状态**——splash 只在注册时做一次"如果
 * 主窗口已可见则立即关闭"的兜底，用以覆盖 Worker 并行启用造成的时序竞争。
 */
export function registerSplash(win: BrowserWindow): void {
    const st = getState();
    st.win = win;
    st.shownAt = Date.now();
    st.closed = false;

    win.once("closed", () => {
        st.closed = true;
        Logger.debug("[Splash] 'closed' event");
    });

    // 时序兜底：若在注册前主窗口已经 show 过（Race B），这段立即关闭它。
    const alreadyVisible = BrowserWindow.getAllWindows().some(
        (w) => w !== win && looksLikeMainWindow(w) && w.isVisible(),
    );
    if (alreadyVisible) {
        Logger.debug("[Splash] main window already visible at register time");
        closeSplash("register-main-already-visible");
    } else {
        Logger.debug("[Splash] registered; waiting for main window's ready-to-show/show");
    }
}

/**
 * 关闭 splash。幂等 + 时间片（minVisible）保护。
 * `reason` 只会进日志，不影响逻辑。
 */
export function closeSplash(reason = "unknown"): void {
    const st = getState();
    if (!st.win) {
        Logger.debug(`[Splash] closeSplash(${reason}): splash not registered yet, ignored`);
        return;
    }
    if (st.closed) {
        Logger.debug(`[Splash] closeSplash(${reason}): already closed`);
        return;
    }
    if (st.win.isDestroyed()) {
        st.closed = true;
        Logger.debug(`[Splash] closeSplash(${reason}): window destroyed`);
        return;
    }
    st.closed = true;
    const elapsed = Date.now() - st.shownAt;
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);
    Logger.debug(
        `[Splash] closeSplash(${reason}): closing in ${delay}ms (elapsed=${elapsed}ms)`,
    );
    setTimeout(() => {
        if (st.win && !st.win.isDestroyed()) {
            st.win.close();
            Logger.debug(`[Splash] closed (reason=${reason})`);
        }
    }, delay);
}