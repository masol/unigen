import { Provider } from "./shared/model.js";



export interface AppConfig {
    theme: 'light' | 'dark' | 'system';
    lang: string;
    maximized: boolean;
    model_endpoint: string; // 模型的下载点。(包括ugvector下载embeding以及ollmacpp自动下载模型)
    embed_model: string; // ugvector使用的模型名称(external:XXX为外部模型，非本地模型)
    local_model: string; // node-llama-cpp本地管理的模型名称。
    autoupdate: boolean;
    models: Provider[];
    disableHA: boolean; // 禁用硬件加速。 disableHardwareAcceleration 
    keybindings: Record<string, string[]>;
    // 其他配置...
}