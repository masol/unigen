/** 极简计数信号量:walk 并行访问器的全局闸门 */
export class Semaphore {
    #waiters: (() => void)[] = [];
    #free: number;
    constructor(n: number) { this.#free = Math.max(1, n); }
    async acquire(): Promise<void> {
        if (this.#free > 0) { this.#free--; return; }
        await new Promise<void>(resolve => this.#waiters.push(resolve));
    }
    release(): void {
        const next = this.#waiters.shift();
        if (next) next(); else this.#free++;
    }
}