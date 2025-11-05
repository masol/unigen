<script lang="ts">
	import { writable } from 'svelte/store';
	import IconTrash from '~icons/lucide/trash-2';
	import IconEdit from '~icons/lucide/pen-line';
	import IconToggleLeft from '~icons/lucide/toggle-left';
	import IconToggleRight from '~icons/lucide/toggle-right';
	import IconSparkles from '~icons/lucide/sparkles';
	import IconPlus from '~icons/lucide/plus';
	import IconZap from '~icons/lucide/zap';
	import IconBrain from '~icons/lucide/brain';
	import IconScale from '~icons/lucide/scale';

	import ModelEditor from './Dialog.svelte';

	type ModelCapability = 'fast' | 'powerful' | 'balanced';

	interface ModelConfig {
		id: string;
		provider: string;
		modelName: string;
		weight: number;
		enabled: boolean;
		capability: ModelCapability;
		vendor?: string;
	}

	const capabilityConfig = {
		fast: {
			label: '速度优先',
			icon: IconZap,
			color: 'text-sky-600 dark:text-sky-400',
			bg: 'bg-sky-50 dark:bg-sky-950',
			border: 'border-sky-200 dark:border-sky-800',
			hoverShadow: 'hover:shadow-sky-200/50 dark:hover:shadow-sky-900/50'
		},
		powerful: {
			label: '能力优先',
			icon: IconBrain,
			color: 'text-purple-600 dark:text-purple-400',
			bg: 'bg-purple-50 dark:bg-purple-950',
			border: 'border-purple-200 dark:border-purple-800',
			hoverShadow: 'hover:shadow-purple-200/50 dark:hover:shadow-purple-900/50'
		},
		balanced: {
			label: '均衡型',
			icon: IconScale,
			color: 'text-emerald-600 dark:text-emerald-400',
			bg: 'bg-emerald-50 dark:bg-emerald-950',
			border: 'border-emerald-200 dark:border-emerald-800',
			hoverShadow: 'hover:shadow-emerald-200/50 dark:hover:shadow-emerald-900/50'
		}
	};

	const modelConfigs = writable<ModelConfig[]>([
		{
			id: '1',
			provider: 'OpenAI Official',
			modelName: 'gpt-4-turbo',
			weight: 5,
			enabled: true,
			capability: 'powerful',
			vendor: 'OpenAI'
		},
		{
			id: '2',
			provider: 'Azure OpenAI',
			modelName: 'gpt-4',
			weight: 3,
			enabled: true,
			capability: 'powerful',
			vendor: 'OpenAI'
		},
		{
			id: '3',
			provider: 'Anthropic Official',
			modelName: 'claude-3-haiku',
			weight: 8,
			enabled: false,
			capability: 'fast'
		},
		{
			id: '4',
			provider: 'Google Vertex AI',
			modelName: 'gemini-pro',
			weight: 4,
			enabled: true,
			capability: 'balanced'
		},
		{
			id: '5',
			provider: 'Cloudflare Workers AI',
			modelName: 'gpt-3.5-turbo',
			weight: 6,
			enabled: true,
			capability: 'fast',
			vendor: 'OpenAI'
		}
	]);

	function toggleEnabled(id: string) {
		modelConfigs.update((configs) =>
			configs.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
		);
	}

	function deleteModel(id: string) {
		modelConfigs.update((configs) => configs.filter((c) => c.id !== id));
	}

	function editModel(id: string) {
		modelId = id;
		editorOpen = true;
	}

	function createModel() {
		console.log('Create new model');
	}

	let modelId = $state('');
	let editorOpen = $state(false);
</script>

