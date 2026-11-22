import { throwCancel, throwNotfound, throwNotimplement, throwPrecondition, throwUnprocessable } from "$libs/utils/err.js";
import { delay } from "$libs/utils/promise.js";
import { toArraySafe, toStringSafe } from "$libs/utils/str.js";
import { randomUUID } from "node:crypto";
import pMap from "p-map";
import * as radashi from 'radashi';
import validator from 'validator';
import { z } from 'zod';

export const FIXED_PACKAGES = {
    validator,
    util: {
        toStrSafe: toStringSafe,
        toStrArraySafe: toArraySafe,
        randomUUID,
        pMap, // 不再透传ctx的abortSignal,其行为是立即reject,不符合waitFor思路。在baseFunctor的run入口处检查abort信号。
        ...radashi
    },
    err: {
        throwPrecondition,
        throwNotfound,
        throwNotimplement,
        throwUnprocessable,
        throwCancel,
    },
    delay,
    z
} as const