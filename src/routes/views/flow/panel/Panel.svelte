<script lang="ts">
	import IconLucideGripVertical from '~icons/lucide/grip-vertical';
	import IconLucideMinimize from '~icons/lucide/minimize';
	import IconLucideX from '~icons/lucide/x';
	import IconLucideMinus from '~icons/lucide/minus';
	import IconLucideMaximize from '~icons/lucide/maximize';
	import { FloatingPanel, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { PanelStore } from './panelStore.svelte';

	interface Props {
		id: string;
		view: string;
		store: PanelStore; // 接收外部传入的 store
	}

	let { id, view, store }: Props = $props();

	// 从传入的 store 获取数据
	let panelData = $derived(store.getPanel(id));

	function handleClose() {
		store.removePanel(id);
	}
</script>

{#if panelData && panelData.view === view}
	<FloatingPanel>
		<Portal>
			<FloatingPanel.Positioner class="z-50">
				<FloatingPanel.Content>
					<FloatingPanel.DragTrigger>
						<FloatingPanel.Header>
							<FloatingPanel.Title>
								<IconLucideGripVertical class="size-4" />
								{panelData.title}
							</FloatingPanel.Title>
							<FloatingPanel.Control>
								<FloatingPanel.StageTrigger stage="minimized">
									<IconLucideMinus class="size-4" />
								</FloatingPanel.StageTrigger>
								<FloatingPanel.StageTrigger stage="maximized">
									<IconLucideMaximize class="size-4" />
								</FloatingPanel.StageTrigger>
								<FloatingPanel.StageTrigger stage="default">
									<IconLucideMinimize class="size-4" />
								</FloatingPanel.StageTrigger>
								<FloatingPanel.CloseTrigger onclick={handleClose}>
									<IconLucideX class="size-4" />
								</FloatingPanel.CloseTrigger>
							</FloatingPanel.Control>
						</FloatingPanel.Header>
					</FloatingPanel.DragTrigger>
					<FloatingPanel.Body>
						<p>{panelData.content}</p>
					</FloatingPanel.Body>
					<FloatingPanel.ResizeTrigger axis="se" />
				</FloatingPanel.Content>
			</FloatingPanel.Positioner>
		</Portal>
	</FloatingPanel>
{/if}
