import { lifecycle } from '$libs/utils/sys/lifecycle.js';
import Logger from 'electron-log/main.js';
import { ProjectContainer } from './project.js'
import pMap from 'p-map'


class ProjectManager {
    private prjId = 0;
    private projects: ProjectContainer[] = [];
    constructor() {
        lifecycle.hooks.beforeQuit.tapPromise('ProjectManager', async () => {
            Logger.debug('[ProjectManager] 正在清理资源...');

            await pMap(
                this.projects,
                (prj) => prj.close(),
                { concurrency: 6 }
            )

            console.log('[ProjectManager] 清理资源完成。');
        });
    }

    getByPath(path: string): ProjectContainer | undefined {
        return this.projects.find(prj => prj.path === path);
    }

    getById(id: number): ProjectContainer | undefined {
        return this.projects.find(prj => prj.prjId === id);
    }

    getByWindow(wid: number): ProjectContainer | undefined {
        return this.projects.find(prj => prj.wid === wid);
    }

    ensureProject(wid: number): ProjectContainer {
        let prj = this.getByWindow(wid);
        if (!prj) {
            prj = new ProjectContainer(wid, ++this.prjId);
            this.projects.push(prj);
        }
        return prj
    }


    // createProject(path:string,wid:number):number{

    // }

    // 返回大于0的值，表示创建成功。否则是错误值。
    // reloadProject(path: string, wid: number): number {
    //     const old = this.getByPath(path);
    //     const old2 = this.getByWindow(wid)
    //     if (old || old2) {
    //         return -1;
    //     }

    //     return this.prjId;
    // }
}


export const projectManager = new ProjectManager();