<script lang="ts">
	import IconTrash from '~icons/lucide/trash-2';
	import IconEdit from '~icons/lucide/pen-line';
	import IconToggleLeft from '~icons/lucide/toggle-left';
	import IconToggleRight from '~icons/lucide/toggle-right';
	import IconSparkles from '~icons/lucide/sparkles';
	import IconBrain from '~icons/lucide/brain';
	import IconImage from '~icons/lucide/image';
	import IconVideo from '~icons/lucide/video';
	import IconMic from '~icons/lucide/mic';
	import IconMusic from '~icons/lucide/music';
	import IconHelpCircle from '~icons/lucide/help-circle';
	import ModelEditor from './Dialog.svelte';
	import { llmStore } from '$lib/stores/config/ipc/llms.svelte';
	import { type LLMConfig } from '$lib/utils/llms/index.type';
	import { localeStore, t } from '$lib/stores/config/ipc/i18n.svelte';

	type CapabilityType = 'text' | 'image' | 'video' | 'speech' | 'music' | 'unknown';

	interface CapabilityConfig {
		icon: any;
		color: string;
		bg: string;
		border: string;
		hoverShadow: string;
	}

	const capabilityConfig: Record<CapabilityType, CapabilityConfig> = {
		text: {
			icon: IconBrain,
			color: 'text-blue-600 dark:text-blue-400',
			bg: 'bg-blue-50 dark:bg-blue-950',
			border: 'border-blue-200 dark:border-blue-800',
			hoverShadow: 'hover:shadow-blue-200/50 dark:hover:shadow-blue-900/50'
		},
		image: {
			icon: IconImage,
			color: 'text-purple-600 dark:text-purple-400',
			bg: 'bg-purple-50 dark:bg-purple-950',
			border: 'border-purple-200 dark:border-purple-800',
			hoverShadow: 'hover:shadow-purple-200/50 dark:hover:shadow-purple-900/50'
		},
		video: {
			icon: IconVideo,
			color: 'text-pink-600 dark:text-pink-400',
			bg: 'bg-pink-50 dark:bg-pink-950',
			border: 'border-pink-200 dark:border-pink-800',
			hoverShadow: 'hover:shadow-pink-200/50 dark:hover:shadow-pink-900/50'
		},
		speech: {
			icon: IconMic,
			color: 'text-emerald-600 dark:text-emerald-400',
			bg: 'bg-emerald-50 dark:bg-emerald-950',
			border: 'border-emerald-200 dark:border-emerald-800',
			hoverShadow: 'hover:shadow-emerald-200/50 dark:hover:shadow-emerald-900/50'
		},
		music: {
			icon: IconMusic,
			color: 'text-amber-600 dark:text-amber-400',
			bg: 'bg-amber-50 dark:bg-amber-950',
			border: 'border-amber-200 dark:border-amber-800',
			hoverShadow: 'hover:shadow-amber-200/50 dark:hover:shadow-amber-900/50'
		},
		unknown: {
			icon: IconHelpCircle,
			color: 'text-surface-600 dark:text-surface-400',
			bg: 'bg-surface-50 dark:bg-surface-900',
			border: 'border-surface-200 dark:border-surface-700',
			hoverShadow: 'hover:shadow-surface-200/50 dark:hover:shadow-surface-900/50'
		}
	};

	function getCapabilityType(tag: string): CapabilityType {
		if (tag === 'fast' || tag === 'powerful' || tag === 'balanced') {
			return 'text';
		}
		if (tag === 'image' || tag === 'image_modify') return 'image';
		if (tag === 'video' || tag === 'video_modify') return 'video';
		if (tag === 'speech' || tag === 'speech_modify') return 'speech';
		if (tag === 'music' || tag === 'music_modify') return 'music';
		return 'unknown';
	}

	const modelConfigs = $derived<LLMConfig[]>(llmStore.llms);

	function toggleEnabled(id: string) {
		const llm = llmStore.find(id);
		if (llm) {
			llm.enabled = !llm.enabled;
			llmStore.upsert(llm);
		}
	}

	function deleteModel(id: string) {
		llmStore.removeById(id);
	}

	function editModel(id: string) {
		modelId = id;
		editorOpen = true;
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
				{modelConfigs.length} 个模型
			</span>
		</div>
		<ModelEditor bind:open={editorOpen} {modelId}></ModelEditor>
	</div>

	<div class="grid gap-3">
		{#each modelConfigs as config (config.id)}
			{@const capType = getCapabilityType(config.tag)}
			{@const capConfig = capabilityConfig[capType]}
			<div
				class="group relative rounded-xl border border-surface-200
               bg-surface-50 shadow-sm transition-all duration-300
               hover:shadow-xl {capConfig.hoverShadow}
               dark:border-surface-700 dark:bg-surface-800
               {!config.enabled ? 'opacity-60' : ''}"
			>
				<div
					class="absolute inset-0 rounded-xl bg-gradient-to-br opacity-0 transition-opacity duration-300
                    group-hover:opacity-100"
					style="background: linear-gradient(to bottom right, {capType === 'text'
						? 'rgb(59 130 246 / 0.05)'
						: capType === 'image'
							? 'rgb(168 85 247 / 0.05)'
							: capType === 'video'
								? 'rgb(236 72 153 / 0.05)'
								: capType === 'speech'
									? 'rgb(16 185 129 / 0.05)'
									: capType === 'music'
										? 'rgb(245 158 11 / 0.05)'
										: 'rgb(107 114 128 / 0.05)'}, transparent)"
				></div>

				<div class="relative flex items-center gap-4 p-5">
					<div class="flex-shrink-0">
						<div
							class="flex h-12 w-12 items-center justify-center rounded-xl
                        {capConfig.bg} {capConfig.border} border
                        transition-transform duration-300 group-hover:scale-110"
						>
							<capConfig.icon class="h-6 w-6 {capConfig.color}" />
						</div>
					</div>

					<div class="min-w-0 flex-1">
						<div class="mb-2 flex flex-wrap items-center gap-2">
							<span
								class="rounded-full bg-surface-200 px-2.5 py-0.5 text-xs
                           font-medium text-surface-700
                           dark:bg-surface-700 dark:text-surface-300"
							>
								{#key localeStore.lang}
									{t(config.provider)}
								{/key}
							</span>

							<span
								class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium
                           {capConfig.bg} {capConfig.color}"
							>
								{#key localeStore.lang}
									{t(`tag_${config.tag}`)}
								{/key}
							</span>
						</div>
						<div class="flex items-center gap-4">
							<h3
								class="truncate font-mono text-base font-semibold text-surface-900 dark:text-surface-50"
							>
								{config.name}
							</h3>
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

	{#if modelConfigs.length === 0}
		<div class="py-16 text-center">
			<IconSparkles class="mx-auto mb-4 h-16 w-16 text-surface-300 dark:text-surface-700"
			></IconSparkles>
			<p class="text-surface-500 dark:text-surface-400">暂无模型配置</p>
		</div>
	{/if}
</div>
