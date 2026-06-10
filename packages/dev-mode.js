import {build, createServer} from 'vite';
import path from 'path';

/**
 * This script is designed to run multiple packages of your application in a special development mode.
 * To do this, you need to follow a few steps:
 */


/**
 * 1. We create a few flags to let everyone know that we are in development mode.
 */
const mode = 'development';
process.env.NODE_ENV = mode;
process.env.MODE = mode;


/**
 * 2. We create a development server for the renderer. It is assumed that the renderer exists and is located in the “renderer” package.
 * This server should be started first because other packages depend on its settings.
 */
/**
 * @type {import('vite').ViteDevServer}
 */
const rendererWatchServer = await createServer({
  mode,
  root: path.resolve('packages/renderer'),
});

const server = await rendererWatchServer.listen();
const resolvedAddress = rendererWatchServer.httpServer?.address();
const host = resolvedAddress?.address || 'localhost';
const port = resolvedAddress?.port || 5173;
const serverUrl = `http://${host}:${port}`;
process.env.VITE_DEV_SERVER_URL = serverUrl;

console.log(`Renderer dev server listening at: ${serverUrl}`);

/**
 * Wait for the server to be ready by checking if it responds.
 */
let isServerReady = false;
let attempts = 0;
const maxAttempts = 30; // Max 30 attempts (15 seconds with 500ms intervals)

while (!isServerReady && attempts < maxAttempts) {
  try {
    const response = await fetch(serverUrl);
    if (response.ok || response.status !== 404) {
      isServerReady = true;
      console.log('Renderer dev server is ready');
    }
  } catch (e) {
    // Server not ready yet
  }
  if (!isServerReady) {
    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;
  }
}

if (!isServerReady) {
  console.warn('Dev server did not respond within timeout, proceeding anyway...');
}

/**
 * 3. We are creating a simple provider plugin.
 * Its only purpose is to provide access to the renderer dev-server to all other build processes.
 */
/** @type {import('vite').Plugin} */
const rendererWatchServerProvider = {
  name: '@app/renderer-watch-server-provider',
  api: {
    provideRendererWatchServer() {
      return rendererWatchServer;
    },
  },
};


/**
 * 4. Start building all other packages.
 * For each of them, we add a plugin provider so that each package can implement its own hot update mechanism.
 */

/** @type {string[]} */
const packagesToStart = [
  'packages/preload',
  'packages/main',
];

for (const pkg of packagesToStart) {
  await build({
    mode,
    root: path.resolve(pkg),
    plugins: [
      rendererWatchServerProvider,
    ],
  });
}
