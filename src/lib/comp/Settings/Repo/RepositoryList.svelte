<script lang="ts">
	/**
	 * 📦 数据来源说明
	 *
	 * 组件当前使用内部假数据。实际使用时,请将数据替换为外部 Store：
	 *
	 * 示例：
	 * import { projectStore } from '$lib/stores/projectStore';
	 * let projects = projectStore.projects; // 替换下方的假数据定义
	 */

	import { Popover, Portal, usePopover } from '@skeletonlabs/skeleton-svelte';
	import IconMoreVertical from '~icons/lucide/more-vertical';
	import IconFolderGit from '~icons/lucide/folder-git';
	import IconEye from '~icons/lucide/eye';
	import IconPencil from '~icons/lucide/pencil';
	import IconFolderInput from '~icons/lucide/folder-input';
	import IconTrash2 from '~icons/lucide/trash-2';
	import { repositoryStore } from '$lib/stores/config/ipc/repository.svelte';
	import { getContext } from 'svelte';
	import { Motion } from 'svelte-motion';

	// // 直接使用 ReturnType 推断类型
	type ToastStore = ReturnType<typeof import('@skeletonlabs/skeleton-svelte').createToaster>;
	const toaster = getContext<ToastStore>('dialogToaster') || getContext<ToastStore>('toaster');
	// const toaster = getContext('toaster');

	// 假数据定义（使用 $state rune）
	let projects = $derived(repositoryStore.repositories);
	let selectedId = $derived(repositoryStore.selectedId);

	// 跟踪当前打开 Popover 的项目 ID
	let activePopoverId = $state<string | null>(null);

	// 跟踪当前正在编辑的项目 ID 和编辑中的名称
	let editingProjectId = $state<string | null>(null);
	let editingName = $state<string>('');

	// 为每个项目创建 Popover 实例，配置定位选项
	const popovers = $derived(
		projects.reduce(
			(acc, project) => {
				acc[project.id] = usePopover({
					id: `popover-${project.id}`,
					positioning: {
						placement: 'bottom-end',
						gutter: 8
					},
					onOpenChange: (details) => {
						activePopoverId = details.open ? project.id : null;
					}
				});
				return acc;
			},
			{} as Record<string, ReturnType<typeof usePopover>>
		)
	);

	// 计算是否为空
	const isEmpty = $derived(projects.length === 0);

	// 事件处理函数
	function handleSelect(id: string) {
		// 如果正在编辑，点击其他项时取消编辑
		if (editingProjectId) {
			cancelEdit();
			return;
		}

		repositoryStore.setSelectedRepo(id);
		// selectedId = id;
	}

	function handleShowInExplorer(id: string) {
		console.log('在资源管理器中显示项目:', id);
		popovers[id]().setOpen(false);
	}

	function handleRename(id: string) {
		const project = projects.find((p) => p.id === id);
		if (project) {
			editingProjectId = id;
			editingName = project.name;
			popovers[id]().setOpen(false);

			// 等待 DOM 更新后聚焦输入框
			setTimeout(() => {
				const input = document.querySelector<HTMLInputElement>(`[data-editing-input="${id}"]`);
				if (input) {
					input.focus();
					input.select();
				}
			}, 0);
		}
	}

	function handleMove(id: string) {
		console.log('移动项目:', id);
		popovers[id]().setOpen(false);
	}

	async function handleRemove(id: string) {
		await repositoryStore.removeRepository(id);
		console.log('从列表中移除项目:', id);
		popovers[id]().setOpen(false);
	}

	// 处理重命名提交（仅 Enter 键触发）
	async function handleRenameSubmit(id: string) {
		const trimmedName = editingName.trim();

		// 验证名称不为空且有变化
		const project = projects.find((p) => p.id === id);
		if (!trimmedName || !project) {
			cancelEdit('不允许空名称', 'warning');
			return;
		}

		if (trimmedName === project.name) {
			// 名称未变化，直接取消
			cancelEdit();
			return;
		}

		try {
			await repositoryStore.updateRepository(project.id, {
				name: trimmedName
			});
			console.log('项目重命名成功:', { id, newName: trimmedName });
		} catch (error) {
			// 处理错误（后端应返回错误信息）
			console.error('重命名失败:', error);
			// TODO: 显示错误提示给用户
		} finally {
			cancelEdit('');
		}
	}

	// 取消编辑
	function cancelEdit(
		description = '终止名称修改',
		type: 'info' | 'success' | 'error' | 'warning' = 'info'
	) {
		editingProjectId = null;
		editingName = '';
		if (description) {
			const func = toaster[type] || toaster.info;
			func({
				description
			});
		}
	}

	// 处理输入框键盘事件
	function handleEditKeydown(event: KeyboardEvent, id: string) {
		// 阻止所有键盘事件冒泡，防止触发父级对话框的快捷键
		event.stopPropagation();

		if (event.key === 'Enter') {
			event.preventDefault();
			handleRenameSubmit(id);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			console.log('ESC pressed - canceling edit');
			cancelEdit();
		}
	}

	// 处理输入框点击事件
	function handleInputClick(event: MouseEvent) {
		// 阻止点击事件冒泡，防止触发父级的 handleSelect
		event.stopPropagation();
	}

	// 监听外部点击以取消编辑
	$effect(() => {
		if (!editingProjectId) return;

		const handleOutsideClick = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			const editingInput = document.querySelector(`[data-editing-input="${editingProjectId}"]`);

			// 如果点击的不是输入框，取消编辑
			if (editingInput && !editingInput.contains(target)) {
				cancelEdit();
			}
		};

		// 延迟添加监听器，避免立即触发
		const timeoutId = setTimeout(() => {
			document.addEventListener('click', handleOutsideClick, true);
		}, 100);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener('click', handleOutsideClick, true);
		};
	});
