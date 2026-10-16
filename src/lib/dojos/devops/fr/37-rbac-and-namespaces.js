const K8S = 'https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'rbac-and-namespaces',
	part: 'En production',
	title: 'Namespaces et RBAC : partager un cluster entre équipes',
	minutes: 10,
	hook: [
		'Sur un serveur Linux partagé, tu ne donnais jamais root à tout le monde. Tu créais des groupes, tu y mettais les gens, et tu écrivais un fichier `sudoers` qui disait qui peut redémarrer quel service.',
		'Un cluster Kubernetes partagé par trois équipes a besoin de la même chose. Sans ça, le stagiaire de l’équipe A peut supprimer la base de l’équipe B avec un seul `kubectl delete`.',
		'Kubernetes coupe le problème en deux. Les **namespaces** disent où vivent les choses. **RBAC** dit qui peut faire quoi, et où. Ajoute un **ResourceQuota** et une équipe ne peut plus manger tout le CPU.'
	],
	terms: [
		{ term: 'Namespace', def: 'Un dossier nommé pour des ressources, à l’intérieur d’un cluster. Les noms doivent être uniques dans un namespace, pas entre namespaces. Les nœuds et les PersistentVolumes sont globaux au cluster, dans aucun namespace.' },
		{ term: 'Role / ClusterRole', def: 'Une liste de verbes autorisés (`get`, `list`, `create`, `delete`...) sur des ressources. Un Role vit dans un namespace. Un ClusterRole vaut pour tout le cluster.' },
		{ term: 'RoleBinding / ClusterRoleBinding', def: 'Donne un Role à des sujets : utilisateurs, groupes ou service accounts. Un RoleBinding donne des droits dans son propre namespace, même quand il pointe vers un ClusterRole.' },
		{ term: 'Service account', def: 'Une identité pour un programme, pas pour une personne. Chaque namespace en a un nommé `default`, et un pod qui n’en nomme aucun tourne avec celui-là.' },
		{ term: 'ResourceQuota', def: 'Un plafond sur ce qu’un namespace peut consommer au total : CPU, mémoire, nombre d’objets.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'subgraph nsa["Namespace team-a"]',
					'appa["Pods de team-a"]',
					'end',
					'subgraph nsb["Namespace team-b"]',
					'appb["Pods de team-b"]',
					'end'
				],
				highlight: ['appa', 'appb'],
				note: 'Un cluster, un namespace par équipe. Chaque équipe peut appeler son Deployment `api` sans conflit. Les namespaces seuls **ne bloquent rien** : ce sont juste des noms tant que tu n’ajoutes pas de règles.'
			},
			{
				add: [
					'role["Role : modifier les pods de team-a"]',
					'rb["RoleBinding dans team-a"]',
					'alice["Utilisatrice alice"]',
					'rb -->|"roleRef"| role',
					'rb -->|"subject"| alice',
					'class alice ext'
				],
				highlight: ['role', 'rb', 'alice'],
				note: 'Le Role dit **quoi**. Le RoleBinding dit **qui**. Alice peut maintenant travailler dans `team-a`. RBAC est **purement additif** : il n’y a pas de règle de refus, donc dans `team-b` elle ne peut rien faire du tout.'
			},
			{
				add: [
					'sa["ServiceAccount ci-deployer"]',
					'rb -->|"subject"| sa',
					'sa -.->|"kubectl apply"| appa'
				],
				highlight: ['sa'],
				note: 'Ta pipeline CI ne doit pas utiliser le compte d’une personne. Elle a son propre **service account**, avec son binding. Son nom d’utilisateur ressemble à `system:serviceaccount:team-a:ci-deployer`.'
			},
			{
				add: [
					'quota["ResourceQuota : 1 CPU, 1Gi demandés"]',
					'quota -.->|"plafonne"| nsa'
				],
				highlight: ['quota'],
				note: 'Le quota plafonne la **somme** de tous les pods du namespace. Un pod qui le dépasserait est refusé avec `403 Forbidden`. Avec un quota CPU ou mémoire actif, chaque pod doit aussi fixer des requests ou des limits.'
			}
		]
	},
	example: {
		title: 'content/en/examples/access/simple-rolebinding-with-role.yaml',
		repo: 'kubernetes/website',
		url: `${K8S}/content/en/examples/access/simple-rolebinding-with-role.yaml#L1-L17`,
		lang: 'yaml',
		code: `apiVersion: rbac.authorization.k8s.io/v1
# This role binding allows "jane" to read pods in the "default" namespace.
# You need to already have a Role named "pod-reader" in that namespace.
kind: RoleBinding
metadata:
  name: read-pods
  namespace: default
subjects:
# You can specify more than one "subject"
- kind: User
  name: jane # "name" is case sensitive
  apiGroup: rbac.authorization.k8s.io
roleRef:
  # "roleRef" specifies the binding to a Role / ClusterRole
  kind: Role #this must be Role or ClusterRole
  name: pod-reader # this must match the name of the Role or ClusterRole you wish to bind to
  apiGroup: rbac.authorization.k8s.io`,
		notes: [
			'Le Role visé tient en [trois lignes de règles](https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0/content/en/examples/access/simple-role.yaml#L1-L9) : `pods`, avec les verbes `get`, `watch` et `list`. Lecture seule.',
			'C’est `metadata.namespace: default` qui limite Jane à un namespace. Le même binding dans `team-a` lui donnerait la lecture là-bas à la place.',
			'`subjects` est une liste. Ajoute une entrée `kind: Group` et tu gères les gens comme tes groupes Unix, en dehors du cluster.',
			'`roleRef` **ne peut pas être modifié** après création. Pour pointer vers un autre rôle, tu supprimes le binding et tu en crées un nouveau.'
		]
	},
	tradeoff: {
		gain: [
			'Un cluster pour plusieurs équipes : moins de control planes à mettre à jour et à payer.',
			'Le moindre privilège, écrit en YAML dans Git : tu peux relire qui a reçu quel droit dans une pull request.',
			'Les quotas empêchent un Deployment qui s’emballe d’affamer toutes les autres équipes.'
		],
		cost: [
			'Les namespaces n’isolent pas le réseau. Par défaut, chaque pod peut joindre tous les autres, tant que tu n’ajoutes pas de NetworkPolicies.',
			'Les règles RBAC s’empilent. Sans convention de nommage, plus personne ne sait pourquoi un binding existe.',
			'Les équipes partagent toujours les nœuds et le noyau. Pour des locataires non fiables, des clusters séparés sont souvent plus sûrs.'
		]
	},
	task: {
		prompt: 'Deux équipes, `shop` et `blog`, vont partager un cluster. L’équipe shop ne doit déployer que dans son namespace. Sa CI doit déployer aussi. L’équipe blog ne doit pas dépasser 2 CPU. Liste les objets que tu crées.',
		hint: 'Pour chaque équipe : où vivent les choses, qui peut agir là, sous quelle identité tourne la pipeline, et combien elle peut consommer.',
		answer: [
			'Deux namespaces : `shop` et `blog`.',
			'Dans `shop` : un Role (ou le ClusterRole intégré `edit`) et un RoleBinding vers le **groupe** de l’équipe shop, pas vers chaque personne.',
			'Dans `shop` : un ServiceAccount pour la CI, avec son propre RoleBinding. La pipeline utilise son token, jamais un compte humain.',
			'Dans `blog` : un ResourceQuota avec `requests.cpu: "2"`. Les pods sans requests CPU seront refusés, donc donne au namespace un LimitRange avec des valeurs par défaut, ou préviens l’équipe.',
			'Vérifie : `kubectl auth can-i create deployments -n blog --as=system:serviceaccount:shop:ci` doit répondre `no`.'
		]
	},
	quiz: [
		{
			q: 'Quelle est la différence entre un Role et un RoleBinding ?',
			options: [
				'Un Role est pour les utilisateurs, un RoleBinding pour les service accounts',
				'Un Role liste les actions autorisées sur des ressources. Un RoleBinding donne ce Role à des utilisateurs, groupes ou service accounts',
				'Un Role vaut pour tout le cluster, un RoleBinding pour un namespace',
				'Ce sont deux noms pour le même objet'
			],
			answer: 1,
			why: 'Le Role dit ce qu’on peut faire. Le binding dit qui le reçoit. Les versions globales au cluster sont ClusterRole et ClusterRoleBinding.'
		},
		{
			q: 'Alice a un RoleBinding dans `team-a`. Rien d’autre ne la mentionne. Que peut-elle faire dans `team-b` ?',
			options: [
				'Tout lire, parce que la lecture est autorisée par défaut',
				'La même chose que dans `team-a`, parce que les rôles suivent l’utilisateur',
				'Rien, parce que RBAC ne fait qu’accorder et qu’aucun droit ne lui est accordé là',
				'Tout, sauf si une règle de refus la bloque'
			],
			answer: 2,
			why: 'Les permissions RBAC sont purement additives. Un RoleBinding n’accorde que dans son propre namespace, et RBAC n’a pas de règles de refus.'
		},
		{
			q: 'Un namespace a un ResourceQuota sur `requests.cpu`. On soumet un pod sans aucune request CPU, et aucun LimitRange ne fixe de valeur par défaut. Que se passe-t-il ?',
			options: [
				'Le pod tourne avec un CPU illimité',
				'Le pod peut être refusé, parce que le quota exige que chaque pod fixe des requests ou des limits CPU',
				'Le quota est ignoré pour ce pod',
				'Kubernetes déplace le pod dans le namespace default'
			],
			answer: 1,
			why: 'Avec un quota CPU actif, les pods doivent déclarer des requests ou des limits pour que le quota puisse les compter. Un LimitRange peut remplir des valeurs par défaut pour les équipes qui oublient.'
		}
	],
	takeaway: 'Les namespaces donnent un espace à chaque équipe. Les Roles et bindings RBAC décident qui peut agir là, les service accounts donnent aux pipelines leur propre identité, et les quotas gardent le partage équitable.',
	sources: [
		{ title: 'Doc Kubernetes, Using RBAC authorization', url: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/' },
		{ title: 'Doc Kubernetes, Namespaces', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/' },
		{ title: 'Doc Kubernetes, Service accounts', url: 'https://kubernetes.io/docs/concepts/security/service-accounts/' },
		{ title: 'Doc Kubernetes, Resource quotas', url: 'https://kubernetes.io/docs/concepts/policy/resource-quotas/' },
		{ title: 'Doc Kubernetes, Multi-tenancy', url: 'https://kubernetes.io/docs/concepts/security/multi-tenancy/' }
	]
};
