import { throwCancel, throwNotfound, throwNotimplement, throwPrecondition, throwUnprcessable } from "$libs/utils/err.js";
import { randomUUID } from "node:crypto";
import pMap from "p-map";
import * as radashi from 'radashi';
import validator from 'validator';

export const FIXED_PACKAGES = {
    validator,
    util: {
        randomUUID,
        pMap, // 不再透传ctx的abortSignal,其行为是立即reject,不符合waitFor思路。再baseFunctor的run入口处检查abort信号。
        ...radashi
    },
    err: {
        throwPrecondition: throwPrecondition,
        throwNotfound: throwNotfound,
        throwNotimplement: throwNotimplement,
        throwUnprcessable: throwUnprcessable,
        throwCancel: throwCancel,
    }
} as const;