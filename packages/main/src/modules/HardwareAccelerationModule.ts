import { configService } from '$libs/store/index.js';
import Logger from 'electron-log/main';
import { AppModule } from '../AppModule.js';
import { ModuleContext } from '../types/ModuleContext.js';

export class HardwareAccelerationModule implements AppModule {
  enable({ app }: ModuleContext): Promise<void> | void {
    if (configService().get("disableHA")) {
      Logger.info("按照配置，禁用硬件加速。")
      app.disableHardwareAcceleration();
    }
  }
}

export function hardwareAccelerationMode(...args: ConstructorParameters<typeof HardwareAccelerationModule>) {
  return new HardwareAccelerationModule(...args);
}
