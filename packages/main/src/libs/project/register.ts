import { PrjDB } from "./controllers/drizzle.js";
import { LanceDB } from "./controllers/lance.js";
import { IProjectContext } from "./type.js";



export function registProjectBuildin(container: IProjectContext) {
    container.register(PrjDB);
    container.register(LanceDB);
}