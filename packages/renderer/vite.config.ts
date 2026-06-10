import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwind from '@tailwindcss/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, './src/lib'),
    },
  },
  plugins: [
    svelte(),
    tailwind(),
    paraglideVitePlugin({
      project: path.resolve(__dirname, './project.inlang'),
      outdir: path.resolve(__dirname, './src/lib/paraglide'),
    })
  ],
  build: {
    rollupOptions: {
      external: ['@app/main'],
    },
  },
})
