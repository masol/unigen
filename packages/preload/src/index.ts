// Type definitions for preload API
// Actual implementation is in exposed.ts and runs in the main process

export type GetWindowId = () => Promise<number>;
export type OnNotification = (callback: (event: never, message: unknown) => void) => void;
