import { logger } from "../logger";
import { CfgDB } from "./cfgdb";


export class ProjectBase {
    private prjdb: CfgDB | null = null;

    public prjPath: string = "";
    get dbhandle() {
        return this.prjdb?.handle
    }
    get cfgdb() {
        return this.prjdb
    }


    public async reinitdb(path: string, bInitSchema = false) {
        if (this.prjdb) {// 未正确关闭??
            logger.error(`检测到打开项目${path}时,未关闭历史数据库,哪里一致性冲突了?`)
        }
        this.prjdb = new CfgDB();
        await this.prjdb.init(path, bInitSchema);
    }

    public async close() {
        // 其它数据库Model依赖prjdb,无需关闭，直接设置为null即可．
        // .... = null;
        // 最后，关闭prjdb.
        if (this.prjdb) {
            await this.prjdb.close();
            this.prjdb = null;
        }
        this.prjPath = "";
    }
}

export const projectBase = new ProjectBase();