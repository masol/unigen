import type { RouterClient } from '@orpc/server'
import type { appRouter } from '$services/index.js'

// 自动推导出普通调用接口：client.test('world') => Promise<string>
export type AppClient = RouterClient<typeof appRouter>