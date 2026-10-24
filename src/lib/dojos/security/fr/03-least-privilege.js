const COSIGN = 'https://github.com/sigstore/cosign/blob/cfeaa4a435c9d42cf724b3e1aac20c1cc09c4be7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'least-privilege',
	part: 'Les menaces',
	title: 'Le moindre privilège',
	minutes: 10,
	hook: [
		'Entre le 14 et le 15 mars 2025, quelqu’un déplace les tags de version de `tj-actions/changed-files`, une GitHub Action utilisée par plus de 23 000 dépôts, vers un commit malveillant, `0e58ed8`. Les workflows qui utilisaient un tag comme `@v44.5.1` lancent le nouveau code sans rien changer de leur côté. L’avis porte le numéro CVE-2025-30066.',
		'Le nouveau code télécharge un script Python qui lit la mémoire du processus worker du runner. Il écrit les secrets trouvés, encodés en base64, dans le log du build. Dans un dépôt public, tout le monde peut lire ce log.',
		'Tous les dépôts touchés ont lancé le même script. La suite variait d’un dépôt à l’autre : elle dépendait de ce que chaque secret fuité avait le droit de faire, et pendant combien de temps. Le **moindre privilège** limite chaque secret à ce dont sa tâche a besoin, pour qu’un secret fuité serve moins.'
	],
	terms: [
		{ term: 'Moindre privilège', def: 'Chaque processus, utilisateur et jeton ne reçoit que les droits dont sa tâche a besoin, et seulement le temps qu’il en a besoin.' },
		{ term: 'Rayon d’impact', def: 'Tout ce qu’un attaquant peut faire avec un identifiant volé avant qu’il expire ou que quelqu’un le révoque.' },
		{ term: 'GITHUB_TOKEN', def: 'Un jeton que GitHub crée au début de chaque job de workflow. Il ne marche que sur le dépôt du workflow, porte les droits fixés par `permissions:`, et expire à la fin du job ou au bout de 24 heures au plus.' },
		{ term: 'Role', def: 'Dans le RBAC de Kubernetes, une liste de verbes permis sur des ressources d’un namespace. Un RoleBinding donne un Role à un utilisateur ou à un ServiceAccount.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['tag["tag v44.5.1 déplacé vers 0e58ed8"] --> job["Le job du workflow lance l’action"]', 'job --> dump["Le script lit la mémoire du runner"]', 'dump --> log["Secrets écrits dans le log public"]'],
				highlight: ['tag', 'dump', 'log'],
				note: 'Le chemin d’attaque est le même pour tous les dépôts : le tag bouge, le job lance le nouveau code, le code vide la mémoire, le log montre les secrets. La défense de ce chapitre ne coupe pas ce chemin. Elle décide de ce que les secrets affichés permettent ensuite.'
			},
			{
				add: ['log --> pat["PAT classique stocké : valide jusqu’à sa révocation"]'],
				highlight: ['pat'],
				note: 'Un personal access token classique stocké en secret agit au nom de la personne qui l’a créé. La doc GitHub : il « can access every repository that you can access ». Il reste valide après la fin du job : le rayon d’impact couvre tous les dépôts de cette personne, jusqu’à la rotation du jeton.'
			},
			{
				add: ['log --> wide["GITHUB_TOKEN, sans clé permissions, défaut du dépôt en lecture et écriture"]'],
				highlight: ['wide'],
				note: 'Le `GITHUB_TOKEN` est limité à un dépôt et meurt à la fin du job, 6 heures au plus sur les runners hébergés par GitHub. Avec un défaut en lecture et écriture et sans clé `permissions:`, il peut quand même écrire dans le contenu du dépôt, par exemple créer une release, tant qu’il vit.'
			},
			{
				add: ['log --> narrow["GITHUB_TOKEN avec permissions: contents: read"]'],
				highlight: ['narrow'],
				note: 'Avec `permissions: contents: read`, le même jeton fuité ne peut que lire du code que l’attaquant voit peut-être déjà dans un dépôt public. La doc : « If you specify the access for any of these permissions, all of those that are not specified are set to `none`. » **La fuite est la même, mais le jeton ne peut plus rien écrire.**'
			},
			{
				add: ['sa["Jeton d’un pod Kubernetes : Role get sur configmaps/app-config"] -.->|"même règle dans un cluster"| narrow'],
				highlight: ['sa'],
				note: 'Un pod reçoit un jeton de ServiceAccount, et la même question se pose si on le vole. Un Role avec `resourceNames: ["app-config"]` et `verbs: ["get"]` laisse le jeton volé lire une seule ConfigMap. Un ClusterRoleBinding vers `edit` le laisserait lire les Secrets de tous les namespaces.'
			}
		]
	},
	example: {
		title: '.github/workflows/build.yaml dans sigstore/cosign : aucun accès par défaut, trois droits pour un job',
		repo: 'sigstore/cosign',
		url: `${COSIGN}/.github/workflows/build.yaml#L32-L86`,
		lang: 'yaml',
		code: `permissions: {}

jobs:
  build:
    name: build
    runs-on: ubuntu-latest

    if: github.repository == 'sigstore/cosign'

    permissions:
      id-token: write
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - uses: sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6 # v4.1.2
…
      - name: Login to GitHub Container Registry
        uses: docker/login-action@dbcb813823bdd20940b903addbd779551569679f # v4.6.0
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: containers-cosign
        run: make sign-ci-containers
        env:
          KO_PREFIX: ghcr.io/sigstore/cosign/cosign/ci
          COSIGN_PASSWORD: "\${{secrets.COSIGN_PASSWORD}}"
          LATEST_TAG: \${{ github.ref == 'refs/heads/main' && ',latest' || '' }}`,
		notes: [
			'`permissions: {}` en haut met chaque droit à none pour chaque job qui ne fixe pas les siens. La doc : « You can use the following syntax to disable permissions for all of the available permissions ». Un nouveau job ajouté à ce fichier démarre avec un jeton qui ne peut rien faire.',
			'Le job `build` demande ensuite trois droits, et chacun correspond à une étape. `contents: read` permet au checkout de récupérer le code. `packages: write` permet à `docker/login-action` de pousser des images sur ghcr.io avec `secrets.GITHUB_TOKEN`. `id-token: write` permet au job d’obtenir un jeton OIDC, que l’étape de connexion à Google Cloud échange contre des identifiants cloud de courte durée.',
			'`persist-credentials: false` désactive un comportement par défaut du checkout. Le README : garder le jeton « enables your scripts to run authenticated git commands », et il « is removed during post-job cleanup ». Chaque ligne `uses:` donne aussi un SHA de commit complet de 40 caractères, que les attaquants de tj-actions ne pouvaient pas déplacer comme un tag. Le guide de GitHub : un attaquant « would need to generate a SHA-1 collision for a valid Git object payload ».',
			'Si une étape ici laissait fuir `GITHUB_TOKEN`, l’attaquant pourrait publier des paquets pour ce dépôt jusqu’à la fin du job. Il ne pourrait pas pousser de commit, puisque `contents` est en `read`. `COSIGN_PASSWORD` est un secret stocké qui n’expire pas avec le job : il faudrait quand même le changer.'
		]
	},
	tradeoff: {
		gain: [
			'Un `GITHUB_TOKEN` fuité avec `contents: read` ne peut pas pousser de code, et il cesse de marcher à la fin du job, 6 heures au plus tard sur un runner hébergé par GitHub.',
			'`permissions: {}` en haut oblige chaque job à lister ce qu’il utilise : un relecteur peut relier `packages: write` à la seule étape qui pousse une image.'
		],
		cost: [
			'Chaque nouvelle étape qui demande plus d’accès échoue jusqu’à ce que quelqu’un ajoute le droit au job.',
			'Une clé `permissions:` étroite ne limite pas les secrets stockés. Pour tj-actions, l’avis demandait de « rotate any secrets that may have been exposed », quels que soient les réglages du jeton.',
			'Dans Kubernetes, `resourceNames` ne peut pas limiter `create` ni `deletecollection`. Un pod qui crée une seule ConfigMap reçoit le droit d’en créer n’importe laquelle dans son namespace.'
		]
	},
	task: {
		prompt: 'Dans le namespace `shop`, un pod de nuit `report` lit une seule ConfigMap, `report-config`, et rien d’autre. Son ServiceAccount `report` est lié au ClusterRole intégré `edit` par un ClusterRoleBinding. Écris ce qu’un jeton volé sur ce pod permet aujourd’hui, puis le Role et le RoleBinding qui ne laissent que le nécessaire, et la commande qui le prouve.',
		hint: 'Regarde deux choses : le type de liaison (RoleBinding ou ClusterRoleBinding) fixe les namespaces, et les règles du Role fixent les verbes et les objets.',
		answer: [
			'Aujourd’hui : un ClusterRoleBinding donne le ClusterRole « across the entire cluster (all namespaces) ». La doc Kubernetes dit que `edit` « allows accessing Secrets and running Pods as any ServiceAccount in the namespace ». Le jeton peut donc lire tous les Secrets et lancer des Pods dans tous les namespaces.',
			'Role dans `shop` : `rules: [{ apiGroups: [""], resources: ["configmaps"], resourceNames: ["report-config"], verbs: ["get"] }]`. Puis un RoleBinding dans `shop` avec `subjects: [{ kind: ServiceAccount, name: report, namespace: shop }]` et `roleRef: { apiGroup: rbac.authorization.k8s.io, kind: Role, name: report-reader }`. Supprime le ClusterRoleBinding.',
			'Vérification : `kubectl auth can-i get configmaps/report-config -n shop --as system:serviceaccount:shop:report` répond `yes`, et `kubectl auth can-i list secrets -n shop --as system:serviceaccount:shop:report` répond `no`.',
			'Rayon d’impact après : une ConfigMap, en lecture, dans un namespace. Les pods qui n’appellent aucune API peuvent aussi mettre `automountServiceAccountToken: false` : il n’y a alors plus de jeton à voler.'
		],
		steps: [
			{
				title: 'Lis ce que le jeton permet aujourd’hui',
				questions: [
					{ q: 'Le ServiceAccount est lié par un ClusterRoleBinding. Dans quels namespaces `edit` s’applique-t-il ?', options: ['Seulement `shop`', 'Seulement `shop` et `default`', 'Tous les namespaces du cluster', 'Seulement les namespaces avec le bon label'], answer: 2, why: 'Un ClusterRoleBinding donne le ClusterRole « across the entire cluster (all namespaces) ».' },
					{ q: 'Que permet `edit`, d’après la doc Kubernetes ?', options: ['Lire les Secrets et lancer des Pods sous n’importe quel ServiceAccount', 'Lire les ConfigMaps et rien d’autre', 'Modifier les Roles et les RoleBindings', 'Se connecter aux nœuds en SSH'], answer: 0, why: 'La doc dit que `edit` « allows accessing Secrets and running Pods as any ServiceAccount in the namespace ». Il ne permet pas de modifier les rôles.' },
					{ q: 'Quel est donc le rayon d’impact d’un jeton volé aujourd’hui ?', options: ['Une ConfigMap dans `shop`', 'Toutes les ConfigMaps de `shop`', 'Rien tant que le job de nuit ne tourne pas', 'Tous les Secrets, et de nouveaux Pods, dans tous les namespaces'], answer: 3, why: 'Portée du cluster fois droits de `edit` : le jeton lit les Secrets et lance des Pods partout.' },
					{ q: 'De quoi le pod a-t-il vraiment besoin ?', options: ['De `list` sur toutes les ConfigMaps de `shop`', 'De `get` sur la ConfigMap `report-config` de `shop`', 'De `get` sur les ConfigMaps de tous les namespaces', 'De `edit`, mais seulement dans `shop`'], answer: 1, why: 'Il lit une ConfigMap et rien d’autre. Le moindre privilège lui donne exactement ça.' }
				]
			},
			{
				title: 'Écris le Role',
				questions: [
					{ q: 'Quel type d’objet porte la règle ?', options: ['Un ClusterRole, lié sur tout le cluster', 'Un Role dans le namespace `shop`', 'Un ServiceAccount avec une annotation', 'Une ConfigMap qui liste les verbes'], answer: 1, why: 'Un Role est une liste de verbes sur des ressources d’un namespace : tout ce dont le pod a besoin.' },
					{ q: 'Quelle valeur de `apiGroups` convient aux ConfigMaps ?', options: ['`["apps"]`', '`["rbac.authorization.k8s.io"]`', '`["*"]`', '`[""]`, le groupe core'], answer: 3, why: 'Les ConfigMaps sont dans le groupe d’API core, écrit comme une chaîne vide. `"*"` prendrait tous les groupes.' },
					{ q: 'Quel champ limite la règle à une seule ConfigMap ?', options: ['`namespace: shop`', '`verbs: ["get"]`', '`resourceNames: ["report-config"]`', '`resources: ["configmaps"]`'], answer: 2, why: '`resourceNames` nomme les objets. Sans lui, `get` marche sur toutes les ConfigMaps de `shop`.' },
					{ q: 'Plus tard, le pod doit aussi créer une ConfigMap. Pourquoi `resourceNames` ne peut-il pas limiter ça à un objet ?', options: ['`resourceNames` ne peut pas limiter `create`', '`create` n’est pas un verbe RBAC valide', 'Un Role ne peut pas porter deux verbes', '`resourceNames` ne marche que sur les Secrets'], answer: 0, why: 'Dans Kubernetes, `resourceNames` ne peut limiter ni `create` ni `deletecollection`. Un pod qui crée une ConfigMap peut en créer n’importe laquelle dans son namespace.' }
				]
			},
			{
				title: 'Lie-le au pod',
				questions: [
					{ q: 'Quelle liaison donne le Role au pod dans `shop` seulement ?', options: ['Un RoleBinding dans `shop`', 'Un ClusterRoleBinding vers le Role', 'Un RoleBinding dans `default`', 'Une annotation sur le pod'], answer: 0, why: 'Un RoleBinding donne un rôle dans un seul namespace. C’est la portée dont le pod a besoin.' },
					{ q: 'Que mets-tu dans `subjects` ?', options: ['`{ kind: User, name: report }`', '`{ kind: Pod, name: report, namespace: shop }`', '`{ kind: ServiceAccount, name: report, namespace: shop }`', '`{ kind: Group, name: system:serviceaccounts }`'], answer: 2, why: 'Le pod agit sous son ServiceAccount, donc le sujet est le ServiceAccount `report` de `shop`. Le groupe donnerait le Role à tous les ServiceAccounts.' },
					{ q: 'Que fais-tu de l’ancien ClusterRoleBinding ?', options: ['Le garder en secours pour le pod', 'Le supprimer, sinon le jeton garde `edit` partout', 'Le faire pointer vers le rôle `view`', 'Rien : le RoleBinding le remplace'], answer: 1, why: 'Le nouveau Role ajoute un droit ; il n’en retire aucun. Tant que le ClusterRoleBinding existe, le jeton garde `edit` dans tous les namespaces.' },
					{ q: 'Un pod n’appelle aucune API. Qu’est-ce qui supprime complètement son jeton ?', options: ['Un Role sans règle', '`permissions: {}` sur le pod', 'Un RoleBinding vers `view`', '`automountServiceAccountToken: false`'], answer: 3, why: 'Sans jeton monté, il n’y a rien à voler.' }
				]
			},
			{
				title: 'Prouve-le',
				questions: [
					{ q: 'Quelle commande vérifie que le pod lit encore sa ConfigMap ?', options: ['`kubectl get configmap report-config -n shop`', '`kubectl describe role report-reader -n shop`', '`kubectl get rolebinding -n shop`', '`kubectl auth can-i get configmaps/report-config -n shop --as system:serviceaccount:shop:report`'], answer: 3, why: '`--as` interroge l’API server au nom du ServiceAccount. Un simple `kubectl get` utilise tes droits, pas ceux du pod.' },
					{ q: 'Que doit répondre `kubectl auth can-i list secrets -n shop --as system:serviceaccount:shop:report` ?', options: ['`yes`', '`no`', 'Une erreur : les Secrets exigent un ClusterRole', '`yes`, mais seulement pour son propre Secret'], answer: 1, why: 'Le Role nomme une ConfigMap et le verbe `get`. Rien ne donne accès aux Secrets.' },
					{ q: 'Pourquoi vérifier avec `--as` et pas avec ton compte ?', options: ['Ton compte a plus de droits que le pod', 'C’est plus rapide qu’une requête normale', '`can-i` ne tourne pas sans `--as`', 'Ça fait aussi tourner le jeton du pod'], answer: 0, why: 'Un `yes` pour un admin ne prouve rien sur le pod. C’est l’identité du pod qu’un voleur récupère.' },
					{ q: 'Quel est le rayon d’impact après le correctif ?', options: ['Toutes les ConfigMaps de `shop`, en lecture', 'Une ConfigMap, en lecture et écriture', 'Une ConfigMap, en lecture, dans un namespace', 'Rien : le jeton ne sert plus à rien'], answer: 2, why: 'C’est ce dont le job a besoin, et tout ce qu’un voleur obtient.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un workflow a `permissions: contents: read` en haut, et rien d’autre. Que peut faire son `GITHUB_TOKEN` avec les issues ?',
			options: [
				'Les lire et les écrire, car le défaut du dépôt s’applique encore',
				'Les lire seulement, car la lecture est donnée à tous les scopes',
				'Rien, car les droits non listés passent à none',
				'Les écrire seulement dans les pull requests venues d’un fork'
			],
			answer: 2,
			why: 'Dès que tu listes un droit, GitHub met tous les autres à `none`. Le défaut du dépôt ne s’applique que si le workflow n’a aucune clé `permissions:`.'
		},
		{
			q: 'Quel secret affiché dans un log public le 14 mars 2025 marchait encore le lendemain ?',
			options: [
				'Le `GITHUB_TOKEN` du job, s’il avait des droits en écriture',
				'Un personal access token stocké en secret du dépôt',
				'Le jeton cloud obtenu par OIDC avec `id-token: write`',
				'Aucun, car GitHub masque les secrets dans les logs'
			],
			answer: 1,
			why: 'Le `GITHUB_TOKEN` expire à la fin du job, 24 heures au plus, et un jeton cloud obtenu par OIDC est « only valid for a single job ». Un personal access token stocké reste valide jusqu’à sa révocation. Le masquage n’a pas aidé : le script affichait les secrets en base64, et GitHub prévient que le masquage d’un secret transformé « is not guaranteed ».'
		},
		{
			q: 'Pourquoi un ClusterRoleBinding vers `edit` donne-t-il plus à un pod qu’un RoleBinding vers `edit` dans son namespace ?',
			options: [
				'Un ClusterRoleBinding donne aussi le droit de modifier les rôles RBAC',
				'Un ClusterRoleBinding donne le rôle dans tous les namespaces du cluster',
				'Le jeton d’un ClusterRoleBinding n’expire jamais, celui d’un RoleBinding oui',
				'Un ClusterRoleBinding permet aussi au pod de se connecter au nœud en SSH'
			],
			answer: 1,
			why: 'La liaison fixe la portée : un RoleBinding donne un rôle dans un namespace, un ClusterRoleBinding le donne dans tous. `edit` lui-même ne permet pas de modifier les rôles. La durée de vie du jeton ne dépend pas de la liaison.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Mesure ce qu’un jeton de ServiceAccount volé permet dans un cluster local, puis réduis-le à une ConfigMap et prouve-le avec `kubectl auth can-i`.',
		steps: [
			'Lance un cluster local jetable : `minikube start -p rbac-lab` (ou `kind create cluster --name rbac-lab`). Vérifie avec `kubectl get nodes`.',
			'Recrée le montage de l’exercice : `kubectl create namespace shop`, `kubectl create serviceaccount report -n shop`, `kubectl create configmap report-config -n shop --from-literal=title=Nightly`, puis `kubectl create clusterrolebinding report-edit --clusterrole=edit --serviceaccount=shop:report`.',
			'Demande ce que le jeton permet aujourd’hui : `kubectl auth can-i list secrets -n kube-system --as system:serviceaccount:shop:report`, puis `kubectl auth can-i create pods -n default --as system:serviceaccount:shop:report`.',
			'Réduis-le : `kubectl delete clusterrolebinding report-edit`, puis `kubectl create role report-reader -n shop --verb=get --resource=configmaps --resource-name=report-config`, puis `kubectl create rolebinding report-reader -n shop --role=report-reader --serviceaccount=shop:report`.',
			'Prouve-le. Lance chacune de ces commandes avec `--as system:serviceaccount:shop:report` à la fin : `kubectl auth can-i get configmaps/report-config -n shop`, `kubectl auth can-i get configmaps/other -n shop`, `kubectl auth can-i list secrets -n shop`. Puis supprime le cluster : `minikube delete -p rbac-lab` (ou `kind delete cluster --name rbac-lab`).'
		],
		done: [
			'Avant le correctif, les deux vérifications de l’étape 3 répondent `yes` : le jeton lit les Secrets de `kube-system` et crée des Pods dans `default`.',
			'Après le correctif, `get configmaps/report-config` répond `yes`, et `get configmaps/other` et `list secrets` répondent `no`.',
			'`kubectl get role report-reader -n shop -o yaml` montre une seule règle : `configmaps`, `resourceNames: [report-config]`, `verbs: [get]`.'
		],
		solution: [
			'Le ClusterRoleBinding donnait `edit` dans tous les namespaces : c’est par là que le jeton atteignait `kube-system`. Le supprimer est l’étape qui réduit la portée ; le nouveau Role seul ne retire rien.',
			'`--resource-name` écrit `resourceNames`, qui limite `get` à un objet. Sans lui, `get configmaps/other` répondrait `yes`.',
			'`kubectl auth can-i --as` interroge l’API server au nom du ServiceAccount : tu testes les droits du pod, pas les tiens.'
		]
	},
	recall: {
		q: 'Dans la fuite de tj-actions/changed-files, quelles deux propriétés d’un jeton fixaient son rayon d’impact ?',
		a: 'Ses droits et sa durée de vie. Un `GITHUB_TOKEN` en `contents: read` meurt à la fin du job ; un personal access token stocké garde tous ses droits jusqu’à sa rotation.'
	},
	sources: [
		{ title: 'Avis GitHub GHSA-mrrh-fwg8-r2c3 (CVE-2025-30066), tj-actions/changed-files', url: 'https://github.com/advisories/GHSA-mrrh-fwg8-r2c3' },
		{ title: 'Doc GitHub, GITHUB_TOKEN', url: 'https://docs.github.com/en/actions/concepts/security/github_token' },
		{ title: 'Doc GitHub, syntaxe des workflows : permissions', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions' },
		{ title: 'Doc GitHub, Secure use reference', url: 'https://docs.github.com/en/actions/reference/security/secure-use' },
		{ title: 'Doc GitHub, Managing your personal access tokens', url: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens' },
		{ title: 'README de actions/checkout', url: 'https://github.com/actions/checkout/blob/f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a/README.md' },
		{ title: 'Doc Kubernetes, Using RBAC Authorization', url: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/' },
		{ title: 'Doc Kubernetes, Role Based Access Control Good Practices', url: 'https://kubernetes.io/docs/concepts/security/rbac-good-practices/' }
	]
};
