import type { AppModule } from '../AppModule.js';
import { ModuleContext } from '../types/ModuleContext.js';
import type { AppInitConfig } from '../types/AppInitConfig.js';
import { WindowService } from '$libs/utils/window.js';
// import { configService } from '$libs/store/index.js'
// import { debounce } from 'radashi';


class WindowManager implements AppModule {

  constructor({ initConfig, openDevTools = false }: { initConfig: AppInitConfig, openDevTools?: boolean }) {
    WindowService.init({ initConfig, openDevTools });
  }

  async enable({ app }: ModuleContext): Promise<void> {
    await app.whenReady();
    await WindowService.instance.restoreOrCreateWindow(true);
    app.on('second-instance', async () => { // event, commandLine, workingDirectory, additionalData) => {
      // console.log("second:", event, commandLine, workingDirectory, additionalData)
      // this.restoreOrCreateWindow(true)
      // 开始创建新窗口。
      const win = await WindowService.instance.createWindow();
      WindowService.instance.showWindow(win);
    });
    app.on('activate', () => WindowService.instance.restoreOrCreateWindow(true));
  }


}

export function createWindowManagerModule(...args: ConstructorParameters<typeof WindowManager>) {
  return new WindowManager(...args);
}
