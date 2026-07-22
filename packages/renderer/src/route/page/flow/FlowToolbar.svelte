<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
	  IconArrowBackUp,
	  IconChevronRight,
	  IconFocusCentered,
	  IconHome,
	  IconLayoutGrid,
	  IconMap,
	  IconMapOff,
	  IconRefresh,
	  IconRoute2
	} from '@tabler/icons-svelte';
	import { flowStore } from './store.svelte';
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → FlowToolbar.svelte]                 │ -->
<!-- │ 职责：顶部导航条 —— 面包屑 + 视图操作               │ -->
<!-- │ 补齐：小地图开关 / 适配视图 / 重排 / 返回 / 刷新    │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<div
	class="flex h-14 shrink-0 items-center gap-3 border-b border-border/50 bg-background/80 px-6 backdrop-blur-sm"
>
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
					'flex max-w-48 items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-all duration-200',
					i === flowStore.crumbs.length - 1
						? 'bg-muted font-medium text-foreground'
						: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
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

		<!-- 适配视图（对应 store.requestFit） -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon"
						class="size-9 rounded-xl"
						onclick={() => flowStore.requestFit()}
					>
						<IconFocusCentered size={18} stroke={1.5} />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content class="rounded-xl text-xs">适配视图</Tooltip.Content>
		</Tooltip.Root>

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

		<!-- 小地图开关（对应 store.toggleMiniMap，之前完全缺失入口） -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant={flowStore.miniMap ? 'secondary' : 'ghost'}
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
				{flowStore.miniMap ? '隐藏小地图' : '显示小地图'}
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
							class={flowStore.loading ? 'animate-spin' : ''}
						/>
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content class="rounded-xl text-xs">强制刷新</Tooltip.Content>
		</Tooltip.Root>
	</div>
</div>

<script module lang="ts">
	// 面包屑增删的平滑补间；抽为 module 级 action 供上方 use 指令引用
	import autoAnimate from '@formkit/auto-animate';
	export function autoAnimateGuard(node: HTMLElement) {
		return autoAnimate(node);
	}
</script>