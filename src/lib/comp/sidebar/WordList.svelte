<script lang="ts">
	import IconCircle from '~icons/mdi/circle-outline';
	import IconCircleFilled from '~icons/mdi/circle';
	import IconDragVertical from '~icons/mdi/drag-vertical';
	import type { WordData } from '$lib/utils/vocab/type';
	import { viewStore, type ViewType } from '$lib/stores/project/view.svelte';
	import { navStore } from '$lib/stores/navpanel/nav.svelte';
	import { lightStore } from '$lib/stores/config/ipc/light.svelte';
	import { getViewId, wordTypeFromNav } from '$lib/stores/project/utils';
	import { logger } from '$lib/utils/logger';

	interface Props {
		items: WordData[];
		viewType: ViewType;
		icon?: typeof IconCircle;
		draggable?: boolean;
	}

	let { items, viewType, icon, draggable = true }: Props = $props();

	const viewedWords = $derived(
		navStore.filter ? items.filter((item) => (item.word ?? '').includes(navStore.filter)) : items
	);

	let draggedWord = $state<WordData | null>(null);
	let dragGhost = $state<HTMLElement | null>(null);

	function viewIdFromNav(id: string): string {
		const wordType = wordTypeFromNav(navStore.current);
		if (!wordType) {
			const msg = '添加了新的Nav面板，但是这里未处理.';
			logger.error(msg);
			throw new Error(msg);
		}
		return getViewId(id, wordType);
	}

	function handleItemClick(word: WordData) {
		const viewId = viewIdFromNav(word.id);
		const viewDef = {
			id: viewId,
			label: `${word.word}`,
			closable: true,
			type: viewType
		};
		viewStore.addView(viewDef);
	}

	function getItemState(id: string): 'focused' | 'opened' | 'closed' {
		const viewId = viewIdFromNav(id);
		if (viewStore.currentView?.id === viewId) {
			return 'focused';
		}
		if (viewStore.tabs.some((tab) => tab.id === viewId)) {
			return 'opened';
		}
		return 'closed';
	}

	function handleDragStart(e: DragEvent, word: WordData, buttonEl: HTMLElement) {
		draggedWord = word;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'copy';
			const data = JSON.stringify(word);
			e.dataTransfer.setData('application/json', data);
			e.dataTransfer.setData('text/plain', data);

			// 创建一个透明的图像用于 setDragImage（隐藏原生拖拽影子）
			// const transparentImg = document.createElement('div');
			// transparentImg.style.width = '1px';
			// transparentImg.style.height = '1px';
			// transparentImg.style.opacity = '0';
			// transparentImg.style.position = 'fixed';
			// transparentImg.style.left = '-9999px';
			// document.body.appendChild(transparentImg);
			// e.dataTransfer.setDragImage(transparentImg, 0, 0);

			// // 立即移除透明图像
			// setTimeout(() => document.body.removeChild(transparentImg), 0);

			// 创建自定义拖拽影子（这个才是真正显示的）
			const ghost = buttonEl.cloneNode(true) as HTMLElement;
			ghost.style.position = 'fixed';
			ghost.style.pointerEvents = 'none';
			ghost.style.zIndex = '9999';
			ghost.style.opacity = '0.8';
			ghost.style.width = buttonEl.offsetWidth + 'px';
			ghost.style.transform = 'rotate(3deg)';
			ghost.style.transition = 'none';
			ghost.style.left = e.clientX + 10 + 'px';
			ghost.style.top = e.clientY + 10 + 'px';

			// 添加醒目样式
			ghost.style.opacity = '0.95';
			ghost.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 2px rgba(59, 130, 246, 0.5)';
			ghost.style.filter = 'brightness(1.2) contrast(1.1)';
			ghost.style.border = '2px solid rgb(59, 130, 246)'; // 蓝色边框

			if (lightStore.mode === 'dark') {
				ghost.style.boxShadow =
					'0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 2px rgba(96, 165, 250, 0.8), 0 0 20px rgba(96, 165, 250, 0.4)';
				ghost.style.border = '2px solid rgb(96, 165, 250)';
				ghost.style.filter = 'brightness(1.3) contrast(1.15)';
			}

			document.body.appendChild(ghost);
			dragGhost = ghost;
		}

		// 使用 drag 事件而不是 dragover
		document.addEventListener('drag', updateGhostPosition);
	}

	$effect(() => {
		return () => {
			// 组件卸载时清理
			if (dragGhost) {
				document.body.removeChild(dragGhost);
			}
			document.removeEventListener('drag', updateGhostPosition);
		};
	});

	function updateGhostPosition(e: DragEvent) {
		if (dragGhost && e.clientX !== 0 && e.clientY !== 0) {
			// drag 事件在某些情况下会返回 (0,0)，需要过滤
			dragGhost.style.left = e.clientX + 10 + 'px';
			dragGhost.style.top = e.clientY + 10 + 'px';
		}
	}

	function handleDragEnd() {
		draggedWord = null;
		if (dragGhost && dragGhost.parentNode) {
			dragGhost.parentNode.removeChild(dragGhost);
			dragGhost = null;
		}
		document.removeEventListener('drag', updateGhostPosition);
	}

	function handleHandleClick(e: Event) {
		e.stopPropagation();
	}
