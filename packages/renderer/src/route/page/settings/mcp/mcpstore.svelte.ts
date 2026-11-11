import { configStore } from '$lib/store/config.svelte';
import type { McpServerConfig, McpTransport } from '@app/main/types';

/**
 * MCP 设置页专用 Store。
 *
 * 数据源统一为 configStore.mcpServers。
 * 所有写操作通过 configStore.setMcpServer / configStore.removeMcpServer 落地，
 * 不再维护本地 mock servers，也不再经通用 setConfig 走 mcpServers 全量写。
 */
class MCPStore {
    servers = $derived(configStore.mcpServers);

    searchQuery = $state('');
    transportFilters = $state<McpTransport['type'][]>([]);
    showOnlyEnabled = $state(false);

    isFiltering = $derived(
        this.searchQuery.trim() !== '' ||
        this.transportFilters.length > 0 ||
        this.showOnlyEnabled,
    );

    toggleTransportFilter(t: McpTransport['type']) {
        const idx = this.transportFilters.indexOf(t);
        if (idx >= 0) this.transportFilters.splice(idx, 1);
        else this.transportFilters.push(t);
    }

    toggleShowOnlyEnabled() {
        this.showOnlyEnabled = !this.showOnlyEnabled;
    }

    clearAllFilters() {
        this.searchQuery = '';
        this.transportFilters = [];
        this.showOnlyEnabled = false;
    }

    async upsertServer(server: McpServerConfig): Promise<void> {
        await configStore.setMcpServer(server);
    }

    async removeServer(id: string): Promise<void> {
        await configStore.removeMcpServer(id);
    }

    async toggleEnabled(id: string, enabled: boolean): Promise<void> {
        const server = this.servers.find((item) => item.id === id);
        if (!server) return;

        if ((server.enabled ?? true) === enabled) return;

        await configStore.setMcpServer({
            ...server,
            enabled,
        });
    }

    filteredServers = $derived.by(() => {
        const q = this.searchQuery.toLowerCase().trim();
        const transports = this.transportFilters;

        if (!q && transports.length === 0 && !this.showOnlyEnabled) {
            return this.servers;
        }

        return this.servers.filter((server) => {
            const enabled = server.enabled ?? true;
            if (this.showOnlyEnabled && !enabled) return false;

            const transportType = server.transport.type;
            if (
                transports.length > 0 &&
                !transports.includes(transportType)
            ) {
                return false;
            }

            if (!q) return true;

            const name = server.name ?? server.id;

            return (
                server.id.toLowerCase().includes(q) ||
                name.toLowerCase().includes(q)
            );
        });
    });
}



const KEY = Symbol.for('unigen.renderer.mcpStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mcpStore: MCPStore = ((globalThis as any)[KEY] ??= new MCPStore());
