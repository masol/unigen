<!-- ProjectList.svelte -->
<script lang="ts">
	import IconFolderGit from '~icons/lucide/folder-git';
	import { repositoryStore } from '$lib/stores/config/ipc/repository.svelte';
	import ProjectItem from './RepositoryItem.svelte';

	let projects = $derived(repositoryStore.repositories);
	let selectedId = $derived(repositoryStore.selectedId);
	let isEmpty = $derived(projects.length === 0);
</script>

<div class="flex h-full flex-col">
	{#if isEmpty}
		<div class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
			<IconFolderGit class="size-16 text-surface-400" />
			<div class="space-y-2">
				<h3 class="text-surface-900-50 text-lg font-semibold">暂无历史项目</h3>
				<p class="text-sm text-surface-500">点击右方<b>打开</b>按钮，创建新项目</p>
			</div>
		</div>
	{:else}
		<div class="flex-1 space-y-1 overflow-y-auto p-2" role="list">
			{#each projects as project (project.id)}
				<ProjectItem {project} isSelected={project.id === selectedId} />
			{/each}
		</div>
	{/if}
</div>
