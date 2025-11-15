<script lang="ts">
	import IconCircle from '~icons/mdi/circle-outline';
	import IconCircleFilled from '~icons/mdi/circle';
	import IconDragVertical from '~icons/mdi/drag-vertical';
	import IconCheck from '~icons/mdi/check';
	import IconClose from '~icons/mdi/close';
	import type { WordData } from '$lib/utils/vocab/type';
	import { viewStore, type ViewType } from '$lib/stores/project/view.svelte';
	import { navStore } from '$lib/stores/navpanel/nav.svelte';
	import { lightStore } from '$lib/stores/config/ipc/light.svelte';
	import { getViewId, wordTypeFromNav } from '$lib/stores/project/word.svelte';
	import { logger } from '$lib/utils/logger';
	import WordMenu, { type FindInfoType } from './WordMenu.svelte';

	interface Props {
		items: WordData[];
		viewType: ViewType;
		icon?: typeof IconCircle;
		draggable?: boolean;
		deleteWord: (id: string) => Promise<void>;
		updateWord: (id: string, newWord: string) => Promise<void>;
	}

	let { items, viewType, icon, deleteWord, updateWord, draggable = true }: Props = $props();

	const viewedWords = $derived(
		navStore.filter ? items.filter((item) => (item.word ?? '').includes(navStore.filter)) : items
	);

	let draggedWord = $state<WordData | null>(null);
	let dragGhost = $state<HTMLElement | null>(null);
	let editingWordId = $state<string | null>(null);
	let editValue = $state<string>('');
	let inputElement = $state<HTMLInputElement | null>(null);

	function viewIdFromNav(wordId: string): string {
		const wordType = wordTypeFromNav(navStore.current);
		if (!wordType) {
			const msg = '添加了新的Nav面板，但是这里未处理.';
			logger.error(msg);
			throw new Error(msg);
		}
		return getViewId(wordId, wordType);
	}

	function handleItemClick(word: WordData) {
		// 如果正在编辑，点击不触发打开
		if (editingWordId === word.id) return;

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

			ghost.style.opacity = '0.95';
			ghost.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 2px rgba(59, 130, 246, 0.5)';
			ghost.style.filter = 'brightness(1.2) contrast(1.1)';
			ghost.style.border = '2px solid rgb(59, 130, 246)';

			if (lightStore.mode === 'dark') {
				ghost.style.boxShadow =
					'0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 2px rgba(96, 165, 250, 0.8), 0 0 20px rgba(96, 165, 250, 0.4)';
				ghost.style.border = '2px solid rgb(96, 165, 250)';
				ghost.style.filter = 'brightness(1.3) contrast(1.15)';
			}

			document.body.appendChild(ghost);
			dragGhost = ghost;
		}

		document.addEventListener('drag', updateGhostPosition);
	}

	function find(id: string): FindInfoType {
		const word = items.find((item) => item.id === id);
		const viewId = word ? viewIdFromNav(word.id) : '';
		return {
			word,
			viewId
		};
	}

	$effect(() => {
		return () => {
			if (dragGhost) {
				document.body.removeChild(dragGhost);
			}
			document.removeEventListener('drag', updateGhostPosition);
		};
	});

	function updateGhostPosition(e: DragEvent) {
		if (dragGhost && e.clientX !== 0 && e.clientY !== 0) {
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

	function handleHandleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.stopPropagation();
		}
	}

	function rename(wordId: string) {
		const word = items.find((item) => item.id === wordId);
		if (!word) return;

		editingWordId = wordId;
		editValue = word.word || '';

		// 下一个 tick 聚焦输入框并选中文本
		setTimeout(() => {
			if (inputElement) {
				inputElement.focus();
				inputElement.select();
			}
		}, 0);
	}

	async function confirmRename() {
		if (!editingWordId || !updateWord) {
			cancelRename();
			return;
		}

		const trimmedValue = editValue.trim();
		if (!trimmedValue) {
			cancelRename();
			return;
		}

		try {
			await updateWord(editingWordId, trimmedValue);
			editingWordId = null;
			editValue = '';
		} catch (error) {
			logger.error('重命名失败:', error instanceof Error ? error.message : String(error));
		}
	}

	function cancelRename() {
		editingWordId = null;
		editValue = '';
	}

	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			confirmRename();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelRename();
		}
	}

	function handleEditClick(e: Event) {
		e.stopPropagation();
	}

	function handleEditKeydown(e: KeyboardEvent) {
		e.stopPropagation();
	}
</script>

<WordMenu {find} {rename} {deleteWord} ensureView={handleItemClick}>
	{#each viewedWords as word (word.id)}
		{@const state = getItemState(word.id)}
		{@const isDragging = draggedWord?.id === word.id}
		{@const isEditing = editingWordId === word.id}
		{@const IconComponent = icon}

		<button
			type="button"
			data-word-id={word.id}
			onclick={() => handleItemClick(word)}
			class="group relative flex w-full items-center gap-3 rounded-lg px-3
                   py-2 text-sm font-medium transition-all duration-200
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
					onkeydown={handleHandleKeydown}
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

			<div class="flex min-h-[2rem] flex-1 items-center gap-0.5 overflow-hidden">
				{#if isEditing}
					<!-- 编辑模式：覆盖整个文本区域 -->
					<div
						role="button"
						tabindex="-1"
						aria-label="编辑单词"
						class="absolute right-12 left-[calc(3rem+0.75rem)] z-50 flex items-center
						       gap-1 rounded border-2 border-primary-500 bg-white
						       px-2 py-1 shadow-lg dark:border-primary-400 dark:bg-surface-800"
						onclick={handleEditClick}
						onkeydown={handleEditKeydown}
					>
						<input
							bind:this={inputElement}
							bind:value={editValue}
							onkeydown={handleInputKeydown}
							onclick={handleEditClick}
							class="min-w-0 flex-1 border-none bg-transparent py-1 text-sm font-semibold
							       text-surface-900 outline-none dark:text-surface-100"
							type="text"
							aria-label="编辑单词"
						/>
						<div
							role="button"
							tabindex="-1"
							onclick={(e) => {
								e.stopPropagation();
								confirmRename();
							}}
							onkeydown={() => {}}
							class="flex-shrink-0 rounded p-1 transition-colors hover:bg-success-100 dark:hover:bg-success-900/30"
							aria-label="确认修改"
						>
							<IconCheck class="h-4 w-4 text-success-600 dark:text-success-400" />
						</div>
						<div
							role="button"
							tabindex="-1"
							onclick={(e) => {
								e.stopPropagation();
								cancelRename();
							}}
							onkeydown={() => {}}
							class="flex-shrink-0 rounded p-1 transition-colors hover:bg-error-100 dark:hover:bg-error-900/30"
							aria-label="取消修改"
						>
							<IconClose class="h-4 w-4 text-error-600 dark:text-error-400" />
						</div>
					</div>
				{:else}
					<!-- 正常显示模式 -->
					<span class="truncate text-left font-semibold">
						{word.word}
					</span>
				{/if}
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
</WordMenu>
