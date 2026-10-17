const ING = 'https://github.com/kubernetes/ingress-nginx/blob/dbb11b92ddb77bee9c35e462479129354c84f939';
const K8S = 'https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'network-policy',
	part: 'En production',
	title: 'Les network policies',
	minutes: 10,
	hook: [
		'Le 24 mars 2025, Wiz Research publie IngressNightmare : quatre failles d’exécution de code à distance dans le contrôleur ingress-nginx. La pire, CVE-2025-1974, est notée 9.8. Le blog Kubernetes : elle « allows anything on the Pod network » à injecter de la configuration via le webhook d’admission de validation du contrôleur.',
		'Wiz décrit ce webhook comme « an unauthenticated HTTP endpoint » dans le Pod du contrôleur. Par défaut, le contrôleur peut lire tous les Secrets du cluster. Wiz a compté plus de 6 500 clusters qui exposaient ce webhook sur Internet.',
		'Le correctif : ingress-nginx 1.12.1 ou 1.11.5. Une des parades de Wiz : « Enforce strict network policies so only the Kubernetes API Server can access the admission controller. » Une **NetworkPolicy** liste les Pods, namespaces et plages d’IP qui ont le droit d’ouvrir une connexion vers un Pod.'
	],
	terms: [
		{ term: 'NetworkPolicy', def: 'Un objet Kubernetes rattaché à un namespace, qui sélectionne des Pods par label et liste les connexions autorisées vers eux (`ingress`) et depuis eux (`egress`).' },
		{ term: 'Pod isolé', def: 'Un Pod sélectionné par au moins une policy pour une direction. Dans cette direction, seules passent les connexions qu’une policy autorise. Un Pod qu’aucune policy ne sélectionne accepte tout.' },
		{ term: 'Default deny', def: 'Une policy avec un `podSelector` vide et aucune règle. Elle sélectionne tous les Pods du namespace et n’autorise rien, et les autres policies n’ouvrent ensuite que ce que tu listes.' },
		{ term: 'Plugin réseau', def: 'Le composant CNI qui applique les policies. La doc : une NetworkPolicy « without a controller that implements it will have no effect ».' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['atk["N’importe quel Pod du réseau des Pods"] -->|"HTTPS vers le port 8443"| wh["Webhook d’admission ingress-nginx"]', 'wh --> sec["Le contrôleur peut lire tous les Secrets du cluster"]'],
				highlight: ['atk', 'wh'],
				note: 'Le chemin de l’attaque. Sans policy dans le namespace, le Pod du contrôleur est « non-isolated for ingress », et « all inbound connections are allowed ». N’importe quel Pod compromis peut envoyer une requête d’admission piégée sur le port 8443.'
			},
			{
				add: ['deny["default-deny-all : podSelector vide, policyTypes Ingress et Egress"] -.->|"isole tous les Pods du namespace"| wh'],
				highlight: ['deny'],
				note: 'Première étape de la défense. La policy `default-deny-all` de la doc sélectionne tous les Pods et ne liste aucune règle : aucune connexion n’entre ni ne sort. Les policies s’additionnent, donc les suivantes ne peuvent qu’ouvrir des chemins.'
			},
			{
				add: ['api["kube-apiserver"] -->|"admission review"| allow["Autorise : ipBlock de l’API server, TCP 8443"]', 'allow --> wh'],
				highlight: ['api', 'allow'],
				note: 'Autoriser par source. Le webhook n’a besoin que des appels de l’API server, donc la règle nomme les adresses de l’API server avec un `ipBlock`. Une règle avec `from` n’autorise le trafic « only if the traffic matches at least one item in the from list ».'
			},
			{
				add: ['eg["Egress autorisé : Pods kube-system avec k8s-app=kube-dns, port 53"] -.->|"le DNS répond toujours"| wh'],
				highlight: ['eg'],
				note: 'Les règles d’egress. La doc prévient qu’un default deny en egress « also blocks DNS traffic ». Les Pods DNS du cluster portent `k8s-app=kube-dns` dans `kube-system`, et le service écoute sur 53/UDP et 53/TCP.'
			},
			{
				add: ['cni["Plugin réseau sans support des NetworkPolicy"] -.->|"objets acceptés, rien n’est appliqué"| deny'],
				highlight: ['cni'],
				note: 'Le piège. La doc : « Creating a NetworkPolicy resource without a controller that implements it will have no effect. » L’objet est créé, et toutes les connexions passent toujours.'
			}
		]
	},
	example: {
		title: 'charts/ingress-nginx/templates/controller-networkpolicy.yaml : la policy livrée par le chart',
		repo: 'kubernetes/ingress-nginx',
		url: `${ING}/charts/ingress-nginx/templates/controller-networkpolicy.yaml#L1-L45`,
		lang: 'yaml',
		code: `{{- if .Values.controller.networkPolicy.enabled }}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  labels:
    {{- include "ingress-nginx.labels" . | nindent 4 }}
    app.kubernetes.io/component: controller
    {{- with .Values.controller.labels }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
  name: {{ include "ingress-nginx.controller.fullname" . }}
  namespace: {{ include "ingress-nginx.namespace" . }}
spec:
  podSelector:
    matchLabels:
      {{- include "ingress-nginx.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: controller
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - ports:
      {{- range $key, $value := .Values.controller.containerPort }}
        - protocol: TCP
          port: {{ $value }}
      {{- end }}
      {{- if .Values.controller.metrics.enabled }}
        - protocol: TCP
          port: {{ .Values.controller.metrics.port }}
      {{- end }}
      {{- if .Values.controller.admissionWebhooks.enabled }}
        - protocol: TCP
          port: {{ .Values.controller.admissionWebhooks.port }}
      {{- end }}
      {{- range $key, $value := .Values.tcp }}
        - protocol: TCP
          port: {{ $key }}
      {{- end }}
      {{- range $key, $value := .Values.udp }}
        - protocol: UDP
          port: {{ $key }}
      {{- end }}
  egress:
    - {}
{{- end }}`,
		notes: [
			'La ligne 1 ne génère la policy que si `controller.networkPolicy.enabled` vaut true. Le `values.yaml` du chart le met à `false` : une installation par défaut ne livre aucune policy.',
			'Les lignes 14 à 20 sélectionnent les Pods du contrôleur et les isolent dans les deux directions. À partir de là, seules les règles qui suivent laissent passer du trafic.',
			'Les lignes 21 à 34 contiennent une seule règle d’ingress, avec `ports` et sans `from` : les ports 80 et 443, plus 8443 quand le webhook est actif. Les types de l’API disent qu’un `from` vide « matches all sources » : n’importe quel Pod atteint encore 8443.',
			'Les lignes 43 et 44 contiennent `egress: - {}`, une règle vide. Elle couvre toutes les destinations et tous les ports, donc tout le trafic sortant passe.'
		]
	},
	tradeoff: {
		gain: [
			'Avec un default deny en place, un nouveau Pod du namespace ne reçoit rien tant qu’aucune policy ne le nomme. Les Pods ajoutés plus tard démarrent fermés.',
			'Une règle d’autorisation avec une liste `from` ferme un port à toutes les autres sources. Le webhook sur 8443 ne répond alors qu’à la plage de l’API server.'
		],
		cost: [
			'La doc dit qu’il « is not defined » si la réécriture de l’IP source a lieu avant ou après le traitement des policies. Un `ipBlock` pour l’API server peut marcher ou rater selon le plugin et le cloud.',
			'La liste de la doc sur ce que les policies ne savent pas faire comprend tout ce qui touche à TLS, le ciblage d’un Service par son nom et la journalisation des connexions bloquées.',
			'Un Pod ne peut pas bloquer le trafic de son propre nœud. La doc : le trafic « to and from the node where a Pod is running is always allowed ».'
		]
	},
	task: {
		prompt: 'Le namespace `shop` contient un Deployment `web` (label `app=web`, port 8080) et un StatefulSet `db` (label `app=db`, port 5432). Seul le contrôleur ingress du namespace `ingress-nginx` doit atteindre `web`, et seul `web` doit atteindre `db`. Écris les policies, et vérifie que `web` résout toujours `db.shop.svc`.',
		hint: 'Commence par un default deny dans les deux directions. Une connexion entre deux Pods demande une autorisation d’egress d’un côté et d’ingress de l’autre.',
		answer: [
			'Policy 1, `default-deny-all` : `podSelector: {}`, `policyTypes: [Ingress, Egress]`, aucune règle.',
			'Policy 2 sur `app=web` : ingress `from` un `namespaceSelector` avec `kubernetes.io/metadata.name: ingress-nginx`, TCP 8080. Egress `to` un `podSelector` `app=db`, TCP 5432.',
			'Policy 3 sur `app=db` : ingress `from` un `podSelector` `app=web`, TCP 5432. Sans elle, l’egress autorisé sur `web` ne suffit pas : la doc exige « both the egress policy on the source pod and the ingress policy on the destination pod ».',
			'Policy 4 sur `podSelector: {}` : egress `to` une entrée qui porte à la fois `namespaceSelector` `kubernetes.io/metadata.name: kube-system` et `podSelector` `k8s-app: kube-dns`, en UDP 53 et TCP 53. Sans elle, le default deny « also blocks DNS traffic ».'
		]
	},
	quiz: [
		{
			q: 'Le namespace `shop` contient une seule policy : elle sélectionne `app=db` et autorise l’ingress depuis `app=web`. Un Pod `app=batch` tourne dans le même namespace. Qui peut s’y connecter ?',
			options: [
				'Seulement les Pods `app=web`, car le namespace a une policy',
				'Personne, car une policy dans un namespace isole tous ses Pods',
				'Seulement les Pods de `shop`, car les policies isolent chaque namespace',
				'Tout le monde, car aucune policy ne sélectionne `app=batch`'
			],
			answer: 3,
			why: 'Chaque Pod est isolé ou non pour son propre compte. Un Pod n’est isolé en ingress que « if there is any NetworkPolicy that both selects the pod » et liste Ingress. Aucune policy ne sélectionne `app=batch`, donc toutes les connexions entrantes passent.'
		},
		{
			q: 'Une règle d’ingress a une seule entrée `from` qui porte à la fois `namespaceSelector: {user: alice}` et `podSelector: {role: client}`. Qu’autorise-t-elle ?',
			options: [
				'Les Pods `role=client` situés dans les namespaces `user=alice`',
				'Tout Pod des namespaces `user=alice`, ou les Pods `role=client` partout',
				'Tout Pod des namespaces `user=alice`, ou les Pods `role=client` locaux',
				'Rien, car une entrée ne peut pas porter deux sélecteurs à la fois'
			],
			answer: 0,
			why: 'Une entrée avec les deux sélecteurs « selects particular Pods within particular namespaces ». Séparés en deux éléments de liste, les mêmes sélecteurs veulent dire les Pods `role=client` du namespace local ou tout Pod d’un namespace `user=alice`.'
		},
		{
			q: 'Tu appliques une policy `default-deny-all` et `kubectl apply` réussit, mais les Pods du namespace se parlent toujours. Quelle est la cause probable ?',
			options: [
				'Les policies ne visent que les Pods créés après elles, jamais les anciens',
				'Le default deny a besoin d’une policy allow-all associée pour s’activer',
				'Le plugin réseau du cluster n’applique pas les objets NetworkPolicy',
				'La policy exige d’abord un `kubectl rollout restart` de chaque Deployment'
			],
			answer: 2,
			why: 'La doc : créer une NetworkPolicy « without a controller that implements it will have no effect ». L’application vient d’un plugin réseau qui la prend en charge.'
		}
	],
	recall: {
		q: 'Que contient une policy default deny dans les deux directions, et que casse-t-elle qu’il faut réautoriser ?',
		a: '`podSelector: {}` et `policyTypes: [Ingress, Egress]`, sans règle. Elle bloque aussi le DNS : ajoute une règle d’egress vers les Pods `k8s-app=kube-dns` de `kube-system` sur le port 53.'
	},
	sources: [
		{ title: 'Wiz Research, IngressNightmare: 9.8 critical unauthenticated RCE vulnerabilities in Ingress NGINX (24 mars 2025)', url: 'https://www.wiz.io/blog/ingress-nginx-kubernetes-vulnerabilities' },
		{ title: 'Blog Kubernetes, Ingress-nginx CVE-2025-1974: What You Need to Know', url: 'https://kubernetes.io/blog/2025/03/24/ingress-nginx-cve-2025-1974/' },
		{ title: 'Issue Kubernetes 131009, CVE-2025-1974: ingress-nginx admission controller RCE escalation', url: 'https://github.com/kubernetes/kubernetes/issues/131009' },
		{ title: 'Doc Kubernetes, Network Policies', url: 'https://kubernetes.io/docs/concepts/services-networking/network-policies/' },
		{ title: 'Source Kubernetes, NetworkPolicyIngressRule dans networking/v1 types.go', url: `${K8S}/staging/src/k8s.io/api/networking/v1/types.go#L111-L131` },
		{ title: 'Chart ingress-nginx, controller.networkPolicy dans values.yaml', url: `${ING}/charts/ingress-nginx/values.yaml#L118-L121` },
		{ title: 'Doc Kubernetes, Debugging DNS Resolution', url: 'https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/' }
	]
};
