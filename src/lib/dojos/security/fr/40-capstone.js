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
		],
		steps: [
			{
				title: 'Dresse le threat model',
				questions: [
					{ q: 'Comment construis-tu le threat model ?', options: ['STRIDE sur la connexion, la réinitialisation, la commande, les envois de fichiers et la récupération « préviens-moi »', 'Un pentest une fois la boutique en ligne', 'Une liste des CVE des dépendances', 'L’ordre des jours de ce dojo'], answer: 0, why: 'Un threat model liste ce qui peut mal tourner pour chaque fonction, qui le ferait, et quel contrôle l’arrête (jour 1).' },
					{ q: 'Où sont les frontières de confiance de cette boutique ?', options: ['Entre l’API et ses propres logs', 'Au navigateur, au webhook de paiement et à l’appel sortant', 'Entre deux membres du staff', 'Entre les tables PostgreSQL'], answer: 1, why: 'Ce sont les trois endroits où des données arrivent d’une partie que tu ne contrôles pas.' },
					{ q: 'Pourquoi le webhook de paiement est-il une frontière de confiance ?', options: ['C’est l’appel le plus lent de la boutique', 'Il parle JSON au lieu de HTML', 'Des données y arrivent d’une partie que tu ne contrôles pas', 'Il tourne dans un autre conteneur'], answer: 2, why: 'N’importe qui peut envoyer une requête à cette URL. Chaque contrôle se place sur la ligne où entrent les données venues de l’extérieur (jour 2).' },
					{ q: 'Qu’est-ce qu’un réglage sûr par défaut ?', options: ['Un réglage que l’attaquant ne voit pas', 'Une valeur à fixer avant le premier démarrage', 'Un réglage coupé tant que tu n’as pas lu la doc', 'Un réglage dont la valeur sans configuration est la valeur sûre'], answer: 3, why: 'Chez Saleor, `HTTP_IP_FILTER_ENABLED` vaut `True` tant que tu ne le coupes pas : un commerçant qui ne lit jamais les réglages est quand même couvert (jour 7).' }
				]
			},
			{
				title: 'Verrouille le navigateur et les comptes',
				questions: [
					{ q: 'Quel cookie de session poses-tu ?', options: ['`Secure` seulement, le reste est facultatif', '`HttpOnly; Secure; SameSite=Lax`, renouvelé à la connexion', '`SameSite=None`, pour que le dashboard marche', 'Pas de cookie : un token dans `localStorage`'], answer: 1, why: 'Les scripts ne peuvent pas le lire, il ne passe qu’en HTTPS, les requêtes cross-site ne l’emportent pas, et un nouveau est émis à la connexion (jour 10).' },
					{ q: 'Quel réglage CORS convient à la boutique ?', options: ['`*`, pour que la boutique marche de partout', 'CORS coupé sur toutes les routes', 'Seulement `localhost`, comme en développement', 'Seulement les origines de la boutique et du dashboard'], answer: 3, why: 'Avec `*`, le handler de Saleor renvoie n’importe quelle origine avec les credentials autorisés. Une courte liste de tes propres origines ferme ça.' },
					{ q: 'Comment les mots de passe des clients sont-ils stockés ?', options: ['En hash SHA-256', 'Chiffrés avec la `SECRET_KEY`', 'En hash Argon2id', 'En hash avec un seul sel pour tout le monde'], answer: 2, why: 'Un hash lent et salé rend chaque essai coûteux pour qui vole la table (jour 9).' },
					{ q: 'Qu’ont les comptes staff en plus du mot de passe ?', options: ['Un TOTP obligatoire', 'Une session plus longue', 'Un CAPTCHA sur chaque page', 'Rien : le staff est de confiance'], answer: 0, why: 'Le staff peut envoyer des fichiers et lire toutes les commandes, donc ses comptes ont besoin d’un second facteur (jour 14).' }
				]
			},
			{
				title: 'Protège les données et les entrées venues de l’extérieur',
				questions: [
					{ q: 'La requête `order` vérifie maintenant le propriétaire. Quelles autres lectures ont besoin du même contrôle ?', options: ['Aucune : la commande est le seul objet privé', 'Seulement les lectures qui modifient des données', 'Chaque lecture d’adresse et de facture aussi', 'Seulement les requêtes du dashboard staff'], answer: 2, why: 'Les adresses et les factures contiennent les mêmes données personnelles que celles que l’IDOR de Saleor a laissé fuiter. Chaque lecture par id a besoin de son propre contrôle propriétaire ou staff (jour 16).' },
					{ q: 'Un envoi staff `mug.svg` contient un `<script>` et passe la vérification du contenu. Qu’est-ce qui protège encore les tokens du dashboard ?', options: ['Rien : le script tourne avec les accès du dashboard', 'Le fichier est servi depuis `media.`, une autre origine que le dashboard', 'Le token d’accès de 5 minutes', 'Le token CSRF du formulaire d’envoi'], answer: 1, why: 'Un script sur `media.` tourne avec les accès de cette origine, pas ceux du dashboard, donc il ne peut pas lire les tokens du staff. Une durée de vie courte ne fait que limiter le temps où un token volé marche (jour 24).' },
					{ q: 'Comment le webhook sait-il qu’un appel vient bien du prestataire de paiement ?', options: ['Il vérifie l’en-tête `User-Agent`', 'Il vérifie l’IP source et rien d’autre', 'Il fait confiance à tout POST avec un corps JSON', 'Il vérifie la signature du prestataire avec une comparaison en temps constant'], answer: 3, why: 'La signature prouve que l’expéditeur détient le secret partagé. Une comparaison en temps constant n’en laisse rien fuiter par le temps de réponse.' },
					{ q: 'Un client donne `http://169.254.169.254/` à « préviens-moi ». Que se passe-t-il ?', options: ['La récupération est refusée : les adresses privées, de loopback et link-local sont bloquées après la résolution DNS', 'Elle est faite, puisque le client l’a demandée', 'Elle est faite seulement en HTTPS', 'Elle est refusée seulement si le nom contient `169`'], answer: 0, why: 'Vérifier après la résolution attrape un nom d’apparence anodine qui pointe vers une adresse interne (jour 20).' }
				]
			},
			{
				title: 'Déploie et prépare l’après-intrusion',
				questions: [
					{ q: 'Comment le conteneur tourne-t-il ?', options: ['En root, avec `SYS_ADMIN` pour la maintenance', 'En non-root, système de fichiers racine en lecture seule, toutes les capabilities retirées', 'Avec `--privileged`, pour garder la config simple', 'Avec les réglages par défaut de Docker'], answer: 1, why: 'Un bug dans l’appli tombe alors dans un processus sans root, sans endroit où écrire et sans pouvoirs en plus (jour 33).' },
					{ q: 'Avec quel niveau Pod Security le namespace est-il étiqueté ?', options: ['`privileged`', '`baseline`', '`restricted`', 'Aucun : le défaut est sûr'], answer: 2, why: 'Sans label, le namespace est en `privileged`. `restricted` fait rejeter par l’API server un Pod qui ne fixe pas `runAsNonRoot: true` ou qui garde ses capabilities (jour 34).' },
					{ q: 'Quelles NetworkPolicy mets-tu en place ?', options: ['Aucune : le cluster est privé', 'Tout l’egress autorisé, l’ingress refusé', 'L’ingress refusé seulement', 'Un refus par défaut, avec seulement l’API autorisée à joindre PostgreSQL'], answer: 3, why: 'Pars fermé, puis ouvre le seul chemin dont la boutique a besoin (jour 35).' },
					{ q: 'Que contient le log d’audit ?', options: ['Les connexions, les échecs et les actions du staff, sans token ni mot de passe', 'Chaque corps de requête, pour relecture', 'Les mots de passe, hachés', 'Rien tant qu’on ne soupçonne pas d’intrusion'], answer: 0, why: 'Le log doit dire qui a fait quoi après une intrusion, et ne doit pas donner d’identifiant valable à qui le lit (jour 36).' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Écrire les contrôles de la boutique de mugs, puis en déployer une tranche pour de vrai : un fichier envoyé servi en téléchargement, depuis un conteneur sans root, sans écriture et sans capabilities.',
		steps: [
			'Écris le plan : `mkdir -p ~/capstone-lab/media && cd ~/capstone-lab`, puis écris `controls.md` pour la boutique de mugs de l’exercice, une ligne par contrôle, chacune terminée par son jour, comme `(jour 24)`.',
			'Dépose un fichier malveillant et écris la config des médias : `printf \'%s\\n\' \'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>\' > media/evil.svg && printf \'%s\\n\' \'server {\' \'    listen 8080;\' \'    location /media/ {\' \'        alias /srv/media/;\' \'        add_header Content-Disposition attachment always;\' \'        add_header X-Content-Type-Options nosniff always;\' \'    }\' \'}\' > default.conf`.',
			'Déploie-le durci : `docker run -d --name capstone-lab --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -p 127.0.0.1:8080:8080 -v "$PWD/default.conf":/etc/nginx/conf.d/default.conf:ro -v "$PWD/media":/srv/media:ro nginxinc/nginx-unprivileged:1.27-alpine`.',
			'Vérifie le contrôle des fichiers envoyés : `curl -sI localhost:8080/media/evil.svg`, puis ouvre `http://localhost:8080/media/evil.svg` dans ton navigateur.',
			'Vérifie les contrôles du déploiement : `docker exec capstone-lab id`, `docker exec capstone-lab touch /etc/x` et `docker exec capstone-lab grep CapEff /proc/1/status`.',
			'Copie `controls.md` ailleurs si tu veux le garder, puis nettoie : `docker rm -f capstone-lab && rm -rf ~/capstone-lab`.'
		],
		done: [
			'`controls.md` a des lignes pour le threat model, le navigateur, les comptes, les données, les entrées venues de l’extérieur, la chaîne d’approvisionnement, le déploiement et l’après-intrusion, chacune avec un jour.',
			'La réponse de `curl` contient `Content-Disposition: attachment` et `X-Content-Type-Options: nosniff`, et le navigateur télécharge le fichier sans alerte.',
			'`id` affiche `uid=101(nginx)`, `touch` échoue avec `Read-only file system`, et `CapEff` vaut `0000000000000000`.'
		],
		solution: [
			'Le SVG contient un script. Servi en ligne depuis l’origine de la boutique, il tournerait avec les accès du dashboard : c’est GHSA-666h. `attachment` fait enregistrer le fichier par le navigateur, et `nosniff` l’empêche de deviner un autre type (jour 24).',
			'Le conteneur montre trois contrôles du jour 33 à la fois : un utilisateur non root fourni par l’image, `--read-only` avec un `tmpfs` seulement pour `/tmp`, et `--cap-drop ALL`. `no-new-privileges` empêche un binaire setuid de retrouver root.',
			'Le reste de `controls.md` ne tient pas dans un conteneur : TLS, cookies, Argon2id, vérification du propriétaire, signature du webhook et NetworkPolicy vivent dans l’appli et le cluster. Garde le fichier comme la liste contre laquelle tu les relis.',
			'En production, les médias passeraient aussi sur `media.`, un autre domaine. Chaque condition suffit contre GHSA-666h, et avoir les deux, c’est la défense en profondeur (jour 4).'
		]
	},
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
