<script lang="ts">
	import IconPlay from '~icons/mdi/play';
	import IconHammer from '~icons/mdi/hammer';
	import type { ReteAdapter } from './adapter';
	import { getContext } from 'svelte';
	type ToastStore = ReturnType<typeof import('@skeletonlabs/skeleton-svelte').createToaster>;
	const toaster = getContext<ToastStore>('toaster');

	interface Props {
		getAdapter: () => ReteAdapter;
	}

	let { getAdapter }: Props = $props();

	type TaskStatus = 'idle' | 'running';

	let runStatus = $state<TaskStatus>('idle');
	let compileStatus = $state<TaskStatus>('idle');

	function reporter(type: string, msg: string) {
		console.log('on reporter:', type, msg);
		switch (type) {
			case 'error':
				toaster.error({
					description: msg
				});
				break;
			case 'warn':
				toaster.warning({
					description: msg
				});
				break;
			case 'info':
				toaster.info({
					description: msg
				});
				break;
		}
	}

	async function handleRun() {
		runStatus = 'running';
		const adapter = getAdapter();
		console.log('adapter=', adapter);
		await adapter.run(reporter);
		runStatus = 'idle';
	}

	async function handleCompile() {
		compileStatus = 'running';
		await new Promise((resolve) => setTimeout(resolve, 4000));
		compileStatus = 'idle';
	}
</script>

<div class="flex items-center gap-2">
	<button
		onclick={handleRun}
		disabled={runStatus === 'running'}
		class="variant-filled-primary disabled:cursor-not-wait btn flex min-w-[100px] items-center gap-2
      transition-all disabled:opacity-70
      {runStatus === 'running' ? 'animate-pulse' : ''}"
	>
		<IconPlay class="h-4 w-4 {runStatus === 'running' ? 'animate-spin' : ''}" />
		<span class="text-sm font-medium">
			{runStatus === 'running' ? '运行中...' : '运行'}
		</span>
	</button>

	<button
		onclick={handleCompile}
		disabled={compileStatus === 'running'}
		class="variant-filled-secondary disabled:cursor-not-wait btn flex min-w-[100px] items-center gap-2
      transition-all disabled:opacity-70
      {compileStatus === 'running' ? 'animate-pulse' : ''}"
	>
		<IconHammer class="h-4 w-4 {compileStatus === 'running' ? 'animate-bounce' : ''}" />
		<span class="text-sm font-medium">
			{compileStatus === 'running' ? '编译中...' : '编译'}
		</span>
	</button>
</div>
