const K8S = 'https://github.com/kubernetes/kubernetes/blob/8d9877ea2fe0c69580c5d730bccab6dc16a5c841';
const CACHE = `${K8S}/staging/src/k8s.io/apiserver/pkg/authentication/token/cache/cached_token_authenticator.go`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'caching',
	part: 'Between services',
	title: 'Caching',
	minutes: 10,
	hook: [
		'Yesterday\'s gateway checked JWTs itself, with cached keys. Some tokens are opaque, though: only the identity provider can say if one is valid. Without a cache, the gateway asks it on every request. Each of those checks is a network call, on the path of every click, to a system that every service shares.',
		'You can remember the answer for a few minutes, so a valid token costs one check per few minutes. But the day an admin revokes that token, **the gateway keeps saying yes** until the entry expires.',
		'A cache is a copy of data you do not own (day 17). So for every cache you must say **what makes an entry stale, and who invalidates it**. Phil Karlton: "There are only two hard things in Computer Science: cache invalidation and naming things."'
	],
	terms: [
		{ term: 'Hit / miss', def: 'A hit finds the answer in the cache. A miss pays for the slow call, then usually stores the result.' },
		{ term: 'TTL', def: 'Time to live: how long an entry is trusted before it is thrown away. With a TTL, nobody has to remove the entry, the clock does.' },
		{ term: 'Stale', def: 'The cached answer no longer matches the owner\'s data. Every cache is stale sometimes, so you need to know for how long and what it breaks.' },
		{ term: 'Invalidation', def: 'Removing or refreshing an entry because the source changed. Someone has to know that it changed.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['client["kubectl or a pod"] -->|"Bearer token"| api["kube-apiserver"]', 'api --> tc[("Token cache: HMAC of token to user")]', 'api -->|"only on a miss"| hook["Token webhook"]', 'class hook ext'],
				highlight: ['client', 'api', 'tc', 'hook'],
				note: 'Kubernetes can ask an outside webhook whether a token is valid. The API server keeps each answer **in its own memory**, keyed by a keyed hash of the token. A hit makes no network call.'
			},
			{
				add: ['many["Ten requests, same token"] -->|"all miss at once"| api'],
				highlight: ['many'],
				note: 'The ten misses share one webhook call, through Go\'s `singleflight`. This is called **request coalescing**. Without it, a cold cache sends ten identical calls at the moment the webhook is busiest.'
			},
			{
				add: ['ttl["TTL, default 2 minutes"] -.->|"expires entries"| tc'],
				highlight: ['ttl'],
				note: 'When a token is revoked, no code invalidates its entry. Only the TTL does: `--authentication-token-webhook-cache-ttl`, two minutes by default. For up to those two minutes, **the revoked token still works**.'
			},
			{
				add: ['owner["Rails app: product saved"] -->|"updated_at changes"| key["Cache key: products/233-20140225..."]', 'key -.->|"old key never read again"| store[("Fragment cache")]'],
				highlight: ['owner', 'key', 'store'],
				note: 'In Rails, **the owner invalidates**: the record\'s `updated_at` is part of the cache key. Saving the product changes the key, so the next read misses and rebuilds. Nobody has to delete anything.'
			}
		]
	},
	example: {
		title: 'apiserver/…/token/cache/cached_token_authenticator.go',
		repo: 'kubernetes/kubernetes',
		url: `${CACHE}#L144-L216`,
		lang: 'go',
		code: `func (a *cachedTokenAuthenticator) doAuthenticateToken(ctx context.Context, token string) *cacheRecord {
…
	auds, audsOk := authenticator.AudiencesFrom(ctx)

	key := keyFunc(a.hashPool, auds, token)
	if record, ok := a.cache.get(key); ok {
		// Record cache hit
		doneAuthenticating(true)
		return record
	}
…
	c := a.group.DoChan(key, func() (val interface{}, _ error) {
…
		// Check again for a cached record. We may have raced with a fetch.
		if record, ok := a.cache.get(key); ok {
			return record, nil
		}
…
		record.resp, record.ok, record.err = a.authenticator.AuthenticateToken(ctx, token)
…
		if !a.cacheErrs && record.err != nil {
			return record, nil
		}

		switch {
		case record.ok && a.successTTL > 0:
			a.cache.set(key, record, a.successTTL)
		case !record.ok && a.failureTTL > 0:
			a.cache.set(key, record, a.failureTTL)
		}`,
		notes: [
			'Line 5 builds the key, an [HMAC of the token and its audiences](' + CACHE + '#L231-L254) with a random secret made at startup. Raw tokens are never kept: the comment says it "keeps tokens out of memory". One token sent for two audiences gets two entries.',
			'Line 12 coalesces: `a.group.DoChan(key, ...)` runs one lookup per key, however many requests wait on it. Lines 15 to 17 check the cache again, because another caller may have filled it meanwhile.',
			'Lines 25 to 30 store the answer with a TTL: `successTTL` for a yes, `failureTTL` for a no. A revoked token stays cached until that TTL runs out. For the webhook, [both are set from the same flag](' + K8S + '/pkg/kubeapiserver/authenticator/config.go#L416), two minutes by default.',
			'Lines 21 to 23 skip errors: for the webhook, `cacheErrs` is `false`. If the webhook is down, the next request tries again instead of failing for two minutes. A token the webhook rejected is still cached as rejected.',
			'The cache has no size limit. It is [striped into 32 parts](' + CACHE + '#L112-L119) to spread lock contention, and each part is an expiring map with no entry limit. A comment still mentions "a 32k entry cache", but only the TTL removes entries, so check the code before you trust a size in a comment.'
		]
	},
	tradeoff: {
		gain: [
			'A hit reads local memory instead of making a network call.',
			'The identity provider or the database sees one request per TTL instead of one per user action.',
			'While a dependency is briefly slow, hits still answer at memory speed.'
		],
		cost: [
			'The cache serves stale answers: a revoked token keeps working for up to one TTL.',
			'The cache uses memory, and you must choose a size limit. Each server process holds its own copy, and two copies can disagree.',
			'A TTL needs no code but ignores changes. Keys or events driven by the owner catch each change, but the owner\'s code must take part, and that code is hard to test.'
		]
	},
	task: {
		prompt: 'For each of these three caches, write four things: the key, what makes an entry stale, who invalidates it, and the worst case while it is stale. (a) kube-apiserver\'s webhook token cache. (b) A gateway that caches the identity provider\'s public keys (JWKS) for 5 minutes. (c) A Rails fragment cache keyed with `cache_key_with_version`.',
		hint: 'For "who invalidates", the correct answer is often "nobody, the TTL does". Then ask how long the TTL is.',
		answer: [
			'(a) Key: HMAC of token and audiences. Stale: token revoked. Invalidates: the TTL, 2 minutes by default. Worst case: a revoked token keeps working for up to 2 minutes, per API server.',
			'(b) Key: the JWKS URL. Stale: the provider rotates its keys. Invalidates: the TTL. Worst case: tokens signed with the new key are rejected for up to 5 minutes. A common fix is to refetch once when a token names a key id (`kid`) that is not in the cached set.',
			'(c) Key: class, id and `updated_at`. Stale: never for that record, since a change makes a new key. Invalidates: the owner, by saving. Worst case: an outer fragment that embeds it stays stale, unless the child uses `touch: true`.',
			'If you could not answer "who invalidates" for one of your own caches, look at that cache first.'
		],
		steps: [
			{
				title: 'Name the keys',
				questions: [
					{ q: '(a) What is the key of kube-apiserver\'s token cache?', options: ['The raw token', 'An HMAC of the token and its audiences', 'The user name in the answer', 'The webhook\'s URL'], answer: 1, why: '`keyFunc` hashes the token with its audiences and a random secret made at startup.' },
					{ q: 'Why does (a) not key on the raw token?', options: ['A hash is faster to compare', 'Raw tokens are too short to be unique', 'Go maps cannot hold long strings', 'It keeps tokens out of memory'], answer: 3, why: 'The code comment says so. A dump of the cache does not leak usable tokens.' },
					{ q: '(b) What is the key of the gateway\'s JWKS cache?', options: ['Each token\'s signature', 'The user id in the token', 'The JWKS URL', 'The time of the last fetch'], answer: 2, why: 'The gateway caches one key set per provider, fetched from that URL.' },
					{ q: '(c) What goes into a `cache_key_with_version` key?', options: ['The class, the id and `updated_at` of the record', 'The URL of the page', 'A random id per request', 'The name of the view file'], answer: 0, why: 'The version comes from `updated_at`, so the key changes with each save.' }
				]
			},
			{
				title: 'Say what makes it stale',
				questions: [
					{ q: '(a) When is a cached token answer stale?', options: ['When the webhook restarts', 'When the token is revoked', 'When the user logs in again', 'When a second request arrives'], answer: 1, why: 'The cache still says yes, but the owner, the webhook, would now say no.' },
					{ q: '(b) When is the cached key set stale?', options: ['When a user logs out', 'When a token expires', 'When the gateway restarts', 'When the provider rotates its keys'], answer: 3, why: 'New tokens are then signed with a key the cached set does not have.' },
					{ q: '(c) When is a fragment for one record stale?', options: ['After every save of the record', 'Never for that record, since a change makes a new key', 'On every request', 'After every deploy'], answer: 1, why: 'A save moves the key. No read asks for the old one again.' },
					{ q: 'In general, what does "stale" mean?', options: ['The cached answer no longer matches the owner\'s data', 'The entry is older than a day', 'The lookup was a miss', 'Nobody has read the entry yet'], answer: 0, why: 'Age alone is not the test. What counts is whether the source changed.' }
				]
			},
			{
				title: 'Say who invalidates',
				questions: [
					{ q: '(a) Who removes the entry when a token is revoked?', options: ['The webhook, by calling the API server', 'The admin who revoked it', 'Nobody: the TTL does, 2 minutes by default', 'The `singleflight` group'], answer: 2, why: 'No code invalidates the entry. Only `--authentication-token-webhook-cache-ttl` does.' },
					{ q: '(b) Who refreshes the key set when the provider rotates?', options: ['The provider, by pushing the new keys', 'Nobody: the 5 minute TTL does', 'Each service behind the gateway', 'The SSO admin, by hand'], answer: 1, why: 'The gateway only fetches again when the entry expires.' },
					{ q: '(c) Who invalidates the fragment?', options: ['The owner, by saving the record', 'A cron job that deletes old fragments', 'A TTL set on the view', 'The cache store, by checking the database'], answer: 0, why: 'The owner\'s own write changes `updated_at`, and so the key.' },
					{ q: 'In (a), the webhook is down and returns an error. Is that answer cached?', options: ['Yes, for two minutes', 'Yes, until the webhook comes back', 'Only as a rejected token', 'No: `cacheErrs` is false, so the next request tries again'], answer: 3, why: 'Errors are skipped, so a short outage does not fail requests for a whole TTL.' }
				]
			},
			{
				title: 'Name the worst case',
				questions: [
					{ q: '(a) What is the worst case while an entry is stale?', options: ['Valid tokens are rejected', 'Ten webhook calls for one token', 'A revoked token keeps working for up to 2 minutes, per API server', 'The API server stops answering'], answer: 2, why: 'Each API server has its own cache, and each one trusts its entry until the TTL ends.' },
					{ q: '(b) What is the worst case while the key set is stale?', options: ['Tokens signed with the new key are rejected for up to 5 minutes', 'Old tokens work forever', 'Every request fetches the keys', 'Revoked tokens still pass'], answer: 0, why: 'The gateway cannot check a signature from a key it does not have.' },
					{ q: 'How do you shorten the worst case in (b)?', options: ['Retry the signature check with the cached keys', 'Refetch once when a token names a `kid` not in the cached set', 'Cache the keys for a day', 'Reject every token that has a `kid`'], answer: 1, why: 'An unknown key id is the sign of a rotation, so one refetch fixes it right away.' },
					{ q: '(c) What is the worst case?', options: ['The product shows an old price forever', 'Every page renders twice', 'Saving the product fails', 'An outer fragment that embeds it stays stale, unless the child uses `touch: true`'], answer: 3, why: 'The outer key holds the parent\'s `updated_at`, which does not move when only the child changes.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'An admin revokes Alice\'s token. An API server accepted that token one minute ago and caches token answers for 2 minutes. What happens?',
			options: [
				'Her requests keep working for about one more minute, until the entry expires',
				'The server rejects her next request, because it is notified of the revocation',
				'The server checks the token again on every request anyway, so the cache is bypassed',
				'The cache entry is deleted, because the hash of a revoked token changes'
			],
			answer: 0,
			why: 'Nothing tells the server about the revocation. Only the 2 minute TTL removes the entry, and it was stored one minute ago, so Alice keeps access for about one more minute.'
		},
		{
			q: 'Kubernetes\' token cache uses `singleflight`. What problem does that solve?',
			options: [
				'It keeps only one cache entry per user, whatever token they send with the request',
				'It makes sure each token is checked only once in its lifetime, then trusted forever',
				'When many requests with the same token miss at once, only one webhook call is made',
				'It spreads the entries over 32 parts so concurrent requests do not fight over one lock'
			],
			answer: 2,
			why: '`singleflight` does request coalescing: one call per key, shared by every waiting request. The 32 parts come from the striped cache, which is separate code. A token is still checked again after each TTL.'
		},
		{
			q: 'A Rails view caches a product with `cache_key_with_version`. The product\'s price changes. Why does the page show the new price without anyone deleting the old entry?',
			options: [
				'Rails clears every cached fragment for a model whenever one of its rows is saved',
				'Saving changes `updated_at`, which is in the key, so the next read looks up a new key',
				'The cache store compares the entry with the database row before each read',
				'Fragment caches live for a single request, so each page view renders again'
			],
			answer: 1,
			why: 'The key holds the version from `updated_at`. After the save, no read asks for the old key, and the cache store evicts it later. The owner\'s own write did the invalidation.'
		}
	],
	recall: {
		q: 'kube-apiserver caches webhook token answers. Who invalidates an entry when the token is revoked, and how long can the revoked token still work?',
		a: 'Nobody does. Only the TTL removes it: `--authentication-token-webhook-cache-ttl`, 2 minutes by default, so the token works for up to 2 minutes per API server.'
	},
	sources: [
		{ title: 'Martin Fowler, TwoHardThings', url: 'https://martinfowler.com/bliki/TwoHardThings.html' },
		{ title: 'RFC 9111, HTTP Caching', url: 'https://datatracker.ietf.org/doc/html/rfc9111' },
		{ title: 'Kubernetes docs, Webhook token authentication', url: 'https://kubernetes.io/docs/reference/access-authn-authz/authentication/' },
		{ title: 'Rails Guides, Caching with Rails', url: 'https://guides.rubyonrails.org/caching_with_rails.html' },
		{ title: 'Kubernetes, cached_token_authenticator.go', url: `${CACHE}#L144-L216` }
	]
};
