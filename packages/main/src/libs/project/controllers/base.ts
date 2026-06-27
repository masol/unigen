import type { ControllerConstructor, IProjectContext, IProjectController } from "../type.js";
import { throwNotfound } from "$libs/utils/err.js";


/**
 * 统一的项目控制器抽象基类
 */
export abstract class BaseProjectController implements IProjectController {
    constructor(protected readonly ctx: IProjectContext) { }

    init?(): void | Promise<void> { }
    dispose?(): void | Promise<void> { }

    /**
     * 底层公共核心逻辑，仅供子类调用
     */
    protected static coreEnsure<T extends BaseProjectController>(
        ctor: ControllerConstructor<T>,
        ctx: IProjectContext
    ): T {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const instance = ctx.getService(ctor as any);

        if (!instance) {
            throwNotfound(`无法获取到 ${ctor.name} 对象。`);
        }

        return instance as T;
    }
}


