<script lang="ts">
	import { onMount } from 'svelte';
	import { Window } from '@tauri-apps/api/window';
	import PanelToggle from './Paneltoggle.svelte';
	import LeftTabs from './LeftTabs.svelte';
	import ViewTabs from './ViewTabs.svelte';
	import { leftPanel } from '../stores/config/prj/panel.svelte';

	import IconMdiWindowMinimize from '~icons/mdi/window-minimize';
	import IconMdiWindowMaximize from '~icons/mdi/window-maximize';
	import IconMdiWindowRestore from '~icons/mdi/window-restore';
	import IconMdiClose from '~icons/mdi/close';

	import { Motion } from 'svelte-motion';

	let appWinCache: Window | null = null;
	const appWindow = () => {
		if (!appWinCache) {
			appWinCache = Window.getCurrent();
		}
		return appWinCache;
	};

	let isMax = $state(true);
	let windowWidth = $state(0);
	let controlsWidth = $state(0);
	let controlsRef: HTMLDivElement;

	let leftTabsWidth = $derived(() => {
		if (!leftPanel.show) return 0;
		return (windowWidth - 48) * (leftPanel.size / 100);
	});

	// 双击检测
	let lastClickTime = 0;
	let lastClickX = 0;
	let lastClickY = 0;
	const DOUBLE_CLICK_THRESHOLD = 300;
	const POSITION_THRESHOLD = 10;

	async function syncMax() {
		isMax = await appWindow().isMaximized();
	}

	async function toggleMaximize() {
		const max = await appWindow().isMaximized();
		max ? await appWindow().unmaximize() : await appWindow().maximize();
		await syncMax();
	}

	function minimize() {
		appWindow().minimize();
	}

	function closeWin() {
		appWindow().close();
	}

	/**
	 * 获取元素的父级元素（处理 SVG 等特殊情况）
	 */
	function getParentElement(element: Element): Element | null {
		// SVG 元素使用 ownerSVGElement 或 parentElement
		if (element instanceof SVGElement) {
			return element.ownerSVGElement || element.parentElement;
		}
		return element.parentElement;
	}

	/**
	 * 检查元素是否应该阻止拖拽
	 * 向上遍历 DOM 树，查找是否有 data-no-drag 或可交互元素
	 * @param target 事件目标元素
	 * @param currentTarget 事件绑定的元素（遍历终点）
	 */
	function shouldPreventDrag(
		target: EventTarget | null,
		currentTarget: EventTarget | null
	): boolean {
		// 确保 target 和 currentTarget 都是 Element
		if (!(target instanceof Element) || !(currentTarget instanceof Element)) {
			return false;
		}

		let element: Element | null = target;

		// 向上遍历，直到到达 currentTarget
		while (element && element !== currentTarget) {
			// 检查是否有明确的 data-no-drag 标记
			if (element.hasAttribute('data-no-drag')) {
				return true;
			}

			// 检查是否是可交互元素（包括 HTMLElement 和 SVGElement）
			const tagName = element.tagName.toLowerCase();
			if (['button', 'input', 'select', 'textarea', 'a'].includes(tagName)) {
				return true;
			}

			// 检查是否有交互性的 role
			if (element.hasAttribute('role')) {
				const role = element.getAttribute('role');
				if (role && ['button', 'link', 'tab', 'menuitem'].includes(role)) {
					return true;
				}
			}

			// 检查是否有 onclick 等事件监听器标记
			// 注意：这只能检查内联事件，不能检查通过 addEventListener 添加的
			if (
				element.hasAttribute('onclick') ||
				element.hasAttribute('onmousedown') ||
				element.hasAttribute('onmouseup')
			) {
				return true;
			}

			// 获取父元素（处理 SVG 等特殊情况）
			element = getParentElement(element);
		}

		return false;
	}

	async function handleHeaderMouseDown(e: MouseEvent) {
		// 检查是否应该阻止拖拽 - 如果是交互元素，直接返回
		if (shouldPreventDrag(e.target, e.currentTarget)) {
			// 不要 preventDefault 或 stopPropagation，让事件继续传播到按钮
			return;
		}

		const currentTime = Date.now();
		const timeDiff = currentTime - lastClickTime;
		const positionDiffX = Math.abs(e.clientX - lastClickX);
		const positionDiffY = Math.abs(e.clientY - lastClickY);

		// 双击检测
		if (
			timeDiff < DOUBLE_CLICK_THRESHOLD &&
			positionDiffX < POSITION_THRESHOLD &&
			positionDiffY < POSITION_THRESHOLD
		) {
			await toggleMaximize();
			lastClickTime = 0;
			lastClickX = 0;
			lastClickY = 0;
			return;
		}

		lastClickTime = currentTime;
		lastClickX = e.clientX;
		lastClickY = e.clientY;

		// 只在非交互元素上启动拖拽
		try {
			await appWindow().startDragging();
		} catch (err) {
			console.error('Drag failed:', err);
		}
	}

	function updateWindowWidth() {
		windowWidth = window.innerWidth;
	}

	onMount(() => {
		let unsubs: Array<() => void> = [];
		let controlsResizeObserver: ResizeObserver | null = null;

		updateWindowWidth();

		const resizeObserver = new ResizeObserver(() => {
			updateWindowWidth();
		});
		resizeObserver.observe(document.documentElement);

		// 测量控制区宽度
		if (controlsRef) {
			controlsResizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					controlsWidth = entry.contentRect.width;
				}
			});
			controlsResizeObserver.observe(controlsRef);
		}

		(async () => {
			await syncMax();
			unsubs.push(await appWindow().onResized(syncMax));
			unsubs.push(await appWindow().onMoved(syncMax));
		})();

		return () => {
			resizeObserver.disconnect();
			if (controlsResizeObserver) {
				controlsResizeObserver.disconnect();
			}
			for (const u of unsubs) {
				try {
					u();
				} catch {}
			}
		};
	});
