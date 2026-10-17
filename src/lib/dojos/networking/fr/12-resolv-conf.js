const K8S = 'https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e';
const KDNS = `${K8S}/pkg/kubelet/network/dns/dns.go`;
const ISSUE = 'https://github.com/kubernetes/kubernetes/issues/33554';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'resolv-conf',
	part: 'Noms et adresses',
	title: 'resolv.conf, search et ndots',
	minutes: 10,
	hook: [
		'Octobre 2016, issue Kubernetes #33554. Un opérateur de cluster écrit que le réglage DNS par défaut des Pods "results in something like 10+ dns queries per non-cluster domain attempted in our clusters" : plus de 10 requêtes par nom externe.',
		'Son exemple est une application hors du cluster, `application.internal.my.domain` : "That\'s 12 DNS queries (A and AAAA for each search domain) which ultimately fail since `application.internal.my.domain` doesn\'t exist within our cluster." Le Pod ne demande le nom tel quel qu’après ces 12 échecs.',
		'La cause tient en une ligne que kubelet écrit dans le `/etc/resolv.conf` de chaque Pod : `options ndots:5`. Je l’ai reproduit pendant cette session avec un conteneur Debian et le même fichier : un seul `getent ahosts api.github.com` a envoyé **4 requêtes, dont 3 revenues en `NXDOMAIN`**.'
	],
	terms: [
		{ term: 'Stub resolver', def: 'Le client DNS intégré à ton programme, celui de la glibc sur la plupart des Linux. Il lit `/etc/resolv.conf` et envoie ses requêtes au `nameserver` indiqué.' },
		{ term: 'Liste de recherche', def: 'La ligne `search` de `/etc/resolv.conf` : des domaines que le stub resolver ajoute au nom, un par un, jusqu’à ce que l’un d’eux existe.' },
		{ term: 'ndots', def: 'Une option de `/etc/resolv.conf`. Un nom qui a moins de points que `ndots` passe par la liste de recherche avant d’être essayé tel quel. La glibc vaut 1 par défaut, Kubernetes met 5.' },
		{ term: 'FQDN', def: 'Fully qualified domain name : un nom qui finit par un point, comme `api.github.com.`. Le stub resolver l’envoie tel quel, sans liste de recherche.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App dans le Pod : connexion à api.github.com"] --> stub["La glibc lit /etc/resolv.conf"]', 'stub --> rule{"2 points < ndots:5"}'],
				highlight: ['stub', 'rule'],
				note: 'Le `/etc/resolv.conf` du Pod contient `search default.svc.cluster.local svc.cluster.local cluster.local` et `options ndots:5`. `api.github.com` a 2 points, moins de 5 : la glibc essaie d’abord la liste de recherche.'
			},
			{
				add: ['rule -->|"requête 1"| dns["DNS du cluster"]', 'dns -->|"NXDOMAIN : api.github.com.default.svc.cluster.local"| stub'],
				highlight: ['dns'],
				note: 'La première requête ajoute le premier domaine de recherche. Ce nom n’existe pas, la réponse est `NXDOMAIN`. Dans mon essai, CoreDNS l’a journalisée sous la forme `"A IN api.github.com.default.svc.cluster.local."` et a répondu en 9 ms.'
			},
			{
				add: ['stub -->|"requêtes 2 et 3 : .svc.cluster.local, .cluster.local"| dns', 'dns -->|"NXDOMAIN, NXDOMAIN"| stub'],
				highlight: ['stub', 'dns'],
				note: 'La glibc passe au domaine suivant, puis au dernier. Les deux échouent. La page de manuel prévient que ce parcours "may be slow and will generate a lot of network traffic if the servers for the listed domains are not local".'
			},
			{
				add: ['stub -->|"requête 4 : api.github.com."| dns', 'dns -->|"NOERROR + enregistrement A"| app'],
				highlight: ['app'],
				note: 'La liste épuisée, la glibc envoie le nom tel quel et obtient l’adresse. Dans mon essai, les trois échecs ont ajouté 25 ms avant cette requête. Un programme qui demande aussi l’AAAA paie le même prix une seconde fois.'
			},
			{
				add: ['fqdn["L’app utilise api.github.com. (point final)"] -->|"1 requête"| dns'],
				highlight: ['fqdn'],
				note: 'Un point final rend le nom absolu. Le même conteneur, interrogé sur `api.github.com.`, a envoyé une seule requête, et CoreDNS n’a rien journalisé d’autre. Mettre `ndots:1` dans le `dnsConfig` du Pod a donné le même résultat pour ce nom.'
			}
		]
	},
	example: {
		title: 'pkg/kubelet/network/dns/dns.go : d’où viennent ndots:5 et la liste de recherche',
		repo: 'kubernetes/kubernetes',
		url: `${KDNS}#L43-L455`,
		lang: 'go',
		code: `var (
	// The default dns opt strings.
	defaultDNSOptions = []string{"ndots:5"}
)
…
func (c *Configurer) generateSearchesForDNSClusterFirst(hostSearch []string, pod *v1.Pod) []string {
	if c.ClusterDomain == "" {
		return hostSearch
	}

	nsSvcDomain := fmt.Sprintf("%s.svc.%s", pod.Namespace, c.ClusterDomain)
	svcDomain := fmt.Sprintf("svc.%s", c.ClusterDomain)
	clusterSearch := []string{nsSvcDomain, svcDomain, c.ClusterDomain}

	return omitDuplicates(append(clusterSearch, hostSearch...))
}
…
	switch dnsType {
	case podDNSNone:
		// DNSNone should use empty DNS settings as the base.
		dnsConfig = &runtimeapi.DNSConfig{}
	case podDNSCluster:
		if len(c.clusterDNS) != 0 {
			// For a pod with DNSClusterFirst policy, the cluster DNS server is
			// the only nameserver configured for the pod. The cluster DNS server
			// itself will forward queries to other nameservers that is configured
			// to use, in case the cluster DNS server cannot resolve the DNS query
			// itself.
			dnsConfig.Servers = []string{}
			for _, ip := range c.clusterDNS {
				dnsConfig.Servers = append(dnsConfig.Servers, ip.String())
			}
			dnsConfig.Searches = c.generateSearchesForDNSClusterFirst(dnsConfig.Searches, pod)
			dnsConfig.Options = defaultDNSOptions
			break
		}`,
		notes: [
			'La ligne 3 est le seul endroit où figure la valeur 5. La ligne 34 la recopie dans chaque Pod dont la politique DNS est `ClusterFirst`, la politique par défaut quand `dnsPolicy` est absent selon la doc.',
			'Les lignes 11 à 13 construisent les trois premiers domaines de recherche à partir du namespace du Pod et du domaine du cluster : `shop.svc.cluster.local`, `svc.cluster.local`, `cluster.local` pour un Pod dans `shop`.',
			'La ligne 15 ajoute ensuite les domaines de recherche du nœud. C’est ainsi que l’opérateur de [l’issue #33554](' + ISSUE + ') arrivait à 12 requêtes perdues : avec ceux du nœud, sa liste comptait 6 domaines.',
			'Lignes 19 à 21 : avec `dnsPolicy: None`, kubelet part d’une config vide et prend tout dans le `dnsConfig` du Pod. Avec les autres politiques, `dnsConfig.options` est fusionné par-dessus : `{ name: ndots, value: "2" }` remplace le 5.'
		]
	},
	tradeoff: {
		gain: [
			'Les noms courts marchent : dans le namespace `shop`, `redis` se résout en `redis.shop.svc.cluster.local` dès la première requête, et `redis.cache` en `redis.cache.svc.cluster.local` à la deuxième.',
			'Avec `ndots:5`, un nom qui a jusqu’à 4 points passe encore par la liste de recherche, comme le nom SRV `_http._tcp.my-svc.my-namespace.svc`.'
		],
		cost: [
			'Chaque nom externe de moins de 5 points coûte 3 requêtes perdues avant celle qui réussit. Dans mon essai, cela a ajouté 25 ms à la résolution de `api.github.com`.',
			'Les domaines de recherche hérités du nœud ajoutent des échecs à chaque nom : avec 6 domaines au total, l’opérateur de l’issue #33554 voyait 12 requêtes perdues.',
			'Baisser `ndots` pour un Pod envoie d’abord les noms courts comme `redis.cache` aux serveurs amont, en nom absolu, avant la liste de recherche.'
		]
	},
	task: {
		prompt: 'Un Pod du namespace `shop` a `search shop.svc.cluster.local svc.cluster.local cluster.local` et `options ndots:5`. Un Service `redis` existe dans le namespace `cache`. Pour chaque nom, liste dans l’ordre les requêtes A envoyées par la glibc jusqu’à la première réussite : `redis.cache`, `api.stripe.com`, `api.stripe.com.`. Écris ensuite le `dnsConfig` qui réduit `api.stripe.com` à une seule requête sans toucher au code.',
		hint: 'Compte les points, compare à 5, puis essaie chaque domaine de recherche dans l’ordre jusqu’à ce qu’un nom existe.',
		answer: [
			'`redis.cache` (1 point) : `redis.cache.shop.svc.cluster.local` (NXDOMAIN), puis `redis.cache.svc.cluster.local` (trouvé). 2 requêtes.',
			'`api.stripe.com` (2 points) : avec `.shop.svc.cluster.local`, `.svc.cluster.local` puis `.cluster.local`, trois NXDOMAIN, puis `api.stripe.com` tel quel. 4 requêtes, 8 si le programme demande aussi l’AAAA. `api.stripe.com.` finit par un point : 1 requête.',
			'`dnsConfig: { options: [ { name: ndots, value: "2" } ] }`. `api.stripe.com` a maintenant 2 points, le seuil de `ndots:2` : la glibc l’essaie d’abord tel quel. `redis.cache` n’a qu’un point et passe toujours par la liste.'
		]
	},
	quiz: [
		{
			q: 'Un Pod du namespace `default`, avec le `resolv.conf` par défaut de Kubernetes, cherche `www.example.org`. Quel est le premier nom que la glibc demande au DNS du cluster ?',
			options: ['`www.example.org`, le nom tel qu’écrit', '`www.example.org.default.svc.cluster.local`', '`www.example.org.cluster.local`, le domaine du cluster', '`www.example.org.svc.cluster.local`, tous les Services'],
			answer: 1,
			why: '`www.example.org` a 2 points, moins que `ndots:5` : la glibc ajoute d’abord les domaines de recherche, dans l’ordre de la ligne `search`. Le premier est `default.svc.cluster.local`.'
		},
		{
			q: 'Ton app appelle `api.github.com` des milliers de fois par minute depuis un Pod. Quel changement dans la config de l’app donne une seule requête par résolution ?',
			options: [
				'Ajouter `options attempts:1` pour que le résolveur s’arrête après un essai',
				'Écrire l’hôte `api.github.com.`, avec un point final',
				'Mettre `github.com` en premier sur la ligne `search`',
				'Ajouter `options rotate` pour répartir les requêtes entre les serveurs'
			],
			answer: 1,
			why: 'Le point final rend le nom pleinement qualifié : le stub resolver saute la liste de recherche. `attempts` règle les nouvelles tentatives après un timeout, et `rotate` choisit seulement le serveur qui reçoit chaque requête.'
		},
		{
			q: 'Dans l’issue #33554, pourquoi une résolution de `application.internal.my.domain` causait-elle 12 requêtes perdues ?',
			options: [
				'CoreDNS relançait 12 fois chaque requête en échec avant d’abandonner',
				'6 domaines de recherche, chacun essayé en A et en AAAA, avant le nom lui-même',
				'Le serveur amont répondait SERVFAIL, et la glibc réessayait 12 fois',
				'Le nom avait 12 labels, et chaque label était résolu à part'
			],
			answer: 1,
			why: 'Le nom a 3 points, moins de 5 : chaque domaine de recherche passe en premier. Kubelet avait ajouté les domaines du nœud après ceux du cluster, et le programme demandait A et AAAA pour chacun.'
		}
	],
	recall: {
		q: 'Avec le `ndots:5` par défaut de Kubernetes, combien de requêtes A la glibc envoie-t-elle pour résoudre `api.github.com`, et quel est le plus petit changement dans l’app pour n’en avoir qu’une ?',
		a: '4 : les trois domaines de recherche du cluster ajoutés tour à tour, tous en `NXDOMAIN`, puis le nom lui-même. Écrire `api.github.com.` avec un point final ramène à une requête.'
	},
	sources: [
		{ title: 'Issue Kubernetes #33554, ndots:5 et les requêtes en plus', url: ISSUE },
		{ title: 'Doc Kubernetes, DNS for Services and Pods', url: 'https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/' },
		{ title: 'resolv.conf(5), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man5/resolv.conf.5.html' },
		{ title: 'Source Kubernetes, pkg/kubelet/network/dns/dns.go', url: KDNS }
	]
};
