import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		// Force runes mode for project files. This can be removed after migrating to Svelte 6.
		runes: true
	},
	kit: {
		adapter: adapter({
			fallback: '404.html'
		})
	}
};

export default config;
