import { appDB } from "$lib/utils/appdb";
import { softinfo } from "$lib/utils/softinfo";
import { isEmpty } from "remeda";
import { repositoryStore, Item2Repo, type Repository } from "../config/ipc/repository.svelte";
import { invoke } from "@tauri-apps/api/core";
import { join } from '@tauri-apps/api/path';
import { /*exists,*/ exists, mkdir, readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import JSON5 from 'json5';
import { ask } from '@tauri-apps/plugin-dialog';
import { t } from '$lib/stores/config/ipc/i18n.svelte';
import { logger } from "$lib/utils/logger";
import pMap from "p-map";
import { CfgDB } from "$lib/utils/appdb/cfgdb";


const KEYNAME = "recent";

export class ProjectStore {
    currentId = $state('');

    private prjdb: CfgDB | null = null;

    // Derived
    get currentRepository() {
        return repositoryStore.repositories.find(r => r.id === this.currentId);
    }

    // Actions,被loadRepository调用．
    private setCurrentRepository(id: string) {
        this.currentId = id;
    }

    async init() {
        // @todo: 未响应repo.removed/repo.reset．响应了也只是一致性检查，不通过也只能给出内部错误提示(一致性检查如何处理)

        let sucOpend = false;
        // 首先检查是否有命令行请求打开/新建．
        if (softinfo.prjarg) {
            sucOpend = await this.loadPath(softinfo.prjarg);
        }

        if (!sucOpend && repositoryStore.openedRepos() === 0) {
            // 首次打开，读取配置opened project.
            const recent = await appDB.getConfigsByKey(KEYNAME);
            if (recent && recent.length > 0) {
                sucOpend = await this.loadRepository(Item2Repo(recent[0]));
            }
        }
    }


    // 打开/新建项目．从path中读取和构建repository,然后调用loadRepository.
    async loadPath(path: string): Promise<boolean> {
        const repo = repositoryStore.repositories.find(r => r.path === path)
        if (repo) {
            return this.loadRepository(repo);
        }

        let metaInfo: Repository | null = null;
        let metaFile, vlogiDir, gitdata;
        try {
            [metaFile, vlogiDir, gitdata] = await Promise.all([
                join(path, "vlogi", "meta.json5"),
                join(path, "vlogi"),
                join(path, "gitdata"),
            ]);
            const content = await readTextFile(metaFile);

            metaInfo = JSON5.parse(content);
            logger.info("readed meta content=", content)
        } catch (e) {
            void (e);
            // logger.error("error:", e as Error)
        }

        if (!metaInfo || isEmpty(metaInfo)) {
            // meta文件不存在．
            // 检查目录是否为空．
            let entries
            try {
                entries = await readDir(path);
            } catch (e) {
                logger.error("无法读取路径", path, "错误内容", e as Error)
            }

            if (!entries) {
                return false;
            }

            if (entries.filter(item => item.name !== '.').length > 0) {
                //给定目录非空．
                const message = t('agent_clear_termite_slide', { path });
                const title = t('large_odd_mink_tear');

                const answer = await ask(message, {
                    title,
                    kind: 'warning',
                });

                if (!answer) {
                    return false;
                }
            }

            // 到这里，可以开始创建项目了．也就是创建repository.
            // 首先，计算name.
            const repo: Repository = {
                id: crypto.randomUUID(),
                path,
                name: path.split(softinfo.pathsep).pop()!,
                owner: 0,
                ver: softinfo.version,
                ctime: Math.floor(Date.now() / 1000)
            }
            // 开始尝试写入文件


            try {
                await pMap([vlogiDir, gitdata], async (dir) => {
                    try {
                        // 省掉了exists调用．
                        await mkdir(dir!, { recursive: true })
                    } catch (e) {
                        logger.error(`创建目录${dir}时发生错误：`, e as Error)
                        void (e);
                    }
                })
                await writeTextFile(metaFile!, JSON.stringify(repo))
                metaInfo = repo;
            } catch (e) {
                logger.error('无法写入meta文件', metaFile, "meta内容", repo as unknown as Record<string, unknown>, "错误内容", e as Error);
            }
        }
        if (!metaInfo || isEmpty(metaInfo)) return false;

        return this.loadRepository(metaInfo);
    }

    // 尝试激活repo--如果repo已经被其它进程打开，则激活此窗口．
    // 如果激活失败－－没被人打开时，则返回false.
    private async focusRepository(repo: Repository): Promise<boolean> {
        if (repo.owner === 0)
            return false;
        return await invoke("emit_focus", { pid: repo.owner });
    }

    // 只有在本地打开了项目后(currentId等于repo.id)，才会返回true.其它无法打开，包括发送了emit_focus，都会返回false.
    async loadRepository(repo: Repository): Promise<boolean> {
        if (repo.id === this.currentId) {
            return true;
        }

        if (await this.focusRepository(repo)) {
            return false; // 被其它窗口打开了，返回false.
        }

        await this.close();

        // 首先尝试打开或新建DB文件．
        let prjdbPath, gitdata;
        try {
            [prjdbPath, gitdata] = await Promise.all([
                join(repo.path, "vlogi", "proj.db"),
                join(repo.path, "gitdata"),
            ]);
            await Promise.all([
                (async () => {
                    const dbExist = await exists(prjdbPath);
                    const projdb = new CfgDB();
                    // 项目数据库不存在，开始初始化之．
                    await projdb.init(`sqlite:${prjdbPath}`, !dbExist);
                })(),
                (async () => {
                    const gitOk = await invoke("ensure_git", { path: gitdata });
                    if (!gitOk) {
                        const msg = '无法创建项目的git数据'
                        logger.error(msg)
                        throw new Error(msg)
                    }
                })(),
            ])
        } catch (e) {
            void (e);
            logger.error("loadRepository dir error:", e as Error)
        }

        /*
        // 主动通知(project依赖其它项)其它组件开始更新数据和状态．
        */


        // 最后，更新repository配置．
        await repositoryStore.updateRepository(repo.id,repo);
        this.currentId = repo.id;

        logger.info("try to load repository!!")

        return true;
    }


    private async close() {


        // 打开了项目，因此更新repo的owner为0．
        if (this.currentId) {
            repositoryStore.updateRepository(this.currentId, {
                owner: 0
            })
            this.currentId = "";
        }

        // 其它数据库Model依赖prjdb,无需关闭，直接设置为null即可．
        // .... = null;
        // 最后，关闭prjdb.
        if (this.prjdb) {
            await this.prjdb.close();
            this.prjdb = null;
        }
    }

}


export const projectStore = new ProjectStore();