<script lang="ts">
	import { Motion } from 'svelte-motion';
	import IconFolderOpen from '~icons/lucide/folder-open';
	import { t } from '$lib/stores/config/ipc/i18n.svelte';
	import { open } from '@tauri-apps/plugin-dialog';
	import { projectStore } from '$lib/stores/project/project.svelte';
	import { loadingStore } from '$lib/stores/loading.svelte';
	import { getContext } from 'svelte';
	import { logger } from '$lib/utils/logger';

	type ToastStore = ReturnType<typeof import('@skeletonlabs/skeleton-svelte').createToaster>;
	const toaster = getContext<ToastStore>('toaster');

	// Prints file path or URI
	async function createNewProject() {
		processing = true;
		// Open a dialog
		const file = await open({
			title: t('zippy_whole_elephant_support'),
			multiple: false,
			directory: true
		});

		if (file) {
			loadingStore.show(t('salty_flaky_worm_exhale'));
			const loadedResult = await projectStore.loadPath(file);
			if (!loadedResult.success && loadedResult.error) {
				toaster.error({
					description: loadedResult.error
				});
			}
			loadingStore.hide();
		}

		processing = false;
	}

	let processing = $state(false);
</script>

<div class="relative w-full pr-[156px]">
	<div class="flex min-h-[3rem] flex-col items-start justify-center gap-0.5 text-left">
		<span class="text-base leading-tight font-medium">
			{t('zippy_whole_elephant_support')}
		</span>
		<span class="line-clamp-2 text-sm leading-tight opacity-75">
			{t('helpful_mean_jurgen_roam')}
		</span>
	</div>
	<Motion
		let:motion
		whileHover={{ scale: 1.05 }}
		whileTap={{ scale: 0.95 }}
		transition={{ type: 'spring', stiffness: 400, damping: 17 }}
	>
		<button
			use:motion
			type="button"
			disabled={processing}
			class="absolute top-1/2 right-0 btn min-w-[140px] -translate-y-1/2 preset-filled-primary-500"
			onclick={createNewProject}
		>
			<IconFolderOpen class="size-5" />
			<span>{t('gross_tidy_turtle_cook')}</span>
		</button>
	</Motion>
</div>
