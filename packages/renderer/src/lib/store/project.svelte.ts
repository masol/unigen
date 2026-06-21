import { api } from "$lib/utils/api";
import { toast } from "svelte-sonner";
import { pluginStore } from "./plugin.svelte";
import { COMMON_ORPC_ERROR_DEFS, ORPCError } from "@orpc/client";
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
    loading = $state<LoadingAction>(null);

    opened = $derived(this.#path.trim().length > 0)
    get path() {
        return this.#path;
    }
    isBusy = $derived(this.loading !== null);

    private procError(e: unknown): boolean {
        let msg: string;
        if (e instanceof ORPCError) {
            if (e.status === 601) { // 用户取消。
                return false;
            } else if (e.status === COMMON_ORPC_ERROR_DEFS.TOO_MANY_REQUESTS.status) {
                toast.success(e.message)
                return false;
            }
            msg = e.message || e.code;
        } else {
            msg = e instanceof Error ? e.message : String(e)
        }
        toast.error(msg);
        return false;
    }

    async open(pathName?: string): Promise<boolean> {
        try {
            await api().project.open(pathName);
            this.#path = await api().project.info("path");
            this.#depPlugins = await api().project.get("dep");
            await pluginStore.ensurePlugins(this.#depPlugins);
            return true;
        } catch (e) {
            return this.procError(e);
        }
    }

    async create(pathName?: string): Promise<boolean> {
        let realPathname = pathName;
        try {
            await api().project.create({ path: pathName, force: false });
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
            await api().project.create({ path: realPathname, force: true });
            this.#path = await api().project.info("path");
            this.#depPlugins = await api().project.get("dep");
            await pluginStore.ensurePlugins(this.#depPlugins);
            return true;
        } catch (e) {
            return this.procError(e);
        }
    }
}

export const projectStore = new ProjectStore();