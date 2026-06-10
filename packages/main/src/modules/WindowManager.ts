import type { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';
import { BrowserWindow, screen, Rectangle } from 'electron';
import type { AppInitConfig } from '../AppInitConfig.js';
import { configService } from '$libs/store/index.js'
// import { debounce } from 'radashi';


// 防止窗口恢复到不可见区域（多显示器场景）
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

export function ensureWindowVisible(win: BrowserWindow) {
  const bounds = win.getBounds();

  if (!isVisibleOnAnyDisplay(bounds)) {
    win.center();
  }
}

class WindowManager implements AppModule {
  readonly #preload: { path: string };
  readonly #renderer: { path: string } | URL;
  readonly #openDevTools;

  constructor({ initConfig, openDevTools = false }: { initConfig: AppInitConfig, openDevTools?: boolean }) {
    this.#preload = initConfig.preload;
    this.#renderer = initConfig.renderer;
    this.#openDevTools = openDevTools;
  }

  async enable({ app }: ModuleContext): Promise<void> {
    await app.whenReady();
    await this.restoreOrCreateWindow(true);
    app.on('second-instance', async () => { // event, commandLine, workingDirectory, additionalData) => {
      // console.log("second:", event, commandLine, workingDirectory, additionalData)
      // this.restoreOrCreateWindow(true)
      // 开始创建新窗口。
      const win = await this.createWindow();
      this.showWindow(win);
    });
    app.on('activate', () => this.restoreOrCreateWindow(true));
  }

  private createWindowInstance(): BrowserWindow {

    const win = new BrowserWindow({

      show: false, // Use the 'ready-to-show' event to show the instantiated BrowserWindow.
      // 无边框
      frame: false,

      // macOS 更好看
      titleBarStyle: 'hidden',

      // 透明可选
      transparent: false,

      // 自定义阴影
      hasShadow: true,

      // 可调整大小
      resizable: true,

      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Sandbox disabled because the demo of preload script depend on the Node.js api
        webviewTag: false, // The webview tag is not recommended. Consider alternatives like an iframe or Electron's BrowserView. @see https://www.electronjs.org/docs/latest/api/webview-tag#warning
        preload: this.#preload.path,
      },
    });

    // 防止窗口恢复到不可见区域（多显示器场景）
    ensureWindowVisible(win);
    // 恢复窗口状态
    if (configService().isMaximized()) {
      win.maximize();
    }

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

  showWindow(window: BrowserWindow) {
    if (window.isMinimized()) {
      window.restore();
    }

    window?.show();

    if (this.#openDevTools) {
      window?.webContents.openDevTools();
    }

    window.focus();
  }

  // 当没有任意窗口打开时，创建新窗口.
  async restoreOrCreateWindow(show = false) {
    let window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());

    if (window === undefined) {
      window = await this.createWindow();
    }

    if (show) {
      this.showWindow(window);
    }

    return window;
  }

}

export function createWindowManagerModule(...args: ConstructorParameters<typeof WindowManager>) {
  return new WindowManager(...args);
}
