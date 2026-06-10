import type { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';
import log from 'electron-log/main';

class LoggerModule implements AppModule {
  enable({ app }: ModuleContext): void {
    log.initialize();
    log.info('Logger initialized in the main process');

    app.on('ready', () => {
      log.info('Electron app is ready');
    });
  }
}

export function loggerModule(...args: ConstructorParameters<typeof LoggerModule>) {
  return new LoggerModule(...args);
}
