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
		],
		steps: [
			{
				title: 'Mets l’état voulu dans Git',
				questions: [
					{ q: 'Aujourd’hui, qu’est-ce qui ne va pas dans le job GitLab, côté sécurité ?', options: ['Il utilise Helm, qui est obsolète', 'Il déploie trop lentement', 'Il détient des accès admin au cluster', 'Il ne sait pas faire de rollback'], answer: 2, why: 'Dans un push deploy, la CI a besoin d’accès admin au cluster. C’est ce kubeconfig qu’il faut retirer.' },
					{ q: 'Qu’est-ce qui va d’abord dans le repo Git ?', options: ['Le chart et les values de chaque environnement', 'Le kubeconfig cluster-admin', 'L’image construite', 'Une copie de `kubectl get all -o yaml`'], answer: 0, why: 'Git devient l’état voulu, donc le chart et ses values par environnement doivent y vivre.' },
					{ q: 'Quel repo peut les contenir ?', options: ['Seulement le repo d’Argo CD', 'Seulement un repo sans code', 'Seulement le repo de la CI GitLab', 'Le repo de l’appli ou un repo de config séparé'], answer: 3, why: 'Les deux marchent. Ce qui compte, c’est un chemin par environnement qu’Argo CD peut surveiller.' },
					{ q: 'Qu’est-ce qui ne doit jamais aller en clair dans ce repo ?', options: ['Le tag d’image', 'Les secrets', 'Le nombre de replicas', 'Le port du Service'], answer: 1, why: 'Tu ne peux pas commiter des secrets en clair. Ajoute un outil qui les chiffre ou qui les récupère dans un coffre.' }
				]
			},
			{
				title: 'Laisse Argo CD l’appliquer',
				questions: [
					{ q: 'Argo CD déploie dans le cluster où il tourne. Quel `destination.server` chaque Application utilise-t-elle ?', options: ['`https://kubernetes.default.svc`', 'L’adresse du runner GitLab', 'L’URL du dépôt de config', 'L’adresse de l’API server prise dans l’ancien kubeconfig cluster-admin'], answer: 0, why: '`https://kubernetes.default.svc` est l’adresse interne de l’API server. Argo CD l’atteint de l’intérieur, sans distribuer de kubeconfig.' },
					{ q: 'Combien d’Applications crées-tu ?', options: ['Une pour toute l’entreprise', 'Une par commit Git', 'Une par environnement', 'Une par Pod'], answer: 2, why: 'Une Application relie un chemin dans Git à un namespace d’un cluster, donc chaque environnement a la sienne.' },
					{ q: 'De quels trois blocs une Application a-t-elle besoin ?', options: ['`image`, `replicas`, `ports`', '`source`, `destination`, `syncPolicy`', '`metadata`, `status`, `events`', '`values`, `chart`, `kubeconfig`'], answer: 1, why: 'Où sont les manifestes, où ils vont, et comment synchroniser.' },
					{ q: 'En combien de temps Argo CD voit-il un nouveau commit par défaut ?', options: ['Tout de suite, via un hook dans la CI', 'Une fois par jour', 'Seulement quand tu cliques sur Sync', 'En 3 minutes au plus, en interrogeant le repo'], answer: 3, why: 'Par défaut, il interroge le repo toutes les 3 minutes au plus.' }
				]
			},
			{
				title: 'Trouve le drift, puis répare-le',
				questions: [
					{ q: 'Pourquoi commencer avec `selfHeal` désactivé ?', options: ['Pour voir le drift d’abord, avant qu’Argo CD l’écrase', 'Parce que le self-heal demande une offre payante', 'Parce que la sync `automated` casse avec', 'Parce qu’Argo CD ne voit pas le drift quand il est actif'], answer: 0, why: 'Des modifications à la main peuvent cacher de vrais correctifs. Lis les rapports OutOfSync, mets ce qui compte dans Git, puis active le self-heal.' },
					{ q: 'Le rapport de drift montre la prod à 5 réplicas, réglés à la main, alors que le fichier de values dit 3. Que fais-tu avant d’activer le self-heal ?', options: ['Activer le self-heal et le laisser choisir', 'Supprimer l’Application et la recréer', 'Décider quel nombre est le bon et le committer dans le fichier de values', 'Lancer un dernier `helm upgrade` depuis la CI'], answer: 2, why: 'Le self-heal remet la version de Git. Si la prod a besoin de 5, il faut d’abord que ce soit dans Git, sinon le self-heal redescend à 3.' },
					{ q: 'Le self-heal est actif. L’équipe a besoin de plus de mémoire pour l’appli vendredi. Où va ce changement ?', options: ['Un `kubectl edit` sur le Deployment', 'Une pull request sur le fichier de values dans Git', 'Un nouveau job GitLab avec l’ancien kubeconfig', 'Le tableau de bord d’Argo CD, à la main'], answer: 1, why: 'Une modif à la main est annulée en quelques secondes. Git est l’état désiré, donc le changement passe en revue et Argo CD l’applique.' },
					{ q: 'Pendant un incident, tu as besoin d’une correction à la main tout de suite. Que fais-tu ?', options: ['Modifier et espérer que le self-heal soit lent', 'Supprimer Argo CD', 'Désactiver RBAC', 'Corriger en avant via Git, ou mettre l’auto-sync en pause d’abord'], answer: 3, why: 'Une modification d’urgence est annulée. Passe par Git, ou mets la sync en pause exprès.' }
				]
			},
			{
				title: 'Allège la CI',
				questions: [
					{ q: 'Que fait le job CI maintenant, après avoir construit et poussé l’image ?', options: ['Il lance `helm upgrade` avec un kubeconfig plus restreint', 'Il commite le nouveau tag d’image dans le fichier de values', 'Il appelle l’API d’Argo CD pour déployer', 'Rien de plus'], answer: 1, why: 'La CI n’écrit plus que dans Git. Argo CD voit le nouveau tag et l’applique.' },
					{ q: 'Le job CI parle-t-il encore au cluster ?', options: ['Non', 'Oui, pour vérifier les Pods', 'Oui, pour lancer les migrations', 'Seulement en cas d’échec'], answer: 0, why: 'Dans le modèle pull, la CI a besoin d’un accès en écriture à un repo, et de rien d’autre.' },
					{ q: 'Que devient le kubeconfig cluster-admin ?', options: ['Gardé en secours dans la CI', 'Déplacé dans une autre variable CI', 'Supprimé des variables CI', 'Donné à Argo CD'], answer: 2, why: 'La CI ne détient alors plus aucun accès au cluster.' },
					{ q: 'Un mauvais tag arrive en production. Comment reviens-tu en arrière ?', options: ['`helm rollback` depuis ton portable', '`kubectl edit` sur le Deployment', 'Attendre le self-heal', '`git revert` du commit qui a changé le tag'], answer: 3, why: 'Chaque changement est un commit, donc revenir en arrière est un revert, relu comme tout autre changement.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Construire un petit agent pull avec Git et `kubectl`, et le regarder annuler une modification à la main, appliquer un commit, et laisser en place l’objet d’un fichier supprimé, comme Argo CD sans `prune`.',
		steps: [
			'Démarre un cluster local avec `minikube start`. Crée un repo bare comme « serveur Git », et une copie de travail : `mkdir -p ~/gitops-lab && cd ~/gitops-lab && git init -q --bare remote.git && git clone -q remote.git config`.',
			'Commite l’état voulu : `cd ~/gitops-lab/config && kubectl create deployment web --image=nginx:1.27 --replicas=2 --dry-run=client -o yaml > web.yaml && git add web.yaml && git commit -qm "web: 2 replicas" && git push -q origin HEAD`.',
			'Dans un second terminal, lance l’agent. Il tire Git et n’applique que si le cluster diffère : `cd ~/gitops-lab && git clone -q remote.git agent && cd agent && while true; do git pull -q; kubectl diff -f . >/dev/null || kubectl apply -f .; sleep 10; done`.',
			'Fais une modification du vendredi : `kubectl scale deployment web --replicas=5`, attends 15 secondes, puis `kubectl get deployment web`.',
			'Change-le à la manière GitOps : dans `~/gitops-lab/config`, remplace `replicas: 2` par `replicas: 3` dans `web.yaml`, puis `git commit -qam "web: 3 replicas" && git push -q origin HEAD`. Ensuite ajoute puis retire une ConfigMap : `kubectl create configmap motd --from-literal=msg=hello --dry-run=client -o yaml > motd.yaml && git add motd.yaml && git commit -qm "add motd" && git push -q origin HEAD`, attends 20 secondes, puis `git rm -q motd.yaml && git commit -qm "remove motd" && git push -q origin HEAD`. Arrête l’agent avec Ctrl-C et nettoie avec `kubectl delete deployment web && kubectl delete configmap motd`.'
		],
		done: [
			'Après `kubectl scale --replicas=5`, `kubectl get deployment web` revient à `2/2` en une dizaine de secondes, et l’agent a affiché `deployment.apps/web configured`.',
			'Après le push de `replicas: 3`, le Deployment montre `3/3` sans aucune commande `kubectl` de ta part.',
			'Après `git rm motd.yaml` et une sync, `kubectl get configmap motd` la trouve toujours.',
			'`git log --oneline` dans `config` liste chaque changement que tu as fait au cluster.'
		],
		solution: [
			'`kubectl diff` sort avec un code non nul quand l’état réel diffère des fichiers. C’est du drift, et l’agent réapplique Git : un self-heal.',
			'Ici, seul l’agent parle au cluster. Ta « CI » est un `git push`, et c’est tout l’intérêt d’un pull deploy.',
			'`kubectl apply -f .` ne supprime jamais un objet dont le fichier a disparu, comme Argo CD avec `prune` désactivé. Tu le supprimes à la main, ou tu actives le prune.'
		]
	},
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
