

export type Resolve<T> = Parameters<ConstructorParameters<typeof Promise<T>>[0]>[0];
export type Reject = Parameters<ConstructorParameters<typeof Promise>[0]>[1];


// NodeId to Promise.
export type RunContext = {
    [key: string]: {
        result: {
            value: Promise<string>,
            resolve: Resolve<string>,
            reject: Reject
        }
    }
}