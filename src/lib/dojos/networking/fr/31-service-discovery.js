const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/net';
const CONSUL_STATIC = 'https://developer.hashicorp.com/consul/docs/discover/service/static';
const CONSUL_CFG = 'https://developer.hashicorp.com/consul/docs/discover/dns/configure';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'service-discovery',
	part: 'Entre services',
	title: 'La découverte de services',
	minutes: 10,
	hook: [
		'`checkout` appelle `payments` sur trois adresses IP écrites dans son fichier de config. L’équipe ops remplace une VM : 10.0.2.15 disparaît, 10.0.2.31 arrive. Un appel sur trois reste bloqué jusqu’au timeout de connexion, et ça dure jusqu’à ce que quelqu’un modifie le fichier et redémarre `checkout`.',
		'Avec la découverte de services, chaque instance de `payments` inscrit son adresse et son port dans un registre, et `checkout` interroge ce registre au moment de l’appel. HashiCorp Consul tient un tel registre. Il répond aux requêtes DNS sur 127.0.0.1, port 8600, et retire de ses réponses toute instance qui échoue à son health check.',
		'Le choix de l’instance se fait à l’un de deux endroits. Soit l’appelant reçoit la liste et en choisit une, soit il envoie toutes ses requêtes à une adresse fixe et un proxy derrière cette adresse choisit l’instance.'
	],
	terms: [
		{ term: 'Registre de services', def: 'Une base des instances en marche : nom du service, adresse, port et santé. Consul et l’API server de Kubernetes en tiennent chacun un.' },
		{ term: 'Enregistrement SRV', def: 'Un enregistrement DNS de type 33 (RFC 2782), nommé `_service._proto.name`, dont la réponse porte une priorité, un poids, un port et un nom d’hôte cible.' },
		{ term: 'Découverte côté client', def: 'L’appelant lit la liste des instances dans le registre et choisit lui-même celle à laquelle il se connecte.' },
		{ term: 'Découverte côté serveur', def: 'L’appelant se connecte à une adresse fixe, et un load balancer ou un proxy derrière elle lit le registre et choisit l’instance.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['web1["web sur 10.0.2.15:8080"] -->|"inscription, check HTTP toutes les 10 s"| agent["agent Consul"]', 'web2["web sur 10.0.2.16:8080"] -->|"inscription, check HTTP toutes les 10 s"| agent', 'agent --> catalog[("catalogue Consul")]'],
				highlight: ['web1', 'web2', 'agent'],
				note: 'Chaque instance de `web` s’inscrit auprès de l’agent Consul local, avec un health check comme `GET /health` toutes les 10 secondes. La doc de Consul : un nouveau check reçoit « a critical status by default » (l’état critique par défaut). Une instance n’entre donc dans les réponses qu’après son premier check réussi.'
			},
			{
				add: ['client["checkout"] -->|"requête SRV web.service.consul"| dns["DNS Consul 127.0.0.1:8600"]', 'dns --> catalog'],
				highlight: ['client', 'dns'],
				note: '`checkout` envoie une requête DNS de type SRV pour `web.service.consul` sur le port 8600. Consul ne sert les SRV « only if the client specifically requests them », c’est-à-dire seulement si le client les demande. Une simple requête A renvoie les adresses sans le port.'
			},
			{
				add: ['dns -->|"SRV 1 1 8080 pour web1 et web2, TTL 0"| client', 'client -->|"connexion 10.0.2.16:8080"| web2'],
				highlight: ['client', 'web2'],
				note: 'La réponse liste les deux instances avec le port 8080 et un TTL de 0 : aucun résolveur ne la met en cache. Consul mélange l’ordre des enregistrements à chaque réponse. `checkout` choisit une cible et ouvre lui-même la connexion TCP : c’est la découverte côté client.'
			},
			{
				add: ['web1 -.->|"GET /health échoue : critical"| agent', 'dns -.->|"réponse suivante : web2 seul"| client'],
				highlight: ['web1', 'dns'],
				note: 'Le check de 10.0.2.15 échoue et passe en critical. La doc : « Services that fail their health check or that fail a node system check are omitted from the results. » La requête suivante ne renvoie que 10.0.2.16, et personne ne touche à un fichier de config.'
			},
			{
				add: ['k8s["checkout dans un Pod"] -->|"web.prod.svc.cluster.local : une ClusterIP"| vip["Service web, ClusterIP"]', 'vip -->|"le proxy choisit un Pod"| pods["Pods de web"]'],
				highlight: ['k8s', 'vip'],
				note: 'Dans Kubernetes, le nom `web.prod.svc.cluster.local` se résout en une seule ClusterIP. L’appelant se connecte toujours à cette adresse, et les règles de kube-proxy sur le nœud choisissent un Pod (chapitre 35). C’est la découverte côté serveur : l’appelant ne voit jamais la liste des Pods.'
			}
		]
	},
	example: {
		title: 'Go src/net/dnsclient.go : ordonner les SRV comme le dit la RFC 2782',
		repo: 'golang/go',
		url: `${GO}/dnsclient.go#L163-L214`,
		lang: 'go',
		code: `// An SRV represents a single DNS SRV record.
type SRV struct {
	Target   string
	Port     uint16
	Priority uint16
	Weight   uint16
}

// byPriorityWeight sorts SRV records by ascending priority and weight.
type byPriorityWeight []*SRV

// shuffleByWeight shuffles SRV records by weight using the algorithm
// described in RFC 2782.
func (addrs byPriorityWeight) shuffleByWeight() {
	sum := 0
	for _, addr := range addrs {
		sum += int(addr.Weight)
	}
	for sum > 0 && len(addrs) > 1 {
		s := 0
		n := randIntn(sum)
		for i := range addrs {
			s += int(addrs[i].Weight)
			if s > n {
				if i > 0 {
					addrs[0], addrs[i] = addrs[i], addrs[0]
				}
				break
			}
		}
		sum -= int(addrs[0].Weight)
		addrs = addrs[1:]
	}
}

// sort reorders SRV records as specified in RFC 2782.
func (addrs byPriorityWeight) sort() {
	slices.SortFunc(addrs, func(a, b *SRV) int {
		if r := cmp.Compare(a.Priority, b.Priority); r != 0 {
			return r
		}
		return cmp.Compare(a.Weight, b.Weight)
	})
	i := 0
	for j := 1; j < len(addrs); j++ {
		if addrs[i].Priority != addrs[j].Priority {
			addrs[i:j].shuffleByWeight()
			i = j
		}
	}
	addrs[i:].shuffleByWeight()
}`,
		notes: [
			'Les lignes 2 à 7 sont les quatre champs d’une réponse SRV dont le client se sert. `net.LookupSRV` les renvoie dans l’ordre que ce code construit ; son [commentaire](' + GO + '/lookup.go#L503-L506) dit « sorted by priority and randomized by weight within a priority ».',
			'Les lignes 38 à 43 trient par priorité, la plus basse d’abord, puis par poids. Les lignes 45 à 51 découpent la liste en groupes de même priorité et mélangent chaque groupe. La RFC : un client « MUST attempt to contact the target host with the lowest-numbered priority it can reach ».',
			'La ligne 21 tire `n` entre 0 et `sum - 1`. Les lignes 22 à 29 parcourent la somme cumulée des poids et placent en tête le premier enregistrement dont la somme cumulée dépasse `n`. Un poids de 60 sur un total de 100 gagne 60 tirages sur 100.',
			'La ligne 31 retire le gagnant de la somme et la ligne 32 relance le tirage sur le reste. Un enregistrement de poids 0 n’ajoute rien à `s` ligne 23 : il ne passe jamais le test de la ligne 24 tant que `sum > 0`, et finit en dernier dans son groupe.'
		]
	},
	tradeoff: {
		gain: [
			'Tout programme qui sait résoudre un nom peut utiliser Consul sans bibliothèque cliente : `dig @127.0.0.1 -p 8600 web.service.consul SRV` suffit.',
			'Une instance qui échoue à son health check sort des réponses DNS dès la requête suivante, sans modifier aucun fichier de config.',
			'En découverte côté client, l’appelant se connecte directement à l’instance, sans passer par un proxy.'
		],
		cost: [
			'Consul sert un TTL de 0 par défaut. Sa doc : cela « adds a latency hit for each lookup and can potentially exhaust the query throughput of a datacenter » (latence à chaque requête, et risque de saturer le débit du datacenter).',
			'Un résolveur qui garde en cache une réponse « not found » laisse le service en panne pendant toute sa durée de cache. Consul propose `soa.min_ttl` pour régler ce TTL négatif.',
			'Consul prévient que la taille d’une réponse DNS est limitée : avec « more than 500 instances, you may not be able to retrieve the complete list of instances ».',
			'Une simple requête A ne porte ni port ni poids. La RFC 2782 note aussi que « some programs only try the first address they get back » (certains programmes n’essaient que la première adresse).'
		]
	},
	task: {
		prompt: '`dig _api._tcp.example.com SRV +short` affiche quatre lignes : `10 60 8080 a.example.com.`, `10 20 8080 b.example.com.`, `10 20 8080 c.example.com.` et `20 0 8080 d.example.com.`. Un client les ordonne avec le code Go ci-dessus. Quelle part des premières tentatives va vers `a` ? Quand `d` reçoit-il du trafic ?',
		hint: 'Les deux premiers nombres sont la priorité et le poids. Groupe d’abord par priorité, puis additionne les poids du groupe.',
		answer: [
			'La priorité 10 contient `a`, `b` et `c`, avec des poids de 60 + 20 + 20 = 100. La ligne 21 tire `n` de 0 à 99.',
			'Triées par poids, les sommes cumulées valent 20 (`b`), 40 (`c`) et 100 (`a`). `a` gagne quand `n` vaut de 40 à 99 : 60 tirages sur 100, donc 60 % des premières tentatives. `b` et `c` en reçoivent 20 % chacun.',
			'`d` a la priorité 20, un nombre plus grand : il passe après tout le groupe de priorité 10. Un client n’atteint `d` qu’après avoir échoué à se connecter à `a`, `b` et `c`.'
		],
		steps: [
			{
				title: 'Lis les quatre champs',
				questions: [
					{ q: 'Dans `10 60 8080 a.example.com.`, que vaut `10` ?', options: ['Le poids', 'La priorité', 'Le TTL en secondes', 'Le type d’enregistrement'], answer: 1, why: 'Une réponse SRV contient une priorité, un poids, un port et une cible, dans cet ordre. Le premier nombre est la priorité.' },
					{ q: 'Sur la même ligne, que vaut `60` ?', options: ['La priorité', 'Le port du health check', 'Le poids', 'La part du trafic en pourcentage'], answer: 2, why: 'Le deuxième nombre est le poids. Il ne devient une part qu’une fois divisé par le poids total de son groupe de priorité.' },
					{ q: 'Que vaut `8080` ?', options: ['Le port auquel le client se connecte', 'Le port du serveur DNS', 'Le poids de l’enregistrement', 'Le TTL de la réponse'], answer: 0, why: 'Le troisième champ est le port. C’est justement ce qu’une simple requête A ne donne pas.' },
					{ q: 'Que désigne `a.example.com.` ?', options: ['Le nom que le client a demandé', 'La zone DNS qui contient l’enregistrement', 'Le nom du service avec son protocole', 'L’hôte cible auquel le client se connecte'], answer: 3, why: 'Le dernier champ est le nom de l’hôte cible. Le nom demandé était `_api._tcp.example.com`.' }
				]
			},
			{
				title: 'Groupe par priorité',
				questions: [
					{ q: 'Quels enregistrements partagent la priorité que le client essaie en premier ?', options: ['`a`, `b` et `c`', '`d` tout seul', '`a` et `d`', 'Les quatre'], answer: 0, why: 'Le client doit essayer la priorité de plus petit numéro qu’il peut joindre. `a`, `b` et `c` ont tous la priorité 10.' },
					{ q: 'Pourquoi `d` n’est-il pas en concurrence avec `a`, `b` et `c` ?', options: ['Son poids vaut 0, donc il est ignoré', 'Sa priorité 20 le place dans un groupe suivant', 'Il écoute sur un autre port', 'C’est la dernière ligne de la réponse'], answer: 1, why: 'Les lignes 38 à 43 trient d’abord par priorité. Le poids n’ordonne que les enregistrements d’un même groupe de priorité.' },
					{ q: 'Quel est le poids total du groupe de priorité 10 ?', options: ['60', '80', '120', '100'], answer: 3, why: '60 + 20 + 20 = 100. Le poids de `d` ne compte pas : il est dans un autre groupe.' },
					{ q: 'Avec ce total, dans quel intervalle la ligne 21 tire-t-elle `n` ?', options: ['De 1 à 100', 'De 0 à 60', 'De 0 à 99', 'De 0 à 100'], answer: 2, why: '`randIntn(sum)` renvoie un nombre de 0 à `sum - 1`, donc de 0 à 99 ici.' }
				]
			},
			{
				title: 'Calcule la part de `a`',
				questions: [
					{ q: 'Après le tri par poids, quelles sont les sommes cumulées du groupe de priorité 10 ?', options: ['20 (`b`), 40 (`c`), 100 (`a`)', '60 (`a`), 80 (`b`), 100 (`c`)', '20 (`b`), 20 (`c`), 60 (`a`)', '100 (`a`), 40 (`c`), 20 (`b`)'], answer: 0, why: 'Le tri place le plus petit poids en premier : `b` et `c` à 20, puis `a` à 60. En les additionnant, on obtient 20, 40 et 100.' },
					{ q: 'Pour quelles valeurs de `n` `a` gagne-t-il le premier tirage ?', options: ['De 0 à 59', 'De 40 à 99', 'De 60 à 99', 'De 40 à 100'], answer: 1, why: '`a` est choisi quand sa somme cumulée, 100, est la première à dépasser `n`. C’est le cas dès que `n` vaut 40 ou plus.' },
					{ q: 'Quelle part des premières tentatives va donc vers `a` ?', options: ['33 %, une sur trois', '50 %', '60 %', '75 %'], answer: 2, why: 'De 40 à 99, cela fait 60 valeurs sur 100. La part vaut le poids divisé par le poids total du groupe.' },
					{ q: 'Quelle part va vers `b` ?', options: ['40 %', '0 %, il passe après `a`', '33 %', '20 %'], answer: 3, why: '`b` gagne quand `n` vaut de 0 à 19 : 20 tirages sur 100. `c` reçoit les mêmes 20 %.' }
				]
			},
			{
				title: 'Place `d`',
				questions: [
					{ q: 'Où `d` finit-il dans la liste ordonnée ?', options: ['En premier, parce que son poids vaut 0', 'Après tout le groupe de priorité 10', 'À une place au hasard parmi les quatre', 'Entre `a` et `b`'], answer: 1, why: 'La priorité 20 est un nombre plus grand que 10 : tout le groupe 10 passe avant.' },
					{ q: 'Quand `d` reçoit-il du trafic ?', options: ['Seulement après un échec de connexion à `a`, `b` et `c`', 'Sur 0 % des premières tentatives, mais 25 % des relances', 'Chaque fois que le tirage renvoie 0', 'Seulement quand la réponse DNS est en cache'], answer: 0, why: 'La RFC dit qu’un client doit essayer la priorité de plus petit numéro qu’il peut joindre. `d` sert de secours quand ce groupe est injoignable.' },
					{ q: 'Le poids 0 de `d` change-t-il quelque chose ici ?', options: ['Oui : un poids 0 le retire de la réponse', 'Oui : un poids 0 en fait le premier choix', 'Non : la priorité gagne, et un poids 0 vaut 50 %', 'Non : `d` est seul dans son groupe, le poids n’ordonne rien'], answer: 3, why: 'Le poids n’ordonne que les enregistrements de même priorité. Avec un seul enregistrement dans le groupe, il n’y a rien à ordonner.' },
					{ q: 'Tu ajoutes `20 10 8080 e.example.com.`. Lequel de `d` et `e` passe en premier dans le groupe 20 ?', options: ['`d`, parce qu’il était avant dans la réponse', 'L’un ou l’autre, une fois sur deux', '`e`, parce qu’un poids 0 finit en dernier dans son groupe', '`d`, parce que le plus petit poids gagne'], answer: 2, why: 'Un enregistrement de poids 0 n’ajoute rien à la somme cumulée : il ne passe jamais le test de la ligne 24 tant que `sum > 0`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Une réponse SRV contient `10 50 443 a.example.com.`, `10 50 443 b.example.com.` et `5 0 443 c.example.com.`. Quel hôte un client RFC 2782 essaie-t-il en premier ?',
			options: [
				'`a` ou `b`, une fois sur deux chacun, parce qu’ils ont le poids le plus fort',
				'`c`, parce que 5 est la priorité la plus basse et que la priorité passe avant le poids',
				'`a`, parce que c’est le premier enregistrement de la section réponse',
				'N’importe lequel des trois au hasard, parce que le client mélange toute la réponse'
			],
			answer: 1,
			why: 'Le client doit essayer la priorité de plus petit numéro qu’il peut joindre. Le poids n’ordonne que les enregistrements de même priorité : les poids de `a` et `b` ne comptent que si `c` est injoignable.'
		},
		{
			q: 'Le check HTTP d’une instance `web` passe en critical dans Consul. Que renvoie le `dig @127.0.0.1 -p 8600 web.service.consul SRV` suivant ?',
			options: [
				'Toutes les instances, avec celle en panne déplacée en fin de réponse',
				'Une réponse vide jusqu’à ce qu’on désinscrive l’instance à la main',
				'Toutes les instances, avec un poids 0 sur celle en panne pour l’éviter',
				'Seulement les instances dont le check passe ; celle en panne est retirée'
			],
			answer: 3,
			why: 'Consul retire de ses résultats DNS les services qui échouent à leur health check. Les clients qui refont la requête ne voient plus l’instance cassée, sans aucun changement de poids ni d’inscription.'
		},
		{
			q: 'Dans Kubernetes, `checkout` se connecte à `web.prod.svc.cluster.local`, qui se résout en une ClusterIP. Qui choisit le Pod qui traite la requête ?',
			options: [
				'`checkout`, qui lit la liste des IP de Pods dans CoreDNS',
				'CoreDNS, qui renvoie une IP de Pod différente à chaque requête',
				'Les règles de kube-proxy sur le nœud de l’appelant',
				'Le Pod `web` d’IP la plus basse, qui relaie vers les autres'
			],
			answer: 2,
			why: 'Le nom d’un Service normal se résout uniquement en sa cluster IP. L’appelant se connecte à cette adresse unique, et les règles de proxy du nœud choisissent un Pod : c’est la découverte côté serveur.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Inscrire deux instances dans un Consul local, les relire en enregistrements SRV, et voir un health check en échec en retirer une.',
		steps: [
			'Lance un agent Consul en mode dev : `docker run -d --name consul-lab -p 8500:8500 -p 8600:8600/udp hashicorp/consul:1.20 agent -dev -client=0.0.0.0`.',
			'Inscris deux instances de `web` avec un check TTL : `curl -X PUT localhost:8500/v1/agent/service/register -d \'{"ID":"web1","Name":"web","Address":"10.0.2.15","Port":8080,"Check":{"TTL":"10m"}}\'`, puis la même chose avec `"ID":"web2"` et `"Address":"10.0.2.16"`.',
			'Interroge tout de suite : `dig @127.0.0.1 -p 8600 web.service.consul SRV +short`. Note ce qui revient.',
			'Déclare les deux checks comme passants : `curl -X PUT localhost:8500/v1/agent/check/pass/service:web1`, puis la même chose pour `service:web2`. Relance le `dig`, puis une fois de plus sans `SRV`.',
			'Fais échouer le premier : `curl -X PUT localhost:8500/v1/agent/check/fail/service:web1`, et relance le `dig` SRV. Nettoie avec `docker rm -f consul-lab`.'
		],
		done: [
			'Avant qu’un check passe, le `dig` SRV n’affiche rien.',
			'Une fois les deux passants, il affiche deux lignes de la forme `1 1 8080 <cible>`.',
			'Le `dig` simple sans `SRV` affiche `10.0.2.15` et `10.0.2.16`, sans port.',
			'Après l’échec, le `dig` SRV n’affiche plus qu’une ligne.'
		],
		solution: [
			'La première réponse vide est le comportement par défaut de Consul : un nouveau check démarre en critical, donc une instance n’entre dans les réponses qu’après son premier check passant.',
			'`dig @127.0.0.1 -p 8600 web.service.consul SRV` sans `+short` montre la colonne TTL à `0` : aucun résolveur ne garde la réponse en cache.',
			'Les cibles SRV ressemblent à `0a00020f.addr.dc1.consul.` : c’est 10.0.2.15 en hexadécimal. Le port 8080 n’est que dans la réponse SRV, pas dans la réponse A.',
			'Personne n’a modifié de fichier de config quand `web1` a échoué. La requête suivante l’a simplement laissé de côté.'
		]
	},
	recall: {
		q: 'Dans la réponse SRV `10 60 8080 a.example.com.`, que sont 10 et 60, et quels enregistrements un client essaie-t-il en premier ?',
		a: '10 est la priorité et 60 le poids. Le client essaie d’abord la priorité au plus petit numéro. Dans une même priorité, il choisit selon le poids : 60 sur un total de 100 donne 60 % des premiers choix.'
	},
	sources: [
		{ title: 'RFC 2782, A DNS RR for specifying the location of services (DNS SRV)', url: 'https://www.rfc-editor.org/rfc/rfc2782' },
		{ title: 'Doc Consul, Perform static DNS queries', url: CONSUL_STATIC },
		{ title: 'Doc Consul, Configure Consul DNS behavior', url: CONSUL_CFG },
		{ title: 'Doc Consul, Define health checks', url: 'https://developer.hashicorp.com/consul/docs/register/health-check/vm' },
		{ title: 'Doc Kubernetes, DNS for Services and Pods', url: 'https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/' },
		{ title: 'Code source de Go, src/net/dnsclient.go', url: `${GO}/dnsclient.go` }
	]
};
