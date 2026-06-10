declare global {
    interface Window {
        versions: any,
        orpc_connect: () => Promise<MessagePort>;
    }
}

export { }