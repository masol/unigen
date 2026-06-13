// import path from 'path';
// import { fileURLToPath } from 'url';

// const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default ({ mode }) => {
  const isProd = mode !== "development";
  return {
    vitePlugin: {
      inspector: true,
    },
    preprocess: [],
    compilerOptions: {
      preserveComments: !isProd,
      preserveWhitespace: !isProd,
    },
  };
};
