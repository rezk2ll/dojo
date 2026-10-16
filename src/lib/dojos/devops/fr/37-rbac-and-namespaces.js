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
		'Kubernetes coupe le travail en deux. Les namespaces disent où vivent les ressources, et **RBAC** dit qui peut faire quoi dans chaque namespace. Un ResourceQuota plafonne ce qu’un namespace consomme au total, pour qu’une équipe ne prenne pas tout le CPU.'
	],
	terms: [
		{ term: 'Namespace', def: 'Un dossier nommé pour des ressources, à l’intérieur d’un cluster. Les noms doivent être uniques dans un namespace, pas entre namespaces. Les nœuds et les PersistentVolumes sont globaux au cluster, dans aucun namespace.' },
		{ term: 'Role / ClusterRole', def: 'Une liste de verbes autorisés (`get`, `list`, `create`, `delete`...) sur des ressources. Un Role vit dans un namespace. Un ClusterRole vaut pour tout le cluster.' },
		{ term: 'RoleBinding / ClusterRoleBinding', def: 'Donne un Role à des sujets : utilisateurs, groupes ou service accounts. Un RoleBinding donne des droits dans son propre namespace, même quand il pointe vers un ClusterRole.' },
		{ term: 'Service account', def: 'Une identité pour un programme, pas pour une personne. Chaque namespace en a un nommé `default`, et un pod qui n’en nomme aucun tourne avec celui-là.' }
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
				note: 'Le Role liste les verbes autorisés, et le RoleBinding nomme qui les reçoit. Alice peut maintenant travailler dans `team-a`. RBAC **ne fait qu’accorder des droits** et n’a pas de règle de refus, donc dans `team-b` elle ne peut rien faire du tout.'
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
			'La ligne 16 nomme le Role `pod-reader`. Ce Role tient en [trois lignes de règles](https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0/content/en/examples/access/simple-role.yaml#L1-L9) : `pods`, avec les verbes `get`, `watch` et `list`, donc Jane peut seulement lire.',
			'La ligne 7, `namespace: default`, limite Jane à un namespace. Le même binding dans `team-a` lui donnerait la lecture là-bas à la place.',
			'Les lignes 8 à 12 contiennent `subjects`, une liste. Ajoute une entrée `kind: Group` et tu gères les gens comme tes groupes Unix, en dehors du cluster.',
			'Les lignes 13 à 17 contiennent `roleRef`, que tu **ne peux pas modifier** après création. Pour pointer vers un autre rôle, tu supprimes le binding et tu en crées un nouveau.'
		]
	},
	tradeoff: {
		gain: [
			'Un cluster pour plusieurs équipes : moins de control planes à mettre à jour et à payer.',
			'Les Roles et les bindings sont du YAML dans Git, donc tu relis qui a reçu quel droit dans une pull request.',
			'Un ResourceQuota empêche un Deployment qui s’emballe de prendre le CPU et la mémoire dont les autres équipes ont besoin.'
		],
		cost: [
			'Par défaut, chaque pod peut joindre tous les autres, dans n’importe quel namespace, tant que tu n’ajoutes pas de NetworkPolicies.',
			'Chaque équipe ajoute des bindings, et sans convention de nommage plus personne ne sait pourquoi tel binding existe.',
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
				'Un Role est pour les utilisateurs humains, un RoleBinding est la même liste de droits pour les service accounts',
				'Un Role liste les actions autorisées sur des ressources. Un RoleBinding donne ce Role à des utilisateurs, groupes ou service accounts',
				'Un Role vaut pour tout le cluster, un RoleBinding est une copie de ce Role limitée à un namespace',
				'Ce sont deux noms pour le même objet, gardés séparés seulement pour les anciens clients de l’API'
			],
			answer: 1,
			why: 'Le Role dit ce qu’on peut faire. Le binding dit qui le reçoit. Les versions globales au cluster sont ClusterRole et ClusterRoleBinding.'
		},
		{
			q: 'Alice a un RoleBinding dans `team-a`. Rien d’autre ne la mentionne. Que peut-elle faire dans `team-b` ?',
			options: [
				'Tout lire, parce que RBAC autorise la lecture dans chaque namespace par défaut',
				'La même chose que dans `team-a`, parce qu’un RoleBinding suit l’utilisateur partout',
				'Rien, parce que RBAC ne fait qu’accorder et qu’aucun droit ne lui est accordé là',
				'Tout, sauf si une règle de refus dans `team-b` la bloque'
			],
			answer: 2,
			why: 'RBAC ne fait qu’accorder des droits. Un RoleBinding n’accorde que dans son propre namespace, et RBAC n’a pas de règles de refus.'
		},
		{
			q: 'Un namespace a un ResourceQuota sur `requests.cpu`. On soumet un pod sans aucune request CPU, et aucun LimitRange ne fixe de valeur par défaut. Que se passe-t-il ?',
			options: [
				'Le pod tourne avec un CPU illimité, car le quota ne compte que les pods qui fixent une request',
				'Le pod peut être refusé, parce que le quota exige que chaque pod fixe des requests ou des limits CPU',
				'Le quota est ignoré pour ce pod, puisqu’il n’y a aucune request à compter',
				'Kubernetes déplace le pod dans le namespace default, où aucun quota ne s’applique'
			],
			answer: 1,
			why: 'Avec un quota CPU actif, les pods doivent déclarer des requests ou des limits pour que le quota puisse les compter. Un LimitRange peut remplir des valeurs par défaut pour les équipes qui oublient.'
		}
	],
	recall: {
		q: 'Alice a un RoleBinding dans `team-a`, et rien d’autre. Que peut-elle faire dans `team-b`, et pourquoi ?',
		a: 'Rien. Un RoleBinding n’accorde des droits que dans son propre namespace, et RBAC n’a pas de règle de refus : sans binding dans `team-b`, elle n’y a aucun droit.'
	},
	sources: [
		{ title: 'Doc Kubernetes, Using RBAC authorization', url: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/' },
		{ title: 'Doc Kubernetes, Namespaces', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/' },
		{ title: 'Doc Kubernetes, Service accounts', url: 'https://kubernetes.io/docs/concepts/security/service-accounts/' },
		{ title: 'Doc Kubernetes, Resource quotas', url: 'https://kubernetes.io/docs/concepts/policy/resource-quotas/' },
		{ title: 'Doc Kubernetes, Multi-tenancy', url: 'https://kubernetes.io/docs/concepts/security/multi-tenancy/' }
	]
};
