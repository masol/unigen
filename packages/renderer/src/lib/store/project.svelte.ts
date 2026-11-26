import SelectProjectTypeDialog from '$lib/components/dialog/project-type/SelectProjectTypeDialog.svelte';
import { api, procApiError, safeApi } from "$lib/utils/api";
import evtbus from "$lib/utils/evtbus";
import { hooks } from "$lib/utils/hook";
import { DbKeys } from "$lib/utils/service/dbkeys";
import type { ProjectActivityData, RunState } from "@app/main/types";
import { push } from "@keenmate/svelte-spa-router";
import { COMMON_ORPC_ERROR_DEFS, ORPCError } from "@orpc/client";
import Logger from "electron-log/renderer";
import { toast } from "svelte-sonner";
import { pluginStore } from "./plugin.svelte";
import { ProjectActivity } from "./ui/activity/activity";
import { confirmStore } from "./ui/confirm.svelte";
import { dialogStore } from "./ui/dialog.svelte";

type LoadingAction = "open" | "new" | null;

class ProjectStore {
    // ── 私有状态 ──────────────────────────────────────────────
    #activity = $state.raw<ProjectActivity | null>(null)
    /**
     * pluginId → PluginMeta
     * Map 整体替换触发顶层响应；Meta 内字段逐个修改触发细粒度响应
     * 选 $state 深度响应：需要对 Meta 字段做 mutation（busy / status / …）
     */
    #path = $state<string>("");
    #depPlugins: string[] | null = null;
    #runState = $state<RunState>("idle");
    loading = $state<LoadingAction>(null);

    mediaURL = $state<string>("");

