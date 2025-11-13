import { logger } from "../logger";
import { CogmindDb } from "../vocab/cogmind";
import { CfgDB } from "./cfgdb";
import { ReteDb } from "./rete";


export class ProjectBase {
    private prjdb: CfgDB | null = null;
    #vocab: CogmindDb;
    #rete: ReteDb;
    public prjPath: string = "";

    constructor() {
        this.#vocab = new CogmindDb();
        this.#rete = new ReteDb();
    }

    get vocabdb() {
        return this.#vocab
    }

    get cfgdb() {
        return this.prjdb
    }

    get retedb() {
        return this.#rete;
    }


    public async reinitdb(path: string, bInitSchema = false) {
        if (this.prjdb) {// 未正确关闭??
            logger.error(`检测到打开项目${path}时,未关闭历史数据库,哪里一致性冲突了?`)
        }
        this.prjdb = new CfgDB();
        await this.prjdb.init(path, bInitSchema);
        // 开始设置并重新初始化其它数据库表格．
        await this.#vocab.resetDb(this.prjdb.handle);
        await this.#rete.resetDb(this.prjdb.handle);
    }

    public async close() {
        // 其它数据库Model依赖prjdb,无需关闭，直接设置为null即可．
        await this.#vocab.resetDb(null);
        await this.#rete.resetDb(null);
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