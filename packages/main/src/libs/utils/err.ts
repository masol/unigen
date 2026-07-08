import { COMMON_ORPC_ERROR_DEFS } from "@orpc/client";
import { ORPCError } from "@orpc/server";

export const UNIGEN_ERROR_DEFS = {
    USER_CANCEL: {
        status: 601,
        message: "User Canceled",
    },
} as const; // as const 锁定只读字面量，和你原来 declare 类型一致



export function throwCancel(message: string): never {
    throw new ORPCError(UNIGEN_ERROR_DEFS.USER_CANCEL.message, {
        status: UNIGEN_ERROR_DEFS.USER_CANCEL.status,
        message
    })
}

export function throwNotfound(message: string): never {
    throw new ORPCError(COMMON_ORPC_ERROR_DEFS.NOT_FOUND.message, {
        status: COMMON_ORPC_ERROR_DEFS.NOT_FOUND.status,
        message
    })
}


export function throwPrecondition(message: string): never {
    throw new ORPCError(COMMON_ORPC_ERROR_DEFS.PRECONDITION_FAILED.message, {
        status: COMMON_ORPC_ERROR_DEFS.PRECONDITION_FAILED.status,
        message
    })
}


export function throwUnprcessable(message: string): never {
    throw new ORPCError(COMMON_ORPC_ERROR_DEFS.UNPROCESSABLE_CONTENT.message, {
        status: COMMON_ORPC_ERROR_DEFS.UNPROCESSABLE_CONTENT.status,
        message
    })
}



export function throwNotimplement(message: string): never {
    throw new ORPCError(COMMON_ORPC_ERROR_DEFS.NOT_IMPLEMENTED.message, {
        status: COMMON_ORPC_ERROR_DEFS.NOT_IMPLEMENTED.status,
        message
    })
}

export function errString(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}