<script lang="ts">
	import { fade } from 'svelte/transition';
	import IconPlus from '~icons/lucide/plus';
	import Rete from './Rete.svelte'

	let scrollY = $state(0);

	function handleScroll(e: Event) {
		scrollY = (e.target as HTMLElement).scrollTop;
	}
</script>

<div class="flex h-full flex-col bg-surface-50 dark:bg-surface-900">
	<!-- 顶部标题栏（sticky） -->
	<header
		class="sticky top-0 z-10 border-b border-surface-200 bg-white/95 backdrop-blur-sm transition-all duration-200 dark:border-surface-700 dark:bg-surface-800/95"
		class:shadow-lg={scrollY > 10}
		class:border-surface-300={scrollY > 10}
	>
		<div class="mx-auto flex h-11 max-w-full items-center justify-between px-6">
			<div class="flex-1">
				<div class="flex gap-2" transition:fade={{ duration: 200 }}>
					<button
						class="variant-ghost-surface hover:variant-soft-surface btn flex items-center gap-1.5 btn-sm"
						aria-label="取消更改"
					>
						<IconPlus class="text-lg" />
						<span class="hidden sm:inline">取消</span>
					</button>
				</div>
			</div>

			<h1 class="text-xl font-semibold text-surface-900 dark:text-surface-50">设置</h1>

			<div class="flex flex-1 justify-end">
				<div transition:fade={{ duration: 200 }}>
					<button
						class="variant-filled-primary btn flex items-center gap-1.5 btn-sm shadow-sm hover:shadow-md"
						aria-label="保存更改"
					>
						<IconPlus class="text-lg" />
						<span class="hidden sm:inline">保存更改</span>
					</button>
				</div>
			</div>
		</div>
	</header>

	<!-- 主内容区域 -->
	<div class="flex min-h-0 flex-1">
		<!-- 左侧树形导航 -->
		<Rete></Rete>
	</div>
</div>
