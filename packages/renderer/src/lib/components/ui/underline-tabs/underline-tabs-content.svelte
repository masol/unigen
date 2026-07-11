<script lang="ts">
	import { cn } from '$lib/utils/index';
	import { Tabs as TabsPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.ContentProps = $props();
</script>

<TabsPrimitive.Content
	bind:ref
	data-slot="underline-tabs-content"
	class={cn('flex-1 outline-none', className)}
	{...restProps}
/>
