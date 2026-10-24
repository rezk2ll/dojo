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
		],
		steps: [
			{
				title: 'Donne une place à chaque équipe',
				questions: [
					{ q: 'Quel est le premier objet à créer pour chaque équipe ?', options: ['Un node pool', 'Un ClusterRole', 'Un namespace', 'Une NetworkPolicy'], answer: 2, why: 'Les namespaces disent où vivent les ressources. Tout le reste pour l’équipe va dedans.' },
					{ q: 'Les deux équipes veulent un Deployment nommé `api`. Y a-t-il conflit ?', options: ['Non : les noms sont uniques dans un namespace, pas entre eux', 'Oui : les noms sont globaux au cluster', 'Seulement s’ils utilisent la même image', 'Oui, sauf si l’un utilise un StatefulSet'], answer: 0, why: 'Chaque namespace a son propre ensemble de noms.' },
					{ q: 'Avec seulement les deux namespaces, l’équipe shop peut-elle supprimer un Deployment de blog ?', options: ['Non : les namespaces bloquent l’accès tout seuls', 'Seulement avec un ClusterRole', 'Non : kubectl refuse les autres namespaces', 'Peut-être : les namespaces seuls ne bloquent rien'], answer: 3, why: 'Les namespaces ne sont que des noms tant que tu n’ajoutes pas de règles RBAC.' },
					{ q: 'Lequel de ces objets n’est dans aucun namespace ?', options: ['Un Deployment', 'Un node', 'Un ServiceAccount', 'Un ResourceQuota'], answer: 1, why: 'Les nodes et les PersistentVolumes sont globaux au cluster.' }
				]
			},
			{
				title: 'Laisse l’équipe shop déployer',
				questions: [
					{ q: 'Quelle paire permet à l’équipe shop de déployer seulement dans `shop` ?', options: ['Un ClusterRoleBinding vers `edit`', 'Un Role et un RoleBinding dans `shop`', 'Un ResourceQuota dans `shop`', 'Un ServiceAccount nommé `shop`'], answer: 1, why: 'Le Role liste les verbes, le RoleBinding dit qui les reçoit, dans `shop`.' },
					{ q: 'Le RoleBinding peut-il pointer vers le ClusterRole intégré `edit` ?', options: ['Oui, et il n’accorde quand même que dans `shop`', 'Non : un RoleBinding ne peut utiliser qu’un Role', 'Oui, et il accorde alors dans tous les namespaces', 'Seulement pour les service accounts'], answer: 0, why: 'Un RoleBinding accorde dans son propre namespace, même quand il pointe vers un ClusterRole.' },
					{ q: 'Qui le binding doit-il nommer ?', options: ['Chaque personne, un sujet par nom', 'Le service account `default`', 'L’admin du cluster', 'Le groupe de l’équipe shop'], answer: 3, why: 'Lie le groupe, et tu gères les personnes hors du cluster, comme des groupes Unix.' },
					{ q: 'Plus tard, tu veux que le binding de shop pointe vers un Role maison au lieu de `edit`. Comment fais-tu ?', options: ['Modifier `roleRef` sur place avec `kubectl edit`', 'Ajouter un second `roleRef` au même binding', 'Supprimer le RoleBinding et en créer un nouveau', 'Renommer le Role maison en `edit`'], answer: 2, why: '`roleRef` ne peut plus changer une fois le binding créé. Pour pointer vers un autre rôle, tu remplaces le binding.' }
				]
			},
			{
				title: 'Donne une identité propre à la CI',
				questions: [
					{ q: 'Sous quelle identité la pipeline doit-elle s’authentifier ?', options: ['Le compte du lead dev', 'Un ServiceAccount créé pour elle, comme `ci` dans `shop`', 'Le service account `default`', 'L’admin du cluster'], answer: 1, why: 'Un programme reçoit sa propre identité, jamais le compte d’une personne. `default` est partagé par tous les pods qui ne nomment aucun compte.' },
					{ q: 'De quoi d’autre le ServiceAccount de CI a-t-il besoin ?', options: ['Son propre RoleBinding dans `shop`', 'Rien : les service accounts peuvent tout faire', 'Un ResourceQuota', 'Un node à lui'], answer: 0, why: 'Une identité sans binding n’a aucun droit. Lie-la comme n’importe quel sujet.' },
					{ q: 'Quel nom d’utilisateur Kubernetes voit-il pour lui ?', options: ['`ci@shop`', '`shop/ci`', '`system:serviceaccount:shop:ci`', '`serviceaccount-ci`'], answer: 2, why: 'Les noms des service accounts ont la forme `system:serviceaccount:<namespace>:<nom>`.' },
					{ q: 'Comment vérifies-tu qu’il ne peut pas déployer dans `blog` ?', options: ['Lancer la pipeline et regarder', 'Lire le YAML du Role', '`kubectl get rolebindings -A`', '`kubectl auth can-i create deployments -n blog --as=system:serviceaccount:shop:ci`'], answer: 3, why: 'La commande pose la question directement à l’API server, et doit répondre `no`.' }
				]
			},
			{
				title: 'Plafonne l’équipe blog',
				questions: [
					{ q: 'Quel objet plafonne l’équipe blog à 2 CPU ?', options: ['Un LimitRange', 'Un ResourceQuota avec `requests.cpu: "2"`', 'Un PodDisruptionBudget', 'Un Role avec `cpu` dans ses règles'], answer: 1, why: 'Un ResourceQuota plafonne la somme de tous les pods du namespace.' },
					{ q: 'Un pod ferait dépasser le quota du namespace. Que se passe-t-il ?', options: ['Il est refusé avec `403 Forbidden`', 'Il tourne, bridé', 'Il attend en `Pending`', 'Il part dans un autre namespace'], answer: 0, why: 'Le quota est vérifié à la création du pod, et l’API server le refuse.' },
					{ q: 'Blog fait tourner 4 pods qui demandent chacun 500m et en utilisent environ 100m. Peut-il lancer un cinquième pod qui demande 500m ?', options: ['Oui : les pods n’utilisent que 0,4 CPU', 'Oui, dès que le scheduler trouve un nœud', 'Non : le quota additionne les requests, et 2 CPU sont déjà demandés', 'Seulement si le pod ne fixe aucune limit'], answer: 2, why: 'Un ResourceQuota sur `requests.cpu` compte ce que les pods demandent, pas ce qu’ils utilisent. 4 × 500m atteint déjà le plafond de 2.' },
					{ q: 'Le quota refuse aussi les pods de blog qui ne déclarent aucune request CPU. Comment éviter ces refus à l’équipe ?', options: ['Retirer le quota', 'Lui donner un ClusterRole', 'Utiliser un PDB', 'Ajouter un LimitRange avec des requests par défaut, ou prévenir l’équipe'], answer: 3, why: 'Un LimitRange remplit des valeurs par défaut pour les pods qui oublient.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Monter deux namespaces d’équipe avec RBAC et un quota CPU, puis prouver chaque règle avec `kubectl auth can-i` et un pod refusé.',
		steps: [
			'Démarre un cluster local avec `minikube start`, puis crée les namespaces : `kubectl create namespace shop && kubectl create namespace blog`.',
			'Donne au groupe de l’équipe shop le rôle intégré `edit` dans `shop` : `kubectl -n shop create rolebinding shop-team-edit --clusterrole=edit --group=shop-team`.',
			'Donne à la CI sa propre identité : `kubectl -n shop create serviceaccount ci && kubectl -n shop create rolebinding ci-edit --clusterrole=edit --serviceaccount=shop:ci`.',
			'Interroge l’API server, pour les deux namespaces : `kubectl auth can-i create deployments -n shop --as=alice --as-group=shop-team`, puis la même avec `-n blog`, puis `kubectl auth can-i create deployments -n blog --as=system:serviceaccount:shop:ci`.',
			'Plafonne `blog` avec un petit quota qui tient sur un portable : `kubectl -n blog create quota cpu --hard=requests.cpu=500m`. Lance `kubectl -n blog create deployment web --image=nginx:1.27` et lis `kubectl -n blog get events --field-selector reason=FailedCreate`. Puis `kubectl -n blog set resources deployment web --requests=cpu=200m`, `kubectl -n blog scale deployment web --replicas=3`, et `kubectl -n blog describe quota cpu`. Nettoie avec `kubectl delete namespace shop blog`.'
		],
		done: [
			'`can-i` répond `yes` pour Alice et pour la CI dans `shop`, et `no` pour les deux dans `blog`.',
			'Avant `set resources`, `kubectl -n blog get pods` ne montre rien et les events disent `must specify requests.cpu`.',
			'Après le scale à 3, seuls 2 pods tournent, le quota montre `400m` utilisés sur `500m`, et les events disent `exceeded quota`.'
		],
		solution: [
			'Un RoleBinding n’accorde que dans son propre namespace, même quand il pointe vers le ClusterRole `edit`. RBAC n’a pas de règle de refus : Alice et la CI sont refusées dans `blog` parce que rien ne leur y accorde quoi que ce soit.',
			'`--as` et `--as-group` empruntent l’identité d’un utilisateur, c’est comme ça que tu testes des règles sans son compte.',
			'Avec un quota CPU actif, un pod sans request CPU est refusé. Deux pods à `200m` utilisent `400m`, et un troisième atteindrait `600m`, au-dessus du plafond de `500m`. Un LimitRange avec une request par défaut aurait évité le premier refus.'
		]
	},
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
