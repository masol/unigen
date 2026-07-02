/* eslint-disable @typescript-eslint/no-explicit-any */
//测试iotype.

import { expect } from "@playwright/test";
import type { UnigenTestType } from "../type";


export function runMainTest(test: UnigenTestType) {

    test.describe('Electron Main 进程业务逻辑测试', () => {

        test('应该能成功调用 Main 进程的 UserService 创建用户', async ({ electronApp }) => {

            // 👈 核心：evaluate 内部的代码是在 Electron Main 进程（Node环境）中执行的！
            const result = await electronApp.evaluate(async () => {
                // 这里的代码可以安全地调用 Electron 原生 API 或主进程的全局变量
                console.log("global=", global);
                const service = (global as any).intereg;
                console.log("service=", service)
                // const user = await service.get("test");


                return {
                    result: null,
                    global: Object.keys(global),
                    intereg: JSON.stringify((global as any).intereg, null, 2)
                };
            })

            console.log("global=", result.global);
            console.log("intereg=", result.intereg)

            // 在 Playwright 宿主端进行断言
            expect(result.result).toBe(null);
        });
    });

    test('验证主进程的原生应用配置', async ({ electronApp }) => {
        const appPath = await electronApp.evaluate(({ app }) => {
            // 可以直接拿到 Electron 的 app 实例
            return app.getAppPath();
        });
        expect(appPath).toContain('dist');
    });
}
