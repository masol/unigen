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
	import IconCheck from '~icons/lucide/check';
	import ModelEditor from './Dialog.svelte';
	import { llmStore } from '$lib/stores/config/ipc/llms.svelte';
	import { type LLMConfig } from '$lib/utils/llms/index.type';
	import { t } from '$lib/stores/config/ipc/i18n.svelte';

	type CapabilityType = 'text' | 'image' | 'video' | 'speech' | 'music' | 'unknown';

	interface CapabilityConfig {
		icon: any;
		iconClass: string;
	}

	const capabilityConfig: Record<CapabilityType, CapabilityConfig> = {
		text: {
			icon: IconBrain,
			iconClass:
				'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
		},
		image: {
			icon: IconImage,
			iconClass:
				'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800'
		},
		video: {
			icon: IconVideo,
			iconClass:
				'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950 border-pink-200 dark:border-pink-800'
		},
		speech: {
			icon: IconMic,
			iconClass:
				'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800'
		},
		music: {
			icon: IconMusic,
			iconClass:
				'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'
		},
		unknown: {
			icon: IconHelpCircle,
			iconClass:
				'text-surface-600 dark:text-surface-400 bg-surface-50 dark:bg-surface-900 border-surface-200 dark:border-surface-700'
		}
	};

	function getCapabilityType(tag: string): CapabilityType {
		if (tag === 'fast' || tag === 'powerful' || tag === 'balanced') return 'text';
		if (tag === 'image' || tag === 'image_modify') return 'image';
		if (tag === 'video' || tag === 'video_modify') return 'video';
		if (tag === 'speech' || tag === 'speech_modify') return 'speech';
		if (tag === 'music' || tag === 'music_modify') return 'music';
		return 'unknown';
	}

	const modelConfigs = $derived<LLMConfig[]>(llmStore.llms);

	const enrichedModels = $derived(
		modelConfigs.map((config) => {
			const capType = getCapabilityType(config.tag);
			return {
				id: config.id,
				name: config.name,
				enabled: config.enabled,
				provider: config.provider,
				tag: config.tag,
				capType,
				capConfig: capabilityConfig[capType]
			};
		})
	);

	// 选中状态管理
	let selectedId = $state<string | null>(null);

	function selectModel(id: string) {
		selectedId = selectedId === id ? null : id;
	}

	function toggleEnabled(id: string) {
		const llm = llmStore.find(id);
		if (llm) {
			llm.enabled = !llm.enabled;
			llmStore.upsert(llm);
		}
	}

	function deleteModel(id: string) {
		if (selectedId === id) {
			selectedId = null;
		}
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

	<div class="space-y-2">
		{#each enrichedModels as model (model.id)}
			{@const IconComponent = model.capConfig.icon}
			{@const isSelected = selectedId === model.id}
			<div
				role="button"
				tabindex="0"
				onclick={() => selectModel(model.id)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						selectModel(model.id);
					}
				}}
				class="group relative cursor-pointer rounded-lg border transition-all duration-200"
				class:opacity-60={!model.enabled}
				class:border-primary-500={isSelected}
				class:dark:border-primary-400={isSelected}
				class:bg-primary-50={isSelected}
				class:dark:bg-primary-950={isSelected}
				class:shadow-md={isSelected}
				class:border-surface-200={!isSelected}
				class:dark:border-surface-700={!isSelected}
				class:bg-surface-50={!isSelected}
				class:dark:bg-surface-800={!isSelected}
				class:hover:bg-surface-100={!isSelected}
				class:dark:hover:bg-surface-750={!isSelected}
				class:hover:border-surface-300={!isSelected}
				class:dark:hover:border-surface-600={!isSelected}
			>
				<!-- 选中指示器 -->
				{#if isSelected}
					<div
						class="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-white dark:bg-primary-400 dark:text-surface-900"
					>
						<IconCheck class="h-4 w-4" />
					</div>
				{/if}

				<div class="flex items-center gap-4 p-4">
					<div class="flex-shrink-0">
						<div
							class="flex h-12 w-12 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105 {model
								.capConfig.iconClass}"
						>
							<IconComponent class="h-6 w-6" />
						</div>
					</div>

					<div class="min-w-0 flex-1">
						<div class="mb-1 flex flex-wrap items-center gap-2">
							<span
								class="rounded-full bg-surface-200 px-2.5 py-0.5 text-xs font-medium text-surface-700 dark:bg-surface-700 dark:text-surface-300"
							>
								{t(model.provider)}
							</span>

							<span
								class="rounded-full px-2.5 py-0.5 text-xs font-medium {model.capConfig.iconClass}"
							>
								{t(`tag_${model.tag}`)}
							</span>
						</div>
						<h3
							class="truncate font-mono text-sm font-semibold text-surface-900 dark:text-surface-50"
						>
							{model.name}
						</h3>
					</div>

					<div class="flex flex-shrink-0 items-center gap-1">
						<button
							onclick={(e) => {
								e.stopPropagation();
								toggleEnabled(model.id);
							}}
							class="rounded p-2 transition-colors hover:bg-surface-200 dark:hover:bg-surface-700"
							class:text-emerald-600={model.enabled}
							class:dark:text-emerald-400={model.enabled}
							class:hover:text-emerald-700={model.enabled}
							class:dark:hover:text-emerald-300={model.enabled}
							class:text-surface-400={!model.enabled}
							class:dark:text-surface-600={!model.enabled}
							class:hover:text-surface-500={!model.enabled}
							class:dark:hover:text-surface-500={!model.enabled}
							title={model.enabled ? '禁用模型' : '启用模型'}
						>
							{#if model.enabled}
								<IconToggleRight class="h-5 w-5"></IconToggleRight>
							{:else}
								<IconToggleLeft class="h-5 w-5"></IconToggleLeft>
							{/if}
						</button>

						<button
							onclick={(e) => {
								e.stopPropagation();
								editModel(model.id);
							}}
							class="rounded p-2 text-surface-600 transition-colors hover:bg-surface-200 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-surface-50"
							title="编辑配置"
						>
							<IconEdit class="h-5 w-5"></IconEdit>
						</button>

						<button
							onclick={(e) => {
								e.stopPropagation();
								deleteModel(model.id);
							}}
							class="rounded p-2 text-surface-600 transition-colors hover:bg-red-100 hover:text-red-600 dark:text-surface-400 dark:hover:bg-red-950 dark:hover:text-red-400"
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
