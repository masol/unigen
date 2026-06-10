import type { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';
import { BrowserWindow, ipcMain, screen, Rectangle } from 'electron';
import type { AppInitConfig } from '../AppInitConfig.js';
// import { configService } from '$libs/store/index.js'
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
      await this.waitForRendererReady(win);
      if (!win.isDestroyed()) {
        this.showWindow(win);
      }
    });
    app.on('activate', () => this.restoreOrCreateWindow(true));
  }

  private createWindowInstance(): BrowserWindow {

    const win = new BrowserWindow({

      width: 640,
      height: 480,

      show: false, // Use the 'ready-to-show' event to show the instantiated BrowserWindow.
      // 无边框
      // frame: false,

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
    // win.maximize();

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

  // 等待渲染端通知"内容已就绪"，带超时兜底，避免窗口永久隐藏
  private waitForRendererReady(window: BrowserWindow, timeout = 5000): Promise<void> {
    return new Promise((resolve) => {
      const webContentsId = window.webContents.id;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ipcMain.off('renderer-ready', onReady);
        resolve();
      };

      const onReady = (event: Electron.IpcMainEvent) => {
        if (event.sender.id === webContentsId) {
          finish();
        }
      };

      const timer = setTimeout(finish, timeout);

      ipcMain.on('renderer-ready', onReady);

      // 窗口在就绪前被关闭，避免悬挂
      window.once('closed', finish);
    });
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
      // 等渲染端内容全部就绪后再显示，避免显示中间的加载态
      await this.waitForRendererReady(window);
      if (!window.isDestroyed()) {
        this.showWindow(window);
      }
    }

    return window;
  }

}

export function createWindowManagerModule(...args: ConstructorParameters<typeof WindowManager>) {
  return new WindowManager(...args);
}
