<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { z } from 'zod';
	import { Clock,Wave } from 'svelte-loading-spinners';
	import IconChevronDown from '~icons/carbon/chevron-down';
	import IconView from '~icons/carbon/view';
	import IconViewOff from '~icons/carbon/view-off';
	import type { ModelConfig } from './types';

	interface Props {
		initialData?: Partial<ModelConfig>;
		onSave: (config: ModelConfig) => void;
		onCancel: () => void;
	}

	let { initialData, onSave, onCancel }: Props = $props();

	const modelSchema = z.object({
		provider: z.enum(['openai', 'anthropic', 'google', 'azure']),
		apiKey: z.string().min(1, '请输入 API Key'),
		model: z.string().min(1, '请选择模型'),
		tag: z.enum(['speed', 'capability', 'balanced']),
		weight: z.number().int().min(1).max(30)
	});

	const { form, enhance, errors, delayed } = superForm<ModelConfig>(
		{
			provider: initialData?.provider ?? 'openai',
			apiKey: initialData?.apiKey ?? '',
			model: initialData?.model ?? '',
			tag: initialData?.tag ?? 'balanced',
			weight: initialData?.weight ?? 1
		},
		{
			SPA: true,
			validators: false,
			dataType: 'json',
			onUpdate: async ({ form }) => {
				const result = modelSchema.safeParse(form.data);
				if (!result.success) {
					const fieldErrors = result.error.flatten().fieldErrors;
					Object.entries(fieldErrors).forEach(([key, value]) => {
						if (value && value.length > 0) {
							errors.update((prev) => ({
								...prev,
								[key]: value
							}));
						}
					});
					return;
				}

				await new Promise((resolve) => setTimeout(resolve, 1500));
				onSave(form.data as ModelConfig);
			}
		}
	);

	let availableModels = $state<string[]>([]);
	let loadingModels = $state(false);
	let modelsFetched = $state(false);
	let showApiKey = $state(false);
	let modelsDropdownOpen = $state(false);
	let modelInputRef = $state<HTMLInputElement | null>(null);
	let dropdownError = $state<string>('');
	let highlightedIndex = $state(-1);

	const fetchModels = async () => {
		if (modelsFetched) return;

		if (!$form.apiKey || $form.apiKey.length < 10) {
			dropdownError = '请先输入有效的 API Key (至少 10 个字符)';
			return;
		}

		dropdownError = '';
		loadingModels = true;
		try {
			await new Promise((resolve) => setTimeout(resolve, 800));
			const { provider } = $form;
			availableModels =
				provider === 'openai'
					? ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo']
					: provider === 'anthropic'
						? ['claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus']
						: provider === 'google'
							? ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash']
							: ['azure-gpt-4', 'azure-gpt-35-turbo'];
			modelsFetched = true;
		} finally {
			loadingModels = false;
		}
	};

	const handleProviderChange = () => {
		modelsFetched = false;
		availableModels = [];
		$form.model = '';
		dropdownError = '';
	};

	const toggleModelsDropdown = () => {
		if (!modelsDropdownOpen && !modelsFetched) {
			fetchModels();
		}
		modelsDropdownOpen = !modelsDropdownOpen;
		if (modelsDropdownOpen) {
			highlightedIndex = -1;
		}
	};

	const selectModel = (model: string) => {
		$form.model = model;
		modelsDropdownOpen = false;
		highlightedIndex = -1;
		dropdownError = '';
	};

	const handleModelInputKeydown = (e: KeyboardEvent) => {
		if (!modelsDropdownOpen) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
				e.preventDefault();
				if (!modelsFetched) {
					fetchModels();
				}
				modelsDropdownOpen = true;
				highlightedIndex = 0;
			}
			return;
		}

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				highlightedIndex = Math.min(highlightedIndex + 1, filteredModels.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				highlightedIndex = Math.max(highlightedIndex - 1, 0);
				break;
			case 'Enter':
				e.preventDefault();
				if (highlightedIndex >= 0 && highlightedIndex < filteredModels.length) {
					selectModel(filteredModels[highlightedIndex]);
				}
				break;
			case 'Escape':
				e.preventDefault();
				modelsDropdownOpen = false;
				highlightedIndex = -1;
				break;
		}
	};

	const handleModelInputBlur = (e: FocusEvent) => {
		// 使用 setTimeout 延迟关闭，以便点击下拉选项时能够触发
		setTimeout(() => {
			if (!modelInputRef?.contains(document.activeElement)) {
				modelsDropdownOpen = false;
				highlightedIndex = -1;
			}
		}, 150);
	};

	const filteredModels = $derived(
		availableModels.filter((m) => m.toLowerCase().includes($form.model.toLowerCase()))
	);

	const tagOptions = [
		{ value: 'speed', label: '速度优先' },
		{ value: 'capability', label: '能力优先' },
		{ value: 'balanced', label: '平衡' }
	] as const;

	const providerOptions = [
		{ value: 'openai', label: 'OpenAI' },
		{ value: 'anthropic', label: 'Anthropic' },
		{ value: 'google', label: 'Google AI' },
		{ value: 'azure', label: 'Azure OpenAI' }
	] as const;
