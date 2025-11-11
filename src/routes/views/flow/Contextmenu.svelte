<!-- contextmenu.svelte -->
<script lang="ts">
	import { ContextMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import IconCloseBox from '~icons/mdi/close-box';
	import { onMount } from 'svelte';
	import { eventBus } from '$lib/utils/evt';

	interface Props {
		children: Snippet;
		onMenucmd?: (cmd: string, nodeid?: string) => void;
		getMenuType: (e: MouseEvent) => 'editor' | 'node';
	}

	let { children, onMenucmd = () => {}, getMenuType }: Props = $props();

	let menuType = $state<'editor' | 'node'>('editor');
	let open = $state(false);

	function handleContextMenu(e: MouseEvent) {
		console.log('enter handleContextMenu');
		menuType = getMenuType(e);
	}

	// 添加全局点击监听器来关闭菜单
	onMount(() => {
		function handleClickOutside(e: MouseEvent) {
			// eventBus.emit('reteclick', {});

			// // 手动触发一个新的点击事件到 document，绕过 Rete.js 的阻止
			// const syntheticEvent = new MouseEvent('click', {
			// 	bubbles: true,
			// 	cancelable: true,
			// 	view: window,
			// 	clientX: e.clientX,
			// 	clientY: e.clientY,
			// 	screenX: e.screenX,
			// 	screenY: e.screenY,
			// 	button: e.button,
			// 	buttons: e.buttons,
			// 	relatedTarget: e.relatedTarget
			// });

			// // 延迟触发，确保在当前事件处理完成后
			// setTimeout(() => {
			// 	document.dispatchEvent(syntheticEvent);
			// }, 0);

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
						onMenucmd('close');
						open = false;
					}}
				>
					<IconCloseBox class="size-4" />
					<span>关闭</span>
				</ContextMenu.Item>

				<ContextMenu.Item
					class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 dark:hover:bg-surface-700"
					onclick={() => {
						onMenucmd('close-right');
						open = false;
					}}
				>
					<span>关闭右侧</span>
				</ContextMenu.Item>

				<ContextMenu.Item
					class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 dark:hover:bg-surface-700"
					onclick={() => {
						onMenucmd('close-all');
						open = false;
					}}
				>
					<span>关闭全部</span>
				</ContextMenu.Item>

				<ContextMenu.Separator class="my-1 h-px bg-surface-300 dark:bg-surface-700" />
			{:else if menuType === 'editor'}
				<!-- Editor 菜单 -->
				<ContextMenu.Item
					class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 dark:hover:bg-surface-700"
					onclick={() => {
						onMenucmd('edit');
						open = false;
					}}
				>
					<span>编辑节点</span>
				</ContextMenu.Item>
				<ContextMenu.Item
					class="flex cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors outline-none hover:bg-surface-200 dark:hover:bg-surface-700"
					onclick={() => {
						onMenucmd('del');
						open = false;
					}}
				>
					<span>删除节点</span>
				</ContextMenu.Item>
			{/if}
		</ContextMenu.Content>
	</ContextMenu.Portal>
</ContextMenu.Root>
