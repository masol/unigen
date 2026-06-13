import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwind from '@tailwindcss/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 默认为生产模式，仅在 dev 时为 false
// 可通过 npm run dev 启动开发模式，或设置环境变量 VITE_MODE=dev
const isProd = process.env.VITE_MODE !== 'dev' && process.env.NODE_ENV !== 'development';

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
    // Electron 场景的安全阈值
    chunkSizeWarningLimit: 1024,
    // 小于 4kb 资源转 base64，减少文件数量
    assetsInlineLimit: 4096,
    // Electron 41 最优：不做语法降级，编译最快
    target: 'esnext',
    // 生产关闭 SourceMap，保护源码；开发开启方便调试
    sourcemap: !isProd,
    // 生产强制压缩，开发关闭压缩提升热更新速度
    minify: isProd ? 'esbuild' : false,
    // 构建前清空 dist（避免旧文件残留）
    emptyOutDir: isProd,

    rollupOptions: {
      external: ['@app/main'],
      output: {
        // 文件名添加 hash：文件变化才更新，静态资源强缓存
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',

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
          if (id.includes('awilix')) return 'awilix';
          if (id.includes('systemjs')) return 'systemjs';

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