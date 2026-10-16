const K8S = 'https://github.com/kubernetes/kubernetes/blob/8d9877ea2fe0c69580c5d730bccab6dc16a5c841';
const CACHE = `${K8S}/staging/src/k8s.io/apiserver/pkg/authentication/token/cache/cached_token_authenticator.go`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'caching',
	part: 'Between services',
	title: 'Caching',
	minutes: 10,
	hook: [
		'Yesterday\'s gateway checked JWTs itself, with cached keys. Some tokens are opaque, though: only the identity provider can say if one is valid. Without a cache, that means asking it on every request. That is a network call, on the path of every click, to a system that every service shares.',
		'The obvious fix: remember the answer for a while. Now a valid token costs one check per few minutes. But the day an admin revokes that token, **the gateway keeps saying yes** until the entry expires.',
		'A cache is a **copy of data you do not own** (day 17). So every cache has to answer two questions: **what makes an entry stale**, and **who invalidates it**. Phil Karlton\'s line is famous for a reason: "There are only two hard things in Computer Science: cache invalidation and naming things."'
	],
	terms: [
		{ term: 'Hit / miss', def: 'Hit: the answer is in the cache. Miss: you pay the slow call, then usually store the result.' },
		{ term: 'TTL', def: 'Time to live. How long an entry is trusted before it is thrown away. The simplest invalidation: nobody does anything, time does.' },
		{ term: 'Stale', def: 'The cached answer no longer matches the owner\'s data. Every cache is stale sometimes; the question is how long and how bad.' },
		{ term: 'Invalidation', def: 'Removing or refreshing an entry because the source changed. Needs someone who knows that it changed.' },
		{ term: 'Request coalescing', def: 'When ten callers miss at once, send one request and give all ten the same answer.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['client["kubectl or a pod"] -->|"Bearer token"| api["kube-apiserver"]', 'api --> tc[("Token cache: HMAC of token to user")]', 'api -->|"only on a miss"| hook["Token webhook"]', 'class hook ext'],
				highlight: ['client', 'api', 'tc', 'hook'],
				note: 'Kubernetes can ask an outside **webhook** whether a token is valid. The API server keeps each answer **in its own memory**, keyed by a keyed hash of the token. A hit costs nothing.'
			},
			{
				add: ['many["Ten requests, same token"] -->|"all miss at once"| api'],
				highlight: ['many'],
				note: '**Coalescing.** The ten misses share one webhook call, through Go\'s `singleflight`. Without it, a cold cache sends a burst of identical calls exactly when the webhook is busiest.'
			},
			{
				add: ['ttl["TTL, default 2 minutes"] -.->|"expires entries"| tc'],
				highlight: ['ttl'],
				note: 'When a token is revoked, **nobody** invalidates its entry. Only the TTL does: `--authentication-token-webhook-cache-ttl`, two minutes by default. That is the **revocation window**.'
			},
			{
				add: ['owner["Rails app: product saved"] -->|"updated_at changes"| key["Cache key: products/233-20140225..."]', 'key -.->|"old key never read again"| store[("Fragment cache")]'],
				highlight: ['owner', 'key', 'store'],
				note: 'The other way: **the owner invalidates**. Rails puts the record\'s `updated_at` in the cache key. Saving the product changes the key, so the next read misses and rebuilds. Nobody has to delete anything.'
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
			'**The key** is an [HMAC of the token and its audiences](' + CACHE + '#L231-L254), with a random secret made at startup. Raw tokens are never kept: the comment says it "keeps tokens out of memory". The same token for two audiences is two entries.',
			'**Coalescing**: `a.group.DoChan(key, ...)` runs one lookup per key, however many requests wait on it. Inside, it checks the cache again, because another caller may have filled it meanwhile.',
			'**Stale when** the token is revoked. **Invalidated by** time only: `successTTL` for a yes, `failureTTL` for a no. For the webhook, [both are set to the same flag](' + K8S + '/pkg/kubeapiserver/authenticator/config.go#L416), two minutes by default.',
			'**Errors are not cached** for the webhook (`cacheErrs` is `false` there). If the webhook is down, the next request tries again instead of failing for two minutes. A rejected token, though, is remembered as rejected.',
			'**Not bounded by size**: the cache is [striped into 32 parts](' + CACHE + '#L112-L119) to spread lock contention, and each part is an expiring map with no entry limit. The comment still talks about "a 32k entry cache", but only the TTL removes entries. Comments drift from code: check before you trust a size.'
		]
	},
	tradeoff: {
		gain: [
			'Latency: a hit is local memory instead of a network call.',
			'Load: the identity provider or the database sees one request per TTL instead of one per user action.',
			'Some shelter from a slow dependency: hits keep working while it is briefly slow.'
		],
		cost: [
			'Stale answers. For tokens, that means a revoked user keeps access for up to one TTL.',
			'Memory, and a size limit you must choose. Several copies, one per server process, which can disagree with each other.',
			'Invalidation code that is hard to test. A TTL is simple but blind; owner-driven keys or events are precise but need the owner to take part.'
		]
	},
	task: {
		prompt: 'For each of these three caches, write four things: the key, what makes an entry stale, who invalidates it, and the worst case while it is stale. (a) kube-apiserver\'s webhook token cache. (b) A gateway that caches the identity provider\'s public keys (JWKS) for 5 minutes. (c) A Rails fragment cache keyed with `cache_key_with_version`.',
		hint: 'For "who invalidates", the honest answer is often "nobody, the TTL does". That is allowed. Then ask how long the TTL is.',
		answer: [
			'(a) Key: HMAC of token and audiences. Stale: token revoked. Invalidates: the TTL, 2 minutes by default. Worst case: a revoked token keeps working for up to 2 minutes, per API server.',
			'(b) Key: the JWKS URL. Stale: the provider rotates its keys. Invalidates: the TTL. Worst case: tokens signed with the new key are rejected for up to 5 minutes. A common fix is to refetch once when a token names a key id (`kid`) that is not in the cached set.',
			'(c) Key: class, id and `updated_at`. Stale: never for that record, since a change makes a new key. Invalidates: the owner, by saving. Worst case: an outer fragment that embeds it stays stale, unless the child uses `touch: true`.',
			'If you found a cache where you could not answer "who invalidates", that is the one to look at first.'
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
			why: 'Nothing tells the server about the revocation. Only time invalidates its entries, so the revocation window is the TTL. That is the price of not asking the identity provider each time.'
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
			why: 'That is request coalescing. The 32 parts are the striped cache, a different thing. A token is still checked again after each TTL.'
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
			why: 'The key holds the version. The old entry is never read again and simply ages out. The owner\'s own write did the invalidation.'
		}
	],
	takeaway: 'Before adding a cache, write down what makes an entry stale and who invalidates it. If the answer is "nobody", the TTL is your risk window.',
	sources: [
		{ title: 'Martin Fowler, TwoHardThings', url: 'https://martinfowler.com/bliki/TwoHardThings.html' },
		{ title: 'RFC 9111, HTTP Caching', url: 'https://datatracker.ietf.org/doc/html/rfc9111' },
		{ title: 'Kubernetes docs, Webhook token authentication', url: 'https://kubernetes.io/docs/reference/access-authn-authz/authentication/' },
		{ title: 'Rails Guides, Caching with Rails', url: 'https://guides.rubyonrails.org/caching_with_rails.html' },
		{ title: 'Kubernetes, cached_token_authenticator.go', url: `${CACHE}#L144-L216` }
	]
};
