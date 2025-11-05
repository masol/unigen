<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import IconPlus from '~icons/lucide/plus';
	import ModelEditor from './Editor.svelte';
	import type { ModelConfig } from './types';

	interface Props {
		modelId?: string;
		open?: boolean;
	}
	let { modelId = '', open = $bindable(false) }: Props = $props();

	const handleSave = (config: ModelConfig) => {
		console.log('保存模型配置:', config);
		open = false;
	};
</script>

<DialogPrimitive.Root bind:open>
	<DialogPrimitive.Trigger
		class="flex items-center gap-2 rounded-lg bg-primary-600 px-4
             py-2.5 font-medium
             text-white shadow-sm
             transition-all duration-200
             hover:bg-primary-700 hover:shadow-md"
		onclick={() => {
			modelId = '';
		}}
	>
		<IconPlus class="h-4 w-4"></IconPlus>
		新建
	</DialogPrimitive.Trigger>

	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay
			class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100"
		/>

		<DialogPrimitive.Content
			class="fixed top-1/2 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 transition-all duration-200 data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100"
		>
			<div class="space-y-6 card bg-surface-50 p-8 shadow-2xl dark:bg-surface-900">
				<header
					class="flex items-center justify-between border-b border-surface-200 pb-4 dark:border-surface-700"
				>
					<DialogPrimitive.Title class="text-2xl font-bold text-surface-900 dark:text-surface-50">
						{#if modelId === ''}
							新建模型
						{:else}
							编辑模型
						{/if}
					</DialogPrimitive.Title>
					<DialogPrimitive.Close class="btn-icon text-2xl hover:preset-tonal" aria-label="关闭">
						&times;
					</DialogPrimitive.Close>
				</header>

				<ModelEditor onSave={handleSave} onCancel={() => (open = false)} />
			</div>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>
