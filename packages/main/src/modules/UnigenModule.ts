import { intereg } from '$libs/blueprint/index.js';
import { codeRuntimeManager } from '$libs/coderuntime/index.js';
import { STARTUP_TASK_ID } from '$libs/const.js';
import { mcpRoute } from '$libs/mcp/index.js';
import { bootMcpTools } from '$libs/mcp/sync.js';
import {
    getGlobalEmbeddingService,
    getGlobalRerankService,
    getGlobalSearchDB,
    openGlobalSearch,
} from '$libs/searchsrv/index.js';
import { configService } from '$libs/store/index.js';
import { checkAndUpdateIsChina } from '$libs/store/ip.js';
import { stableConfig } from '$libs/store/stable.js';
import { initGlobalToolDB } from '$libs/tooldb/bootstrap.js';
import { globalToolDB } from '$libs/tooldb/index.js';
import { syncToolsToSearchDB } from '$libs/tooldb/search-sync.js';
import { puppeteerInst } from '$libs/utils/puppeteer/index.js';
import { broadcast } from '$libs/utils/rpcevt.js';
import { themeFile } from '$libs/utils/sys/dir.js';
import { report, type TaskWarning } from '$libs/utils/task-progress.js';
import { telemetryService } from '$libs/utils/telemetry/telemetry.service.js';
import { nativeTheme } from 'electron';
import Logger from 'electron-log/main.js';
import { ensureDir } from 'fs-extra';
import type { AppModule } from '../AppModule.js';
import { ModuleContext } from '../types/ModuleContext.js';

async function initSearch(): Promise<void> {
    if (stableConfig().get("search_inited")) {
        return
    }
    const db = getGlobalSearchDB();
    await Promise.all([
        db.syncSystemKC(),
        db.syncSystemSkills(),
        syncToolsToSearchDB(),
        // 调用tool的注册，把tool加入到检索中心去。
    ])
    stableConfig().set("search_inited", true);
}

/** 从任意失败对象中提取人类可读的细节 */
function formatFailure(failure: unknown): string | undefined {
    if (!failure) return undefined;
    if (typeof failure === "string") return failure;
    if (failure instanceof Error) return failure.message;
    if (typeof failure === "object" && "message" in failure) {
        return String((failure as { message: unknown }).message);
    }
    try {
        return JSON.stringify(failure);
    } catch {
        return String(failure);
    }
}

/**
 * 收集 searchsrv 当前的降级状态为增量警告列表。
 *
 * - embedding 降级：向量检索不可用，FTS 仍可工作
 * - rerank 降级：结果未重排
 *
 * 这里只读当前快照，不触发加载；加载失败的实时上报由各 service 的
 * `isEnabled()` 负责。这些警告随后通过一次 `report(...)` 的
 * `warnings` 参数（增量语义）带出去，客户端按 `warning.id` 累积去重。
 */
function collectSearchDegradationWarnings(): TaskWarning[] {
    const out: TaskWarning[] = [];
    const embedSvc = getGlobalEmbeddingService();
    const rerankSvc = getGlobalRerankService();
    const now = Date.now();

    if (embedSvc.degraded) {
        out.push({
            id: "search.embedding.degraded",
            level: "warn",
            code: "search.embedding.degraded",
            message: "向量检索不可用，已自动降级为全文检索。",
            detail: formatFailure(embedSvc.failure),
            timestamp: now,
        });
    }
    if (rerankSvc.degraded) {
        out.push({
            id: "search.rerank.degraded",
            level: "warn",
            code: "search.rerank.degraded",
            message: "重排序不可用，检索结果将不会重排。",
            detail: formatFailure(rerankSvc.failure),
            timestamp: now,
        });
    }
    return out;
}

