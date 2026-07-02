import { nativeTheme } from 'electron';
import type { AppModule } from '../AppModule.js';
import { ModuleContext } from '../types/ModuleContext.js';
// import Logger from 'electron-log/main';
import { intereg } from '$libs/utils/blueprint/index.js';
import { broadcast } from '$libs/utils/rpcevt.js';

// unigen的应用级初始化。
class UnigenModule implements AppModule {
    enable({ app }: ModuleContext): void {
        app.whenReady().then(() => {
            intereg.init();
            nativeTheme.themeSource = 'system'

            // 3. 监听系统主题切换（实时变化）
            nativeTheme.on('updated', () => {
                // const now = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ? 'dark' : 'light'
                // Logger.info('系统主题切换为：', now)

                broadcast({
                    name: "sys:usedark",
                    srcId: -1,
                    payload: nativeTheme.shouldUseDarkColorsForSystemIntegratedUI
                })
            })
        });
    }
}

export function unigenModule(...args: ConstructorParameters<typeof UnigenModule>) {
    return new UnigenModule(...args);
}
