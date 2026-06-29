// 轻量DI容器，未使用轻量DI框架(如awilix)，因为其还是太重，本DI不涉及外部扩展代码的问题。

import { configService } from "$libs/store/index.js";
import { throwPrecondition } from "$libs/utils/err.js";
import { pluginManager } from "$plugins/manager.js";
import { join } from "node:path";
import { closeProject, createProject, openProject } from "./helper/create.js";
import type { IProjectPlugin } from "./plugin.js";
import { registProjectBuildin } from "./register.js";
import { type IProjectController, type IProjectContext, type ControllerConstructor, metaDirName } from "./type.js";
import { notify } from "$libs/utils/rpcevt.js";
import { BrowserWindow } from "electron";

export class ProjectContainer implements IProjectContext {
    // 项目根目录。
    #path = "";
    #plugin: IProjectPlugin | null = null; // plugin type.
    #wid = -1;
    #prjId = -1; // used for ProjectMananger(not for controller).

    // 在构造容器时初始化全部IProjectController(某个具体的剖面)
    constructor(wid: number, prjId: number) {
        this.#wid = wid;
        this.#prjId = prjId;
        registProjectBuildin(this);
    }

    async init(projectPath: string): Promise<void> {
        this.#path = projectPath;
    }

    notify(evtName: string, payload: unknown, srcId = -1): boolean {
        const win: BrowserWindow | null = BrowserWindow.fromId(this.#wid);

        if (win && !win.isDestroyed()) {
            notify(win, evtName, payload, srcId);
            return true;
        }
        return false;
    }

    get plugin(): IProjectPlugin {
        if (this.#plugin) {
            return this.#plugin;
        }
        throwPrecondition("未加载对应插件")
    }

    get prjId(): number {
        return this.#prjId;
    }
    get path() {
        return this.#path;
    }
    get wid() {
        return this.#wid;
    }

    // 1. 严格限制 Map 的键只能是符合约束的构造函数，值是对应的实例
    private registry = new Map<ControllerConstructor, IProjectController>();

    /**
     * 注册控制器类
     */
    register<T extends IProjectController>(token: ControllerConstructor<T>): void {
        // 2. 自动实例化：利用统一的构造函数契约，在容器内部 new 出来
        const instance = new token(this);
        this.registry.set(token, instance);
    }

    getService<T extends IProjectController>(token: ControllerConstructor<T>): T | null {
        const instance = this.registry.get(token);
        if (!instance) {
            return null;
        }
        // 3. 内部唯一安全的断言，由于 register 和 resolve 泛型 T 严格绑定，此转换 100% 安全
        return instance as T;
    }

    getPath(partName: 'meta' | 'visualref'): string {
        switch (partName) {
            case 'meta':
                return metaDirName;
            case 'visualref':
                return join(this.#path, metaDirName, 'visualref');
        }
    }


    // 创建失败，返回错误信息。成功返回空字符串。
    async open(path: string): Promise<void> {
        try {
            await this.close();
            this.#path = path;
            this.#plugin = await pluginManager.load(configService().get("plugin"), this)
            await openProject(this);
        } catch (e) {
            this.#path = "";
            throw e;
        }
    }

    async create(path: string, bForce = false): Promise<void> {
        try {
            await this.close();
            this.#path = path;
            this.#plugin = await pluginManager.load(configService().get("plugin"), this)
            await createProject(this, bForce);
        } catch (e) {
            this.#path = "";
            throw e;
        }
    }

    async close(): Promise<void> {
        try {
            if (this.#plugin) {
                await this.#plugin.dispose();
                this.#plugin = null;
            }
            await closeProject(this);
        } finally {
            this.#path = ""
        }
    }
}