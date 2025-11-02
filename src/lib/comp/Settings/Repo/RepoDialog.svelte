<script lang="ts">
	/**
	 * 📦 数据来源说明
	 *
	 * 组件当前使用内部假数据。实际使用时,请将数据替换为外部 Store:
	 *
	 * 示例:
	 * import { vaultStore } from '$lib/stores/vaultStore';
	 * let data = vaultStore.data; // 替换下方的假数据定义
	 */

	import { createToaster, Dialog, Portal, Toast } from '@skeletonlabs/skeleton-svelte';
	import IconFolderGit from '~icons/lucide/folder-git';
	import IconX from '~icons/lucide/x';

	import { repositoryStore } from '$lib/stores/config/ipc/repository.svelte';
	import RepositoryList from './RepositoryList.svelte';
	import OpenProject from './OpenProject.svelte';
	import RepoInfo from './RepoInfo.svelte';
	import { setContext } from 'svelte';
	import { softinfo } from '$lib/utils/softinfo';
	import LangSel from '../LangSel.svelte';

	// Props
	interface Props {
		/**
		 * 控制对话框的初始打开状态
		 * @default false
		 */
		defaultOpen?: boolean;

		/**
		 * 对话框是否可用户关闭--默认true.这一属性不影响程序关闭．
		 * @default true
		 */
		closeable?: boolean;

		/**
		 * 对话框打开状态变化时的回调函数
		 * @param open - 新的打开状态
		 */
		onOpenChange?: (open: boolean) => void;
	}

	let { defaultOpen = false, closeable = true, onOpenChange }: Props = $props();

	// 为对话框创建独立的 toaster 实例
	const dialogToaster = createToaster({
		placement: 'top'
	});

	// 在组件初始化时设置 context
	setContext('dialogToaster', dialogToaster);

	// 关闭对话框时清空全部toaster
	function handleOpenChange(param: Record<string, any>) {
		const isOpen = param.open;

		// 清空 toaster
		if (!isOpen) {
			dialogToaster.dismiss();
		}

		// 调用外部回调
		onOpenChange?.(isOpen);
	}

	const repositories = $derived(repositoryStore.repositories);
	const isEmpty = $derived(repositories.length === 0);
</script>

<Dialog
	{defaultOpen}
	closeOnEscape={false}
	closeOnInteractOutside={false}
	onOpenChange={handleOpenChange}
>
	<Dialog.Trigger class="flex w-full items-center gap-3 px-3 py-2">
		<IconFolderGit class="size-4 flex-shrink-0 text-surface-500" />
		<span class="text-surface-900-50 text-sm whitespace-nowrap">
			{isEmpty ? 'Add Project...' : 'Manage Projects...'}
		</span>
	</Dialog.Trigger>

	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<Dialog.Content
				class="relative flex h-[600px] w-full max-w-4xl flex-col overflow-hidden card bg-surface-100-900 shadow-xl"
			>
				{#if closeable}
					<!-- 关闭按钮 -->
					<Dialog.CloseTrigger
						class="absolute top-4 right-4 z-10 btn-icon preset-tonal"
						aria-label="关闭对话框"
					>
						<IconX class="size-5" />
					</Dialog.CloseTrigger>
				{/if}

				<!-- 对话框主体 - 两列布局 -->
				<div class="flex min-h-0 flex-1">
					<!-- 左列 - 仓库列表 -->
					<div class="flex w-1/3 flex-col border-r border-surface-200/30">
						<div class="flex-1 space-y-1 overflow-y-auto p-2 pt-6">
							<RepositoryList></RepositoryList>
						</div>
					</div>

					<!-- 右列 - 详情和操作 -->
					<div class="flex flex-1 flex-col">
						<!-- 版本信息 -->
						<div class="space-y-4 border-b border-surface-200/30 p-6">
							<Dialog.Title class="pr-12 text-2xl font-bold">
								unigen.cc
								<span class="align-super text-xs opacity-50">
									v{softinfo.version}
								</span>
							</Dialog.Title>

							<div class="space-y-2 text-sm">
								<RepoInfo></RepoInfo>
							</div>
						</div>

						<!-- 操作按钮区域 -->
						<div class="flex flex-1 items-center justify-center p-6">
							<OpenProject></OpenProject>
						</div>

						<!-- 语言选择组件 -->
						<div class="border-t border-surface-200/30 p-6">
							<div class="flex items-center justify-between">
								<span class="pr-1 text-sm whitespace-nowrap opacity-60">语言</span>
								<LangSel></LangSel>
							</div>
						</div>
					</div>
				</div>

				<!-- Toast Group -->
				<Toast.Group
					toaster={dialogToaster}
					class="pointer-events-none !absolute !inset-0 z-50 my-3 !p-4"
				>
					{#snippet children(toast)}
						<Toast {toast} class="pointer-events-auto py-4">
							<Toast.Message>
								<Toast.Title>{toast.title}</Toast.Title>
								<Toast.Description>{toast.description}</Toast.Description>
							</Toast.Message>
							<Toast.CloseTrigger />
						</Toast>
					{/snippet}
				</Toast.Group>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
