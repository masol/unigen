// electron/types/config.ts
export interface WindowState {
    width: number;
    height: number;
    x?: number;
    y?: number;
    isMaximized?: boolean;
}

export interface AppConfig {
    windowState: WindowState;
    theme: 'light' | 'dark' | 'system';
    lang: string;
    // 其他配置...
}