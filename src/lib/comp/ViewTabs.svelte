<script lang="ts">
	import { ContextMenu } from 'bits-ui';
	import IconMdiClose from '~icons/mdi/close';
	import IconSettings from '~icons/carbon/settings';
	import IconCloseBox from '~icons/mdi/close-box';
	import IconCloseBoxMultiple from '~icons/mdi/close-box-multiple';
	import IconFlowchart from '~icons/mdi/chart-timeline-variant';
	import IconArrowRightBox from '~icons/mdi/arrow-right-box';
	import IconSync from '~icons/mdi/sync';
	import { viewStore, type ViewItemType } from '$lib/stores/project/view.svelte';
	import { localeStore, t } from '$lib/stores/config/ipc/i18n.svelte';
	import { onDestroy, onMount } from 'svelte';
	import { eventBus } from '$lib/utils/evt';

	let dynamicTabs = $derived<ViewItemType[]>(viewStore.tabs);
	let activeTabId = $derived<string>(viewStore.activeId);
	let open = $state(false);

	function selectTab(tabId: string) {
		viewStore.setActive(tabId);
	}

	async function closeTab(tabId: string, e?: MouseEvent | KeyboardEvent) {
		if (e) {
			e.stopPropagation();
			e.preventDefault();
		}
		await viewStore.removeView(tabId);
	}

	function closeTabsToRight(tabId: string) {
		const tabIndex = dynamicTabs.findIndex((tab) => tab.id === tabId);
		if (tabIndex === -1) return;

		const tabsToClose = dynamicTabs.slice(tabIndex + 1);
		tabsToClose.forEach((tab) => {
			if (tab.closable) {
				viewStore.removeView(tab.id);
			}
		});
	}

	function closeAllTabs() {
		dynamicTabs.forEach((tab) => {
			if (tab.closable) {
				viewStore.removeView(tab.id);
			}
		});
	}

	function syncToNavigator(tabId: string) {
		// TODO: Implement navigator sync
		console.log('Syncing to navigator:', tabId);
	}

	function onCloseKeydown(e: KeyboardEvent, tabId: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			closeTab(tabId, e);
		} else if (e.key === 'Delete') {
			e.preventDefault();
			e.stopPropagation();
			closeTab(tabId, e);
		}
	}

	let currentContextTabId = $state<string>('');

	function onContextMenu(tabId: string) {
		currentContextTabId = tabId;
	}

	let unsub: (() => void) | null = null;
	onMount(async () => {
		unsub = await eventBus.listen('reteclick', () => {
			open = false;
		});
	});

	onDestroy(() => {
		if (unsub) {
			unsub();
			unsub = null;
		}
	});
</script>

<div
	class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2"
	role="tablist"
	aria-label="Document tabs"
>
	{#each dynamicTabs as tab, index (tab.id)}
		<ContextMenu.Root>
			<ContextMenu.Trigger
				data-id={tab.id}
				oncontextmenu={() => onContextMenu(tab.id)}
				class="group flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors duration-150 
				       {activeTabId === tab.id
					? 'bg-surface-200 text-primary-700 dark:bg-surface-700 dark:text-primary-400'
					: 'text-surface-600 hover:bg-surface-200/50 dark:text-surface-400 dark:hover:bg-surface-700/50'}
				       focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2 focus-within:ring-offset-surface-100 dark:focus-within:ring-offset-surface-800"
				role="tab"
				aria-selected={activeTabId === tab.id}
				aria-controls="{tab.id}-panel"
				tabindex={activeTabId === tab.id ? 0 : -1}
				onclick={() => selectTab(tab.id)}
			>
				{#if tab.type === 'settings'}
					<IconSettings class="size-4" />
				{:else if tab.type === 'flow'}
					<IconFlowchart class="size-4" />
				{/if}
				<span class="max-w-32 truncate"
					>{#key localeStore.lang}{t(tab.label)}{/key}</span
				>
				{#if tab.closable}
					<span
						class="grid size-4 place-items-center rounded opacity-0 transition-opacity
					       group-hover:opacity-70 hover:bg-surface-300 hover:opacity-100
					       focus-visible:opacity-100
					       focus-visible:ring-1 focus-visible:ring-primary-500 dark:hover:bg-surface-600"
						role="button"
						aria-label="Close {tab.label}"
						tabindex={0}
						onclick={(e) => closeTab(tab.id, e)}
						onkeydown={(e) => onCloseKeydown(e, tab.id)}
					>
						<IconMdiClose class="size-3" aria-hidden="true" />
					</span>
				{/if}
			</ContextMenu.Trigger>

			<ContextMenu.Portal>
				<ContextMenu.Content
					class="animate-in fade-in-0 zoom-in-95 z-50 min-w-[200px] rounded-lg border border-surface-300 bg-surface-50 py-1 shadow-xl outline-none dark:border-surface-700 dark:bg-surface-800"
					alignOffset={-3}
				>
					{#if tab.closable}
						<ContextMenu.Item
							class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 focus-visible:bg-surface-200 dark:hover:bg-surface-700 dark:focus-visible:bg-surface-700"
							onclick={(e) => {
								e.stopPropagation();
								closeTab(currentContextTabId);
							}}
						>
							<IconCloseBox class="size-4 text-surface-600 dark:text-surface-400" />
							<span>关闭</span>
						</ContextMenu.Item>
					{/if}

					{#if index < dynamicTabs.length - 1}
						<ContextMenu.Item
							class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 focus-visible:bg-surface-200 dark:hover:bg-surface-700 dark:focus-visible:bg-surface-700"
							onclick={() => closeTabsToRight(currentContextTabId)}
						>
							<IconArrowRightBox class="size-4 text-surface-600 dark:text-surface-400" />
							<span>关闭右侧</span>
						</ContextMenu.Item>
					{/if}

					<ContextMenu.Item
						class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 focus-visible:bg-surface-200 dark:hover:bg-surface-700 dark:focus-visible:bg-surface-700"
						onclick={closeAllTabs}
					>
						<IconCloseBoxMultiple class="size-4 text-surface-600 dark:text-surface-400" />
						<span>关闭全部</span>
					</ContextMenu.Item>

					<ContextMenu.Separator class="my-1 h-px bg-surface-300 dark:bg-surface-700" />

					<ContextMenu.Item
						class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 focus-visible:bg-surface-200 dark:hover:bg-surface-700 dark:focus-visible:bg-surface-700"
						onclick={() => syncToNavigator(currentContextTabId)}
					>
						<IconSync class="size-4 text-surface-600 dark:text-surface-400" />
						<span>导航栏同步</span>
					</ContextMenu.Item>
				</ContextMenu.Content>
			</ContextMenu.Portal>
		</ContextMenu.Root>
	{/each}
</div>