</script>

<div class="flex h-full flex-col">
	{#if isEmpty}
		<!-- 空状态提示 -->
		<div class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
			<IconFolderGit class="size-16 text-surface-400" />
			<div class="space-y-2">
				<h3 class="text-surface-900-50 text-lg font-semibold">暂无历史项目</h3>
				<p class="text-sm text-surface-500">点击右方<b>打开</b>按钮，创建新项目</p>
			</div>
		</div>
	{:else}
		<!-- 项目列表 -->
		<div class="flex-1 space-y-1 overflow-y-auto p-2" role="list">
			{#each projects as project (project.id)}
				<div
					class="rounded-container-token group relative flex items-center gap-2 transition-colors {project.id ===
					selectedId
						? 'preset-filled-primary'
						: activePopoverId === project.id
							? 'preset-tonal ring-2 ring-primary-500/50'
							: 'hover:preset-tonal'}"
					role="listitem"
				>
					<!-- 可点击区域 -->
					<button
						type="button"
						class="flex min-w-0 flex-1 items-center gap-2 p-3 text-left"
						onclick={() => handleSelect(project.id)}
						aria-label={`选择项目 ${project.name}`}
						disabled={editingProjectId === project.id}
					>
						<div class="min-w-0 flex-1">
							{#if editingProjectId === project.id}
								<!-- 编辑模式：显示输入框（移除了 Popover 包装） -->
								<Motion let:motion whileFocus={{ scale: 1.1 }}>
									<input
										type="text"
										data-editing-input={project.id}
										bind:value={editingName}
										onkeydown={(e) => handleEditKeydown(e, project.id)}
										onclick={handleInputClick}
										class="rounded-token input w-full px-2 py-1 text-sm font-medium"
										placeholder="项目名称"
										aria-label="编辑项目名称"
										title="按 Enter 提交，按 Esc 取消"
										use:motion
									/>
								</Motion>
							{:else}
								<!-- 显示模式 -->
								<div class="truncate font-medium">{project.name}</div>
							{/if}
							<div class="truncate text-xs opacity-60">{project.path}</div>
						</div>
					</button>

					<!-- 菜单按钮与 Popover -->
					<Popover.Provider value={popovers[project.id]}>
						<Popover>
							<Popover.Trigger
								class="mr-2 btn-icon preset-tonal"
								aria-label="项目操作菜单"
								disabled={editingProjectId === project.id}
							>
								<IconMoreVertical class="size-4" />
							</Popover.Trigger>

							<Portal>
								<Popover.Positioner class="z-50!">
									<Popover.Content
										class="min-w-48 overflow-hidden card bg-surface-100-900 p-1 shadow-xl"
									>
										<!-- 菜单项 -->
										<button
											type="button"
											class="rounded-container-token flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:preset-tonal"
											onclick={() => handleShowInExplorer(project.id)}
										>
											<IconEye class="size-4" />
											在资源管理器中显示
										</button>

										<button
											type="button"
											class="rounded-container-token flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:preset-tonal"
											onclick={() => handleRename(project.id)}
										>
											<IconPencil class="size-4" />
											重命名项目
										</button>

										<button
											type="button"
											class="rounded-container-token flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:preset-tonal"
											onclick={() => handleMove(project.id)}
										>
											<IconFolderInput class="size-4" />
											移动项目
										</button>

										<div class="my-1 h-px bg-surface-200/30" role="separator"></div>

										<button
											type="button"
											class="rounded-container-token flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-error-500 transition-colors hover:preset-tonal-error"
											onclick={() => handleRemove(project.id)}
										>
											<IconTrash2 class="size-4" />
											从列表中移除
										</button>

										<!-- 箭头组件 -->
										<Popover.Arrow
											style="--arrow-size: 10px; --arrow-background: var(--color-surface-100-900);"
										>
											<Popover.ArrowTip />
										</Popover.Arrow>
									</Popover.Content>
								</Popover.Positioner>
							</Portal>
						</Popover>
					</Popover.Provider>
				</div>
			{/each}
		</div>
	{/if}
</div>
