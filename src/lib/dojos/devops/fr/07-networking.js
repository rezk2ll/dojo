const H5BP = 'https://github.com/h5bp/server-configs-nginx/blob/d2f2c3e2fac76f429adb738894499b8fb756d2f3';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'networking',
	part: 'Les fondamentaux',
	title: 'Le réseau : déboguer une couche à la fois',
	minutes: 10,
	hook: [
		'Un utilisateur dit que le site est en panne, alors tu te connectes en ssh. `systemctl status nginx` dit active, et `curl localhost` répond. Ça marche sur le serveur. Alors **où** est-ce que ça casse ?',
		'Une requête traverse quatre couches avant que nginx réponde. DNS traduit le nom en IP, TCP ouvre une connexion vers un port, TLS vérifie le certificat, et seulement ensuite **HTTP demande la page**.',
		'Tu testes chaque couche séparément, avec `dig`, `ss` et `curl`, du nom jusqu’à la page. Plus loin dans le parcours, tu débogueras les conteneurs et les clusters dans le même ordre.'
	],
	terms: [
		{ term: 'Enregistrement DNS', def: 'Une correspondance entre un nom et une valeur. `A` donne une adresse IPv4, `AAAA` une adresse IPv6, `CNAME` un autre nom. Le TTL dit combien de temps les résolveurs peuvent garder la réponse en cache.' },
		{ term: 'Port', def: 'Un numéro qui désigne un programme en écoute sur une machine. Sous Linux, par défaut, un processus a besoin d’être root ou d’avoir la capability `CAP_NET_BIND_SERVICE` pour utiliser un port sous 1024.' },
		{ term: 'Certificat TLS', def: 'Un fichier qui prouve qu’un serveur possède un nom. Le client vérifie que le nom correspond à l’URL, qu’une CA de confiance l’a signé, et qu’il n’a pas expiré.' },
		{ term: 'SNI', def: 'Server Name Indication : le client envoie le nom d’hôte dans le handshake TLS, ce qui permet à une seule IP de servir plusieurs certificats.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cl["curl https://example.com"]', 'cl -->|"1. nom"| dns["DNS : example.com vers 203.0.113.10"]', 'class dns ext'],
				highlight: ['cl', 'dns'],
				note: '`dig example.com +short` interroge directement le serveur DNS listé dans `/etc/resolv.conf`. `getent hosts example.com` fait la même résolution que tes programmes, **`/etc/hosts` compris**. Si les deux affichent des adresses différentes, regarde d’abord dans `/etc/hosts`.'
			},
			{
				add: ['cl -->|"2. connexion TCP"| port["Port 443 sur 203.0.113.10"]'],
				highlight: ['port'],
				note: 'Connection refused veut dire que le paquet est arrivé et que rien n’écoute à cet endroit (ou qu’un pare-feu le rejette). Un timeout veut dire que le paquet s’est perdu en route. Sur le serveur, `ss -tlnp` liste les sockets TCP en écoute avec **le processus qui possède chacune**.'
			},
			{
				add: ['subgraph srv["Serveur"]', 'ngx["nginx : server_name example.com"]', 'end', 'port -->|"3. TLS avec SNI"| ngx'],
				highlight: ['ngx'],
				note: 'Le client envoie le nom dans le SNI, et nginx choisit un certificat. curl vérifie ensuite que **le nom du certificat correspond à l’URL** et qu’une CA de confiance l’a signé. Si une des deux vérifications échoue, curl s’arrête avec le code de sortie 60.'
			},
			{
				add: ['ngx -->|"4. HTTP avec en-tête Host"| app["Fichiers du site ou appli"]'],
				highlight: ['app'],
				note: 'C’est seulement maintenant que HTTP démarre. nginx choisit le bloc `server` d’après **l’en-tête Host**. Si aucun bloc ne correspond, le serveur par défaut de ce port répond. `curl -I` affiche la ligne de statut et les en-têtes.'
			},
			{
				add: [],
				highlight: ['dns', 'port', 'ngx', 'app'],
				note: 'Une seule ligne curl chronomètre chaque couche : `curl -s -o /dev/null -w \'%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer}\\n\' https://example.com`. Et `--resolve example.com:443:IP` court-circuite le DNS, pour tester un nouveau serveur avant de changer l’enregistrement.'
			}
		]
	},
	example: {
		title: 'conf.d/templates/example.com.conf',
		repo: 'h5bp/server-configs-nginx',
		url: `${H5BP}/conf.d/templates/example.com.conf#L12-L37`,
		lang: 'nginx',
		code: `server {
  listen [::]:443 ssl http2;
  listen 443 ssl http2;

  server_name www.example.com;

  include h5bp/tls/ssl_engine.conf;
  include h5bp/tls/certificate_files.conf;
  include h5bp/tls/policy_balanced.conf;

  return 301 $scheme://example.com$request_uri;
}
…
server {
…
  listen [::]:443 ssl http2;
  listen 443 ssl http2;

  # The host name to respond to
  server_name example.com;

  include h5bp/tls/ssl_engine.conf;
  include h5bp/tls/certificate_files.conf;
  include h5bp/tls/policy_balanced.conf;`,
		notes: [
			'Les lignes 1 et 14 ouvrent deux blocs `server` sur le même port 443. nginx les distingue par les noms des lignes 5 et 20 : le SNI pendant le handshake TLS, puis l’en-tête Host. Sans correspondance, le premier bloc de ce port sert de défaut.',
			'Les lignes 2 et 3 sont deux sockets distinctes, une pour IPv6, une pour IPv4. Si le DNS publie un enregistrement `AAAA` et que tu oublies la ligne IPv6, les utilisateurs en IPv6 échouent alors que ton test en IPv4 passe.',
			'Ligne 11 : le bloc `www` ne fait que rediriger, mais il lui faut quand même un certificat qui couvre `www.example.com`. TLS passe **avant** HTTP, donc un mauvais certificat arrête le navigateur avant même qu’il voie le 301.',
			'La ligne 8 inclut [certificate_files.conf](https://github.com/h5bp/server-configs-nginx/blob/d2f2c3e2fac76f429adb738894499b8fb756d2f3/h5bp/tls/certificate_files.conf#L5-L24), qui pointe vers `default.crt`, servi quand un client n’envoie pas de SNI. Remplace-le par ton vrai certificat et ta vraie clé.',
			'Les lignes 2 et 3 utilisent le paramètre `http2` sur `listen`, que [les versions actuelles de nginx déprécient](https://nginx.org/en/docs/http/ngx_http_core_module.html#listen) au profit de la directive `http2`. Vérifie une config copiée avec la doc de la version de nginx que tu fais tourner.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque outil répond à une seule question : `dig` pour le nom, `ss` pour le port, `curl -v` pour TLS et HTTP. Tu prouves où ça casse au lieu de deviner.',
			'`--resolve` te permet de tester un nouveau serveur sous son vrai nom avant tout changement DNS.',
			'La même méthode marche plus tard dans un conteneur ou un cluster Kubernetes : nom, port, TLS, HTTP.'
		],
		cost: [
			'`dig` ne lit pas `/etc/hosts`, donc `dig` et `curl` peuvent te donner deux adresses différentes pour le même nom.',
			'Les résolveurs gardent une réponse DNS en cache pendant son TTL : après ton changement, certains utilisateurs reçoivent l’ancienne adresse jusqu’à la fin du TTL.',
			'`curl -k` saute la vérification du certificat. L’erreur disparaît, et le problème de certificat que tu cherchais reste caché.'
		]
	},
	task: {
		prompt: 'Tu déplaces example.com vers un nouveau serveur, 198.51.100.7, et tu mets à jour le DNS. Certains utilisateurs voient encore l’ancien site, d’autres ont une erreur de certificat. Écris les vérifications que tu fais, couche par couche.',
		hint: 'Teste d’abord le nouveau serveur sous son vrai nom **sans** passer par le DNS. Regarde ensuite ce que répond chaque résolveur, en IPv4 et en IPv6.',
		answer: [
			'TCP sur le nouveau serveur : `ss -tlnp` montre nginx en écoute sur 443, à la fois sur `0.0.0.0` et sur `[::]`.',
			'TLS et HTTP sans DNS : `curl -v --resolve example.com:443:198.51.100.7 https://example.com/`. Lis le sujet du certificat et la ligne de statut. Recommence pour `www.example.com`.',
			'DNS : `dig example.com +short` sur ton résolveur et sur un résolveur public (`dig @1.1.1.1 example.com +short`). Les anciennes réponses restent jusqu’à la fin du TTL.',
			'Et aussi `dig example.com AAAA +short` : un vieil enregistrement IPv6 envoie encore les utilisateurs IPv6 vers l’ancien serveur.',
			'Ne « répare » jamais l’erreur de certificat avec `-k`. Trouve quel nom le certificat ne couvre pas.'
		]
	},
	quiz: [
		{
			q: '`curl https://example.com` échoue avec « Connection refused ». Quelle couche a lâché ?',
			options: [
				'DNS : le nom ne s’est résolu vers aucune adresse',
				'TCP : rien n’a accepté la connexion sur ce port',
				'TLS : le certificat du serveur a expiré et a été rejeté',
				'HTTP : le serveur a répondu 404 pour cette page'
			],
			answer: 1,
			why: 'Refused veut dire que le nom s’est résolu et qu’un paquet a atteint la machine, mais qu’aucun programme n’écoute sur ce port (ou qu’un pare-feu l’a rejeté). Un échec DNS affiche plutôt « Could not resolve host ».'
		},
		{
			q: '`dig example.com +short` affiche la nouvelle IP, mais `curl` sur ton portable atteint toujours l’ancien serveur. La cause la plus probable ?',
			options: [
				'Une entrée dans `/etc/hosts`, que `curl` utilise et que `dig` ignore',
				'`dig` interroge un serveur DNS plus rapide que celui de `curl`',
				'La session TLS est en cache pour une semaine, donc `curl` garde l’ancien hôte',
				'Le port 443 est fermé sur le nouveau serveur, donc `curl` se rabat sur l’ancien'
			],
			answer: 0,
			why: '`dig` interroge directement un serveur DNS. Les programmes comme `curl` passent par le résolveur du système, qui lit aussi `/etc/hosts`. Compare avec `getent hosts example.com`.'
		},
		{
			q: 'Pourquoi nginx a-t-il besoin du SNI pour choisir un certificat, au lieu de l’en-tête HTTP Host ?',
			options: [
				'L’en-tête Host n’existe qu’en HTTP/1.0, pas en HTTP/2',
				'Le handshake TLS a lieu avant l’envoi du moindre octet HTTP',
				'Le SNI est plus rapide à analyser que tous les en-têtes HTTP',
				'Le DNS supprime l’en-tête Host avant que la requête arrive'
			],
			answer: 1,
			why: 'Le certificat fait partie du handshake TLS, et HTTP ne démarre qu’une fois TLS en place. Le SNI met le nom à l’intérieur du handshake lui-même.'
		}
	],
	recall: {
		q: 'Dans quel ordre testes-tu les couches d’une requête HTTPS qui échoue, et quel outil vérifie chacune ?',
		a: 'Nom, port, TLS, HTTP. `dig` vérifie le nom, `ss -tlnp` le port, et `curl -v` TLS et HTTP.'
	},
	sources: [
		{ title: 'Manuel de curl (--resolve, -w, --fail, codes de sortie)', url: 'https://curl.se/docs/manpage.html' },
		{ title: 'Pages de manuel BIND 9, dig', url: 'https://bind9.readthedocs.io/en/stable/manpages.html#dig-dns-lookup-utility' },
		{ title: 'Page de manuel ss(8)', url: 'https://man7.org/linux/man-pages/man8/ss.8.html' },
		{ title: 'nginx, configurer des serveurs HTTPS (SNI, chaînes de certificats)', url: 'https://nginx.org/en/docs/http/configuring_https_servers.html' },
		{ title: 'nginx, comment nginx traite une requête', url: 'https://nginx.org/en/docs/http/request_processing.html' },
		{ title: 'RFC 7766, transport DNS sur TCP', url: 'https://www.rfc-editor.org/rfc/rfc7766' }
	]
};
