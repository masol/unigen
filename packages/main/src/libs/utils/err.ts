
export const UNIGEN_ERROR_DEFS = {
    USER_CANCEL: {
        status: 601,
        message: "User Canceled",
    },
} as const; // as const 锁定只读字面量，和你原来 declare 类型一致

