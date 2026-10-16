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
