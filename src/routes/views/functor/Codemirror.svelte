<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { CMWrapper } from '$lib/utils/codemirror/index';
	import { type MenuCommand } from '$lib/utils/codemirror/types';
	import Contextmenu, { type MenuType } from './Contextmenu.svelte';
	import LoadingComp from '$lib/comp/feedback/Loading.svelte';
	import { functorStore } from '$lib/stores/project/functor.svelte';
	import type { FunctorData } from '$lib/utils/vocab/type';
	import { doComplete } from './complete';

	let editorElement = $state<HTMLDivElement>();
	let cmWrapper: CMWrapper;
	let isLoading = $state(true);
	let functor: FunctorData | undefined;

	// Props
	interface Props {
		wid: string;
		onChange: (markdown: string) => void;
		onFocus?: () => void;
		onBlur?: () => void;
		placeholder?: string;
		readonly?: boolean;
	}

	let {
		wid,
		onChange,
		onFocus,
		onBlur,
		placeholder = 'Start writing...',
		readonly = false
	}: Props = $props();

	onMount(async () => {
		if (!editorElement) return;

		functor = functorStore.find(wid);

		console.log('functor=', functor);

		cmWrapper = new CMWrapper({
			parent: editorElement,
			initialValue: functor?.extra?.source ?? '',
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
		const ret: MenuType = {
			hasContent: false,
			type: 'normal'
		};
		if (!cmWrapper) return ret;

		if (cmWrapper.getContent().length === 0) {
			return ret;
		}

		ret.hasContent = true;

		return ret;

		// const pos = cmWrapper.posAtCoords(e.clientX, e.clientY);
		// console.log('pos=', pos);
		// if (pos === null) return ret;

		// // const { from, to } = cmWrapper.getSelection();

		// // // 如果点击位置在选区内，显示选区菜单
		// // if (pos >= from && pos <= to && from !== to) {
		// // 	return 'selection';
		// // }

		// return ret;
	}

	async function onAutoCmd() {
		isLoading = true;
		onChange('');
		const content = await doComplete(cmWrapper.getContent());
		cmWrapper.setContent(content);
		isLoading = false;
		// 开始编译和优化．
	}

	async function onMenucmd(cmd: string, param?: Record<string, unknown>) {
		if (!cmWrapper) return;
		switch (cmd) {
			case 'auto': // 自动完善．
				console.log('auto menu command!!');
				return onAutoCmd();
			default:
				return await cmWrapper.executeCommand(cmd as MenuCommand, param);
		}
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