    opened = $derived(this.#path.trim().length > 0)
    get path() {
        return this.#path;
    }
    get runState(): RunState {
        return this.#runState;
    }

    get activity(): ProjectActivity | null {
        // if (!this.#activity) {
        //     const msg = "当前没有有效的项目级活动信息，哪里的时序出问题了？"
        //     toast.error(msg)
        //     Logger.error(msg)
        //     throw new Error(msg)
        // }
        return this.#activity;
    }

    isBusy = $derived(this.loading !== null);

    constructor() {
        evtbus.on("task_finished", () => {
            this.#runState = "idle";
        })
    }

    private procError(e: unknown): boolean {
        procApiError(e);
        return false;
    }

    // 需要确保本函数在path设置之前执行，否则可能触发主控台报错。
    /**
     * 展示项目打开 / 创建时的通知。
     *
     * 主进程已经把「静态 status + 依赖检查结果」合并进 `activityData.status`，
     * 这里不重复拼文案，只用 `requirementIssues` 决定：
     *   - 标题（依赖检查未通过 / 依赖检查提醒 / 状态说明）；
     *   - 视觉等级（存在 error 时用危险样式）。
     *
     * 通知只是告知，**不阻塞**项目进入：用户点「我知道了」后照常使用，
     * 可随后在设置里补齐依赖。
     */
    private async setupUI(activityData: ProjectActivityData) {
        const issues = activityData.requirementIssues ?? [];
        const hasError = issues.some((issue) => issue.severity === "error");
        const status = activityData.status?.trim();

        if (status) {
            await confirmStore.request({
                title:
                    issues.length > 0
                        ? hasError
                            ? "依赖检查未通过"
                            : "依赖检查提醒"
                        : "状态说明",
                hideCancel: true,
                confirmLabel: "我知道了",
                variant: hasError ? "error" : "warning",
                markdown: true,
                size: "xl2",
                destructive: hasError,
                message: status,
            });
        }
        this.#activity = new ProjectActivity(activityData);
    }

    /**
     * 等待当前运行任务的清理完成。
     * 若项目正在 stop/close 期间，调用本方法可让 UI 感知"停止完成"的时机。
     *
     * 注意：这个方法**没有超时保护**。若 server 端 `waitFinish` 永不 resolve，
     * 这里的 `await` 会一直挂住，`#runState` 也永远不会被重置。
     * 根据运行结果，是否有异常开著，考虑在 server 端 `waitFinish` 里加 pTimeout，或此处包一层。
     */
    async waitFinish(): Promise<void> {
        try {
            await api().project.waitFinish();
            this.#runState = "idle";
        } catch (e) {
            this.procError(e);
        }
    }

    // 刷新后同步。
    async init(): Promise<void> {
        try {
            const path = await api().project.info("path");
            if (path) {
                // 已经打开了项目。同步依赖插件。
                const prjData = await safeApi().project.loadUI();
                await this.setupUI(prjData);
                // await delay(10);
                this.#path = path;
                // @todo: 获取项目的activity数据。
                this.#depPlugins = await api().project.get(DbKeys.depplugins);
                if (this.#depPlugins) {
                    await pluginStore.ensurePlugins(this.#depPlugins);
                }
                await hooks.callHookParallel("project:loaded", { path: this.#path });
            }
        } catch (e) {
            this.procError(e);
        }
    }

    /**
     * 前置检查：确保当前项目可以关闭。
     *
     * - 无项目：直接放行；
     * - 无运行中任务：直接放行；
     * - 有运行中任务：弹框让用户确认。选择「终止并继续」会调用 forceQuit；
     *   这一步失败（超时）也视为不可关闭，避免上层误关。
     *
     * 拆出来独立步骤的原因：open/create 都要在「弹目录框 / 弹类型选择框」
     * 之前先做一次确认，避免用户走完选择流程后才被运行中任务打断。
     *
     * @returns true 可关闭；false 用户放弃，或强制终止失败。
     */
    private async beforeClose(): Promise<boolean> {
        if (this.#path.length === 0) return true;

        let running: boolean;
        try {
            running = await safeApi().project.hasRunning();
        } catch (e) {
            // 查询失败（API 未就绪、项目异常等）：保守放行，让底层 close
            // 自行处理，避免因为一次查询失败就永久无法关闭项目。
            Logger.warn(
                "[ProjectStore] beforeClose: hasRunning 查询失败，跳过运行中检查",
                e,
            );
            return true;
        }

        if (!running) return true;

        const confirmed = await confirmStore.request({
            title: "有任务正在执行",
            message: [
                "**当前项目有命令正在执行。** 请选择接下来的操作：",
                "",
                "- **取消** — 不做任何操作，当前项目与任务都会保留，稍后可再试。",
                "- **终止并继续** — 强制结束所有正在执行的任务，然后继续关闭 / 切换。",
                "",
                "> **提示**：如果想同时运行多个项目而不中断当前任务，可新建窗口在其中打开另一个项目。",
            ].join("\n"),
            destructive: true,
            markdown: true,
            variant: "warning",
            size: "xl2",
            confirmLabel: "终止并继续",
        });
        if (!confirmed) return false;

        const ok = await safeApi().project.forceQuit();
        if (!ok) {
            toast.error("强制终止任务超时，请重启应用后重试");
            return false;
        }
        return true;
    }

    /**
     * 真正关闭当前项目：清空本地状态、通知主进程、触发 closed 钩子。
     *
     * 本方法**不做任何确认**；调用方必须先通过 {@link beforeClose} 确认可关闭，
     * 否则运行中任务会被主进程强制中断（丢进度）。
     */
    private async doClose(): Promise<boolean> {
        if (this.#path.length === 0) return true;

        if (await safeApi().project.close() !== true) {
            return false;
        }
        // 首先关闭项目。
        this.#path = "";
        push("/")
        if (this.#activity) {
            setTimeout(() => {
                this.#activity?.clearTop();
                this.#activity?.close();
                this.#activity = null;
            }, 10);
        }
        await hooks.callHookParallel("project:closed");
        return true;
    }

    /**
     * 关闭当前项目（对外的通用入口）。
     * 等价于「前置检查」+「真正关闭」。
     * @returns true：项目已关闭（或本就没有打开的项目）；
     *          false：前置检查未通过（如用户选择等待运行中的任务），
     *                 调用方应放弃后续动作。
     */
    async close(): Promise<boolean> {
        if (!await this.beforeClose()) return false;
        return await this.doClose();
    }

    async open(pathName?: string): Promise<boolean> {
        if (this.isBusy) return false;

        this.loading = "open";
        try {
            // 1. 先确认可关闭（有任务时弹框确认）。此步不关闭项目，
            //    用户取消选择目录时项目仍保持打开。
            if (!await this.beforeClose()) return false;

            // 2. 未指定路径时让用户选择目标目录。
            let targetPath = pathName;
            if (!targetPath) {
                const pick = await safeApi().system.selectDirectory({
                    title: "选择项目目录",
                });
                if (!pick) {
                    // API 层业务失败（进程通信异常、路由未就绪等），safeApi 已记录。
                    return false;
                }
                if (pick.canceled || !pick.path) {
                    // 用户取消选择。
                    return false;
                }
                targetPath = pick.path;
            }

            // 3. 真正关闭旧项目。
            const closed = await this.doClose();
            if (!closed) return false;

            // 4. 打开新项目。
            const prjData = await api().project.open(targetPath);
            await this.setupUI(prjData);
            this.#path = await api().project.info("path");
            this.#depPlugins = await api().project.get(DbKeys.depplugins);
            if (this.#depPlugins && this.#depPlugins.length > 0) {
                await pluginStore.ensurePlugins(this.#depPlugins);
            }
            await hooks.callHookParallel("project:loaded", { path: this.#path });
            Logger.debug("项目打开成功", this.#path)
            return true;
        } catch (e) {
            return this.procError(e);
        } finally {
            this.loading = null;
        }
    }

    async create(): Promise<boolean> {
        if (this.isBusy) return false;

        // 先确认可关闭：在打开「选择项目类型」对话框之前完成运行中任务确认，
        // 避免用户选完类型、填完路径后又被关闭确认打断。
        if (!await this.beforeClose()) return false;

        this.loading = "new";
        try {
            // 注意执行顺序：先弹窗让用户选择项目类型；只有用户真正点击「创建」
            // 才会触发 onCreate 回调，此时才去关闭当前项目。
            // 这样用户取消对话框时，不会丢失当前打开的项目（也就不会
            // 造成"项目已关闭但用户没创建新的"这种坏状态）。
            const prjInfo = await dialogStore.safeShow(
                SelectProjectTypeDialog,
                {
                    // onManage 留给你实现内部路由跳转（非新窗口）
                    onManage: () => alert("/settings/project-types"),
                    onCreate: async (typeId: string, pathName: string) => {
                        // 用户已经做出明确决策（点击「创建」），此处才真正关闭。
                        const closed = await this.doClose();
                        if (!closed) return false;
                        return await this.createImpl(typeId, pathName);
                    }
                },
                { size: "xl" }, // 宽屏网格，选用 xl
            );
            if (prjInfo === null) return false; // 用户取消
            // await this.createImpl(prjInfo.typeId, prjInfo.name);
            return true;
        } finally {
            this.loading = null;
        }
    }

    private async doCreate(bForce: boolean, type: string, pathName?: string): Promise<boolean> {
        const prjActivities = await api().project.create({ path: pathName, force: bForce, type });
        await this.setupUI(prjActivities)
        this.#path = await api().project.info("path");
        this.#depPlugins = await api().project.get(DbKeys.depplugins);
        if (this.#depPlugins && this.#depPlugins.length > 0) {
            await pluginStore.ensurePlugins(this.#depPlugins);
        }
        await hooks.callHookParallel("project:loaded", { path: this.#path });
        Logger.debug("项目创建成功", this.#path)
        return true;
    }

    private async createImpl(prjType: string, pathName?: string): Promise<boolean> {
        let realPathname: string | undefined;
        try {
            return await this.doCreate(false, prjType, pathName);
        } catch (e) {
            if (e instanceof ORPCError && e.status === COMMON_ORPC_ERROR_DEFS.UNSUPPORTED_MEDIA_TYPE.status) {
                // 报警目录已存在，需要用户确认，不做任何处理。继续向下强制执行。
                realPathname = e.message;
            } else {
                return this.procError(e);
            }
        }
        const confirm = await confirmStore.request({
            title: "目录非空",
            message: `项目目录${realPathname}非空，还要继续创建吗？这将清空目录全部内容。`,
            confirmLabel: "清空并创建",
            destructive: true
        });

        if (!confirm) {
            return false;
        }

        try {
            return await this.doCreate(true, prjType, realPathname);
        } catch (e) {
            return this.procError(e);
        }
    }
}

const KEY = Symbol.for('unigen.renderer.projectStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const projectStore: ProjectStore = ((globalThis as any)[KEY] ??= new ProjectStore());