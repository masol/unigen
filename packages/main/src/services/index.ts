import { test } from "./test.js";
import { os } from "@orpc/server";
import win from './window.js'

export const appRouter = os.router({
    test: {
        test: test,
    },
    win
});

export type AppRouter = typeof appRouter
