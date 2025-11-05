<script lang="ts">
	import IconHome from '~icons/carbon/home';
	import IconSearch from '~icons/carbon/search';
	import IconDocument from '~icons/carbon/document';
	import IconSettings from '~icons/carbon/settings';
	import IconFolder from '~icons/carbon/folder';
	import IconBookmark from '~icons/carbon/bookmark';
	import IconCommand from '~icons/carbon/mac-command';
	import { Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';
	import CmdDialog from './Cmds/Dialog.svelte';
	import type { Component } from 'svelte';
	import { localeStore, t } from '$lib/stores/config/ipc/i18n.svelte';
	import { viewStore } from '$lib/stores/project/view.svelte';

	interface NavItem {
		id: string;
		icon: any;
		label: string;
		onClick?: () => void;
		component?: Component;
	}

	interface Props {
		topItems?: NavItem[];
		bottomItems?: NavItem[];
		density?: 'compact' | 'comfortable' | 'spacious';
	}

	let {
		topItems = [
			{ id: 'home', icon: IconHome, label: 'Home' },
			{ id: 'search', icon: IconSearch, label: 'Search' },
			{ id: 'files', icon: IconFolder, label: 'Files' },
			{ id: 'bookmarks', icon: IconBookmark, label: 'Bookmarks' },
			{ id: 'documents', icon: IconDocument, label: 'Documents' }
		],
		bottomItems = [
			{
				id: 'commands',
				icon: IconCommand,
				label: 'slow_sharp_deer_race',
				component: CmdDialog
			},
			{
				id: 'settings',
				icon: IconSettings,
				label: 'patient_lower_polecat_learn',
				onClick: () => {
					viewStore.addView({
						id: 'settings',
						label: 'patient_lower_polecat_learn',
						closable: true,
						type: 'settings'
					});
				}
				// component: SettingDialog
			}
		],
		density = 'comfortable'
	}: Props = $props();

	const densityConfig = {
		compact: {
			width: '2.5rem', // 40px
			gap: 'gap-1',
			padding: 'py-2 px-1',
			itemSize: 'h-8 w-8'
		},
		comfortable: {
			width: '3rem', // 48px
			gap: 'gap-2',
			padding: 'py-3 px-1.5',
			itemSize: 'h-10 w-10'
		},
		spacious: {
			width: '3.5rem', // 56px
			gap: 'gap-3',
			padding: 'py-4 px-2',
			itemSize: 'h-12 w-12'
		}
	};

	const config = $derived(densityConfig[density]);

	// isTop指示是否从上部导航区的item发出的事件.
	function handleItemClick(item: NavItem, isTop = false) {
		item.onClick?.();
	}

	function handleKeyDown(event: KeyboardEvent, item: NavItem, isTop = false) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleItemClick(item, isTop);
		}
	}
</script>

<nav
	class="flex h-full min-h-0 shrink-0 flex-col border-r border-surface-300-700 bg-surface-100-900 {config.padding}"
	style="width: {config.width};"
	data-density={density}
	aria-label="Main navigation"
>
	<!-- 顶部导航项 -->
	<div class="flex flex-col items-center {config.gap}">
		{#each topItems as item (item.id)}
			{@const IconComponent = item.icon}
			{@const CustomComponent = item.component}

			<div class="flex w-full items-center justify-center">
				<Tooltip openDelay={200} closeDelay={0} positioning={{ placement: 'right', gutter: 8 }}>
					{#if CustomComponent}
						<Tooltip.Trigger class="flex items-center justify-center {config.itemSize}">
							<CustomComponent />
						</Tooltip.Trigger>
					{:else}
						<Tooltip.Trigger
							type="button"
							class="
								flex items-center justify-center
								{config.itemSize}
								rounded-token
								text-surface-700-300
								transition-colors duration-200
								hover:bg-surface-200-800 hover:text-surface-900-100
								focus-visible:ring-2
								focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100-900 focus-visible:outline-none
								active:bg-surface-300-700
							"
							onclick={() => handleItemClick(item, true)}
							onkeydown={(e) => handleKeyDown(e, item, true)}
							aria-label={item.label}
						>
							<IconComponent class="h-5 w-5" aria-hidden="true" />
						</Tooltip.Trigger>
					{/if}

					<Portal>
						<Tooltip.Positioner style="z-index: 50;">
							<Tooltip.Content
								class="
									rounded-token
									bg-surface-900-100
									px-3 py-1.5
									text-sm font-medium
									whitespace-nowrap text-surface-100-900
									shadow-xl
								"
							>
								{item.label}
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>
		{/each}
	</div>

	<!-- 占位空间，将底部项推到底部 -->
	<div class="flex-1"></div>

	<!-- 底部导航项 -->
	<div class="flex flex-col items-center {config.gap}">
		{#each bottomItems as item (item.id)}
			{@const IconComponent = item.icon}
			{@const CustomComponent = item.component}

			<div
				class="flex w-full items-center justify-center hover:bg-surface-200-800 hover:text-surface-900-100"
			>
				<Tooltip openDelay={200} closeDelay={0} positioning={{ placement: 'right', gutter: 8 }}>
					{#if CustomComponent}
						<Tooltip.Trigger class="flex items-center justify-center {config.itemSize}">
							<CustomComponent />
						</Tooltip.Trigger>
					{:else}
						<Tooltip.Trigger
							type="button"
							class="
								flex items-center justify-center
								{config.itemSize}
								rounded-token
								text-surface-700-300
								transition-colors duration-200
								focus-visible:ring-2
								focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100-900 focus-visible:outline-none
								active:bg-surface-300-700
							"
							onclick={() => handleItemClick(item)}
							onkeydown={(e) => handleKeyDown(e, item)}
							aria-label={item.label}
						>
							<IconComponent class="h-5 w-5" aria-hidden="true" />
						</Tooltip.Trigger>
					{/if}

					<Portal>
						<Tooltip.Positioner style="z-index: 50;">
							<Tooltip.Content
								class="
									rounded-token
									bg-surface-900-100
									px-3 py-1.5
									text-sm font-medium
									whitespace-nowrap text-surface-100-900
									shadow-xl
								"
							>
								{#key localeStore.lang}
									{t(item.label)}
								{/key}
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>
		{/each}
	</div>
</nav>

<style>
	@media (prefers-reduced-motion: reduce) {
		* {
			transition-duration: 0.01ms !important;
		}
	}
</style>