<div class="mx-auto w-full max-w-6xl space-y-4 p-6">
	<div class="mb-6 flex items-center justify-between">
		<div class="flex items-center gap-3">
			<IconSparkles class="h-7 w-7 text-primary-500"></IconSparkles>
			<h2 class="text-2xl font-semibold text-surface-900 dark:text-surface-50">模型配置</h2>
			<span class="text-sm text-surface-500 dark:text-surface-400">
				{$modelConfigs.length} 个模型
			</span>
		</div>
		<ModelEditor bind:open={editorOpen} {modelId}></ModelEditor>
		<!-- <button
			onclick={createModel}
			class="flex items-center gap-2 rounded-lg bg-primary-600 px-4
             py-2.5 font-medium
             text-white shadow-sm
             transition-all duration-200
             hover:bg-primary-700 hover:shadow-md"
		>
			<IconPlus class="h-4 w-4"></IconPlus>
			<span>新建模型</span>
		</button> -->
	</div>

	<div class="grid gap-3">
		{#each $modelConfigs as config (config.id)}
			{@const capConfig = capabilityConfig[config.capability]}
			<div
				class="group relative rounded-xl border border-surface-200
               bg-surface-50 shadow-sm transition-all duration-300
               hover:shadow-xl {capConfig.hoverShadow}
               dark:border-surface-700 dark:bg-surface-800
               hover:border-{config.capability === 'fast'
					? 'sky'
					: config.capability === 'powerful'
						? 'purple'
						: 'emerald'}-300
               dark:hover:border-{config.capability === 'fast'
					? 'sky'
					: config.capability === 'powerful'
						? 'purple'
						: 'emerald'}-600
               {!config.enabled ? 'opacity-60' : ''}"
			>
				<div
					class="absolute inset-0 rounded-xl bg-gradient-to-br opacity-0 transition-opacity duration-300
                    group-hover:opacity-100 {config.capability === 'fast'
						? 'from-sky-50/50 to-transparent dark:from-sky-950/20'
						: config.capability === 'powerful'
							? 'from-purple-50/50 to-transparent dark:from-purple-950/20'
							: 'from-emerald-50/50 to-transparent dark:from-emerald-950/20'}"
				></div>

				<div class="relative flex items-center gap-4 p-5">
					<div class="flex-shrink-0">
						<div
							class="flex h-12 w-12 items-center justify-center rounded-xl
                        {capConfig.bg} {capConfig.border} border
                        transition-transform duration-300 group-hover:scale-110"
						>
							<capConfig.icon></capConfig.icon>
						</div>
					</div>

					<div class="min-w-0 flex-1">
						<div class="mb-2 flex items-center gap-2">
							<span
								class="rounded-full bg-surface-200 px-2.5 py-0.5 text-xs
                           font-medium text-surface-700
                           dark:bg-surface-700 dark:text-surface-300"
							>
								{config.provider}
							</span>
							<span
								class="rounded-full px-2.5 py-0.5 text-xs font-medium
                           {capConfig.bg} {capConfig.color}"
							>
								{capConfig.label}
							</span>
							{#if config.vendor}
								<span
									class="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs
                             font-medium text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
								>
									{config.vendor}
								</span>
							{/if}
						</div>
						<div class="flex items-center gap-4">
							<h3
								class="truncate font-mono text-base font-semibold text-surface-900 dark:text-surface-50"
							>
								{config.modelName}
							</h3>
							<span class="h-1 w-1 rounded-full bg-surface-400"></span>
							<span
								class="flex items-center gap-1.5 text-sm text-surface-600 dark:text-surface-400"
							>
								权重:
								<span class="font-semibold text-surface-900 dark:text-surface-100">
									{config.weight}
								</span>
							</span>
						</div>
					</div>

					<div
						class="flex items-center gap-2 opacity-60 transition-opacity duration-200 group-hover:opacity-100"
					>
						<button
							onclick={() => toggleEnabled(config.id)}
							class="rounded-lg p-2.5 transition-all duration-200
                     {config.enabled
								? 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950'
								: 'text-surface-400 hover:bg-surface-100 dark:text-surface-600 dark:hover:bg-surface-700'}"
							title={config.enabled ? '禁用模型' : '启用模型'}
						>
							{#if config.enabled}
								<IconToggleRight class="h-5 w-5"></IconToggleRight>
							{:else}
								<IconToggleLeft class="h-5 w-5"></IconToggleLeft>
							{/if}
						</button>

						<button
							onclick={() => editModel(config.id)}
							class="rounded-lg p-2.5 text-surface-600 transition-all
                     duration-200 hover:bg-surface-100
                     hover:text-primary-600 dark:text-surface-400
                     dark:hover:bg-surface-700 dark:hover:text-primary-400"
							title="编辑配置"
						>
							<IconEdit class="h-5 w-5"></IconEdit>
						</button>

						<button
							onclick={() => deleteModel(config.id)}
							class="rounded-lg p-2.5 text-surface-600 transition-all
                     duration-200 hover:bg-error-50
                     hover:text-error-600 dark:text-surface-400
                     dark:hover:bg-error-950 dark:hover:text-error-400"
							title="删除模型"
						>
							<IconTrash class="h-5 w-5"></IconTrash>
						</button>
					</div>
				</div>
			</div>
		{/each}
	</div>

	{#if $modelConfigs.length === 0}
		<div class="py-16 text-center">
			<IconSparkles class="mx-auto mb-4 h-16 w-16 text-surface-300 dark:text-surface-700"
			></IconSparkles>
			<p class="text-surface-500 dark:text-surface-400">暂无模型配置</p>
		</div>
	{/if}
</div>
