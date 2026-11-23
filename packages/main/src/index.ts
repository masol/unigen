import { STARTUP_TASK_ID } from '$libs/const.js';
import { appLife } from '$libs/utils/tapable/applife.js';
import Logger from 'electron-log/main.js';
import { complete, fail, report } from './libs/utils/task-progress.js';
import { createModuleRunner } from './ModuleRunner.js';
import { terminateAppOnLastWindowClose } from './modules/ApplicationTerminatorOnLastWindowClose.js';
import { autoUpdater } from './modules/AutoUpdater.js';
import { allowInternalOrigins } from './modules/BlockNotAllowdOrigins.js';
import { allowExternalUrls } from './modules/ExternalUrls.js';
import { hardwareAccelerationMode } from './modules/HardwareAccelerationModule.js';
import { loggerModule } from './modules/LoggerModule.js';
import { orpcModule } from './modules/OrpcModule.js';
import { protocalModule, registerSchemes } from './modules/ProtocalModule.js';
import { disallowMultipleAppInstance } from './modules/SingleInstanceApp.js';
import { splashScreenModule } from './modules/SplashScreenModule.js';
import { unigenModule } from './modules/UnigenModule.js';
import { createWindowManagerModule } from './modules/WindowManager.js';
import type { AppInitConfig } from './types/AppInitConfig.js';

/**
 * 安装主进程级兜底处理器。
 *
 * 背景：第三方依赖（下载器、解压器、子进程封装等）在异常路径上偶尔会遗留
 * 未被处理的 Promise（日志里那条裸 `Promise { <rejected> ... }`）。Node 15+
 * 默认按 `--unhandled-rejections=throw` 处理，这类 rejection 会直接把主进程
 * 带崩，表现为"窗口突然关闭 + 应用退出"，而真正的原因被埋在日志中间，
 * 排查成本极高。
 *
 * 这里只做「记录 + 保活」，不吞掉具体错误：
 *   - 每条都带完整上下文写入 electron-log（落盘可追溯）；
 *   - 不再对已上报的 promise 追加 catch，避免触发 `rejectionHandled`
 *     二次告警干扰日志。
 *
 * 权衡：`uncaughtException` 兜底会让进程在"可能不一致"的状态下继续运行。
 * 对桌面应用来说，这比直接消失（用户完全不知道发生了什么）更可接受；
 * 若未来需要更严格策略，可在此处改为 `app.exit(1)` 并接入崩溃上报。
 */
function installProcessErrorGuards(): void {
  process.on('unhandledRejection', (reason) => {
    Logger.error(
      '[Main] 未处理的 Promise rejection（已兜底拦截，进程继续运行）：',
      reason,
    );
  });

  process.on('uncaughtException', (error, origin) => {
    Logger.error(
      `[Main] 未捕获异常（origin=${origin}，已兜底拦截，进程继续运行）：`,
      error,
    );
  });

  Logger.debug('[Main] 进程级异常兜底已安装（unhandledRejection / uncaughtException）。');
}

export async function initApp(initConfig: AppInitConfig) {
  // 必须最先安装：后续任何模块初始化期间的漏网 rejection 都能被记录，
  // 而不是直接把主进程带走。
  installProcessErrorGuards();

  try {
    registerSchemes();
    // 首次报告即视为"启动开始"；不再有单独的 start 语义。
    report(STARTUP_TASK_ID, "starting", "正在启动应用...", 2);

    const moduleRunner = createModuleRunner()
      .init(disallowMultipleAppInstance())
      .init(loggerModule())
      // Splash 需要在主窗口创建之前先显示，因此排在 WindowManager 之前。
      .init(splashScreenModule())
      .init(orpcModule())
      .init(protocalModule())
      .init(hardwareAccelerationMode())
      .init(createWindowManagerModule({ initConfig, openDevTools: import.meta.env.DEV }))
      .init(terminateAppOnLastWindowClose())
      .init(autoUpdater())
      // Install DevTools extension if needed
      // .init(chromeDevToolsExtension({extension: 'VUE3_DEVTOOLS'}))
      // Security
      .init(allowInternalOrigins(
        new Set(initConfig.renderer instanceof URL ? [initConfig.renderer.origin] : []),
      ))
      .init(allowExternalUrls(
        new Set(
          initConfig.renderer instanceof URL
            ? [
              'https://lizt.top',
              'https://unigen.cc',
              'https://www.lizt.top',
              'https://www.unigen.cc',
            ]
            : [],
        ))
      )
      .init(unigenModule());

    await moduleRunner;
    complete(STARTUP_TASK_ID, "初始化完成");
  } catch (error) {
    fail(
      STARTUP_TASK_ID,
      "初始化失败，请查看日志或重试。",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    appLife.bootstrapped.resolve();
  }
}