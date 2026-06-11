import { test } from "./test.js";
import { os } from "@orpc/server";
import window from './window.js'

export const appRouter = os.router({
    test: {
        test: test,
    },
    window
});

export type AppRouter = typeof appRouter
