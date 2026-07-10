import type { IProjectContext } from "./type.js";

export interface IProjectPlugin {
    readonly type: string;
    dispose(): Promise<void>;
    // 在项目打开后调用，以初始化必要知识库。bCreate指示是打开还是新建--此时，数据库等基础设施已经就绪。
    // 需要插入默认capability的id(entry_capablitiy)以及插入必要的capability，并注册必要的runtime(internal capability).
    // 注意： 这里是对象级，不是项目级--虽然每次调用initProject，但是只有Project对象销毁时，才会调用dispose.
    init(prj: IProjectContext, bCreate: boolean): Promise<void>;
}