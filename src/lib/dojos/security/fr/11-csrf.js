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
		],
		steps: [
			{
				title: 'Lis la config',
				questions: [
					{ q: 'Avec `SameSite=Lax`, quand le navigateur joint-il `sessionid` à une requête lancée par un autre site ?', options: ['Sur toute requête, du moment qu’elle passe en HTTPS', 'Seulement pour une navigation de premier niveau avec une méthode sûre comme GET', 'Jamais : Lax bloque toute requête intersite', 'Seulement sur un POST envoyé avec `fetch()`'], answer: 1, why: 'Lax n’envoie le cookie d’un site à l’autre que pour une navigation de premier niveau avec une méthode sûre. Un POST intersite arrive sans lui.' },
					{ q: '`shop.example` et `blog.shop.example` sont-ils same-site ?', options: ['Non : les hôtes diffèrent', 'Seulement s’ils utilisent le même port', 'Oui : même schéma et même domaine enregistrable', 'Seulement si `blog` figure dans `CSRF_TRUSTED_ORIGINS`'], answer: 2, why: 'Same-site compare le schéma et le domaine enregistrable. Les sous-domaines de `shop.example` sont same-site, donc Lax envoie toujours le cookie entre eux.' },
					{ q: 'Quelles méthodes `CsrfViewMiddleware` accepte-t-il sans contrôle ligne 12 ?', options: ['GET, HEAD, OPTIONS et TRACE', 'GET et POST', 'Seulement GET', 'Toutes les méthodes quand le cookie est Lax'], answer: 0, why: 'Django considère les méthodes sûres de la RFC 9110 comme sans danger et les accepte tout de suite. C’est pour ça qu’un GET ne doit jamais modifier de données.' },
					{ q: 'Que fait `@csrf_exempt` à une vue ?', options: ['Il saute seulement le contrôle du jeton et garde celui d’Origin', 'Il active à la place le contrôle de l’en-tête `X-CSRFToken`', 'Il sort ligne 7, sans contrôle d’Origin ni contrôle de jeton', 'Il pose `SameSite=Strict` sur le cookie de session'], answer: 2, why: 'La ligne 7 renvoie `None` pour une vue exemptée avant tout contrôle. Rien ne le signale.' }
				]
			},
			{
				title: 'Vérifie `delete_photo`',
				questions: [
					{ q: 'Une page de `evil.example` met un lien vers `https://shop.example/photos/42/delete`. Alice clique. `sessionid` part-il ?', options: ['Non : Lax retire le cookie de toute requête intersite', 'Oui : c’est une navigation GET de premier niveau', 'Non : le lien vient d’un autre domaine enregistrable', 'Seulement si le lien s’ouvre dans un nouvel onglet'], answer: 1, why: 'Un lien est une navigation de premier niveau en GET, le seul cas intersite où Lax envoie encore le cookie.' },
					{ q: 'Le GET arrive chez Django avec la session d’Alice. Que fait le middleware ?', options: ['Il le rejette : le jeton manque', 'Il contrôle d’abord l’en-tête `Origin`', 'Il l’accepte ligne 12 sans contrôle', 'Il réclame l’en-tête `X-CSRFToken`'], answer: 2, why: 'GET est une méthode sûre pour Django, donc la ligne 12 l’accepte. La vue supprime alors la photo.' },
					{ q: 'Une page de `blog.shop.example` peut-elle forger la même suppression ?', options: ['Oui : elle est same-site, le cookie part avec, et le GET n’est pas contrôlé', 'Non : `blog.shop.example` n’est pas dans `CSRF_TRUSTED_ORIGINS`', 'Non : Lax bloque les requêtes entre sous-domaines', 'Seulement avec un formulaire POST'], answer: 0, why: 'Une requête same-site porte toujours le cookie, et le contrôle d’Origin ne tourne jamais sur un GET.' },
					{ q: 'Quel est le vrai défaut de `delete_photo` ?', options: ['Le cookie est Lax au lieu de Strict', 'Elle modifie des données sur un GET, que Django ne contrôle jamais', 'Elle a oublié `@csrf_exempt`', 'Elle prend l’`id` de la photo dans l’URL'], answer: 1, why: 'Django part du principe que les méthodes sûres n’ont pas d’effet dangereux. Une vue qui supprime sur un GET casse ce principe et s’ouvre à n’importe quel lien.' }
				]
			},
			{
				title: 'Vérifie `api_invite`',
				questions: [
					{ q: 'Une page de `evil.example` appelle `fetch()` en POST vers `api_invite`. `sessionid` part-il ?', options: ['Oui : `fetch()` avec `credentials: "include"` envoie toujours les cookies', 'Non : c’est intersite et pas une navigation de premier niveau, donc Lax le retire', 'Oui : Lax ne s’applique qu’aux formulaires', 'Non : le navigateur bloque la requête avant son départ'], answer: 1, why: 'Un POST `fetch()` intersite n’est pas une navigation de premier niveau. Lax retire le cookie et la requête arrive anonyme.' },
					{ q: 'Alors, `evil.example` peut-il inviter un utilisateur via `api_invite` ?', options: ['Oui : `@csrf_exempt` saute tous les contrôles', 'Oui : les corps JSON ne sont jamais contrôlés', 'Seulement si l’en-tête Origin manque', 'Non : la requête n’a pas de session, elle est anonyme'], answer: 3, why: 'Sans le cookie, le serveur ne voit aucun utilisateur connecté. C’est Lax qui sauve ce cas, pas Django.' },
					{ q: 'Une page de `blog.shop.example` envoie le même POST `fetch()`. Que se passe-t-il ?', options: ['Ça marche : le cookie part avec et `@csrf_exempt` saute les deux contrôles', 'Ça échoue : le contrôle d’Origin rejette le sous-domaine', 'Ça échoue : Lax retire les cookies de tout POST', 'Ça échoue : le contrôle du jeton tourne car le corps est en JSON'], answer: 0, why: 'Same-site veut dire que le cookie est joint, et la vue exemptée sort ligne 7 avant les contrôles d’Origin et de jeton.' },
					{ q: 'Quel bug passé correspond à ce second cas ?', options: ['Une vue qui supprime sur un GET', 'Un `{% csrf_token %}` oublié dans un template', 'Le cas Grafana : Lax actif, mais la page d’attaque était same-site', 'Un jeton comparé sans `constant_time_compare`'], answer: 2, why: 'Grafana comptait sur Lax, et la page d’attaque tournait sur une origine same-site, où Lax envoie encore le cookie.' }
				]
			},
			{
				title: 'Corrige les deux vues',
				questions: [
					{ q: 'Comment corriges-tu `delete_photo` ?', options: ['Passer `SESSION_COOKIE_SAMESITE = "Strict"` et garder le GET', 'N’accepter que POST avec `@require_POST` et mettre `{% csrf_token %}` dans le formulaire', 'Contrôler l’en-tête `Referer` dans la vue', 'La marquer `@csrf_exempt` et vérifier la session à la main'], answer: 1, why: 'Dès que la suppression passe en POST, le middleware lui applique les contrôles d’Origin et de jeton.' },
					{ q: 'Comment corriges-tu `api_invite` ?', options: ['Garder `@csrf_exempt` et ajouter `blog.shop.example` à `CSRF_TRUSTED_ORIGINS`', 'Passer le corps de JSON à un formulaire', 'Retirer `@csrf_exempt` et envoyer le jeton dans un en-tête `X-CSRFToken`', 'Demander au front d’envoyer `credentials: "omit"`'], answer: 2, why: 'Sans l’exemption, le middleware contrôle le jeton de l’en-tête, que les appels `fetch()` envoient dans `X-CSRFToken`.' },
					{ q: 'Après le correctif, une page de `blog.shop.example` fait un POST vers `api_invite`. Quel contrôle l’arrête en premier ?', options: ['Le contrôle du jeton ligne 36', 'SameSite=Lax sur le cookie', 'Le contrôle des méthodes sûres ligne 12', 'Le contrôle d’Origin des lignes 21 à 25'], answer: 3, why: '`https://blog.shop.example` n’est ni l’origine de l’appli ni dans `CSRF_TRUSTED_ORIGINS` : le contrôle d’Origin la rejette avant même de lire le jeton.' },
					{ q: 'Pourquoi la page du blog ne peut-elle pas simplement recopier le jeton dans sa requête ?', options: ['Elle ne peut lire ni les pages de `shop.example` ni la valeur `csrftoken`', 'Le jeton change chaque seconde', 'Les navigateurs retirent l’en-tête `X-CSRFToken` entre origines', 'Le jeton est signé avec le mot de passe d’Alice'], answer: 0, why: 'Le jeton est un secret aléatoire des pages et du cookie de `shop.example`. Une autre origine peut faire envoyer une requête, mais pas lire ce secret.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Fais tourner le `CsrfViewMiddleware` de Django sur localhost et regarde-le accepter un GET, ignorer une vue exemptée, et refuser un POST sans jeton ou avec une `Origin` étrangère.',
		steps: [
			'Crée un dossier avec Django dedans : `mkdir -p ~/csrf-lab && cd ~/csrf-lab && python3 -m venv .venv && . .venv/bin/activate && pip install django`.',
			'Écris une appli d’un seul fichier avec trois URL (`/token`, `/email`, et `/invite` marquée `csrf_exempt`) : `printf \'%s\\n\' \'import sys\' \'from django.conf import settings\' \'settings.configure(DEBUG=True, SECRET_KEY="lab", ROOT_URLCONF=__name__, MIDDLEWARE=["django.middleware.csrf.CsrfViewMiddleware"])\' \'from django.http import HttpResponse\' \'from django.middleware.csrf import get_token\' \'from django.urls import path\' \'from django.views.decorators.csrf import csrf_exempt\' \'ok = lambda r: HttpResponse(r.method + " accepted\\n")\' \'urlpatterns = [path("token", lambda r: HttpResponse(get_token(r))), path("email", ok), path("invite", csrf_exempt(ok))]\' \'from django.core.management import execute_from_command_line\' \'execute_from_command_line(sys.argv)\' > app.py`',
			'Lance-la dans le terminal A : `python app.py runserver 8000`. Garde un œil sur son log.',
			'Dans le terminal B, `cd ~/csrf-lab`, puis envoie ce qu’enverrait une requête forgée : `curl -s -o /dev/null -w "%{http_code}\\n" -X POST localhost:8000/email`, puis `curl -s localhost:8000/email`, puis `curl -s -X POST localhost:8000/invite`.',
			'Joue maintenant la vraie page. Récupère un jeton et son cookie : `tok=$(curl -s -c jar -b jar localhost:8000/token); echo "$tok"`. Puis `curl -s -b jar -H "X-CSRFToken: $tok" -X POST localhost:8000/email`.',
			'Envoie la même requête avec une origine étrangère : `curl -s -o /dev/null -w "%{http_code}\\n" -b jar -H "X-CSRFToken: $tok" -H "Origin: http://evil.example" -X POST localhost:8000/email`. Arrête le serveur avec Ctrl+C quand tu as fini.'
		],
		done: [
			'Le POST vers `/email` sans jeton affiche `403`, et le log de A dit `CSRF cookie not set`.',
			'`curl -s localhost:8000/email` affiche `GET accepted`, et le POST vers `/invite` affiche `POST accepted`.',
			'`echo "$tok"` affiche 64 caractères, et le POST avec ce jeton affiche `POST accepted`.',
			'Le POST avec `Origin: http://evil.example` affiche `403`, et le log dit `Origin checking failed`.'
		],
		solution: [
			'Le GET passe car la ligne 12 accepte les méthodes sûres sans contrôle. Une vue qui supprime sur un GET supprimerait ici aussi.',
			'`/invite` passe car `csrf_exempt` sort ligne 7, avant les contrôles d’Origin et de jeton.',
			'Le POST avec jeton passe car l’en-tête `X-CSRFToken` se démasque en le même secret que le cookie `csrftoken` de `jar`. Une page d’un autre site ne peut lire ni l’un ni l’autre.',
			'L’`Origin` étrangère échoue avant même la lecture du jeton : `http://evil.example` n’est ni l’origine de l’appli ni dans `CSRF_TRUSTED_ORIGINS`. Nettoie avec `rm -rf ~/csrf-lab`.'
		]
	},
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
