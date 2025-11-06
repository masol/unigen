<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import { Clock, Wave } from 'svelte-loading-spinners';
	import IconChevronDown from '~icons/carbon/chevron-down';
	import IconView from '~icons/carbon/view';
	import IconViewOff from '~icons/carbon/view-off';
	import IconWeb from '~icons/mdi/web';
	import { listModels, ProviderNames } from '$lib/utils/llms/instance';
	import { t } from '$lib/stores/config/ipc/i18n.svelte';
	import type { LLMConfig, LLMTag } from '$lib/utils/llms/index.type';
	import { nav2Provider } from './utils';

	interface Props {
		initialData?: Partial<LLMConfig>;
		onSave: (config: LLMConfig) => Promise<void>;
		onCancel: () => void;
	}

	let { initialData, onSave, onCancel }: Props = $props();

	const llmTagSchema = z.enum(['fast', 'powerful', 'balanced']) satisfies z.ZodType<LLMTag>;

	const modelSchema = z.object({
		provider: z.string(),
		apiKey: z.string().min(3, '请输入 API Key'),
		name: z.string().min(3, '请选择模型'),
		tag: llmTagSchema,
		weight: z.number().int().min(1).max(30)
	});

	const { form, enhance, errors, delayed, validateForm } = superForm<LLMConfig>(
		{
			id: initialData?.id ?? crypto.randomUUID(),
			provider: initialData?.provider ?? 'qianwen',
			apiKey: initialData?.apiKey ?? '',
			name: initialData?.name ?? '',
			tag: initialData?.tag ?? 'balanced',
			weight: initialData?.weight ?? 1
		},
		{
			SPA: true,
			validators: zodClient(modelSchema as any),
			dataType: 'json',
			resetForm: false,
			// 改用 onSubmit
			async onSubmit({ formData, cancel }) {
				// 强制验证，不管是否修改过
				const validInfo = await validateForm();

				if (!validInfo.valid) {
					errors.set(validInfo.errors);
					cancel();
					console.log('表单验证失败');
					return;
				}

				// Schema 已经自动验证过了，这里只做 API 验证
				const config = $form as LLMConfig;
				// console.log('config=', config);

				try {
					const models = await listModels(config);
					// console.log('models=', models, $form.name);
					if (models.indexOf($form.name) < 0) {
						errors.set({
							name: ['无效的模型名称！']
						});
						cancel();
						return;
					}
					// 验证成功，调用 onSave
					await onSave(config);
				} catch (e) {
					// API 验证失败
					cancel(); // 取消提交
					errors.set({
						apiKey: ['请检查 API Key 是否有效，无法请求模型服务商。']
					});
					// console.log('API 验证错误:', e);
				}
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
			const llmcfg: LLMConfig = {
				id: crypto.randomUUID(),
				provider: $form.provider,
				apiKey: $form.apiKey
			} as LLMConfig;
			availableModels = await listModels(llmcfg);
			modelsFetched = availableModels.length > 0;
		} catch (e) {
			dropdownError = e instanceof Error ? e.message : String(e);
		} finally {
			loadingModels = false;
		}
	};

	const handleProviderChange = () => {
		modelsFetched = false;
		availableModels = [];
		$form.name = '';
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
		$form.name = model;
		modelsDropdownOpen = false;
		highlightedIndex = -1;
		dropdownError = '';
		errors.update((prev) => {
			const { name, ...rest } = prev;
			return rest;
		});
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
		setTimeout(() => {
			if (!modelInputRef?.contains(document.activeElement)) {
				modelsDropdownOpen = false;
				highlightedIndex = -1;
			}
		}, 150);
	};

	const filteredModels = $derived(
		availableModels.filter((m) => m.toLowerCase().includes($form.name.toLowerCase()))
	);

	const tagOptions = [
		{ value: 'fast', label: '速度优先' },
		{ value: 'powerful', label: '能力优先' },
		{ value: 'balanced', label: '平衡' }
	] as const;

	let isNaving = $state(false);
	async function nav2ApikeyWeb() {
		isNaving = true;
		try {
			await nav2Provider($form.provider);
		} finally {
			isNaving = false;
		}
	}
</script>

<form method="POST" use:enhance class="space-y-5">
	<!-- 模型提供商 -->
	<div class="form-field">
		<label class="label">
			<span class="text-surface-900 dark:text-surface-50">服务提供商</span>
			<select
				name="provider"
				bind:value={$form.provider}
				onchange={handleProviderChange}
				class="select"
			>
				{#each ProviderNames as pname}
					<option value={pname}>{t(pname)}</option>
				{/each}
			</select>
		</label>
		<div class="error-container">
			{#if $errors.provider}
				<span class="error-message">
					{Array.isArray($errors.provider) ? $errors.provider[0] : String($errors.provider)}
				</span>
			{/if}
		</div>
	</div>

	<!-- Api Key -->
	<div class="form-field">
		<label class="label">
			<span class="text-surface-900 dark:text-surface-50">API Key</span>
			<div class="input-group-divider input-group grid-cols-[auto_1fr]">
				<button
					type="button"
					onclick={nav2ApikeyWeb}
					disabled={isNaving}
					class="input-group-shim rounded-l px-2 text-surface-600 transition-colors hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-100"
					aria-label="获取 API Key"
					title="点击跳转到 API Key 获取页面"
				>
					<IconWeb class="h-5 w-5" />
				</button>

				<div class="relative w-full">
					<input
						name="apiKey"
						type={showApiKey ? 'text' : 'password'}
						bind:value={$form.apiKey}
						class="input pr-10"
						class:input-error={$errors.apiKey}
						placeholder="sk-..."
					/>
					<button
						type="button"
						onclick={(e) => {
							e.preventDefault();
							showApiKey = !showApiKey;
						}}
						class="absolute top-0 right-0 flex h-full items-center px-3 text-surface-600 transition-colors hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100"
						aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
						title={showApiKey ? '点击隐藏 API Key' : '点击显示 API Key'}
					>
						{#if showApiKey}
							<IconViewOff class="h-5 w-5" />
						{:else}
							<IconView class="h-5 w-5" />
						{/if}
					</button>
				</div>
			</div>
		</label>
		<div class="error-container">
			{#if $errors.apiKey}
				<span class="error-message">
					{Array.isArray($errors.apiKey) ? $errors.apiKey[0] : String($errors.apiKey)}
				</span>
			{/if}
		</div>
	</div>

	<!-- 模型 -->
	<div class="form-field">
		<label class="label">
			<span class="text-surface-900 dark:text-surface-50">模型</span>
			<div class="relative">
				<input
					bind:this={modelInputRef}
					name="name"
					type="text"
					bind:value={$form.name}
					placeholder="输入或选择模型"
					class="input pr-10"
					class:input-error={$errors.name}
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
									class:bg-primary-500={$form.name === model}
									class:text-white={$form.name === model}
									class:bg-surface-200={highlightedIndex === index && $form.name !== model}
									class:dark:bg-surface-700={highlightedIndex === index && $form.name !== model}
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
		</label>
		<div class="error-container">
			{#if $errors.name}
				<span class="error-message">
					{Array.isArray($errors.name) ? $errors.name[0] : String($errors.name)}
				</span>
			{/if}
		</div>
	</div>

	<!-- 模型标签 -->
	<div class="form-field">
		<label class="label">
			<span class="text-surface-900 dark:text-surface-50">模型能力</span>
			<select name="tag" bind:value={$form.tag} class="select">
				{#each tagOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</label>
		<div class="error-container">
			{#if $errors.tag}
				<span class="error-message">
					{Array.isArray($errors.tag) ? $errors.tag[0] : String($errors.tag)}
				</span>
			{/if}
		</div>
	</div>

	<!-- 权重 -->
	<div class="form-field">
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
		</label>
		<div class="error-container">
			{#if $errors.weight}
				<span class="error-message">
					{Array.isArray($errors.weight) ? $errors.weight[0] : String($errors.weight)}
				</span>
			{/if}
		</div>
	</div>

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

<style>
	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.error-container {
		min-height: 1.5rem;
	}

	.error-message {
		display: block;
		font-size: 0.875rem;
		line-height: 1.25rem;
		color: rgb(239 68 68);
		animation: errorFadeIn 0.2s ease-in-out;
	}

	@keyframes errorFadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	:global(.dark) .error-message {
		color: rgb(248 113 113);
	}
</style>
