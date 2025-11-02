<script lang="ts">
	import { repositoryStore } from '$lib/stores/config/ipc/repository.svelte';
	import { getContext } from 'svelte';
	import { Motion } from 'svelte-motion';
	import ProjectActionsMenu from './ActionMenu.svelte';
	import type { Repository } from '$lib/stores/config/ipc/repository.svelte';
	import { revealItemInDir } from '@tauri-apps/plugin-opener';
	import { projectStore } from '$lib/stores/project/project.svelte';
	import IconCheck from '~icons/lucide/check';
	import IconCircleDot from '~icons/lucide/circle-dot';
	import { t } from '$lib/stores/config/ipc/i18n.svelte';
	import { loadingStore } from '$lib/stores/loading.svelte';

	interface Props {
		project: Repository;
		isSelected: boolean;
	}

	let { project, isSelected }: Props = $props();

	type ToastStore = ReturnType<typeof import('@skeletonlabs/skeleton-svelte').createToaster>;
	const toaster = getContext<ToastStore>('dialogToaster') || getContext<ToastStore>('toaster');

	let editingMode = $state(false);
	let editingName = $state('');
	const isCurrent = $derived(projectStore.currentId === project.id);

	function handleSelect() {
		if (editingMode) {
			cancelEdit();
			return;
		}
		repositoryStore.setSelectedRepo(repositoryStore.selectedId === project.id ? '' : project.id);
	}

	function handleShowInExplorer() {
		revealItemInDir(project.path);
	}

	function handleRename() {
		editingMode = true;
		editingName = project.name;

		setTimeout(() => {
			const input = document.querySelector<HTMLInputElement>(
				`[data-editing-input="${project.id}"]`
			);
			if (input) {
				input.focus();
				input.select();
			}
		}, 0);
	}

	async function handleOpen() {
		if (project.path) {
			loadingStore.show(t('salty_flaky_worm_exhale'));
			const loaded = await projectStore.loadPath(project.path);
			loadingStore.hide();
		}
	}

	async function handleRemove() {
		await repositoryStore.removeRepository(project.id);
	}

	async function handleRenameSubmit() {
		const trimmedName = editingName.trim();

		if (!trimmedName) {
			cancelEdit('不允许空名称', 'warning');
			return;
		}

		if (trimmedName === project.name) {
			cancelEdit();
			return;
		}

		try {
			await repositoryStore.updateRepository(project.id, {
				name: trimmedName
			});
			console.log('项目重命名成功:', { id: project.id, newName: trimmedName });
		} catch (error) {
			console.error('重命名失败:', error);
		} finally {
			cancelEdit('');
		}
	}

	function cancelEdit(
		description = '终止名称修改',
		type: 'info' | 'success' | 'error' | 'warning' = 'info'
	) {
		editingMode = false;
		editingName = '';
		if (description) {
			const func = toaster[type] || toaster.info;
			func({ description });
		}
	}

	function handleEditKeydown(event: KeyboardEvent) {
		event.stopPropagation();

		if (event.key === 'Enter') {
			event.preventDefault();
			handleRenameSubmit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelEdit();
		}
	}

	function handleInputClick(event: MouseEvent) {
		event.stopPropagation();
	}

	$effect(() => {
		if (!editingMode) return;

		const handleOutsideClick = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			const editingInput = document.querySelector(`[data-editing-input="${project.id}"]`);

			if (editingInput && !editingInput.contains(target)) {
				cancelEdit();
			}
		};

		const timeoutId = setTimeout(() => {
			document.addEventListener('click', handleOutsideClick, true);
		}, 100);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener('click', handleOutsideClick, true);
		};
	});
</script>

<Motion
	let:motion
	initial={{ opacity: 0, x: -10 }}
	animate={{ opacity: 1, x: 0 }}
	whileHover={{ scale: 1.01 }}
	transition={{ duration: 0.15 }}
>
	<div
		use:motion
		class="rounded-container-token group relative flex items-center gap-2 border-2 transition-all duration-200 {isSelected
			? 'border-primary-500 bg-surface-200 shadow-md dark:bg-surface-700'
			: 'border-transparent bg-surface-100 hover:bg-surface-200 dark:bg-surface-800 dark:hover:bg-surface-700'}"
		role="listitem"
	>
		<!-- 当前项目角标 - 极其低调 -->
		{#if isCurrent}
			<Motion
				let:motion
				initial={{ scale: 0, opacity: 0 }}
				animate={{ scale: 1, opacity: 1 }}
				transition={{ duration: 0.2 }}
			>
				<div use:motion class="absolute top-1 left-1 z-10" title="当前打开的项目">
					<IconCircleDot
						class="h-2.5 w-2.5 transition-colors {isSelected
							? 'text-primary-400'
							: 'text-surface-400 dark:text-surface-500'}"
					/>
				</div>
			</Motion>
		{/if}

		<button
			type="button"
			class="flex min-w-0 flex-1 items-center gap-3 p-3 text-left transition-transform {editingMode
				? 'cursor-default'
				: 'active:scale-[0.98]'}"
			onclick={handleSelect}
			tabindex="-1"
			aria-label={`选择项目 ${project.name}`}
			aria-current={isCurrent ? 'page' : undefined}
			disabled={editingMode}
		>
			<!-- 选中状态图标区 -->
			<div class="flex shrink-0 items-center gap-1.5">
				{#if isSelected}
					<Motion
						let:motion
						initial={{ scale: 0 }}
						animate={{ scale: 1 }}
						transition={{ type: 'spring', stiffness: 500, damping: 25 }}
					>
						<div
							use:motion
							class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-white shadow-sm"
							title="已选中"
						>
							<IconCheck class="h-4 w-4" />
						</div>
					</Motion>
				{:else}
					<div
						class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface-300 transition-colors group-hover:border-surface-400 dark:border-surface-600 dark:group-hover:border-surface-500"
					></div>
				{/if}
			</div>

			<!-- 内容区 -->
			<div class="min-w-0 flex-1">
				{#if editingMode}
					<Motion let:motion whileFocus={{ scale: 1.02 }}>
						<input
							type="text"
							data-editing-input={project.id}
							bind:value={editingName}
							onkeydown={handleEditKeydown}
							onclick={handleInputClick}
							class="rounded-token input w-full border-2 border-primary-500 px-2 py-1 text-sm font-medium shadow-sm focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20"
							placeholder="项目名称"
							aria-label="编辑项目名称"
							title="按 Enter 提交,按 Esc 取消"
							use:motion
						/>
					</Motion>
				{:else}
					<div
						class="truncate text-sm font-semibold text-surface-900 transition-colors dark:text-surface-100"
					>
						{project.name}
					</div>
				{/if}
				<div
					class="mt-0.5 truncate text-xs text-surface-600 transition-colors dark:text-surface-400"
				>
					{project.path}
				</div>
			</div>
		</button>

		<!-- 操作菜单 -->
		<div class="shrink-0 pr-2">
			<ProjectActionsMenu
				{project}
				disabled={editingMode}
				onShowInExplorer={handleShowInExplorer}
				onRename={handleRename}
				onOpen={handleOpen}
				onRemove={handleRemove}
			/>
		</div>
	</div>
</Motion>
