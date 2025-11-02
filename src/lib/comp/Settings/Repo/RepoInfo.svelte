<script lang="ts">
	import { repositoryStore } from '$lib/stores/config/ipc/repository.svelte';
	import IconFolderGit from '~icons/lucide/folder-git';
	import IconFolderX from '~icons/lucide/folder-x';
	import dayjs from 'dayjs';
	import { localeStore, t } from '$lib/stores/config/ipc/i18n.svelte';
	import { projectStore } from '$lib/stores/project/project.svelte';
	import { loadingStore } from '$lib/stores/loading.svelte';

	// 从 store 获取选中的项目
	let selectedRepo = $derived(
		repositoryStore.repositories.find((r) => r.id === repositoryStore.selectedId)
	);

	let processing = $state(false);
	// 事件处理函数
	async function handleOpen() {
		if (selectedRepo && selectedRepo.path) {
			processing = true;
			loadingStore.show(t('salty_flaky_worm_exhale'));
			const loaded = await projectStore.loadPath(selectedRepo.path);
			loadingStore.hide();
			processing = false;
		}
	}
</script>

<div class="flex min-h-[200px] flex-col">
	{#if selectedRepo}
		<div class="flex-1 space-y-4">
			<!-- 项目信息 -->
			<div class="space-y-2 text-sm">
				<!-- 项目名称 -->
				<div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
					<div class="flex items-center gap-2">
						<span class="opacity-60" title="项目名称">📝</span>
						<span class="text-xs whitespace-nowrap opacity-80">项目名称:</span>
					</div>
					<div class="min-w-0 text-right">
						<span class="block truncate font-mono" title={selectedRepo.name}>
							{selectedRepo.name}
						</span>
					</div>
				</div>

				<!-- 项目路径 -->
				<div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
					<div class="flex items-center gap-2">
						<span class="opacity-60" title="项目路径">📁</span>
						<span class="text-xs whitespace-nowrap opacity-80">项目路径:</span>
					</div>
					<div class="min-w-0 text-right">
						<span class="block truncate font-mono text-xs" title={selectedRepo.path}>
							{selectedRepo.path}
						</span>
					</div>
				</div>

				<!-- 版本号 -->
				<div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
					<div class="flex items-center gap-2">
						<span class="opacity-60" title="创建项目的unigen的版本号">🏷️</span>
						<span class="text-xs whitespace-nowrap opacity-80">版本号:</span>
					</div>
					<div class="min-w-0 text-right">
						<span class="font-mono text-xs">
							{selectedRepo.ver ? `v${selectedRepo.ver}` : '未知'}
						</span>
					</div>
				</div>

				<!-- 创建时间 -->
				{#if selectedRepo.ctime}
					{@const timestampMs = selectedRepo.ctime * 1000}
					<div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
						<div class="flex items-center gap-2">
							<span class="opacity-60" title="创建时间">🕐</span>
							<span class="text-xs whitespace-nowrap opacity-80">创建时间:</span>
						</div>
						<div class="min-w-0 text-right">
							{#key localeStore.lang}
								<span
									class="block truncate font-mono text-xs"
									title={dayjs(timestampMs).format('YYYY-MM-DD HH:mm:ss')}
								>
									{dayjs(timestampMs).fromNow()}
								</span>
							{/key}
						</div>
					</div>
				{/if}
			</div>

			<!-- 操作按钮 -->
			<div class="flex gap-2">
				<button
					type="button"
					class="btn flex-1 preset-filled-primary-500"
					onclick={handleOpen}
					title="在当前窗口打开，替换当前项目"
					disabled={selectedRepo.id === projectStore.currentId || processing}
				>
					<IconFolderGit class="size-4" />
					<span>打开</span>
				</button>
			</div>
		</div>
	{:else}
		<!-- 未选中状态 -->
		<div class="flex flex-1 flex-col items-center justify-center space-y-3 py-8 text-center">
			<IconFolderX class="size-12 opacity-30" />
			<p class="text-sm opacity-60">请在左侧历史项目中选择项目，查看其简要信息</p>
		</div>
	{/if}
</div>
