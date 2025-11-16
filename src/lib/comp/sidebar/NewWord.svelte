<script lang="ts">
	import { t } from '$lib/stores/config/ipc/i18n.svelte';
	import { navStore, UI, WORKFLOW } from '$lib/stores/navpanel/nav.svelte';
	import { entityStore } from '$lib/stores/project/entity.svelte';
	import { flowStore } from '$lib/stores/project/flow.svelte';
	import { functorStore } from '$lib/stores/project/functor.svelte';
	import { addWord2View, nextName } from '$lib/stores/project/word.svelte';
	import { logger } from '$lib/utils/logger';
	import {
		isWordType,
		TypeEntity,
		TypeFlow,
		TypeFunctor,
		type WordType
	} from '$lib/utils/vocab/type';
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import IconMdiPlus from '~icons/mdi/plus';

	let open = $state(false);
	let newCate = $state('');
	let nameInput: HTMLInputElement | undefined = $state();

	function getOpen() {
		return open;
	}

	function setOpen(newOpen: boolean) {
		if (newOpen) {
			reset();
			switch (navStore.current) {
				case TypeEntity:
					newCate = '概念';
					break;
				case TypeFunctor:
					newCate = '行为';
					break;
				case TypeFlow:
					newCate = '流程图';
					break;
				case WORKFLOW:
				case UI:
					newCate = '未知...';
			}
			$form.name = nextName(t(navStore.current));
		}
		open = newOpen;
	}

	async function onSave(name: string): Promise<boolean> {
		if (!isWordType(navStore.current)) {
			return false;
		}
		const wordType: WordType = navStore.current;
		let word;
		switch (navStore.current) {
			case TypeEntity:
				word = await entityStore.newItem(name);
				break;
			case TypeFunctor:
				word = await functorStore.newItem(name);
				break;
			case TypeFlow:
				word = await flowStore.newItem(name);
				break;
		}

		if (word) {
			addWord2View(word);
		}

		return !!word;
	}

	const schema = z.object({
		name: z.string().min(2, '名称至少两个字符').max(100, '名称不能超过100个字符')
	});

	const { form, errors, enhance, reset, validateForm } = superForm(
		{ name: '' },
		{
			SPA: true,
			validators: zod4Client(schema),
			onSubmit: async ({ cancel }) => {
				isSubmitting = true;
				try {
					const validInfo = await validateForm();
					if (!validInfo.valid) {
						errors.set(validInfo.errors);
						cancel();
						return;
					}
					if (onSave) {
						if (!(await onSave($form.name))) {
							logger.error('内部错误，创建新词汇出错！');
						}
					}
					setTimeout(() => {
						reset();
					}, 0);
					open = false;
				} finally {
					isSubmitting = false;
				}
			}
		}
	);

	let isSubmitting = $state(false);

	const handleCancel = () => {
		reset();
		open = false;
	};
</script>

<DialogPrimitive.Root bind:open={getOpen, setOpen}>
	<DialogPrimitive.Trigger
		type="button"
		aria-label="新建"
		class="text-surface-600-300-token hover:bg-surface-hover-token focus-visible:ring-offset-surface-50-900-token rounded-l-token flex h-9 w-9 flex-shrink-0 items-center justify-center bg-transparent transition-all duration-200 hover:scale-105 hover:text-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
	>
		{#if isSubmitting}
			<div
				class="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
			></div>
		{:else}
			<IconMdiPlus class="h-5 w-5" />
		{/if}
	</DialogPrimitive.Trigger>

	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay
			class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100"
		/>

		<DialogPrimitive.Content
			class="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 transition-all duration-200 data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100"
			escapeKeydownBehavior="ignore"
			onOpenAutoFocus={(e) => {
				e.preventDefault();
				nameInput?.focus();
			}}
		>
			<div class="space-y-6 card bg-surface-50 p-8 shadow-2xl dark:bg-surface-900">
				<header
					class="flex items-center justify-between border-b border-surface-200 pb-4 dark:border-surface-700"
				>
					<DialogPrimitive.Title class="text-2xl font-bold text-surface-900 dark:text-surface-50">
						新建{t(newCate)}
					</DialogPrimitive.Title>
					<DialogPrimitive.Close
						class="btn-icon text-2xl hover:preset-tonal"
						aria-label="关闭"
						onclick={handleCancel}
					>
						&times;
					</DialogPrimitive.Close>
				</header>

				<form method="POST" use:enhance class="space-y-6">
					<div class="space-y-2">
						<input
							bind:this={nameInput}
							id="name"
							name="name"
							type="text"
							bind:value={$form.name}
							class="mt-6 w-full rounded-lg border px-4 py-2.5 text-surface-900 transition-colors duration-200 placeholder:text-surface-400 focus:ring-2 focus:outline-none dark:text-surface-50 dark:placeholder:text-surface-500 {$errors.name
								? 'border-red-500 bg-red-50 hover:border-red-600 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500 dark:bg-red-950/20 dark:hover:border-red-400'
								: 'border-surface-300 bg-white hover:border-surface-400 focus:border-primary-500 focus:ring-primary-500/20 dark:border-surface-600 dark:bg-surface-800 dark:hover:border-surface-500'}"
							placeholder="请输入名称"
						/>
						<div class="min-h-[1.25rem]">
							{#if $errors.name}
								<span class="text-sm text-red-500">
									{Array.isArray($errors.name) ? $errors.name[0] : String($errors.name)}
								</span>
							{/if}
						</div>
					</div>

					<footer class="flex justify-end gap-3 pt-4">
						<button
							type="button"
							onclick={handleCancel}
							disabled={isSubmitting}
							class="rounded-lg bg-surface-200 px-4 py-2.5 font-medium text-surface-700 transition-all duration-200 hover:bg-surface-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-surface-700 dark:text-surface-200 dark:hover:bg-surface-600"
						>
							取消
						</button>
						<button
							type="submit"
							disabled={isSubmitting}
							class="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 font-medium text-white shadow-sm transition-all duration-200 hover:bg-primary-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if isSubmitting}
								<div
									class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
								></div>
							{/if}
							确定
						</button>
					</footer>
				</form>
			</div>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>