class UnigenModule implements AppModule {
    async enable({ app }: ModuleContext): Promise<void> {
        const tooldbPromise = initGlobalToolDB();
        await app.whenReady();
        report(STARTUP_TASK_ID, "app-ready", "应用就绪，正在加载基础组件...", 10);

        intereg.init();
        nativeTheme.themeSource = 'system'

        nativeTheme.on('updated', () => {
            broadcast({
                name: "sys:usedark",
                srcId: -1,
                payload: nativeTheme.shouldUseDarkColorsForSystemIntegratedUI
            })
        })

        // 网络区域探测（中国区决定镜像源）：
        // 不阻塞启动主路径，但作为基础组件之一加入 Promise.all；
        // 内部超时 3s，探测失败时保守视为中国（isChina = true）。
        report(
            STARTUP_TASK_ID,
            "search-db",
            "正在初始化检索数据库（首次启动需加载向量模型，请稍候）...",
            15,
        );
        await Promise.all([
            ensureDir(themeFile()),
            telemetryService.initialize(configService().get("telemetry")),
            puppeteerInst.init(),
            openGlobalSearch(),
            tooldbPromise,
            checkAndUpdateIsChina(),
        ]);
        configService().oTel = telemetryService;

        // 抵达「检索数据库已就绪」这一步；把降级警告合并在本次 report 里发送。
        // warnings 是增量语义：客户端按 warning.id 去重累积，不会重复展示。
        report(
            STARTUP_TASK_ID,
            "search-db",
            "检索数据库已就绪",
            30,
            collectSearchDegradationWarnings(),
        );

        // 阶段2初始化，依赖上面的初始化的，比如依赖GlobalSearch的tool注册。
        report(STARTUP_TASK_ID, "search-sync", "正在同步系统索引...", 40);
        await Promise.all([
            initSearch()
        ])
        report(STARTUP_TASK_ID, "search-sync", "系统索引同步完成", 55);

        // 与initSearch不并行的原因，是都要写tool表，不确认lancedb对同一张表的并行写入是否安全。
        // MCP 配置初始化：每次启动都执行，保证 mcpRoute 持有当前配置；
        // 但 bootMcpTools 只对"持久化缺失 / 新增"的 server 做 discover，
        // 已持久化且未缺失的 server 不会建立连接，保持懒加载。
        // 退出清理由 McpRoute 构造时注册的 appLife.beforeQuit 负责。
        report(STARTUP_TASK_ID, "mcp", "正在初始化 MCP 服务器...", 60);
        await bootMcpTools(
            mcpRoute,
            globalToolDB,
            configService().get("mcpServers") ?? [],
        );
        report(STARTUP_TASK_ID, "mcp", "MCP 服务器已就绪", 85);

        // 代码运行时初始化：
        //   - CodeRuntimeManager 内部通过 `report("code-runtime:<engine>", …)`
        //     直接广播自己的阶段快照；客户端订阅对应 taskId 即可获知进度；
        //   - **不阻塞启动**：运行时安装可能触发大归档下载（几十 MB 到
        //     上百 MB），下载时长不可控；code-runtime 的 tools 也不是启动
        //     必须依赖。因此这里 fire-and-forget，只负责"给一个启动执行
        //     时机"，不等待其完成；
        //   - 默认未启用（codeRuntime.enabled = false），未启用时内部直接
        //     返回、不做任何下载；
        //   - 状态持久化：安装进度 / 失败原因写入 StableConfig（由 manager
        //     负责），进程崩溃后由 manager 内部收敛；客户端如需权威状态
        //     请查 `codeRuntimeManager.getState(engineId)`；
        //   - 调用链安全：manager.init 内部已有完整 try/catch 兜底；此处
        //     再挂 `.catch(...)` 作为最后一层防线，防止任何异常逃逸为
        //     unhandled rejection 拖垮主进程。
        report(
            STARTUP_TASK_ID,
            "code-runtime",
            "正在调度代码运行时初始化（后台）...",
            88,
        );
        void codeRuntimeManager.init().catch((error) => {
            Logger.error(
                `[UnigenModule] code-runtime 初始化调度失败：${error instanceof Error ? error.message : String(error)}`,
            );
        });
        report(STARTUP_TASK_ID, "code-runtime", "代码运行时初始化已调度", 95);
    }
}

export function unigenModule(...args: ConstructorParameters<typeof UnigenModule>) {
    return new UnigenModule(...args);
}