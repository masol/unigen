// packages/renderer/src/lib/utils/commands/type.ts
export type CommandHandler = () => void | Promise<void>;

export interface CommandDescriptor {
    id: string;
    label: string;
    category?: string;
    description?: string;
    handler: CommandHandler;
    /**
     * 仅在 showDevUI 开启时于 UI 中显示（命令面板 / 快捷键设置等）。
     * 不影响热键触发；仅在 UI 层做过滤。
     */
    devOnly?: boolean;
    /**
     * 局部热键：不通过 hotkeys-js 全局注册。
     * 由宿主组件（ChatInput / CommandPaletteBar 等）在自身 keydown 里
     * 读取 configStore.keybinding 并匹配 combo 后触发。
     * 仍可由 commandCenter 查询、由 Keybindings 页面编辑。
     */
    local?: boolean;
}