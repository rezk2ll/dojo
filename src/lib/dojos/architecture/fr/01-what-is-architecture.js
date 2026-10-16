const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'what-is-architecture',
	part: 'Penser en architecte',
	title: 'L’architecture, ce sont les décisions coûteuses à changer',
	minutes: 10,
	hook: [
		'À la question « Django passe-t-il à l’échelle ? », la FAQ de Django répond oui, pour cette raison : Django suit une **architecture « shared-nothing »**, donc tu peux ajouter du matériel à n’importe quel niveau, serveurs de base de données, serveurs de cache ou serveurs web.',
		'Cette seule décision façonne chaque appli construite dessus. Un processus Django ne garde rien entre deux requêtes dont un autre processus aurait besoin. Par défaut, les sessions vont en base, pas en mémoire. Change cette règle sur le tard, et la moitié de ton code doit bouger.',
		'Voilà ce qu’est l’architecture : **les quelques décisions coûteuses à changer plus tard, et avec lesquelles toutes les autres décisions doivent vivre**. Ton travail d’architecte, c’est de prendre ces décisions exprès, et de savoir ce que chacune coûte.'
	],
	terms: [
		{ term: 'Architecture', def: 'Les décisions difficiles à changer plus tard et qui façonnent tout le reste : comment le système est découpé, où vit l’état, comment les parties se parlent.' },
		{ term: 'Compromis (trade-off)', def: 'Ce que tu abandonnes pour obtenir ce que tu veux. Chaque décision d’architecture en a un.' },
		{ term: 'Première loi', def: '« Tout, en architecture logicielle, est un compromis. » Si tu crois avoir trouvé une décision sans inconvénient, c’est que tu n’as pas encore trouvé l’inconvénient.' },
		{ term: 'Deuxième loi', def: '« Le pourquoi compte plus que le comment. » N’importe qui peut lire le **comment** dans le code. Seule une décision écrite garde le **pourquoi**.' },
		{ term: 'Stateless (sans état)', def: 'Un serveur qui ne garde rien entre les requêtes. N’importe quelle copie peut répondre à n’importe quelle requête, parce que l’état vit ailleurs.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['users(["Clients : navigateur et mobile"]) -->|HTTPS| lb["Load balancer"]', 'lb --> app1["Appli Django"]', 'app1 --> db[("PostgreSQL : commandes, sessions")]'],
				highlight: ['users', 'lb', 'app1', 'db'],
				note: '**Jour de lancement d’une petite boutique en ligne.** Un processus applicatif, une base de données. Les sessions vivent en base, parce que c’est le comportement par défaut de Django.'
			},
			{
				add: ['app1 --> cache[("Redis : cache partagé")]'],
				highlight: ['cache'],
				note: '**La boutique commence à avoir du monde.** Les pages sont mises en cache. Le cache est un serveur à part, pas la mémoire de l’appli, donc chaque processus voit les mêmes pages en cache.'
			},
			{
				add: ['lb --> app2["Appli Django 2"]', 'lb --> app3["Appli Django 3"]', 'app2 --> db', 'app2 --> cache', 'app3 --> db', 'app3 --> cache'],
				highlight: ['app2', 'app3'],
				note: '**Black Friday.** Lance plus de copies de la même appli derrière le load balancer. Ça ne marche que parce que l’appli est **stateless** : n’importe quelle copie peut servir n’importe quel client, l’état vit dans PostgreSQL et Redis.'
			},
			{
				add: [],
				note: 'Regarde ce qui n’a **pas** changé entre les trois étapes : le code. La décision « pas d’état dans le processus applicatif » est ce qui a fait du passage d’une machine à plusieurs un changement de déploiement, pas une réécriture.'
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
			'Par défaut, les sessions vont en **base de données**. N’importe quel processus peut lire la session de n’importe quel client, donc le load balancer peut envoyer chaque requête n’importe où.',
			'Par défaut, le cache est en **mémoire locale**. La doc de Django le dit sans détour : [« chaque processus aura sa propre instance de cache privée, ce qui veut dire qu’aucun cache entre processus n’est possible »](https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2/docs/topics/cache.txt?plain=1#L426-L429). Elle le juge « pratique pour le développement ».',
			'Donc un réglage par défaut tient la promesse shared-nothing, et l’autre la casse en silence dès que tu lances deux copies. Passer le cache sur Redis ou Memcached, c’est un petit changement de configuration le premier jour, et une chasse aux données périmées le jour 300.',
			'Les réglages par défaut sont aussi des décisions. Lis-les avant de multiplier les copies.'
		]
	},
	tradeoff: {
		gain: [
			'Tu passes à l’échelle en ajoutant des copies. Aucune copie n’est spéciale.',
			'Une copie peut planter ou être remplacée pendant un déploiement, et les clients ne perdent pas leur panier.',
			'Chaque copie est simple : elle lit l’état, fait le travail, écrit l’état, oublie.'
		],
		cost: [
			'Chaque requête paie un aller-retour réseau vers la base ou le cache, pour un état qui aurait pu rester en mémoire.',
			'Les stockages partagés deviennent la partie difficile. Ajouter des copies de l’appli est facile, ajouter de la capacité à la base ne l’est pas.',
			'Tout ce qui voudrait vivre en mémoire, comme un cache local ou un upload en cours, doit être sorti exprès.'
		]
	},
	task: {
		prompt: 'Sur une plateforme vidéo, un collègue propose de garder les morceaux de vidéo à moitié uploadés dans la mémoire de l’appli jusqu’à la fin de l’upload, parce que c’est plus rapide. Avec l’installation de l’étape 3, qu’est-ce qui casse ?',
		hint: 'Regarde l’étape 3. Quelle copie reçoit le deuxième morceau ?',
		answer: [
			'Le load balancer peut envoyer le morceau 2 à **l’appli 2**, qui n’a jamais vu le morceau 1. L’upload échoue ou se corrompt.',
			'Ça casse la décision « appli stateless ». Il te faudrait des sticky sessions (toujours la même copie pour un utilisateur donné) ou un stockage partagé pour les morceaux.',
			'Les sticky sessions sont un nouveau compromis : une copie qui meurt emporte les uploads de ses utilisateurs, et la charge se répartit mal.',
			'Le réflexe d’architecte : pas « non », mais « ça change une décision sur laquelle on s’appuie, voilà ce que ça coûte, est-ce que ça vaut le coup ? »'
		]
	},
	quiz: [
		{
			q: 'Pourquoi une appli web shared-nothing peut-elle tourner en plusieurs copies identiques derrière un seul load balancer ?',
			options: ['Parce que le load balancer envoie toujours chaque utilisateur vers la même copie, qui ne voit que lui', 'Parce que le load balancer copie la mémoire de session entre les processus applicatifs après chaque requête', 'Parce que le processus ne garde aucun état entre les requêtes, tout vit dans des stockages partagés comme la base de données', 'Parce que chaque copie garde ses sessions en mémoire et les synchronise avec les autres en arrière-plan'],
			answer: 2,
			why: 'Des processus stateless sont interchangeables. N’importe quelle copie peut répondre à n’importe quelle requête, donc tu ajoutes des copies pour passer à l’échelle.'
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
	takeaway: 'L’architecture, c’est la courte liste des décisions coûteuses à changer. Pour chacune, sache ce qu’elle t’apporte et ce qu’elle te coûte.',
	sources: [
		{ title: 'Django FAQ, Does Django scale?', url: `${DJANGO}/docs/faq/general.txt?plain=1#L55-L66` },
		{ title: 'Django, global_settings.py: session and cache defaults', url: `${DJANGO}/django/conf/global_settings.py#L509-L526` },
		{ title: 'Django docs, Local-memory caching', url: `${DJANGO}/docs/topics/cache.txt?plain=1#L401-L429` },
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed. (O\'Reilly, 2025)', url: 'https://www.developertoarchitect.com/books.html' },
		{ title: 'The laws of software architecture (DevIQ)', url: 'https://deviq.com/laws/laws-software-architecture/' }
	]
};
