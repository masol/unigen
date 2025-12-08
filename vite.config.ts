import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import Icons from 'unplugin-icons/vite';
import { FileSystemIconLoader } from 'unplugin-icons/loaders';
import { visualizer } from 'rollup-plugin-visualizer';
import { readFileSync } from 'node:fs';

// 自定义插件：将 .md 和 .txt 文件作为字符串导入
function rawTextPlugin() {
	return {
		name: 'vite-plugin-raw-text',
		transform(code: string, id: string) {
			if (id.endsWith('.md') || id.endsWith('.txt')) {
				const content = readFileSync(id, 'utf-8');
				return {
					code: `export default ${JSON.stringify(content)}`,
					map: null
				};
			}
		}
	};
}

export default defineConfig(({ mode }) => ({
	plugins: [
		rawTextPlugin(), // 添加自定义插件,导入.txt及.md文件－－纯字符串内容．
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
		...(process.env.ANALYZE ? [visualizer({
			open: true,
			filename: 'stats.html',
			gzipSize: true,
			brotliSize: true
		})] : [])
	],

	define: {
		'process.env': {}
	},

	optimizeDeps: {
		exclude: [
			'$lib/paraglide/runtime.js',
			'$lib/paraglide/messages.js',
			'@vinejs/vine'
		],
		esbuildOptions: {
			define: {
				global: 'globalThis'
			}
		}
	},

	esbuild: {
		drop: mode === 'production' ? ['console', 'debugger'] : [],
	},

	build: {
		emptyOutDir: true,
		target: 'es2021',
		minify: 'esbuild',
		chunkSizeWarningLimit: 1000,

		rollupOptions: {
			external: ['@vinejs/vine'],
			output: {}
		},

		sourcemap: false,
		cssMinify: 'esbuild'
	},
	css: {
		preprocessorOptions: {
			scss: {
				// 静默特定的弃用警告
				silenceDeprecations: ['import', 'global-builtin', 'color-functions']
			}
		}
	}
}));