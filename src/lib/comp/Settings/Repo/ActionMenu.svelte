<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import { Motion } from 'svelte-motion';
	import { quintOut } from 'svelte/easing';
	import IconMoreVertical from '~icons/lucide/more-vertical';
	import IconEye from '~icons/lucide/eye';
	import IconPencil from '~icons/lucide/pencil';
	import IconTrash2 from '~icons/lucide/trash-2';
	import IconFolderGit from '~icons/lucide/folder-git';
	import type { Repository } from '$lib/stores/config/ipc/repository.svelte';
	import { projectStore } from '$lib/stores/project/project.svelte';

	interface Props {
		project: Repository;
		disabled?: boolean;
		onShowInExplorer: () => void;
		onRename: () => void;
		onOpen: () => void;
		onRemove: () => void;
	}

	let { project, disabled = false, onShowInExplorer, onRename, onOpen, onRemove }: Props = $props();

	let open = $state(false);
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger
		class="btn-icon preset-tonal"
		tabindex={-1}
		aria-label="项目操作菜单"
		{disabled}
	>
		<Motion
			let:motion
			initial={{ scale: 1, rotate: 0 }}
			whileHover={{ scale: 1.15 }}
			whileTap={{ scale: 0.9, rotate: 90 }}
			animate={open ? { rotate: 90, scale: 1.1 } : { rotate: 0, scale: 1 }}
			transition={{ duration: 0.25, ease: quintOut }}
		>
			<div use:motion>
				<IconMoreVertical class="size-4" />
			</div>
		</Motion>
	</DropdownMenu.Trigger>

	<DropdownMenu.Portal>
		<DropdownMenu.Content
			class="rounded-container-token z-[50] min-w-48 overflow-hidden bg-surface-50 p-1.5 shadow-2xl ring-1 ring-surface-200/50 focus-visible:outline-none dark:bg-surface-800 dark:ring-surface-700/50"
			sideOffset={8}
			align="end"
		>
			<Motion
				let:motion
				initial={{ scale: 0.95, opacity: 0, y: -8 }}
				animate={{ scale: 1, opacity: 1, y: 0 }}
				exit={{ scale: 0.95, opacity: 0, y: -8 }}
				transition={{ duration: 0.15, ease: quintOut }}
			>
				<div use:motion class="contents">
					<DropdownMenu.Item
						class="rounded-container-token flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:bg-transparent data-[highlighted]:data-[disabled]:bg-transparent data-[disabled]:dark:hover:bg-transparent data-[highlighted]:data-[disabled]:dark:bg-transparent [&:not([data-disabled])]:cursor-pointer [&:not([data-disabled])]:hover:bg-surface-100 [&:not([data-disabled])]:data-[highlighted]:bg-surface-100 [&:not([data-disabled])]:dark:hover:bg-surface-700 [&:not([data-disabled])]:dark:data-[highlighted]:bg-surface-700"
						onSelect={onOpen}
						disabled={project.id === projectStore.currentId}
					>
						<IconFolderGit class="size-4" />
						<span>打开项目</span>
					</DropdownMenu.Item>

					<DropdownMenu.Item
						class="rounded-container-token flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:bg-transparent data-[highlighted]:data-[disabled]:bg-transparent data-[disabled]:dark:hover:bg-transparent data-[highlighted]:data-[disabled]:dark:bg-transparent [&:not([data-disabled])]:cursor-pointer [&:not([data-disabled])]:hover:bg-surface-100 [&:not([data-disabled])]:data-[highlighted]:bg-surface-100 [&:not([data-disabled])]:dark:hover:bg-surface-700 [&:not([data-disabled])]:dark:data-[highlighted]:bg-surface-700"
						onSelect={onShowInExplorer}
					>
						<IconEye class="size-4" />
						<span>在资源管理器中显示</span>
					</DropdownMenu.Item>

					<DropdownMenu.Item
						class="rounded-container-token flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:bg-transparent data-[highlighted]:data-[disabled]:bg-transparent data-[disabled]:dark:hover:bg-transparent data-[highlighted]:data-[disabled]:dark:bg-transparent [&:not([data-disabled])]:cursor-pointer [&:not([data-disabled])]:hover:bg-surface-100 [&:not([data-disabled])]:data-[highlighted]:bg-surface-100 [&:not([data-disabled])]:dark:hover:bg-surface-700 [&:not([data-disabled])]:dark:data-[highlighted]:bg-surface-700"
						onSelect={onRename}
					>
						<IconPencil class="size-4" />
						<span>重命名项目</span>
					</DropdownMenu.Item>

					<DropdownMenu.Separator class="my-1.5 h-px bg-surface-200/50 dark:bg-surface-600/50" />

					<DropdownMenu.Item
						class="rounded-container-token flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:bg-transparent data-[highlighted]:data-[disabled]:bg-transparent data-[disabled]:dark:hover:bg-transparent data-[highlighted]:data-[disabled]:dark:bg-transparent [&:not([data-disabled])]:cursor-pointer [&:not([data-disabled])]:text-error-600 [&:not([data-disabled])]:hover:bg-error-50 [&:not([data-disabled])]:data-[highlighted]:bg-error-50 [&:not([data-disabled])]:dark:text-error-400 [&:not([data-disabled])]:dark:hover:bg-error-900/20 [&:not([data-disabled])]:dark:data-[highlighted]:bg-error-900/20"
						onSelect={onRemove}
						disabled={project.owner !== 0 || project.id === projectStore.currentId}
					>
						<IconTrash2 class="size-4" />
						<span>从列表中移除</span>
					</DropdownMenu.Item>
				</div>
			</Motion>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
