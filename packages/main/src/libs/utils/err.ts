import { ORPCError } from "@orpc/server";
import { COMMON_ORPC_ERROR_DEFS } from "@orpc/client";

export const UNIGEN_ERROR_DEFS = {
    USER_CANCEL: {
        status: 601,
        message: "User Canceled",
    },
} as const; // as const 锁定只读字面量，和你原来 declare 类型一致



export function throwNotfound(message: string): never {
    throw new ORPCError(COMMON_ORPC_ERROR_DEFS.NOT_FOUND.message, {
        status: COMMON_ORPC_ERROR_DEFS.NOT_FOUND.status,
        message
    })
}