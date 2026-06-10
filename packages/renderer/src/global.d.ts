declare global {
    interface Window {
        versions: Record<string, unknown>,
        onNotification: (callback: (event: Electron.IpcRendererEvent, message: string) => void) => Promise<void>
        getWindowId: () => Promise<number>;
        notifyReady: () => void;
    }
}

export { }