<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { CMWrapper } from '$lib/utils/codemirror/index';
	import { type MenuCommand } from '$lib/utils/codemirror/types';
	import Contextmenu, { type MenuType } from './Contextmenu.svelte';
	import LoadingComp from '$lib/comp/feedback/Loading.svelte';

	let editorElement = $state<HTMLDivElement>();
	let cmWrapper: CMWrapper;
	let isLoading = $state(true);

	// Props
	interface Props {
		initialValue?: string;
		onChange?: (markdown: string) => void;
		onFocus?: () => void;
		onBlur?: () => void;
		placeholder?: string;
		readonly?: boolean;
	}

	let {
		initialValue = '',
		onChange,
		onFocus,
		onBlur,
		placeholder = 'Start writing...',
		readonly = false
	}: Props = $props();

	onMount(async () => {
		if (!editorElement) return;

		cmWrapper = new CMWrapper({
			parent: editorElement,
			initialValue,
			placeholder,
			readonly,
			onChange,
			onFocus,
			onBlur
		});

		focus();

		isLoading = false;
	});

	onDestroy(() => {
		cmWrapper?.destroy();
	});

	function typeFromPoint(e: MouseEvent): MenuType {
		if (!cmWrapper) return 'selection';

		const pos = cmWrapper.posAtCoords(e.clientX, e.clientY);
		console.log('pos=', pos);
		if (pos === null) return 'selection';

		// const { from, to } = cmWrapper.getSelection();

		// // 如果点击位置在选区内，显示选区菜单
		// if (pos >= from && pos <= to && from !== to) {
		// 	return 'selection';
		// }

		return 'selection';
	}

	async function onMenucmd(cmd: string, param?: Record<string, unknown>) {
		if (!cmWrapper) return;
		await cmWrapper.executeCommand(cmd as MenuCommand, param);
	}

	// 暴露公共方法
	export function getMarkdown(): string {
		return cmWrapper?.getContent() || '';
	}

	export function setMarkdown(markdown: string): void {
		cmWrapper?.setContent(markdown);
	}

	export function focus(): void {
		cmWrapper?.focus();
	}

	export function clear(): void {
		cmWrapper?.clear();
	}

	export function insertAtCursor(text: string): void {
		cmWrapper?.insertAtCursor(text);
	}
</script>

<div class="relative h-full w-full">
	<Contextmenu {onMenucmd} {typeFromPoint}>
		<div
			bind:this={editorElement}
			class="markdown-editor h-full w-full overflow-hidden rounded-lg border border-surface-300 bg-surface-50 dark:border-surface-700 dark:bg-surface-900"
		></div>
	</Contextmenu>

	{#if isLoading}
		<div
			class="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm dark:bg-surface-900/80"
			role="alert"
			aria-live="polite"
			aria-busy="true"
		>
			<LoadingComp />
		</div>
	{/if}
</div>
