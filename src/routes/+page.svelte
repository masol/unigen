<script lang="ts">
	import { onMount } from 'svelte';
	import { Pane, Splitpanes } from 'svelte-splitpanes';
	import { leftPanel, rightPanel, calcMainSize } from '$lib/stores/config/prj/panel.svelte';
	import View from './views/main.svelte';
	import NavPanel from './navpanel/main.svelte';

	let splitpanesContainer: HTMLElement | undefined = $state();
	let isResizing = $state(false);
	let justFinishedResizing = $state(false);

	const MIN_SIZE = 5;
	const HIDE_THRESHOLD = MIN_SIZE * 1.2;
	const DEFAULT_SIZE = 20;

	onMount(() => {
		setTimeout(() => {
			const splitters = splitpanesContainer?.querySelectorAll('.splitpanes__splitter');
			splitters?.forEach((splitter) => {
				splitter.addEventListener('click', handleSplitterInteraction as EventListener);
				splitter.addEventListener('keydown', handleSplitterInteraction as EventListener);
			});
		}, 100);
	});

	function handleResize(event: CustomEvent) {
		const panes = event.detail;
		isResizing = true;
		justFinishedResizing = false;

		const leftPaneSize = panes[0].size;
		const rightPaneSize = panes[2].size;

		if (!leftPanel.show && leftPaneSize > 0) {
			leftPanel.show = true;
		}

		if (!rightPanel.show && rightPaneSize > 0) {
			rightPanel.show = true;
		}

		if (leftPanel.show && leftPaneSize > 0) {
			leftPanel.size = leftPaneSize;
		}
		if (rightPanel.show && rightPaneSize > 0) {
			rightPanel.size = rightPaneSize;
		}
	}

	function handleResized(event: CustomEvent) {
		const panes = event.detail;
		const leftPaneSize = panes[0].size;
		const rightPaneSize = panes[2].size;

		if (leftPanel.show && leftPaneSize < HIDE_THRESHOLD) {
			leftPanel.show = false;
		} else if (leftPanel.show && leftPaneSize >= HIDE_THRESHOLD) {
			leftPanel.size = leftPaneSize;
		}

		if (rightPanel.show && rightPaneSize < HIDE_THRESHOLD) {
			rightPanel.show = false;
		} else if (rightPanel.show && rightPaneSize >= HIDE_THRESHOLD) {
			rightPanel.size = rightPaneSize;
		}

		isResizing = false;
		justFinishedResizing = true;

		setTimeout(() => {
			justFinishedResizing = false;
		}, 300);
	}

	function handleSplitterInteraction(e: MouseEvent | KeyboardEvent) {
		if (justFinishedResizing && e instanceof MouseEvent) {
			return;
		}

		if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') {
			return;
		}

		e.preventDefault();

		const target = e.target as HTMLElement;
		const splitter = target.closest('.splitpanes__splitter');
		if (!splitter) return;

		const splitters = Array.from(
			splitpanesContainer?.querySelectorAll('.splitpanes__splitter') || []
		);
		const splitterIndex = splitters.indexOf(splitter);

		if (splitterIndex === 0 && !leftPanel.show) {
			leftPanel.show = true;
			if (leftPanel.size < HIDE_THRESHOLD) {
				leftPanel.size = DEFAULT_SIZE;
			}
		} else if (splitterIndex === 1 && !rightPanel.show) {
			rightPanel.show = true;
			if (rightPanel.size < HIDE_THRESHOLD) {
				rightPanel.size = DEFAULT_SIZE;
			}
		}
	}

	function getLeftPaneSize() {
		if (!leftPanel.show) {
			return 0;
		}
		return leftPanel.size;
	}

	function getRightPaneSize() {
		if (!rightPanel.show) {
			return 0;
		}
		return rightPanel.size;
	}
</script>

<div class="min-h-0 flex-1 overflow-hidden" bind:this={splitpanesContainer} role="presentation">
	<Splitpanes
		class="h-full"
		theme="modern-theme"
		on:resize={handleResize}
		on:resized={handleResized}
	>
		<Pane
			minSize={0}
			maxSize={50}
			size={getLeftPaneSize()}
			class="overflow-hidden transition-all duration-300 ease-in-out"
		>
			<aside
				class="h-full overflow-auto border-l border-surface-200 bg-surface-100 transition-opacity duration-300 dark:border-surface-700 dark:bg-surface-800"
				class:opacity-0={!leftPanel.show}
				class:opacity-100={leftPanel.show}
				class:pointer-events-none={!leftPanel.show}
			>
				<NavPanel></NavPanel>
			</aside>
		</Pane>

		<Pane minSize={30} size={calcMainSize()} class="overflow-hidden">
			<main class="h-full overflow-auto bg-surface-50 dark:bg-surface-900">
				<!-- 主内容区域 -->
				<View></View>
			</main>
		</Pane>

		<Pane
			minSize={0}
			maxSize={50}
			size={getRightPaneSize()}
			class="overflow-hidden transition-all duration-300 ease-in-out"
		>
			<aside
				class="h-full overflow-auto border-l border-surface-200 bg-surface-100 transition-opacity duration-300 dark:border-surface-700 dark:bg-surface-800"
				class:opacity-0={!rightPanel.show}
				class:opacity-100={rightPanel.show}
				class:pointer-events-none={!rightPanel.show}
			>
				<div class="p-4">
					<h2 class="text-lg font-semibold text-surface-900 dark:text-surface-100">Right Panel</h2>
					<p class="mt-2 text-sm text-surface-600 dark:text-surface-400">
						Additional content goes here
					</p>
				</div>
			</aside>
		</Pane>
	</Splitpanes>
