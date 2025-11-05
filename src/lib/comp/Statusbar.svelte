<script lang="ts">
	import { slide } from 'svelte/transition';
	import { Motion } from 'svelte-motion';
	// import IconChevronLeft from '~icons/lucide/chevron-left';
	import IconChevronRight from '~icons/lucide/chevron-right';
	import { Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';
	import IconUser from '~icons/carbon/user';

	import Lightswitch from './Lightswitch.svelte';
	import Repository from './Settings/Repo/Repository.svelte';
	import { localeStore, t } from '$lib/stores/config/ipc/i18n.svelte';

	// State
	let isExpanded = $state(true);

	// Toggle expansion
	function toggleExpanded() {
		isExpanded = !isExpanded;
	}

	// Handle keyboard interaction
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			toggleExpanded();
		}
	}

	// Motion variants
	const buttonHover = {
		scale: 1.05,
		transition: { duration: 0.2, ease: 'easeOut' }
	};

	const buttonTap = {
		scale: 0.95,
		transition: { duration: 0.1, ease: 'easeIn' }
	};
</script>

<div class="fixed right-0 bottom-0" style="z-index: 40;" role="region" aria-label="Status bar">
	<!-- Backdrop上方遮挡区域 -->
	<div class="absolute right-0 bottom-full w-full" style="height: 12px;" aria-hidden="true"></div>

	<!-- 状态条主体 -->
	<div
		class="bg-surface-100-800 dark:bg-surface-800-100 rounded-l-container-token ring-surface-300-600 dark:ring-surface-600-300 flex h-10 items-center overflow-hidden shadow-lg ring-1"
	>
		<!-- Toggle button - with tooltip -->
		<Tooltip openDelay={300} closeDelay={0} positioning={{ placement: 'top', gutter: 8 }}>
			<Motion
				let:motion
				whileHover={buttonHover}
				whileTap={buttonTap}
				transition={{ duration: 0.2 }}
			>
				<Tooltip.Trigger>
					<button
						use:motion
						onclick={toggleExpanded}
						onkeydown={handleKeydown}
						tabindex="-1"
						class="hover:bg-surface-200-700 dark:hover:bg-surface-700-200 flex h-full w-10 shrink-0 items-center justify-center transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:outline-none"
						aria-expanded={isExpanded}
						aria-label={isExpanded ? '收起状态栏' : '展开状态栏'}
						type="button"
					>
						<Motion
							let:motion
							animate={isExpanded ? { rotate: 0 } : { rotate: 180 }}
							transition={{ duration: 0.3, ease: 'easeInOut' }}
						>
							<span use:motion class="inline-flex">
								<IconChevronRight
									class="text-surface-700-200 dark:text-surface-200-700 h-5 w-5"
									aria-hidden="true"
								/>
							</span>
						</Motion>
					</button>
				</Tooltip.Trigger>
			</Motion>

			<Portal>
				<Tooltip.Positioner style="z-index: 50;">
					<Tooltip.Content
						class="rounded-token bg-surface-900-100 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-surface-100-900 shadow-xl"
					>
						{isExpanded ? '收起状态栏' : '展开状态栏'}
					</Tooltip.Content>
				</Tooltip.Positioner>
			</Portal>
		</Tooltip>

		<!-- Expanded content -->
		{#if isExpanded}
			<div
				transition:slide={{ axis: 'x', duration: 200 }}
				class="flex h-full items-center gap-4 px-4 whitespace-nowrap"
			>
				<span class="vr border-l-2"></span>

				<!-- Lightswitch with tooltip -->
				<Tooltip openDelay={300} closeDelay={0} positioning={{ placement: 'top', gutter: 8 }}>
					<Motion let:motion whileHover={buttonHover} whileTap={buttonTap}>
						<Tooltip.Trigger>
							<div use:motion class="inline-flex">
								<Lightswitch />
							</div>
						</Tooltip.Trigger>
					</Motion>

					<Portal>
						<Tooltip.Positioner style="z-index: 50;">
							<Tooltip.Content
								class="rounded-token bg-surface-900-100 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-surface-100-900 shadow-xl"
							>
								明暗模式
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>

				<span class="vr"></span>

				<!-- Repository with tooltip -->
				<Tooltip openDelay={300} closeDelay={0} positioning={{ placement: 'top', gutter: 8 }}>
					<Motion let:motion whileHover={buttonHover} whileTap={buttonTap}>
						<Tooltip.Trigger>
							<div
								use:motion
								class="text-surface-700-200 dark:text-surface-200-700 inline-flex items-center gap-2"
							>
								<Repository />
							</div>
						</Tooltip.Trigger>
					</Motion>

					<Portal>
						<Tooltip.Positioner style="z-index: 50;">
							<Tooltip.Content
								class="rounded-token bg-surface-900-100 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-surface-100-900 shadow-xl"
							>
								项目管理
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>

				<span class="vr"></span>

				<!-- User button with enhanced hover -->
				<Tooltip openDelay={300} closeDelay={0} positioning={{ placement: 'top', gutter: 8 }}>
					<Motion let:motion whileHover={buttonHover} whileTap={buttonTap}>
						<Tooltip.Trigger>
							<button
								use:motion
								type="button"
								disabled={true}
								class="rounded-token flex h-8 w-8 items-center justify-center text-surface-700-300 transition-colors duration-200 hover:bg-surface-200-800 hover:text-surface-900-100 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100-900 focus-visible:outline-none active:bg-surface-300-700"
								onclick={() => {}}
								aria-label="用户"
							>
								<Motion
									let:motion
									whileHover={{ scale: 1.1, rotate: 5 }}
									transition={{ duration: 0.2 }}
								>
									<span use:motion class="inline-flex">
										<IconUser class="h-5 w-5" aria-hidden="true" />
									</span>
								</Motion>
							</button>
						</Tooltip.Trigger>
					</Motion>

					<Portal>
						<Tooltip.Positioner style="z-index: 50;">
							<Tooltip.Content
								class="rounded-token bg-surface-900-100 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-surface-100-900 shadow-xl"
							>
								{#key localeStore.lang}
									{t('free_pretty_butterfly_gleam')}
								{/key}
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>
		{/if}
	</div>

	<!-- Backdrop下方遮挡区域 -->
	<div class="absolute top-full right-0 w-full" style="height: 12px;" aria-hidden="true"></div>
</div>
