import { AppInitConfig } from "$types/AppInitConfig.js";
import { WindowEventPayload, WindowEventType } from "$types/shared/rpcevt.js";
import { BrowserWindow, Rectangle, nativeTheme, screen } from "electron";
import Logger from "electron-log/main.js";
import { RpcContext } from "../../api/type.js";
import { notify } from "./rpcevt.js";
import { closeSplash } from "./splash.js";

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

// ─── 每窗口 reveal 状态 ─────────────────────────────────────────

interface RevealState {
  /** ready-to-show 已触发（Chromium 首帧已就绪） */
  readyToShow: boolean;
  /** renderer 或 fallback 已声明希望显示 */
  revealRequested: boolean;
  /** 已执行 show + closeSplash */
  revealed: boolean;
  /** ready-to-show → 等待 renderer reveal 的超时兜底 */
  revealFallbackTimer: ReturnType<typeof setTimeout> | null;
  /** 从窗口创建起算，无论何种情况都必须显示的兜底 */
  hardShowTimer: ReturnType<typeof setTimeout> | null;
}

const REVEAL_FALLBACK_MS = 4000;
const HARD_SHOW_MS = 15_000;

// ─── 窗口服务 ───────────────────────────────────────────────────

export class WindowService {
  readonly #preload: { path: string };
  readonly #renderer: { path: string } | URL;
  readonly #openDevTools: boolean;
  private readonly dialogOpenSet = new Set<number>();
  private readonly revealStates = new WeakMap<BrowserWindow, RevealState>();

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

  // ── reveal 状态管理 ─────────────────────────────────────────

  private getRevealState(win: BrowserWindow): RevealState {
    let st = this.revealStates.get(win);
    if (!st) {
      st = {
        readyToShow: false,
        revealRequested: false,
        revealed: false,
        revealFallbackTimer: null,
        hardShowTimer: null,
      };
      this.revealStates.set(win, st);
    }
    return st;
  }

  private clearRevealTimers(st: RevealState): void {
    if (st.revealFallbackTimer) {
      clearTimeout(st.revealFallbackTimer);
      st.revealFallbackTimer = null;
    }
    if (st.hardShowTimer) {
      clearTimeout(st.hardShowTimer);
      st.hardShowTimer = null;
    }
  }

  /**
   * [关键闸门] 尝试显示主窗口并关闭 splash。
   *
   * show 的前置条件：
   *   - readyToShow = true（Chromium 首帧已完成，show 不会出现空白）
   *   - revealRequested = true（renderer 或 fallback 已声明希望显示）
   *
   * 任一未满足 → 直接返回，等后续事件/API 再次调用 tryReveal（gate 会自然推进）。
   *
   * 幂等 + 无副作用：只要 st.revealed = true，后续调用都是 no-op。
   */
  private tryReveal(win: BrowserWindow, reason: string): void {
    if (win.isDestroyed()) return;
    const st = this.getRevealState(win);
    if (st.revealed) return;
    if (!st.readyToShow) {
      Logger.debug(
        `[Window] tryReveal(${reason}): waiting ready-to-show (revealed=${st.revealRequested})`,
      );
      return;
    }
    if (!st.revealRequested) {
      Logger.debug(
        `[Window] tryReveal(${reason}): ready-to-show done, waiting renderer reveal`,
      );
      return;
    }
    st.revealed = true;
    this.clearRevealTimers(st);
    Logger.debug(`[Window] tryReveal(${reason}): SHOW main window + close splash`);
    if (!win.isVisible()) win.show();
    win.focus();
    closeSplash(reason);
  }

  /**
   * Renderer 侧调用：请求"显示主窗口（并关闭 splash）"。
   *
   * 幂等；如果 ready-to-show 尚未触发会排队等待，ready-to-show 触发时自动 show。
   * 返回值仅表示"请求已登记"，不代表窗口已显示。
   */
  reveal(win: BrowserWindow, reason = "renderer"): boolean {
    if (win.isDestroyed()) return false;
    const st = this.getRevealState(win);
    if (st.revealed) {
      Logger.debug(`[Window] reveal(${reason}): already revealed`);
      return true;
    }
    Logger.debug(
      `[Window] reveal(${reason}): readyToShow=${st.readyToShow}`,
    );
    st.revealRequested = true;
    this.tryReveal(win, reason);
    return true;
  }

  // ── 窗口事件绑定 ─────────────────────────────────────────────

  private stateNotify(type: WindowEventType, win: BrowserWindow) {
    const payload: WindowEventPayload = {
      type,
      windowId: win.id,
      timestamp: Date.now(),
    };
    notify(win, "winstate", payload);
  }

  private attachWindowEvents(win: BrowserWindow): void {
    win.on("maximize", () => {
      this.stateNotify("maximized", win);
    });
    win.on("unmaximize", () => {
      this.stateNotify("normal", win);
    });
    win.on("minimize", () => {
      this.stateNotify("minimized", win);
    });
    win.on("restore", () => {
      this.stateNotify("normal", win);
    });
    win.on("focus", () => {
      this.stateNotify("focus", win);
    });
    win.on("blur", () => {
      this.stateNotify("blur", win);
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
      backgroundColor: nativeTheme.shouldUseDarkColors ? "#020617" : "#f8fafc",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
        disableBlinkFeatures: "PrefersReducedMotion",
        preload: this.#preload.path,
      },
    });

    this.attachWindowEvents(win);
    this.ensureWindowVisible(win);

