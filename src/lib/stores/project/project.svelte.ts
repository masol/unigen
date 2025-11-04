import { appDB } from "$lib/utils/appdb";
import { softinfo } from "$lib/utils/softinfo";
import { isEmpty } from "remeda";
import { repositoryStore, type Repository } from "../config/ipc/repository.svelte";
import { invoke } from "@tauri-apps/api/core";
import { join } from '@tauri-apps/api/path';
import { /*exists,*/ exists, mkdir, readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import JSON5 from 'json5';
import { ask } from '@tauri-apps/plugin-dialog';
import { t } from '$lib/stores/config/ipc/i18n.svelte';
import { logger } from "$lib/utils/logger";
import pMap from "p-map";
import { CfgDB } from "$lib/utils/appdb/cfgdb";
import { mqttInstance } from "$lib/utils/appdb/mqtt";


const KEYNAME = "recent";
const METADIR = "ugmeta";
const GITDATADIR = "gitdata";

export type RepoLoadResult = { success: boolean, error?: string }
export class ProjectStore {
    currentId = $state('');

    private prjdb: CfgDB | null = null;

    // Derived
    get currentRepository() {
        return repositoryStore.repositories.find(r => r.id === this.currentId);
    }

    async init() {
        // @todo: 未响应repo.removed/repo.reset．响应了也只是一致性检查，不通过也只能给出内部错误提示(一致性检查如何处理)

        let sucOpend = false;
        // 首先检查是否有命令行请求打开/新建．
        if (softinfo.prjarg) {
            sucOpend = (await this.loadPath(softinfo.prjarg)).success;
        }

        // console.log("repositoryStore.openedRepo=", repositoryStore.openedRepos())
        if (!sucOpend) {
            // 打开地一个unigen，读取配置opened project.
            const recent = await appDB.getConfigsByKey(KEYNAME);
            // logger.info("recent=", recent)
            if (recent && recent.length > 0) {
                const repo: Repository = (recent[0].value) as unknown as Repository;
                // logger.info("repo=", repo, recent)
                // 忽略失败信息。
                await this.loadRepository(repo);
            }
        }
    }


    // 打开/新建项目．从path中读取和构建repository,然后调用loadRepository.
    async loadPath(path: string): Promise<RepoLoadResult> {
        const repo = repositoryStore.repositories.find(r => r.path === path)
        if (repo) {
            return this.loadRepository(repo);
        }

        let metaInfo: Repository | null = null;
        let metaFile, unigenDir, gitdata;
        try {
            [metaFile, unigenDir, gitdata] = await Promise.all([
                join(path, METADIR, "meta.json5"),
                join(path, METADIR),
                join(path, GITDATADIR),
            ]);
            const content = await readTextFile(metaFile);

            metaInfo = JSON5.parse(content);
            // logger.info("readed meta content=", content)
        } catch (e) {
            void (e);
            logger.error("error:", e as Error)
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
                return {
                    success: false,
                    error: `无法读取项目${path}的目录内容。`
                };
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
                    return {
                        success: false,
                        error: `目录${path}非空，用户选择不新建。`
                    }
                }
            }

            // 到这里，可以开始创建项目了．也就是创建repository.
            // 首先，计算name.
            const repo: Repository = {
                id: crypto.randomUUID(),
                path,
                name: path.split(softinfo.pathsep).pop()!,
                ver: softinfo.version,
                ctime: Math.floor(Date.now() / 1000)
            }
            logger.info("创建新项目在路径:", path)
            // 开始尝试写入文件


            try {
                await pMap([unigenDir, gitdata], async (dir) => {
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
        if (!metaInfo || isEmpty(metaInfo)) {
            return {
                success: false,
                error: `项目${path}无法创建项目Meta文件。`
            }
        }
        return this.loadRepository(metaInfo);
    }

    // 尝试激活repo--如果repo已经被其它进程打开，则激活此窗口．
    // 如果激活失败－－没被人打开时，则返回false.
    private async focusRepository(repo: Repository): Promise<boolean> {
        return await mqttInstance.emit_focus({ path: repo.path });
    }

    // 只有在本地打开了项目后(currentId等于repo.id)，才会返回true.其它无法打开，包括发送了emit_focus，都会返回false.
    async loadRepository(repo: Repository): Promise<RepoLoadResult> {
        if (repo.id === this.currentId) {
            return {
                success: true
            };
        }

        if (this.currentId) {
            const currentRepo = repositoryStore.find(this.currentId)
            if (currentRepo?.path === repo.path) {
                return {
                    success: true
                }; //请求的路径一致，视同已打开。
            }
        }

        // 尝试锁定指定的path.如果无法锁定，说明其它人打开了.尝试focus.自身返回false.
        const canLock = await invoke("try_lock_project", { path: repo.path });

        if (!canLock) {
            await this.focusRepository(repo);
            // 未打开,返回通知信息。
            return {
                success: false,
                error: `项目${repo.path}已被其它unigen打开。`
            };
        }

        await this.close();
        const locked = await invoke("lock_project", { path: repo.path });
        if (!locked) {
            return {
                success: false,
                error: `无法锁定项目${repo.path}，是否在上次检查到锁定之间，被unigen打开了???`
            };
        }

        // 首先尝试打开或新建DB文件．
        let prjdbPath, gitdata;
        try {
            [prjdbPath, gitdata] = await Promise.all([
                join(repo.path, METADIR, "proj.db"),
                join(repo.path, GITDATADIR),
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


        // 保存最近打开，无需通知其它－－也无需锁定，保存最后打开的即可．
        await appDB.upsertByKey(KEYNAME, JSON.stringify(repo), false);
        // 最后，更新repository配置．
        if (!repositoryStore.isRepositorySame(repo)) {
            await repositoryStore.updateRepository(repo.id, repo);
        }
        this.currentId = repo.id;

        return { success: true };
    }


    private async close() {
        // 打开了项目，因此更新repo的owner为0．
        if (this.currentId) {
            await invoke("unlock_project");
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