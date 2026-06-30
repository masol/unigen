import { PrjDB } from "./controllers/drizzle/index.js";
import { LanceDB } from "./controllers/lance/index.js";
import { PrjRunner } from "./controllers/runner.js";
import { IProjectContext } from "./type.js";



export function registProjectBuildin(container: IProjectContext) {
    container.register(PrjDB);
    container.register(LanceDB);
    container.register(PrjRunner);
}