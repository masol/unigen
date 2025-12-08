<script lang="ts">
	import { fade } from 'svelte/transition';
	import IconDeviceFloppy from '~icons/tabler/device-floppy';
	import { onMount } from 'svelte';
	import { logger } from '$lib/utils/logger';
	import Codemirror from './Codemirror.svelte';
	import LeftCmds from './LeftCmds.svelte';
	import { onDestroy } from 'svelte';
	import { saveImpl } from './save';

	let {
		vid = '', // viewid可能包含了类型等内容．
		wid = '' // ref id是引用的word的id.
	}: {
		vid: string;
		wid?: string;
	} = $props();

	let dirty = $state(false);
	let lastmd: string = '';
	let isSaving = $state(false);
	let debounceTimer: NodeJS.Timeout | null = null;

	function onChange(markdown: string) {
		// 清除现有的定时器
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}

		if (!markdown) {
			// 通知终止保存．当用户菜单执行AI完善函数时被调用.
			dirty = false;
			lastmd = markdown;
			return;
		}

		// console.log('changed markdown:', markdown);
		dirty = true;
		lastmd = markdown;

		// 设置新的 debounce 定时器（10秒）
		debounceTimer = setTimeout(() => {
			doSave();
		}, 10000);
	}

	async function doSave() {
		if (!dirty) return;

		isSaving = true;

		try {
			await saveImpl(lastmd, wid ?? vid);

			dirty = false;

			// 清除定时器
			if (debounceTimer) {
				clearTimeout(debounceTimer);
				debounceTimer = null;
			}
		} catch (error) {
			console.error('Save failed:', error);
		} finally {
			isSaving = false;
		}
	}

	onMount(() => {
		if (!wid) {
			const parts = vid.split('::');
			if (parts.length !== 2) {
				logger.error('错误的ViewID格式:', vid);
				return;
			}
			wid = parts[1];
		}
	});

	onDestroy(() => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
	});
</script>

<div class="flex h-full flex-col bg-surface-50 dark:bg-surface-900">
	<!-- 顶部标题栏（sticky） -->
	<header
		class="sticky top-0 z-10 border-b border-surface-200 bg-white/95 backdrop-blur-sm transition-all duration-200 dark:border-surface-700 dark:bg-surface-800/95"
	>
		<div class="mx-auto flex h-11 max-w-full items-center justify-between px-6">
			<div class="flex-1">
				<div class="flex gap-2" transition:fade={{ duration: 200 }}>
					<LeftCmds></LeftCmds>
				</div>
			</div>

			{#if dirty}
				<div transition:fade={{ duration: 200 }}>
					<button
						onclick={doSave}
						disabled={isSaving}
						class="variant-filled-primary btn flex items-center gap-1.5 btn-sm shadow-sm hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
						aria-label="保存更改"
					>
						{#if isSaving}
							<div
								class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
							></div>
						{:else}
							<IconDeviceFloppy class="text-lg" />
						{/if}
						<span class="hidden sm:inline">{isSaving ? '保存中...' : '保存更改'}</span>
					</button>
				</div>
			{/if}

			<div class="flex flex-1 justify-end">
				<!-- <div transition:fade={{ duration: 200 }}>
					<button
						class="variant-filled-primary btn flex items-center gap-1.5 btn-sm shadow-sm hover:shadow-md"
						aria-label="保存更改"
					>
						<IconDeviceFloppy class="text-lg" />
						<span class="hidden sm:inline">保存更改</span>
					</button>
				</div> -->
			</div>
		</div>
	</header>

	<!-- 主内容区域 -->
	<div class="flex min-h-0 flex-1">
		<Codemirror {wid} {onChange}></Codemirror>
	</div>
</div>
