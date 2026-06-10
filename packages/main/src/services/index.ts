import { test } from "./test.js";
import { os } from "@orpc/server";

export const serviceRouter = os.router({
    test: {
        test: test,
    },
});

export type ServiceRouter = typeof serviceRouter;