import { WindowService } from '$libs/utils/window.js';
import type { AppModule } from '../AppModule.js';
import type { AppInitConfig } from '../types/AppInitConfig.js';
import { ModuleContext } from '../types/ModuleContext.js';

class WindowManager implements AppModule {

  constructor({ initConfig, openDevTools = false }: { initConfig: AppInitConfig, openDevTools?: boolean }) {
    WindowService.init({ initConfig, openDevTools });
  }

  async enable({ app }: ModuleContext): Promise<void> {
    await app.whenReady();
    // 首次启动：只"创建"，不强制 show —— 主窗口的首帧 + renderer reveal
    // 由 WindowService 内部的 reveal 闸门驱动；这样避免了「首帧前 show」的白屏。
    await WindowService.instance.restoreOrCreateWindow(false);

    app.on('second-instance', async () => {
      // 用户双击图标再启动：显式创建一个新窗口并立即展示（ready-to-show 会被自动等待）。
      const win = await WindowService.instance.createWindow();
      WindowService.instance.showWindow(win);
    });

    app.on('activate', () => WindowService.instance.restoreOrCreateWindow(true));
  }
}

export function createWindowManagerModule(...args: ConstructorParameters<typeof WindowManager>) {
  return new WindowManager(...args);
}