const SALEOR = 'https://github.com/saleor/saleor/blob/0c0e2697cc72aa999f7786ae8aeda7665bd4285f';
const ADV = 'https://github.com/saleor/saleor/security/advisories';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'En production',
	title: 'Projet final : sécuriser une petite boutique',
	minutes: 10,
	hook: [
		'Saleor est une API de commerce open source qui dépasse les 23 000 étoiles sur GitHub. Le 21 janvier 2026, le projet publie GHSA-666h-2p49-pg95 : le staff pouvait envoyer des fichiers HTML et SVG avec du JavaScript, servis depuis le domaine du dashboard, et voler les tokens d’autres membres du staff. Deux jours plus tard arrive GHSA-r6fj-f4r9-36gr : une IDOR qui permettait à n’importe qui, sans compte, d’extraire les e-mails, adresses et numéros de téléphone d’anciennes commandes.',
		'En avril 2024, GHSA-ff69-fwjf-3c9w signalait un contournement de la protection CSRF dans la mutation `refreshToken`, avec un score de 4.2. Chacun de ces avis correspond à un jour de ce dojo : l’envoi de fichiers (jour 24), le XSS (jour 18), l’autorisation (jour 16), le CSRF (jour 11).',
		'Pas de nouvelle attaque aujourd’hui. Tu sécurises une petite boutique, du threat model au déploiement, et chaque choix renvoie au jour d’où il vient.'
	],
	terms: [
		{ term: 'Threat model', def: 'Une liste écrite de ce qui peut mal tourner dans une fonctionnalité, de qui le ferait, et du contrôle qui l’arrête (jour 1).' },
		{ term: 'Frontière de confiance', def: 'Une ligne où les données passent d’une partie que tu ne contrôles pas à une partie que tu contrôles, comme du navigateur à l’API. Chaque vérification se place sur cette ligne (jour 2).' },
		{ term: 'Réglage sûr par défaut', def: 'Un réglage dont la valeur, sans aucune configuration, est la valeur sûre. Chez Saleor, `HTTP_IP_FILTER_ENABLED` vaut `True` tant que tu ne le coupes pas (jour 7).' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['browser["Navigateur : boutique et dashboard du staff"] -->|"HTTPS, cookie HttpOnly + Secure + SameSite"| api["API de la boutique"]'],
				highlight: ['browser', 'api'],
				note: 'La première frontière de confiance sépare le navigateur de l’API. TLS protège le trafic (jour 27). Le cookie de session est `HttpOnly`, `Secure` et `SameSite` (jour 10), des tokens CSRF protègent les changements d’état (jour 11), et CORS n’autorise que les origines de la boutique.'
			},
			{
				add: ['api --> login["Connexion : hash Argon2, limite par compte et par IP, TOTP pour le staff"]'],
				highlight: ['login'],
				note: 'Les mots de passe sont stockés avec un hash lent et salé (jour 9). Les tentatives de connexion sont limitées par compte et par IP (jour 15), et les comptes du staff demandent un second facteur (jour 14). Saleor bloque par défaut la demande de réinitialisation de mot de passe pendant 15 minutes par utilisateur.'
			},
			{
				add: ['api -->|"requêtes paramétrées, vérification du propriétaire à chaque id de commande"| db[("Base de données")]'],
				highlight: ['db'],
				note: 'Les requêtes prennent des paramètres, jamais de concaténation de chaînes (jour 17). Chaque lecture de commande vérifie que la commande appartient à l’appelant ou que l’appelant fait partie du staff (jour 16). L’avis IDOR de Saleor en 2026 montre ce qui arrive quand cette vérification manque.'
			},
			{
				add: ['api --> media[("Fichiers sur media.shop.example, Content-Disposition: attachment")]', 'api -->|"URL de webhook, IP privées refusées"| hook["Webhooks des partenaires"]'],
				highlight: ['media', 'hook'],
				note: 'Les fichiers envoyés sont vérifiés sur leur contenu et servis depuis un autre domaine avec `Content-Disposition: attachment` (jour 24), les deux conditions de GHSA-666h. Les appels de webhook sortants refusent les adresses privées et de loopback : une URL de webhook ne peut pas atteindre `169.254.169.254` (jour 20).'
			},
			{
				add: ['deploy["Déploiement : secrets d’un secret manager, conteneur non-root en lecture seule, NetworkPolicy"] -.-> api', 'api -.-> logs[("Log d’audit et alertes Falco")]'],
				highlight: ['deploy', 'logs'],
				note: 'Le `SECRET_KEY` et le mot de passe de la base viennent d’un secret manager, jamais de git (jours 25 et 26). Le conteneur tourne en non-root avec un système de fichiers racine en lecture seule (jour 33), et une NetworkPolicy ne laisse que l’API joindre la base (jour 35). Les connexions et les actions d’administration vont dans un log d’audit (jour 36), et Falco surveille les nœuds (jour 37).'
			}
		]
	},
	example: {
		title: 'saleor/settings.py : les réglages de sécurité d’une boutique open source',
		repo: 'saleor/saleor',
		url: `${SALEOR}/saleor/settings.py#L86-L1130`,
		lang: 'python',
		code: `DEBUG = get_bool_from_env("DEBUG", True)
…
ALLOWED_CLIENT_HOSTS = os.environ.get("ALLOWED_CLIENT_HOSTS")
if not ALLOWED_CLIENT_HOSTS:
    if DEBUG:
        ALLOWED_CLIENT_HOSTS = _DEFAULT_CLIENT_HOSTS
    else:
        raise ImproperlyConfigured(
            "ALLOWED_CLIENT_HOSTS environment variable must be set when DEBUG=False."
        )
…
if ENABLE_SSL:
    SECURE_SSL_REDIRECT = not DEBUG
…
# Make this unique, and don't share it with anybody.
SECRET_KEY = os.environ.get("SECRET_KEY")
…
if not SECRET_KEY and DEBUG:
    warnings.warn(
        "SECRET_KEY not configured, using a random temporary key.", stacklevel=1
    )
    SECRET_KEY = get_random_secret_key()
…
ALLOWED_HOSTS = get_list(os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1"))
ALLOWED_GRAPHQL_ORIGINS: list[str] = get_list(
    os.environ.get("ALLOWED_GRAPHQL_ORIGINS", "*")
)
…
# When \`True\`, HTTP requests made from arbitrary URLs will be rejected (e.g., webhooks).
# if they try to access private IP address ranges, and loopback ranges (unless
# \`HTTP_IP_FILTER_ALLOW_LOOPBACK_IPS=False\`).
HTTP_IP_FILTER_ENABLED: bool = get_bool_from_env("HTTP_IP_FILTER_ENABLED", True)

# When \`False\` it rejects loopback IPs during external calls.
# Refer to \`HTTP_IP_FILTER_ENABLED\` for more details.
HTTP_IP_FILTER_ALLOW_LOOPBACK_IPS: bool = get_bool_from_env(
    "HTTP_IP_FILTER_ALLOW_LOOPBACK_IPS", False
)
…
JWT_TTL_ACCESS = datetime.timedelta(
    seconds=parse(os.environ.get("JWT_TTL_ACCESS", "5 minutes"))
)
JWT_TTL_APP_ACCESS = datetime.timedelta(
    seconds=parse(os.environ.get("JWT_TTL_APP_ACCESS", "5 minutes"))
)
JWT_TTL_REFRESH = datetime.timedelta(
    seconds=parse(os.environ.get("JWT_TTL_REFRESH", "30 days"))
)
…
# Lock time for request password reset mutation per user (seconds)
RESET_PASSWORD_LOCK_TIME = parse(
    os.environ.get("RESET_PASSWORD_LOCK_TIME", "15 minutes")
)`,
		notes: [
			'`DEBUG` vaut `True` par défaut : chaque déploiement doit poser `DEBUG=False`. Avec `DEBUG` coupé, Saleor refuse de démarrer tant que `ALLOWED_CLIENT_HOSTS` n’est pas posé, et il n’invente un `SECRET_KEY` aléatoire que si `DEBUG` est actif (jour 7).',
			'`ALLOWED_GRAPHQL_ORIGINS` vaut `*` par défaut. Dans [`cors_handler.py`](' + SALEOR + '/saleor/asgi/cors_handler.py#L31-L53), `fnmatchcase` fait correspondre toute origine à `*` et la renvoie avec `access-control-allow-credentials: true`. L’avis CSRF de 2024 dit que les navigateurs bloquent l’attaque grâce à CORS « unless configured to allow all hosts », sauf si on autorise tous les hôtes.',
			'`HTTP_IP_FILTER_ENABLED` est actif par défaut : les appels de webhook vers les plages privées et de loopback sont rejetés. Tu as la défense SSRF du jour 20 sans écrire de configuration.',
			'Les tokens d’accès vivent 5 minutes et les refresh tokens 30 jours. Un token d’accès volé expire 5 minutes après son émission, ce qui compte parce qu’un JWT ne se révoque pas tout seul (jour 13). C’est le refresh token qu’il faut protéger, et c’est lui que visait l’avis CSRF de 2024.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque contrôle correspond à un avis ou à un jour : un relecteur peut cocher la liste point par point face au code.',
			'Des réglages sûrs par défaut comme `HTTP_IP_FILTER_ENABLED=True` et le token d’accès de 5 minutes protègent une boutique dont le propriétaire n’a jamais lu les réglages.',
			'Servir les fichiers envoyés depuis un domaine séparé bloque le XSS de GHSA-666h même si un fichier malveillant passe les vérifications d’envoi.'
		],
		cost: [
			'`DEBUG=True` et `ALLOWED_GRAPHQL_ORIGINS="*"` rendent le premier lancement local facile, et sont dangereux en production. Chaque déploiement doit les changer.',
			'Un second domaine pour les médias, c’est un nom DNS, un certificat TLS et une config de CDN ou de proxy de plus à tenir à jour.',
			'Les limites de débit, l’étape TOTP du staff et le blocage de 15 minutes sur la réinitialisation ralentissent les utilisateurs honnêtes qui se trompent ou oublient.'
		]
	},
	task: {
		prompt: 'Le kata. Une amie vend des mugs en ligne. La boutique a des comptes clients, un dashboard pour le staff, des photos de produits envoyées par le staff, le paiement par carte via un prestataire qui appelle ton webhook, et une fonction « préviens-moi » qui récupère une URL donnée par le client. Elle tourne dans un seul conteneur sur Kubernetes, avec PostgreSQL. Écris le threat model et les contrôles, une ligne par contrôle, chacune avec le jour d’où elle vient.',
		hint: 'Suis la requête : du navigateur à l’API, la connexion, la base, les fichiers envoyés et les appels sortants, puis le déploiement et ce qui se passe après une intrusion.',
		answer: [
			'Threat model (jour 1) : STRIDE sur la connexion, la réinitialisation du mot de passe, la commande, les envois de fichiers et la récupération « préviens-moi ». Frontières de confiance au navigateur, au webhook de paiement et à l’appel sortant (jour 2).',
			'Du navigateur à l’API : HTTPS seulement (jour 27). Cookie de session `HttpOnly; Secure; SameSite=Lax`, renouvelé à la connexion (jour 10). Token CSRF sur chaque formulaire (jour 11). CSP avec un nonce sur le dashboard (jour 19). CORS limité aux origines de la boutique et du dashboard, jamais `*`.',
			'Comptes : hash Argon2id des mots de passe (jour 9). Connexion limitée par IP et par compte, avec un blocage qui ne permet pas à un attaquant de bloquer les vrais clients (jour 15). TOTP obligatoire pour le staff (jour 14). Tokens de réinitialisation à usage unique, de courte durée, tirés de `secrets` (jour 39).',
			'Données : requêtes paramétrées uniquement (jour 17). Chaque lecture de commande, d’adresse ou de facture vérifie le propriétaire ou un rôle staff (jour 16). Sortie échappée selon le contexte, texte riche nettoyé (jour 18).',
			'Entrées venues de l’extérieur : fichiers vérifiés sur leur contenu, taille plafonnée, ré-encodés, stockés hors de la racine web et servis depuis `media.` avec `Content-Disposition: attachment` (jour 24). Le webhook vérifie la signature du prestataire avec une comparaison en temps constant. La récupération « préviens-moi » refuse les adresses privées, de loopback et link-local après la résolution DNS (jour 20).',
			'Chaîne d’approvisionnement et secrets : lockfile et `npm ci` ou `pip --require-hashes` (jour 30), scan des dépendances (jour 29), images signées (jour 31). Secrets dans un secret manager, jamais dans git ni dans l’image (jours 25 et 26).',
			'Déploiement : non-root, système de fichiers racine en lecture seule, toutes les capabilities retirées (jour 33), namespace étiqueté `restricted` (jour 34), NetworkPolicy en refus par défaut qui ne laisse que l’API joindre PostgreSQL (jour 35).',
			'Après une intrusion : log d’audit des connexions, des échecs et des actions du staff, sans token ni mot de passe (jour 36). Falco sur les nœuds (jour 37). Un runbook écrit : qui coupe les accès, quels secrets faire tourner dans quel ordre, qui prévient les clients (jour 38).'
		]
	},
	quiz: [
		{
			q: 'Le client A demande `order(id: 1042)`, et la commande 1042 appartient au client B. Quelle vérification arrête cette IDOR ?',
			options: [
				'Prendre des UUID aléatoires comme ids de commande, pour qu’on ne les devine pas',
				'Dans le resolver, vérifier que l’appelant possède la commande ou fait partie du staff',
				'Exiger un cookie de session valide avant toute requête GraphQL',
				'Limiter la requête `order` à 10 appels par minute et par IP'
			],
			answer: 1,
			why: 'Une IDOR est une vérification manquante au niveau de l’objet : le serveur trouve la commande par son id et ne demande jamais à qui elle est. Une session prouve qui appelle, pas que la commande lui appartient. Les ids aléatoires et les limites de débit ralentissent seulement la devinette.'
		},
		{
			q: 'Le staff peut envoyer des images de produits. D’après GHSA-666h, quelle installation échappe au XSS stocké ?',
			options: [
				'Les médias sous `example.com/media/`, à côté du dashboard sur `example.com/dashboard/`',
				'Les médias sur `media.example.com`, ou servis avec `Content-Disposition: attachment`',
				'Les médias sous `example.com/media/`, derrière un CDN avec un long cache',
				'Les médias sous `example.com/media/`, avec des noms de fichiers remplacés par des UUID'
			],
			answer: 1,
			why: 'Un fichier HTML ou SVG servi depuis l’origine du dashboard exécute son script avec les droits de cette origine, tokens du staff compris. Un autre domaine est une autre origine, et `Content-Disposition: attachment` fait télécharger le fichier au lieu de l’afficher.'
		},
		{
			q: 'Ton déploiement Saleor garde la valeur par défaut de `ALLOWED_GRAPHQL_ORIGINS`. Que fait le handler CORS d’une requête venue de `https://evil.example` ?',
			options: [
				'Il la rejette, car la liste par défaut ne contient que `localhost`',
				'Il l’accepte mais retire les cookies, car l’origine est inconnue',
				'Il fait correspondre `*` et renvoie l’origine avec les credentials autorisés',
				'Il demande un preflight au navigateur puis renvoie toujours 400'
			],
			answer: 2,
			why: 'La valeur par défaut est `*`, et `fnmatchcase("https://evil.example", "*")` est vrai. Le handler renvoie alors `access-control-allow-origin: https://evil.example` avec `access-control-allow-credentials: true`. En production, pose la variable avec les origines de ta boutique et de ton dashboard.'
		}
	],
	recall: {
		q: 'Cite les trois avis Saleor de ce chapitre et le jour qui correspond à chacun.',
		a: 'GHSA-666h, XSS stocké via des fichiers HTML et SVG envoyés (jours 18 et 24). GHSA-r6fj, IDOR sur d’anciennes commandes (jour 16). GHSA-ff69, contournement CSRF dans `refreshToken` (jour 11).'
	},
	sources: [
		{ title: 'GHSA-666h-2p49-pg95, Saleor : Stored XSS via Unrestricted File Uploads', url: `${ADV}/GHSA-666h-2p49-pg95` },
		{ title: 'GHSA-r6fj-f4r9-36gr, Saleor : Insecure Direct Object Reference (IDOR) in GraphQL API', url: `${ADV}/GHSA-r6fj-f4r9-36gr` },
		{ title: 'GHSA-ff69-fwjf-3c9w, Saleor : CSRF bypass in refreshToken mutation', url: `${ADV}/GHSA-ff69-fwjf-3c9w` },
		{ title: 'Source Saleor, saleor/settings.py', url: `${SALEOR}/saleor/settings.py` },
		{ title: 'Source Saleor, saleor/asgi/cors_handler.py', url: `${SALEOR}/saleor/asgi/cors_handler.py` }
	]
};
