import { api } from "$lib/utils/api";

class ProjectStore {
    // ── 私有状态 ──────────────────────────────────────────────

    /**
     * pluginId → PluginMeta
     * Map 整体替换触发顶层响应；Meta 内字段逐个修改触发细粒度响应
     * 选 $state 深度响应：需要对 Meta 字段做 mutation（busy / status / …）
     */
    #path = $state<string>("");

    opened = $derived(this.#path.trim().length > 0)
    get path() {
        return this.#path;
    }


    async open(pathName?: string): Promise<boolean> {
        const bOpend = await api().project.open(pathName);
        if (bOpend) {
            this.#path = await api().project.info("path");
        }
        return false;
    }
}

export const projectStore = new ProjectStore();