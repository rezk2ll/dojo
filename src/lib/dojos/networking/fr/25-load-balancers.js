const KUBEADM = 'https://github.com/kubernetes/kubeadm/blob/5bc6d39ca9ad65a5dc549dc388c80894044cf9af/docs/ha-considerations.md';
const HADOC = 'https://github.com/haproxy/haproxy/blob/a383051731cfa80f0196bdecc4c6a2ab7c1ea234/doc/configuration.txt';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'load-balancers',
	part: 'Entre services',
	title: 'Répartition de charge en couche 4 et en couche 7',
	minutes: 10,
	hook: [
		'Tu ajoutes un deuxième serveur derrière HAProxy, avec `balance roundrobin`. Un client envoie 100 requêtes sur une seule connexion keep-alive. En `mode tcp`, HAProxy 3.0.30 en a envoyé 100 à `web1` et aucune à `web2`. Mesuré pour ce chapitre avec deux petits serveurs Node.',
		'Même client, mêmes serveurs, en `mode http` : 50 requêtes pour `web1`, 50 pour `web2`. Avec une nouvelle connexion par requête, le `mode tcp` partage aussi 50/50.',
		'Le manuel de HAProxy : « In layer 4 mode, HAProxy simply forwards bidirectional traffic between two sides. In layer 7 mode, HAProxy analyzes the protocol ». En `mode tcp`, il choisit un serveur une fois par connexion. En `mode http`, il lit chaque requête et choisit un serveur pour chacune.'
	],
	terms: [
		{ term: 'Répartiteur de couche 4', def: 'Un répartiteur qui ne voit que TCP : IP et port source et destination. Il choisit un serveur à l’ouverture de la connexion, puis copie les octets. HAProxy en `mode tcp`.' },
		{ term: 'Répartiteur de couche 7', def: 'Un répartiteur qui lit HTTP : méthode, chemin, en-têtes, cookies. Il peut choisir un serveur par requête. HAProxy en `mode http`.' },
		{ term: 'Persistance', def: 'Envoyer un même client vers le même serveur à chaque fois, aussi appelé sticky sessions. Dans HAProxy, par un cookie en `mode http` ou par `balance source` en `mode tcp`.' },
		{ term: 'Terminaison TLS', def: 'Le répartiteur déchiffre TLS lui-même. Un répartiteur de couche 7 doit le faire pour lire des requêtes HTTPS ; un répartiteur de couche 4 peut faire passer les octets chiffrés tels quels.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cl["Client, une connexion keep-alive"] -->|"connexion TCP :8401"| l4["HAProxy mode tcp"]', 'l4 -->|"roundrobin : choisit web1 une fois"| w1["web1"]'],
				highlight: ['l4', 'w1'],
				note: 'À l’ouverture de la connexion, HAProxy ne connaît que des adresses et des ports. `roundrobin` attribue cette connexion à `web1`. La connexion suivante, quel que soit le client, ira à `web2`.'
			},
			{
				add: ['cl -->|"requêtes 2 à 100, même connexion"| l4', 'l4 -.->|"aucun nouveau choix"| w1'],
				highlight: ['cl'],
				note: 'HAProxy copie les octets sans chercher où finit une requête. Les 100 requêtes de la connexion arrivent sur `web1`. Dans le test, `web2` n’en a reçu aucune.'
			},
			{
				add: ['cl -->|"GET /a, GET /b sur une connexion"| l7["HAProxy mode http"]'],
				highlight: ['l7'],
				note: 'En `mode http`, HAProxy analyse chaque requête : méthode, chemin, en-têtes, cookies. Le manuel dit que la requête « will be analyzed in depth before connecting to any server ». En HTTPS, il doit terminer TLS pour ça.'
			},
			{
				add: ['l7 -->|"GET /a"| x1["web1"]', 'l7 -->|"GET /b"| x2["web2"]'],
				highlight: ['x1', 'x2'],
				note: '`balance` tourne pour chaque requête, donc les requêtes d’une même connexion client alternent entre les serveurs. Dans le test, une seule connexion keep-alive a donné 50 requêtes à chacun.'
			},
			{
				add: ['x1 -.->|"Set-Cookie: SRV=web1"| cl', 'cl -.->|"Cookie: SRV=web1"| l7'],
				highlight: ['cl'],
				note: 'Avec `cookie SRV insert indirect nocache` et `server web1 ... cookie web1`, HAProxy ajoute un cookie à la première réponse. Les requêtes suivantes qui portent `SRV=web1` vont à `web1`. Le manuel : l’algorithme « only applies when no persistence information is available ».'
			}
		]
	},
	example: {
		title: 'kubeadm docs/ha-considerations.md : HAProxy devant les serveurs d’API Kubernetes',
		repo: 'kubernetes/kubeadm',
		url: `${KUBEADM}#L136-L156`,
		lang: 'bash',
		code: `frontend apiserver
    bind *:\${APISERVER_DEST_PORT}
    mode tcp
    option tcplog
    default_backend apiserverbackend

#---------------------------------------------------------------------
# round robin balancing for apiserver
#---------------------------------------------------------------------
backend apiserverbackend
    option httpchk

    http-check connect ssl
    http-check send meth GET uri /healthz
    http-check expect status 200

    mode tcp
    balance     roundrobin

    server \${HOST1_ID} \${HOST1_ADDRESS}:\${APISERVER_SRC_PORT} check verify none
    # [...]`,
		notes: [
			'Les lignes 3 et 17 mettent `mode tcp` des deux côtés. HAProxy ne déchiffre jamais le trafic : la session TLS va de `kubectl` au serveur d’API, et HAProxy ne voit que des adresses et des ports. Le manuel dit que le mode tcp « should be used for SSL, SSH, SMTP ».',
			'La ligne 18 choisit un serveur d’API par connexion avec `roundrobin`. Une commande `kubectl` qui ouvre une seule connexion parle à un seul serveur d’API du début à la fin.',
			'Les lignes 11 à 15 ajoutent un health check en couche 7 alors que le trafic reste en couche 4. HAProxy ouvre sa propre connexion TLS (ligne 13), envoie `GET /healthz` (ligne 14) et attend `200` (ligne 15).',
			'La ligne 20 ajoute `check` pour lancer cette sonde sur chaque serveur, et `verify none` dit à HAProxy de ne pas vérifier le certificat du serveur d’API pendant ce check TLS. La section `defaults` au-dessus de cet extrait fixe `mode http`, que ces deux sections remplacent.'
		]
	},
	tradeoff: {
		gain: [
			'La couche 4 n’a besoin d’aucun certificat sur le répartiteur : la config kubeadm fait passer TLS tel quel jusqu’aux serveurs d’API.',
			'La couche 7 répartit des requêtes et pas des connexions : un client keep-alive a été partagé 50/50 en `mode http` et 100/0 en `mode tcp`.',
			'La couche 7 peut router selon le contenu et garder un utilisateur sur un serveur grâce à un cookie, que le `mode tcp` ne peut pas insérer. HAProxy propose `balance source` à la place.'
		],
		cost: [
			'La couche 4 ignore la charge à l’intérieur des connexions longues. Un client avec une connexion envoie toutes ses requêtes au même serveur, et un nouveau serveur ne reçoit que les nouvelles connexions.',
			'La couche 7 doit analyser chaque requête et, en HTTPS, détenir les clés TLS et déchiffrer. En `mode http`, HAProxy rejette toute requête « which is not RFC-compliant ».',
			'`balance source` déplace beaucoup de clients quand le nombre de serveurs change. Le manuel : « If the hash result changes due to the number of running servers changing, many clients will be directed to a different server ».'
		]
	},
	task: {
		prompt: 'Une API interne a 3 serveurs derrière HAProxy en `mode tcp` avec `balance roundrobin`. Ses seuls appelants sont 2 services, qui ouvrent chacun un pool de 4 connexions keep-alive au démarrage et ne les ferment jamais. (1) Combien de connexions chaque serveur porte-t-il ? (2) Un 4e serveur, déjà dans la config, passe son health check et démarre. Quel trafic reçoit-il ? (3) Qu’est-ce qui change en `mode http` ?',
		hint: 'En `mode tcp`, `roundrobin` ne tourne qu’à l’ouverture d’une connexion. Compte les connexions que porte chaque serveur.',
		answer: [
			'(1) 8 connexions distribuées à tour de rôle sur 3 serveurs : 3, 3 et 2. Chaque serveur traite toutes les requêtes envoyées sur ses propres connexions, donc une connexion chargée charge son serveur.',
			'(2) Rien. Les 8 connexions ont déjà un serveur, et `roundrobin` ne tourne à nouveau que pour une nouvelle connexion. Le 4e serveur attend qu’un appelant redémarre ou qu’une connexion tombe et se rouvre.',
			'(3) En `mode http`, HAProxy choisit un serveur pour chaque requête. Le nouveau serveur reçoit environ un quart des requêtes dès qu’il est up, avec les mêmes 8 connexions client.'
		]
	},
	quiz: [
		{
			q: 'HAProxy tourne en `mode tcp` avec `balance roundrobin` sur 2 serveurs. Un client envoie 100 requêtes sur une seule connexion keep-alive. Où vont-elles ?',
			options: [
				'50 sur chaque serveur, car `roundrobin` alterne à chaque requête',
				'Les 100 au serveur choisi à l’ouverture de la connexion',
				'Au serveur qui a le moins de connexions ouvertes, à chaque requête',
				'Au premier serveur qui répond, car HAProxy les met en course'
			],
			answer: 1,
			why: 'En `mode tcp`, HAProxy transmet des octets et ne voit pas où finit une requête. Il lance l’algorithme une fois, à la connexion. Le test de ce chapitre a donné 100 à `web1` et 0 à `web2`.'
		},
		{
			q: 'Tu veux que HAProxy envoie `/api/` et `/static/` vers des backends différents, en HTTPS. Qu’est-ce qu’il faut ?',
			options: [
				'Le `mode tcp`, avec une ligne `bind` par chemin',
				'Le `mode http` avec TLS terminé sur HAProxy, pour lire le chemin',
				'`balance source`, pour que chaque chemin tombe sur un autre serveur',
				'Rien de spécial : la couche 4 lit le SNI et le chemin'
			],
			answer: 1,
			why: 'Le chemin est dans la requête HTTP chiffrée. HAProxy doit déchiffrer TLS et analyser la requête en `mode http` avant de router dessus. En `mode tcp`, il ne voit que des adresses et des ports.'
		},
		{
			q: 'Pourquoi la config HAProxy de kubeadm utilise-t-elle le `mode tcp` pour les serveurs d’API ?',
			options: [
				'Parce que le `mode http` ne peut pas faire de health check en TLS',
				'Parce qu’il transmet les octets TLS sans les déchiffrer',
				'Parce que `roundrobin` n’existe qu’en `mode tcp`',
				'Parce que l’API Kubernetes n’utilise pas du tout HTTP'
			],
			answer: 1,
			why: 'En `mode tcp`, HAProxy copie le flux TLS sans le déchiffrer : la session TLS va du client au serveur d’API. Le même backend lance quand même une sonde TLS `GET /healthz` avec `http-check connect ssl`.'
		}
	],
	recall: {
		q: 'Avec `balance roundrobin`, quand HAProxy choisit-il un serveur en `mode tcp`, et quand en `mode http` ?',
		a: 'En `mode tcp`, une fois par connexion TCP : 100 requêtes sur une connexion keep-alive sont toutes allées à `web1`. En `mode http`, à chaque requête : le même client a été partagé 50/50.'
	},
	sources: [
		{ title: 'Manuel de configuration HAProxy (balance, mode, cookie)', url: HADOC },
		{ title: 'Doc HAProxy 3.0, balance', url: 'https://docs.haproxy.org/3.0/configuration.html#4.2-balance' },
		{ title: 'kubeadm, docs/ha-considerations.md', url: KUBEADM },
		{ title: 'Blog Kubernetes, gRPC Load Balancing on Kubernetes without Tears', url: 'https://kubernetes.io/blog/2018/11/07/grpc-load-balancing-on-kubernetes-without-tears/' }
	]
};
