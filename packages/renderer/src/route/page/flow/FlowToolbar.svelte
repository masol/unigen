<script module lang="ts">
  // 面包屑增删的平滑补间；抽为 module 级 action 供上方 use 指令引用
  import autoAnimate from "@formkit/auto-animate";
  export function autoAnimateGuard(node: HTMLElement) {
    return autoAnimate(node);
  }
</script>

<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Separator } from "$lib/components/ui/separator";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import {
    IconArrowBackUp,
    IconChevronRight,
    IconDatabasePlus,
    IconHome,
    IconLayoutGrid,
    IconLoader2,
    IconMap,
    IconMapOff,
    IconPackages,
    IconPlayerPlay,
    IconRefresh,
    IconRoute2,
    IconSitemap,
    IconTag,
  } from "@tabler/icons-svelte";
  import { flowStore, SIZE_DESC, SIZE_LABEL } from "./store.svelte";
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → FlowToolbar.svelte]                 │ -->
<!-- │ 职责：顶部导航条 —— 标题 + 面包屑 + 操作组 + 视图组 │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<div
  class="flex h-14 shrink-0 items-center gap-3 border-b border-border/50 bg-background/80 px-6 backdrop-blur-sm"
>
  <!-- 左侧标题：面板模式无 status，靠 store.title 呈现 -->
  <div class="flex min-w-0 shrink items-center gap-2">
    <div
      class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
    >
      <IconSitemap size={16} stroke={1.5} />
    </div>
    <span
      class="truncate text-sm font-semibold tracking-tight"
      title={flowStore.title}
    >
      {flowStore.title}
    </span>
  </div>

  <Separator orientation="vertical" class="h-6! shrink-0" />

  <!-- 面包屑（含名称，保留） -->
  <nav class="flex min-w-0 items-center gap-1 text-sm" use:autoAnimateGuard>
    {#each flowStore.crumbs as crumb, i (crumb.graphId + i)}
      {#if i > 0}
        <IconChevronRight
          size={14}
          stroke={1.5}
          class="shrink-0 text-muted-foreground/60"
        />
      {/if}
      <button
        type="button"
        onclick={() => flowStore.goToCrumb(i)}
        class={[
          "flex max-w-40 items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-all duration-200",
          i === flowStore.crumbs.length - 1
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        ]}
      >
        {#if i === 0}
          <IconHome size={12} stroke={1.5} />
        {:else}
          <IconRoute2 size={12} stroke={1.5} />
        {/if}
        <span class="truncate">{crumb.label}</span>
      </button>
    {/each}
  </nav>

  <div class="ml-auto flex items-center gap-1.5">
    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → PureInputMenu.svelte]               │ -->
    <!-- │ 职责：纯输入交付物下拉 —— 递归扫描全 DAG 得来的     │ -->
    <!-- │       「无生产、有消费」入口，点击为其录入数据      │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
    <DropdownMenu.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props: tp })}
            <DropdownMenu.Trigger {...tp}>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="outline"
                  size="sm"
                  class="h-9 gap-1.5 rounded-xl"
                >
                  <IconDatabasePlus size={16} stroke={1.5} />
                  录入输入
                  {#if flowStore.pureInputCount > 0}
                    <Badge
                      variant="secondary"
                      class="ml-0.5 rounded-lg px-1.5 py-0 text-[10px]"
                    >
                      {flowStore.pureInputCount}
                    </Badge>
                  {/if}
                </Button>
              {/snippet}
            </DropdownMenu.Trigger>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content class="rounded-xl text-xs">
          为整套流程的纯输入交付物录入数据
        </Tooltip.Content>
      </Tooltip.Root>

      <DropdownMenu.Content
        class="w-72 rounded-2xl border-border/50 p-1.5 shadow-xl"
        align="end"
      >
        <DropdownMenu.Label
          class="px-2 py-1.5 text-xs font-medium text-muted-foreground"
        >
          纯输入交付物（无节点生产 · 需外部录入）
        </DropdownMenu.Label>
        <DropdownMenu.Separator />

        {#if flowStore.pureInputCount === 0}
          <div class="px-2 py-6 text-center text-xs text-muted-foreground/60">
            未发现纯输入交付物
          </div>
        {:else}
          {#each flowStore.pureInputArtifacts as art (art.canonicalName)}
            <DropdownMenu.Item
              class="cursor-pointer gap-2.5 rounded-xl p-2.5"
              onclick={() => flowStore.enterPureInput(art)}
            >
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
              >
                {#if art.isArray}
                  <IconPackages size={18} stroke={1.5} />
                {:else}
                  <IconTag size={18} stroke={1.5} />
                {/if}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium tracking-tight">
                  {art.name}
                </p>
                <div class="mt-0.5 flex items-center gap-1.5">
                  <span class="text-[11px] text-muted-foreground">
                    {art.isArray ? "数组 · 多条录入" : "单一数据"}
                  </span>
                  {#if art.sizeEstimate}
                    <span class="text-[11px] text-muted-foreground/60">
                      · {SIZE_LABEL[art.sizeEstimate]}（{SIZE_DESC[
                        art.sizeEstimate
                      ]}）
                    </span>
                  {/if}
                </div>
                <p class="mt-0.5 text-[11px] text-muted-foreground/60">
                  被 {art.consumers.length} 个节点消费
                </p>
              </div>
            </DropdownMenu.Item>
          {/each}
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    <!-- ╭─── / PureInputMenu ───╮ -->

    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → FlowActionGroup.svelte]             │ -->
    <!-- │ 职责：业务动作组（执行 / 编辑 / DAG编辑），实现留空 │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
    <div
      class="flex items-center gap-1 rounded-xl border border-border/50 bg-muted/40 p-0.5"
    >
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="sm"
              class="h-8 gap-1.5 rounded-lg text-primary hover:bg-primary/10 hover:text-primary"
              onclick={() => flowStore.runDag()}
            >
              {#if flowStore.isRunning}
                <IconLoader2 size={18} stroke={1.5} class="animate-spin" />
                ...
              {:else}
                <IconPlayerPlay size={16} stroke={1.5} />
                执行
              {/if}
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content class="rounded-xl text-xs"
          >执行整个流程--在助手查看输入/输出</Tooltip.Content
        >
      </Tooltip.Root>
    </div>
    <!-- ╭─── / FlowActionGroup ───╮ -->

    <Separator orientation="vertical" class="h-6!" />

    <!-- 返回上层 -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="sm"
            class="gap-1.5 rounded-xl"
            onclick={() => flowStore.goUp()}
            disabled={flowStore.crumbs.length <= 1}
          >
            <IconArrowBackUp size={16} stroke={1.5} />
            返回上层
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content class="rounded-xl text-xs">回到父图</Tooltip.Content>
    </Tooltip.Root>

    <Separator orientation="vertical" class="h-6!" />

    <!-- 重新布局 -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class="size-9 rounded-xl"
            onclick={() => flowStore.relayout()}
          >
            <IconLayoutGrid size={18} stroke={1.5} />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content class="rounded-xl text-xs">重新自动布局</Tooltip.Content>
    </Tooltip.Root>

    <!-- 小地图开关 -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant={flowStore.miniMap ? "secondary" : "ghost"}
            size="icon"
            class="size-9 rounded-xl"
            onclick={() => flowStore.toggleMiniMap()}
          >
            {#if flowStore.miniMap}
              <IconMap size={18} stroke={1.5} />
            {:else}
              <IconMapOff size={18} stroke={1.5} />
            {/if}
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content class="rounded-xl text-xs">
        {flowStore.miniMap ? "隐藏小地图" : "显示小地图"}
      </Tooltip.Content>
    </Tooltip.Root>

    <Separator orientation="vertical" class="h-6!" />

    <!-- 刷新 -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class="size-9 rounded-xl"
            onclick={() => flowStore.refresh()}
            disabled={flowStore.loading}
          >
            <IconRefresh
              size={18}
              stroke={1.5}
              class={flowStore.loading ? "animate-spin" : ""}
            />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content class="rounded-xl text-xs">强制刷新</Tooltip.Content>
    </Tooltip.Root>
  </div>
</div>
