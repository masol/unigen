<script lang="ts">
	import { localeStore } from '$lib/stores/config/ipc/i18n.svelte';
	import IconLanguage from '~icons/lucide/languages';

	interface Props {
		/**
		 * 自定义样式类名
		 */
		class?: string;
	}

	let { class: className = '' }: Props = $props();

    let currentLocale = $derived(localeStore.lang);

	let locales = [
		{ code: 'zh-cn', label: '简体中文', nativeName: '简体中文' },
		{ code: 'zh-tw', label: '繁體中文', nativeName: '繁體中文' },
		{ code: 'en', label: 'English', nativeName: 'English' },
		{ code: 'es', label: 'Español', nativeName: 'Español' },
		{ code: 'ja', label: '日本語', nativeName: '日本語' },
		{ code: 'ko', label: '한국어', nativeName: '한국어' },
        { code: 'ru', label: 'Русский', nativeName: 'Русский' }
	];

	// 处理语言切换
	function handleChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		currentLocale = target.value;

        console.log("setLocale:",currentLocale)
        localeStore.setLocale(currentLocale);
	}
</script>

<div class="inline-flex items-center gap-2 {className}">
	<IconLanguage class="h-5 w-5 text-surface-600-400" aria-hidden="true" />
	<select
		class="select w-auto min-w-[140px] cursor-pointer py-2 pr-8 pl-3 text-sm font-medium"
		bind:value={currentLocale}
		onchange={handleChange}
		aria-label="选择语言"
	>
		{#each locales as locale (locale.code)}
			<option value={locale.code}>
				{locale.nativeName}
			</option>
		{/each}
	</select>
</div>
