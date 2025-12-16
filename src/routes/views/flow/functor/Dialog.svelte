<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { functorStore } from '$lib/stores/project/functor.svelte';
	import type { FunctorData } from '$lib/utils/vocab/type';
	import Editor from './Editor.svelte';
	import LoadingComp from '$lib/comp/feedback/Loading.svelte';
	import { getContext } from 'svelte';
	import { doComplete } from '../../functor/complete';
	import { cvtIO } from '../util';
	type ToastStore = ReturnType<typeof import('@skeletonlabs/skeleton-svelte').createToaster>;
	const toaster = getContext<ToastStore>('toaster');

	interface Props {
		fid?: string;
		open?: boolean;
		onSave: (data: FunctorData) => Promise<void>;
	}
	let { fid = '', open = $bindable(false), onSave }: Props = $props();

	const initialData = $derived(functorStore.find(fid));
	let isLoading = $state(false);

	const handleSave = async (word: FunctorData): Promise<void> => {
		if (!word.definition || word.definition.trim().length == 0) {
			toaster.error({
				description: '必须提供节点功能定义．'
			});
			return;
		}
		isLoading = true;

		try {
			const functor = await doComplete(word.definition,fid);
			await onSave(functor);
			// const ios = cvtIO(functor);

			// 开始同步节点．
			open = false;
		} finally {
			isLoading = false;
		}
	};

	function onCloseEvent(event: KeyboardEvent | PointerEvent) {
		if (isLoading) {
			event.preventDefault();
		}
	}

	function onOpenChange(opend: boolean) {
		isLoading = false;
	}
</script>

<DialogPrimitive.Root bind:open {onOpenChange}>
	<DialogPrimitive.Trigger
		class="hidden"
		onclick={() => {
			fid = '';
		}}
	></DialogPrimitive.Trigger>

	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay
			class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100"
		/>

		<DialogPrimitive.Content
			preventScroll={false}
			onEscapeKeydown={onCloseEvent}
			onInteractOutside={onCloseEvent}
			class="fixed top-1/2 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 transition-all duration-200 data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100"
		>
			<div class="relative space-y-6 card bg-surface-50 p-8 shadow-2xl dark:bg-surface-900">
				<header
					class="flex items-center justify-between border-b border-surface-200 pb-4 dark:border-surface-700"
				>
					<DialogPrimitive.Title class="text-2xl font-bold text-surface-900 dark:text-surface-50">
						{#if fid === ''}
							新建节点
						{:else}
							节点<span class="text-primary-400 dark:text-primary-300">{initialData?.word}</span>
						{/if}
					</DialogPrimitive.Title>
					<DialogPrimitive.Close
						class="btn-icon text-2xl hover:preset-tonal"
						aria-label="关闭"
						disabled={isLoading}
					>
						&times;
					</DialogPrimitive.Close>
				</header>

				{#if initialData}
					<Editor {initialData} onSave={handleSave} onCancel={() => (open = false)} />
				{/if}

				{#if isLoading}
					<!-- Loading 覆盖层 -->
					<div
						class="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm dark:bg-gray-900/80"
						role="alert"
						aria-live="polite"
						aria-busy="true"
					>
						<LoadingComp />
					</div>
				{/if}
			</div>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>
