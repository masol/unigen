<script lang="ts">
	import IconSettings from '~icons/carbon/settings';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Dialog>
	<Dialog.Trigger>
		<IconSettings />
	</Dialog.Trigger>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<Dialog.Content>
				<div
					class="bg-surface-50-900/30 w-full max-w-xl space-y-4 card border border-surface-200/30 p-4 shadow-xl backdrop-blur-sm"
				>
					<header class="flex items-center justify-between">
						<Dialog.Title class="text-2xl font-bold">Hello Skeleton</Dialog.Title>
						<Dialog.CloseTrigger class="btn-icon hover:preset-tonal">&times</Dialog.CloseTrigger>
					</header>
					<img
						class="w-full overflow-hidden rounded-container"
						src="https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExNWVmbzcxanp6YmtxZ28xcXBqaXBscThsdDZ5Nm9ncWxkeWtqaHJ2bSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9dg/dn1PN6NtunfnUjUGFC/giphy.gif"
						alt="Skeleton Gif"
					/>
					<Dialog.Description class="text-center">Three spooky skeletons!</Dialog.Description>
				</div>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
