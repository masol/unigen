import type { Provider } from '$types/index.js';
import type { ImageModelV4 } from '@ai-sdk/provider';
import { createProvider } from './provider.js';


//provider: $llama-cpp： node-llama-cpp: 以$开头的Provider为内建Provider.
export function createImageModel(provider: Provider, modelId: string): ImageModelV4 {
    const pvInst = createProvider(provider);
    return pvInst.imageModel(modelId);
}
