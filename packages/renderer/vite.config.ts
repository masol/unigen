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
    chunkSizeWarningLimit: 1024, // Electron 场景的安全阈值
    rollupOptions: {
      external: ['@app/main'],
      output: {
        manualChunks(id) {
          // 1. 从vite-bundle-visualizer分析图里看到的大块依赖，逐个拆分
          if (id.includes('bits-ui/dist')) return 'bits-ui';
          if (id.includes('svelte/src')) return 'svelte-core';
          if (id.includes('svelte-motion/src')) return 'svelte-motion';
          if (id.includes('@tabler/icons-svelte')) return 'tabler-icons';
          if (id.includes('@floating-ui')) return 'floating-ui';
          if (id.includes('@orpc')) return 'orpc';
          if (id.includes('paneforge')) return 'paneforge';
          if (id.includes('svelte-sonner')) return 'svelte-sonner';
          if (id.includes('runed/dist')) return 'runed';
          if (id.includes('formkit/auto-animate')) return 'formkit-auto-animate';
          if (id.includes('electron-log')) return 'electron-log';
          if (id.includes('popmotion')) return 'popmotion';
          if (id.includes('tailwind-variants')) return 'tailwind-variants';
          if (id.includes('tailwind-merge')) return 'tailwind-merge';
          if (id.includes('tabbable')) return 'tabbable';

          // 2. 其他所有 node_modules 打包到 vendor
          if (id.includes('node_modules')) {
            return 'vendor';
          }

          // 3. 业务代码留在主包 index-xxx.js
        }
      }
    },
  },
})