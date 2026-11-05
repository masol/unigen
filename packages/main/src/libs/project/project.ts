// 轻量DI容器，未使用轻量DI框架(如awilix)，因为其还是太重，本DI不涉及外部扩展代码的问题。

import { PACFunctor } from "$libs/blueprint/capability/local/index.js";
import type { ICapaFunctor } from "$libs/blueprint/capability/type.js";
import { configService } from "$libs/store/index.js";
import { secondConfig } from "$libs/store/second.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { knowledgeCenter } from "$libs/utils/kc.js";
import { notify } from "$libs/utils/rpcevt.js";
import type { ProjectActivityData } from "$types/index.js";
import { projectActivityDataSchema } from "$types/shared/template/project.js";
import { BrowserWindow } from "electron";
import Logger from "electron-log/main.js";
import { filenamifyPath } from "filenamify";
import fsExtra from 'fs-extra';
import fs from 'node:fs/promises';
import { isAbsolute, join, resolve } from "node:path";
import pMap from "p-map";
import { z } from "zod";
import { closeProject, createProject, openProject } from "./helper/create.js";
import type { IProjectPlugin } from "./plugin.js";
import { registProjectBuildin } from "./register.js";
import { type IProjectContext, type IProjectController, metaDirName, ServiceToken } from "./type.js";

export class ProjectContainer implements IProjectContext {
    // 项目根目录。
    #path = "";
    #type = "";
    #plugin: IProjectPlugin | null = null; // plugin type.
    #wid = -1;
    #prjId = -1; // used for ProjectMananger(not for controller).
    #agent: PACFunctor | null = null;  // 本地Agent,在项目打开或新建时创建，可以随时刷新。

    // 在构造容器时初始化全部IProjectController(某个具体的剖面)
    constructor(wid: number, prjId: number) {
        this.#wid = wid;
        this.#prjId = prjId;
        registProjectBuildin(this);
    }

