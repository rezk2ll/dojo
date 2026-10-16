const ARGO = 'https://github.com/argoproj/argo-cd/blob/2a78031ddbdd9e26cee81f84dc47f152fc23e5c8';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'gitops',
	part: 'En production',
	title: 'GitOps : Git est la source de vérité',
	minutes: 10,
	hook: [
		'Vendredi, 18 h. Quelqu’un a lancé `kubectl edit` en production pour « juste monter la mémoire ». Personne ne l’a noté. Lundi, le déploiement suivant remet l’ancienne valeur et l’appli tombe.',
		'Tu connais l’histoire depuis l’époque des serveurs : le `nginx.conf` modifié à la main que personne n’avait dans Git. Sur Kubernetes, `kubectl edit` fait pareil : il modifie l’objet en place et ne laisse aucune trace dans Git.',
		'Avec GitOps, l’état voulu du cluster vit dans un repo Git. Un agent **dans le cluster** tire ce repo et l’applique au cluster en continu. Pour changer la production, tu ouvres une pull request.'
	],
	terms: [
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
				note: 'Dans un déploiement push, comme dans la partie CI/CD, la pipeline lance elle-même `kubectl apply` ou `helm upgrade`. La CI a alors besoin d’accès admin au cluster. Rien ne remarque quand quelqu’un modifie le cluster à la main.'
			},
			{
				add: [
					'subgraph inside["Dans le cluster"]',
					'argo["Argo CD"]',
					'end',
					'argo -->|"tire"| repo'
				],
				highlight: ['argo'],
				note: 'Dans un déploiement pull, Argo CD tourne dans le cluster et interroge le repo (toutes les 3 minutes au plus, par défaut). Les accès au cluster restent dans le cluster. La CI n’a plus qu’à pousser dans Git.'
			},
			{
				add: [
					'app["Application : repo, chemin, destination"]',
					'argo --> app',
					'app -->|"sync"| k8s'
				],
				highlight: ['app'],
				note: 'Une **Application** relie un chemin dans Git à un namespace dans un cluster. Argo CD compare l’état cible (Git) à l’état réel (cluster) et affiche Synced ou OutOfSync.'
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
			'Le fichier de référence d’Argo CD commente chaque champ. Une vraie Application n’a besoin que des trois blocs gardés ici : `source`, `destination` et `syncPolicy`.',
			'Les lignes 13 à 16, `source`, pointent vers un vrai repo, [argocd-example-apps](https://github.com/argoproj/argocd-example-apps/tree/8088f4c0d970abb09e250248cc97e35623447cb5/guestbook), dossier `guestbook` : un Deployment et un Service simples.',
			'La ligne 21, `server: https://kubernetes.default.svc`, désigne le cluster dans lequel Argo CD tourne lui-même. Le même Argo CD peut aussi gérer d’autres clusters.',
			'La ligne 31, `prune: true`, supprime les objets que tu as retirés de Git. La ligne 32, `selfHeal: true`, annule les modifs manuelles. Par sécurité, Argo CD met **les deux à `false`** par défaut.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque changement est un commit : relu, validé, et facile à annuler avec `git revert`.',
			'La CI n’a besoin que d’un droit d’écriture sur un repo Git, et les accès au cluster ne sortent jamais du cluster.',
			'Argo CD affiche le drift en OutOfSync sur son tableau de bord, et le self-heal peut l’annuler.'
		],
		cost: [
			'Tu fais tourner et tu mets à jour Argo CD, avec son propre RBAC et ses propres pannes.',
			'Un `kubectl edit` d’urgence est annulé. En incident, tu corriges en avant via Git, ou tu mets d’abord l’auto-sync en pause.',
			'Les secrets demandent du soin : tu ne peux pas les committer en clair, donc tu ajoutes un outil qui les chiffre ou qui les récupère dans un coffre.'
		]
	},
	task: {
		prompt: 'Ton équipe déploie avec `helm upgrade` depuis un job GitLab qui détient un kubeconfig cluster-admin. Écris les étapes pour passer à Argo CD, et dis ce que fait le job CI ensuite.',
		hint: 'Où vit l’état voulu, qui l’applique, et que fais-tu de ce kubeconfig ?',
		answer: [
			'Mets le chart et les values par environnement dans un repo Git (le repo de l’appli ou un repo de config séparé).',
			'Installe Argo CD dans le cluster. Crée une Application par environnement qui pointe vers ce chemin, avec la sync `automated`.',
			'Commence avec `selfHeal` désactivé et regarde les rapports OutOfSync. Corrige le drift que tu trouves, puis active le self-heal.',
			'Le job CI construit maintenant l’image, la pousse, et **commite le nouveau tag d’image** dans le fichier de values. Il ne parle plus au cluster.',
			'Supprime le kubeconfig cluster-admin des variables CI. La CI ne détient alors plus aucun accès au cluster.'
		]
	},
	quiz: [
		{
			q: 'Dans un GitOps en mode pull, qui applique les changements sur le cluster ?',
			options: [
				'La pipeline CI, avec `kubectl apply` après chaque merge dans le repo de config',
				'Le développeur, depuis son portable, une fois la pull request approuvée',
				'Un agent dans le cluster, comme Argo CD, qui tire l’état voulu depuis Git',
				'Le serveur Git, via un webhook qui lance `kubectl` à chaque push'
			],
			answer: 2,
			why: 'Dans le modèle pull, l’agent dans le cluster récupère l’état voulu et réconcilie. La CI écrit seulement dans Git et n’a besoin d’aucun accès au cluster.'
		},
		{
			q: 'Une Application Argo CD a la sync automatique, mais `selfHeal` n’est pas défini. Quelqu’un scale un Deployment à la main. Que se passe-t-il ?',
			options: [
				'Argo CD l’annule en quelques secondes, puisque la sync automatique est active',
				'Argo CD affiche l’appli en OutOfSync mais ne l’annule pas tout seul',
				'Argo CD supprime le Deployment, puis le recrée à partir de ce qui est dans Git',
				'Rien : Argo CD ne voit pas les changements qui ont été faits avec kubectl'
			],
			answer: 1,
			why: 'Par défaut, les changements faits sur le cluster ne déclenchent pas la sync automatique. Argo CD détecte le drift, mais seul le self-heal le fait agir.'
		},
		{
			q: 'Tu supprimes le fichier d’une ConfigMap du repo Git. La sync automatique est active, `prune` n’est pas défini. Que devient la ConfigMap dans le cluster ?',
			options: [
				'Elle est supprimée à la sync suivante, puisqu’elle n’est plus dans Git',
				'Elle reste. La sync automatique ne supprime pas de ressources sans prune activé',
				'Argo CD recrée le fichier manquant dans Git à partir de la ConfigMap live',
				'Toute l’Application est supprimée, puisque sa source a changé'
			],
			answer: 1,
			why: 'Par sécurité, la sync automatique ne supprime pas les ressources absentes de Git. Tu fais le prune à la main, ou tu mets `prune: true`.'
		}
	],
	recall: {
		q: 'Quelqu’un lance `kubectl edit` sur une appli qu’Argo CD gère en sync automatique. Que fait Argo CD, avec et sans `selfHeal` ?',
		a: 'Il compare l’état réel à Git et affiche l’appli en OutOfSync. Il ne remet la version de Git tout seul qu’avec `selfHeal: true`.'
	},
	sources: [
		{ title: 'OpenGitOps, les quatre principes', url: 'https://opengitops.dev/' },
		{ title: 'Doc Argo CD, Core concepts', url: 'https://argo-cd.readthedocs.io/en/stable/core_concepts/' },
		{ title: 'Doc Argo CD, Automated sync policy', url: 'https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/' },
		{ title: 'Doc Argo CD, Declarative setup', url: 'https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/' }
	]
};
