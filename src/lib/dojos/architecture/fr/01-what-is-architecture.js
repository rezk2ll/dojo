const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'what-is-architecture',
	part: 'Penser en architecte',
	title: 'L’architecture logicielle : les décisions coûteuses à changer',
	minutes: 10,
	hook: [
		'À la question « Django passe-t-il à l’échelle ? », la FAQ de Django répond oui, pour cette raison : Django suit une **architecture « shared-nothing »**, donc tu peux ajouter du matériel à n’importe quel niveau, serveurs de base de données, serveurs de cache ou serveurs web.',
		'Toute appli construite sur Django hérite de cette décision. Un processus Django ne garde rien entre deux requêtes dont un autre processus aurait besoin. Par défaut, Django range les sessions en base, hors de la mémoire du processus. Si tu changes cette règle sur le tard, la moitié de ton code doit bouger.',
		'L’architecture, ce sont les quelques décisions coûteuses à changer plus tard, dont dépendent toutes les autres. En tant qu’architecte, tu prends ces décisions exprès et tu sais ce que chacune coûte.'
	],
	terms: [
		{ term: 'Architecture', def: 'Les décisions difficiles à changer plus tard et qui façonnent tout le reste : comment le système est découpé, où vit l’état, comment les parties se parlent.' },
		{ term: 'Compromis (trade-off)', def: 'Ce que tu abandonnes pour obtenir ce que tu veux. La première loi de l’architecture logicielle dit que chaque décision en a un : « Tout, en architecture logicielle, est un compromis. »' },
		{ term: 'Stateless (sans état)', def: 'Un serveur qui ne garde rien entre les requêtes. N’importe quelle copie peut répondre à n’importe quelle requête, parce que l’état est rangé dans un autre stockage.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['users(["Clients : navigateur et mobile"]) -->|HTTPS| lb["Load balancer"]', 'lb --> app1["Appli Django"]', 'app1 --> db[("PostgreSQL : commandes, sessions")]'],
				highlight: ['users', 'lb', 'app1', 'db'],
				note: 'Une petite boutique en ligne ouvre avec un processus applicatif et une base de données. Les sessions sont stockées en base, parce que Django fait ça par défaut.'
			},
			{
				add: ['app1 --> cache[("Redis : cache partagé")]'],
				highlight: ['cache'],
				note: 'Le trafic augmente, et la boutique met ses pages en cache. Le cache tourne sur un serveur Redis à part, hors de la mémoire de l’appli : chaque processus voit les mêmes pages en cache.'
			},
			{
				add: ['lb --> app2["Appli Django 2"]', 'lb --> app3["Appli Django 3"]', 'app2 --> db', 'app2 --> cache', 'app3 --> db', 'app3 --> cache'],
				highlight: ['app2', 'app3'],
				note: 'Pour le Black Friday, la boutique lance plus de copies de la même appli derrière le load balancer. Ça marche parce que l’appli est **stateless** : n’importe quelle copie sert n’importe quel client, et l’état est dans PostgreSQL et Redis.'
			},
			{
				add: [],
				note: 'Le code n’a pas bougé pendant les trois étapes. Comme le processus applicatif ne garde aucun état, passer d’une machine à trois a demandé un changement de déploiement, sans réécriture.'
			}
		]
	},
	example: {
		title: 'django/conf/global_settings.py',
		repo: 'django/django',
		url: `${DJANGO}/django/conf/global_settings.py#L509-L526`,
		lang: 'python',
		code: `# The module to store session data
SESSION_ENGINE = "django.contrib.sessions.backends.db"
…
# The cache backends to use.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}`,
		notes: [
			'La ligne 2 range les sessions en **base de données** par défaut. N’importe quel processus lit la session de n’importe quel client, donc le load balancer peut envoyer chaque requête à n’importe quelle copie.',
			'Les lignes 4 à 8 mettent le cache en mémoire locale par défaut. La doc de Django : [« chaque processus aura sa propre instance de cache privée, ce qui veut dire qu’aucun cache entre processus n’est possible »](https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2/docs/topics/cache.txt?plain=1#L426-L429). Elle le juge « pratique pour le développement ».',
			'Le réglage des sessions respecte le shared-nothing, et celui du cache le casse dès que tu lances deux copies. Passer le cache sur Redis ou Memcached, c’est un petit changement de configuration le premier jour, et une chasse aux données périmées le jour 300.',
			'Lis les réglages par défaut de ton framework avant de lancer une deuxième copie de l’appli.'
		]
	},
	tradeoff: {
		gain: [
			'Tu passes à l’échelle en ajoutant des copies identiques, et le load balancer peut envoyer chaque requête à n’importe laquelle.',
			'Une copie peut planter ou être remplacée pendant un déploiement sans que les clients perdent leur panier, puisqu’il est en base.'
		],
		cost: [
			'Chaque requête paie un aller-retour réseau vers la base ou le cache, pour un état qui aurait pu rester en mémoire.',
			'Ajouter des copies de l’appli est facile, alors qu’ajouter de la capacité aux serveurs PostgreSQL et Redis partagés est bien plus dur.',
			'Tout ce qui resterait en mémoire, comme un cache local ou un upload en cours, doit être déplacé exprès vers un stockage partagé.'
		]
	},
	task: {
		prompt: 'Sur une plateforme vidéo, un collègue propose de garder les morceaux de vidéo à moitié uploadés dans la mémoire de l’appli jusqu’à la fin de l’upload, parce que c’est plus rapide. Avec l’installation de l’étape 3, qu’est-ce qui casse ?',
		hint: 'Regarde l’étape 3. Quelle copie reçoit le deuxième morceau ?',
		answer: [
			'Le load balancer peut envoyer le morceau 2 à **l’appli 2**, qui n’a jamais vu le morceau 1. L’upload échoue ou le fichier arrive corrompu.',
			'La proposition met de l’état dans le processus applicatif, contre la décision « appli stateless ». Il te faudrait des sticky sessions (toujours la même copie pour un utilisateur donné) ou un stockage partagé pour les morceaux.',
			'Les sticky sessions apportent un nouveau compromis : une copie qui meurt emporte les uploads de ses utilisateurs, et la charge se répartit mal.',
			'En architecte, tu ne te contentes pas de dire non. Tu dis : « ça change une décision sur laquelle on s’appuie, voilà ce que ça coûte, est-ce que ça vaut le coup ? »'
		]
	},
	quiz: [
		{
			q: 'Pourquoi une appli web shared-nothing peut-elle tourner en plusieurs copies identiques derrière un seul load balancer ?',
			options: ['Parce que le load balancer envoie toujours chaque utilisateur vers la même copie, qui ne voit que lui', 'Parce que le load balancer copie la mémoire de session entre les processus applicatifs après chaque requête', 'Parce que le processus ne garde aucun état entre les requêtes, tout vit dans des stockages partagés comme la base de données', 'Parce que chaque copie garde ses sessions en mémoire et les synchronise avec les autres en arrière-plan'],
			answer: 2,
			why: 'Un processus stateless lit tout son état dans les stockages partagés. N’importe quelle copie peut répondre à n’importe quelle requête, donc tu ajoutes des copies pour passer à l’échelle.'
		},
		{
			q: 'Qu’est-ce qui fait d’une décision une décision d’**architecture** ?',
			options: ['Elle est coûteuse à changer plus tard et d’autres décisions en dépendent', 'Elle concerne la stack technique, comme le langage ou le framework', 'Elle a été prise par quelqu’un de senior, comme l’architecte principal', 'Elle est écrite dans un ADR et validée par toute l’équipe'],
			answer: 0,
			why: 'Choisir une bibliothèque peut relever de l’architecture, ou pas. Le critère, c’est le coût d’un changement d’avis plus tard.'
		},
		{
			q: 'Une appli Django tourne en deux processus avec le réglage `CACHES` par défaut. Le processus 1 met une page en cache. La requête suivante pour cette page arrive au processus 2. Que se passe-t-il ?',
			options: ['Le processus 2 lit la page dans la mémoire du processus 1, car ils partagent un cache', 'Django enregistre le cache dans la base de données, donc le processus 2 le lit là', 'La requête échoue avec une erreur, car le processus 1 verrouille l’entrée de cache', 'Le processus 2 rate le cache, parce que chaque processus a son propre cache en mémoire locale'],
			answer: 3,
			why: 'Le `LocMemCache` par défaut est propre à chaque processus. Il garde de l’état dans le processus applicatif, exactement ce que le shared-nothing interdit. Pointe `CACHES` vers un serveur partagé avant de lancer une deuxième copie.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui fait d’une décision une décision d’architecture, et quelle décision de Django sert d’exemple ici ?',
		a: 'Elle coûte cher à changer plus tard et d’autres décisions en dépendent. Dans Django, le processus applicatif ne garde aucun état entre les requêtes (les sessions vont en base), donc tu passes à l’échelle en ajoutant des copies.'
	},
	sources: [
		{ title: 'Django FAQ, Does Django scale?', url: `${DJANGO}/docs/faq/general.txt?plain=1#L55-L66` },
		{ title: 'Django, global_settings.py: session and cache defaults', url: `${DJANGO}/django/conf/global_settings.py#L509-L526` },
		{ title: 'Django docs, Local-memory caching', url: `${DJANGO}/docs/topics/cache.txt?plain=1#L401-L429` },
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed. (O\'Reilly, 2025)', url: 'https://www.developertoarchitect.com/books.html' },
		{ title: 'The laws of software architecture (DevIQ)', url: 'https://deviq.com/laws/laws-software-architecture/' }
	]
};
