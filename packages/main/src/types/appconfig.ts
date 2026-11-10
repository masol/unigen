import type { RecentProject } from "./shared/api/recents.js";
import { Provider } from "./shared/model.js";



export interface AppConfig {
    theme: 'light' | 'dark' | 'system';
    lang: string;
    maximized: boolean;
    // model_endpoint: string; // 模型的下载点。(包括ugvector下载embeding以及ollmacpp自动下载模型)
    embed_model: string; // ugvector使用的模型名称(external:XXX为外部模型，非本地模型)
    rerank_model: string; // 废弃使用本地LLM模型(可以通过llama-cpp或LM Studio等本地桥接)，本字段改为rerank配置。
    task_dir: string; // 任务存储目录，默认是用户应用目录下的user_tasks
    autoupdate: boolean;
    parallelRun: boolean;
    models: Provider[];
    concurrency: number;
    telemetry: string; // COLLECTOR_URL配置。
    disableHA: boolean; // 禁用硬件加速。 disableHardwareAcceleration 
    itemsPerPage: number;
    fontSize: number;
    lineHeight: number;
    lineNumbers: boolean;
    rmblueprint: boolean; // 是否允许删除blueprint三表中的成员，默认false.
    showDevUI: boolean; // 是否显示开发用界面.
    keybindings: Record<string, string[]>;
    // 其他配置...
}


// 无需备份与恢复的第二配置。
export interface SecondConfig {
    recents: RecentProject[],
    search_inited: boolean
}