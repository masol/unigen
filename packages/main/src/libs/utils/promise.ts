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


export class TrackableDeferred<T> {
    public readonly promise: Promise<T>;
    public readonly resolve: (value: T | PromiseLike<T>) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public readonly reject: (reason?: any) => void;

    private _isFulfilled = false;
    private _isRejected = false;

    constructor() {
        const { promise, resolve, reject } = Promise.withResolvers<T>();

        this.resolve = (value) => {
            if (this.isSettled) return;
            this._isFulfilled = true;
            resolve(value);
        };

        this.reject = (reason) => {
            if (this.isSettled) return;
            this._isRejected = true;
            reject(reason);
        };

        this.promise = promise;
    }

    public get isFulfilled() { return this._isFulfilled; }
    public get isRejected() { return this._isRejected; }
    public get isSettled() { return this._isFulfilled || this._isRejected; }
    public get isPending() { return !this.isSettled; }
}
