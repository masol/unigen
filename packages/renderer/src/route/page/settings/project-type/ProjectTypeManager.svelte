<script lang="ts">
  import * as UnderlineTabs from "$lib/components/ui/underline-tabs";
  import { IconHelpCircle } from "@tabler/icons-svelte";
  import { debounce } from "radashi";
  import InstalledTab from "./InstalledTab.svelte";
  import OnlineTab from "./OnlineTab.svelte";
  import SearchBar from "./SearchBar.svelte";
  import { SEARCH_DEBOUNCE_MS } from "./constants";

  let activeTab = $state("installed"); // 'installed' | 'online'
  let searchTerm = $state(""); // 输入框即时值
  let query = $state(""); // 防抖后的检索值(两个 tab 共用)

  const applySearch = debounce({ delay: SEARCH_DEBOUNCE_MS }, (v: string) => {
    query = v.trim();
  });

  const placeholder = $derived(
    activeTab === "installed"
      ? "搜索本机已安装的项目类型…"
      : "搜索在线项目类型…",
  );

  function onHelp() {
    // TODO: 打开「如何编写项目类型」帮助文档,随后处理。
  }
</script>

<div class="mx-auto flex h-full w-full max-w-6xl flex-col gap-6 p-6 md:p-8">
  <!-- 标题区 + 帮助文档链接 -->
  <header class="flex items-start justify-between gap-4">
    <div class="space-y-1">
      <h1 class="text-xl font-semibold tracking-tight text-foreground">
        项目类型
      </h1>
      <p class="text-sm text-muted-foreground">
        管理本机已安装与在线获取的项目类型。
      </p>
    </div>
    <button
      type="button"
      onclick={onHelp}
      class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground
                   underline-offset-4 transition-colors hover:text-foreground hover:underline
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <IconHelpCircle class="size-3.5" />
      如何编写项目类型?
    </button>
  </header>

  <!-- 共用搜索 -->
  <SearchBar
    bind:value={searchTerm}
    {placeholder}
    oninput={(v) => applySearch(v)}
  />

  <!-- 本地 / 在线 -->
  <UnderlineTabs.Root
    bind:value={activeTab}
    class="flex min-h-0 flex-1 flex-col"
  >
    <UnderlineTabs.List>
      <UnderlineTabs.Trigger value="installed">本机已安装</UnderlineTabs.Trigger
      >
      <UnderlineTabs.Trigger value="online">在线获取</UnderlineTabs.Trigger>
    </UnderlineTabs.List>

    <!-- 默认切走即卸载 => 切回本地会重新加载(符合"现加载");
             如需切 tab 不重载,给两个 Content 加 forceMount 即可。 -->
    <UnderlineTabs.Content value="installed" class="min-h-0 flex-1 pt-4">
      <InstalledTab {query} />
    </UnderlineTabs.Content>

    <UnderlineTabs.Content value="online" class="min-h-0 flex-1 pt-4">
      <OnlineTab {query} />
    </UnderlineTabs.Content>
  </UnderlineTabs.Root>
</div>
