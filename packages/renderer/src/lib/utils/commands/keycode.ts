// packages/renderer/src/lib/utils/commands/keycode.ts
/**
 * 组合键字符串工具（hotkeys-js 兼容格式）。
 *
 * hotkeys-js 的 key 名规则：
 * - 修饰键：ctrl / command (meta) / alt / shift
 * - Enter → return、Escape → escape、Space → space
 * - `+` 为分隔符，加号键写作 plus
 * - 单字母统一小写
 */

const isMacPlatform = (): boolean =>
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const MAC_MAP: Record<string, string> = {
    ctrl: '⌃',
    command: '⌘',
    alt: '⌥',
    shift: '⇧',
    return: '↩',
    enter: '↩',
    esc: 'Esc',
    escape: 'Esc',
    space: '␣',
    tab: '⇥',
    backspace: '⌫',
    delete: '⌦',
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    plus: '+',
    pageup: '⇞',
    pagedown: '⇟',
    home: '↖',
    end: '↘',
    capslock: '⇪',
};

const WIN_MAP: Record<string, string> = {
    ctrl: 'Ctrl',
    command: 'Win',
    alt: 'Alt',
    shift: 'Shift',
    return: 'Enter',
    enter: 'Enter',
    esc: 'Esc',
    escape: 'Esc',
    space: 'Space',
    tab: 'Tab',
    backspace: '⌫',
    delete: 'Del',
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    plus: '+',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    home: 'Home',
    end: 'End',
    capslock: 'CapsLock',
};

/**
 * 将 KeyboardEvent 转换为 hotkeys-js 风格的组合串。
 *
 * - 修饰键顺序：ctrl → command → alt → shift
 * - Enter 映射为 return
 * - `+` 映射为 plus
 * - 仅按下修饰键时返回 ''（无实际按键）
 */
export function eventToCombo(e: KeyboardEvent): string {
    if (!e || !e.key) return '';
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return '';

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.metaKey) parts.push('command');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');

    let key = e.key;
    if (key === '+') {
        key = 'plus';
    } else if (key.length === 1) {
        key = key.toLowerCase();
    } else {
        const map: Record<string, string> = {
            ArrowUp: 'up',
            ArrowDown: 'down',
            ArrowLeft: 'left',
            ArrowRight: 'right',
            Enter: 'return',
            ' ': 'space',
            Escape: 'escape',
            Backspace: 'backspace',
            Delete: 'delete',
            Tab: 'tab',
            Home: 'home',
            End: 'end',
            PageUp: 'pageup',
            PageDown: 'pagedown',
            Insert: 'insert',
            CapsLock: 'capslock',
        };
        key = map[key] ?? key.toLowerCase();
    }
    parts.push(key);
    return parts.join('+');
}

/**
 * 将 hotkeys-js 的 combo（如 `ctrl+shift+return`）格式化为可读字符串。
 *
 * - macOS：`⌃⇧↩`
 * - 其他：`Ctrl+Shift+Enter`
 *
 * `isMac` 未显式传入时，按运行时平台自动检测。
 */
export function formatCombo(combo: string, isMac?: boolean): string {
    if (!combo) return '';
    const mac = isMac ?? isMacPlatform();
    const map = mac ? MAC_MAP : WIN_MAP;

    return combo
        .split('+')
        .map((p) => {
            if (!p) return '';
            const k = p.toLowerCase();
            if (map[k]) return map[k];
            if (k.length === 1) return k.toUpperCase();
            return k.charAt(0).toUpperCase() + k.slice(1);
        })
        .filter(Boolean)
        .join(mac ? '' : '+');
}