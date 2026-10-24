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
		],
		steps: [
			{
				title: 'Lis la chaîne',
				questions: [
					{ q: 'Dans quel ordre une nouvelle connexion rencontre-t-elle les quatre règles ?', options: ['Les quatre en même temps, et le noyau en choisit une', 'De haut en bas, jusqu’à ce qu’une corresponde', 'De D jusqu’à A', 'Dans un ordre au hasard à chaque fois'], answer: 1, why: 'Les règles d’une chaîne s’évaluent de haut en bas. La première qui correspond saute vers sa chaîne d’endpoint.' },
					{ q: 'Que veut dire `--probability 0.2500000000` sur la première règle ?', options: ['A reçoit 25 % de la bande passante', '25 % des paquets d’une connexion vont vers A', 'La règle attrape un quart des connexions qui l’atteignent', 'A a un poids de 25 sur 100'], answer: 2, why: 'Le match `statistic` en mode `random` correspond avec cette probabilité. Seules les connexions qui atteignent la règle sont testées.' },
					{ q: 'Pourquoi la règle de D n’a-t-elle pas de probabilité ?', options: ['C’est la dernière règle : elle correspond toujours', 'D est le Pod le plus chargé', 'kube-proxy a oublié de l’écrire', 'D ne reçoit aucun trafic'], answer: 0, why: 'La ligne 35 saute la probabilité sur le dernier endpoint : une connexion qui a sauté les autres atterrit toujours là.' },
					{ q: 'Quand ces règles s’appliquent-elles pour un client ?', options: ['À chaque requête HTTP', 'À chaque paquet, indépendamment', 'Une fois par minute, à la synchro de kube-proxy', 'Une fois, au début d’une nouvelle connexion'], answer: 3, why: 'Les règles nat choisissent au début de la connexion. Conntrack envoie la suite au même Pod.' }
				]
			},
			{
				title: 'Calcule A et B',
				questions: [
					{ q: 'Quelle part des nouvelles connexions va vers A ?', options: ['0,25', '0,33', '0,5', '1,0'], answer: 0, why: 'Chaque nouvelle connexion atteint la première règle, qui correspond avec la probabilité 0,25.' },
					{ q: 'Quelle part des connexions atteint la règle de B ?', options: ['0,25', '0,5', '0,75', '1,0'], answer: 2, why: 'Celles que A n’a pas prises : 1 - 0,25 = 0,75.' },
					{ q: 'Quelle part va donc vers B ?', options: ['0,33', '0,25', '0,75', '0,5'], answer: 1, why: '0,75 × 1/3 = 0,25. La règle attrape un tiers des trois quarts qui l’atteignent.' },
					{ q: 'Quelle part atteint la règle de C ?', options: ['0,25', '0,33', '0,75', '0,5'], answer: 3, why: '0,75 ont atteint B et 0,25 sont parties vers B : il reste 0,5.' }
				]
			},
			{
				title: 'Calcule C et D',
				questions: [
					{ q: 'Quelle part va vers C ?', options: ['0,5', '0,25', '0,125', '0,33'], answer: 1, why: '0,75 × 2/3 × 1/2 = 0,25 : la moitié de la moitié qui atteint C.' },
					{ q: 'Quelle part va vers D ?', options: ['0,25', '0', '0,5', '0,125'], answer: 0, why: 'D prend toutes les connexions restantes après C : les 0,25 qui restent.' },
					{ q: 'D’où viennent les nombres 0,25, 0,333 et 0,5 ?', options: ['De la charge CPU de chaque Pod', 'De l’âge de chaque Pod', 'De `1.0/n` pour n = 4, 3, puis 2 endpoints restants', 'De poids fixés dans la spec du Service'], answer: 2, why: 'La ligne 40 passe `numEndpoints - i`, et `computeProbability` formate `1.0/n`. Chaque règle partage à parts égales entre les endpoints qui restent.' },
					{ q: 'Avec 5 Pods prêts, quelle probabilité reçoit la première règle ?', options: ['0,25', '0,5', '0,1', '0,2'], answer: 3, why: '`1.0/5` vaut 0,2. Le schéma donne toujours à chacun des n Pods 1/n des nouvelles connexions.' }
				]
			},
			{
				title: 'Passe à 0',
				questions: [
					{ q: 'Sans endpoint, qu’écrit kube-proxy pour `prod/api:http` ?', options: ['Une chaîne `KUBE-SVC` sans règle', 'Une règle filter de cible `REJECT` avec le commentaire « has no endpoints »', 'Rien du tout', 'Une règle DNAT vers l’IP du nœud'], answer: 1, why: 'La branche `!hasEndpoints` n’écrit aucune chaîne nat et ajoute une règle `REJECT` dans la table filter.' },
					{ q: 'Que renvoie `REJECT` sans option ?', options: ['Un ICMP port unreachable', 'Un RST TCP', 'Rien', 'Une réponse HTTP 503'], answer: 0, why: 'Sans `--reject-with`, le `REJECT` d’iptables répond par un ICMP port unreachable.' },
					{ q: 'Qu’affiche `curl http://<ClusterIP>/` ?', options: ['Un timeout au bout de deux minutes environ', 'Une réponse vide du serveur', 'Une page 503 de kube-proxy', '« Connection refused », aussitôt'], answer: 3, why: 'Le noyau traduit l’ICMP port unreachable en `ECONNREFUSED` : `connect()` échoue tout de suite.' },
					{ q: 'Que te dit cette erreur de vérifier d’abord ?', options: ['Le plugin CNI', 'Le pare-feu du nœud', 'Si le Service a encore des Pods prêts', 'Le DNS du nom du Service'], answer: 2, why: 'kube-proxy rejette exprès quand un Service n’a plus d’endpoint. Une connexion refusée vers une ClusterIP pointe là en premier.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Lire les règles que kube-proxy écrit pour un Service, voir pourquoi `ping` échoue alors que `curl` marche, et voir le `REJECT` d’un Service sans Pod.',
		steps: [
			'Lance un cluster local : `minikube start -p svc-lab`.',
			'Crée un Service à 3 Pods : `kubectl create deployment web --image=nginx:1.27 --replicas=3 && kubectl expose deployment web --port=80`. Lance un client : `kubectl run client --image=nicolaka/netshoot:v0.13 -- sleep 3600`. Attends les deux : `kubectl rollout status deployment web && kubectl wait --for=condition=Ready pod/client`.',
			'Lis la ClusterIP avec `kubectl get svc web`. Puis `kubectl exec client -- ping -c 3 -W 1 <ClusterIP>` et `kubectl exec client -- curl -s -o /dev/null -w \'%{http_code}\\n\' http://web/`.',
			'Lis les règles nat du nœud : `minikube -p svc-lab ssh -- sudo iptables-save -t nat | grep default/web`.',
			'Passe à zéro avec `kubectl scale deployment web --replicas=0`, puis relance le `curl` et `minikube -p svc-lab ssh -- sudo iptables-save -t filter | grep "has no endpoints"`. Nettoie avec `minikube delete -p svc-lab`.'
		],
		done: [
			'`ping` vers la ClusterIP annonce `100% packet loss`, et `curl` affiche `200`.',
			'Le dump nat montre une règle `KUBE-SERVICES` pour la ClusterIP et le port 80, et trois règles de la chaîne `KUBE-SVC` de `default/web` qui sautent vers une chaîne `KUBE-SEP`.',
			'Deux de ces trois sauts portent `-m statistic --mode random --probability`, et la dernière n’en a pas.',
			'Après le passage à zéro, `curl` échoue aussitôt (code de sortie 7), et le dump filter montre une règle `REJECT` pour `default/web`.'
		],
		solution: [
			'La règle `KUBE-SERVICES` vérifie `-p tcp`, la ClusterIP et `--dport 80`. L’ICMP n’a pas de port : `ping` ne correspond à rien et personne ne répond.',
			'Les deux probabilités valent environ 1/3 et 1/2 : chacun des 3 Pods reçoit un tiers des nouvelles connexions.',
			'L’échec immédiat, c’est le `REJECT` : un ICMP port unreachable que le noyau traduit en « Connection refused ». Une ClusterIP qui refuse, c’est « vérifie les endpoints » avant « vérifie le réseau ».'
		]
	},
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
