import { z } from 'zod'
import { os } from "@orpc/server";

let inc = 1;
export const test = os
    .input(
        z.string(),
    )
    .handler(async ({ input }) => {
        // your list code here
        return `hello ${input} ${inc++}`
    })