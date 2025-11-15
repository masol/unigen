<script lang="ts">
	import { viewStore } from '$lib/stores/project/view.svelte';
	import type { WordData } from '$lib/utils/vocab/type';
	import { ContextMenu } from 'bits-ui';
	import { type Snippet } from 'svelte';
	import IconEdit from '~icons/lucide/pencil';
	import IconFileEdit from '~icons/lucide/file-edit';
	import IconCloseBox from '~icons/mdi/close-box';
	import IconTrash2 from '~icons/lucide/trash-2';
	import { ask } from '@tauri-apps/plugin-dialog';

	export type FindInfoType = {
		word: WordData | undefined;
		viewId: string;
	};

	interface Props {
		children: Snippet;
		find: (id: string) => FindInfoType;
		ensureView: (word: WordData) => void;
		rename: (id: string) => void;
		deleteWord: (id: string) => void;
	}

	let { children, find, ensureView, rename, deleteWord }: Props = $props();
	let lastNodeId = '';

	let wordData: WordData | undefined = $state(undefined);
	let lastViewId = $state('');

	let open = $state(false);

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		lastNodeId = '';
		lastViewId = '';
		const target = e.target || e.currentTarget;
		if (target instanceof HTMLElement) {
			const button = (target as HTMLElement).closest('button');
			lastNodeId = button?.getAttribute('data-word-id') ?? '';
		}
		if (lastNodeId) {
			const nodeInfo = find(lastNodeId);
			if (viewStore.findById(nodeInfo.viewId)) {
				lastViewId = nodeInfo.viewId;
			}
			wordData = nodeInfo.word;
			setTimeout(() => {
				open = true;
			}, 0);
		}
	}

	async function handleDelete() {
		if (!wordData) return;

		const confirmed = await ask(`确定要删除 "${wordData.word}" 吗？这一操作不可恢复。`, {
			title: '删除确认',
			kind: 'warning',
			okLabel: '删除',
			cancelLabel: '取消'
		});

		if (confirmed) {
			if (lastViewId) {
				viewStore.removeView(lastViewId);
			}
			deleteWord(wordData.id);
		}
		open = false;
	}
</script>

<div role="region" aria-label="Context menu area" oncontextmenu={handleContextMenu}>
	<ContextMenu.Root bind:open>
		<ContextMenu.Trigger class="contents space-y-0.5">
			{@render children()}
		</ContextMenu.Trigger>

		<ContextMenu.Portal>
			{#if wordData}
				<ContextMenu.Content
					data-menu-content
					class="animate-in fade-in-0 zoom-in-95 z-[9999] min-w-[200px] rounded-lg border border-surface-300 bg-surface-50 py-1 shadow-xl outline-none dark:border-surface-700 dark:bg-surface-800"
				>
					<ContextMenu.Item
						class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 dark:hover:bg-surface-700"
						onclick={() => {
							rename(wordData!.id);
							open = false;
						}}
					>
						<IconEdit class="size-4" />
						<span>修改名称</span>
					</ContextMenu.Item>
					{#if !lastViewId || viewStore.activeId !== lastViewId}
						<ContextMenu.Item
							class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 dark:hover:bg-surface-700"
							onclick={() => {
								ensureView(wordData!);
								open = false;
							}}
						>
							<IconFileEdit class="size-4" />
							<span>编辑<b>{wordData.word}</b></span>
						</ContextMenu.Item>
					{/if}
					{#if lastViewId}
						<ContextMenu.Item
							class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 dark:hover:bg-surface-700"
							onclick={() => {
								viewStore.removeView(lastViewId);
								open = false;
							}}
						>
							<IconCloseBox class="size-4" />
							<span>关闭视口</span>
						</ContextMenu.Item>
					{/if}
					<ContextMenu.Separator class="my-1 h-px bg-surface-300 dark:bg-surface-700" />

					<ContextMenu.Item
						class="rounded-container-token flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:bg-transparent data-[highlighted]:data-[disabled]:bg-transparent data-[disabled]:dark:hover:bg-transparent data-[highlighted]:data-[disabled]:dark:bg-transparent [&:not([data-disabled])]:cursor-pointer [&:not([data-disabled])]:text-error-600 [&:not([data-disabled])]:hover:bg-error-50 [&:not([data-disabled])]:data-[highlighted]:bg-error-50 [&:not([data-disabled])]:dark:text-error-400 [&:not([data-disabled])]:dark:hover:bg-error-900/20 [&:not([data-disabled])]:dark:data-[highlighted]:bg-error-900/20"
						onclick={handleDelete}
					>
						<IconTrash2 class="size-4" />
						<span>删除<b>{wordData.word}</b></span>
					</ContextMenu.Item>
				</ContextMenu.Content>
			{/if}
		</ContextMenu.Portal>
	</ContextMenu.Root>
</div>
