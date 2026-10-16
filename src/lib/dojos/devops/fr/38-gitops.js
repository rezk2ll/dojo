const ARGO = 'https://github.com/argoproj/argo-cd/blob/2a78031ddbdd9e26cee81f84dc47f152fc23e5c8';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'gitops',
	part: 'En production',
	title: 'GitOps : Git est la source de vérité',
	minutes: 10,
	hook: [
		'Vendredi, 18 h. Quelqu’un a lancé `kubectl edit` en production pour « juste monter la mémoire ». Personne ne l’a noté. Lundi, le déploiement suivant remet l’ancienne valeur et l’appli tombe.',
		'Tu connais l’histoire depuis l’époque des serveurs : le `nginx.conf` modifié à la main que personne n’avait dans Git. Kubernetes n’a pas réglé ça. Il a juste rendu `kubectl` plus rapide à taper.',
		'**GitOps** inverse le sens. L’état du cluster vit dans un repo Git. Un agent **dans le cluster** tire ce repo et aligne le cluster dessus, encore et encore. Tu veux un changement ? Ouvre une pull request.'
	],
	terms: [
		{ term: 'GitOps', def: 'L’état voulu est déclaré, stocké de façon versionnée et immuable (en pratique, dans Git), tiré automatiquement par un agent et réconcilié en continu. Ce sont les quatre principes d’OpenGitOps.' },
		{ term: 'Déploiement push', def: 'La pipeline CI détient les accès au cluster et lance `kubectl apply` ou `helm upgrade` contre lui.' },
		{ term: 'Déploiement pull', def: 'Un agent qui tourne dans le cluster surveille Git et applique les changements lui-même. La CI ne touche jamais le cluster.' },
		{ term: 'Application Argo CD', def: 'Un objet Kubernetes qui dit : prends les manifestes de ce repo, cette révision et ce chemin, et garde-les appliqués dans ce cluster et ce namespace.' },
		{ term: 'Drift', def: 'L’état réel du cluster ne correspond plus à Git. Argo CD affiche l’appli en **OutOfSync**.' },
		{ term: 'Self-heal', def: 'Option d’Argo CD : quand l’état réel s’écarte de Git, resynchroniser tout seul. Désactivée par défaut.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'dev["Toi : pull request"] --> repo[("Repo de config Git")]',
					'ci["Pipeline CI"] -->|"kubectl apply"| k8s["Cluster"]',
					'class repo ext'
				],
				highlight: ['ci'],
				note: 'La méthode **push**, vue dans la partie CI/CD. Ça marche, mais la CI a besoin d’accès admin au cluster, et rien ne remarque quand quelqu’un modifie le cluster à la main.'
			},
			{
				add: [
					'subgraph inside["Dans le cluster"]',
					'argo["Argo CD"]',
					'end',
					'argo -->|"tire"| repo'
				],
				highlight: ['argo'],
				note: 'La méthode **pull**. Argo CD tourne dans le cluster et interroge le repo (toutes les 3 minutes au plus, par défaut). Les accès restent à l’intérieur. La CI n’a plus qu’à pousser dans Git.'
			},
			{
				add: [
					'app["Application : repo, chemin, destination"]',
					'argo --> app',
					'app -->|"sync"| k8s'
				],
				highlight: ['app'],
				note: 'Une **Application** relie un chemin dans Git à un namespace dans un cluster. Argo CD compare l’**état cible** (Git) à l’**état réel** (cluster) et affiche Synced ou OutOfSync.'
			},
			{
				add: [
					'hand["kubectl edit à la main"] -.->|"drift"| k8s',
					'argo -.->|"self-heal : annule"| k8s',
					'class hand ext'
				],
				highlight: ['hand', 'argo'],
				note: 'Quelqu’un modifie le cluster à la main. Argo CD voit le drift. Avec le **self-heal** activé, il remet la version de Git en quelques secondes. La modif du vendredi doit maintenant passer par une pull request.'
			}
		]
	},
	example: {
		title: 'docs/operator-manual/application.yaml',
		repo: 'argoproj/argo-cd',
		url: `${ARGO}/docs/operator-manual/application.yaml#L1-L233`,
		lang: 'yaml',
		code: `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  # You'll usually want to add your resources to the argocd namespace.
  namespace: argocd
…
spec:
  # The project the application belongs to.
  project: default

  # Source of the application manifests
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git  # Can point to either a Helm chart repo or a git repo.
    targetRevision: HEAD  # For Helm, this refers to the chart version.
    path: guestbook  # This has no meaning for Helm charts pulled directly from a Helm repo instead of git.
…
  # Destination cluster and namespace to deploy the application
  destination:
    # cluster API URL
    server: https://kubernetes.default.svc
    # or cluster name
    # name: in-cluster
    # The namespace will only be set for namespace-scoped resources that have not set a value for .metadata.namespace
    namespace: guestbook
…
  # Sync policy
  syncPolicy:
    automated: # automated sync by default retries failed attempts 5 times with following delays between attempts ( 5s, 10s, 20s, 40s, 80s ); retry controlled using \`retry\` field.
      enabled: true # Enables automated syncing of the application ( true by default ).
      prune: true # Specifies if resources should be pruned during auto-syncing ( false by default ).
      selfHeal: true # Specifies if partial app sync should be executed when resources are changed only in target Kubernetes cluster and no git change detected ( false by default ).`,
		notes: [
			'C’est le fichier de référence d’Argo CD, chaque champ avec un commentaire. Une vraie Application se limite aux parties gardées ici : **source**, **destination**, **syncPolicy**.',
			'`source` pointe vers un vrai repo, [argocd-example-apps](https://github.com/argoproj/argocd-example-apps/tree/8088f4c0d970abb09e250248cc97e35623447cb5/guestbook), dossier `guestbook` : un Deployment et un Service tout simples.',
			'`server: https://kubernetes.default.svc` est le cluster dans lequel Argo CD tourne lui-même. Le même Argo CD peut aussi gérer d’autres clusters.',
			'`prune: true` supprime les objets que tu as retirés de Git. C’est désactivé par défaut, par sécurité. `selfHeal: true` annule les modifs manuelles. Désactivé par défaut aussi.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque changement est un commit : relu, validé, et facile à annuler avec `git revert`.',
			'Les accès au cluster ne sortent jamais du cluster. La CI n’a besoin que d’un droit d’écriture sur un repo Git.',
			'Le drift est visible sur un tableau de bord, et le self-heal peut l’annuler.'
		],
		cost: [
			'Un système de plus à faire tourner et à mettre à jour, avec son propre RBAC et ses propres pannes.',
			'Un `kubectl edit` d’urgence est annulé. En incident, tu corriges en avant via Git, ou tu mets d’abord l’auto-sync en pause.',
			'Les secrets demandent du soin : tu ne peux pas les committer en clair, donc tu ajoutes un outil qui les chiffre ou qui les récupère dans un coffre.'
		]
	},
	task: {
		prompt: 'Ton équipe déploie avec `helm upgrade` depuis un job GitLab qui détient un kubeconfig cluster-admin. Écris les étapes pour passer à Argo CD, et dis ce que fait le job CI ensuite.',
		hint: 'Où vit l’état voulu, qui l’applique, et que devient ce kubeconfig ?',
		answer: [
			'Mets le chart et les values par environnement dans un repo Git (le repo de l’appli ou un repo de config séparé).',
			'Installe Argo CD dans le cluster. Crée une Application par environnement qui pointe vers ce chemin, avec la sync `automated`.',
			'Commence avec `selfHeal` désactivé et regarde les rapports OutOfSync. Corrige le drift que tu trouves, puis active le self-heal.',
			'Le job CI construit maintenant l’image, la pousse, et **commite le nouveau tag d’image** dans le fichier de values. Il ne parle plus au cluster.',
			'Supprime le kubeconfig cluster-admin des variables CI. C’est là le gain de sécurité.'
		]
	},
	quiz: [
		{
			q: 'Dans un GitOps en mode pull, qui applique les changements sur le cluster ?',
			options: [
				'La pipeline CI, avec `kubectl apply`',
				'Le développeur, depuis son portable',
				'Un agent qui tourne dans le cluster, comme Argo CD, et qui tire l’état voulu depuis Git',
				'Le serveur Git, via un webhook qui lance `kubectl`'
			],
			answer: 2,
			why: 'Dans le modèle pull, l’agent dans le cluster récupère l’état voulu et réconcilie. La CI écrit seulement dans Git et n’a besoin d’aucun accès au cluster.'
		},
		{
			q: 'Une Application Argo CD a la sync automatique, mais `selfHeal` n’est pas défini. Quelqu’un scale un Deployment à la main. Que se passe-t-il ?',
			options: [
				'Argo CD l’annule en quelques secondes',
				'Argo CD affiche l’appli en OutOfSync mais ne l’annule pas tout seul',
				'Argo CD supprime le Deployment',
				'Rien, Argo CD ne voit pas les changements faits avec kubectl'
			],
			answer: 1,
			why: 'Par défaut, les changements faits sur le cluster ne déclenchent pas la sync automatique. Argo CD détecte le drift, mais seul le self-heal le fait agir.'
		},
		{
			q: 'Tu supprimes le fichier d’une ConfigMap du repo Git. La sync automatique est active, `prune` n’est pas défini. Que devient la ConfigMap dans le cluster ?',
			options: [
				'Elle est supprimée à la sync suivante',
				'Elle reste. La sync automatique ne supprime pas de ressources sans prune activé',
				'Argo CD recrée le fichier dans Git',
				'Toute l’Application est supprimée'
			],
			answer: 1,
			why: 'Par sécurité, la sync automatique ne supprime pas les ressources absentes de Git. Tu fais le prune à la main, ou tu mets `prune: true`.'
		}
	],
	takeaway: 'Avec GitOps, le cluster tire son état depuis Git au lieu que la CI le pousse dedans. Chaque changement est un commit, et le drift devient quelque chose que tu vois et que tu peux annuler.',
	sources: [
		{ title: 'OpenGitOps, les quatre principes', url: 'https://opengitops.dev/' },
		{ title: 'Doc Argo CD, Core concepts', url: 'https://argo-cd.readthedocs.io/en/stable/core_concepts/' },
		{ title: 'Doc Argo CD, Automated sync policy', url: 'https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/' },
		{ title: 'Doc Argo CD, Declarative setup', url: 'https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/' }
	]
};
