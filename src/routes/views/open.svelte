<script lang="ts">
	import RepoDialog from '$lib/comp/Settings/Repo/RepoDialog.svelte';
	import { loadingStore } from '$lib/stores/loading.svelte';
</script>

{#if !loadingStore.showBackdrop}
	<RepoDialog open={true} closeable={false} />
{/if}
