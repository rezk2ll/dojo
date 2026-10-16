const HELM = 'https://github.com/helm/examples/blob/4888ba8fb8180dd0c36d1e84c1fcafc6efd81532';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'helm',
	part: 'Kubernetes',
	title: 'Helm : un gestionnaire de paquets pour Kubernetes',
	minutes: 10,
	hook: [
		'Ton appli a maintenant un Deployment, un Service, un Ingress, une ConfigMap et un PVC. Cinq fichiers YAML. La préprod veut 1 réplica, la prod en veut 3, et le tag de l’image change à chaque release.',
		'Tu pourrais copier les fichiers par environnement et les éditer avec `sed`. Tu sais déjà comment ça finit : trois copies qui divergent, et personne ne se souvient laquelle est la bonne.',
		'**Helm** fait pour Kubernetes ce que `apt` fait pour Debian. Un **chart** est le paquet : des templates plus des valeurs par défaut. Tu l’installes avec tes propres valeurs, et Helm suit chaque installation comme une **release** avec des révisions numérotées sur lesquelles tu peux faire un rollback.'
	],
	terms: [
		{ term: 'Chart', def: 'Un paquet Helm : un `Chart.yaml`, un `values.yaml` avec les valeurs par défaut, et un dossier `templates/` de YAML Kubernetes à trous.' },
		{ term: 'Values', def: 'Les réglages injectés dans les templates. Les défauts viennent de `values.yaml`, les surcharges de `-f file.yaml` ou `--set key=value`.' },
		{ term: 'Template', def: 'Un manifeste Kubernetes avec des placeholders Go template comme `{{ .Values.replicaCount }}`, remplis par Helm.' },
		{ term: 'Release', def: 'Une installation d’un chart dans un cluster, avec son propre nom. Installe le même chart deux fois, tu as deux releases.' },
		{ term: 'Révision', def: 'Une version numérotée d’une release. Chaque install, upgrade ou rollback ajoute 1. La première est toujours 1.' },
		{ term: 'Repository', def: 'Un endroit où les charts sont publiés et partagés, comme un dépôt apt.' }
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
				note: 'Un **chart** est un dossier. Les templates portent la forme de tes manifestes. `values.yaml` porte les défauts qui le font marcher tel quel.'
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
				note: 'Les valeurs fusionnent dans l’ordre : défauts du chart, puis tes fichiers `-f` (le plus à droite gagne), puis `--set` (qui gagne sur tout). Même chart, valeurs différentes par environnement. Aucun YAML copié.'
			},
			{
				add: [
					'api["API server Kubernetes"]',
					'helm -->|"manifestes rendus"| api'
				],
				highlight: ['api'],
				note: 'Helm rend les templates en YAML simple et l’envoie à l’**API server**. À partir de là, Kubernetes ne sait pas et ne se soucie pas que Helm est passé par là : les contrôleurs font leur travail habituel.'
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
				note: 'La révision 3 est cassée ? `helm rollback my-app 2` réapplique la révision 2. Ça n’efface pas l’historique : le rollback lui-même devient la **révision 4**.'
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
			'C’est le chart d’exemple officiel du projet Helm. Un Deployment comme celui du chapitre 32, avec des **trous** là où vont les valeurs.',
			'`{{ .Values.replicaCount }}` vient de [values.yaml](https://github.com/helm/examples/blob/4888ba8fb8180dd0c36d1e84c1fcafc6efd81532/charts/hello-world/values.yaml#L5-L11), où il vaut `1`. `--set replicaCount=3` le change sans toucher au chart.',
			'Le tag de l’image vaut par défaut `.Chart.AppVersion`, la version de l’appli dans [Chart.yaml](https://github.com/helm/examples/blob/4888ba8fb8180dd0c36d1e84c1fcafc6efd81532/charts/hello-world/Chart.yaml#L15-L24) (`1.16.0`). Ce n’est pas la `version` du chart lui-même (`0.1.0`) : l’une versionne le paquet, l’autre l’appli qu’il contient.',
			'Les labels du selector viennent d’un [helper](https://github.com/helm/examples/blob/4888ba8fb8180dd0c36d1e84c1fcafc6efd81532/charts/hello-world/templates/_helpers.tpl#L45-L51) qui inclut `.Release.Name`. Installe le chart deux fois en deux releases, et leurs Services ne sélectionnent jamais les Pods de l’autre.'
		]
	},
	tradeoff: {
		gain: [
			'Un chart, plusieurs environnements : seules les valeurs changent, donc préprod et prod ne peuvent pas diverger dans leur forme.',
			'Les releases ont un historique. `helm rollback` te ramène à une révision connue et saine en une commande.',
			'Des charts tout prêts pour les bases de données, la supervision et les ingress controllers, listés sur [Artifact Hub](https://artifacthub.io), installés avec tes propres valeurs.'
		],
		cost: [
			'Les templates dans du YAML sont durs à lire et faciles à casser : une mauvaise indentation dans `nindent` et ton YAML est invalide.',
			'Un chart tiers, c’est du code que tu fais tourner avec des droits sur le cluster. Lis ses templates et ses valeurs avant de l’installer.',
			'Helm ne connaît que ce qu’il a rendu. Si quelqu’un modifie un objet à la main avec `kubectl`, la release ne correspond plus au cluster.'
		]
	},
	task: {
		prompt: 'La release `shop` est en révision 5 après `helm upgrade shop ./chart -f prod.yaml --set image.tag=2.4.0`. La nouvelle version plante. Reviens au dernier état qui marchait, puis explique à quoi ressemble l’historique de la release ensuite, et comment tu verrais le YAML que Helm envoie **avant** le prochain upgrade.',
		hint: 'Le rollback prend un numéro de révision, et il est lui-même enregistré. Une commande Helm rend les templates en local sans toucher au cluster.',
		answer: [
			'`helm history shop` pour trouver la dernière bonne révision, disons 4. Puis `helm rollback shop 4` (sans numéro, Helm revient à la révision précédente).',
			'L’historique montre maintenant une révision **6**, copie de la révision 4. Les révisions 1 à 5 sont toujours là.',
			'Avant le prochain upgrade, `helm template shop ./chart -f prod.yaml --set image.tag=2.4.1` affiche les manifestes rendus, pour que tu puisses les lire ou les comparer d’abord.',
			'Ensuite corrige la cause, pas seulement le symptôme : le chart ou l’image, dans Git, pour que le prochain upgrade ne ramène pas le bug.'
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
			why: 'Un chart est le paquet. Une release en est une instance qui tourne dans un cluster. Installe le même chart deux fois et tu as deux releases.'
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
	takeaway: 'Un chart, ce sont des templates plus des valeurs par défaut. Tu l’installes comme une release avec tes propres valeurs, et chaque changement est une révision numérotée sur laquelle tu peux faire un rollback.',
	sources: [
		{ title: 'Doc Helm, Introduction to Helm', url: 'https://helm.sh/docs/intro/introduction/' },
		{ title: 'Doc Helm, Using Helm', url: 'https://helm.sh/docs/intro/using_helm/' },
		{ title: 'Doc Helm, Values Files', url: 'https://helm.sh/docs/chart_template_guide/values_files/' },
		{ title: 'Doc Helm, helm rollback', url: 'https://helm.sh/docs/helm/helm_rollback/' },
		{ title: 'helm/examples, chart hello-world', url: `${HELM}/charts/hello-world` }
	]
};
