// 第二存储持久化池，无需备份/恢复的放在这里。

import Store from 'electron-store';
import { RecentProject, SecondConfig } from '$types/appconfig.js';
import { secondSchema } from './second.schema.js';
import { broadcast } from '$libs/utils/rpcevt.js';
import { getCurrentProject } from '$libs/utils/api.js';
import QuickLRU from 'quick-lru';

type QuickLRUType = QuickLRU<string, RecentProject>;
class ConfigService {
    private store: Store<SecondConfig>;
    private lru: QuickLRUType;

    constructor(store: Store<SecondConfig>) {
        this.store = store;

        // 确保如果磁盘上的物理文件遭遇人为损坏（如变成了空文件或非法 JSON），
        // 也能在初始化时立即根据 configSchema 重置并生成一个干净、合规的默认 JSON 配置文件。
        try {
            if (!this.store.store || typeof this.store.store !== 'object') {
                this.store.clear();
            }
        } catch {
            this.store.clear();
        }

        this.lru = new QuickLRU({
            maxSize: 10,
        })
        const recents = this.get('recents');
        // 按 time 降序排序，时间小的在前
        const sortedRecents = [...recents].sort((a, b) => a.time - b.time);
        for (const recent of sortedRecents) {
            this.lru.set(recent.path, recent);
        }
    }

    private onUpdate() {
        this.set('recents', Array.from(this.lru.values()));
        const prj = getCurrentProject();

        broadcast({
            name: "recents",
            srcId: prj?.wid || -1,
            payload: this.recents
        })
    }

    newProject(path: string, time: number) {
        this.lru.set(path, {
            path,
            time
        });
        this.onUpdate();
    }

    get recents() {
        // quick-lru 内部的迭代器是从“最老”到“最新”
        // 用 reverse() 反转，让最新打开的项目排在最前面
        return Array.from(this.lru.values()).reverse();
    }

    removeProject(projectPath: string) {
        this.lru.delete(projectPath);
        this.onUpdate();
    }

    /**
     * 获取整个配置对象
     * 内部会自动融合 schema 中定义的所有最新默认值
     */
    getAll(): SecondConfig {
        return this.store.store;
    }


    /**
     * 通用获取配置项方法
     * 传入的 key 必须是 AppConfig 的键，返回值会自动推导为该键对应的类型
     */
    get<K extends keyof SecondConfig>(key: K): SecondConfig[K] {
        return this.store.get(key);
    }

    /**
     * 通用设置配置项方法
     * 传入的 key 必须是 AppConfig 的键，value 的类型会被严格约束为该键对应的类型
     * 不进行内部异常捕获，若 schema 校验失败，异常将直接向上抛出由外部处理
     */
    set<K extends keyof SecondConfig>(key: K, value: SecondConfig[K]): void {
        this.store.set(key, value);
    }
}

let sc: ConfigService;

/**
 * 获取 ConfigService 单例实例
 */
export const secondConfig = (): ConfigService => {
    if (!sc) {
        sc = new ConfigService(
            new Store<SecondConfig>({
                schema: secondSchema,
                name: 'second',
            })
        );
    }
    return sc;
};
