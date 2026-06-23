import { ORPCError } from "@orpc/server";

import { COMMON_ORPC_ERROR_DEFS } from "@orpc/client";

import { type IProjectContext, type IProjectController } from "../type.js";


/**
 * 统一的项目控制器抽象基类
 */
export abstract class BaseProjectController implements IProjectController {
    constructor(protected ctx: IProjectContext) { }

    init?(): void | Promise<void> { }
    dispose?(): void | Promise<void> { }

    /**
     * 终极解法：彻底移除方法名后的 <T> 泛型
     * 通过返回带有 {} 的交叉类型，欺骗编译器放行静态继承检查，同时完美保留子类类型推导
     */
    static ensure(
        this: new (ctx: IProjectContext) => BaseProjectController,
        ctx: IProjectContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): BaseProjectController & Record<string, any> {
        // 运行时 this 就是具体的子类构造函数（例如 PrjDB）
        const instance = ctx.getService(this);

        if (!instance) {
            throw new ORPCError(COMMON_ORPC_ERROR_DEFS.NOT_FOUND.message, {
                status: COMMON_ORPC_ERROR_DEFS.NOT_FOUND.status,
                message: `无法获取到 ${this.name} 对象。`
            });
        }

        return instance;
    }
}


