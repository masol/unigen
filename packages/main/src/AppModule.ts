import type {ModuleContext} from './types/ModuleContext.js';

export interface AppModule {
  enable(context: ModuleContext): Promise<void>|void;
}
