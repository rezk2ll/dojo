const DJ = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const BASE = `${DJ}/django/core/checks/security/base.py`;
const STARTPROJECT = `${DJ}/django/core/management/commands/startproject.py`;
const REDIS_CONF = 'https://github.com/redis/redis/blob/e0bb9316848db7950c2b18cdc59c2058f62b8a3d/redis.conf';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'secure-defaults',
	part: 'Les menaces',
	title: 'Les réglages sûrs par défaut',
	minutes: 10,
	hook: [
		'En novembre 2015, Salvatore Sanfilippo, l’auteur de Redis, attaque depuis une autre machine le Redis qui tourne sur son propre portable. Le serveur n’a pas de mot de passe. Avec les commandes de Redis lui-même, `CONFIG SET` et `SAVE`, il écrit sa clé SSH dans le dossier `.ssh` du portable. Il se connecte ensuite en SSH "in like five seconds", en cinq secondes environ.',
		'Il raconte qu’après la publication de cette attaque, "several Redis instances were compromised around the globe". Il parle d’instances exposées "unintentionally" : sans pare-feu, sans mot de passe, sans bind sur 127.0.0.1. Lancé sans fichier de config, `redis-server` écoutait sur toutes les interfaces et ne demandait aucun mot de passe.',
		'Redis 3.2 ajoute le **protected mode** : sans mot de passe, le serveur n’accepte que les connexions venues de la même machine.'
	],
	terms: [
		{ term: 'Réglage sûr par défaut', def: 'Un réglage dont la valeur d’origine est la valeur sûre : la personne qui n’y touche jamais reste protégée. Le `protected-mode yes` de Redis en est un.' },
		{ term: 'Protected mode', def: 'Un réglage Redis, actif par défaut depuis la 3.2. Quand l’utilisateur par défaut n’a pas de mot de passe, Redis n’accepte que les connexions de 127.0.0.1, de ::1 ou d’un socket Unix.' },
		{ term: 'check --deploy', def: 'La commande Django `manage.py check --deploy`. Elle lance les contrôles en plus, enregistrés avec `deploy=True`, qui testent des réglages comme `DEBUG`, `ALLOWED_HOSTS` et `SECRET_KEY`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['new["django-admin startproject shop"] --> tpl["settings.py : DEBUG = True, ALLOWED_HOSTS = [], SECRET_KEY = django-insecure-..."]'],
				highlight: ['new', 'tpl'],
				note: 'Le modèle de projet écrit `DEBUG = True` et `ALLOWED_HOSTS = []`. `startproject` génère une clé de 50 caractères et la préfixe par `django-insecure-`. Le commentaire du modèle qualifie ces réglages de "unsuitable for production", inadaptés à la production.'
			},
			{
				add: ['tpl -->|"copié tel quel sur le serveur"| prod["Production : DEBUG toujours à True"]'],
				highlight: ['prod'],
				note: 'L’équipe copie le fichier sur le serveur. Les requêtes vers `shop.example.com` échouent : avec une liste vide, Django n’accepte que `.localhost`, `127.0.0.1` et `[::1]`. Quelqu’un ajoute `ALLOWED_HOSTS = ["shop.example.com"]`, le site répond, et `DEBUG = True` reste en place.'
			},
			{
				add: ['prod -->|"requête qui lève une exception"| page["Page d’erreur : traceback, variables locales, réglages"]'],
				highlight: ['page'],
				note: 'Toute requête qui lève une exception reçoit la page de debug. Selon la doc, elle laisse fuiter "excerpts of your source code, local variables, settings, libraries used" : des extraits de code, les variables locales, les réglages, les bibliothèques. Django masque les réglages dont le nom contient `KEY`, `SECRET`, `PASS`, `TOKEN`, `API` ou `SIGNATURE`, mais les chemins de fichiers restent visibles.'
			},
			{
				add: ['ci["CI : manage.py check --deploy --fail-level WARNING"] -.->|"W018, W020, W009 : le build échoue"| prod'],
				highlight: ['ci'],
				note: 'Les contrôles de déploiement signalent `security.W018` pour `DEBUG`, `security.W020` pour la liste d’hôtes vide et `security.W009` pour la clé `django-insecure-`. Ce sont des avertissements, et le niveau d’échec par défaut est `ERROR`. Avec `--fail-level WARNING`, la commande sort avec un code non nul et le pipeline s’arrête.'
			}
		]
	},
	example: {
		title: 'django/core/checks/security/base.py : trois contrôles de déploiement',
		repo: 'django/django',
		url: `${BASE}#L255-L304`,
		lang: 'python',
		code: `def _check_secret_key(secret_key):
    return (
        len(set(secret_key)) >= SECRET_KEY_MIN_UNIQUE_CHARACTERS
        and len(secret_key) >= SECRET_KEY_MIN_LENGTH
        and not secret_key.startswith(SECRET_KEY_INSECURE_PREFIX)
    )


@register(Tags.security, deploy=True)
def check_secret_key(app_configs, **kwargs):
    try:
        secret_key = settings.SECRET_KEY
    except (ImproperlyConfigured, AttributeError):
        passed_check = False
    else:
        passed_check = _check_secret_key(secret_key)
    return [] if passed_check else [W009]

…
@register(Tags.security, deploy=True)
def check_debug(app_configs, **kwargs):
    passed_check = not settings.DEBUG
    return [] if passed_check else [W018]

…
@register(Tags.security, deploy=True)
def check_allowed_hosts(app_configs, **kwargs):
    return [] if settings.ALLOWED_HOSTS else [W020]`,
		notes: [
			'`_check_secret_key` exige au moins 50 caractères, dont au moins 5 différents, et pas de préfixe `django-insecure-`. [`startproject.py`](' + STARTPROJECT + '#L18-L19) ajoute ce préfixe à chaque clé générée : un projet neuf échoue à W009 tant que personne ne remplace la clé.',
			'`check_debug` ne passe que si `not settings.DEBUG` est vrai. Le message de W018 : "You should not have DEBUG set to True in deployment."',
			'`check_allowed_hosts` vérifie seulement que la liste n’est pas vide. `ALLOWED_HOSTS = [\'*\']` passe W020, et la doc te rend alors "responsible to provide your own validation of the Host header", responsable de valider toi-même l’en-tête Host.',
			'`deploy=True` sur `@register` exclut ces contrôles d’un simple `manage.py check`. Tu ne les obtiens qu’avec `--deploy`, que la doc conseille de lancer sur le module de réglages de production.',
			'Redis applique la même idée dans sa config. [`redis.conf`](' + REDIS_CONF + '#L102-L112) livre `protected-mode yes` : sans mot de passe, "the server only accepts local connections", même si quelqu’un supprime la ligne `bind 127.0.0.1 -::1`.'
		]
	},
	tradeoff: {
		gain: [
			'Le protected mode protège la personne qui supprime la ligne `bind`. Sanfilippo écrit que les utilisateurs bloqués "just drop the bind line and restart", retirent la ligne et redémarrent.',
			'`check --deploy` transforme la checklist de déploiement en une commande qu’un job de CI lance à chaque build.'
		],
		cost: [
			'En 2015, Sanfilippo laisse `redis-server` sans arguments écouter sur toutes les interfaces. Obliger les développeurs à reconfigurer un serveur pour accepter d’autres machines "is kinda a big price to pay", écrit-il.',
			'Une valeur sûre peut casser le premier déploiement : avec `DEBUG = False` et un `ALLOWED_HOSTS` vide, Django répond "Bad Request (400)" à toutes les requêtes.',
			'`check --deploy` ne lit que les réglages Django : `ALLOWED_HOSTS = [\'*\']` et un mot de passe de base faible passent tous les deux.'
		]
	},
	task: {
		prompt: 'Un fichier de réglages de production contient `SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]` (une valeur aléatoire de 64 caractères), `DEBUG = os.environ.get("DJANGO_DEBUG", "False")` et `ALLOWED_HOSTS = ["*"]`. `DJANGO_DEBUG` n’est pas défini sur le serveur. Lesquels de W009, W018 et W020 `check --deploy` affiche-t-il ? Le mode debug est-il actif ?',
		hint: 'Relis `check_debug` : que vaut `not "False"` en Python ? Puis relis `check_allowed_hosts` : que teste-t-il ?',
		answer: [
			'W009 : non. La clé fait 64 caractères aléatoires sans préfixe `django-insecure-`, donc `_check_secret_key` passe.',
			'W018 : oui, et le mode debug est actif. `os.environ.get` renvoie la chaîne `"False"`, une chaîne non vide est vraie en Python, donc `not settings.DEBUG` est faux. Correction : `DEBUG = os.environ.get("DJANGO_DEBUG") == "1"`, qui vaut `False` si la variable manque.',
			'W020 : non. `["*"]` est une liste non vide, donc le contrôle passe. Le joker accepte n’importe quel en-tête `Host`, ce que le contrôle ne voit pas. Correction : liste les vrais noms, par exemple `ALLOWED_HOSTS = ["shop.example.com"]`.',
			'Lance-le en CI avec `python manage.py check --deploy --fail-level WARNING`, pour que W018 bloque le déploiement.'
		]
	},
	quiz: [
		{
			q: 'Tu lances `manage.py check --deploy` sur un projet tout juste créé par `startproject`. Lesquels de W009 (clé secrète), W018 (DEBUG) et W020 (ALLOWED_HOSTS) apparaissent ?',
			options: [
				'Seulement W018, car la clé générée fait 50 caractères aléatoires',
				'W018 et W020, car une clé générée est toujours acceptée',
				'Les trois, car le modèle est risqué sur ces trois réglages',
				'Aucun, car le modèle vise le développement et saute les contrôles'
			],
			answer: 2,
			why: '`startproject` préfixe la clé par `django-insecure-`, ce que `_check_secret_key` refuse. Le modèle met `DEBUG = True` et `ALLOWED_HOSTS = []`, qui échouent à `check_debug` et `check_allowed_hosts`.'
		},
		{
			q: '`check --deploy` affiche W018 dans ton job de CI, mais le job reste vert. Pourquoi ?',
			options: [
				'W018 ne s’affiche que pour les modules de réglages locaux',
				'Les contrôles tournent après le déploiement, donc le code de sortie est ignoré',
				'Le `--fail-level` par défaut est `ERROR`, et W018 est un avertissement',
				'Les runners de CI mettent `DEBUG` à False avant la commande'
			],
			answer: 2,
			why: 'La doc : `--fail-level` "Specifies the message level that will cause the command to exit with a non-zero status. Default is ERROR." Les contrôles de sécurité de déploiement sont des objets `Warning` : il faut `--fail-level WARNING` pour faire échouer le job.'
		},
		{
			q: 'Un serveur Redis tourne avec `protected-mode yes`, sans mot de passe, et la ligne `bind` supprimée. Un client sur une autre machine se connecte. Que se passe-t-il ?',
			options: [
				'Le client se connecte et lance n’importe quelle commande, comme avant Redis 3.2',
				'Le client se connecte mais ne peut lancer que des lectures comme GET',
				'Redis refuse le client, car il n’accepte que les connexions locales',
				'Redis demande un mot de passe au client et le crée à la première connexion'
			],
			answer: 2,
			why: '`redis.conf` indique qu’avec le protected mode actif et un utilisateur par défaut sans mot de passe, "the server only accepts local connections", depuis 127.0.0.1, ::1 ou un socket Unix. Supprimer `bind` fait écouter Redis sur toutes les interfaces, mais le protected mode refuse toujours les clients distants.'
		}
	],
	recall: {
		q: 'Quels trois réglages de `startproject` `check --deploy` signale-t-il, et quelle option fait échouer un job de CI sur ces avertissements ?',
		a: '`DEBUG = True` (W018), le `ALLOWED_HOSTS` vide (W020) et la clé `django-insecure-` (W009). `--fail-level WARNING` fait sortir la commande avec un code non nul.'
	},
	sources: [
		{ title: 'Salvatore Sanfilippo, A few things about Redis security (2015)', url: 'http://antirez.com/news/96' },
		{ title: 'Code source de Redis, redis.conf (bind et protected-mode)', url: 'https://github.com/redis/redis/blob/e0bb9316848db7950c2b18cdc59c2058f62b8a3d/redis.conf' },
		{ title: 'Doc Django, Deployment checklist', url: 'https://docs.djangoproject.com/en/stable/howto/deployment/checklist/' },
		{ title: 'Doc Django, django-admin check', url: 'https://docs.djangoproject.com/en/stable/ref/django-admin/' },
		{ title: 'Doc Django, réglages (DEBUG, ALLOWED_HOSTS)', url: 'https://docs.djangoproject.com/en/stable/ref/settings/' }
	]
};
