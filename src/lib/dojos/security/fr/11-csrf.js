const DJ = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const CSRF = `${DJ}/django/middleware/csrf.py`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'csrf',
	part: 'L’identité',
	title: 'La falsification de requête intersite (CSRF)',
	minutes: 10,
	hook: [
		'Le 18 janvier 2022, deux chercheurs signalent un bug à Grafana. Ils montrent qu’un admin Grafana connecté qui ouvre leur page web invite l’attaquant comme nouvel utilisateur Admin. Ouvrir la page suffit : l’admin ne clique sur rien.',
		'La page appelle `fetch()` sur `/api/org/invites` avec `credentials: "include"` et l’en-tête `Content-Type: text/plain; json`. Le navigateur joint le cookie `grafana_session` de l’admin, et Grafana prend la requête pour une action de l’admin. Depuis la v6.0, Grafana comptait sur `SameSite=Lax` pour ce cookie. Or la page d’attaque tournait sur une origine same-site, et Lax envoie alors le cookie.',
		'Le bug reçoit le numéro CVE-2022-21703, noté 6.8 par Grafana. Toutes les versions depuis la 3.0-beta1 sont touchées, et le correctif sort le 8 février 2022 dans les versions 8.3.5 et 7.5.15.'
	],
	terms: [
		{ term: 'CSRF', def: 'Cross-site request forgery : une page d’un autre site fait envoyer une requête à ton appli par le navigateur de la victime, et le navigateur y joint les cookies de la victime.' },
		{ term: 'Jeton CSRF', def: 'Une valeur aléatoire que le serveur met dans ses propres pages et vérifie à chaque requête non sûre. Une page d’un autre site ne peut pas la lire, donc ne peut pas l’envoyer.' },
		{ term: 'SameSite', def: 'Un attribut de cookie (`Strict`, `Lax` ou `None`) qui dit au navigateur s’il doit joindre le cookie à une requête venue d’un autre site.' },
		{ term: 'Same-site', def: 'Deux URL sont same-site quand elles ont le même schéma et le même domaine enregistrable, comme `app.example.com` et `blog.example.com`. Le port ne compte pas.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['user["Alice se connecte à shop.example"] --> cookie["Le navigateur garde sessionid pour shop.example"]'],
				highlight: ['user', 'cookie'],
				note: 'Alice se connecte à `shop.example` et le navigateur garde son cookie `sessionid`. À partir de là, il envoie ce cookie avec chaque requête vers `shop.example`, quelle que soit la page qui la lance.'
			},
			{
				add: ['cookie --> evil["Alice ouvre evil.example dans un autre onglet"]', 'evil -->|"formulaire caché envoyé tout seul"| post["POST shop.example/email avec email=attacker@evil.example"]'],
				highlight: ['evil', 'post'],
				note: 'Alice ouvre une page de `evil.example`. Elle contient un `<form method="POST" action="https://shop.example/email">` caché et un script qui appelle `submit()` au chargement. Le formulaire remplace l’email du compte par l’adresse de l’attaquant.'
			},
			{
				add: ['post -->|"cookie joint"| server["shop.example voit une session valide et enregistre le nouvel email"]'],
				highlight: ['server'],
				note: 'Avec `SameSite=None` sur le cookie, ou sans SameSite dans un navigateur qui ne passe pas Lax par défaut, le navigateur joint `sessionid` au POST. Le serveur voit la session d’Alice et enregistre le nouvel email. L’attaquant demande ensuite une réinitialisation du mot de passe, qui part vers cette nouvelle adresse.'
			},
			{
				add: ['post -->|"pas de csrfmiddlewaretoken"| mw["Django CsrfViewMiddleware"]', 'mw -->|"jeton absent ou faux"| deny["403 Forbidden"]'],
				highlight: ['mw', 'deny'],
				note: 'Avec Django, chaque formulaire de `shop.example` porte un champ caché `csrfmiddlewaretoken`. Le middleware le compare au secret du cookie `csrftoken`. La page de `evil.example` ne peut lire aucune des deux valeurs : son POST arrive sans jeton et reçoit un 403.'
			},
			{
				add: ['lax["SameSite=Lax sur sessionid"] -.->|"POST intersite : cookie retiré"| post'],
				highlight: ['lax'],
				note: 'Avec `SameSite=Lax`, le navigateur n’envoie le cookie d’un site à l’autre que pour une navigation de premier niveau avec une méthode sûre comme GET. Le POST forgé depuis `evil.example` arrive sans `sessionid`. Une page de `blog.shop.example` est same-site, en revanche, et son POST reçoit encore le cookie : c’était le cas de Grafana.'
			}
		]
	},
	example: {
		title: 'django/middleware/csrf.py : CsrfViewMiddleware.process_view',
		repo: 'django/django',
		url: `${CSRF}#L416-L472`,
		lang: 'python',
		code: `    def process_view(self, request, callback, callback_args, callback_kwargs):
        if getattr(request, "csrf_processing_done", False):
            return None

        # Wait until request.META["CSRF_COOKIE"] has been manipulated before
        # bailing out, so that get_token still works
        if getattr(callback, "csrf_exempt", False):
            return None

        # Assume that anything not defined as 'safe' by RFC 9110 needs
        # protection
        if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
            return self._accept(request)

        if getattr(request, "_dont_enforce_csrf_checks", False):
…
            return self._accept(request)

        # Reject the request if the Origin header doesn't match an allowed
        # value.
        if "HTTP_ORIGIN" in request.META:
            if not self._origin_verified(request):
                return self._reject(
                    request, REASON_BAD_ORIGIN % request.META["HTTP_ORIGIN"]
                )
        elif request.is_secure():
            # If the Origin header wasn't provided, reject HTTPS requests if
            # the Referer header doesn't match an allowed value.
…
            try:
                self._check_referer(request)
            except RejectRequest as exc:
                return self._reject(request, exc.reason)

        try:
            self._check_token(request)
        except RejectRequest as exc:
            return self._reject(request, exc.reason)

        return self._accept(request)`,
		notes: [
			'La ligne 7 sort tout de suite pour une vue marquée `@csrf_exempt`. Une telle vue n’a ni contrôle d’Origin ni contrôle de jeton.',
			'La ligne 12 accepte GET, HEAD, OPTIONS et TRACE sans rien vérifier. La doc de Django en donne la raison : ces requêtes "ought never to have any potentially dangerous side effects" (ne devraient jamais avoir d’effet dangereux). Une vue qui supprime des données sur un GET est ouverte à n’importe quel lien, sur n’importe quel site.',
			'Les lignes 21 à 25 comparent l’en-tête `Origin` au schéma et à l’hôte de l’appli, puis à `CSRF_TRUSTED_ORIGINS`. Un POST venu de `https://blog.shop.example` échoue ici tant que cette origine n’est pas listée, même s’il est same-site.',
			'La ligne 36 lance `_check_token`. Elle prend `csrfmiddlewaretoken` dans le corps du POST, ou l’en-tête `X-CSRFToken` pour les appels `fetch()`, et [le compare au secret du cookie](' + CSRF + '#L143-L157) avec `constant_time_compare`. Le jeton de 64 caractères du formulaire contient un masque aléatoire de 32 caractères suivi du secret décalé par ce masque : chaque page affiche une valeur différente.'
		]
	},
	tradeoff: {
		gain: [
			'Un POST forgé échoue depuis n’importe quelle origine, sous-domaine same-site compris, car la page de l’attaquant ne peut pas lire la valeur `csrftoken` qu’il faudrait envoyer.',
			'Le contrôle d’Origin rejette un POST venu d’une origine non listée avant même de lire le jeton, et il marche aussi pour une API JSON appelée avec `fetch()`.'
		],
		cost: [
			'Chaque template de formulaire a besoin de `{% csrf_token %}` et chaque appel `fetch()` de l’en-tête `X-CSRFToken`, sinon l’utilisateur reçoit un 403.',
			'Les vues GET ne passent par aucun contrôle : un GET qui modifie des données reste ouvert à un simple lien.',
			'Chaque `@csrf_exempt` coupe tout le contrôle pour sa vue, et rien ne le signale.'
		]
	},
	task: {
		prompt: 'Une boutique Django tourne sur `shop.example` avec `SESSION_COOKIE_SAMESITE = "Lax"` (la valeur par défaut) et `CsrfViewMiddleware` actif. Elle a deux vues : `delete_photo(request, id)`, qui supprime la photo quand `request.method == "GET"`, et `api_invite(request)`, décorée avec `@csrf_exempt`, qui lit un corps JSON en POST et invite un utilisateur. Pour chaque vue, dis si une page de `evil.example` peut forger la requête, puis si une page de `blog.shop.example` le peut. Corrige ensuite les deux.',
		hint: 'Lax envoie le cookie d’un site à l’autre pour une navigation GET de premier niveau. Une requête same-site reçoit toujours le cookie. Regarde les lignes 7 et 12 du middleware.',
		answer: [
			'`delete_photo` depuis `evil.example` : oui. Un lien vers `https://shop.example/photos/42/delete` est une navigation GET de premier niveau, donc Lax envoie `sessionid`. Le middleware accepte le GET ligne 12 sans contrôle. Depuis `blog.shop.example` : oui aussi.',
			'`api_invite` depuis `evil.example` : non. Le POST `fetch()` est intersite et ce n’est pas une navigation de premier niveau : Lax retire le cookie et la requête arrive anonyme. Depuis `blog.shop.example` : oui. La requête est same-site, le cookie part avec, et `@csrf_exempt` saute les deux contrôles ligne 7.',
			'Pour `delete_photo` : n’accepte que POST (`@require_POST` de Django) et mets `{% csrf_token %}` dans le formulaire de suppression. Le contrôle du jeton s’applique alors.',
			'Pour `api_invite` : retire `@csrf_exempt` et fais envoyer le jeton par le front dans un en-tête `X-CSRFToken`. Le contrôle d’Origin des lignes 21 à 25 rejette aussi `https://blog.shop.example`, absente de `CSRF_TRUSTED_ORIGINS`.'
		]
	},
	quiz: [
		{
			q: 'Alice est connectée à `shop.example` dans un navigateur qui ne passe pas Lax par défaut, et le cookie de session n’a pas d’attribut SameSite. Une page de `evil.example` envoie toute seule un formulaire POST vers `shop.example`. Que part-il du navigateur ?',
			options: [
				'Le POST sans aucun cookie, car le formulaire vient d’un autre domaine',
				'Rien, car la same-origin policy bloque les formulaires d’une origine à l’autre',
				'Le POST avec le cookie `sessionid` d’Alice',
				'Le POST avec seulement les cookies posés par `evil.example`'
			],
			answer: 2,
			why: 'Un navigateur joint les cookies d’un site à chaque requête vers ce site, quelle que soit la page qui l’a lancée. La same-origin policy limite ce que la page de l’attaquant peut relire, sans empêcher l’envoi. Seuls SameSite ou un contrôle côté serveur l’arrêtent.'
		},
		{
			q: 'Pourquoi la page de `evil.example` ne peut-elle pas mettre un `csrfmiddlewaretoken` valide dans son formulaire forgé ?',
			options: [
				'Le jeton est une valeur aléatoire des pages et du cookie de shop.example, illisibles ailleurs',
				'Le jeton est signé avec le mot de passe de l’utilisateur, inconnu de l’attaquant',
				'Le navigateur retire les champs cachés des formulaires envoyés d’un site à l’autre',
				'Le jeton est lié à l’adresse IP de la première connexion de l’utilisateur'
			],
			answer: 0,
			why: 'La doc de Django décrit le cookie CSRF comme "a random secret value, which other sites will not have access to" (un secret aléatoire inaccessible aux autres sites). La page de l’attaquant peut faire envoyer une requête, mais elle ne peut lire ni les cookies ni les pages de `shop.example` : elle n’a aucun secret à recopier.'
		},
		{
			q: 'Grafana posait `SameSite=Lax` sur `grafana_session`, et pourtant une page servie depuis `localhost:8081` a forgé un POST vers Grafana sur `localhost:3000`. Pourquoi le navigateur a-t-il joint le cookie ?',
			options: [
				'Lax laisse passer les cookies sur tout POST envoyé avec `fetch()`',
				'Les deux origines ne diffèrent que par le port : elles sont same-site',
				'Le type de contenu `text/plain` désactive les contrôles SameSite',
				'Lax ne s’applique qu’en HTTPS, et le test tournait en HTTP'
			],
			answer: 1,
			why: 'SameSite compare des sites (schéma et domaine enregistrable), et le port n’en fait pas partie. Le write-up de jub0bs indique que `http://localhost:8081` "is same-site with respect to" `http://localhost:3000` : Lax a donc envoyé le cookie. Un contrôle d’Origin ou de jeton l’aurait bloqué.'
		}
	],
	recall: {
		q: 'Sur un POST, quelles deux valeurs le `CsrfViewMiddleware` de Django compare-t-il ?',
		a: 'Le champ `csrfmiddlewaretoken` (ou l’en-tête `X-CSRFToken`), démasqué de 64 à 32 caractères, et le secret du cookie `csrftoken`, avec `constant_time_compare`.'
	},
	sources: [
		{ title: 'GitHub Advisory GHSA-cmf4-h3xc-jw8w, CSRF dans Grafana (CVE-2022-21703)', url: 'https://github.com/advisories/GHSA-cmf4-h3xc-jw8w' },
		{ title: 'jub0bs, CVE-2022-21703: cross-origin request forgery against Grafana', url: 'https://jub0bs.com/posts/2022-02-08-cve-2022-21703-writeup/' },
		{ title: 'Doc Django, Cross Site Request Forgery protection', url: 'https://docs.djangoproject.com/en/stable/ref/csrf/' },
		{ title: 'OWASP Cross-Site Request Forgery Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html' },
		{ title: 'MDN, Set-Cookie : SameSite', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value' }
	]
};
