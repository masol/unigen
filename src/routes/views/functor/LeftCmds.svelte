<script lang="ts">
	import IconMdiImport from '~icons/mdi/import'; // 输入
	import IconMdiExport from '~icons/mdi/export'; // 输出
	import IconMdiCog from '~icons/mdi/cog'; // 处理
	import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
</script>

<SegmentedControl defaultValue="process" class="[&>*]:!border-0">
	<SegmentedControl.Control>
		<SegmentedControl.Indicator />
		<SegmentedControl.Item value="process" title="end" aria-label="end">
			<SegmentedControl.ItemText>
				<IconMdiCog class="size-4" />
			</SegmentedControl.ItemText>
			<SegmentedControl.ItemHiddenInput />
		</SegmentedControl.Item>        
		<SegmentedControl.Item value="input" title="start" aria-label="start">
			<SegmentedControl.ItemText>
				<IconMdiImport class="size-4" />
			</SegmentedControl.ItemText>
			<SegmentedControl.ItemHiddenInput />
		</SegmentedControl.Item>
		<SegmentedControl.Item value="output" title="center" aria-label="center">
			<SegmentedControl.ItemText>
				<IconMdiExport class="size-4" />
			</SegmentedControl.ItemText>
			<SegmentedControl.ItemHiddenInput />
		</SegmentedControl.Item>

	</SegmentedControl.Control>
</SegmentedControl>
