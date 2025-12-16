<script lang="ts">
	import { slide } from 'svelte/transition';
	import IconChevronDown from '~icons/lucide/chevron-down';
	import IconChevronRight from '~icons/lucide/chevron-right';
	import IconExternalLink from '~icons/lucide/external-link';
	import type { FunctorData } from '$lib/utils/vocab/type';

	interface Props {
		initialData: FunctorData;
		onSave: (data: FunctorData) => void;
		onCancel: () => void;
	}

	let { initialData, onSave, onCancel }: Props = $props();

	let description = $state(initialData.definition);
	let showAdvanced = $state(false);
	let expandedSections = $state<Set<string>>(new Set());

	const hasAdvanced = $derived(!!initialData.extra);

	const advancedSections = $derived(() => {
		if (!initialData.extra) return [];

		const sections: Array<{
			id: string;
			title: string;
			items: Array<{ label: string; content: string; isEmpty: boolean }>;
		}> = [];

		// Inputs Section
		if (initialData.extra.inputs && initialData.extra.inputs.length > 0) {
			sections.push({
				id: 'inputs',
				title: `输入 (${initialData.extra.inputs.length})`,
				items: initialData.extra.inputs.flatMap((input, idx) => [
					{
						label: `Input ${idx + 1} - 名称/类型`,
						content: input.name || '',
						isEmpty: !input.name
					},
					{
						label: `Input ${idx + 1} - 定义`,
						content: input.definition || '',
						isEmpty: !input.definition
					},
					{
						label: `Input ${idx + 1} - 抽取器`,
						content: input.extractor || '',
						isEmpty: !input.extractor
					},
					{
						label: `Input ${idx + 1} - 示例`,
						content: input.sample || '',
						isEmpty: !input.sample
					},
					{
						label: `Input ${idx + 1} - 奖励函数`,
						content: input.reward || '',
						isEmpty: !input.reward
					}
				])
			});
		}

		// Output Section
		if (initialData.extra.output) {
			sections.push({
				id: 'output',
				title: '输出',
				items: [
					{
						label: '名称/类型',
						content: initialData.extra.output.name || '',
						isEmpty: !initialData.extra.output.name
					},
					{
						label: '定义',
						content: initialData.extra.output.definition || '',
						isEmpty: !initialData.extra.output.definition
					},
					{
						label: '抽取器',
						content: initialData.extra.output.extractor || '',
						isEmpty: !initialData.extra.output.extractor
					},
					{
						label: '示例',
						content: initialData.extra.output.sample || '',
						isEmpty: !initialData.extra.output.sample
					},
					{
						label: '奖励函数',
						content: initialData.extra.output.reward || '',
						isEmpty: !initialData.extra.output.reward
					}
				]
			});
		}

		// Process Section
		if (initialData.extra.process) {
			sections.push({
				id: 'process',
				title: '处理过程',
				items: [
					{
						label: '名称/类型',
						content: initialData.extra.process.name || '',
						isEmpty: !initialData.extra.process.name
					},
					{
						label: '定义',
						content: initialData.extra.process.definition || '',
						isEmpty: !initialData.extra.process.definition
					},
					{
						label: '抽取器',
						content: initialData.extra.process.extractor || '',
						isEmpty: !initialData.extra.process.extractor
					},
					{
						label: '示例',
						content: initialData.extra.process.sample || '',
						isEmpty: !initialData.extra.process.sample
					},
					{
						label: '奖励函数',
						content: initialData.extra.process.reward || '',
						isEmpty: !initialData.extra.process.reward
					}
				]
			});
		}

		return sections;
	});

	function toggleSection(id: string) {
		const newSet = new Set(expandedSections);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		expandedSections = newSet;
	}

	function handleSave() {
		onSave({ ...initialData, definition: description });
	}

	function handleAdvancedEdit() {
		console.log('Navigate to advanced editor');
	}
</script>

