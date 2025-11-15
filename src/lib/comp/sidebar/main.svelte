<script lang="ts">
	import IconSettings from '~icons/carbon/settings';
	import IconCommand from '~icons/carbon/mac-command';
	import { Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';
	import CmdDialog from '../Cmds/Dialog.svelte';
	import { localeStore, t } from '$lib/stores/config/ipc/i18n.svelte';
	import { viewStore } from '$lib/stores/project/view.svelte';
	import { densityConfig, type NavItem } from './type';
	import TopNav from './navbar.svelte';

	const bottomItems = [
		{
			id: 'commands',
			icon: IconCommand,
			disabled: false,
			label: 'slow_sharp_deer_race'
		},
		{
			id: 'settings',
			icon: IconSettings,
			disabled: false,
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
	];

	const density = 'comfortable';
	const config = $derived(densityConfig[density]);

	function handleItemClick(item: NavItem) {
		item.onClick?.();
	}

	function handleKeyDown(event: KeyboardEvent, item: NavItem) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleItemClick(item);
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
	<TopNav></TopNav>

	<!-- 占位空间，将底部项推到底部 -->
	<div class="flex-1"></div>

	<!-- 底部导航项 -->
	<div class="flex flex-col items-center {config.gap}">
		{#each bottomItems as item (item.id)}
			{@const IconComponent = item.icon}

			<div
				class="flex w-full items-center justify-center hover:bg-surface-200-800 hover:text-surface-900-100"
			>
				<Tooltip openDelay={1200} closeDelay={0} closeOnPointerDown={true} positioning={{ placement: 'right', gutter: 8 }}>
					{#if item.id === 'commands'}
						<CmdDialog></CmdDialog>
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
