import create from "./create.js"
import editor from './editor.js'
import input from "./input.js"
import runner from "./runner.js"


export default {
    ...create,
    ...input,
    ...runner,
    ...editor
}