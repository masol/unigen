<!-- src/lib/components/settings/SettingsList.svelte -->
<script lang="ts">
	import { settingStore } from '$lib/stores/views/setting/setting.svelte';
	import IconRobot from '~icons/mdi/robot';
	import IconWeb from '~icons/mdi/web';

	interface SettingItem {
		id: string;
		label: string;
		icon: any;
		description?: string;
	}

	let selectedItem = $derived(settingStore.curCate);

	const settingsData: SettingItem[] = [
		{
			id: 'system',
			label: '系统',
			icon: IconWeb,
			description: 'Unigen系统设置'
		},
		{
			id: 'llm',
			label: '语言模型',
			icon: IconRobot,
			description: '配置 AI 对话模型'
		}
	];

	function selectItem(itemId: string) {
		settingStore.setCurcate(itemId);
	}
</script>

<nav class="py-4">
	<ul class="space-y-1">
		{#each settingsData as item}
			<li>
				<button
					class="group flex w-full items-center gap-3 px-6 py-3 text-left transition-all duration-200 {selectedItem ===
					item.id
						? 'border-l-4 border-primary-500 bg-primary-50 dark:bg-primary-950/40'
						: 'border-l-4 border-transparent hover:border-surface-300 hover:bg-surface-50 dark:hover:border-surface-700 dark:hover:bg-surface-800/40'}"
					onclick={() => selectItem(item.id)}
				>
					<item.icon
						class="h-5 w-5 flex-shrink-0 transition-colors {selectedItem === item.id
							? 'text-primary-600 dark:text-primary-400'
							: 'text-surface-500 group-hover:text-surface-700 dark:text-surface-400 dark:group-hover:text-surface-300'}"
					></item.icon>
					<div class="flex flex-1 flex-col gap-0.5">
						<span
							class="text-sm font-medium transition-colors {selectedItem === item.id
								? 'text-primary-700 dark:text-primary-300'
								: 'text-surface-700 group-hover:text-surface-900 dark:text-surface-300 dark:group-hover:text-surface-100'}"
						>
							{item.label}
						</span>

						{#if item.description}
							<span
								class="text-xs transition-colors {selectedItem === item.id
									? 'text-primary-600/80 dark:text-primary-400/70'
									: 'text-surface-500 group-hover:text-surface-600 dark:text-surface-400 dark:group-hover:text-surface-300'}"
							>
								{item.description}
							</span>
						{/if}
					</div>
				</button>
			</li>
		{/each}
	</ul>
</nav>
