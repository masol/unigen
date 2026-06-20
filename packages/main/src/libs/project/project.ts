// 轻量DI容器，未使用轻量DI框架(如awilix)，因为其还是太重，本DI不涉及外部扩展代码的问题。

import { NotifyContract } from "$types/index.js";
import Logger from "electron-log/main.js";
import { PrjDB } from "./controllers/drizzle.js";
import type { IProjectController, IProjectContext, ControllerConstructor } from "./type.js";

export class ProjectContainer implements IProjectContext {
    #path = "";
    #wid = -1;
    #prjId = -1; // used for ProjectMananger(not for controller).

    // 在构造容器时初始化全部IProjectController(某个具体的剖面)
    constructor(wid: number, prjId: number) {
        this.#wid = wid;
        this.register(PrjDB);
        this.#prjId = prjId;
    }

    async init(projectPath: string): Promise<void> {
        this.#path = projectPath;
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


    notify(evtName: string, evt: NotifyContract): void {
        void evtName;
        void evt;
    }

    // 1. 严格限制 Map 的键只能是符合约束的构造函数，值是对应的实例
    private registry = new Map<ControllerConstructor, IProjectController>();

    /**
     * 注册控制器类
     */
    private register<T extends IProjectController>(token: ControllerConstructor<T>): void {
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


    async open(path: string): Promise<boolean> {
        Logger.debug(`[Project] open ${path}`)
        return true;
    }
}