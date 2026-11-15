import chat from './chat.js'
import create from "./create.js"
import editor from './editor.js'
import files from "./files.js"
import pac from './pac.js'
import runner from "./runner.js"

export default {
    ...create,
    ...files,
    ...runner,
    ...editor,
    ...chat,
    ...pac
}