</script>

<div class="space-y-0.5">
	{#each viewedWords as word (word.id)}
		{@const state = getItemState(word.id)}
		{@const isDragging = draggedWord?.id === word.id}
		{@const IconComponent = icon}

		<button
			type="button"
			onclick={() => handleItemClick(word)}
			class="group flex w-full items-center gap-3 rounded-lg px-3 py-2
                   text-sm font-medium transition-all duration-200
                   {isDragging ? 'scale-95 opacity-30' : ''}
                   {state === 'focused'
				? 'bg-primary-500 text-white shadow-md shadow-primary-500/25'
				: state === 'opened'
					? 'bg-primary-50 text-primary-900 hover:bg-primary-100 active:bg-primary-200 dark:bg-primary-900/20 dark:text-primary-100 dark:hover:bg-primary-900/30 dark:active:bg-primary-900/40'
					: 'text-surface-700 hover:bg-surface-200 active:bg-surface-300 dark:text-surface-300 dark:hover:bg-surface-700 dark:active:bg-surface-600'}
                   hover:scale-[1.01] active:scale-[0.99]"
		>
			{#if draggable}
				<div
					role="button"
					tabindex="-1"
					aria-label="拖拽 {word.word}"
					draggable="true"
					ondragstart={(e) => {
						const button = e.currentTarget.closest('button');
						if (button) {
							handleDragStart(e, word, button);
						}
					}}
					ondragend={handleDragEnd}
					onclick={handleHandleClick}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							handleHandleClick(e);
						}
					}}
					class="flex h-8 w-5 flex-shrink-0 cursor-move items-center justify-center opacity-0 transition-opacity duration-200
                       group-hover:opacity-100"
				>
					<IconDragVertical
						class="h-4 w-6
                           {state === 'focused'
							? 'text-white/70'
							: state === 'opened'
								? 'text-primary-400 dark:text-primary-500'
								: 'text-surface-400 dark:text-surface-500'}"
					/>
				</div>
			{/if}
			<div
				class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-all duration-200
                       {state === 'focused'
					? 'bg-white/20 group-hover:bg-white/30'
					: state === 'opened'
						? 'bg-primary-100 group-hover:bg-primary-200 dark:bg-primary-800/30 dark:group-hover:bg-primary-800/40'
						: 'bg-surface-100 group-hover:bg-surface-200 dark:bg-surface-700 dark:group-hover:bg-surface-600'}"
			>
				<IconComponent
					class="h-4 w-4 transition-transform duration-200 group-hover:scale-110
                           {state === 'focused'
						? 'text-white'
						: state === 'opened'
							? 'text-primary-600 dark:text-primary-400'
							: 'text-surface-500 group-hover:text-surface-600 dark:text-surface-400 dark:group-hover:text-surface-300'}"
				/>
			</div>

			<div class="flex flex-1 flex-col items-start gap-0.5 overflow-hidden">
				<span class="truncate text-left font-semibold">
					{word.word}
				</span>
			</div>

			<div class="flex h-5 w-5 flex-shrink-0 items-center justify-center">
				{#if state === 'focused'}
					<IconCircleFilled class="h-4 w-4 text-white" />
				{:else if state === 'opened'}
					<IconCircle class="h-4 w-4 text-primary-500 dark:text-primary-400" />
				{:else}
					<div
						class="h-2 w-2 rounded-full bg-surface-400 opacity-50 transition-all duration-200
					            group-hover:h-2.5 group-hover:w-2.5 group-hover:opacity-70
					            dark:bg-surface-500"
					></div>
				{/if}
			</div>
		</button>
	{/each}
</div>
