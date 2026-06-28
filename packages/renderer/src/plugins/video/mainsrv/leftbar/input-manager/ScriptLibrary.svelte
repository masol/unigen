<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ 职责：剧本集区域 — 顺序文本段落的追加/编辑/删除         │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import * as Accordion from "$lib/components/ui/accordion";
  import {
    IconBook2,
    IconPlus,
    IconScript,
    IconPencil,
    IconTrash,
    IconLoader2,
    IconAlertTriangle,
  } from "@tabler/icons-svelte";
  import autoAnimate from "@formkit/auto-animate";
  import { inputStore } from "./store.svelte";
  import { dialogStore } from "$lib/store/ui/dialog.svelte";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";
  import ScriptSegmentDialog from "./ScriptSegmentDialog.svelte";
  import type { ScriptItem as ScriptItemType } from "./types";
  import { i18nStore } from "$lib/store/i18n.svelte";

  // 默认展开剧本集
  let accordionValue = $state("scripts");

  // 是否处于加载/操作中状态（来自 store）
  let loading = $derived(inputStore.isLoading);
  // 错误内容（来自 store）
  let error = $derived(inputStore.error);

  async function handleAppend() {
    if (loading) return;

    const content = await dialogStore.safeShow(
      ScriptSegmentDialog,
      {
        title: "追加剧本",
        initialText: "",
      },
      {
        size: "xl",
      },
    );
    if (content === null) return;

    // 等待异步写入完成，期间面板进入加载状态
    await inputStore.addScript(content);
  }

  async function handleEdit(item: ScriptItemType) {
    if (loading) return;

    const origContent = "";
    const content = await dialogStore.safeShow(
      ScriptSegmentDialog,
      {
        title: "编辑剧本",
        initialText: origContent ?? "",
      },
      {
        size: "xl",
      },
    );
    if (content === null) return;

    await inputStore.updateScript(item.id, content);
  }

  async function handleDelete(item: ScriptItemType, index: number) {
    if (loading) return;

    const confirmed = await confirmStore.request({
      title: "删除剧本",
      message: `确定要删除第 ${index + 1} 段剧本吗？此操作无法撤销。`,
    });
    if (!confirmed) return;

    await inputStore.removeScript(item.id);
  }
</script>

<Accordion.Root type="single" bind:value={accordionValue} class="w-full">
  <Accordion.Item
    value="scripts"
    class="rounded-2xl border border-border/50 bg-card"
  >
    <Accordion.Trigger
      class="rounded-2xl px-6 py-4 hover:no-underline hover:bg-muted/40 transition-all duration-200"
    >
      <div class="flex w-full items-center gap-3">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <IconScript size={18} stroke={1.5} />
        </div>
        <h3 class="text-base font-medium tracking-tight">剧本集</h3>

        {#if loading}
          <IconLoader2
            size={16}
            stroke={1.5}
            class="ml-2 animate-spin text-muted-foreground"
          />
        {/if}

        <Badge
          variant="secondary"
          class="ml-auto rounded-lg px-2 py-0.5 text-xs"
        >
          {inputStore.scripts.length}
        </Badge>
      </div>
    </Accordion.Trigger>

    <Accordion.Content class="px-3 pb-4">
      <div class="space-y-3">
        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ 职责：错误提示条，展示 store.error                    │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        {#if error}
          <div
            class="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-fade-in"
            role="alert"
          >
            <IconAlertTriangle size={16} stroke={1.5} class="mt-0.5 shrink-0" />
            <span class="whitespace-pre-wrap wrap-break-word">{error}</span>
          </div>
        {/if}

        <!-- 醒目的追加剧本按钮 -->
        <Button
          class="w-full rounded-xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
          onclick={handleAppend}
          disabled={loading}
        >
          {#if loading}
            <IconLoader2 size={18} stroke={1.5} class="animate-spin" />
            处理中…
          {:else}
            <IconPlus size={18} stroke={1.5} />
            追加剧本
          {/if}
        </Button>

        <ScrollArea class="h-87.5 pr-2">
          {#if inputStore.scripts.length > 0}
            <!--╭─────────────────────────────────────────────────────╮ -->
            <!-- │ 职责：渲染顺序段落卡片，承载增删动效                  │ -->
            <!-- ╰─────────────────────────────────────────────────────╯ -->
            <!-- 加载中时整体淡化并屏蔽交互，避免重复操作 -->
            <div
              use:autoAnimate
              class="space-y-3 transition-opacity duration-200"
              class:pointer-events-none={loading}
              class:opacity-60={loading}
              aria-busy={loading}
            >
              {#each inputStore.scripts as item, i (item.id)}
                <div
                  class="group relative rounded-2xl border border-border/50 bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl animate-fade-in"
                >
                  <div class="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      class="rounded-lg px-2 py-0.5 text-xs font-medium"
                    >
                      第 {i + 1} 次
                    </Badge>
                    <span class="text-xs text-muted-foreground">
                      {(item.content ?? "").trim().length} 字
                    </span>
                  </div>

                  <p
                    class="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground opacity-70 line-clamp-4"
                  >
                    {i18nStore.dayjs(item.updatedAt).fromNow()}
                  </p>

                  <div
                    class="absolute right-4 top-4 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  >
                    <Button
                      size="icon"
                      variant="ghost"
                      class="h-7 w-7 rounded-lg"
                      onclick={() => handleEdit(item)}
                      disabled={loading}
                      aria-label="编辑剧本"
                    >
                      <IconPencil size={14} stroke={1.5} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      class="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive"
                      onclick={() => handleDelete(item, i)}
                      disabled={loading}
                      aria-label="删除剧本"
                    >
                      <IconTrash size={14} stroke={1.5} />
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
            <!-- ╭─── / ScriptSegmentList ───╮ -->
          {:else}
            <div
              class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/20 p-12 text-center"
            >
              <div
                class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"
              >
                <IconBook2 size={20} stroke={1.5} />
              </div>
              <p class="text-sm font-medium">还没有剧本</p>
            </div>
          {/if}
        </ScrollArea>
      </div>
    </Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
