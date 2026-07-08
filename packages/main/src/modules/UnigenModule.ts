import { nativeTheme } from 'electron';
import type { AppModule } from '../AppModule.js';
import { ModuleContext } from '../types/ModuleContext.js';
// import Logger from 'electron-log/main';
import { intereg } from '$libs/utils/blueprint/index.js';
import { broadcast } from '$libs/utils/rpcevt.js';
import { themeFile } from '$libs/utils/sys/dir.js';
import { ensureDir } from 'fs-extra';

// unigen的应用级初始化。
class UnigenModule implements AppModule {
    async enable({ app }: ModuleContext): Promise<void> {
        await app.whenReady()
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

        // 确保主题目录存在.
        await ensureDir(themeFile());

        // await knowledgeCenter.init();
    }
}

export function unigenModule(...args: ConstructorParameters<typeof UnigenModule>) {
    return new UnigenModule(...args);
}
