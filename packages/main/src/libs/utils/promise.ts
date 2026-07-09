export const delay = (ms: number, signal?: AbortSignal) => {
    return new Promise<void>((resolve) => {
        if (signal?.aborted) return resolve();
        const t = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(t);
                resolve();
            },
            { once: true },
        );
    });
}