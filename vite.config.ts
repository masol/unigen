import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import Icons from 'unplugin-icons/vite';
import { FileSystemIconLoader } from 'unplugin-icons/loaders';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
	plugins: [
		sveltekit(),
		tailwindcss(),
		Icons({
			compiler: 'svelte',
			autoInstall: true,
			customCollections: {
				'fs-icons': FileSystemIconLoader('./assets/icons', (svg) =>
					svg.replace(/^<svg /, '<svg fill="currentColor" ')
				)
			}
		}),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		}),
		// 条件插件：只在 ANALYZE 存在时加入
		...(process.env.ANALYZE ? [visualizer({
			open: true,
			filename: 'stats.html',
			gzipSize: true,
			brotliSize: true
		})] : [])
	],

	resolve: {
		alias: {
			// 使用空模块路径来禁用 Node.js 模块
			fs: 'node:fs',
			path: 'node:path',
			crypto: 'node:crypto',
			stream: 'node:stream',
			util: 'node:util',
			buffer: 'node:buffer'
			// 注意：ejs 不是 Node.js 内置模块，如果不需要直接在 external 中排除
		}
	},

	optimizeDeps: {
		exclude: [
			'$lib/paraglide/runtime.js',
			'$lib/paraglide/messages.js',
			// 排除 LangChain 避免预构建错误
		],
		esbuildOptions: {
			define: {
				global: 'globalThis'
			}
		}
	},

	build: {
		emptyOutDir: true,
		target: 'es2021',
		minify: 'esbuild',
		chunkSizeWarningLimit: 1000,

		rollupOptions: {
			output: {
				// 使用对象形式更可靠
				manualChunks(id) {
					// 只在客户端构建时进行代码分割
					// SSR 构建会将这些包标记为 external
					if (id.includes('node_modules')) {
						// LangChain 包
						if (id.includes('@langchain/core')) return 'langchain-core';
						if (id.includes('@langchain/openai')) return 'langchain-openai';
						if (id.includes('@langchain/anthropic')) return 'langchain-anthropic';

						// Zag.js 包
						if (id.includes('@zag-js/')) return 'zag-ui';
					}
				}
			}
		},

		sourcemap: false,
		cssMinify: 'esbuild'
	}
});