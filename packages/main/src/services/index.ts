import { test } from "./test.js";
import { os } from "@orpc/server";

export const appRouter = os.router({
    test: {
        test: test,
    },
});

export type AppRouter = typeof appRouter
