<!-- file path="skill.svelte" -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";
  import { dialogStore } from "$lib/store/ui/dialog.svelte";
  import { getErrorMsg, safeApi } from "$lib/utils/api";
  import type { SkillSearchItem } from "@app/main/types";
  import Logger from "electron-log/renderer.js";
  import { getErrorMessage } from "radashi";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import SkillCard from "./SkillCard.svelte";
  import SkillEmptyState from "./SkillEmptyState.svelte";
  import SkillGrid from "./SkillGrid.svelte";
  import SkillHeader from "./SkillHeader.svelte";
  import SkillMarketGuideDialog from "./SkillMarketGuideDialog.svelte";
  import { skillStore } from "./skillStore.svelte";

  const totalCount = $derived(skillStore.items.length);
  const visibleCount = $derived(skillStore.filteredItems.length);

  /** 滚动容器（IntersectionObserver 的 root）。 */
  let scrollRoot = $state<HTMLDivElement | null>(null);
  /** 搜索遮罩是否可见（延迟出现，避免快速往返闪烁）。 */
  let overlayVisible = $state(false);

  onMount(() => {
    void skillStore.load();
  });

  // 技能不足 2 个时排序无意义：隐藏排序 UI 并清理残留意图，
  // 避免列表被不可见的搜索态继续过滤。
  $effect(() => {
    if (totalCount < 2 && skillStore.query) {
      skillStore.query = "";
    }
  });

  $effect(() => {
    if (!skillStore.searching) {
      overlayVisible = false;
      return;
    }

    const timer = setTimeout(() => {
      overlayVisible = true;
    }, 180);

    return () => clearTimeout(timer);
  });

  async function openExternal(url: string) {
    try {
      await safeApi().system.openExternal({ url });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function openInstall() {
    try {
      const installed = await skillStore.install();
      if (installed) toast.success("技能安装成功");
    } catch (err) {
      const errMsg = getErrorMsg(err);
      Logger.error("技能安装失败:", errMsg);
      // toast.error(err instanceof Error ? err.message : "技能安装失败");
    }
  }

  async function openDirectory() {
    try {
      await skillStore.openDirectory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "打开技能目录失败");
    }
  }

  async function showMarketGuide() {
    await dialogStore.safeShow(
      SkillMarketGuideDialog,
      {
        onOpen: (url: string) => void openExternal(url),
      },
      { size: "xl6" },
    );
  }

  async function handleRemove(skill: SkillSearchItem) {
    const confirmed = await confirmStore.request({
      title: "卸载技能",
      message: `卸载「${skill.name}」后无法恢复，且 Agent 将立即失去该技能能力。确定继续吗？`,
      variant: "question",
    });

    if (!confirmed) return;

    try {
      await skillStore.remove(skill.id);
      toast.success("技能已卸载");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "卸载技能失败");
    }
  }
</script>

<div bind:this={scrollRoot} class="h-full w-full overflow-y-auto bg-background">
  <div class="space-y-8 p-8 lg:p-12">
    <SkillHeader
      {totalCount}
      {visibleCount}
      bind:query={skillStore.query}
      installing={skillStore.installing}
      searching={skillStore.searching}
      onSearch={() => skillStore.searchNow()}
      onInstall={openInstall}
      onOpenDirectory={openDirectory}
      onShowMarkets={showMarketGuide}
    />

    <Separator />

    {#if skillStore.error}
      <div
        class="flex animate-fade-in flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
      >
        <span class="min-w-0 wrap-break-word">{skillStore.error}</span>
        <Button
          variant="outline"
          size="sm"
          class="rounded-xl text-xs"
          onclick={() => void skillStore.load()}
        >
          重试
        </Button>
      </div>
    {/if}

    {#if skillStore.loading && skillStore.items.length === 0}
      <div class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {#each Array(6) as _, index (index)}
          <Skeleton class="h-56 rounded-2xl" />
        {/each}
      </div>
    {:else if visibleCount === 0 && skillStore.query.trim() && !skillStore.searching}
      <SkillEmptyState
        variant="filtered"
        onAction={() => (skillStore.query = "")}
      />
    {:else if totalCount === 0 && !skillStore.query.trim() && !skillStore.loading}
      <SkillEmptyState
        variant="empty"
        installing={skillStore.installing}
        onAction={openInstall}
        onOpenMarket={(url) => void openExternal(url)}
      />
    {:else}
      <SkillGrid
        items={skillStore.filteredItems}
        itemKey={(skill) => skill.id}
        blocking={overlayVisible}
        message="正在按相关性排序…"
        canLoadMore={skillStore.canLoadMore}
        loadingMore={skillStore.loadingMore}
        totalLoaded={visibleCount}
        {scrollRoot}
        onLoadMore={() => skillStore.loadMore()}
      >
        {#snippet card(skill)}
          <SkillCard
            {skill}
            removing={skillStore.isRemoving(skill.id)}
            onRemove={() => void handleRemove(skill)}
          />
        {/snippet}
      </SkillGrid>
    {/if}
  </div>
</div>
