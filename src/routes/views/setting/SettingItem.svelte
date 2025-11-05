<!-- src/lib/components/settings/SettingItem.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		description?: string;
		children: Snippet;
	}

	let { label, description, children }: Props = $props();
</script>

<div
	class="flex flex-col gap-3 border-b border-surface-200 pb-6 last:border-b-0 dark:border-surface-700"
>
	<div class="space-y-1">
		<span class="text-sm font-semibold text-surface-900 dark:text-surface-100">{label}</span>
		{#if description}
			<p class="text-sm text-surface-600 dark:text-surface-400">{description}</p>
		{/if}
	</div>
	<div class="flex flex-col gap-2">
		{@render children()}
	</div>
</div>
