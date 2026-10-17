const CHARTS = 'https://github.com/bitnami/charts/blob/bb5e98a6e3c5ca196420d2414769b681c9284101/bitnami/redis';
const DOCS = 'https://kubernetes.io/docs/concepts/services-networking/network-policies/';
const SRC = 'https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0/content/en/docs/concepts/services-networking/network-policies.md';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'network-policies',
	part: 'Déboguer le réseau',
	title: 'La NetworkPolicy de Kubernetes',
	minutes: 10,
	hook: [
		'Tu colles la policy `default-deny-egress` de la doc Kubernetes dans le namespace `shop`. Juste après, plus aucun pod de ce namespace n’arrive à résoudre `payments`. La doc le signale dans un encadré : "A default deny-all egress policy also blocks DNS traffic." (elle bloque aussi le DNS).',
		'Chaque requête DNS attend une réponse qui n’arrive jamais. Avec les valeurs par défaut de glibc décrites dans resolv.conf(5), le résolveur attend 5 secondes et envoie la requête 2 fois avant de renvoyer une erreur.',
		'Sur un deuxième cluster, tu appliques la même policy et rien ne bouge. Ce cluster tourne avec flannel seul, et **l’API server enregistre une NetworkPolicy même si personne ne l’applique.**'
	],
	terms: [
		{ term: 'Isolated pod', def: 'Un pod sélectionné par au moins une NetworkPolicy pour une direction (ingress ou egress). Dans cette direction, il n’accepte que les connexions qu’une policy autorise.' },
		{ term: 'policyTypes', def: 'La liste `Ingress`, `Egress` ou les deux dans une policy. Elle indique quelles directions la policy isole pour les pods qu’elle sélectionne.' },
		{ term: 'podSelector', def: 'Un sélecteur de labels. Dans `spec`, il choisit les pods visés par la policy, et `{}` les prend tous dans le namespace. Dans une entrée `from` ou `to`, il choisit les pairs autorisés.' },
		{ term: 'Network plugin', def: 'Le plugin CNI qui câble le réseau des pods, comme Calico ou Cilium. Il surveille les objets NetworkPolicy et les applique sur chaque nœud.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['web["Pod app=web"] -->|"TCP 6379"| db["Pod role=db"]', 'web -->|"UDP 53"| dns["CoreDNS k8s-app=kube-dns"]'],
				highlight: ['web', 'db', 'dns'],
				note: 'Aucune policy dans `shop`. La doc : "By default, a pod is non-isolated for egress; all outbound connections are allowed." C’est pareil en ingress. `web` joint `db` sur 6379 et CoreDNS sur 53.'
			},
			{
				add: ['deny["default-deny-all : podSelector {}, policyTypes Ingress et Egress"] -.-> web', 'deny -.-> db'],
				highlight: ['deny'],
				note: 'La policy `default-deny-all` prend tous les pods avec `podSelector: {}` et liste les deux directions, sans aucune règle. Tous les pods de `shop` sont isolés dans les deux sens. La connexion vers `db` et la requête DNS vers CoreDNS sont jetées.'
			},
			{
				add: ['dnsok["allow-dns : egress vers kube-system, k8s-app=kube-dns, port 53"] -.-> web'],
				highlight: ['dnsok', 'dns'],
				note: 'Une deuxième policy ajoute une règle d’egress : UDP et TCP 53 vers les pods `k8s-app: kube-dns` du namespace dont `kubernetes.io/metadata.name` vaut `kube-system`. Les policies s’additionnent : la doc parle de "the union of what the applicable policies allow". L’ordre ne compte pas.'
			},
			{
				add: ['out["web : egress vers role=db sur 6379"] -.-> web', 'in["db : ingress depuis app=web sur 6379"] -.-> db'],
				highlight: ['out', 'in'],
				note: 'Pour que `web` joigne `db`, les deux bouts doivent l’autoriser. La doc : "both the egress policy on the source pod and the ingress policy on the destination pod need to allow the connection." Une policy ouvre l’egress de `web`, une autre l’ingress de `db`. Les réponses d’une connexion autorisée sont "implicitly allowed" (autorisées d’office).'
			},
			{
				add: ['cni["Network plugin sur chaque nœud : Calico, Cilium"] -->|"applique les policies"| web', 'cni -->|"applique les policies"| db'],
				highlight: ['cni'],
				note: 'L’API server ne fait que stocker ces objets. Le network plugin les surveille et les applique sur chaque nœud. "Creating a NetworkPolicy resource without a controller that implements it will have no effect." Le README de flannel précise que `flanneld` "does not natively enforce Network Policies".'
			}
		]
	},
	example: {
		title: 'bitnami/redis/templates/networkpolicy.yaml : la policy que pose le chart Redis',
		repo: 'bitnami/charts',
		url: `${CHARTS}/templates/networkpolicy.yaml#L16-L57`,
		lang: 'yaml',
		code: `spec:
  podSelector:
    matchLabels: {{- include "common.labels.matchLabels" ( dict "customLabels" .Values.commonLabels "context" $ ) | nindent 6 }}
  policyTypes:
    - Ingress
    - Egress
  {{- if .Values.networkPolicy.allowExternalEgress }}
  egress:
    - {}
  {{- else }}
  egress:
    {{- if eq .Values.architecture "replication" }}
    # Allow dns resolution
    - ports:
        - port: 53
          protocol: UDP
    # Allow outbound connections to other cluster pods
    - ports:
        - port: {{ .Values.master.containerPorts.redis }}
        {{- if .Values.sentinel.enabled }}
        - port: {{ .Values.sentinel.containerPorts.sentinel }}
        {{- end }}
      to:
        - podSelector:
            matchLabels: {{- include "common.labels.matchLabels" ( dict "customLabels" .Values.commonLabels "context" $ ) | nindent 14 }}
    {{- end }}
    {{- if .Values.networkPolicy.extraEgress }}
    {{- include "common.tplvalues.render" ( dict "value" .Values.networkPolicy.extraEgress "context" $ ) | nindent 4 }}
    {{- end }}
  {{- end }}
  ingress:
    # Allow inbound connections
    - ports:
        - port: {{ .Values.master.containerPorts.redis }}
        {{- if .Values.sentinel.enabled }}
        - port: {{ .Values.sentinel.containerPorts.sentinel }}
        {{- end }}
      {{- if not .Values.networkPolicy.allowExternal }}
      from:
        - podSelector:
            matchLabels:
              {{ template "common.names.fullname" . }}-client: "true"`,
		notes: [
			'Les lignes 2 à 6 sélectionnent les pods Redis du chart et listent les deux directions : ces pods sont isolés en ingress et en egress. Dans le `values.yaml` du chart, `networkPolicy.enabled` vaut `true` par défaut.',
			'Lignes 7 à 9 : `allowExternalEgress` vaut `true` par défaut, ce qui produit `egress: - {}`. Une règle vide accepte toutes les destinations, comme l’exemple `allow-all-egress` de la doc. L’egress reste ouvert.',
			'Les lignes 10 à 30 ne sont rendues que si tu mets `allowExternalEgress: false`. Avec `architecture: replication`, la valeur par défaut, les lignes 14 à 16 ouvrent le port 53 en UDP seulement. La RFC 7766 dit qu’un client qui reçoit une réponse UDP tronquée doit "retry over TCP instead", et cette policy jette ce nouvel essai.',
			'Les lignes 38 à 42 n’ajoutent la liste `from` que si `allowExternal` vaut `false`, et le défaut est `true`. Par défaut, la règle des lignes 33 et 34 a des ports et pas de `from` : n’importe quel pod de n’importe quel namespace joint le port 6379. Avec `false`, la ligne 42 exige le label `<fullname>-client: "true"`.'
		]
	},
	tradeoff: {
		gain: [
			'Après une policy deny-all, un pod de `shop` ne peut ouvrir que les connexions listées par une policy. Le trafic avec son propre nœud reste autorisé.',
			'Les policies choisissent les pods par label : un nouveau réplica `app=web` reçoit les mêmes règles dès son démarrage, sans IP à mettre à jour.',
			'Une policy ne fait qu’ajouter des connexions permises, donc leur ordre ne change jamais le résultat.'
		],
		cost: [
			'Sans règle d’egress pour le port 53, chaque résolution DNS finit en timeout, après 2 essais de 5 secondes avec les défauts de glibc.',
			'L’API n’a ni règle de refus ni journal des connexions bloquées. La doc range les deux dans "What you can\'t do with network policies".',
			'Avec un network plugin qui ignore les policies, comme flannel seul, chaque objet s’applique sans erreur et ne filtre rien.',
			'Une policy deny-all ne garantit le blocage que de TCP, UDP et SCTP. Pour ICMP, la doc dit "the behaviour is undefined" : `ping` peut passer alors que `curl` est bloqué.'
		]
	},
	task: {
		prompt: 'Le namespace `shop` a déjà `default-deny-all`. Les pods `app=web` doivent appeler les pods `app=api` en TCP 8080 et résoudre les noms via CoreDNS (pods `k8s-app: kube-dns` dans `kube-system`). Écris le plus petit ensemble d’objets NetworkPolicy qui fait marcher ça, et dis quel pod chacun sélectionne.',
		hint: 'Compte les pods qui ont besoin d’une ouverture, et dans quelle direction. Le DNS, c’est de l’egress côté client, sur deux protocoles.',
		answer: [
			'`allow-dns` : `podSelector: {}`, `policyTypes: [Egress]`, une règle d’egress `to: [{ namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: kube-system } }, podSelector: { matchLabels: { k8s-app: kube-dns } } }]` avec les ports UDP 53 et TCP 53. Les deux sélecteurs sont dans la même entrée `to`, donc les deux doivent correspondre.',
			'`web-to-api` : `podSelector: { matchLabels: { app: web } }`, `policyTypes: [Egress]`, egress `to: [{ podSelector: { matchLabels: { app: api } } }]`, port TCP 8080.',
			'`api-from-web` : `podSelector: { matchLabels: { app: api } }`, `policyTypes: [Ingress]`, ingress `from: [{ podSelector: { matchLabels: { app: web } } }]`, port TCP 8080.',
			'Trois objets. La connexion demande l’egress sur `web` et l’ingress sur `api`, parce que deny-all a isolé les deux pods dans les deux sens. Les réponses n’ont besoin d’aucune règle.'
		]
	},
	quiz: [
		{
			q: 'Une règle d’ingress a un `from:` avec deux éléments, `- namespaceSelector: {user: alice}` et `- podSelector: {role: client}`. Quels pods peuvent se connecter ?',
			options: [
				'Les pods `role=client` qui tournent dans un namespace labellisé `user=alice`',
				'Tout pod d’un namespace `user=alice`, ou les pods `role=client` de ce namespace',
				'Seulement les pods `role=client`, et seulement si ce namespace porte `user=alice`',
				'Aucun, car une règle ne peut pas mélanger sélecteur de namespace et de pod'
			],
			answer: 1,
			why: 'Chaque élément de `from` est un pair distinct, et la règle accepte n’importe lequel. Mettre les deux sélecteurs dans un seul élément exigerait que les deux correspondent. La doc montre les deux formes YAML côte à côte pour cette raison.'
		},
		{
			q: 'Après `default-deny-all`, tu ajoutes l’egress de `web` vers `api` sur 8080 et l’ingress de `api` depuis `web`. `curl http://api:8080` échoue avec "Could not resolve host". Pourquoi ?',
			options: [
				'Le Service `api` a besoin de sa propre policy, à part des pods `api`',
				'La règle d’egress doit lister la ClusterIP de `api`, pas un podSelector',
				'L’egress de `web` vers CoreDNS sur le port 53 reste bloqué par deny-all',
				'L’ingress de `api` doit aussi autoriser UDP, car curl commence en UDP'
			],
			answer: 2,
			why: 'Le nom `api` est d’abord résolu par une requête vers CoreDNS sur le port 53. Deny-all a isolé `web` en egress, et aucune policy n’autorise cette requête. La doc : "A default deny-all egress policy also blocks DNS traffic."'
		},
		{
			q: '`kubectl get networkpolicy` affiche ta policy deny-all, et pourtant chaque pod joint encore tous les autres. Quelle est la cause la plus probable ?',
			options: [
				'Il faut redémarrer la policy avec `kubectl rollout restart`',
				'Les policies ne visent que les pods créés après un reboot du nœud',
				'kube-proxy doit être reconfiguré pour lire les objets NetworkPolicy',
				'Le network plugin du cluster n’applique pas les NetworkPolicy'
			],
			answer: 3,
			why: 'L’API server stocke l’objet, et seul le network plugin le traduit en filtrage sur les nœuds. Un plugin comme flannel, utilisé seul, n’applique pas les policies, donc l’objet n’a aucun effet.'
		}
	],
	recall: {
		q: 'Qu’accepte un pod dans un namespace sans NetworkPolicy, et qu’est-ce qui doit autoriser une connexion du pod A vers le pod B une fois les deux isolés ?',
		a: 'Sans policy, toutes les connexions entrantes et sortantes passent. Une fois isolés, une règle d’egress sur A et une règle d’ingress sur B doivent l’autoriser, et le network plugin (Calico, Cilium) doit les appliquer.'
	},
	sources: [
		{ title: 'Doc Kubernetes, Network Policies, lue le 2026-10-17', url: DOCS },
		{ title: 'kubernetes/website, network-policies.md au commit lu', url: SRC },
		{ title: 'bitnami/charts, networkpolicy.yaml de redis', url: `${CHARTS}/templates/networkpolicy.yaml` },
		{ title: 'bitnami/charts, values.yaml de redis', url: `${CHARTS}/values.yaml#L1631-L1643` },
		{ title: 'README de flannel, Network Policy', url: 'https://github.com/flannel-io/flannel/blob/0f70536f15f281279dab39fb9d575c646c7eea34/README.md#L23-L30' },
		{ title: 'resolv.conf(5), man7.org', url: 'https://man7.org/linux/man-pages/man5/resolv.conf.5.html' },
		{ title: 'RFC 7766, DNS Transport over TCP', url: 'https://www.rfc-editor.org/rfc/rfc7766' }
	]
};
