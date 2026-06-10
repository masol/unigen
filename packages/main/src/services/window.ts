import { z } from 'zod'
import { os } from "@orpc/server";
import { BrowserWindow } from 'electron';

const max = os
    .input(
        z.number(),
    )
    .output(
        z.boolean()
    )
    .handler(({ input }): boolean => {
        // your list code here
        const win = BrowserWindow.fromId(input);
        if (win) {
            win.maximize();
        }

        return false
    })

    const show = os
    .input(
        z.number(),
    )
    .output(
        z.boolean()
    )
    .handler(({ input }): boolean => {
        // your list code here
        const win = BrowserWindow.fromId(input);
        if (win) {
            win.maximize();
        }

        return false
    })

export default {
    max
}