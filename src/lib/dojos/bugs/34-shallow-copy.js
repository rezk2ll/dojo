const REQ = 'https://github.com/psf/requests';
const PR = `${REQ}/pull/613`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'shallow-copy',
	part: 'Logic',
	title: 'A headers dict shared by every session',
	minutes: 10,
	hook: [
		'In requests 0.12.1, a `Session` reads its settings from `self.config`. The default HTTP headers live there under `base_headers`, a dict with `User-Agent`, `Accept-Encoding` and `Accept`.',
		'Take two sessions, `a` and `b`, made with no arguments. Code sets `a.config[\'base_headers\'][\'User-Agent\'] = \'my-bot\'`. Requests sent from `b`, and from every session created later in the process, now say `User-Agent: my-bot` too.'
	],
	terms: [
		{ term: 'Shallow copy', def: 'A copy of a container that holds the same inner objects as the original. Changing an inner dict through the copy changes it for both.' },
		{ term: 'setdefault', def: '`d.setdefault(k, v)` stores `v` under `k` if `k` is missing. It stores the object itself, not a copy of it.' },
		{ term: 'defaults', def: 'A module-level dict in `requests/defaults.py`. It is created once, when the module is imported, and every session reads from it.' }
	],
	bug: {
		title: 'Remove sharing of base_headers config between sessions.',
		repo: 'psf/requests',
		url: `${REQ}/blob/763393f70a8c7bf3944647e07af697b0bb743f77/requests/sessions.py#L59-L86`,
		fix: `${REQ}/commit/973e9cb54826062328f1c8650630819205ccfe8e`,
		lang: 'python',
		code: `def __init__(self,
    headers=None,
    cookies=None,
    auth=None,
    timeout=None,
    proxies=None,
    hooks=None,
    params=None,
    config=None,
    prefetch=False,
    verify=True,
    cert=None):

    self.headers = headers or {}
    self.auth = auth
    self.timeout = timeout
    self.proxies = proxies or {}
    self.hooks = hooks or {}
    self.params = params or {}
    self.config = config or {}
    self.prefetch = prefetch
    self.verify = verify
    self.cert = cert

    for (k, v) in list(defaults.items()):
        self.config.setdefault(k, v)

    self.init_poolmanager()`,
		lines: [26],
		diff: `         for (k, v) in list(defaults.items()):
-            self.config.setdefault(k, v)
+            self.config.setdefault(k, deepcopy(v))

         self.init_poolmanager()`,
		notes: [
			'Line 20 gives each session its own `config` dict. Lines 25 and 26 then copy the defaults into it one key at a time. For `base_headers`, the value `v` is a dict, and `setdefault` stores that same dict object. Every session\'s `config[\'base_headers\']` is **the one dict in `defaults`**.',
			'Most defaults are ints, bools or `None`, such as `max_redirects = 30`. Code that changes those assigns a new value to the session\'s own `config` key, so other sessions keep 30. `base_headers` is the one default that code changes in place, by writing a key inside it, so every session sees that write.',
			'In the fix, `deepcopy(v)` on line 26 gives each session its own copy of each default value, including a new `base_headers` dict. The commit message gives the reason: "Since base_headers is a dictionary, it\'s reference was shared with all instances of Session objects."',
			'[Pull request #613](' + PR + ') says: "This patch deep copies all config options. Using deepcopy here should not incur a large performance penalty."'
		]
	},
	quiz: [
		{
			q: 'After `a.config[\'base_headers\'][\'User-Agent\'] = \'my-bot\'`, what does `b.config[\'base_headers\'] is a.config[\'base_headers\']` return?',
			options: ['`False`, each session has its own config', '`True`, both hold the dict from `defaults`', '`False`, `setdefault` makes a copy', 'It raises KeyError on `b`'],
			answer: 1,
			why: '`setdefault` stored the same object in both configs. Only the outer `config` dicts are different.'
		},
		{
			q: 'Code sets `a.config[\'max_redirects\'] = 5`. Does `b` change?',
			options: [
				'Yes, all config values are shared',
				'No, this rebinds a key in `a`\'s own dict',
				'Yes, ints are passed by reference',
				'Only if `b` was created after `a`'
			],
			answer: 1,
			why: 'Assigning a key replaces the value in `a.config` only. The leak needs an in-place change to an object that both sessions hold.'
		},
		{
			q: 'Which test would have caught this bug?',
			options: [
				'Create one session and check its default headers',
				'Change a header in one session, then check a second one',
				'Send a request and check the response code',
				'Create a session with a custom `config` argument'
			],
			answer: 1,
			why: 'The bug only shows between two objects. One session alone always looks right. A custom `config` without `base_headers` still gets the shared dict.'
		}
	],
	recall: {
		q: 'In requests 0.12.1, why did setting a `User-Agent` in one session\'s `base_headers` change it for every session?',
		a: '`self.config.setdefault(k, v)` stored the same `base_headers` dict from the module-level `defaults` in every session\'s `config`. The fix stores `deepcopy(v)`, so each session gets its own dict.'
	},
	sources: [
		{ title: 'requests pull request #613', url: PR },
		{ title: 'The fix commit', url: `${REQ}/commit/973e9cb54826062328f1c8650630819205ccfe8e` }
	]
};
