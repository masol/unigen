import { closeSplash, registerSplash } from '$libs/utils/splash.js';
import { BrowserWindow } from "electron";
import Logger from "electron-log/main.js";
import type { AppModule } from "../AppModule.js";
import type { ModuleContext } from "../types/ModuleContext.js";

/**
 * 启动 Splash 窗口。
 *
 * 特征：
 * - 完全静态，不加载任何外部文件 / 网络资源（data: URL，内联 SVG/CSS）。
 * - 在 app ready 后第一时间显示，不等任何业务模块。
 *
 * 生命周期契约：
 * - 本模块只负责"创建并展示 + 注册到单例"。
 * - **关闭时机由主窗口决定**（WindowService 的 ready-to-show / show /
 *   showWindow 主动调用 `closeSplash()`），与业务状态解耦、与视觉无耦合。
 * - 若主窗口 30s 内仍未 show（说明创建链路异常），本模块兜底强制关闭，
 *   并以 warn 级别写日志——正常运行时这条路径永远不应被触发。
 *
 * 为什么不使用 @trodi/electron-splashscreen：
 * - 该库的定位是"给已存在/可预先构造的主窗口套层"，需要配合其主窗口创建时机，
 *   与当前 WindowService 延迟 + 异步 loadFile 的模式线路不一致；
 * - 这里的能力用一个约 120 行的模块即可实现，不引入额外的时序契约。
 */
function buildSplashHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>Unigen</title>
<style>
    :root { color-scheme: light dark; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue",
                     "PingFang SC", "Microsoft YaHei", sans-serif;
        display: grid; place-items: center;
        color: #0f172a;
    }
    @media (prefers-color-scheme: dark) { body { color: #e2e8f0; } }
    .card {
        position: relative;
        width: 100%; height: 100%;
        border-radius: 16px;
        background: linear-gradient(135deg, #f8fafc 0%, #ffffff 55%, #e0f2fe 100%);
        box-shadow: 0 20px 60px -20px rgba(15, 23, 42, .35);
        overflow: hidden;
        display: grid; place-items: center;
    }
    @media (prefers-color-scheme: dark) {
        .card {
            background: linear-gradient(135deg, #020617 0%, #0f172a 55%, #1e1b4b 100%);
            box-shadow: 0 20px 60px -20px rgba(0, 0, 0, .75);
        }
    }
    .orb {
        position: absolute;
        border-radius: 9999px;
        filter: blur(48px);
        opacity: .55;
        pointer-events: none;
    }
    .orb-1 {
        width: 220px; height: 220px;
        background: radial-gradient(circle, rgba(56,189,248,.55), transparent 70%);
        top: -70px; left: -50px;
        animation: drift1 6s ease-in-out infinite;
    }
    .orb-2 {
        width: 180px; height: 180px;
        background: radial-gradient(circle, rgba(139,92,246,.45), transparent 70%);
        bottom: -60px; right: -40px;
        animation: drift2 7s ease-in-out infinite;
    }
    @keyframes drift1 {
        0%,100% { transform: translate(0,0) scale(1); }
        50%     { transform: translate(20px,30px) scale(1.15); }
    }
    @keyframes drift2 {
        0%,100% { transform: translate(0,0) scale(1); }
        50%     { transform: translate(-20px,-30px) scale(1.1); }
    }
    .stack {
        position: relative;
        display: flex; flex-direction: column; align-items: center; gap: 16px;
        text-align: center;
        z-index: 1;
    }
    .logo { position: relative; width: 84px; height: 84px; }
    .ring {
        position: absolute; inset: 0;
        border-radius: 9999px;
        border: 3px solid transparent;
    }
    .ring-a {
        border-top-color: #0ea5e9;
        border-right-color: rgba(14,165,233,.55);
        animation: spin 2.4s linear infinite;
    }
    .ring-b {
        inset: 10px;
        border-bottom-color: #6366f1;
        border-left-color: rgba(99,102,241,.55);
        animation: spin 3.2s linear infinite reverse;
    }
    .core {
        position: absolute; inset: 32px;
        border-radius: 9999px;
        background: linear-gradient(135deg, #38bdf8, #6366f1);
        box-shadow: 0 8px 20px rgba(56,189,248,.45);
        animation: pulse 1.6s ease-in-out infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse {
        0%,100% { transform: scale(1);    opacity: .85; }
        50%     { transform: scale(1.18); opacity: 1;   }
    }
    .title    { font-size: 17px; font-weight: 600; letter-spacing: .02em; }
    .subtitle { font-size: 12px; opacity: .65; }
    .dots span {
        display: inline-block;
        animation: dot 1.2s ease-in-out infinite;
    }
    .dots span:nth-child(2) { animation-delay: .2s; }
    .dots span:nth-child(3) { animation-delay: .4s; }
    @keyframes dot {
        0%,100% { opacity: .2; transform: translateY(0);  }
        50%     { opacity: 1;  transform: translateY(-3px); }
    }
</style>
</head>
<body>
    <div class="card">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="stack">
            <div class="logo">
                <div class="ring ring-a"></div>
                <div class="ring ring-b"></div>
                <div class="core"></div>
            </div>
            <div class="title">Unigen</div>
            <div class="subtitle">
                正在初始化<span class="dots"><span>.</span><span>.</span><span>.</span></span>
            </div>
        </div>
    </div>
</body>
</html>`;
}

const SPLASH_W = 360;
const SPLASH_H = 300;
/** 绝对兜底：主窗口 30s 仍未 show 时，说明创建链路已异常，强制释放 splash。 */
const HARD_TIMEOUT_MS = 30_000;

class SplashScreenModule implements AppModule {
    async enable({ app }: ModuleContext): Promise<void> {
        await app.whenReady();
        // Logger.debug("[Splash] enable() start");

        const splash = new BrowserWindow({
            width: SPLASH_W,
            height: SPLASH_H,
            center: true,
            show: false,
            frame: false,
            transparent: true,
            backgroundColor: "#00000000",
            resizable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            skipTaskbar: true,
            alwaysOnTop: true,
            hasShadow: true,
            webPreferences: {
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        (splash as unknown as Record<string, unknown>).__isSplashScreen = true;
        splash.once("closed", () => Logger.debug("[Splash] native 'closed' event"));
        splash.once("show", () => Logger.debug("[Splash] native 'show' event"));

        try {
            await splash.loadURL(
                `data:text/html;charset=utf-8,${encodeURIComponent(buildSplashHtml())}`,
            );
            Logger.debug("[Splash] loadURL resolved");
        } catch (e) {
            Logger.warn("[Splash] loadURL failed", e);
        }

        if (splash.isDestroyed()) {
            Logger.debug("[Splash] destroyed before show, abort");
            return;
        }
        splash.show();
        // Logger.debug("[Splash] shown");

        // 注册到单例：主窗口通过 closeSplash() 主动关闭；
        // registerSplash 内部也会做一次"主窗口已可见"的时序兜底。
        registerSplash(splash);

        // 终极防线（正常不应被触发；日志里出现 warn 说明主窗口 show 未走通）
        setTimeout(() => {
            if (!splash.isDestroyed()) {
                Logger.warn(
                    `[Splash] hard timeout (${HARD_TIMEOUT_MS}ms) — main window never showed; force-close`,
                );
                closeSplash("hard-timeout");
            }
        }, HARD_TIMEOUT_MS);
    }
}

export function splashScreenModule(
    ...args: ConstructorParameters<typeof SplashScreenModule>
) {
    return new SplashScreenModule(...args);
}