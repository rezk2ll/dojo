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
		],
		steps: [
			{
				title: 'Lis l’installation',
				questions: [
					{ q: 'À l’étape 3, combien de copies de l’appli Django tournent derrière le load balancer ?', options: ['Une', 'Deux', 'Trois', 'Six'], answer: 2, why: 'L’étape 3 ajoute l’appli 2 et l’appli 3 à côté de la première, toutes derrière le même load balancer.' },
					{ q: 'Où la boutique garde-t-elle son état à l’étape 3 ?', options: ['Dans la mémoire de chaque processus applicatif', 'Dans PostgreSQL et Redis', 'Dans le load balancer', 'Dans le navigateur des clients'], answer: 1, why: 'L’appli est **stateless** : sessions et commandes sont dans PostgreSQL, les pages en cache dans Redis.' },
					{ q: 'À quelle copie le load balancer peut-il envoyer une requête donnée ?', options: ['À n’importe laquelle des trois copies', 'Toujours à l’appli 1', 'À la copie qui a servi cet utilisateur la dernière fois', 'À la copie qui a le plus de mémoire'], answer: 0, why: 'N’importe quelle copie sert n’importe quel client, donc le load balancer est libre de choisir.' },
					{ q: 'Que change la proposition du collègue dans cette installation ?', options: ['Le nombre de copies de l’appli', 'La base de données de la boutique', 'La façon dont le load balancer choisit une copie', 'L’endroit où vivent les morceaux à moitié uploadés : la mémoire de l’appli'], answer: 3, why: 'La proposition met de l’état dans le processus applicatif, le seul endroit que l’étape 3 laisse vide.' }
				]
			},
			{
				title: 'Suis les morceaux',
				questions: [
					{ q: 'Le morceau 1 arrive sur l’appli 1 et reste dans sa mémoire. Où peut arriver le morceau 2 ?', options: ['Seulement sur l’appli 1', 'Sur n’importe laquelle des trois copies, appli 2 comprise', 'Dans Redis, tout seul', 'Dans PostgreSQL, tout seul'], answer: 1, why: 'Rien n’attache un utilisateur à une copie, donc le load balancer peut envoyer le morceau 2 n’importe où.' },
					{ q: 'Le morceau 2 arrive sur l’appli 2. Que sait l’appli 2 du morceau 1 ?', options: ['Rien : le morceau 1 est dans la mémoire de l’appli 1', 'Tout : Django synchronise la mémoire entre processus', 'Elle lit le morceau 1 dans PostgreSQL', 'Elle demande le morceau 1 au load balancer'], answer: 0, why: 'Un processus garde sa mémoire pour lui. L’appli 2 n’a jamais vu le morceau 1.' },
					{ q: 'Qu’obtient l’utilisateur ?', options: ['Un upload plus lent qui marche quand même', 'Un upload qui marche une fois le cache chaud', 'Un upload qui échoue ou un fichier corrompu', 'Un upload qui marche, relancé sur l’appli 1'], answer: 2, why: 'Le morceau 2 arrive sur une copie qui n’a jamais vu le morceau 1, donc le fichier ne peut pas être reconstitué.' },
					{ q: 'Quel réglage par défaut de Django a le même défaut que la proposition ?', options: ['`SESSION_ENGINE` avec le backend `db`', 'Le `LocMemCache` par défaut dans `CACHES`', 'Le cache Redis de l’étape 2', 'La table des commandes dans PostgreSQL'], answer: 1, why: 'Avec `LocMemCache`, chaque processus a son propre cache privé. L’état reste dans un processus, comme les morceaux.' }
				]
			},
			{
				title: 'Nomme la décision',
				questions: [
					{ q: 'Contre quelle décision d’architecture va la proposition ?', options: ['Les commandes sont stockées dans PostgreSQL', 'Le trafic arrive à la boutique en HTTPS', 'Les pages sont mises en cache dans Redis', 'Le processus applicatif ne garde aucun état entre les requêtes'], answer: 3, why: 'Des morceaux en mémoire, c’est de l’état dans le processus applicatif. Exactement ce que le shared-nothing interdit.' },
					{ q: 'La boutique accepte la proposition et abandonne pour de bon « appli stateless ». Que faut-il changer en plus du code d’upload ?', options: ['Une seule ligne dans les réglages Django', 'Une grande partie du code, et la façon dont la boutique passe à l’échelle en ajoutant des copies', 'Rien : le load balancer s’adapte tout seul', 'Seulement le schéma PostgreSQL'], answer: 1, why: 'Chaque copie compte sur un stockage partagé pour trouver l’état, et l’ajout de copies du Black Friday repose là-dessus. Changer la règle sur le tard, c’est déplacer la moitié du code.' },
					{ q: 'Qu’est-ce que la décision stateless a permis à la boutique pour le Black Friday ?', options: ['Ajouter des copies par un changement de déploiement, sans réécriture', 'Se passer de la base pour les sessions', 'Tourner sans load balancer', 'Mettre le cache dans chaque processus'], answer: 0, why: 'Le code n’a pas bougé. Passer d’une machine à trois n’a demandé qu’un changement de déploiement.' },
					{ q: 'Quel coût l’appli stateless paie-t-elle déjà, celui que le collègue veut éviter ?', options: ['Une réécriture à chaque copie ajoutée', 'Des paniers perdus quand une copie plante', 'Un aller-retour réseau vers la base ou le cache à chaque requête', 'Une charge mal répartie entre les copies'], answer: 2, why: 'Chaque requête paie un aller-retour réseau pour un état qui aurait pu rester en mémoire. C’est cette vitesse que le collègue veut récupérer.' }
				]
			},
			{
				title: 'Réponds au collègue',
				questions: [
					{ q: 'Quelles deux solutions font remarcher l’upload par morceaux ?', options: ['Plus de copies de l’appli, ou un plus gros load balancer', 'Des sticky sessions, ou un stockage partagé pour les morceaux', 'Un cache local, ou plus de mémoire par copie', 'Relancer le morceau 2, ou l’envoyer deux fois'], answer: 1, why: 'Soit chaque morceau arrive sur la même copie, soit chaque copie peut lire chaque morceau.' },
					{ q: 'Que fait une sticky session ?', options: ['Elle envoie toujours un utilisateur vers la même copie', 'Elle copie la mémoire de session entre les copies', 'Elle range les sessions dans PostgreSQL', 'Elle verrouille l’upload jusqu’à la fin'], answer: 0, why: 'Sticky veut dire que le load balancer attache chaque utilisateur à une copie.' },
					{ q: 'Quel nouveau coût apportent les sticky sessions ?', options: ['Chaque requête paie un aller-retour vers Redis', 'Les sessions ne peuvent plus aller en base', 'Le load balancer doit copier la mémoire entre les copies', 'Une copie qui meurt emporte les uploads de ses utilisateurs, et la charge se répartit mal'], answer: 3, why: 'L’état est revenu dans un processus. Tu perds le processus, tu perds l’état.' },
					{ q: 'En architecte, que réponds-tu au collègue ?', options: ['« Non : on a décidé que l’appli est stateless, le sujet est clos. »', '« Oui : la mémoire est plus rapide, on livre et on corrigera après. »', '« Ça change une décision sur laquelle on s’appuie. Voilà ce que ça coûte. Est-ce que ça vaut le coup ? »', '« Essaie sur une copie d’abord, puis déploie sur les autres. »'], answer: 2, why: 'Tu ne te contentes pas de dire non. Tu nommes la décision et son coût, et tu laisses le compromis trancher.' }
				]
			}
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
