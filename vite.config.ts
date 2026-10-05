import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import type { Plugin } from 'vite';

function pwaServiceWorker(): Plugin {
	let serverBuild = false;
	return {
		name: 'visual-r-info-service-worker',
		apply: 'build' as const,
		configResolved(config) {
			serverBuild = config.build.ssr !== false;
		},
		generateBundle(_, bundle) {
			if (serverBuild) return;
			const precache = Object.entries(bundle)
				.filter(([, entry]) => entry.type === 'asset' || entry.type === 'chunk')
				.map(([fileName]) => `/${fileName}`);
			const source = createServiceWorkerSource([
				'/',
				'/manifest.webmanifest',
				'/icon.svg',
				'/robots.txt',
				...precache
			]);
			this.emitFile({ type: 'asset', fileName: 'service-worker.js', source });
		}
	};
}

function createServiceWorkerSource(precache: readonly string[]): string {
	return `const CACHE_NAME = 'visual-r-info-v1';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});
`;
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), pwaServiceWorker()],
	test: {
		expect: { requireAssertions: true },
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
	}
});
