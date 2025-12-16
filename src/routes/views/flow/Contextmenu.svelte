<!-- contextmenu.svelte -->
<script lang="ts">
	import { ContextMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import IconCloseBox from '~icons/mdi/close-box';
	import { onMount } from 'svelte';

	interface Props {
		children: Snippet;
		onMenucmd?: (cmd: string, param?: Record<string, any>) => void;
		nodeFromEle: (e: MouseEvent) => string | undefined;
	}

	let { children, onMenucmd = () => {}, nodeFromEle }: Props = $props();

	let menuType = $state<'editor' | 'node'>('editor');
	let open = $state(false);

	let clientX: number, clientY: number;
	let lastNodeId = '';
	function handleContextMenu(e: MouseEvent) {
		// console.log('enter handleContextMenu',e.offsetX,e.offsetY);
		clientX = e.offsetX;
		clientY = e.offsetY;
		lastNodeId = nodeFromEle(e) ?? '';
		menuType = lastNodeId ? 'node' : 'editor';
	}

	// 添加全局点击监听器来关闭菜单
	onMount(() => {
		function handleClickOutside(e: MouseEvent) {
			if (open) {
				const target = e.target as HTMLElement;
				// 检查点击是否在菜单内容之外
				if (!target.closest('[data-menu-content]')) {
					open = false;
				}
			}
		}

		// 使用捕获阶段确保在 Rete.js 之前捕获事件
		document.addEventListener('mousedown', handleClickOutside, true);
		document.addEventListener('click', handleClickOutside, true);

		return () => {
			document.removeEventListener('mousedown', handleClickOutside, true);
			document.removeEventListener('click', handleClickOutside, true);
		};
	});
</script>

<ContextMenu.Root bind:open>
	<ContextMenu.Trigger class="h-full w-full" oncontextmenu={handleContextMenu}>
		{@render children()}
	</ContextMenu.Trigger>

	<ContextMenu.Portal>
		<ContextMenu.Content
			data-menu-content
			class="animate-in fade-in-0 zoom-in-95 z-[9999] min-w-[200px] rounded-lg border border-surface-300 bg-surface-50 py-1 shadow-xl outline-none dark:border-surface-700 dark:bg-surface-800"
		>
			{#if menuType === 'node'}
				<!-- Node 菜单 -->
				<ContextMenu.Item
					class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 dark:hover:bg-surface-700"
					onclick={() => {
						if (lastNodeId) {
							onMenucmd('detail', { id: lastNodeId });
						}
						open = false;
					}}
				>
					<span>编辑节点</span>
				</ContextMenu.Item>
				<ContextMenu.Separator class="my-1 h-px bg-surface-300 dark:bg-surface-700" />
				<ContextMenu.Item
					class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 dark:hover:bg-surface-700"
					onclick={() => {
						if (lastNodeId) {
							onMenucmd('rmNode', { id: lastNodeId });
						}
						open = false;
					}}
				>
					<IconCloseBox class="size-4" />
					<span>移除节点</span>
				</ContextMenu.Item>
			{:else if menuType === 'editor'}
				<ContextMenu.Item
					class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 dark:hover:bg-surface-700"
					onclick={() => {
						onMenucmd('newnode', {
							clientX,
							clientY
						});
						open = false;
					}}
				>
					<span>新建节点</span>
				</ContextMenu.Item>
				<ContextMenu.Separator class="my-1 h-px bg-surface-300 dark:bg-surface-700" />
				<ContextMenu.Item
					class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 dark:hover:bg-surface-700"
					onclick={() => {
						onMenucmd('reset');
						open = false;
					}}
				>
					<span>显示全部</span>
				</ContextMenu.Item>
				<ContextMenu.Item
					class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 dark:hover:bg-surface-700"
					onclick={() => {
						onMenucmd('layout');
						open = false;
					}}
				>
					<span>自动布局</span>
				</ContextMenu.Item>
			{/if}
		</ContextMenu.Content>
	</ContextMenu.Portal>
</ContextMenu.Root>
