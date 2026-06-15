import { ProjectContainer } from './project.js'


class ProjectManager {
    private prjId = 0;
    private projects: ProjectContainer[] = [];
    constructor() {
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


    // createProject(path:string,wid:number):number{

    // }

    // 返回大于0的值，表示创建成功。否则是错误值。
    openProject(path: string, wid: number): number {
        const old = this.getByPath(path);
        const old2 = this.getByWindow(wid)
        if (old || old2) {
            return -1;
        }

        return this.prjId;
    }
}


export const projectManager = new ProjectManager();