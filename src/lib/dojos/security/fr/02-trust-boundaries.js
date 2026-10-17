const NEXT = 'https://github.com/vercel/next.js/blob/9704c8e9fcc58236349ed787903831579440a879';
const BEFORE = 'https://github.com/vercel/next.js/blob/a43e5711a6c82b3d6000306544107f4e12b194b6';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'trust-boundaries',
	part: 'Les menaces',
	title: 'Les frontières de confiance',
	minutes: 10,
	hook: [
		'Le 21 mars 2025, Next.js publie l’avis GHSA-f82v-jwr5-mffw (CVE-2025-29927), noté 9.1 : « It is possible to bypass authorization checks within a Next.js application, if the authorization check occurs in middleware. » Les correctifs sortent en 15.2.3, 14.2.25, 13.5.9 et 12.3.5.',
		'Next.js marque avec un en-tête, `x-middleware-subrequest`, les requêtes que le middleware envoie à sa propre appli, pour ne pas relancer le middleware dessus. Le serveur lisait cet en-tête sur toutes les requêtes, y compris celles venues d’internet. Un visiteur qui l’envoyait avec la bonne valeur sautait le middleware, et la vérification de connexion avec.',
		'L’en-tête devait venir de l’intérieur du serveur, et le serveur l’acceptait de l’extérieur. Une **frontière de confiance** est la ligne où les données passent d’une partie que tu ne contrôles pas à une partie que tu contrôles. Plus bas : où sont ces lignes dans une requête web, et pourquoi la vérification doit se faire sur la ligne.'
	],
	terms: [
		{ term: 'Frontière de confiance', def: 'Une ligne du flux de données où les données passent d’un composant que tu ne contrôles pas (un navigateur, une autre entreprise, internet) à un composant que tu contrôles (ton proxy, ton appli, ta base).' },
		{ term: 'Donnée non fiable', def: 'Tout ce qui a passé une frontière de confiance sans vérification : l’URL, chaque en-tête, chaque cookie et le corps d’une requête HTTP.' },
		{ term: 'Middleware', def: 'Du code qui tourne sur chaque requête avant le handler de la route. Dans Next.js, beaucoup d’applis s’en servaient pour lire le cookie de session et rediriger les visiteurs non connectés.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['net["Internet : navigateur ou script"] -->|"frontière 1"| proxy["Reverse proxy"]', 'proxy -->|"frontière 2"| srv["Serveur Next.js"]', 'srv --> mw["Middleware : le cookie de session est-il valide ?"]', 'mw --> page["Page /admin"]'],
				highlight: ['net', 'proxy', 'srv'],
				note: 'Une requête passe deux lignes avant d’arriver à ton code : d’internet au proxy, puis du proxy à l’appli. L’expéditeur a choisi chaque en-tête, chaque cookie et chaque octet du corps. Ici, seul le middleware vérifie le cookie avant le rendu de `/admin`.'
			},
			{
				add: ['mw -->|"fetch vers elle-même, x-middleware-subrequest: middleware"| srv'],
				highlight: ['mw'],
				note: 'Quand le middleware récupère lui-même une page de la même appli, Next.js ajoute `x-middleware-subrequest` avec le nom du middleware. Le serveur compte les noms et saute le middleware quand le compte atteint `MAX_RECURSION_DEPTH = 5`, pour couper les boucles. Cet en-tête n’a de sens que pour les requêtes faites dans le processus.'
			},
			{
				add: ['atk["Attaquant : x-middleware-subrequest: middleware x5"] -->|"frontière 1"| proxy'],
				highlight: ['atk'],
				note: 'L’attaquant envoie l’en-tête depuis l’extérieur avec `middleware:middleware:middleware:middleware:middleware`. Le proxy le transmet, le serveur compte 5 noms et répond `x-middleware-next: 1` sans lancer le middleware. `/admin` s’affiche sans aucun cookie.'
			},
			{
				add: ['srv -->|"filterInternalHeaders : supprime sauf si l’id correspond"| mw'],
				highlight: ['srv'],
				note: 'Le correctif se place sur la frontière 2, à la première ligne du handler de requêtes. **`filterInternalHeaders` supprime l’en-tête** sauf si `x-middleware-subrequest-id` porte une valeur aléatoire créée par le serveur au démarrage. L’avis donne un contournement un cran plus haut : bloquer les requêtes externes qui portent `x-middleware-subrequest` avant Next.js.'
			},
			{
				add: ['dj["Django : SECURE_PROXY_SSL_HEADER croit X-Forwarded-Proto"] -.->|"seulement si le proxy le retire"| proxy'],
				highlight: ['dj'],
				note: 'Chaque framework se pose la même question pour les en-têtes posés par un proxy. Django croit `X-Forwarded-Proto` seulement si tu règles `SECURE_PROXY_SSL_HEADER`, et sa doc exige que « Your proxy strips the `X-Forwarded-Proto` header from all incoming requests ». Si le proxy transmet la valeur du client, une requête en HTTP simple peut se dire HTTPS.'
			}
		]
	},
	example: {
		title: 'packages/next/src/server/lib/server-ipc/utils.ts : le correctif retire les en-têtes internes à l’entrée',
		repo: 'vercel/next.js',
		url: `${NEXT}/packages/next/src/server/lib/server-ipc/utils.ts#L40-L72`,
		lang: 'typescript',
		code: `// These are headers that are only used internally and should
// not be honored from the external request
const INTERNAL_HEADERS = [
  'x-middleware-rewrite',
  'x-middleware-redirect',
  'x-middleware-set-cookie',
  'x-middleware-skip',
  'x-middleware-override-headers',
  'x-middleware-next',
  'x-now-route-matches',
  'x-matched-path',
]

export const filterInternalHeaders = (
  headers: Record<string, undefined | string | string[]>
) => {
  for (const header in headers) {
    if (INTERNAL_HEADERS.includes(header)) {
      delete headers[header]
    }

    // If this request didn't origin from this session we filter
    // out the "x-middleware-subrequest" header so we don't skip
    // middleware incorrectly
    if (
      header === 'x-middleware-subrequest' &&
      headers['x-middleware-subrequest-id'] !==
        (globalThis as any)[Symbol.for('@next/middleware-subrequest-id')]
    ) {
      delete headers['x-middleware-subrequest']
    }
  }
}`,
		notes: [
			'Les lignes 3 à 12 listent 8 en-têtes que Next.js utilise entre ses propres parties, et les lignes 18 à 20 suppriment chacun d’eux d’une requête entrante. Avant le correctif, `x-middleware-subrequest` n’avait pas ce traitement.',
			'Les lignes 25 à 31 ne gardent `x-middleware-subrequest` que si `x-middleware-subrequest-id` vaut une valeur rangée sur `globalThis`. Le même commit crée cette valeur au démarrage dans `router-server.ts` avec 8 octets de `crypto.getRandomValues`, et le middleware l’ajoute à ses propres fetch.',
			'[`requestHandlerImpl`](' + NEXT + '/packages/next/src/server/lib/router-server.ts#L180-L184) appelle `filterInternalHeaders(req.headers)` en toute première instruction, sous le commentaire « internal headers should not be honored by the request handler ». Le routage et le middleware passent après : aucun code plus loin ne voit la valeur venue de l’extérieur.',
			'La vérification protégée est dans [`sandbox.ts` avant le correctif](' + BEFORE + '/packages/next/src/server/web/sandbox/sandbox.ts#L94-L114) : elle coupe l’en-tête sur `:`, compte les entrées égales au nom du middleware et renvoie `x-middleware-next: 1` quand le compte atteint 5. Le commit ajoute un test qui envoie exactement cet en-tête et vérifie que la redirection a toujours lieu.'
		]
	},
	tradeoff: {
		gain: [
			'Une seule vérification à l’entrée couvre toutes les routes : `filterInternalHeaders` tourne une fois par requête, avant tout code de l’appli qui lit les en-têtes.',
			'Une liste courte de noms se relit facilement. Les 8 entrées de `INTERNAL_HEADERS` disent quels en-têtes l’extérieur n’a jamais le droit de poser.'
		],
		cost: [
			'Une vérification de frontière qui oublie un en-tête le laisse passer vers toutes les routes derrière. Les applis qui ne vérifiaient la connexion que dans le middleware n’avaient pas de deuxième contrôle, et le postmortem de Vercel dit « We do not recommend Middleware to be the sole method of protecting routes ».',
			'La frontière dépend de ce que tu déploies autour de l’appli. L’avertissement de Django pose trois conditions sur le proxy avant que `SECURE_PROXY_SSL_HEADER` soit sûr, et l’appli ne peut pas les vérifier elle-même.'
		]
	},
	task: {
		prompt: 'Une appli Flask écoute sur `0.0.0.0:8000` derrière nginx en 443. Elle lit `X-User` (posé par un proxy d’authentification après la connexion), prend la valeur la plus à gauche de `X-Forwarded-For` comme IP du client pour sa limite de débit, et nginx a `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Place les frontières de confiance et liste ce qu’un attaquant peut falsifier, avec la parade pour chaque cas.',
		hint: 'Pour chaque en-tête, demande-toi qui l’a écrit en dernier avant que l’appli le lise. Puis demande-toi si une requête peut atteindre le port 8000 sans passer par nginx.',
		answer: [
			'Frontières : d’internet à nginx, puis de nginx à Flask. Tout ce que le client envoie reste non fiable tant que nginx ne l’a pas écrasé ou supprimé.',
			'`X-User` : nginx le transmet tel quel, donc un client peut envoyer `X-User: admin`. Ne le pose que dans le proxy d’authentification, et retire la copie du client avec `proxy_set_header X-User "";`. La doc nginx : si la valeur « is an empty string then this field will not be passed to a proxied server ».',
			'`X-Forwarded-For` : `$proxy_add_x_forwarded_for` ajoute la vraie adresse après ce que le client a envoyé. La valeur la plus à gauche est le texte du client, qui peut changer d’IP à chaque requête et échapper à la limite. Utilise `proxy_set_header X-Forwarded-For $remote_addr;`, ou lis la valeur la plus à droite, celle ajoutée par nginx.',
			'Le port 8000 sur `0.0.0.0` est ouvert sur toutes les interfaces : un attaquant peut contourner nginx et poser n’importe quel en-tête. Attache Flask à `127.0.0.1:8000` ou à un réseau privé que seul nginx atteint.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi un visiteur venu d’internet pouvait-il sauter le middleware de Next.js avant 15.2.3 ?',
			options: [
				'Le middleware tournait après le rendu de la page pour ce chemin',
				'Le cookie de session était signé avec une clé publique dans le dépôt',
				'Le serveur acceptait un en-tête interne venu de l’extérieur',
				'Le proxy gardait /admin en cache et le servait à tout le monde'
			],
			answer: 2,
			why: '`x-middleware-subrequest` ne devait servir qu’aux fetch du middleware lui-même. Le serveur ne le retirait pas des requêtes entrantes : une valeur avec 5 fois le nom du middleware atteignait la limite de récursion, et le serveur renvoyait `x-middleware-next: 1` sans lancer le middleware.'
		},
		{
			q: 'Où doit tourner le code qui retire `x-middleware-subrequest` des requêtes externes ?',
			options: [
				'Dans chaque page qui exige une connexion, avant de lire la session',
				'Dans le middleware lui-même, comme première ligne de code',
				'À la première ligne du handler de requêtes, avant le routage',
				'Dans le navigateur, avant l’envoi de la requête au serveur'
			],
			answer: 2,
			why: 'L’en-tête décide si le middleware tourne, donc le middleware ne peut pas le vérifier : il ne démarre jamais. Le navigateur est du côté de l’attaquant. Le correctif appelle `filterInternalHeaders` en premier dans `requestHandlerImpl`, là où entre chaque requête.'
		},
		{
			q: 'Tu règles `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")` dans Django. Que doit faire le proxy devant ?',
			options: [
				'Retirer tout `X-Forwarded-Proto` du client, puis poser le sien',
				'Transmettre tel quel le `X-Forwarded-Proto` du client à Django',
				'Chiffrer en TLS la connexion entre le proxy et Django',
				'Ajouter `X-Forwarded-Proto` seulement aux requêtes avec un cookie de session'
			],
			answer: 0,
			why: 'Django croit l’en-tête, donc il ne doit venir que du proxy. La doc exige que le proxy « strips the `X-Forwarded-Proto` header from all incoming requests » et ne le pose que pour les requêtes arrivées en HTTPS. Le TLS entre proxy et Django n’empêche pas un en-tête falsifié.'
		}
	],
	recall: {
		q: 'Quel en-tête la CVE-2025-29927 laissait-elle envoyer depuis l’extérieur, et où le correctif le retire-t-il ?',
		a: '`x-middleware-subrequest`. `filterInternalHeaders` le supprime à la première ligne de `requestHandlerImpl`, sauf si `x-middleware-subrequest-id` vaut la valeur aléatoire créée au démarrage.'
	},
	sources: [
		{ title: 'Avis GitHub GHSA-f82v-jwr5-mffw, Authorization Bypass in Next.js Middleware', url: 'https://github.com/advisories/GHSA-f82v-jwr5-mffw' },
		{ title: 'Vercel, Postmortem on Next.js Middleware bypass (25 mars 2025)', url: 'https://vercel.com/blog/postmortem-on-next-js-middleware-bypass' },
		{ title: 'Commit vercel/next.js 9704c8e, Update middleware request header (#77201)', url: 'https://github.com/vercel/next.js/commit/9704c8e9fcc58236349ed787903831579440a879' },
		{ title: 'Doc Django, SECURE_PROXY_SSL_HEADER', url: 'https://docs.djangoproject.com/en/stable/ref/settings/#secure-proxy-ssl-header' },
		{ title: 'Doc nginx, proxy_set_header', url: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header' },
		{ title: 'OWASP Cheat Sheet Series, Input Validation', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html' }
	]
};
