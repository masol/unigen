import type { StartupWarning } from "$lib/utils/evtbus";

/**
 * 全局警告 store。
 *
 * 职责：
 * - 收集"启动期"和"运行期"的警告
 * - 在 status bar 显示总数 / error 数
 * - 未来扩展：点击打开底部抽屉展示详情
 *
 * 注意：
 * - 加载期"phase / message / progress" 不放这里，保持 LoadingScreen 局部
 * - add/addAll 自带去重（按 id），可安全多次调用
 */
class WarningsStore {
    #warnings = $state<StartupWarning[]>([]);

    get warnings(): ReadonlyArray<StartupWarning> {
        return this.#warnings;
    }

    get count(): number {
        return this.#warnings.length;
    }

    get errorCount(): number {
        return this.#warnings.filter((w) => w.level === "error").length;
    }

    get warnCount(): number {
        return this.#warnings.filter((w) => w.level === "warn").length;
    }

    /** 追加一条（带 id 去重） */
    add(warning: StartupWarning): void {
        if (this.#warnings.some((w) => w.id === warning.id)) return;
        this.#warnings = [...this.#warnings, warning];
    }

    /** 批量追加（带 id 去重） */
    addAll(warnings: StartupWarning[]): void {
        if (warnings.length === 0) return;
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const existing = new Set(this.#warnings.map((w) => w.id));
        let changed = false;
        const next = [...this.#warnings];
        for (const w of warnings) {
            if (!existing.has(w.id)) {
                existing.add(w.id);
                next.push(w);
                changed = true;
            }
        }
        if (changed) this.#warnings = next;
    }

    dismiss(id: string): void {
        this.#warnings = this.#warnings.filter((w) => w.id !== id);
    }

    clear(): void {
        this.#warnings = [];
    }
}

const GLOBAL_KEY = Symbol.for("unigen.renderer.warnings");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const warningsStore: WarningsStore = ((globalThis as any)[GLOBAL_KEY] ??=
    new WarningsStore());