import { intereg } from '$libs/blueprint/index.js';
import { bootstrapCodeRuntime } from '$libs/coderuntime/index.js';
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
import { getStartupProgress } from '$libs/utils/task-progress.js';
import { telemetryService } from '$libs/utils/telemetry/telemetry.service.js';
import { nativeTheme } from 'electron';
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
 * 把 searchsrv 当前的降级状态转成 UI 警告。
 * - embedding 降级：向量检索不可用，FTS 仍可工作
 * - rerank 降级：结果未重排
 * 注意：这里只读当前快照，不触发加载。加载失败的实时上报由各 service 的 isEnabled() 负责。
 */
function reportSearchDegradationWarnings(): void {
    const progress = getStartupProgress();
    const embedSvc = getGlobalEmbeddingService();
    const rerankSvc = getGlobalRerankService();

    if (embedSvc.degraded) {
        progress.warn({
            id: "search.embedding.degraded",
            level: "warn",
            code: "search.embedding.degraded",
            message: "向量检索不可用，已自动降级为全文检索。",
            detail: formatFailure(embedSvc.failure),
        });
    }
    if (rerankSvc.degraded) {
        progress.warn({
            id: "search.rerank.degraded",
            level: "warn",
            code: "search.rerank.degraded",
            message: "重排序不可用，检索结果将不会重排。",
            detail: formatFailure(rerankSvc.failure),
        });
    }
}

class UnigenModule implements AppModule {
    async enable({ app }: ModuleContext): Promise<void> {
        const progress = getStartupProgress();

        const tooldbPromise = initGlobalToolDB();
        await app.whenReady();
        progress.report("app-ready", "应用就绪，正在加载基础组件...", 10);

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
        progress.report(
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
        progress.report("search-db", "检索数据库已就绪", 30);

        // 报告检索降级警告（如需在失败瞬间上报，各 service 的 isEnabled() 已负责）
        reportSearchDegradationWarnings();

        // 阶段2初始化，依赖上面的初始化的，比如依赖GlobalSearch的tool注册。
        progress.report("search-sync", "正在同步系统索引...", 40);
        await Promise.all([
            initSearch()
        ])
        progress.report("search-sync", "系统索引同步完成", 55);

        // 与initSearch不并行的原因，是都要写tool表，不确认lancedb对同一张表的并行写入是否安全。
        // MCP 配置初始化：每次启动都执行，保证 mcpRoute 持有当前配置；
        // 但 bootMcpTools 只对"持久化缺失 / 新增"的 server 做 discover，
        // 已持久化且未缺失的 server 不会建立连接，保持懒加载。
        // 退出清理由 McpRoute 构造时注册的 appLife.beforeQuit 负责。
        progress.report("mcp", "正在初始化 MCP 服务器...", 60);
        await bootMcpTools(
            mcpRoute,
            globalToolDB,
            configService().get("mcpServers") ?? [],
        );
        progress.report("mcp", "MCP 服务器已就绪", 85);

        // 代码运行时初始化：依赖 globalToolDB.init() 完成（以便后续 register）；
        // 与 MCP 不并行是为了避免同时修改工具表引发边界问题；
        // 默认未启用（codeRuntime.enabled = false），此时直接返回、不做任何下载。
        progress.report("code-runtime", "正在初始化代码运行时...", 88);
        await bootstrapCodeRuntime();
        progress.report("code-runtime", "代码运行时初始化完成", 95);
    }
}

export function unigenModule(...args: ConstructorParameters<typeof UnigenModule>) {
    return new UnigenModule(...args);
}