    notify(evtName: string, payload: unknown, srcId = -1): boolean {
        const win: BrowserWindow | null = BrowserWindow.fromId(this.#wid);

        if (win && !win.isDestroyed()) {
            notify(win, evtName, payload, srcId);
            return true;
        }
        return false;
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
    get type() {
        return this.#type;
    }
    get agent() {
        return this.#agent?.hasAgent ? this.#agent : null;
    }

    async reloadAgent(): Promise<void>  // 重新加载本地Agent.
    {
        if (!this.#agent) {
            this.#agent = new PACFunctor(this.#type, ['pac']);
        }
        return await this.#agent.compile(this);
    }

    getCmd(cmdName: string): ICapaFunctor | null {
        void (cmdName);
        return null;
    }

    async reloadCmd(cmdName?: string): Promise<void> {
        void (cmdName);
    }

    // 1. 严格限制 Map 的键只能是符合约束的构造函数，值是对应的实例
    private registry = new Map<symbol, IProjectController>();

    /**
     * 注册控制器类
     */
    register<T extends IProjectController>(token: ServiceToken<T>): void {
        const instance = new token(this);
        this.registry.set(token.serviceKey, instance);
    }

    getService<T extends IProjectController>(token: ServiceToken<T>): T | null {
        const instance = this.registry.get(token.serviceKey);
        return instance ? (instance as T) : null;
    }

    getPath(partName: string | string[], root = false): string {
        // 保留原有特殊逻辑：直接返回 meta 目录名（忽略 root 参数）
        if (partName === 'meta') {
            return join(this.#path, metaDirName);
        }

        // 统一转为数组，方便后续处理
        const parts = Array.isArray(partName) ? partName : [partName];

        // 关键：将每个片段中的反斜杠替换为正斜杠
        // 正斜杠在 Windows 和 Unix 上均被识别为路径分隔符，避免跨平台不一致
        const normalizedParts = parts.map(p => p.replace(/\\/g, '/'));

        // 根据 root 决定是否包含 meta 子目录
        const base = root ? [] : [metaDirName];

        // 使用 Node.js 的 path.join 拼接并自动规范化（处理 . 和 ..）
        return join(this.#path, ...base, ...normalizedParts);
    }

    /**
     * 将用户输入的路径解析为可用的绝对路径：
     * 1. 相对路径基于 configService().get("task_dir") 解析为绝对路径；
     *    绝对路径保持不变。
     * 2. 使用 filenamifyPath 对最后一段文件名做安全化（去除非法字符），
     *    中间目录段不动，前缀 task_dir 视为受信任路径。
     */
    #resolveAndSanitizePath(inputPath: string): string {
        const trimmed = inputPath?.trim();
        if (!trimmed) {
            throwUnprcessable("任务路径不能为空。");
        }
        const absolute = isAbsolute(trimmed) ? trimmed : resolve(configService().get("task_dir"), trimmed);
        return filenamifyPath(absolute);
    }

    private validatePrjData(file: string, type: unknown): ProjectActivityData {
        const result = projectActivityDataSchema.safeParse(type);
        if (result.success) {
            return type as ProjectActivityData;
        }
        const formattedErrors = z.prettifyError(result.error);
        const msg = `任务UI文件${file}加载失败，详情查看日志。`
        Logger.error(msg, formattedErrors);
        throwUnprcessable(msg)
    }

    async loadUI(): Promise<ProjectActivityData> {
        const uiFile = this.getPath("type.json");
        const uiJSON = await fsExtra.readJSON(uiFile);
        const prjdata = this.validatePrjData(uiFile, uiJSON);
        if (!prjdata.welcome) {
            //加载项目的welcome.
            const welcomeFile = this.getPath("welcome.md");
            try {
                prjdata.welcome = await fs.readFile(welcomeFile, { encoding: "utf-8" });
            } catch {
                void (0);
            }
        }
        return prjdata;
    }

    // 创建失败，返回错误信息。成功返回空字符串。
    async open(path: string): Promise<ProjectActivityData> {
        const resolvedPath = this.#resolveAndSanitizePath(path);
        try {
            await this.close();
            this.#path = resolvedPath;
            const prjdata = await this.loadUI();
            const type = await fs.readFile(this.getPath("type.txt"), "utf-8");
            if (!type) {
                throwUnprcessable(`任务类型文件${this.getPath("type.txt")}不存在或为空。`)
            }
            this.#type = type;

            await openProject(this, prjdata.icon);
            await this.reloadAgent();
            return prjdata
        } catch (e) {
            // 使用解析后的路径，确保与存储时使用的 key 一致
            secondConfig().removeProject(resolvedPath)
            this.#path = "";
            throw e;
        }
    }

    private async assetsFromType(type: string) {
        await pMap(
            ['pac', 'cmds', 'skills'],
            async (subDir) => {
                const srcPath = await knowledgeCenter.getFile(type, subDir);

                if (!srcPath) {
                    return;
                }

                const destPath = this.getPath(subDir);

                // 递归拷贝目录，覆盖已有内容
                await fsExtra.copy(srcPath, destPath, {
                    overwrite: true,
                    errorOnExist: false,
                    recursive: true,
                });
            },
            { concurrency: configService().get("concurrency") },
        );
    }


    async create(path: string, type: string, bForce = false): Promise<ProjectActivityData> {
        const resolvedPath = this.#resolveAndSanitizePath(path);
        try {
            await this.close();
            this.#path = resolvedPath;
            this.#type = type;
            // 提前加载插件，才能注册tapable事件响应点。支持无插件运行。
            // this.#plugin = await pluginManager.load(type, this)
            const typePath = await knowledgeCenter.getFile(type, "type.json");
            if (!typePath) {
                throwUnprcessable(`请求的类型${type}未提供UI界面定义。`)
            }
            const typejson = await fsExtra.readJSON(typePath);
            const prjdata = this.validatePrjData(typePath, typejson);
            await createProject(this, type, prjdata.icon, bForce);
            await Promise.all([
                fsExtra.copyFile(typePath, this.getPath("type.json")),
                fs.writeFile(this.getPath("type.txt"), type),
                this.assetsFromType(type)
            ])
            await this.reloadAgent();
            return prjdata;
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
            this.#type = ""
            this.#agent = null;
            // @todo: 只在容器真正销毁时清
            // this.registry.clear();
        }
    }
}