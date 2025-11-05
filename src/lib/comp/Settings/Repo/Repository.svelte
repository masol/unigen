<script lang="ts">
	/**
	 * 📦 数据来源说明
	 *
	 * 组件当前使用外部 Store (repositoryStore)。
	 * 如需自定义数据源,请替换 repositoryStore 导入。
	 */

	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import IconChevronsUpDown from '~icons/lucide/chevrons-up-down';
	import IconCheck from '~icons/lucide/check';
	import IconFolderGit from '~icons/lucide/folder-git';
	import IconAlertCircle from '~icons/lucide/alert-circle';
	import { repositoryStore, type Repository } from '../../../stores/config/ipc/repository.svelte';
	import RepoDialog from './RepoDialog.svelte';
	import { projectStore } from '$lib/stores/project/project.svelte';
	import { t } from '$lib/stores/config/ipc/i18n.svelte';
	import { loadingStore } from '$lib/stores/loading.svelte';
	import { getContext } from 'svelte';
	type ToastStore = ReturnType<typeof import('@skeletonlabs/skeleton-svelte').createToaster>;
	const toaster = getContext<ToastStore>('toaster');

	// State
	let isHovered = $state(false);

	// Derived from store
	const repositories = $derived(repositoryStore.repositories);
	const currentId = $derived(projectStore.currentId);
	const currentRepository = $derived(projectStore.currentRepository);
	const isEmpty = $derived(repositories.length === 0);

	// Event handlers
	async function handleRepositorySelect(repo: Repository) {
		// await projectStore.setCurrentRepository(id);
		loadingStore.show(t('salty_flaky_worm_exhale'));
		try {
			const loadedResult = await projectStore.loadPath(repo.path);
			if (!loadedResult.success && loadedResult.error) {
				toaster.error({
					description: loadedResult.error
				});
			}
		} catch (e) {
			toaster.error({
				description: `加载项目${repo.name}时发生错误:${e}`
			});
		}
		loadingStore.hide();
	}
</script>

<div class="inline-flex">
	<Popover positioning={{ placement: 'top-end', gutter: 8 }}>
		<Popover.Trigger
			class="rounded-token flex h-full w-48 items-center gap-2 px-3 py-1.5 transition-all duration-200 focus:outline-none {isEmpty
				? 'bg-warn-500/10 hover:bg-warn-500/20 ring-warn-500/30 hover:ring-warn-500/50 ring-1 ring-inset'
				: 'hover:bg-surface-500/10 hover:shadow-md'}"
			onmouseenter={() => (isHovered = true)}
			onmouseleave={() => (isHovered = false)}
		>
			{#if isEmpty}
				<IconAlertCircle
					class="text-warn-500 size-4 flex-shrink-0 transition-transform {isHovered
						? 'scale-110'
						: ''}"
				/>
				<span class="text-warn-600 dark:text-warn-400 flex-1 truncate text-sm">
					No Repository
				</span>
			{:else}
				<IconChevronsUpDown
					class="size-4 flex-shrink-0 text-surface-500 transition-all {isHovered
						? 'scale-110 text-primary-500'
						: ''}"
				/>
				<span class="text-surface-900-50 flex-1 truncate text-sm">
					{currentRepository?.name || 'Select Repository'}
				</span>
			{/if}
		</Popover.Trigger>

		<Portal>
			<Popover.Positioner class="z-30">
				<Popover.Content
					class="rounded-container-token max-w-[320px] min-w-[280px] space-y-1 border border-surface-500/30 bg-surface-50 p-1 shadow-xl dark:bg-surface-900"
				>
					{#if isEmpty}
						<!-- Empty State -->
						<div class="flex flex-col items-center gap-3 px-4 py-6 text-center">
							<IconFolderGit class="size-12 text-surface-400" />
							<div class="space-y-1">
								<p class="text-surface-900-50 text-sm font-medium">No Repositories</p>
								<p class="text-xs text-surface-500">Add a repository to get started</p>
							</div>
						</div>
					{:else}
						<!-- Repositories List -->
						<div class="space-y-0.5">
							{#each repositories as repo (repo.id)}
								<button
									class="rounded-token flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-all duration-200 ring-inset focus:outline-none {repo.id ===
									currentId
										? 'cursor-default bg-surface-200 ring-1 ring-primary-500/20 ring-inset dark:bg-surface-800'
										: 'hover:bg-surface-200 hover:shadow-sm dark:hover:bg-surface-800'}"
									onclick={() => handleRepositorySelect(repo)}
									disabled={repo.id === currentId}
									aria-current={repo.id === currentId ? 'true' : undefined}
								>
									<span class="text-surface-900-50 flex-1 truncate text-sm">
										{repo.name}
									</span>
									{#if repo.id === currentId}
										<IconCheck class="size-4 flex-shrink-0 text-primary-500" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}

					<!-- Divider -->
					<div class="my-1 h-px bg-surface-500/30"></div>

					<!-- Management Actions -->
					<div class="space-y-0.5">
						<Popover.CloseTrigger
							class="rounded-token block w-full text-left transition-all duration-200 ring-inset hover:bg-surface-200 hover:shadow-sm focus:outline-none dark:hover:bg-surface-800"
						>
							<RepoDialog />
						</Popover.CloseTrigger>
					</div>

					<!-- Arrow -->
					<Popover.Arrow
						style="--arrow-size: calc(var(--spacing) * 2); --arrow-background: rgb(var(--color-surface-50) / 1);"
						class="dark:[--arrow-background:rgb(var(--color-surface-900)_/_1)]"
					>
						<Popover.ArrowTip />
					</Popover.Arrow>
				</Popover.Content>
			</Popover.Positioner>
		</Portal>
	</Popover>
</div>
