<script lang="ts">
	import '../app.css';
	import { init } from '$lib/index.js';
	import { onMount, setContext } from 'svelte';
	import Titlebar from '$lib/comp/Titlebar.svelte';
	import Sidebar from '$lib/comp/Sidebar.svelte';
	import Statusbar from '$lib/comp/Statusbar.svelte';
	import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';
	import Backdrop from '$lib/comp/feedback/Backdrop.svelte';
	import { loadingStore } from '$lib/stores/loading.svelte';
	import { message } from '@tauri-apps/plugin-dialog';

	const toaster = createToaster({
		placement: 'top'
	});
	setContext('toaster', toaster);

	let { children } = $props();

	let inited = $state(false);
	onMount(async () => {
		loadingStore.show('Initializing, please wait');
		window.addEventListener('contextmenu', (e) => {
			e.preventDefault();
		});
		try {
			await init();
		} catch (e) {
			await message(e instanceof Error ? e.message : String(e), {
				title: 'Initialize Failed',
				kind: 'error'
			});
		}
		inited = true;
		loadingStore.hide();
	});
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden">
	<Titlebar />
	<Statusbar></Statusbar>
	<div class="flex min-h-0 flex-1 overflow-hidden">
		<aside class="relative z-10 flex-shrink-0">
			<Sidebar />
		</aside>
		{#if inited && children}
			{@render children()}
		{/if}
	</div>

	<Toast.Group {toaster}>
		{#snippet children(toast)}
			<Toast {toast}>
				<Toast.Message>
					<Toast.Title>{toast.title}</Toast.Title>
					<Toast.Description>{toast.description}</Toast.Description>
				</Toast.Message>
				{#if toast.action}
					<Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
				{/if}
				{#if toast.closable !== false}
					<Toast.CloseTrigger />
				{/if}
			</Toast>
		{/snippet}
	</Toast.Group>
</div>
<Backdrop></Backdrop>
