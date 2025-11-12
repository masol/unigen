<script lang="ts">
	import { loadingStore } from '$lib/stores/loading.svelte';
	import { Motion } from 'svelte-motion';
	import Loading from './Loading.svelte';

	let text = $derived(loadingStore.text);
	let showBackdrop = $derived(loadingStore.showBackdrop);
	let effect = $derived(loadingStore.effect);

	// 阻止键盘事件
	function preventKeyboard(event: KeyboardEvent) {
		if (showBackdrop) {
			event.preventDefault();
			event.stopPropagation();
		}
	}
</script>

<svelte:window
	on:keydown={preventKeyboard}
	on:keyup={preventKeyboard}
	on:keypress={preventKeyboard}
/>

{#if showBackdrop}
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
			<Loading {text} {effect} />
		</div>
	</Motion>
{/if}

<style>
	/* 确保遮罩层完全阻止所有交互 */
	div[role='dialog'] {
		touch-action: none;
	}
</style>
