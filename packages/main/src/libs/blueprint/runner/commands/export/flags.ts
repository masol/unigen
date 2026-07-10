import { CommandInfo } from '$types/blueprint/context.js';
import type { ExportFlags } from './types.js';

export function parseFlags(cmd: CommandInfo): ExportFlags {
    const args = cmd.args ?? {};
    return {
        noEntry: Boolean(args['noentry']),
        noRes: Boolean(args['nores']),
        noCap: Boolean(args['nocap']),
        noMetag: Boolean(args['nometag']),
    };
}