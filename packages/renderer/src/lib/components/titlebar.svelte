<!-- TitleBar.svelte -->
<script lang="ts">
	import {
		IconMinus,
		IconSquare,
		IconCopy,
		IconX,
		IconLayoutSidebar,
		IconBell,
		IconSun,
		IconMoon
	} from '@tabler/icons-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { toggleMode } from 'mode-watcher';

	type WindowState = 'normal' | 'maximized' | 'minimized' | 'tray';

	// 本地假 store（runes），后续替换为真实跨组件 store
	let state = $state<WindowState>('normal');
	let title = $state('hermes — workspace');

	const isMaximized = $derived(state === 'maximized');
	const menus = ['文件', '编辑', '视图', '运行', '终端', '帮助'];
	const menuItems = ['新建文件', '打开...', '保存', '另存为...', '退出'];

	function maximize() {
		state = isMaximized ? 'normal' : 'maximized';
	}
	function minimize() {
		state = 'minimized'; // 真实环境：window.api.minimize()
	}
	function tray() {
		state = 'tray'; // 真实环境：window.api.hideToTray()
	}
	function close() {
		console.log('window close requested'); // 真实环境：window.api.close()
	}
</script>

<!-- 标题栏：z 最高，背景比主区略亮（sidebar 色阶），始终可点；role/aria 满足 a11y -->
<header
	class="bg-sidebar text-sidebar-foreground relative z-50 flex h-9 shrink-0 select-none items-center border-b text-xs"
	style="-webkit-app-region: drag;"
	role="toolbar"
	aria-label="窗口标题栏"
	tabindex="-1"
	ondblclick={maximize}
>
	<!-- 应用图标 -->
	<div class="flex h-full items-center px-2.5" style="-webkit-app-region: no-drag;">
		<div
			class="flex h-5 w-5 items-center justify-center rounded bg-linear-to-br from-sky-500 to-violet-500 text-[10px] font-bold text-white"
		>
			H
		</div>
	</div>

	<!-- 菜单栏（pad/电脑显示） -->
	<nav class="hidden items-center md:flex" style="-webkit-app-region: no-drag;">
		{#each menus as m (m)}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="sm" class="h-9 rounded-none px-2.5 font-normal">
							{m}
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="min-w-44">
					{#each menuItems as item (item)}
						<DropdownMenu.Item>{item}</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/each}
	</nav>

	<!-- 移动端折叠菜单 -->
	<div class="md:hidden" style="-webkit-app-region: no-drag;">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="sm" class="h-9 rounded-none px-2 font-normal">
						菜单
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start">
				{#each menus as m (m)}
					<DropdownMenu.Item>{m}</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>

	<!-- 中部标题（拖拽区） -->
	<div class="flex flex-1 items-center justify-center px-2">
		<span class="text-muted-foreground truncate">{title}</span>
	</div>

	<!-- 右侧集成功能 -->
	<Tooltip.Provider delayDuration={300}>
		<div class="flex items-center" style="-webkit-app-region: no-drag;">
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button {...props} onclick={toggleMode} variant="ghost" size="icon" class="size-9 rounded-none">
							<IconSun size={16} class="dark:hidden" />
							<IconMoon size={16} class="hidden dark:block" />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>切换主题</Tooltip.Content>
			</Tooltip.Root>

			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon" class="size-9 rounded-none">
							<IconLayoutSidebar size={16} />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>切换侧栏</Tooltip.Content>
			</Tooltip.Root>

			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon" class="relative size-9 rounded-none">
							<IconBell size={16} />
							<span class="absolute right-2 top-2 size-1.5 rounded-full bg-rose-500"></span>
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>通知</Tooltip.Content>
			</Tooltip.Root>

			<!-- 窗口控制 -->
			<div class="ml-1 flex items-center">
				<Button onclick={minimize} variant="ghost" size="icon" class="h-9 w-11 rounded-none" title="最小化">
					<IconMinus size={16} />
				</Button>

				<!-- 托盘化 -->
				<Button onclick={tray} variant="ghost" size="icon" class="h-9 w-11 rounded-none" title="最小化到托盘">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 14h4l2 3h6l2-3h4" />
						<path d="M5 14V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8" />
					</svg>
				</Button>

				<Button
					onclick={maximize}
					variant="ghost"
					size="icon"
					class="h-9 w-11 rounded-none"
					title={isMaximized ? '还原' : '最大化'}
				>
					{#if isMaximized}
						<IconCopy size={14} />
					{:else}
						<IconSquare size={13} />
					{/if}
				</Button>

				<!-- 关闭：hover 变红 -->
				<Button
					onclick={close}
					variant="ghost"
					size="icon"
					class="h-9 w-11 rounded-none hover:bg-rose-500 hover:text-white"
					title="关闭"
				>
					<IconX size={16} />
				</Button>
			</div>
		</div>
	</Tooltip.Provider>
</header>