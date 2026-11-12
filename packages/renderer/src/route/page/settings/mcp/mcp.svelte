<script lang="ts">
  import { Separator } from "$lib/components/ui/separator";
  import { dialogStore } from "$lib/store/ui/dialog.svelte";
  import { safeApi } from "$lib/utils/api";
  import type { McpServerConfig } from "@app/main/types";
  import autoAnimate from "@formkit/auto-animate";
  import { toast } from "svelte-sonner";
  import ConfigHeader from "./ConfigHeader.svelte";
  import EmptyState from "./EmptyState.svelte";
  import MCPServerCard from "./MCPServerCard.svelte";
  import MCPServerConfigDialog from "./MCPServerConfigDialog.svelte";
  import { mcpStore } from "./mcpstore.svelte";
  import SearchFilterBar from "./SearchFilterBar.svelte";

  let serverCount = $derived(mcpStore.servers.length);
  let enabledCount = $derived(
    mcpStore.servers.filter((server) => server.enabled !== false).length,
  );

  let openStates = $state<Record<string, boolean>>({});
  let hasServers = $derived(mcpStore.servers.length > 0);
  let importing = $state(false);

  async function openAdd() {
    await dialogStore.safeShow(
      MCPServerConfigDialog,
      {
        onSave: async (server: McpServerConfig) => {
          await mcpStore.upsertServer(server);
        },
      },
      {
        size: "xl6",
      },
    );
  }

  async function openEdit(serverId: string) {
    const server = mcpStore.servers.find((item) => item.id === serverId);
    if (!server) return;

    await dialogStore.safeShow(
      MCPServerConfigDialog,
      {
        server,
        onSave: async (next: McpServerConfig) => {
          await mcpStore.upsertServer(next);
        },
      },
      {
        size: "xl6",
      },
    );
  }

  async function triggerImport() {
    if (importing) return;

    importing = true;

    try {
      const result = await safeApi().agent.importMcpConfig();

      if (result.canceled) return;

      const servers = result.servers;
      if (servers.length === 0) {
        toast.error("未识别到有效的 MCP 服务配置");
        return;
      }

      if (servers.some((server) => server.transport.type === "stdio")) {
        toast.warning(
          "配置包含 stdio 传输：将在本机启动进程，请确认命令与参数来源可信",
        );
      }

      for (const server of servers) {
        await mcpStore.upsertServer(server);
      }

      toast.success(`已导入 ${servers.length} 个 MCP 服务`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "配置文件解析失败");
    } finally {
      importing = false;
    }
  }
</script>

<div class="flex h-full w-full flex-col overflow-y-auto bg-background">
  <div class="space-y-8 p-8 lg:p-12">
    <ConfigHeader
      {serverCount}
      {enabledCount}
      {importing}
      onAddServer={openAdd}
      onImportConfig={triggerImport}
    />

    {#if hasServers}
      <SearchFilterBar filteredServerCount={mcpStore.filteredServers.length} />
      <Separator />
    {/if}

    <div class="space-y-6" use:autoAnimate>
      {#each mcpStore.filteredServers as server (server.id)}
        <MCPServerCard
          {server}
          open={openStates[server.id] ?? false}
          onOpenChange={(v) => (openStates[server.id] = v)}
          onEdit={() => openEdit(server.id)}
          onRemove={() => void mcpStore.removeServer(server.id)}
          onToggleEnabled={(enabled) =>
            void mcpStore.toggleEnabled(server.id, enabled)}
        />
      {/each}

      {#if mcpStore.isFiltering && mcpStore.filteredServers.length === 0}
        <EmptyState
          variant="filtered"
          onAction={() => mcpStore.clearAllFilters()}
        />
      {/if}

      {#if !mcpStore.isFiltering && !hasServers}
        <EmptyState variant="empty" onAction={openAdd} />
      {/if}
    </div>
  </div>
</div>
