
/**
 * 定义项目上下文的公共接口（契约）
 * 子控制器只认识这个接口，不认识具体的 ProjectContext 类
 */
export interface IProjectContext {
    readonly path: string;
    readonly wid: number;
    // 获取项目目录--partName为项目路径下，metadir下的路径，返回拼接后的路径。
    getPath(partName: string | string[]): string;
    notify(evtName: string, payload: unknown, srcId?: number): boolean
    register<T extends IProjectController>(token: ControllerConstructor<T>): void;
    // 允许子控制器之间通过接口互相获取同级服务
    getService<T extends IProjectController>(token: ControllerConstructor<T>): T | null;
}

/**
 * 子控制器的统一生命周期接口
 */
export interface IProjectController {
    // 在项目打开/创建之后，依次调用初始化。
    init?(): void | Promise<void>; // 进入init时,ProjectPath必定有效，构造函数时可能无效。
    dispose?(): void | Promise<void>;
}


// 实现类：严格的构造函数约束
// 约束 1：必须接收且仅接收一个 IProjectContext 参数
// 约束 2：其实例必须实现 IProjectController 接口
export type ControllerConstructor<T extends IProjectController = IProjectController> =
    new (context: IProjectContext) => T;

    
export interface EmbedKVStore {
    get<T>(key: string): T | undefined | null;
    set(key: string, value: unknown): void;
}

export const metaDirName = 'meta'