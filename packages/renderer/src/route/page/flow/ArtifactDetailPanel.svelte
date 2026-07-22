<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconArrowDownRight,
    IconArrowUpRight,
    IconPackages,
    IconTag,
    IconX,
  } from "@tabler/icons-svelte";
  import { flowStore, SIZE_DESC, SIZE_LABEL } from "./store.svelte";

  const art = $derived(flowStore.selectedArtifact);
  const aliases = $derived(art?.artifact?.aliases ?? []);
  const producers = $derived(art?.producers ?? []);
  const consumers = $derived(art?.consumers ?? []);
  const isArray = $derived(art?.artifact?.isArray ?? false);
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → ArtifactDetailPanel.svelte]         │ -->
<!-- │ 职责：左上角产物详情浮层；关闭走 clearArtifact      │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<div use:autoAnimate>
  {#if art}
    <div
      class="w-72 overflow-hidden rounded-2xl border border-border/50 bg-background/90 shadow-xl backdrop-blur-sm"
    >
      <div class="flex items-start justify-between gap-2 p-4 pb-0">
        <div class="flex min-w-0 items-center gap-2">
          <div
            class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          >
            {#if isArray}
              <IconPackages size={20} stroke={1.5} />
            {:else}
              <IconTag size={20} stroke={1.5} />
            {/if}
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium tracking-tight">
              {art.name}
            </p>
            <p class="text-xs text-muted-foreground">
              {art.role === "input" ? "作为输入的产物" : "作为输出的产物"}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 rounded-lg"
          onclick={() => flowStore.clearArtifact()}
        >
          <IconX size={16} stroke={1.5} />
        </Button>
      </div>

      <div class="max-h-96 space-y-4 overflow-y-auto p-4">
        {#if art.artifact}
          <p class="text-xs text-muted-foreground">{art.artifact.intent}</p>

          <div class="flex flex-wrap items-center gap-1.5">
            {#if isArray}
              <Badge class="gap-1 rounded-lg text-[11px]">
                <IconPackages size={12} stroke={1.5} />
                数组（多条同构数据）
              </Badge>
            {:else}
              <Badge variant="secondary" class="rounded-lg text-[11px]">
                单一数据
              </Badge>
            {/if}
            <Badge variant="outline" class="rounded-lg text-[11px]">
              {SIZE_LABEL[art.artifact.sizeEstimate]}
              <span class="ml-1 opacity-60"
                >· {SIZE_DESC[art.artifact.sizeEstimate]}</span
              >
            </Badge>
            <Badge variant="outline" class="rounded-lg text-[11px]">
              Schema：{art.artifact.dataSchema === null ? "尚未细化" : "已细化"}
            </Badge>
          </div>

          {#if aliases.length > 0}
            <Separator />
            <div class="space-y-2">
              <p
                class="flex items-center gap-1 text-xs font-medium text-muted-foreground"
              >
                <IconTag size={12} stroke={1.5} /> 归一吸收的别名
              </p>
              <div class="flex flex-wrap gap-1.5">
                {#each aliases as al (al)}
                  <Badge variant="secondary" class="rounded-lg text-[11px]"
                    >{al}</Badge
                  >
                {/each}
              </div>
            </div>
          {/if}

          {#if art.artifact.qualityCriteria.length > 0}
            <Separator />
            <div class="space-y-2">
              <p class="text-xs font-medium text-muted-foreground">
                质量评判标准
              </p>
              <ul class="space-y-1.5 text-xs text-foreground/90">
                {#each art.artifact.qualityCriteria as q, i (i)}
                  <li class="flex items-start gap-2">
                    <span
                      class="mt-1.5 inline-block size-1 shrink-0 rounded-full bg-primary/60"
                    ></span>
                    <span class="leading-relaxed">{q}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        {:else}
          <p class="text-xs text-muted-foreground">
            此产物未在 artifacts 注册表中登记（仅边上留名）。
          </p>
        {/if}

        <Separator />

        <div class="space-y-2" use:autoAnimate>
          <p
            class="flex items-center gap-1 text-xs font-medium text-muted-foreground"
          >
            <IconArrowUpRight size={12} stroke={1.5} /> 生产者
            <span class="opacity-60">({producers.length})</span>
          </p>
          {#each producers as p (p.id)}
            <button
              type="button"
              onclick={() => flowStore.focusNode(p.id)}
              class="flex w-full items-center gap-2 rounded-xl border border-border/50 px-3 py-2 text-left text-xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted/60 hover:shadow-xl"
            >
              <span class="truncate">{p.name}</span>
            </button>
          {:else}
            <span class="text-[11px] text-muted-foreground/60"
              >本图内无生产者</span
            >
          {/each}
        </div>

        <div class="space-y-2" use:autoAnimate>
          <p
            class="flex items-center gap-1 text-xs font-medium text-muted-foreground"
          >
            <IconArrowDownRight size={12} stroke={1.5} /> 消费者
            <span class="opacity-60">({consumers.length})</span>
          </p>
          {#each consumers as c (c.id)}
            <button
              type="button"
              onclick={() => flowStore.focusNode(c.id)}
              class="flex w-full items-center gap-2 rounded-xl border border-border/50 px-3 py-2 text-left text-xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted/60 hover:shadow-xl"
            >
              <span class="truncate">{c.name}</span>
            </button>
          {:else}
            <span class="text-[11px] text-muted-foreground/60"
              >本图内无消费者</span
            >
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
<!-- ╭─── / ArtifactDetailPanel ───╮ -->
