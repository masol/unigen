<script lang="ts">
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Button } from "$lib/components/ui/button";
  import { push } from "svelte-spa-router";

  //   ── Props (children snippet for main content) ──
  import type { Snippet } from "svelte";
  import {
    IconSourceCode,
    IconFiles,
    IconTerminal2,
  } from "@tabler/icons-svelte";
  import { layoutStore } from "$lib/store/layout.svelte";
  interface Props {
    children?: Snippet;
  }
  let { children }: Props = $props();
</script>

<ScrollArea class="h-full">
  <div class="h-full w-full">
    {#if children}
      {@render children()}
    {:else}
      <!-- Default mock content -->
      <div class="flex h-full flex-col items-center justify-center gap-6 p-12">
        <div class="flex items-center gap-3 text-muted-foreground">
          <IconSourceCode class="size-8 opacity-40" />
        </div>
        <div class="text-center space-y-2">
          <h2 class="text-2xl font-semibold tracking-tight text-foreground">
            欢迎
          </h2>
          <p class="text-sm text-muted-foreground">
            在左侧资源管理器中选择文件以开始编辑
          </p>
        </div>
        <div class="flex gap-3 pt-4">
          <Button
            variant="outline"
            class="rounded-xl"
            onclick={() => {
              layoutStore.setActiveActivity("explorer");
              layoutStore.openPanel("left");
            }}
          >
            <IconFiles class="size-4" />
            打开资源管理器
          </Button>
          <Button
            variant="outline"
            class="rounded-xl"
            // onclick={() => layoutStore.togglePanel("bottom")}
            onclick={() => push("/test")}
          >
            <IconTerminal2 class="size-4" />
            打开终端
          </Button>
        </div>
      </div>
    {/if}
  </div>
</ScrollArea>