</script>

<form method="POST" use:enhance class="space-y-5">
	<label class="label">
		<span class="text-surface-900 dark:text-surface-50">模型提供商</span>
		<select
			name="provider"
			bind:value={$form.provider}
			onchange={handleProviderChange}
			class="select"
		>
			{#each providerOptions as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		{#if $errors.provider}
			<span class="text-sm text-error-500">{String($errors.provider)}</span>
		{/if}
	</label>

	<label class="label">
		<span class="text-surface-900 dark:text-surface-50">API Key</span>
		<div class="relative">
			<input
				name="apiKey"
				type={showApiKey ? 'text' : 'password'}
				bind:value={$form.apiKey}
				class="input pr-10"
				placeholder="sk-..."
			/>
			<button
				type="button"
				onclick={() => (showApiKey = !showApiKey)}
				class="absolute top-1/2 right-3 -translate-y-1/2 text-surface-600 transition-colors hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100"
				aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
			>
				{#if showApiKey}
					<IconView class="h-5 w-5" />
				{:else}
					<IconViewOff class="h-5 w-5" />
				{/if}
			</button>
		</div>
		{#if $errors.apiKey}
			<span class="text-sm text-error-500">{String($errors.apiKey)}</span>
		{/if}
	</label>

	<label class="label">
		<span class="text-surface-900 dark:text-surface-50">模型</span>
		<div class="relative">
			<input
				bind:this={modelInputRef}
				name="model"
				type="text"
				bind:value={$form.model}
				placeholder="输入或选择模型"
				class="input pr-10"
				onkeydown={handleModelInputKeydown}
				onblur={handleModelInputBlur}
			/>
			<button
				type="button"
				onclick={toggleModelsDropdown}
				class="absolute top-1/2 right-3 -translate-y-1/2 text-surface-600 transition-transform duration-200 dark:text-surface-400"
				class:rotate-180={modelsDropdownOpen}
				aria-label="展开模型列表"
			>
				<IconChevronDown class="h-5 w-5" />
			</button>

			{#if modelsDropdownOpen}
				<div
					class="animate-in fade-in slide-in-from-top-2 absolute z-10 mt-1 max-h-60 w-full overflow-auto card bg-surface-50 shadow-lg duration-150 dark:bg-surface-800"
				>
					{#if dropdownError}
						<div class="p-4 text-center text-error-500">
							{dropdownError}
						</div>
					{:else if loadingModels}
						<div class="flex items-center justify-center p-8">
							<Wave size="40" color="#3b82f6" unit="px" duration="1s" />
						</div>
					{:else if filteredModels.length > 0}
						{#each filteredModels as model, index}
							<button
								type="button"
								onclick={() => selectModel(model)}
								class="w-full px-4 py-3 text-left transition-colors hover:bg-surface-200 dark:hover:bg-surface-700"
								class:bg-primary-500={$form.model === model}
								class:text-white={$form.model === model}
								class:bg-surface-200={highlightedIndex === index && $form.model !== model}
								class:dark:bg-surface-700={highlightedIndex === index && $form.model !== model}
							>
								{model}
							</button>
						{/each}
					{:else}
						<div class="p-4 text-center text-surface-500">
							{availableModels.length === 0 ? '暂无可用模型' : '无匹配结果'}
						</div>
					{/if}
				</div>
			{/if}
		</div>
		{#if $errors.model}
			<span class="text-sm text-error-500">{String($errors.model)}</span>
		{/if}
	</label>

	<label class="label">
		<span class="text-surface-900 dark:text-surface-50">模型标签</span>
		<select name="tag" bind:value={$form.tag} class="select">
			{#each tagOptions as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		{#if $errors.tag}
			<span class="text-sm text-error-500">{String($errors.tag)}</span>
		{/if}
	</label>

	<label class="label">
		<span class="text-surface-900 dark:text-surface-50">权重 (1 - 30)</span>
		<div class="flex items-center gap-3">
			<input
				type="range"
				name="weight"
				min="1"
				max="30"
				step="1"
				bind:value={$form.weight}
				class="range flex-1"
			/>
			<input
				type="number"
				bind:value={$form.weight}
				min="1"
				max="30"
				step="1"
				class="input w-20 text-center"
			/>
		</div>
		{#if $errors.weight}
			<span class="text-sm text-error-500">{String($errors.weight)}</span>
		{/if}
	</label>

	<footer class="flex justify-end gap-3 border-t border-surface-200 pt-4 dark:border-surface-700">
		<button type="button" onclick={onCancel} class="btn preset-outlined" disabled={$delayed}>
			取消
		</button>
		<button type="submit" class="btn min-w-[100px] preset-filled" disabled={$delayed}>
			{#if $delayed}
				<Clock size="20" color="#ffffff" unit="px" duration="1s" />
			{:else}
				保存
			{/if}
		</button>
	</footer>
</form>
