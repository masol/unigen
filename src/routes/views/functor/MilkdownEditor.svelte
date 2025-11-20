<script lang="ts">
	import './styles.scss';
	import { onMount, onDestroy } from 'svelte';
	import { MilkdownWrapper, type MilkdownConfig } from './MilkdownWrapper';
	import Contextmenu, { type MenuType } from './Contextmenu.svelte';
	import LoadingComp from '$lib/comp/feedback/Loading.svelte';

	let element: HTMLElement;
	let isLoading = $state(false);
	let milkdown: MilkdownWrapper | undefined;

	// Props
	interface Props {
		initialValue?: string;
		onChange?: (markdown: string) => void;
		onFocus?: () => void;
		onBlur?: () => void;
	}

	let { initialValue = '', onChange, onFocus, onBlur }: Props = $props();

	onMount(() => {
		const config: MilkdownConfig = {
			initialValue,
			onChange: (markdown) => {
				onChange?.(markdown);
			},
			onFocus: () => {
				onFocus?.();
			},
			onBlur: () => {
				onBlur?.();
			},
			onEvent: (event, data) => {
				handleEvent(event, data);
			}
		};

		milkdown = new MilkdownWrapper(element, config);
	});

	onDestroy(() => {
		if (milkdown) {
			milkdown.destroy();
		}
	});

	function typeFromPoint(e: MouseEvent): MenuType {
		// 根据鼠标位置判断菜单类型
		return 'selection';
	}

	async function onMenucmd(cmd: string, param?: Record<string, unknown>) {
		if (milkdown) {
			await milkdown.onMenucmd(cmd, param);
		}
	}

	function handleEvent(evt: string, param?: Record<string, unknown>) {
		switch (evt) {
			case 'show-menu':
				// 处理显示菜单事件
				break;
			case 'block-drag-enabled':
				console.log('Block drag enabled');
				break;
			default:
				console.log('Event:', evt, param);
		}
	}

	// 暴露公共方法
	export function getMarkdown(): string {
		return milkdown?.getMarkdown() || '';
	}

	export function setMarkdown(markdown: string): void {
		milkdown?.setMarkdown(markdown);
	}

	export function focus(): void {
		milkdown?.focus();
	}
</script>

<div class="relative h-full w-full">
	<Contextmenu {onMenucmd} {typeFromPoint}>
		<div bind:this={element} class="milkdown-editor h-full w-full"></div>
	</Contextmenu>

	{#if isLoading}
		<div
			class="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm dark:bg-gray-900/80"
			role="alert"
			aria-live="polite"
			aria-busy="true"
		>
			<LoadingComp />
		</div>
	{/if}
</div>
