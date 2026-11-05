import SelectProjectTypeDialog from '$lib/components/dialog/project-type/SelectProjectTypeDialog.svelte';
import TextInputDialog from "$lib/components/dyn/dialog/TextInputDialog.svelte";
import { api, procApiError, safeApi } from "$lib/utils/api";
import evtbus from "$lib/utils/evtbus";
import { hooks } from '$lib/utils/hook';
import { DbKeys } from '$lib/utils/service/dbkeys';
import type { ProjectActivityData, RunState } from "@app/main/types";
import { COMMON_ORPC_ERROR_DEFS, ORPCError } from "@orpc/client";
import Logger from "electron-log/renderer";
import { push } from "svelte-spa-router";
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

        // @todo: 移动到专门的clarify处理模块来处理，而不是这里处理。
        evtbus.on("clarify", async ({ question, uuid, options }) => {
            const extHints = options && options.length > 0 ? "可以从右上方的“插入片段”确定模板，然后修改确定。" : "可以回应“你自行补充一切细节吧。”";
            const content = await dialogStore.safeShow(
                TextInputDialog,
                {
                    title: "请澄清细节",
                    description: question,
                    options,
                    placeholder: `回答上面的问题，${extHints}`,
                },
                { size: "xl" },
            );
            await safeApi().project.clarify({
                uuid,
                answer: content ?? ""
            })

        })
    }

    private procError(e: unknown): boolean {
        procApiError(e);
        return false;
    }

    // // 非命令入口！只被dashboardStore调用。
    // async start(seq: number, bThrow?: boolean): Promise<void> {
    //     try {
    //         if (this.#path.trim().length === 0) {
    //             toast.error("尚未打开任务")
    //             return
    //         }
    //         await api().project.start(seq);
    //         this.#runState = await api().project.runState(); // "running";
    //         // console.log("this.#runState=", this.#runState)
    //     } catch (e) {
    //         this.#runState = 'idle';
    //         this.procError(e);
    //         if (bThrow) {
    //             throw e;
    //         }
    //     }
    // }

    // async stop(bForce = false): Promise<void> {
    //     try {
    //         await api().project.stop(bForce);
    //         this.#runState = await api().project.runState(); // bForce ? "idle" : "terminating";
    //     } catch (e) {
    //         this.procError(e);
    //     }
    // }

    async watiFinish(): Promise<void> {
        try {
            await api().project.waitFinish();
            this.#runState = "idle";
        } catch (e) {
            this.procError(e);
        }
    }


    // 需要确保本函数在path设置之前执行，否则可能触发主控台报错。
    private async setupUI(activityData: ProjectActivityData) {
        const status = activityData.status;
        if (status) {
            await confirmStore.request({
                title: "状态说明",
                hideCancel: true,
                confirmLabel: "我知道了",
                variant: "warning",
                markdown: true,
                size: "xl2",
                message: status,
            })
        }
        this.#activity = new ProjectActivity(activityData);
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
                await hooks.callHook("project:loaded", { path: this.#path });
            }
        } catch (e) {
            this.procError(e);
        }
    }

    async open(pathName?: string): Promise<boolean> {
        if (this.isBusy) return false;
        await this.close();

        try {
            this.loading = "open";

            const prjData = await api().project.open(pathName);
            await this.setupUI(prjData);
            this.#path = await api().project.info("path");
            this.#depPlugins = await api().project.get(DbKeys.depplugins);
            if (this.#depPlugins && this.#depPlugins.length > 0) {
                await pluginStore.ensurePlugins(this.#depPlugins);
            }
            await hooks.callHook("project:loaded", { path: this.#path });
            Logger.debug("任务打开成功", this.#path)
            return true;
        } catch (e) {
            return this.procError(e);
        } finally {
            this.loading = null;
        }
    }

    async close(): Promise<void> {
        if (this.#path.length === 0) return;
        await safeApi().project.close();
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
        await hooks.callHook("project:closed");
    }

    async create(): Promise<boolean> {
        if (this.isBusy) return false;
        await this.close();

        this.loading = "new";
        try {
            const prjInfo = await dialogStore.safeShow(
                SelectProjectTypeDialog,
                {
                    // onManage 留给你实现内部路由跳转（非新窗口）
                    onManage: () => alert("/settings/project-types"),
                    onCreate: async (typeId: string, pathName: string) => {
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
        await hooks.callHook("project:loaded", { path: this.#path });
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
            message: `任务目录${realPathname}非空，还要继续创建吗？这将清空目录全部内容。`,
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