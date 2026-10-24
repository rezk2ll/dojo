const HELM = 'https://github.com/helm/examples/blob/4888ba8fb8180dd0c36d1e84c1fcafc6efd81532';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'helm',
	part: 'Kubernetes',
	title: 'Helm : un gestionnaire de paquets pour Kubernetes',
	minutes: 10,
	hook: [
		'Ton appli a maintenant un Deployment, un Service, un Ingress, une ConfigMap et un PVC. Cinq fichiers YAML. La préprod veut 1 réplica, la prod en veut 3, et le tag de l’image change à chaque release.',
		'Tu pourrais copier les fichiers par environnement et les éditer avec `sed`. Après quelques releases, les trois copies diffèrent, et personne ne se souvient laquelle est la bonne.',
		'Helm fait pour Kubernetes ce que `apt` fait pour Debian. Un **chart** est le paquet : des templates (du YAML Kubernetes avec des placeholders comme `{{ .Values.replicaCount }}`) plus des valeurs par défaut. Tu l’installes avec tes propres valeurs, et Helm enregistre chaque installation comme une release, avec des révisions numérotées sur lesquelles tu peux faire un rollback.'
	],
	terms: [
		{ term: 'Chart', def: 'Un paquet Helm : un `Chart.yaml`, un `values.yaml` avec les valeurs par défaut, et un dossier `templates/` de YAML Kubernetes à trous.' },
		{ term: 'Values', def: 'Les réglages injectés dans les templates. Les défauts viennent de `values.yaml`, les surcharges de `-f file.yaml` ou `--set key=value`.' },
		{ term: 'Release', def: 'Une installation d’un chart dans un cluster, avec son propre nom. Installe le même chart deux fois, tu as deux releases.' },
		{ term: 'Révision', def: 'Une version numérotée d’une release. Chaque install, upgrade ou rollback ajoute 1. La première est toujours 1.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'subgraph chart["Chart hello-world"]',
					'tpl["templates/deployment.yaml"]',
					'def["values.yaml : replicaCount 1"]',
					'end'
				],
				highlight: ['tpl', 'def'],
				note: 'Un **chart** est un dossier qui contient `templates/` et `values.yaml`. Les templates sont tes manifestes avec des placeholders. `values.yaml` contient les défauts, donc le chart s’installe sans aucune valeur en plus.'
			},
			{
				add: [
					'prod["prod.yaml : replicaCount 3"]',
					'set["--set image.tag=1.27"]',
					'helm["helm upgrade --install"]',
					'tpl --> helm',
					'def --> helm',
					'prod --> helm',
					'set --> helm'
				],
				highlight: ['prod', 'set', 'helm'],
				note: 'Les valeurs fusionnent dans l’ordre : défauts du chart, puis tes fichiers `-f` (le plus à droite gagne), puis `--set` (qui gagne sur tout). Chaque environnement installe le même chart avec son propre fichier de valeurs, sans copier de YAML.'
			},
			{
				add: [
					'api["API server Kubernetes"]',
					'helm -->|"manifestes rendus"| api'
				],
				highlight: ['api'],
				note: 'Helm rend les templates en YAML simple et l’envoie à l’**API server**. Ensuite, Kubernetes les traite comme n’importe quels objets, et les contrôleurs font leur travail habituel.'
			},
			{
				add: [
					'rel[("Release my-app : révisions 1, 2, 3")]',
					'helm -->|"enregistre"| rel'
				],
				highlight: ['rel'],
				note: 'Helm stocke chaque **révision** de la release dans le cluster, dans des Secrets du namespace de la release par défaut. `helm history my-app` les liste.'
			},
			{
				add: [
					'rb["helm rollback my-app 2"]',
					'rb --> rel'
				],
				highlight: ['rb'],
				note: 'La révision 3 est cassée ? `helm rollback my-app 2` réapplique la révision 2. Les révisions 1 à 3 restent dans l’historique, et Helm enregistre le rollback comme **révision 4**.'
			}
		]
	},
	example: {
		title: 'charts/hello-world/templates/deployment.yaml',
		repo: 'helm/examples',
		url: `${HELM}/charts/hello-world/templates/deployment.yaml#L1-L21`,
		lang: 'yaml',
		code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "hello-world.fullname" . }}
  labels:
    {{- include "hello-world.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "hello-world.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "hello-world.selectorLabels" . | nindent 8 }}
    spec:
      serviceAccountName: {{ include "hello-world.serviceAccountName" . }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}`,
		notes: [
			'Le projet Helm publie ce chart d’exemple. C’est un Deployment comme celui du chapitre 32, avec des placeholders `{{ }}` là où vont les valeurs.',
			'La ligne 8, `{{ .Values.replicaCount }}`, vient de [values.yaml](https://github.com/helm/examples/blob/4888ba8fb8180dd0c36d1e84c1fcafc6efd81532/charts/hello-world/values.yaml#L5-L11), où il vaut `1`. `--set replicaCount=3` le change sans toucher au chart.',
			'Ligne 20, le tag de l’image vaut par défaut `.Chart.AppVersion`, la version de l’appli dans [Chart.yaml](https://github.com/helm/examples/blob/4888ba8fb8180dd0c36d1e84c1fcafc6efd81532/charts/hello-world/Chart.yaml#L15-L24) (`1.16.0`). La `version` du chart lui-même (`0.1.0`) est un autre champ : `version` numérote le paquet, et `appVersion` numérote l’appli qu’il contient.',
			'Les lignes 11 et 15 prennent les labels du selector dans un [helper](https://github.com/helm/examples/blob/4888ba8fb8180dd0c36d1e84c1fcafc6efd81532/charts/hello-world/templates/_helpers.tpl#L45-L51) qui inclut `.Release.Name`. Installe le chart deux fois en deux releases, et leurs Services ne sélectionnent jamais les Pods de l’autre.'
		]
	},
	tradeoff: {
		gain: [
			'La préprod et la prod installent le même chart et ne diffèrent que par les valeurs, donc leurs manifestes gardent la même forme.',
			'Helm garde l’historique de chaque release, et `helm rollback` te ramène à une révision connue et saine en une commande.',
			'Des charts tout prêts pour les bases de données, la supervision et les ingress controllers, listés sur [Artifact Hub](https://artifacthub.io), installés avec tes propres valeurs.'
		],
		cost: [
			'Les templates dans du YAML sont durs à lire et faciles à casser : une mauvaise indentation dans `nindent` et ton YAML est invalide.',
			'Un chart tiers, c’est du code que tu fais tourner avec des droits sur le cluster. Lis ses templates et ses valeurs avant de l’installer.',
			'Si quelqu’un modifie un objet à la main avec `kubectl`, la release ne correspond plus au cluster.'
		]
	},
	task: {
		prompt: 'La release `shop` est en révision 5 après `helm upgrade shop ./chart -f prod.yaml --set image.tag=2.4.0`. La nouvelle version plante. Reviens au dernier état qui marchait, puis explique à quoi ressemble l’historique de la release ensuite, et comment tu verrais le YAML que Helm envoie **avant** le prochain upgrade.',
		hint: 'Le rollback prend un numéro de révision, et il est lui-même enregistré. Une commande Helm rend les templates en local sans toucher au cluster.',
		answer: [
			'`helm history shop` pour trouver la dernière bonne révision, disons 4. Puis `helm rollback shop 4` (sans numéro, Helm revient à la révision précédente).',
			'L’historique montre maintenant une révision **6**, copie de la révision 4. Les révisions 1 à 5 sont toujours là.',
			'Avant le prochain upgrade, `helm template shop ./chart -f prod.yaml --set image.tag=2.4.1` affiche les manifestes rendus, pour que tu puisses les lire ou les comparer d’abord.',
			'Ensuite corrige le bug dans le chart ou dans l’image, dans Git, pour que le prochain upgrade ne le ramène pas.'
		],
		steps: [
			{
				title: 'Trouve la dernière bonne révision',
				questions: [
					{ q: 'Quelle commande liste les révisions de `shop` ?', options: ['`helm list shop`', '`helm history shop`', '`kubectl get revisions`', '`helm status shop --all`'], answer: 1, why: '`helm history` liste chaque révision numérotée d’une release.' },
					{ q: 'Où Helm garde-t-il ces révisions par défaut ?', options: ['Dans des Secrets du namespace de la release', 'Dans un fichier à côté de `Chart.yaml`', 'Dans le dépôt de charts', 'Dans l’historique de ton shell'], answer: 0, why: 'Helm stocke chaque révision dans le cluster, dans des Secrets du namespace de la release par défaut.' },
					{ q: 'Le plantage est arrivé avec la révision 5. Quelle est sans doute la dernière bonne ?', options: ['La révision 1, toujours', 'La révision 6', 'La révision 0', 'La révision 4, celle d’avant l’upgrade'], answer: 3, why: 'L’upgrade qui plante a créé la révision 5. Celle d’avant tournait bien.' },
					{ q: 'Qu’est-ce qui a ajouté la révision 5 ?', options: ['Le plantage lui-même', 'Un `kubectl edit` d’un collègue', 'Le `helm upgrade` que tu as lancé', 'Helm, une fois par jour'], answer: 2, why: 'Chaque install, upgrade ou rollback ajoute 1 au numéro de révision.' }
				]
			},
			{
				title: 'Fais le rollback',
				questions: [
					{ q: 'Quelle commande revient à la révision 4 ?', options: ['`helm rollback shop 4`', '`helm upgrade shop --revision 4`', '`helm uninstall shop`', '`kubectl rollout undo shop`'], answer: 0, why: '`helm rollback` prend le nom de la release et la révision à réappliquer.' },
					{ q: 'Que fait `helm rollback shop` sans numéro de révision ?', options: ['Il échoue avec une erreur d’usage', 'Il revient à la révision 1', 'Il revient à la révision précédente', 'Il supprime la révision 5'], answer: 2, why: 'Sans numéro, Helm revient à la révision précédente.' },
					{ q: 'Qu’envoie Helm au cluster pendant le rollback ?', options: ['Rien : il modifie seulement l’historique', 'Une suppression de tous les objets de la release', 'Le chart de ton dossier local, à nouveau', 'Les manifestes de la révision 4, renvoyés à l’API server'], answer: 3, why: 'Helm réapplique la révision 4. Les contrôleurs ramènent ensuite les Pods à l’ancienne image.' },
					{ q: 'Un collègue a réparé avec `kubectl set image` à la place. Quel est le problème ?', options: ['La release ne correspond plus au cluster', 'kubectl ne sait pas changer d’image', 'Helm supprime le Deployment', 'Les Pods s’arrêtent'], answer: 0, why: 'Une modification à la main n’est dans aucune révision. Le prochain `helm upgrade` peut l’annuler, et l’historique ne dit plus la vérité.' }
				]
			},
			{
				title: 'Lis l’historique ensuite',
				questions: [
					{ q: 'Après le rollback, tu lances `helm upgrade` avec le tag corrigé `2.4.1`. Quelle révision cet upgrade crée-t-il ?', options: ['5, à la place de la cassée', '6', '7', '1, un nouveau départ'], answer: 2, why: 'Le rollback a pris la 6, et chaque install, upgrade ou rollback ajoute 1. La révision cassée 5 n’est jamais réutilisée, donc le correctif est la 7.' },
					{ q: 'Que contient la révision 6 ?', options: ['Une copie de la révision 4', 'L’image cassée `2.4.0`', 'Rien : c’est un marqueur', 'Seulement les valeurs par défaut du chart'], answer: 0, why: 'La révision 6 réapplique le contenu de la révision 4.' },
					{ q: 'La révision 5, la cassée, est-elle encore dans l’historique ?', options: ['Non : le rollback la supprime', 'Non : elle est renommée en 4', 'Seulement si tu as passé `--keep`', 'Oui : les révisions 1 à 5 restent'], answer: 3, why: 'Le rollback ne réécrit jamais le passé. La révision cassée reste, et montre ce qui s’est passé.' },
					{ q: 'Pourquoi est-ce utile que le rollback soit une nouvelle révision ?', options: ['Ça libère de l’espace disque', 'L’historique montre chaque changement dans l’ordre, rollbacks compris', 'Ça accélère le prochain upgrade', 'Ça cache le plantage à l’équipe'], answer: 1, why: 'Tu lis l’histoire de la release de haut en bas : ce qui est parti, ce qui a cassé, vers quoi tu es revenu.' }
				]
			},
			{
				title: 'Prévisualise le prochain upgrade',
				questions: [
					{ q: 'Quelle commande affiche le YAML que Helm enverrait, sans toucher au cluster ?', options: ['`helm install --force`', '`helm get values shop`', '`helm template shop ./chart -f prod.yaml --set image.tag=2.4.1`', '`kubectl diff shop`'], answer: 2, why: '`helm template` rend les templates en local avec tes valeurs et affiche des manifestes simples.' },
					{ q: 'Pourquoi passer le même `-f prod.yaml` à `helm template` ?', options: ['Sans lui tu vois les valeurs par défaut du chart, pas ce que reçoit la prod', 'helm template refuse de tourner sans fichier', 'Il envoie le fichier au cluster', 'Il verrouille la release'], answer: 0, why: 'Les valeurs changent ce que produisent les templates. Prévisualise avec les valeurs que tu utiliseras vraiment.' },
					{ q: 'Ton chart a la ligne d’image de l’exemple. Ni `prod.yaml` ni `values.yaml` ne fixent `image.tag`, et tu retires le `--set`. Quel tag le template produit-il ?', options: ['`latest`', 'Un tag vide, donc un YAML invalide', 'La `version` du chart', 'L’`appVersion` du chart, dans `Chart.yaml`'], answer: 3, why: 'La ligne de l’image utilise `.Values.image.tag | default .Chart.AppVersion`. `version` numérote le paquet du chart, pas l’appli.' },
					{ q: 'Où va la vraie correction, pour que le prochain upgrade ne ramène pas le plantage ?', options: ['Une note dans l’historique de la release', 'Dans Git, dans le chart ou dans l’image', 'Un `kubectl patch` sur le Deployment', 'Nulle part : le rollback suffit'], answer: 1, why: 'Le rollback fait seulement gagner du temps. Le bug reste dans `2.4.0` tant que personne ne corrige le code ou le chart.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Dans Helm, qu’est-ce qu’une release ?',
			options: [
				'Un chart packagé envoyé dans un repository, avec son propre numéro de version',
				'Une installation d’un chart dans un cluster, avec son propre nom et son historique de révisions',
				'Un tag Git sur les sources du chart, posé quand sa version augmente',
				'Le fichier `values.yaml` d’un chart'
			],
			answer: 1,
			why: 'Le chart est le paquet que tu installes. Une release en est une installation dans un cluster, avec son propre nom. Installe le même chart deux fois et tu as deux releases.'
		},
		{
			q: 'Tu lances `helm install my-app ./chart -f a.yaml -f b.yaml --set replicas=5`. Les deux fichiers définissent `replicas`. Quelle valeur gagne ?',
			options: ['Celle de `a.yaml`', 'Celle de `b.yaml`', '`5`', 'Le défaut du chart dans `values.yaml`'],
			answer: 2,
			why: 'Les défauts du chart sont surchargés par les fichiers `-f` (le plus à droite gagne entre eux), et `--set` les surcharge tous.'
		},
		{
			q: 'La release `api` est en révision 3. Tu lances `helm rollback api 1`. Quel est maintenant le numéro de révision ?',
			options: ['1', '3', '4', '2'],
			answer: 2,
			why: 'Chaque install, upgrade ou rollback ajoute une révision. Le rollback est enregistré comme révision 4, avec le contenu de la révision 1.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Livrer un mauvais upgrade avec Helm, faire le rollback, lire l’historique, et prévisualiser le YAML avant le prochain upgrade.',
		steps: [
			'Démarre un cluster local avec `minikube start`, puis crée un chart : `mkdir -p ~/helm-lab && cd ~/helm-lab && helm create shop`.',
			'Installe-le et fais un premier upgrade : `helm install shop ./shop --set image.tag=1.27`, puis `helm upgrade shop ./shop --set image.tag=1.27 --set replicaCount=2`.',
			'Livre une release cassée : `helm upgrade shop ./shop --set image.tag=does-not-exist`. Attends quelques secondes, puis lance `kubectl get pods -l app.kubernetes.io/instance=shop` et `helm history shop`.',
			'Reviens à la dernière bonne révision : `helm rollback shop 2`, puis `helm history shop` et `kubectl get secrets -l owner=helm`.',
			'Prévisualise le prochain upgrade sans toucher au cluster : `helm template shop ./shop --set image.tag=1.27 | grep image:`. Nettoie avec `helm uninstall shop`.'
		],
		done: [
			'Après le mauvais upgrade, un nouveau Pod reste en `ErrImagePull` ou `ImagePullBackOff`, et `helm history shop` montre la révision 3 en `deployed`.',
			'Après le rollback, `helm history shop` montre une révision 4 avec la description `Rollback to 2`, et les révisions 1 à 3 sont toujours listées.',
			'`kubectl get secrets -l owner=helm` liste un Secret par révision, de `sh.helm.release.v1.shop.v1` à `v4`.',
			'`helm template` affiche `image: "nginx:1.27"` pour le Deployment (la ligne `busybox` est le Pod de test du chart), et ne change rien à `helm list`.'
		],
		solution: [
			'La révision 2 était la dernière bonne : elle fixait le tag `1.27` et 2 réplicas. `helm rollback shop 2` renvoie ses manifestes et l’enregistre comme révision 4.',
			'`helm upgrade` avec `--set` repart des valeurs par défaut du chart : c’est pour ça que chaque upgrade ci-dessus répète `image.tag=1.27`.',
			'La révision cassée reste dans l’historique, donc on voit ce qui est parti et vers quoi tu es revenu. La vraie correction va quand même dans Git.'
		]
	},
	recall: {
		q: 'Tu lances `helm upgrade` sur un chart avec des défauts dans `values.yaml`, deux fichiers `-f` et un `--set`. Quelle valeur gagne ?',
		a: '`--set` gagne sur tout. Entre les fichiers `-f`, le plus à droite gagne, et les défauts du chart dans `values.yaml` passent en dernier.'
	},
	sources: [
		{ title: 'Doc Helm, Introduction to Helm', url: 'https://helm.sh/docs/intro/introduction/' },
		{ title: 'Doc Helm, Using Helm', url: 'https://helm.sh/docs/intro/using_helm/' },
		{ title: 'Doc Helm, Values Files', url: 'https://helm.sh/docs/chart_template_guide/values_files/' },
		{ title: 'Doc Helm, helm rollback', url: 'https://helm.sh/docs/helm/helm_rollback/' },
		{ title: 'helm/examples, chart hello-world', url: `${HELM}/charts/hello-world` }
	]
};