<div class="flex h-full max-h-screen flex-col">
	<!-- 滚动容器 -->
	<div class="flex-1 overflow-y-auto">
		<div class="flex flex-col gap-6 p-6">
			<!-- 主要编辑区 -->
			<label class="flex flex-col gap-2">
				<!-- <span class="text-surface-900-50 text-sm font-medium">描述</span> -->
				<textarea
					bind:value={description}
					class="border-surface-300-600 bg-surface-50-900 text-surface-900-50 placeholder-surface-400-500 min-h-[200px] w-full resize-y rounded-lg border px-4 py-3 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
					rows="8"
					placeholder="输入行为定义(函子定义)..."
				></textarea>
			</label>

			<!-- 高级选项按钮 -->
			{#if hasAdvanced}
				<div>
					<button
						type="button"
						class="border-surface-300-600 bg-surface-50-900 text-surface-900-50 hover:bg-surface-100-800 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
						onclick={() => (showAdvanced = !showAdvanced)}
					>
						{#if showAdvanced}
							<IconChevronDown class="h-4 w-4" />
						{:else}
							<IconChevronRight class="h-4 w-4" />
						{/if}
						<span>高级选项</span>
					</button>
				</div>

				<!-- 高级选项内容 -->
				{#if showAdvanced}
					<div
						transition:slide={{ duration: 300 }}
						class="border-surface-300-600 bg-surface-100-800 flex flex-col gap-4 rounded-lg border p-4"
					>
						<header class="flex items-center justify-between">
							<div class="space-y-1">
								<h3 class="text-surface-900-50 text-base font-semibold">高级配置（只读）</h3>
								{#if initialData.extra?.sub_type}
									<p class="text-sm text-surface-700-300">类型: {initialData.extra.sub_type}</p>
								{/if}
							</div>
							<button
								type="button"
								class="inline-flex items-center gap-2 rounded-md bg-primary-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-600"
								onclick={handleAdvancedEdit}
							>
								<IconExternalLink class="h-3.5 w-3.5" />
								<span>高级编辑</span>
							</button>
						</header>

						<div class="flex flex-col gap-2">
							{#each advancedSections() as section (section.id)}
								<div
									class="border-surface-300-600 bg-surface-50-900 overflow-hidden rounded-lg border"
								>
									<button
										type="button"
										class="text-surface-900-50 hover:bg-surface-100-800 flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors"
										onclick={() => toggleSection(section.id)}
									>
										<span>{section.title}</span>
										{#if expandedSections.has(section.id)}
											<IconChevronDown class="h-4 w-4 transition-transform" />
										{:else}
											<IconChevronRight class="h-4 w-4 transition-transform" />
										{/if}
									</button>

									{#if expandedSections.has(section.id)}
										<div
											transition:slide={{ duration: 200 }}
											class="border-surface-300-600 border-t"
										>
											<div class="flex flex-col gap-4 p-4">
												{#each section.items as item}
													{#if !item.isEmpty}
														<div class="flex flex-col gap-2">
															<h5
																class="text-xs font-semibold tracking-wide text-surface-700-300 uppercase"
															>
																{item.label}
															</h5>
															<div
																class="border-surface-300-600 bg-surface-100-800 max-h-60 overflow-y-auto rounded-md border px-3 py-2"
															>
																<pre
																	class="text-surface-900-50 font-mono text-xs break-words whitespace-pre-wrap">{item.content}</pre>
															</div>
														</div>
													{/if}
												{/each}
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</div>
	</div>

	<!-- 固定底部操作按钮 -->
	<footer
		class="border-surface-300-600 bg-surface-50-900 flex items-center justify-end gap-3 border-t px-6 py-4"
	>
		<button
			type="button"
			class="border-surface-300-600 bg-surface-50-900 text-surface-900-50 hover:bg-surface-100-800 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
			onclick={onCancel}
		>
			取消
		</button>
		<button
			type="button"
			class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600"
			onclick={handleSave}
		>
			保存
		</button>
	</footer>
</div>
