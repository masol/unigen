import { z } from 'zod'
import { implement, os } from "@orpc/server";

// export async function test({ input }: { input: string }) {
//     console.log("enter 123123")
//     return `hello ${input}`
// }

export const test = os
    .input(
        z.string(),
    )
    .handler(async ({ input }) => {
        // your list code here
        console.log("enter 123123",input)
        return `hello ${input}`
    })