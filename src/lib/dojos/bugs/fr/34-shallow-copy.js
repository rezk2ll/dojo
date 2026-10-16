const REQ = 'https://github.com/psf/requests';
const PR = `${REQ}/pull/613`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'shallow-copy',
	part: 'La logique',
	title: 'Un dict d’en-têtes partagé par toutes les sessions',
	minutes: 10,
	hook: [
		'Dans requests 0.12.1, une `Session` lit ses réglages dans `self.config`. Les en-têtes HTTP par défaut y sont rangés sous `base_headers`, un dict avec `User-Agent`, `Accept-Encoding` et `Accept`.',
		'Prends deux sessions, `a` et `b`, créées sans argument. Du code fait `a.config[\'base_headers\'][\'User-Agent\'] = \'my-bot\'`. Les requêtes envoyées par `b`, et par toute session créée ensuite dans le processus, disent maintenant elles aussi `User-Agent: my-bot`.'
	],
	terms: [
		{ term: 'Copie superficielle', def: 'Une copie d’un conteneur qui garde les mêmes objets internes que l’original. Modifier un dict interne via la copie le modifie pour les deux.' },
		{ term: 'setdefault', def: '`d.setdefault(k, v)` range `v` sous `k` si `k` manque. Il range l’objet lui-même, pas une copie.' },
		{ term: 'defaults', def: 'Un dict au niveau du module `requests/defaults.py`. Il est créé une fois, à l’import du module, et chaque session le lit.' }
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
			'La ligne 20 donne à chaque session son propre dict `config`. Les lignes 25 et 26 y recopient ensuite les valeurs par défaut, clé par clé. Pour `base_headers`, la valeur `v` est un dict, et `setdefault` range ce même objet. Le `config[\'base_headers\']` de chaque session est donc **l’unique dict de `defaults`**.',
			'La plupart des valeurs par défaut sont des int, des booléens ou `None`, comme `max_redirects = 30`. Pour les changer, le code affecte une nouvelle valeur à la clé du `config` de la session, et les autres sessions gardent 30. `base_headers` est la seule valeur que le code modifie sur place, en écrivant une clé dedans, et chaque session voit cette écriture.',
			'Dans le correctif, `deepcopy(v)` à la ligne 26 donne à chaque session sa propre copie de chaque valeur par défaut, dont un nouveau dict `base_headers`. Le message du commit donne la raison : "Since base_headers is a dictionary, it\'s reference was shared with all instances of Session objects."',
			'La [pull request #613](' + PR + ') dit : "This patch deep copies all config options. Using deepcopy here should not incur a large performance penalty." Selon elle, `deepcopy` coûte peu ici.'
		]
	},
	quiz: [
		{
			q: 'Après `a.config[\'base_headers\'][\'User-Agent\'] = \'my-bot\'`, que renvoie `b.config[\'base_headers\'] is a.config[\'base_headers\']` ?',
			options: ['`False`, chaque session a sa propre config', '`True`, les deux ont le dict de `defaults`', '`False`, car `setdefault` fait une copie', 'Une KeyError levée sur `b`'],
			answer: 1,
			why: '`setdefault` a rangé le même objet dans les deux configs. Seuls les dicts `config` extérieurs sont différents.'
		},
		{
			q: 'Du code fait `a.config[\'max_redirects\'] = 5`. Est-ce que `b` change ?',
			options: [
				'Oui, toutes les valeurs de config sont partagées',
				'Non, ça remplace une clé dans le dict de `a`',
				'Oui, les int sont passés par référence',
				'Seulement si `b` a été créée après `a`'
			],
			answer: 1,
			why: 'Affecter une clé remplace la valeur dans `a.config` seulement. La fuite demande une modification sur place d’un objet que les deux sessions partagent.'
		},
		{
			q: 'Quel test aurait attrapé ce bug ?',
			options: [
				'Créer une session et vérifier ses en-têtes par défaut',
				'Changer un en-tête dans une session, puis lire une deuxième',
				'Envoyer une requête et vérifier le code de réponse',
				'Créer une session avec un argument `config` à soi'
			],
			answer: 1,
			why: 'Le bug n’apparaît qu’entre deux objets. Une session seule a toujours l’air correcte. Une `config` à soi sans `base_headers` reçoit quand même le dict partagé.'
		}
	],
	recall: {
		q: 'Dans requests 0.12.1, pourquoi régler un `User-Agent` dans les `base_headers` d’une session le changeait-il pour toutes les sessions ?',
		a: '`self.config.setdefault(k, v)` rangeait le même dict `base_headers`, celui du module `defaults`, dans le `config` de chaque session. Le correctif range `deepcopy(v)`, et chaque session a son propre dict.'
	},
	sources: [
		{ title: 'requests, pull request #613', url: PR },
		{ title: 'Le commit du correctif', url: `${REQ}/commit/973e9cb54826062328f1c8650630819205ccfe8e` }
	]
};
