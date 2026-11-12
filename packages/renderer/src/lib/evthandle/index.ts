import { setupClarify } from "./clarify";
import { setupToaster } from "./toaster";


export async function setup() {
    setupClarify();
    setupToaster();
}