import { z } from 'zod'
import { os } from "@orpc/server";
import { BrowserWindow } from 'electron';
// import Logger from 'electron-log';

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
        // Logger.debug("win=",win,input)
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
            return true;
        }
        return false;
    })

export default {
    max,
    show
}