import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import Icons from 'unplugin-icons/vite';
import { FileSystemIconLoader } from 'unplugin-icons/loaders';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => ({
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
	}
}));