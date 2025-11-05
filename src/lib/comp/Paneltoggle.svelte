<script lang="ts">
	import IconMenuLeftClose from '~icons/lucide/panel-left';
	import IconMenuLeft from '~icons/lucide/panel-left-close';
	import IconMenuRightClose from '~icons/lucide/panel-right';
	import IconMenuRight from '~icons/lucide/panel-right-close';
	import { leftPanel, rightPanel } from '$lib/stores/config/prj/panel.svelte';
	import { Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';
	import { localeStore, t } from '$lib/stores/config/ipc/i18n.svelte';

	// Props 定义
	let {
		right = false,
		size = 'md'
	}: {
		right?: boolean;
		size?: 'sm' | 'md' | 'lg';
	} = $props();

	// 根据 right 选择使用的 panel store
	const panel = $derived(right ? rightPanel : leftPanel);

	// 尺寸映射
	const sizeClasses = {
		sm: 'w-6 h-6 text-sm',
		md: 'w-8 h-8 text-base',
		lg: 'w-10 h-10 text-lg'
	};

	// 根据方向选择图标
	const OpenIcon = $derived(right ? IconMenuRight : IconMenuLeft);
	const CloseIcon = $derived(right ? IconMenuRightClose : IconMenuLeftClose);

	// 计算 ARIA 标签
	const computedAriaLabel = $derived(right ? 'Toggle right panel' : 'Toggle left panel');

	// 动态 Tooltip 内容
	const tooltipContent = $derived.by<string>(() => {
		const _ = localeStore.lang;
		void _;
		return panel.show
			? right
				? `${t('left_noisy_goat_lead')}${t('sleek_safe_wasp_urge')}` // 关闭  属性面板
				: `${t('left_noisy_goat_lead')}${t('only_these_jannes_jest')}` //      导航面板
			: right
				? `${t('round_lower_dachshund_bubble')}${t('sleek_safe_wasp_urge')}` // 打开
				: `${t('round_lower_dachshund_bubble')}${t('only_these_jannes_jest')}`
	});

	// 切换面板显示状态
	function togglePanel() {
		if (!panel.show && panel.size < 10) {
			panel.size = 20;
		}
		panel.show = !panel.show;
	}

	// 键盘事件处理
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			togglePanel();
		}
	}
</script>

<Tooltip>
	<Tooltip.Trigger class="inline-flex">
		<button
			type="button"
			onclick={togglePanel}
			onkeydown={handleKeyDown}
			aria-label={computedAriaLabel}
			aria-pressed={panel.show}
			class="
				{sizeClasses[size]}
				rounded-token
				text-surface-600-300-token
				hover:bg-surface-hover-token
				focus-visible:ring-offset-surface-50-900-token
				inline-flex
				items-center
				justify-center
				bg-transparent
				transition-colors
				duration-200
				hover:text-primary-500
				focus-visible:ring-2
				focus-visible:ring-primary-500
				focus-visible:ring-offset-2
				focus-visible:outline-none
				active:scale-95
				disabled:cursor-not-allowed
				disabled:opacity-50
			"
		>
			{#if panel.show}
				<OpenIcon class="h-full w-full" />
			{:else}
				<CloseIcon class="h-full w-full" />
			{/if}
		</button>
	</Tooltip.Trigger>
	<Portal>
		<Tooltip.Positioner class="z-20!">
			<Tooltip.Content class="max-w-md card bg-surface-100-900 p-2 text-sm shadow-xl">
				{tooltipContent}
				<Tooltip.Arrow
					style="--arrow-size: calc(var(--spacing) * 2); --arrow-background: var(--color-surface-100-900);"
				>
					<Tooltip.ArrowTip />
				</Tooltip.Arrow>
			</Tooltip.Content>
		</Tooltip.Positioner>
	</Portal>
</Tooltip>
