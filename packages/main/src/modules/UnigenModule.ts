import { intereg } from '$libs/blueprint/index.js';
import { getGlobalSearchDB, openGlobalSearch } from '$libs/searchsrv/index.js';
import { configService } from '$libs/store/index.js';
import { secondConfig } from '$libs/store/second.js';
import { initGlobalToolDB } from '$libs/tooldb/bootstrap.js';
import { syncToolsToSearchDB } from '$libs/tooldb/search-sync.js';
import { puppeteerInst } from '$libs/utils/puppeteer/index.js';
import { broadcast } from '$libs/utils/rpcevt.js';
import { themeFile } from '$libs/utils/sys/dir.js';
import { telemetryService } from '$libs/utils/telemetry/telemetry.service.js';
import { nativeTheme } from 'electron';
import { ensureDir } from 'fs-extra';
import type { AppModule } from '../AppModule.js';
import { ModuleContext } from '../types/ModuleContext.js';

async function initSearch(): Promise<void> {
    // if (secondConfig().get("search_inited")) {
    //     return
    // }
    const db = getGlobalSearchDB();
    await Promise.all([
        db.syncSystemKC(),
        db.syncSystemSkills(),
        syncToolsToSearchDB(),
        // 调用tool的注册，把tool加入到检索中心去。
    ])
    secondConfig().set("search_inited", true);
}

class UnigenModule implements AppModule {
    async enable({ app }: ModuleContext): Promise<void> {
        const tooldbPromise = initGlobalToolDB();
        await app.whenReady()
        intereg.init();
        nativeTheme.themeSource = 'system'

        nativeTheme.on('updated', () => {
            broadcast({
                name: "sys:usedark",
                srcId: -1,
                payload: nativeTheme.shouldUseDarkColorsForSystemIntegratedUI
            })
        })

        // 不再自动判断所处位置，而是暴露选项，让用户选择。根据选项值来决定更新服务器，下载服务器等信息。
        // ipInfo.init().catch(e => Logger.error(`[IPINFO] 获取国家代码出错：${getErrorMessage(e)}`))
        await Promise.all([
            ensureDir(themeFile()),
            telemetryService.initialize(configService().get("telemetry")),
            puppeteerInst.init(),
            openGlobalSearch(),
            tooldbPromise
        ]);
        configService().oTel = telemetryService;

        //阶段2初始化，依赖上面的初始化的，比如依赖GlobalSearch的tool注册。
        await Promise.all([
            initSearch()
        ])
    }
}

export function unigenModule(...args: ConstructorParameters<typeof UnigenModule>) {
    return new UnigenModule(...args);
}