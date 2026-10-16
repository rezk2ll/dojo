import { self } from '$app/service-worker';
import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';
import { asset, resolve } from '$app/paths';

// Sites under one origin (user.github.io/a, /b) share Cache Storage, so names carry this site's scope.
const PREFIX = `${self.registration.scope}#`;
const CACHE = `${PREFIX}${version}`;
/** @param {string} key */
const stale = (key) => key.startsWith(PREFIX) && key !== CACHE;

// Hashed files never change, so they are served from the cache. Pages change on every deploy,
// so they go to the network first and fall back to the cache offline.
const ASSETS = new Set([
	// French and English both fit the latin subset (accents, œ, « », ’): the other Inter subsets are fetched only if a page ever needs them.
	...immutable.filter((f) => !f.path.includes('/inter-') || f.path.includes('/inter-latin-wght')).map((f) => asset(/** @type {import('$app/types').AssetPath} */ (f.path))),
	// Static hosts often refuse dotfiles like .nojekyll, and one 404 fails the whole install.
	...assets.filter((f) => !f.path.startsWith('.')).map((f) => asset(f.path))
]);
const PAGES = prerendered.map((f) => resolve(f.path));

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll([...ASSETS, ...PAGES.map((page) => new Request(page, { cache: 'no-cache' }))]))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter(stale).map((key) => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	if (url.origin !== location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			if (ASSETS.has(url.pathname)) {
				const cached = await cache.match(url.pathname);
				if (cached) return cached;
			}
			try {
				// no-cache revalidates with the server: the HTTP cache may still hold the last deploy's page.
				const response = await fetch(event.request, { cache: 'no-cache' });
				// A cached redirect would be refused when replayed for a navigation.
				if (response.ok && !response.redirected) await cache.put(event.request, response.clone());
				return response;
			} catch (error) {
				const cached = await cache.match(event.request);
				if (cached) return cached;
				throw error;
			}
		})()
	);
});
