import type { Provider } from '$types/index.js';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { createProvider } from './provider.js';


//provider: $llama-cpp： node-llama-cpp: 以$开头的Provider为内建Provider.
export function createModel(provider: Provider, modelId: string): LanguageModelV4 {
    const pvInst = createProvider(provider);
    return pvInst.languageModel(modelId);
}
