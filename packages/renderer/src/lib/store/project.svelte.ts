import { api, procApiError } from "$lib/utils/api";
import evtbus from "$lib/utils/evtbus";
import { hooks } from '$lib/utils/hook';
import type { RunState } from "@app/main/types";
import { COMMON_ORPC_ERROR_DEFS, ORPCError } from "@orpc/client";
import Logger from "electron-log/renderer";
import { toast } from "svelte-sonner";
import { DbKeys } from "../../plugins/video/dbkeys";
import { pluginStore } from "./plugin.svelte";
import { confirmStore } from "./ui/confirm.svelte";


type LoadingAction = "open" | "new" | null;

class ProjectStore {
    // ── 私有状态 ──────────────────────────────────────────────

    /**
     * pluginId → PluginMeta
     * Map 整体替换触发顶层响应；Meta 内字段逐个修改触发细粒度响应
     * 选 $state 深度响应：需要对 Meta 字段做 mutation（busy / status / …）
     */
    #path = $state<string>("");
    #depPlugins: string[] = [];
    #runState = $state<RunState>("idle");
    loading = $state<LoadingAction>(null);

    opened = $derived(this.#path.trim().length > 0)
    get path() {
        return this.#path;
    }
    get runState(): RunState {
        return this.#runState;
    }

    isBusy = $derived(this.loading !== null);

    constructor() {
        evtbus.on("task_finished", (evt) => {
            console.log("task finished!!!", evt.success, evt.reason ?? "");
            this.#runState = "idle";
        })
    }

    private procError(e: unknown): boolean {
        return procApiError(e);
    }

    async start(): Promise<void> {
        try {
            if (this.#path.trim().length === 0) {
                toast.error("尚未打开项目")
                return
            }
            await api().project.start();
            this.#runState = await api().project.runState(); // "running";
            console.log("this.#runState=", this.#runState)
        } catch (e) {
            this.procError(e);
        }
    }

    async stop(bForce = false): Promise<void> {
        try {
            await api().project.stop(bForce);
            this.#runState = await api().project.runState(); // bForce ? "idle" : "terminating";
        } catch (e) {
            this.procError(e);
        }
    }

    async watiFinish(): Promise<void> {
        try {
            await api().project.waitFinish();
            this.#runState = "idle";
        } catch (e) {
            this.procError(e);
        }
    }


    async init(): Promise<void> {
        try {
            this.#path = await api().project.info("path");
            if (this.#path) {
                // 已经打开了项目。同步依赖插件。
                this.#depPlugins = await api().project.get(DbKeys.depplugins);
                await pluginStore.ensurePlugins(this.#depPlugins);
                await hooks.callHook("project:loaded", { path: this.#path });
            }
        } catch (e) {
            this.procError(e);
        }
    }

    async open(pathName?: string): Promise<boolean> {
        try {
            await api().project.open(pathName);
            this.#path = await api().project.info("path");
            this.#depPlugins = await api().project.get(DbKeys.depplugins);
            await pluginStore.ensurePlugins(this.#depPlugins);
            await hooks.callHook("project:loaded", { path: this.#path });
            Logger.debug("项目打开成功", this.#path)
            return true;
        } catch (e) {
            return this.procError(e);
        }
    }

    async close(): Promise<void> {

    }

    private async doCreate(bForce: boolean, pathName?: string): Promise<boolean> {
        await api().project.create({ path: pathName, force: bForce });
        this.#path = await api().project.info("path");
        this.#depPlugins = await api().project.get(DbKeys.depplugins);
        await pluginStore.ensurePlugins(this.#depPlugins);
        return true;
    }

    async create(pathName?: string): Promise<boolean> {
        let realPathname: string | undefined;
        try {
            return await this.doCreate(false, pathName);
        } catch (e) {
            if (e instanceof ORPCError && e.status === COMMON_ORPC_ERROR_DEFS.UNSUPPORTED_MEDIA_TYPE.status) {
                // 不做任何处理。继续向下强制执行。
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
            const result = await this.doCreate(true, realPathname);
            if (result) {
                await hooks.callHook("project:loaded", { path: this.#path });
            }
            Logger.debug("项目创建成功", this.#path)
            return result;
        } catch (e) {
            return this.procError(e);
        }
    }
}

export const projectStore = new ProjectStore();