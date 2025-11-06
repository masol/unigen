<script lang="ts">
	import IconTrash from '~icons/lucide/trash-2';
	import IconEdit from '~icons/lucide/pen-line';
	import IconToggleLeft from '~icons/lucide/toggle-left';
	import IconToggleRight from '~icons/lucide/toggle-right';
	import IconSparkles from '~icons/lucide/sparkles';
	import IconShield from '~icons/lucide/shield';
	import IconClock from '~icons/lucide/clock';
	import IconAlertTriangle from '~icons/lucide/alert-triangle';
	import Dialog from './Dialog.svelte';
	import { netStore } from '$lib/stores/config/ipc/net.svelte';
	import type { ProxyConfig } from '$lib/utils/proxy';

	// type ProxyType = 'all' | 'http' | 'https';

	// 假数据
	let proxyConfigs = $derived<ProxyConfig[]>(netStore.nets);

	async function toggleEnabled(id: string) {
		const proxy = netStore.find(id);

		if (proxy) {
			proxy.enabled = !proxy.enabled;
			netStore.upsert(proxy);
		}
	}

	async function deleteProxy(id: string) {
		await netStore.removeById(id);
	}

	function editProxy(id: string) {
		modelId = id;
		editorOpen = true;
	}

	let modelId = $state('');
	let editorOpen = $state(false);
</script>

<div class="mx-auto w-full max-w-6xl space-y-6 p-6">
	<div class="mb-8 flex items-center justify-between">
		<div class="flex items-center gap-3">
			<IconSparkles class="h-7 w-7 text-primary-500" />
			<h2 class="text-2xl font-semibold text-surface-900 dark:text-surface-50">代理配置</h2>
			<span
				class="rounded-full bg-surface-200 px-3 py-1 text-sm font-medium text-surface-700 dark:bg-surface-700 dark:text-surface-300"
			>
				{proxyConfigs.length}
			</span>
		</div>

		<Dialog bind:open={editorOpen} {modelId}></Dialog>
	</div>

	<div class="grid gap-4">
		{#each proxyConfigs as config (config.id)}
			<div
				class="group relative rounded-xl border bg-white shadow-sm transition-all duration-300
               hover:shadow-lg dark:bg-surface-800
               {config.enabled
					? 'border-primary-200 dark:border-primary-800'
					: 'border-surface-200 opacity-60 dark:border-surface-700'}"
			>
				<div class="flex items-center gap-4 p-5">
					<!-- 启用状态指示器 -->
					<div class="flex-shrink-0">
						<button
							onclick={() => toggleEnabled(config.id)}
							class="flex h-12 w-12 items-center justify-center rounded-xl border transition-all duration-200
                     {config.enabled
								? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
								: 'border-surface-300 bg-surface-100 text-surface-400 hover:bg-surface-200 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-500'}"
							title={config.enabled ? '点击禁用' : '点击启用'}
						>
							{#if config.enabled}
								<IconToggleRight class="h-6 w-6" />
							{:else}
								<IconToggleLeft class="h-6 w-6" />
							{/if}
						</button>
					</div>

					<!-- 主要信息 -->
					<div class="min-w-0 flex-1 space-y-2">
						<!-- URL -->
						<h3
							class="truncate font-mono text-base font-semibold text-surface-900 dark:text-surface-50"
						>
							{config.url}
						</h3>

						<!-- 标签组 -->
						<div class="flex flex-wrap items-center gap-2">
							<!-- 代理类型 -->
							<!-- <span
								class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium
                       {config.type === 'all'
									? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
									: config.type === 'https'
										? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
										: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}"
							>
								{config.type.toUpperCase()}
							</span> -->

							<!-- Basic Auth -->
							{#if config.basicAuth}
								<span
									class="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
								>
									<IconShield class="h-3 w-3" />
									Auth
								</span>
							{/if}

							<!-- 超时时间 -->
							{#if config.connectTimeout}
								<span
									class="inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300"
								>
									<IconClock class="h-3 w-3" />
									{config.connectTimeout}ms
								</span>
							{/if}

							<!-- 不代理规则 -->
							{#if config.target}
								<span
									class="inline-flex max-w-[180px] items-center truncate rounded-md bg-surface-200 px-2 py-1 text-xs font-medium text-surface-700
           sm:max-w-[240px] dark:bg-surface-700 dark:text-surface-300"
									title="代理: {config.target}"
								>
									{config.target}
								</span>
							{/if}

							<!-- 安全警告 -->
							{#if config.acceptInvalidCerts || config.acceptInvalidHostnames}
								<span
									class="inline-flex items-center gap-1 rounded-md bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300"
									title={(config.acceptInvalidCerts ? '接受无效证书 ' : '') +
										(config.acceptInvalidHostnames ? '接受无效主机名' : '')}
								>
									<IconAlertTriangle class="h-3 w-3" />
									安全警告
								</span>
							{/if}
						</div>
					</div>

					<!-- 操作按钮 -->
					<div
						class="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
					>
						<button
							onclick={() => editProxy(config.id)}
							class="rounded-lg p-2 text-surface-600 transition-colors hover:bg-surface-100 hover:text-primary-600 dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-primary-400"
							title="编辑"
						>
							<IconEdit class="h-5 w-5" />
						</button>

						<button
							onclick={() => deleteProxy(config.id)}
							class="rounded-lg p-2 text-surface-600 transition-colors hover:bg-error-50 hover:text-error-600 dark:text-surface-400 dark:hover:bg-error-950 dark:hover:text-error-400"
							title="删除"
						>
							<IconTrash class="h-5 w-5" />
						</button>
					</div>
				</div>
			</div>
		{/each}
	</div>

	{#if proxyConfigs.length === 0}
		<div class="py-20 text-center">
			<IconSparkles class="mx-auto mb-4 h-16 w-16 text-surface-300 dark:text-surface-700" />
			<p class="text-surface-500 dark:text-surface-400">暂无代理配置</p>
		</div>
	{/if}
</div>