</div>

<style>
	:global(.modern-theme.splitpanes) {
		background-color: transparent;
	}

	:global(.modern-theme .splitpanes__pane) {
		background-color: transparent;
	}

	:global(.modern-theme .splitpanes__splitter) {
		background-color: rgb(var(--color-surface-300));
		width: 4px;
		position: relative;
		transition: background-color 200ms cubic-bezier(0.4, 0, 0.2, 1);
		cursor: col-resize !important;
		border: none;
		margin: 0;
		flex-shrink: 0;
		z-index: 10;
		outline: none;
	}

	:global(.dark .modern-theme .splitpanes__splitter) {
		background-color: rgb(var(--color-surface-600));
	}

	:global(.modern-theme .splitpanes__splitter:hover) {
		background-color: rgb(var(--color-primary-500));
		box-shadow:
			0 0 0 2px rgb(var(--color-primary-500) / 0.2),
			0 0 8px rgb(var(--color-primary-500) / 0.3);
	}

	:global(.dark .modern-theme .splitpanes__splitter:hover) {
		background-color: rgb(var(--color-primary-400));
		box-shadow:
			0 0 0 2px rgb(var(--color-primary-400) / 0.25),
			0 0 8px rgb(var(--color-primary-400) / 0.4);
	}

	:global(.modern-theme .splitpanes__splitter.splitpanes__splitter__active) {
		background-color: rgb(var(--color-primary-600));
		box-shadow:
			0 0 0 3px rgb(var(--color-primary-600) / 0.3),
			0 0 12px rgb(var(--color-primary-600) / 0.5);
	}

	:global(.dark .modern-theme .splitpanes__splitter.splitpanes__splitter__active) {
		background-color: rgb(var(--color-primary-300));
		box-shadow:
			0 0 0 3px rgb(var(--color-primary-300) / 0.35),
			0 0 12px rgb(var(--color-primary-300) / 0.6);
	}

	:global(.modern-theme .splitpanes__splitter::before) {
		content: '';
		position: absolute;
		left: -10px;
		top: 0;
		width: 24px;
		height: 100%;
		cursor: col-resize !important;
		z-index: 1;
	}

	:global(.modern-theme .splitpanes__splitter::after) {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%) scale(0.8);
		width: 6px;
		height: 48px;
		background-color: rgb(var(--color-surface-50));
		border-radius: 3px;
		border: 2px solid currentColor;
		color: rgb(var(--color-surface-400));
		box-shadow: 0 2px 8px rgb(var(--color-surface-900) / 0.15);
		transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
		pointer-events: none;
		opacity: 0;
		z-index: 2;
	}

	:global(.dark .modern-theme .splitpanes__splitter::after) {
		background-color: rgb(var(--color-surface-800));
		color: rgb(var(--color-surface-500));
		box-shadow: 0 2px 8px rgb(var(--color-surface-950) / 0.3);
	}

	:global(.modern-theme .splitpanes__splitter:hover::after) {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1);
		color: rgb(var(--color-primary-500));
		box-shadow:
			0 0 0 4px rgb(var(--color-primary-500) / 0.15),
			0 4px 12px rgb(var(--color-surface-900) / 0.2);
	}

	:global(.dark .modern-theme .splitpanes__splitter:hover::after) {
		color: rgb(var(--color-primary-400));
		box-shadow:
			0 0 0 4px rgb(var(--color-primary-400) / 0.2),
			0 4px 12px rgb(var(--color-surface-950) / 0.4);
	}

	:global(.modern-theme .splitpanes__splitter.splitpanes__splitter__active::after) {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1.2);
		color: rgb(var(--color-primary-600));
		box-shadow:
			0 0 0 6px rgb(var(--color-primary-600) / 0.2),
			0 6px 16px rgb(var(--color-surface-900) / 0.25);
	}

	:global(.dark .modern-theme .splitpanes__splitter.splitpanes__splitter__active::after) {
		color: rgb(var(--color-primary-300));
		box-shadow:
			0 0 0 6px rgb(var(--color-primary-300) / 0.25),
			0 6px 16px rgb(var(--color-surface-950) / 0.5);
	}

	:global(.modern-theme .splitpanes__splitter:focus-visible) {
		outline: 2px solid rgb(var(--color-primary-500));
		outline-offset: 2px;
		z-index: 30;
	}

	:global(.modern-theme .splitpanes__splitter:focus-visible::after) {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1);
	}

	:global(.modern-theme .splitpanes__splitter),
	:global(.modern-theme .splitpanes__splitter *) {
		cursor: col-resize !important;
	}

	:global(body.splitpanes-dragging),
	:global(body.splitpanes-dragging *) {
		cursor: col-resize !important;
		user-select: none !important;
	}

	:global(.modern-theme .splitpanes__splitter.splitpanes__splitter__active ~ .splitpanes__pane) {
		user-select: none !important;
		pointer-events: none !important;
	}
</style>