    return win;
  }

  async createWindow(): Promise<BrowserWindow> {
    const browserWindow = this.createWindowInstance();
    const st = this.getRevealState(browserWindow);

    // 从创建起算，无论何种情况都必须显示的兜底。
    // 若 ready-to-show 一直没来（加载链路已异常），15s 后强制推进让用户至少能操作窗口。
    st.hardShowTimer = setTimeout(() => {
      if (st.revealed || browserWindow.isDestroyed()) return;
      Logger.warn(
        `[Window] hard-show timeout (${HARD_SHOW_MS}ms): forcing reveal`,
      );
      st.readyToShow = true;
      st.revealRequested = true;
      this.tryReveal(browserWindow, "hard-show-timeout");
    }, HARD_SHOW_MS);

    // [关键] ready-to-show 是"A 门"：Chromium 首帧已完成，show 不会白屏。
    browserWindow.once("ready-to-show", () => {
      Logger.debug("[Window] main window 'ready-to-show'");
      st.readyToShow = true;

      // "B 门"：等待 renderer 主动 reveal；若 4s 内 renderer 没动静则强推。
      st.revealFallbackTimer = setTimeout(() => {
        if (st.revealed) return;
        Logger.warn(
          `[Window] reveal-fallback timeout (${REVEAL_FALLBACK_MS}ms): renderer did not reveal, forcing show`,
        );
        st.revealRequested = true;
        this.tryReveal(browserWindow, "reveal-fallback-timeout");
      }, REVEAL_FALLBACK_MS);

      // 如果 reveal 已经在 ready-to-show 之前到达，此处会立即 SHOW。
      this.tryReveal(browserWindow, "ready-to-show");
    });

    // 若窗口在 show 之前就关闭（renderer 崩溃、加载失败未触发 ready、被用户强制关闭），
    // 及时释放 splash，避免用户被困在 splash；同时清理所有 pening timer。
    browserWindow.once("closed", () => {
      const closedSt = this.revealStates.get(browserWindow);
      if (closedSt) this.clearRevealTimers(closedSt);
      this.revealStates.delete(browserWindow);
      Logger.debug("[Window] main window 'closed' before reveal settled");
      closeSplash("main-window-closed");
    });

    if (this.#renderer instanceof URL) {
      await browserWindow.loadURL(this.#renderer.href);
    } else {
      await browserWindow.loadFile(this.#renderer.path);
    }

    browserWindow.webContents.on("before-input-event", (event, input) => {
      const key = input.key.toLowerCase();
      const ctrlDown = input.control || input.meta;

      if (ctrlDown && key === "w") {
        event?.preventDefault();
        notify(browserWindow, "before-input-evt", {
          key,
          ctrlKey: input.control,
          metaKey: input.meta,
          shiftKey: input.shift,
          altKey: input.alt,
        });
      }
    });

    return browserWindow;
  }

  // 确保弹出窗口在renderer下显示。只能被Rpc调用。
  async withModalWindow<T>(
    context: Record<string, unknown>,
    fn: (parent: BrowserWindow) => Promise<T>,
  ): Promise<T> {
    const ctx = context as RpcContext;
    const parent = BrowserWindow.fromId(ctx?.project?.wid);
    if (!parent) {
      throw new Error("无法定位当前窗口！");
    }

    if (this.dialogOpenSet.has(parent.id)) {
      throw new Error(`Window ${parent.id} already has a modal dialog open`);
    }
    this.dialogOpenSet.add(parent.id);
    parent.setEnabled(false);

    try {
      return await fn(parent);
    } finally {
      parent.setEnabled(true);
      parent.focus();
      this.dialogOpenSet.delete(parent.id);
    }
  }

  // ── 窗口操作 ─────────────────────────────────────────────────

  ensureWindowVisible(win: BrowserWindow): void {
    const bounds = win.getBounds();
    if (!isVisibleOnAnyDisplay(bounds)) {
      win.center();
    }
  }

  /**
   * 语义："请展示这个窗口"。
   *
   * 若 ready-to-show 已触发 / 已可见 → 直接 show（安全）；
   * 否则 → 登记 revealRequested 并交给 tryReveal，等 ready-to-show 后自动 show。
   * 从而避免在首帧前 show 造成白屏。这个语义不影响 newwin / second-instance /
   * activate 这些"用户主动想看到窗口"的场景（不过是几十毫秒的延迟）。
   */
  showWindow(window: BrowserWindow): void {
    if (window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();

    const st = this.getRevealState(window);

    if (window.isVisible()) {
      // 已可见 → 仅聚焦，不做多余动作
      window.focus();
      closeSplash("showWindow-visible");
    } else if (st.readyToShow) {
      // 首帧已就绪 → 安全 show
      window.show();
      window.focus();
      st.revealed = true;
      this.clearRevealTimers(st);
      closeSplash("showWindow-ready");
    } else {
      // 首帧尚未就绪 → 登记 request，等 ready-to-show 后由 tryReveal 完成 show
      st.revealRequested = true;
      this.tryReveal(window, "showWindow-wait-ready");
    }

    if (this.#openDevTools && !window.webContents.isDevToolsOpened()) {
      window.webContents.openDevTools();
    }
  }

  async restoreOrCreateWindow(show = false): Promise<BrowserWindow> {
    // 排除 agent 窗口与 splash 窗口，只查找普通用户窗口
    const userWindow = BrowserWindow.getAllWindows().find(
      (w) =>
        !w.isDestroyed() &&
        !(w as unknown as Record<string, unknown>).__isAgentWindow &&
        !(w as unknown as Record<string, unknown>).__isSplashScreen,
    );

    let result = userWindow;
    if (result === undefined) {
      result = await this.createWindow();
    }

    if (show) {
      this.showWindow(result);
    }

    return result;
  }

  // ── 查询当前窗口状态 ─────────────────────────────────────────

  getWindowState(win: BrowserWindow): WindowEventType {
    if (win.isMinimized()) return "minimized";
    if (win.isMaximized()) return "maximized";
    return "normal";
  }
}