import type { RouterClient } from '@orpc/server'
import type { appRouter } from '$services/index.js'

// 自动推导出普通调用接口：client.test('world') => Promise<string>
export type AppClient = RouterClient<typeof appRouter>


export type NotifyContract = {
    name: string; // 事件id。
    srcId: number; // 导致本事件发生的id，如果是系统事件，则设置为-1.
    payload: unknown;
}