</script>

<div
	class="relative flex h-[var(--tb-height)] w-full items-center justify-between gap-2 border-b
         border-surface-200 bg-surface-100/80
         px-2 select-none dark:border-surface-700 dark:bg-surface-800/80"
	aria-label="Window title bar"
	onmousedown={handleHeaderMouseDown}
	tabindex="-1"
	role="toolbar"
>
	<!-- toggle Left panel & LeftTabs -->
	<div class="flex relative z-10 flex min-w-0 items-center gap-2 rounded px-1">
		<PanelToggle size="sm" />
		{#if leftPanel.show}
			<div class="overflow-hidden transition-all duration-200" style="width: {leftTabsWidth()}px;">
				<LeftTabs />
				<div
					class="absolute top-0 right-0 h-full w-px bg-surface-300/60 dark:bg-surface-600/60"
					aria-hidden="true"
				></div>
			</div>
		{/if}
	</div>

	<!-- Center: Dynamic tabs -->
	<div class="relative z-10 flex min-w-0 flex-1" style="margin-right: {controlsWidth}px;">
		<ViewTabs />
	</div>

	<!-- Right: window controls - 占位元素 -->
	<PanelToggle right={true} size="sm" />
	<div
		class="relative flex items-center gap-1"
		style="width: {controlsWidth}px; visibility: hidden;"
		aria-hidden="true"
	>
		<!-- 这个是占位用的，实际内容在 fixed 元素中 -->
	</div>
</div>
<!-- Right: window controls - Fixed 位置 -->
<div
	bind:this={controlsRef}
	class="pointer-events-auto fixed top-0 right-0 flex items-center gap-1 px-2"
	style="height: var(--tb-height); z-index: 9999;"
>
	<Motion let:motion whileHover={{ scale: 1.2 }} whileTap={{ rotate: 45 }}>
		<button
			class="variant-ghost btn grid size-8 place-items-center rounded-md btn-sm
             transition-colors duration-200
             hover:bg-surface-200/50 dark:hover:bg-surface-700/50"
			type="button"
			aria-label="Minimize window"
			onclick={minimize}
			use:motion
		>
			<IconMdiWindowMinimize class="opacity-80" aria-hidden="true" />
		</button>
	</Motion>

	<Motion let:motion whileHover={{ scale: 1.2 }} whileTap={{ rotate: 45 }}>
		<button
			class="variant-ghost btn grid size-8 place-items-center rounded-md btn-sm
             transition-colors duration-200
             hover:bg-surface-200/50 dark:hover:bg-surface-700/50"
			type="button"
			aria-label={isMax ? 'Restore window' : 'Maximize window'}
			onclick={toggleMaximize}
			use:motion
		>
			{#if isMax}
				<IconMdiWindowRestore class="opacity-80" aria-hidden="true" />
			{:else}
				<IconMdiWindowMaximize class="opacity-80" aria-hidden="true" />
			{/if}
		</button>
	</Motion>

	<Motion let:motion whileHover={{ scale: 1.2 }} whileTap={{ rotate: 45 }}>
		<button
			class="variant-ghost btn grid size-8 place-items-center rounded-md btn-sm
             transition-colors duration-200
             hover:bg-error-500/90 hover:text-white"
			type="button"
			aria-label="Close window"
			onclick={closeWin}
			use:motion
		>
			<IconMdiClose aria-hidden="true" />
		</button>
	</Motion>
</div>
