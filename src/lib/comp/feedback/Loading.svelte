<script lang="ts">
	import { loadingStore } from '$lib/stores/loading.svelte';
	import { onMount } from 'svelte';
	import {
		Jumper,
		BarLoader,
		Chasing,
		Circle,
		Circle2,
		Circle3,
		DoubleBounce,
		Firework,
		Pulse
	} from 'svelte-loading-spinners';
	import { Motion } from 'svelte-motion';

	let text = $derived(loadingStore.text);
	let currentEffect = $state('');

	const effects = [
		'jumper',
		'barloader',
		'chasing',
		'circle',
		'circle2',
		'circle3',
		'doublebounce',
		'firework',
		'pulse'
	];

	onMount(() => {
		if (!loadingStore.effect || loadingStore.effect === 'random') {
			currentEffect = effects[Math.floor(Math.random() * effects.length)];
		} else {
			currentEffect = loadingStore.effect;
		}
	});
	// 将文字拆分成字符数组
	let chars = $derived(text ? text.split('') : []);
</script>

<!-- Backdrop with fade-in animation and blur effect -->
<Motion
	initial={{ opacity: 0 }}
	animate={{ opacity: 1 }}
	transition={{ duration: 0.3, ease: 'easeOut' }}
	let:motion
>
	<div
		use:motion
		role="dialog"
		aria-modal="true"
		aria-live="polite"
		aria-busy="true"
		aria-label={text || '加载中'}
		class="fixed inset-0 z-[999] flex items-center justify-center backdrop-blur-md"
		style="
				background: linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.75) 100%);
				pointer-events: all;
				user-select: none;
				-webkit-user-select: none;
				touch-action: none;
			"
	>
		<!-- Loading Container with scale-in animation -->
		<Motion
			initial={{ scale: 0.8, opacity: 0 }}
			animate={{ scale: 1, opacity: 1 }}
			transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
			let:motion
		>
			<div use:motion class="flex flex-col items-center gap-6">
				<!-- Animation Container -->
				<div class="relative" aria-hidden="true">
					{#if currentEffect === 'jumper'}
						<Jumper size="128" />
					{:else if currentEffect === 'barloader'}
						<BarLoader size="128" />
					{:else if currentEffect === 'chasing'}
						<Chasing size="128" />
					{:else if currentEffect === 'circle'}
						<Circle size="128" />
					{:else if currentEffect === 'circle2'}
						<Circle2 size="128" />
					{:else if currentEffect === 'circle3'}
						<Circle3 size="128" />
					{:else if currentEffect === 'doublebounce'}
						<DoubleBounce size="128" />
					{:else if currentEffect === 'firework'}
						<Firework size="128" />
					{:else if currentEffect === 'pulse'}
						<Pulse size="128" />
					{/if}
				</div>

				<!-- Loading Text -->
				{#if text}
					<div class="flex items-center gap-1">
						<!-- 文字容器 - 字符逐个淡入淡出 -->
						<div class="flex overflow-hidden">
							{#each chars as char, i}
								<Motion
									initial={{ y: '100%', opacity: 0 }}
									animate={{
										y: ['100%', '0%', '0%', '-100%'],
										opacity: [0, 1, 1, 0]
									}}
									transition={{
										duration: 3,
										delay: i * 0.05,
										repeat: Infinity,
										ease: 'easeInOut',
										times: [0, 0.2, 0.8, 1]
									}}
									let:motion
								>
									<span
										use:motion
										class="inline-block bg-gradient-to-r from-primary-400 via-secondary-400 to-tertiary-400 bg-clip-text text-lg font-semibold text-transparent dark:from-primary-300 dark:via-secondary-300 dark:to-tertiary-300"
									>
										{char === ' ' ? '\u00A0' : char}
									</span>
								</Motion>
							{/each}
						</div>

						<!-- 省略号容器 - 依次淡入淡出 -->
						<div class="flex gap-0.5">
							{#each [0, 1, 2] as dotIndex}
								<Motion
									initial={{ opacity: 0, scale: 0.5 }}
									animate={{
										opacity: [0, 1, 0],
										scale: [0.5, 1, 0.5]
									}}
									transition={{
										duration: 1.2,
										delay: dotIndex * 0.2,
										repeat: Infinity,
										ease: 'easeInOut'
									}}
									let:motion
								>
									<span
										use:motion
										class="text-lg font-semibold {dotIndex === 0
											? 'text-primary-400 dark:text-primary-300'
											: dotIndex === 1
												? 'text-secondary-400 dark:text-secondary-300'
												: 'text-tertiary-400 dark:text-tertiary-300'}"
									>
										.
									</span>
								</Motion>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</Motion>
	</div>
</Motion>

<style>
	/* 确保遮罩层完全阻止所有交互 */
	div[role='dialog'] {
		touch-action: none;
	}
</style>
