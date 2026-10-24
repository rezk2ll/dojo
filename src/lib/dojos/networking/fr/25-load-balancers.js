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
		],
		steps: [
			{
				title: 'Compte les connexions',
				questions: [
					{ q: 'Combien de connexions longues arrivent sur HAProxy ?', options: ['8 : 2 services avec 4 chacun', '4 : les deux pools sont partagés', '2 : une par service', '12 : 4 par serveur'], answer: 0, why: 'Chacun des 2 services ouvre un pool de 4 connexions au démarrage et les garde.' },
					{ q: 'Le premier service ouvre ses 4 connexions, puis le second ouvre les siennes. Quels serveurs reçoivent les connexions du second service ?', options: ['Les serveurs 1, 2, 3 et 1, car la rotation repart pour chaque appelant', 'Les serveurs 2, 3, 1 et 2, car la rotation reprend là où elle s’était arrêtée', 'Les 4 sur le serveur 1', 'Les 4 sur le serveur 2'], answer: 1, why: 'La rotation est commune à tous les clients. Le premier service a pris les serveurs 1, 2, 3 et 1 : la connexion suivante, quel que soit l’appelant, va au serveur 2.' },
					{ q: 'Comment les 8 connexions se répartissent-elles sur les 3 serveurs ?', options: ['4, 2 et 2', '8, 0 et 0', '3, 3 et 2', '8 sur chaque serveur'], answer: 2, why: '`roundrobin` distribue les 8 connexions à tour de rôle : serveurs 1, 2, 3, 1, 2, 3, 1, 2.' },
					{ q: 'Les 3 serveurs reçoivent-ils alors la même part de requêtes ?', options: ['Oui : `roundrobin` équilibre les requêtes', 'Oui : HAProxy déplace les requêtes vers le serveur le moins chargé', 'Non : le premier serveur les reçoit toutes', 'Non : chacun traite ce que portent ses propres connexions, donc une connexion chargée charge son serveur'], answer: 3, why: 'HAProxy ne refait aucun choix à l’intérieur d’une connexion. La charge suit les connexions, pas les requêtes.' }
				]
			},
			{
				title: 'Ajoute le 4e serveur',
				questions: [
					{ q: 'Le 4e serveur passe son health check. Combien des 8 connexions passent sur lui ?', options: ['Aucune', '2 d’entre elles', 'Les 8', 'La moitié'], answer: 0, why: 'Chaque connexion a déjà un serveur, et rien en `mode tcp` ne déplace une connexion ouverte.' },
					{ q: 'Tant qu’aucun appelant ne se reconnecte, qu’est-ce qui arrive au 4e serveur ?', options: ['Une copie de chaque requête, pour le chauffer', 'Seulement les health checks de HAProxy', 'Une connexion déplacée par minute', 'Rien : HAProxy le marque DOWN faute de connexions'], answer: 1, why: 'Le serveur est UP et dans la rotation, mais les 8 connexions ont déjà leur serveur. Tant qu’aucune connexion ne s’ouvre, seuls les checks l’atteignent.' },
					{ q: 'Qu’est-ce qui envoie enfin du trafic au 4e serveur ?', options: ['La prochaine requête sur n’importe quelle connexion', 'Un passage à `balance source`', 'Un appelant qui redémarre, ou une connexion qui tombe et se rouvre', 'Un deuxième health check réussi'], answer: 2, why: 'Seule une nouvelle connexion relance `roundrobin` et peut tomber sur le nouveau serveur.' },
					{ q: 'Le premier service redémarre et rouvre ses 4 connexions, avec 4 serveurs up. Comment se répartissent-elles ?', options: ['Une sur chacun des 4 serveurs', 'Les 4 sur le nouveau serveur', 'Sur les serveurs qu’elles avaient avant', 'Seulement sur le serveur qui a le moins de connexions'], answer: 0, why: '`roundrobin` distribue les nouvelles connexions à tour de rôle entre les serveurs up, 4 désormais : 4 nouvelles connexions en donnent une à chacun.' }
				]
			},
			{
				title: 'Passe en `mode http`',
				questions: [
					{ q: 'En `mode http`, que lit HAProxy avant de choisir un serveur pour une requête ?', options: ['Seulement l’IP et le port source', 'Seulement le SNI TLS', 'Rien : il choisit avant que la requête arrive', 'La requête elle-même : méthode, chemin et en-têtes'], answer: 3, why: 'Le manuel dit que la requête « will be analyzed in depth before connecting to any server ». `balance` tourne ensuite sur cette requête.' },
					{ q: 'Quel trafic le 4e serveur reçoit-il une fois up ?', options: ['Aucun tant qu’un appelant ne redémarre pas', 'Environ un quart des requêtes, tout de suite', 'Toutes les nouvelles requêtes, jusqu’à rattraper les autres', 'La moitié des requêtes'], answer: 1, why: 'Avec 4 serveurs et un choix par requête, `roundrobin` donne environ un quart à chacun.' },
					{ q: 'Les 2 services doivent-ils changer leurs 8 connexions ?', options: ['Non : les mêmes 8 connexions client marchent, HAProxy choisit par requête', 'Oui : ils doivent se reconnecter après chaque requête', 'Oui : ils doivent couper le keep-alive', 'Oui : il leur faut une connexion par serveur'], answer: 0, why: 'Dans l’accroche, une seule connexion keep-alive a été partagée 50/50 en `mode http`. Côté client, rien ne change.' },
					{ q: 'Que fait `mode http` d’une requête qui n’est pas conforme aux RFC ?', options: ['Il la transmet en octets bruts', 'Il l’envoie au premier serveur', 'Il la rejette', 'Il la retente sur un autre serveur'], answer: 2, why: 'Le manuel dit qu’en `mode http` HAProxy rejette toute requête « which is not RFC-compliant ».' }
				]
			},
			{
				title: 'Pèse le coût',
				questions: [
					{ q: 'Quel coût du `mode tcp` vu dans cette tâche le `mode http` supprime-t-il ?', options: ['Le répartiteur doit détenir les clés TLS', 'Un nouveau serveur ne reçoit du trafic que par de nouvelles connexions', 'Les requêtes non conformes aux RFC sont rejetées', 'La persistance demande un cookie'], answer: 1, why: 'En `mode http`, `balance` tourne pour chaque requête : le 4e serveur reçoit sa part tout de suite. Les trois autres décrivent le `mode http` lui-même, pas le `mode tcp`.' },
					{ q: '`balance source` en `mode tcp` réglerait-il le problème du 4e serveur ?', options: ['Non : il choisit toujours par connexion, et un changement du nombre de serveurs déplace beaucoup de clients', 'Oui : il répartit les requêtes par IP source', 'Oui : il rééquilibre les connexions ouvertes', 'Non : `balance source` ne marche qu’en `mode http`'], answer: 0, why: 'Il hache la source à l’ouverture. Le manuel prévient que si le nombre de serveurs change, beaucoup de clients partent vers un autre serveur.' },
					{ q: 'kubeadm garde `mode tcp` et vérifie quand même `GET /healthz`. Comment HAProxy fait-il ce check ?', options: ['Il lit les réponses `/healthz` dans le trafic de `kubectl`', 'Il déchiffre les sessions de `kubectl`', 'Il envoie seulement un SYN TCP et attend le SYN-ACK', 'Il ouvre sa propre connexion TLS vers chaque serveur et attend `200`'], answer: 3, why: 'Les lignes 11 à 15 posent `option httpchk` avec `http-check connect ssl` : HAProxy ouvre sa propre connexion TLS, envoie `GET /healthz` et attend 200, pendant que le trafic des utilisateurs reste en couche 4.' },
					{ q: 'En `mode http`, comment garder un utilisateur sur un serveur si besoin ?', options: ['Seulement avec `balance source`', 'Impossible en `mode http`', 'Avec un cookie, par exemple `cookie SRV insert indirect nocache`', 'Avec `mode tcp` sur le backend'], answer: 2, why: 'HAProxy insère un cookie dans la première réponse, et les requêtes suivantes qui le portent vont au même serveur.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Faire tourner HAProxy en `mode tcp` et en `mode http` devant deux serveurs, et compter où arrivent 100 requêtes keep-alive.',
		steps: [
			'Écris la config : `mkdir -p ~/lb-lab && cd ~/lb-lab`, puis `printf \'defaults\\n  timeout connect 5s\\n  timeout client 30s\\n  timeout server 30s\\nfrontend l4\\n  mode tcp\\n  bind :8401\\n  default_backend b4\\nbackend b4\\n  mode tcp\\n  balance roundrobin\\n  server web1 127.0.0.1:9001\\n  server web2 127.0.0.1:9002\\nfrontend l7\\n  mode http\\n  bind :8402\\n  default_backend b7\\nbackend b7\\n  mode http\\n  balance roundrobin\\n  server web1 127.0.0.1:9001\\n  server web2 127.0.0.1:9002\\n\' > haproxy.cfg`.',
			'Démarre deux serveurs qui répondent leur nom, puis HAProxy dans le même réseau : `docker run -d --rm --name lb-web -p 8401:8401 -p 8402:8402 node:24-alpine node -e "for (const [p, n] of [[9001, \'web1\'], [9002, \'web2\']]) require(\'http\').createServer((q, r) => r.end(n + \'\\n\')).listen(p)"`, puis `docker run -d --rm --name lb --network container:lb-web -v "$PWD/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro" haproxy:3.0`.',
			'Envoie 100 requêtes sur une seule connexion keep-alive via `mode tcp`. curl réutilise la connexion pour une plage d’URL : `curl -s "localhost:8401/[1-100]" | sort | uniq -c`.',
			'Fais pareil via `mode http` : `curl -s "localhost:8402/[1-100]" | sort | uniq -c`.',
			'De retour sur `mode tcp`, ouvre une nouvelle connexion par requête : `for i in $(seq 1 10); do curl -s localhost:8401/; done | sort | uniq -c`. Nettoie avec `docker rm -f lb lb-web`.'
		],
		done: [
			'Le port 8401 avec une seule connexion affiche `100 web1` et aucune ligne `web2`.',
			'Le port 8402 affiche `50 web1` et `50 web2`.',
			'La boucle sur le port 8401 affiche `5 web1` et `5 web2`.'
		],
		solution: [
			'`mode tcp` lance `roundrobin` une fois, à l’ouverture de la connexion, puis copie des octets. Toutes les requêtes de cette connexion vont au même serveur.',
			'`mode http` lit chaque requête et lance `balance` pour chacune : une seule connexion est partagée à parts égales.',
			'Avec une nouvelle connexion par requête, `mode tcp` alterne aussi. C’est pour ça que le 4e serveur de la tâche attend de nouvelles connexions.'
		]
	},
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
