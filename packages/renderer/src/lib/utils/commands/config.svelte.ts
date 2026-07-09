import type { AppConfig } from "@app/main/types";
import Logger from "electron-log/renderer";
import hotkeys from "hotkeys-js";
import { debounce } from "radashi";
import { toast } from "svelte-sonner";
import { api } from "../api";
import { commandCenter } from "./center";


export class KeybindConfig {
    #saveBindingsDebounced = debounce(
        { delay: 500 },
        async () => {
            await this.saveBindings();
        }
    );

    #keybindings: Record<string, string[]> = $state({});
    get keybindings() { return this.#keybindings }


    onKeybindingUpdate(binding: AppConfig['keybindings']) {
        this.#keybindings = binding;
        this.resetAllBindings();
    }


    // 重置全部热键到当前keybindings.
    private resetAllBindings() {
        hotkeys.unbind();
        for (const [cmdId, combos] of Object.entries(this.#keybindings)) {
            for (const combo of combos) this.registerHotkey(cmdId, combo);
        }
    }

    // 清空全部热键。
    clearBindings() {
        this.#keybindings = {}
        hotkeys.unbind();
        this.#saveBindingsDebounced();
    }


    private registerHotkey(cmdId: string, combo: string) {
        if (typeof window === "undefined") return;
        try {
            hotkeys(combo, { scope: "all" }, (e: KeyboardEvent) => {
                e.preventDefault();
                commandCenter.execute(cmdId);
            });
        } catch {
            /* noop */
        }
    }

    private unregisterHotkey(combo: string) {
        if (typeof window === "undefined") return;
        try {
            hotkeys.unbind(combo);
        } catch {
            /* noop */
        }
    }

    private async saveBindings() {
        Logger.debug(`[ConfigStore] saveBindings() called, value=${this.#keybindings}`)
        try {
            await api().config.set({
                key: 'keybindings',
                value: this.#keybindings
            })
            // Logger.info(`[ConfigStore] theme set to "${value}"`)
        } catch (err) {
            const saveRrror = err instanceof Error ? err.message : String(err)
            Logger.error('[ConfigStore] setTheme() failed', err)
            toast.error(saveRrror);
        }
    }

    trigger(combo: string) {
        void (combo)
        // hotkeys.trigger(combo);
    }

    addBinding(cmdId: string, combo: string) {
        const current = this.#keybindings[cmdId] ?? [];

        if (!current.includes(combo)) {
            this.#keybindings = { ...this.#keybindings, [cmdId]: [...current, combo] };
        }
        this.registerHotkey(cmdId, combo);
        this.#saveBindingsDebounced();
    }

    findCommandByHotkey(combo: string): string | null {
        for (const [cmdId, combos] of Object.entries(this.#keybindings)) {
            if (combos.includes(combo)) return cmdId;
        }
        return null;
    }

    // 返回指定命令的热键(字符串，非数组)，用于下拉列表展示。
    getHotkeyForCommand(cmd: string): string | null {
        const combos = this.#keybindings[cmd]
        if (Array.isArray(combos)) {
            return combos.join(',')
        }
        return null
    }

    removeBinding(cmdId: string, combo: string) {
        const current = this.#keybindings[cmdId] ?? [];
        const updated = current.filter((c) => c !== combo);
        if (updated.length > 0) {
            this.#keybindings = { ...this.#keybindings, [cmdId]: updated };
        } else {
            const rest = { ...this.#keybindings };
            delete rest[cmdId];
            this.#keybindings = rest;
        }
        this.unregisterHotkey(combo);
        this.#saveBindingsDebounced();
    }

}