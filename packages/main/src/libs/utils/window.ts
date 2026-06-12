import { BrowserWindow, screen, Rectangle } from "electron";
import { AppInitConfig } from "$types/AppInitConfig.js";
import { WindowEventType, WindowEventPayload } from "$types/shared/window.js";
import { NotifyContract } from "$types/shared/api.js";

// ─── 工具函数 ───────────────────────────────────────────────────

function isVisibleOnAnyDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return !(
      bounds.x + bounds.width < area.x ||
      bounds.x > area.x + area.width ||
      bounds.y + bounds.height < area.y ||
      bounds.y > area.y + area.height
    );
  });
}

const NotifyChannelName = "ug-notification";
// ─── 窗口服务 ───────────────────────────────────────────────────

export class WindowService {
  readonly #preload: { path: string };
  readonly #renderer: { path: string } | URL;
  readonly #openDevTools: boolean;

  constructor({
    initConfig,
    openDevTools = false,
  }: {
    initConfig: AppInitConfig;
    openDevTools?: boolean;
  }) {
    this.#preload = initConfig.preload;
    this.#renderer = initConfig.renderer;
    this.#openDevTools = openDevTools;
  }

  // ── 单例 ────────────────────────────────────────────────────

  static #instance: WindowService | undefined;

  static get instance(): WindowService {
    if (!WindowService.#instance) {
      throw new Error("WindowService尚未初始化!");
    }
    return WindowService.#instance;
  }

  static init(opts: { initConfig: AppInitConfig; openDevTools?: boolean }) {
    if (!WindowService.#instance) {
      WindowService.#instance = new WindowService(opts);
    }
    return WindowService.#instance;
  }

  /**
   * 通知：触发事件 → 通过 IPC 通知renderer
   */
  notify(type: WindowEventType, win: BrowserWindow): void {
    const payload: WindowEventPayload = {
      type,
      windowId: win.id,
      timestamp: Date.now(),
    };
    // 1. 通过 IPC 发送给renderer（webContents 可能已销毁）
    if (!win.isDestroyed() && win.webContents) {
      const evt: NotifyContract = {
        name: "winstate",
        srcId: -1,
        payload,
      };
      win.webContents.send(NotifyChannelName, evt);
    }
  }

  broadcast(evt: NotifyContract): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      // 1. 通过 IPC 发送给renderer（webContents 可能已销毁）
      if (!win.isDestroyed() && win.webContents) {
        win.webContents.send(NotifyChannelName, evt);
      }
    });
  }

  // ── 窗口事件绑定 ─────────────────────────────────────────────

  /**
   * 将原生窗口事件映射到统一的 notify 派发
   */
  private attachWindowEvents(win: BrowserWindow): void {
    win.on("maximize", () => {
      this.notify("maximized", win);
    });

    win.on("unmaximize", () => {
      this.notify("normal", win);
    });

    win.on("minimize", () => {
      this.notify("minimized", win);
    });

    win.on("restore", () => {
      // restore 可能从最小化或最大化恢复，统一为 normal
      this.notify("normal", win);
    });

    win.on("focus", () => {
      this.notify("focus", win);
    });

    win.on("blur", () => {
      this.notify("blur", win);
    });
  }

  // ── 窗口创建 ─────────────────────────────────────────────────

  private createWindowInstance(): BrowserWindow {
    const win = new BrowserWindow({
      width: 640,
      height: 480,
      show: false,
      titleBarStyle: "hidden",
      transparent: false,
      hasShadow: true,
      resizable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
        // 关键：关闭无障碍动画抑制
        enableBlinkFeatures: 'CSSAnimations,CSSTransitions',
        disableBlinkFeatures: 'PrefersReducedMotion',
        preload: this.#preload.path,
      },
    });

    //绑定窗口事件 → notify
    this.attachWindowEvents(win);

    // 防止窗口恢复到不可见区域
    this.ensureWindowVisible(win);

    return win;
  }

  async createWindow(): Promise<BrowserWindow> {
    const browserWindow = this.createWindowInstance();

    if (this.#renderer instanceof URL) {
      await browserWindow.loadURL(this.#renderer.href);
    } else {
      await browserWindow.loadFile(this.#renderer.path);
    }

    return browserWindow;
  }

  // ── 窗口操作 ─────────────────────────────────────────────────

  ensureWindowVisible(win: BrowserWindow): void {
    const bounds = win.getBounds();
    if (!isVisibleOnAnyDisplay(bounds)) {
      win.center();
    }
  }

  showWindow(window: BrowserWindow): void {
    if (window.isMinimized()) {
      window.restore();
    }

    window.show();

    if (this.#openDevTools) {
      window.webContents.openDevTools();
    }

    window.focus();
  }

  async restoreOrCreateWindow(show = false): Promise<BrowserWindow> {
    let window = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());

    if (window === undefined) {
      window = await this.createWindow();
    }

    if (show) {
      this.showWindow(window);
    }

    return window;
  }

  // ── 查询当前窗口状态 ─────────────────────────────────────────

  /**
   * 获取指定窗口的当前状态快照
   */
  getWindowState(win: BrowserWindow): WindowEventType {
    if (win.isMinimized()) return "minimized";
    if (win.isMaximized()) return "maximized";
    return "normal";
  }
}
