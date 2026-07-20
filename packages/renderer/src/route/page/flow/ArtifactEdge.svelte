<!-- src/lib/flow/ArtifactEdge.svelte -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import * as HoverCard from "$lib/components/ui/hover-card";
  import { Separator } from "$lib/components/ui/separator";
  import { IconPackage, IconTag } from "@tabler/icons-svelte";
  import {
    BaseEdge,
    EdgeLabel,
    getBezierPath,
    type EdgeProps,
  } from "@xyflow/svelte";
  import { type FlowEdgeData, type XY } from "./store.svelte";

  let {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  }: EdgeProps & { data?: FlowEdgeData } = $props();

  /** ELK 折线 → 圆角折线 SVG path（拐点处 8px 圆弧过渡） */
  function roundedPolylinePath(points: XY[], radius = 8): string {
    if (points.length < 2) return "";
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const r = Math.min(radius, d1 / 2, d2 / 2);
      if (r < 0.5) {
        d += ` L ${p1.x},${p1.y}`;
        continue;
      }
      const inX = p1.x - ((p1.x - p0.x) / d1) * r;
      const inY = p1.y - ((p1.y - p0.y) / d1) * r;
      const outX = p1.x + ((p2.x - p1.x) / d2) * r;
      const outY = p1.y + ((p2.y - p1.y) / d2) * r;
      d += ` L ${inX},${inY} Q ${p1.x},${p1.y} ${outX},${outY}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x},${last.y}`;
    return d;
  }

  const route = $derived(data?.route ?? null);

  // 有 ELK 路由走折线；否则回退贝塞尔
  const bezier = $derived(
    getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    }),
  );

  const edgePath = $derived(
    route ? roundedPolylinePath(route.points) : bezier[0],
  );
  const labelX = $derived(route ? route.labelX : bezier[1]);
  const labelY = $derived(route ? route.labelY : bezier[2]);

  const artifact = $derived(data?.artifact ?? null);
  const displayName = $derived(artifact?.name ?? data?.rawName ?? "");
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → ArtifactEdge.svelte]                │ -->
<!-- │ 职责：产物边（ELK 折线路由/贝塞尔回退）+ hover 详情 │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<BaseEdge {id} path={edgePath} class="stroke-muted-foreground/40!" />

{#if displayName}
  <EdgeLabel x={labelX} y={labelY} style="pointer-events: all;">
    <HoverCard.Root openDelay={220} closeDelay={80}>
      <HoverCard.Trigger>
        {#snippet child({ props })}
          <span
            {...props}
            class="flex cursor-default items-center gap-1 rounded-lg border border-border/50 bg-background/90 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm transition-all duration-200 hover:text-foreground hover:shadow-xl"
          >
            <IconPackage size={12} stroke={1.5} />
            {displayName}
          </span>
        {/snippet}
      </HoverCard.Trigger>

      <HoverCard.Content
        class="w-72 rounded-2xl border-border/50 p-0 shadow-xl"
        side="top"
      >
        <div class="space-y-4 p-5">
          <div class="flex items-center gap-2">
            <div
              class="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary"
            >
              <IconPackage size={20} stroke={1.5} />
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium tracking-tight">
                {displayName}
              </p>
              <p class="text-xs text-muted-foreground">数据产物</p>
            </div>
          </div>

          {#if artifact}
            <p class="text-sm text-foreground/90">{artifact.intent}</p>

            {#if artifact.aliases.length > 0}
              <Separator />
              <div class="space-y-2">
                <p
                  class="flex items-center gap-1 text-xs font-medium text-muted-foreground"
                >
                  <IconTag size={12} stroke={1.5} /> 归一吸收的别名
                </p>
                <div class="flex flex-wrap gap-1.5">
                  {#each artifact.aliases as al (al)}
                    <Badge variant="secondary" class="rounded-lg text-[11px]">
                      {al}
                    </Badge>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="text-[11px] text-muted-foreground">
              Schema：{artifact.dataSchema === null
                ? "尚未细化（第一遍恒为 null）"
                : "已细化"}
            </div>
          {:else}
            <p class="text-xs text-muted-foreground">
              此产物未在 artifacts 注册表中登记（仅边上留名）。
            </p>
          {/if}
        </div>
      </HoverCard.Content>
    </HoverCard.Root>
  </EdgeLabel>
{/if}
<!-- ╭─── / ArtifactEdge ───╮ -->
