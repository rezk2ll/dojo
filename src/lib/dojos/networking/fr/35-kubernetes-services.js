const K8S = 'https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e/pkg/proxy/iptables/proxier.go';
const VIPS = 'https://kubernetes.io/docs/reference/networking/virtual-ips/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'kubernetes-services',
	part: 'Déboguer le réseau',
	title: 'Les Services Kubernetes et kube-proxy',
	minutes: 10,
	hook: [
		'Un Pod n’arrive pas à joindre le Service `web`. Tu ouvres un shell dedans et tu lances `ping 10.96.0.20`, la ClusterIP. Aucune réponse à l’echo : 100 % de perte. Tu commences à soupçonner le plugin réseau.',
		'Puis `curl http://10.96.0.20/` renvoie la page tout de suite. Le Service marchait depuis le début. Une ClusterIP est une adresse virtuelle : sur chaque nœud, kube-proxy écrit des règles qui réécrivent vers l’adresse d’un Pod les paquets TCP, UDP ou SCTP destinés au port du Service.',
		'Un echo ICMP ne correspond à aucune de ces règles : aucune ne l’envoie vers un Pod. La suite du chapitre suit une connexion à travers les règles que kube-proxy écrit dans son mode par défaut, iptables.'
	],
	terms: [
		{ term: 'ClusterIP', def: 'L’adresse IP virtuelle que Kubernetes donne à un Service, par exemple 10.96.0.20. Les règles kube-proxy de chaque nœud capturent le trafic vers cette adresse et ce port et le réécrivent vers un Pod.' },
		{ term: 'kube-proxy', def: 'L’agent présent sur chaque nœud qui surveille les Services et les EndpointSlices et écrit les règles iptables, nftables ou IPVS correspondantes.' },
		{ term: 'Endpoint', def: 'Un backend d’un Service, en général une adresse et un port de Pod comme 10.244.2.7:8080, listé dans une EndpointSlice.' },
		{ term: 'NodePort', def: 'Un port entre 30000 et 32767 par défaut, ouvert sur chaque nœud, qui mène au même Service.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['pod["Pod client 10.244.1.5"] -->|"SYN vers 10.96.0.20:80"| ks["nat PREROUTING et OUTPUT sautent vers KUBE-SERVICES"]'],
				highlight: ['pod', 'ks'],
				note: 'kube-proxy ajoute des sauts depuis les chaînes nat `PREROUTING` et `OUTPUT` vers sa propre chaîne `KUBE-SERVICES`. Les paquets qui entrent sur le nœud, et ceux qu’envoie un processus local, passent par cette chaîne.'
			},
			{
				add: ['ks -->|"-p tcp -d 10.96.0.20 --dport 80"| svc["chaîne KUBE-SVC de web:http"]'],
				highlight: ['svc'],
				note: '`KUBE-SERVICES` contient une règle par port de Service. Celle-ci vérifie le protocole TCP, la destination 10.96.0.20 et le port 80, puis saute vers la chaîne du Service `web`.'
			},
			{
				add: ['svc -->|"probabilité 0.3333333333"| e1["KUBE-SEP : DNAT 10.244.2.7:8080"]', 'svc -->|"probabilité 0.5"| e2["KUBE-SEP : DNAT 10.244.3.4:8080"]', 'svc -->|"dernière règle, toujours"| e3["KUBE-SEP : DNAT 10.244.1.9:8080"]'],
				highlight: ['e1', 'e2', 'e3'],
				note: 'Avec 3 endpoints, la première règle correspond avec une probabilité de 1/3. La deuxième voit les 2/3 restants et en prend la moitié. La dernière prend le reste. Chaque Pod reçoit 1/3 des nouvelles connexions.'
			},
			{
				add: ['e1 -->|"destination réécrite"| p1["Pod 10.244.2.7:8080"]'],
				highlight: ['p1'],
				note: 'La chaîne de l’endpoint réécrit la destination en 10.244.2.7:8080, et le paquet est routé vers ce Pod. La doc : les paquets partent vers le backend « without rewriting the client IP address » (l’IP du client est gardée). Conntrack envoie la suite de la connexion au même Pod.'
			},
			{
				add: ['icmp["ping 10.96.0.20 : echo ICMP"] -.->|"aucune règle pour ICMP"| none["pas de DNAT, pas de Pod, pas de réponse"]'],
				highlight: ['icmp', 'none'],
				note: 'La règle de capture de l’étape 2 nomme un protocole et un port. Un port de Service ne peut être que TCP, UDP ou SCTP : un echo ICMP ne correspond jamais. Rien ne l’envoie vers un Pod, et aucune réponse ne revient.'
			},
			{
				add: ['ext["client externe : IP du nœud, port 30080"] -->|"KUBE-NODEPORTS"| svc'],
				highlight: ['ext'],
				note: 'Un Service NodePort ouvre en plus le même port, ici 30080, sur chaque nœud. Une règle de `KUBE-NODEPORTS` saute vers la même chaîne `KUBE-SVC`. La doc prévient que sur ce chemin « the client IP address does get altered » (l’IP du client est modifiée).'
			}
		]
	},
	example: {
		title: 'kubernetes pkg/proxy/iptables/proxier.go : writeServiceToEndpointRules',
		repo: 'kubernetes/kubernetes',
		url: `${K8S}#L1430-L1474`,
		lang: 'go',
		code: `func (proxier *Proxier) writeServiceToEndpointRules(natRules proxyutil.LineBuffer, svcPortNameString string, svcInfo proxy.ServicePort, svcChain utiliptables.Chain, endpoints []proxy.Endpoint, args []string) {
	// First write session affinity rules, if applicable.
	if svcInfo.SessionAffinityType() == v1.ServiceAffinityClientIP {
		for _, ep := range endpoints {
			epInfo, ok := ep.(*endpointInfo)
			if !ok {
				continue
			}
			comment := fmt.Sprintf(\`"%s -> %s"\`, svcPortNameString, epInfo.String())

			args = append(args[:0],
				"-A", string(svcChain),
			)
			args = proxier.appendServiceCommentLocked(args, comment)
			args = append(args,
				"-m", "recent", "--name", string(epInfo.ChainName),
				"--rcheck", "--seconds", strconv.Itoa(svcInfo.StickyMaxAgeSeconds()), "--reap",
				"-j", string(epInfo.ChainName),
			)
			natRules.Write(args)
		}
	}

	// Now write loadbalancing rules.
	numEndpoints := len(endpoints)
	for i, ep := range endpoints {
		epInfo, ok := ep.(*endpointInfo)
		if !ok {
			continue
		}
		comment := fmt.Sprintf(\`"%s -> %s"\`, svcPortNameString, epInfo.String())

		args = append(args[:0], "-A", string(svcChain))
		args = proxier.appendServiceCommentLocked(args, comment)
		if i < (numEndpoints - 1) {
			// Each rule is a probabilistic match.
			args = append(args,
				"-m", "statistic",
				"--mode", "random",
				"--probability", proxier.probability(numEndpoints-i))
		}
		// The final (or only if n == 1) rule is a guaranteed match.
		natRules.Write(args, "-j", string(epInfo.ChainName))
	}
}`,
		notes: [
			'Les lignes 33 à 40 écrivent une règle par endpoint dans la chaîne du Service. La ligne 40 passe `numEndpoints - i`, et [`computeProbability`](' + K8S + '#L390-L392) formate `1.0/n` avec 10 décimales : `0.3333333333`, puis `0.5000000000` pour 3 endpoints.',
			'La ligne 35 saute la probabilité pour le dernier endpoint, et la ligne 43 écrit son saut sans condition. Une nouvelle connexion finit toujours dans une chaîne d’endpoint, et chacun des n Pods en reçoit 1/n.',
			'Chaque chaîne d’endpoint se termine par la réécriture des [lignes 1240 et 1241](' + K8S + '#L1240-L1241) : `-m protocol -p protocol -j DNAT --to-destination` vers l’IP et le port du Pod.',
			'Les lignes 3 à 22 gèrent `sessionAffinity: ClientIP`. Le match `recent` des lignes 16 et 17 renvoie un client vers l’endpoint qu’il a utilisé dans la fenêtre `StickyMaxAgeSeconds`, avant les règles aléatoires des lignes 33 à 43.',
			'La règle de capture qui saute ici se trouve [lignes 922 à 930](' + K8S + '#L922-L930) : `-m protocol -p protocol -d` la ClusterIP `--dport` le port. Sans protocole ni port, un paquet ICMP n’a rien à quoi correspondre.'
		]
	},
	tradeoff: {
		gain: [
			'Aucun processus proxy sur le chemin des données. Le noyau réécrit la destination, et pour le trafic vers une ClusterIP, le Pod voit la vraie IP du client.',
			'Chaque nœud porte les mêmes règles : un client joint le Service à la même ClusterIP depuis n’importe quel nœud.',
			'Un Service sans endpoint reçoit une règle `REJECT` : les clients échouent tout de suite avec « Connection refused » au lieu d’attendre un timeout.'
		],
		cost: [
			'kube-proxy choisit un Pod une fois par nouvelle connexion. Un client qui garde une connexion ouverte, comme gRPC au chapitre 32, reste sur un seul Pod.',
			'Un `ping` vers une ClusterIP ne répond jamais : il ne sert à rien pour tester un Service. Teste le port avec `curl` ou `nc`.',
			'Le trafic NodePort et load balancer peut perdre l’IP du client : la doc dit que l’adresse « does get altered » sur ce chemin.'
		]
	},
	task: {
		prompt: 'Un Service `prod/api` de port `http` a 4 Pods prêts. Dans `iptables-save -t nat`, sa chaîne `KUBE-SVC` a quatre règles, telles que le code ci-dessus les écrit : `--probability 0.2500000000 -j KUBE-SEP-A`, `--probability 0.3333333333 -j KUBE-SEP-B`, `--probability 0.5000000000 -j KUBE-SEP-C`, puis `-j KUBE-SEP-D`. Quelle part des nouvelles connexions arrive sur chaque Pod ? Ensuite, quelqu’un passe le Deployment à 0 réplique. Qu’affiche `curl http://<ClusterIP>/` ?',
		hint: 'Multiplie la probabilité d’atteindre une règle par la probabilité qu’elle corresponde. Pour la deuxième question, regarde la branche `!hasEndpoints` du proxier.',
		answer: [
			'A : 0,25. B : 0,75 x 1/3 = 0,25. C : 0,75 x 2/3 x 1/2 = 0,25. D reçoit les 0,25 restants. Chaque Pod reçoit un quart des nouvelles connexions.',
			'Sans endpoint, kube-proxy n’écrit aucune chaîne nat pour le Service. Il écrit une règle filter avec le commentaire `"prod/api:http has no endpoints"` et la cible `REJECT` ([lignes 888 à 897](https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e/pkg/proxy/iptables/proxier.go#L888-L897)).',
			'`REJECT` sans option envoie un ICMP port unreachable, que le noyau traduit en `ECONNREFUSED`. `curl` échoue aussitôt avec « Connection refused ». Cette erreur indique que le Service n’a plus de Pod.'
		]
	},
	quiz: [
		{
			q: 'Depuis un Pod, `ping 10.96.0.20` ne reçoit aucune réponse, mais `curl http://10.96.0.20/` marche. Pourquoi ?',
			options: [
				'Le plugin réseau jette par défaut tout l’ICMP entre Pods et Services',
				'Les règles kube-proxy ne visent que le protocole et le port du Service : l’ICMP n’atteint aucun Pod',
				'Les Pods du Service tournent sans root et ne peuvent donc pas répondre à un echo ICMP',
				'ping utilise UDP, et le Service ne définit qu’un port TCP'
			],
			answer: 1,
			why: 'La règle de capture vérifie `-p tcp -d 10.96.0.20 --dport 80`. Un port de Service ne peut être que TCP, UDP ou SCTP : un echo ICMP ne correspond à aucune règle et n’est jamais réécrit vers l’adresse d’un Pod.'
		},
		{
			q: 'Un Service a 2 endpoints. Quelles règles kube-proxy écrit-il dans sa chaîne `KUBE-SVC` ?',
			options: [
				'Une règle par endpoint, chacune avec la probabilité 0.5000000000',
				'Une seule règle qui envoie les paquets aux deux endpoints à tour de rôle',
				'Une règle de probabilité 0.5000000000 vers le premier, puis un saut sans condition vers le second',
				'Une règle de probabilité 1.0 par endpoint, et le noyau choisit la file la plus courte'
			],
			answer: 2,
			why: 'Chaque endpoint sauf le dernier reçoit `-m statistic --mode random --probability 1/(n-i)`. La dernière règle n’a pas de condition : une connexion qui a sauté la première règle atteint toujours la seconde.'
		},
		{
			q: 'Un client ouvre une connexion TCP vers une ClusterIP et y envoie 500 requêtes HTTP. Comment se répartissent-elles sur 3 Pods ?',
			options: [
				'Les 500 vont au même Pod, car les règles choisissent une fois par connexion',
				'Environ 167 par Pod, car chaque requête repasse par les règles',
				'À tour de rôle : requête 1 au Pod 1, requête 2 au Pod 2, et ainsi de suite',
				'Vers le Pod de plus faible latence, mesurée par kube-proxy'
			],
			answer: 0,
			why: 'Les règles nat s’appliquent au début de la connexion. Conntrack applique la même réécriture à tous les paquets suivants de cette connexion : toutes ses requêtes arrivent au même Pod.'
		}
	],
	recall: {
		q: 'Pourquoi une ClusterIP ne répond-elle pas au `ping`, et comment kube-proxy choisit-il entre 3 Pods ?',
		a: 'Les règles kube-proxy ne visent que le protocole du Service (TCP, UDP ou SCTP) et son port : l’ICMP n’est jamais réécrit vers un Pod. Pour 3 Pods, il écrit des règles de probabilité 0.3333333333, puis 0.5, puis une dernière sans condition : 1/3 des nouvelles connexions chacun.'
	},
	sources: [
		{ title: 'Doc Kubernetes, Virtual IPs and Service Proxies', url: VIPS },
		{ title: 'Doc Kubernetes, Service', url: 'https://kubernetes.io/docs/concepts/services-networking/service/' },
		{ title: 'Doc Kubernetes, Protocols for Services', url: 'https://kubernetes.io/docs/reference/networking/service-protocols/' },
		{ title: 'Code source de Kubernetes, pkg/proxy/iptables/proxier.go', url: K8S },
		{ title: 'iptables-extensions(8), match statistic et cible REJECT', url: 'https://man7.org/linux/man-pages/man8/iptables-extensions.8.html' }
	]
};
