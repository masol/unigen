import { AgentDirName, MetaDirname } from "$libs/const.js";
import {
    createPacFile,
    createPacFolder,
    deletePacNode,
    listPacTree,
    readPacFile,
    renamePacNode,
    savePacFile,
} from "$libs/loader/pac/index.js";
import { IProjectContext } from "$libs/project/type.js";
import {
    pacFileDocumentSchema,
    pacNodeSchema,
} from "$types/shared/api/pac.js";
import { os } from "@orpc/server";
import { z } from "zod";
import { RpcContext } from "../type.js";

function getPacRoot(project: IProjectContext): string {
    const root = project.getPath([MetaDirname, AgentDirName]);

    // Logger.debug("project pac root:", root)

    if (!root || root === ".") {
        throw new Error("项目尚未打开，无法访问 PAC 目录");
    }

    return root;
}

const listPacTreeRes = os.output(pacNodeSchema).handler(async ({ context }) => {
    const ctx = context as RpcContext;
    const ret = await listPacTree(getPacRoot(ctx.project));
    // Logger.debug("listPacTreeRes return", ret);
    return ret;
});

const reCompileRes = os.output(pacNodeSchema).handler(async ({ context }) => {
    const ctx = context as RpcContext;
    await ctx.project.reloadAgent(true);
    return listPacTree(getPacRoot(ctx.project));
});

const readPacFileRes = os
    .input(z.object({ path: z.string() }))
    .output(pacFileDocumentSchema)
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        return readPacFile(getPacRoot(ctx.project), input.path);
    });

const savePacFileRes = os
    .input(
        z.object({
            path: z.string(),
            meta: z.record(z.string(), z.unknown()),
            content: z.string(),
        }),
    )
    .output(pacFileDocumentSchema)
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        return savePacFile(
            getPacRoot(ctx.project),
            input.path,
            input.meta,
            input.content,
        );
    });

const createPacFileRes = os
    .input(
        z.object({
            parentPath: z.string(),
            name: z.string(),
        }),
    )
    .output(pacNodeSchema)
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;

        return createPacFile(
            getPacRoot(ctx.project),
            input.parentPath,
            input.name,
        );
    });

const createPacFolderRes = os
    .input(
        z.object({
            parentPath: z.string(),
            name: z.string(),
        }),
    )
    .output(pacNodeSchema)
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;

        return createPacFolder(
            getPacRoot(ctx.project),
            input.parentPath,
            input.name,
        );
    });

const renamePacNodeRes = os
    .input(
        z.object({
            path: z.string(),
            newName: z.string(),
        }),
    )
    .output(
        z.object({
            oldPath: z.string(),
            newPath: z.string(),
        }),
    )
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;

        return renamePacNode(getPacRoot(ctx.project), input.path, input.newName);
    });

const deletePacNodeRes = os
    .input(z.object({ path: z.string() }))
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        await deletePacNode(getPacRoot(ctx.project), input.path);
    });

export default {
    listPacTree: listPacTreeRes,
    reCompile: reCompileRes,
    readPacFile: readPacFileRes,
    savePacFile: savePacFileRes,
    createPacFile: createPacFileRes,
    createPacFolder: createPacFolderRes,
    renamePacNode: renamePacNodeRes,
    deletePacNode: deletePacNodeRes,
};