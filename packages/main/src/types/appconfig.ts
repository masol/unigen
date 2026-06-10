// electron/types/config.ts

// 不再保存windows状态,这个状态项目级维护.
// export interface WindowState {
//     width: number;
//     height: number;
//     x?: number;
//     y?: number;
//     isMaximized?: boolean;
// }

export interface AppConfig {
    theme: 'light' | 'dark' | 'system';
    lang: string;
    maximized : boolean;
    // 其他配置...
}