import { PrjDB } from "./controllers/drizzle.js";
import { IProjectContext } from "./type.js";



export function registProjectBuildin(container: IProjectContext) {
    container.register(PrjDB);
}