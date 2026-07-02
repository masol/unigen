import type { ElectronApplication, PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs, PlaywrightWorkerOptions, TestType } from "@playwright/test";

export type TestFixtures = {
    electronApp: ElectronApplication;
    electronVersions: NodeJS.ProcessVersions;
};

export type UnigenTestType = TestType<PlaywrightTestArgs & PlaywrightTestOptions & TestFixtures, PlaywrightWorkerArgs & PlaywrightWorkerOptions>