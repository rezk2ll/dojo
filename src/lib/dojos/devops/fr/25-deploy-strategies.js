const DEMO = 'https://github.com/argoproj/rollouts-demo/blob/4e8c844fe9e23b7586f95b5f6b5365693cf318ad';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'deploy-strategies',
	part: 'CI/CD',
	title: 'Les stratégies de déploiement : remplacer la version en production',
	minutes: 10,
	hook: [
		'Vendredi, 18 h. Tu arrêtes le service, tu copies la nouvelle version, tu le relances. Pendant trente secondes le site est coupé. Si la nouvelle version est cassée, elle est cassée **pour tout le monde**, et revenir en arrière veut dire tout refaire, à la main, dans l’urgence.',
		'Le pipeline sait maintenant construire et tester chaque changement. La stratégie décide comment la nouvelle version remplace l’ancienne en production. Les stratégies diffèrent par la coupure, par les serveurs en plus, et par le nombre d’utilisateurs qu’une mauvaise version atteint.',
		'Chaque stratégie a aussi besoin d’un rollback, un retour à la dernière version qui marchait, et tu devrais le lancer une fois avant d’en avoir besoin.'
	],
	terms: [
		{ term: 'Rolling update', def: 'Remplacer les copies quelques-unes à la fois. Il n’y a pas de coupure, et l’ancienne et la nouvelle version servent les utilisateurs au même moment.' },
		{ term: 'Blue-green', def: 'Faire tourner la nouvelle version (green) à côté de celle en ligne (blue), puis basculer le routeur. Pour le rollback, tu rebascules le routeur vers blue.' },
		{ term: 'Canary', def: 'Envoyer une petite part du vrai trafic vers la nouvelle version, l’observer, puis augmenter par paliers.' },
		{ term: 'Feature flag', def: 'Un interrupteur dans le code qui active ou désactive une fonctionnalité sans nouveau déploiement. Déployer met le code sur les serveurs, et **mettre en service** active la fonctionnalité pour les utilisateurs.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['v1["v1 en ligne sur 4 serveurs"] --> rec["Recreate : arrêter toute la v1, démarrer la v2"]'],
				highlight: ['v1', 'rec'],
				note: 'Avec la stratégie recreate, tu arrêtes toutes les anciennes copies puis tu démarres les nouvelles, comme tu le faisais à la main. Une seule version tourne à la fois, et les utilisateurs n’ont aucun service entre les deux. Kubernetes, que tu découvres au jour 31, le propose de base sous le nom `Recreate`.'
			},
			{
				add: ['v1 --> roll["Rolling : remplacer 1 serveur à la fois"]'],
				highlight: ['roll'],
				note: 'Kubernetes fait un rolling update par défaut : pendant la mise à jour, au plus 25 % des copies sont arrêtées et au plus 25 % de copies en plus sont démarrées. Il n’y a pas de coupure, mais pendant un moment **la v1 et la v2 répondent toutes les deux**, donc elles doivent être compatibles.'
			},
			{
				add: ['v1 --> bg["Blue-green : la v2 à côté de la v1, basculer le routeur"]'],
				highlight: ['bg'],
				note: 'Blue-green garde deux environnements complets. Tu testes green, puis tu bascules le routeur, et pour le rollback tu le rebascules vers blue. Tu paies **le double de capacité**, et le schéma de base de données doit marcher pour les deux versions.'
			},
			{
				add: ['v1 --> can["Canary : 20 pour cent vers la v2, observer, puis plus"]'],
				highlight: ['can'],
				note: 'Un canary envoie d’abord une petite part des vrais utilisateurs, ici 20 %, vers la v2. Si les erreurs montent, seule cette part est touchée, et tu renvoies tout le monde sur la v1. Il te faut des métriques qui montrent si la v2 fait pire que la v1.'
			},
			{
				add: [
					'rb["Rollback : retour à la dernière bonne version"]',
					'can -.-> rb',
					'bg -.-> rb',
					'ff["Feature flag : code déployé éteint, activé plus tard"]'
				],
				highlight: ['rb', 'ff'],
				note: 'Un **feature flag** agit dans le code : le code est déployé mais éteint, et tu l’actives avec un interrupteur, pour tout le monde ou pour quelques utilisateurs. Quelle que soit la stratégie, le rollback devrait tenir en une commande, que tu as testée avant d’en avoir besoin.'
			}
		]
	},
	example: {
		title: 'examples/canary/canary-rollout.yaml',
		repo: 'argoproj/rollouts-demo',
		url: `${DEMO}/examples/canary/canary-rollout.yaml#L1-L39`,
		lang: 'yaml',
		code: `apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: canary-demo
spec:
  replicas: 5
…
  strategy:
    canary:
      canaryService: canary-demo-preview
      steps:
      - setWeight: 20
      - pause: {}
      - setWeight: 40
      - pause: {duration: 10}
      - setWeight: 60
      - pause: {duration: 10}
      - setWeight: 80
      - pause: {duration: 10}`,
		notes: [
			'Tu découvres Kubernetes au jour 31. Pour l’instant, lis la ligne 6 comme « faire tourner 5 copies de l’application ». [Argo Rollouts](https://argoproj.github.io/argo-rollouts/) est un module Kubernetes qui ajoute le blue-green et le canary au rolling update intégré.',
			'La ligne 12, `setWeight: 20`, envoie 20 % vers la nouvelle version. Sans routeur de trafic, Argo Rollouts y arrive [en comptant les copies](https://argoproj.github.io/argo-rollouts/features/canary/) : 20 % de 5 copies, c’est **1 nouvelle copie et 4 anciennes**.',
			'La ligne 13, `pause: {}`, n’a pas de durée, donc le rollout **attend indéfiniment** qu’un humain lance `kubectl argo rollouts promote canary-demo` (la ligne de commande d’Argo Rollouts). Tu regardes les dashboards avant de la lancer. Les pauses suivantes, aux lignes 15, 17 et 19, durent 10 secondes chacune.',
			'La ligne 10, `canaryService`, désigne une adresse stable (un Service Kubernetes) qui n’envoie le trafic qu’aux nouvelles copies, pour que tu puisses tester la v2 directement. Si la v2 a l’air mauvaise, [`kubectl argo rollouts abort`](https://argoproj.github.io/argo-rollouts/generated/kubectl-argo-rollouts/kubectl-argo-rollouts_abort/) annule les étapes et remet la version précédente en service. Mais le Rollout décrit toujours la v2 : remets-y l’ancienne version, sinon il retente la v2.',
			'Le même dépôt a une [version blue-green](https://github.com/argoproj/rollouts-demo/blob/4e8c844fe9e23b7586f95b5f6b5365693cf318ad/examples/blue-green/bluegreen-rollout.yaml#L30-L34), avec un `activeService` pour les utilisateurs, un `previewService` pour tester green, et `autoPromotionEnabled: false` pour que la bascule attende un humain.'
		]
	},
	tradeoff: {
		gain: [
			'Rolling et canary mettent à jour sans coupure, et le canary limite une mauvaise version à une petite part des utilisateurs.',
			'Blue-green donne le rollback le plus rapide : tu rebascules le routeur, l’ancienne version tourne encore.',
			'Les feature flags te laissent déployer à tout moment et activer quand le métier est prêt, ou éteindre une fonctionnalité sans déploiement.'
		],
		cost: [
			'Toutes les stratégies sauf recreate font tourner deux versions à la fois. Les changements de base de données et les API doivent marcher avec les deux.',
			'Blue-green demande le double de capacité pendant la bascule. Canary demande des métriques assez bonnes pour dire « la v2 est pire ».',
			'Chaque feature flag est un chemin de code de plus à tester, et les vieux flags s’accumulent si tu ne les retires pas.'
		]
	},
	task: {
		prompt: 'Ton application web tourne sur 4 serveurs derrière un load balancer. La prochaine version ajoute une colonne à la table `orders` et commence à y écrire. Choisis une stratégie, et prévois le changement de base de données pour que **le rollback reste possible**.',
		hint: 'Pendant un rolling update ou un canary, la v1 et la v2 tournent en même temps sur la même base. Qu’arrive-t-il à la v1 si le schéma change pendant qu’elle tourne ?',
		answer: [
			'Découpe en deux déploiements. D’abord : une migration qui **ajoute** seulement la colonne (nullable ou avec une valeur par défaut). La v1 l’ignore, rien ne casse, et tu as un point de rollback.',
			'Ensuite : déploie la v2, qui écrit dans la colonne, en **rolling** ou en canary. Si la v2 se comporte mal, fais un rollback de l’application seulement. La colonne reste, la v1 marche toujours.',
			'Ne supprime ni ne renomme jamais une colonne dans la version qui arrête de l’utiliser. Attends qu’aucune version en service n’en ait besoin.',
			'Blue-green demande les mêmes deux étapes : blue et green partagent en général la base.'
		],
		steps: [
			{
				title: 'Repère le risque',
				questions: [
					{ q: 'Pendant un rolling update sur les 4 serveurs, qui parle à la base ?', options: ['Seulement la v2, dès que le premier serveur est à jour', 'La v1 et la v2, en même temps', 'Seulement la v1, jusqu’à la bascule du dernier serveur', 'Personne : la mise à jour verrouille la base'], answer: 1, why: 'Un rolling update remplace les copies quelques-unes à la fois, donc les deux versions servent les utilisateurs un moment.' },
					{ q: 'Pourquoi est-ce un problème pour le changement de schéma ?', options: ['Un changement que la v1 n’attend pas casse les copies v1 encore en service', 'Deux versions ne peuvent pas ouvrir la même table', 'Le load balancer lit le schéma', 'La v2 ne peut pas démarrer avant l’arrêt de la v1'], answer: 0, why: 'La v1 et la v2 doivent être compatibles, y compris avec la base qu’elles partagent.' },
					{ q: 'Blue-green évite-t-il le problème ?', options: ['Oui : blue et green ont chacun leur base', 'Oui : une seule version tourne à la fois', 'Non : blue et green partagent en général la base', 'Seulement si la bascule est instantanée'], answer: 2, why: 'Deux environnements applicatifs complets, une seule base. Le schéma doit toujours convenir aux deux.' },
					{ q: 'Que doit garder le plan, quelle que soit la stratégie ?', options: ['Une courte fenêtre de coupure', 'Une copie de chaque ligne', 'Une seule version en service à la fois', 'Un retour à la v1 qui marche sur le nouveau schéma'], answer: 3, why: 'Chaque stratégie a besoin d’un rollback vers la dernière version qui marchait.' }
				]
			},
			{
				title: 'Ajoute la colonne d’abord',
				questions: [
					{ q: 'Que contient le premier déploiement ?', options: ['Une migration qui ajoute seulement la colonne, nullable ou avec une valeur par défaut', 'La nouvelle colonne et la v2, livrées ensemble', 'Le renommage d’une ancienne colonne vers le nouveau nom', 'Une copie de `orders` dans une nouvelle table'], answer: 0, why: 'Ajouter ne casse rien à lui seul. La v2 vient dans un second déploiement.' },
					{ q: 'Pourquoi nullable ou avec une valeur par défaut ?', options: ['Postgres l’exige pour chaque colonne', 'La v1 continue d’insérer des lignes sans cette colonne', 'La migration va plus vite', 'La v2 ne sait pas écrire une colonne sans valeur par défaut'], answer: 1, why: 'La v1 ne connaît pas la colonne, donc ses insertions doivent rester valides sans elle.' },
					{ q: 'Après cette migration, que fait la v1 ?', options: ['Elle plante jusqu’à son redémarrage', 'Elle commence à écrire dans la nouvelle colonne', 'Elle ignore la colonne et continue de marcher', 'Elle a besoin d’une nouvelle version pour lire `orders`'], answer: 2, why: 'La v1 ne demande jamais la colonne, donc rien ne change pour elle.' },
					{ q: 'Que t’apporte ce premier déploiement ?', options: ['Un paiement plus rapide', 'Un feature flag pour la colonne', 'Le double de capacité', 'Un point de rollback'], answer: 3, why: 'Le schéma convient maintenant à la v1 et à la v2. Tu peux passer de l’une à l’autre librement.' }
				]
			},
			{
				title: 'Livre la v2',
				questions: [
					{ q: 'Comment livres-tu la v2, qui écrit dans la colonne ?', options: ['En rolling update ou en canary', 'En recreate : arrêter les quatre serveurs, puis lancer la v2', 'Avec la migration, en une seule étape', 'À la main, un serveur par jour'], answer: 0, why: 'Le schéma convient déjà aux deux versions, donc tu peux mettre à jour sans coupure.' },
					{ q: 'La v2 se comporte mal. De quoi fais-tu le rollback ?', options: ['De l’application et de la colonne', 'De la colonne seulement', 'De l’application seulement, la colonne reste', 'De rien : tu corriges en avant'], answer: 2, why: 'La v1 ignore la colonne, donc elle tourne très bien avec.' },
					{ q: 'Tu livres la v2 en canary. Qui souffre si elle est mauvaise ?', options: ['Tous les utilisateurs, comme en recreate', 'Seulement la petite part d’utilisateurs envoyée vers la v2', 'Personne, car le canary ne reçoit pas de trafic', 'Seulement les utilisateurs restés sur la v1'], answer: 1, why: 'Un canary limite une mauvaise version à une petite part du vrai trafic.' },
					{ q: 'De quoi un canary a-t-il besoin pour te dire que la v2 est pire ?', options: ['D’une deuxième base', 'D’un feature flag sur chaque page', 'D’une pause plus longue entre les paliers', 'De métriques qui comparent la v2 à la v1'], answer: 3, why: 'Sans métriques capables de montrer « la v2 est pire », le canary ne t’apprend rien.' }
				]
			},
			{
				title: 'Nettoie plus tard',
				questions: [
					{ q: 'Quand peux-tu supprimer ou renommer une colonne ?', options: ['Quand aucune version en service n’en a besoin', 'Dans la version qui arrête de l’utiliser', 'Avant la livraison de la v2, pour garder la table propre', 'Jamais : les colonnes restent pour toujours'], answer: 0, why: 'La retirer pendant qu’une version la lit encore casse cette version, et ton rollback.' },
					{ q: 'Pourquoi ne pas supprimer l’ancienne colonne dans la version qui arrête de l’utiliser ?', options: ['Postgres l’interdit', 'Les copies v1 encore en service, et ta cible de rollback, l’utilisent encore', 'La migration serait trop lente', 'Les feature flags ne marcheraient plus'], answer: 1, why: 'Pendant un moment, la v1 sert encore des utilisateurs, et c’est aussi là que tu reviens.' },
					{ q: 'Tu passes au blue-green le trimestre prochain. Les deux déploiements sont-ils encore utiles ?', options: ['Non : green reçoit une base neuve', 'Non : le routeur gère le schéma', 'Oui : blue et green partagent en général la base', 'Seulement si tu fais aussi un canary'], answer: 2, why: 'Les deux couleurs lisent les mêmes tables, donc le schéma doit convenir aux deux.' },
					{ q: 'Quand lances-tu le rollback pour la première fois ?', options: ['Le jour où la v2 casse', 'Jamais : un plan sur papier suffit', 'Après la suppression de la colonne', 'Une fois, avant d’en avoir besoin'], answer: 3, why: 'Un rollback jamais lancé n’est qu’une supposition. Teste-le pendant que rien ne brûle.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Quelle est la différence principale entre un déploiement blue-green et un canary ?',
			options: [
				'Blue-green est pour les changements de base de données, qui demandent deux copies. Canary ne sert qu’aux serveurs web stateless',
				'Blue-green bascule tout le trafic d’un coup vers la nouvelle version. Canary envoie d’abord une petite part des utilisateurs, puis plus',
				'Canary arrête l’ancienne version pendant que la nouvelle démarre, donc il a une coupure. Blue-green non',
				'Blue-green ne fait tourner qu’une version à la fois. Canary en fait tourner trois : l’ancienne, la nouvelle et une copie de test'
			],
			answer: 1,
			why: 'Les deux gardent l’ancienne version en marche. Blue-green bascule tout le monde d’un coup, avec un retour instantané. Canary expose d’abord quelques utilisateurs, donc une mauvaise version ne touche que cette part.'
		},
		{
			q: 'Kubernetes (jour 31) fait tourner plusieurs copies de ton application. Tu y livres une nouvelle version sans choisir de stratégie. Que fait Kubernetes ?',
			options: [
				'Recreate : tuer d’abord toutes les anciennes copies, puis démarrer les nouvelles une fois parties',
				'Blue-green : démarrer un jeu complet de nouvelles copies, puis basculer tout le trafic d’un coup',
				'Rolling update : remplacer les copies progressivement, par défaut au plus 25 % arrêtées et 25 % en plus',
				'Rien : la nouvelle version attend que tu valides toi-même le changement avec `kubectl`'
			],
			answer: 2,
			why: 'Le rolling update est la stratégie par défaut, et les deux limites (`maxUnavailable` et `maxSurge`) valent 25 % par défaut. `Recreate` doit être demandé.'
		},
		{
			q: 'Une nouvelle page de paiement est déployée en production, mais cachée derrière un feature flag éteint. Qu’est-ce qui est vrai ?',
			options: [
				'Le code est déployé mais pas mis en service : les utilisateurs ne le voient que quand le flag est allumé',
				'Le code n’est pas encore déployé, le pipeline attend que quelqu’un allume le flag en production',
				'Allumer le flag déclenche un nouveau déploiement de la page de paiement en production',
				'Rien n’est en ligne, car les feature flags ne marchent qu’avec des déploiements blue-green'
			],
			answer: 0,
			why: 'Un flag sépare le déploiement (le code est sur les serveurs) de la mise en service (les utilisateurs ont la fonctionnalité). Tu peux l’allumer, ou l’éteindre, sans toucher au pipeline.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Voir par toi-même quel changement de schéma laisse tourner la v1, et lequel la casse.',
		steps: [
			'Lance une base : `docker run -d --name orders-db -e POSTGRES_PASSWORD=lab postgres:16`. Attends que `docker exec orders-db pg_isready -U postgres` affiche `accepting connections`.',
			'Ouvre un shell avec `docker exec -it orders-db psql -U postgres` et crée la table de la v1 : `CREATE TABLE orders (id serial PRIMARY KEY, total numeric NOT NULL);`.',
			'Joue la v1 : `INSERT INTO orders (total) VALUES (10);`. Puis le premier déploiement : `ALTER TABLE orders ADD COLUMN coupon text;`. Rejoue la v1 avec la même insertion.',
			'Joue la v2 : `INSERT INTO orders (total, coupon) VALUES (30, \'SPRING\');`. Puis reviens à la v1, relance l’insertion de la v1, et regarde la table : `SELECT id, total, coupon FROM orders;`.',
			'Essaie maintenant le changement à ne jamais livrer avec la v2 : `ALTER TABLE orders RENAME COLUMN total TO amount;`, et lance l’insertion de la v1.',
			'Quitte psql avec `\\q` et nettoie avec `docker rm -f orders-db`.'
		],
		done: [
			'Chaque insertion de la v1 après `ADD COLUMN` affiche `INSERT 0 1`.',
			'Le `SELECT` de l’étape 4 montre `SPRING` sur la ligne de la v2 et un `coupon` vide sur les lignes de la v1.',
			'Après le renommage, l’insertion de la v1 échoue avec `column "total" of relation "orders" does not exist`.'
		],
		solution: [
			'Une colonne nullable sans valeur par défaut laisse chaque requête de la v1 valide, donc la v1 et la v2 tournent côte à côte et tu peux faire un rollback de l’application.',
			'Le renommage casse d’un coup chaque copie v1 en service, et le rollback avec. Renomme ou supprime une colonne seulement quand aucune version en service n’en a besoin.',
			'Essaie `ALTER TABLE orders ADD COLUMN note text NOT NULL;` sur la table remplie : Postgres refuse, parce que les lignes existantes n’ont pas de valeur.'
		]
	},
	recall: {
		q: 'Dans le canary Argo Rollouts à 5 copies, que font `setWeight: 20` puis `pause: {}` ?',
		a: 'Ils font tourner 1 nouvelle copie et 4 anciennes, donc environ 20 % du trafic arrive sur la v2. Le rollout attend ensuite qu’un humain lance `kubectl argo rollouts promote canary-demo`.'
	},
	sources: [
		{ title: 'Doc Kubernetes, Deployments : stratégie et rollback', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
		{ title: 'Martin Fowler, Blue Green Deployment', url: 'https://martinfowler.com/bliki/BlueGreenDeployment.html' },
		{ title: 'Danilo Sato, Canary Release', url: 'https://martinfowler.com/bliki/CanaryRelease.html' },
		{ title: 'Pete Hodgson, Feature Toggles (aka Feature Flags)', url: 'https://martinfowler.com/articles/feature-toggles.html' },
		{ title: 'Doc Argo Rollouts, stratégie de déploiement canary', url: 'https://argoproj.github.io/argo-rollouts/features/canary/' }
	]
};
