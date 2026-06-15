import { os } from "@orpc/server";
import window from './window.js'
import plugin from './plugin.js'

export const appRouter = os.router({
    plugin,
    window
});

export type AppRouter = typeof appRouter
