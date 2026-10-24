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
		],
		steps: [
			{
				title: 'Vérifie le port sur le nouveau serveur',
				questions: [
					{ q: 'Quelle couche vérifies-tu d’abord sur le nouveau serveur lui-même ?', options: ['HTTP, avec `curl -I`', 'TCP : nginx écoute-t-il sur 443 ?', 'Le DNS, avec `dig`', 'La date d’expiration du certificat'], answer: 1, why: 'Avant que le nom ou le certificat comptent, il faut que quelque chose écoute sur le port.' },
					{ q: 'Quelle commande liste les sockets TCP en écoute et le processus qui possède chacune ?', options: ['`ss -tlnp`', '`dig example.com +short`', '`curl -I localhost`', '`getent hosts example.com`'], answer: 0, why: '`ss -tlnp` montre les sockets TCP en écoute avec le processus propriétaire.' },
					{ q: 'nginx écoute sur `0.0.0.0:443` mais pas sur `[::]:443`. Qui échoue ?', options: ['Personne, IPv4 couvre les deux', 'Seulement les utilisateurs avec un vieux navigateur', 'Les utilisateurs qui arrivent sur le serveur en IPv6', 'Seulement les utilisateurs de `www.example.com`'], answer: 2, why: 'IPv4 et IPv6 sont deux sockets distinctes. Si le DNS publie un enregistrement `AAAA`, les utilisateurs IPv6 ont besoin de l’écoute sur `[::]`.' },
					{ q: 'Un test depuis l’extérieur dit « Connection refused ». Qu’est-ce que ça t’apprend ?', options: ['Le nom ne s’est pas résolu', 'Le certificat est mauvais', 'Le paquet s’est perdu en route', 'Le paquet est arrivé et rien n’écoute là, ou un pare-feu le rejette'], answer: 3, why: 'Refused veut dire que la machine a répondu. Un timeout voudrait dire que le paquet s’est perdu.' }
				]
			},
			{
				title: 'Teste TLS et HTTP sans DNS',
				questions: [
					{ q: 'Comment testes-tu le nouveau serveur sous son vrai nom avant de faire confiance au DNS ?', options: ['`curl -k https://198.51.100.7/`', 'Modifier encore l’enregistrement DNS', '`curl -v --resolve example.com:443:198.51.100.7 https://example.com/`', '`dig @198.51.100.7 example.com`'], answer: 2, why: '`--resolve` court-circuite le DNS et envoie le vrai nom dans le SNI et l’en-tête Host vers l’IP que tu choisis.' },
					{ q: 'Dans cette sortie de `curl -v`, que lis-tu ?', options: ['Le sujet du certificat et la ligne de statut', 'Seulement le corps de la réponse', 'Le TTL de l’enregistrement', 'La liste des serveurs DNS'], answer: 0, why: 'Le sujet montre quels noms le certificat couvre, et la ligne de statut montre que HTTP marche.' },
					{ q: 'Pourquoi refaire le test pour `www.example.com` ?', options: ['`www` utilise un autre port', 'Le bloc `www` a besoin de son nom dans le certificat, même s’il ne fait que rediriger', '`www` saute TLS', 'Le DNS garde `www` plus longtemps en cache'], answer: 1, why: 'TLS passe avant HTTP, donc un certificat qui ne couvre pas `www.example.com` échoue avant même l’envoi du 301.' },
					{ q: 'Pourquoi nginx a-t-il besoin du SNI pour choisir le certificat ?', options: ['L’en-tête Host est chiffré par le DNS', 'Le SNI est plus rapide à analyser', 'HTTP/2 n’a pas d’en-tête Host', 'Le handshake TLS a lieu avant l’envoi du moindre octet HTTP'], answer: 3, why: 'Le certificat fait partie du handshake, et le SNI met le nom à l’intérieur.' }
				]
			},
			{
				title: 'Regarde ce que répond le DNS',
				questions: [
					{ q: 'Certains utilisateurs voient encore l’ancien site. Pourquoi, si tu as mis le DNS à jour ?', options: ['Les résolveurs gardent l’ancienne réponse en cache jusqu’à la fin de son TTL', 'Un changement DNS demande de redémarrer le serveur', 'nginx garde l’ancienne IP en cache', 'Le certificat pointe vers l’ancienne IP'], answer: 0, why: 'Les résolveurs peuvent garder une réponse pendant son TTL, donc les anciennes réponses traînent après le changement.' },
					{ q: 'Comment compares-tu ce que disent différents résolveurs ?', options: ['`curl -I` deux fois', '`ss -tlnp` sur les deux serveurs', '`dig example.com +short` sur ton résolveur, puis sur un résolveur public avec `@`', '`getent hosts` sur le nouveau serveur'], answer: 2, why: '`dig @serveur` interroge un serveur DNS précis, donc tu vois qui sert encore l’ancienne adresse.' },
					{ q: 'Quel enregistrement peut encore envoyer les utilisateurs IPv6 vers l’ancien serveur ?', options: ['`A`', '`AAAA`', '`CNAME`', '`MX`'], answer: 1, why: 'Un enregistrement `AAAA` donne l’adresse IPv6. Ne changer que le `A` laisse l’IPv6 sur l’ancienne machine.' },
					{ q: '`dig` montre la nouvelle IP mais le `curl` de ton portable atteint l’ancien serveur. Où regardes-tu d’abord ?', options: ['Le TTL', 'Le certificat', 'La config nginx', '`/etc/hosts`, que `curl` lit et que `dig` ignore'], answer: 3, why: '`dig` interroge directement un serveur DNS. `getent hosts` fait la même résolution que les programmes, `/etc/hosts` compris.' }
				]
			},
			{
				title: 'Corrige vraiment l’erreur de certificat',
				questions: [
					{ q: 'Un collègue propose `curl -k` pour passer l’erreur de certificat. Qu’est-ce qui ne va pas ?', options: ['Ça saute les vérifications, donc le problème que tu cherches reste caché', 'C’est plus lent', 'Ça ne marche qu’en IPv6', 'Ça désactive le SNI'], answer: 0, why: '`-k` fait disparaître l’erreur et laisse le problème de certificat en place pour les vrais utilisateurs.' },
					{ q: 'Quelles trois choses un client vérifie-t-il sur un certificat ?', options: ['Sa taille, son port et son IP', 'Le nom correspond à l’URL, une CA de confiance l’a signé, il n’a pas expiré', 'Son TTL, son type d’enregistrement et son résolveur', 'L’en-tête Host, la ligne de statut et le corps'], answer: 1, why: 'Le nom, le signataire et l’expiration sont les trois vérifications.' },
					{ q: 'curl s’arrête sur une vérification de certificat. Quel code de sortie renvoie-t-il ?', options: ['7', '22', '60', '127'], answer: 2, why: 'curl sort avec 60 quand il ne peut pas vérifier le certificat du serveur.' },
					{ q: 'Les utilisateurs qui arrivent sur `www` ont l’erreur de certificat. Que cherches-tu ?', options: ['Un enregistrement `AAAA` manquant', 'Un port 80 fermé', 'Un TTL trop long', 'Quel nom le certificat ne couvre pas'], answer: 3, why: 'Un nom qui ne correspond pas est la cause habituelle : le certificat couvre `example.com` mais pas `www.example.com`, ou l’inverse.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Faire tourner un serveur HTTPS local pour example.com et faire échouer chaque couche exprès : le port, la confiance TLS, le nom du certificat, puis une réponse propre.',
		steps: [
			'Crée un certificat autosigné pour `example.com` : `mkdir -p ~/net-lab && cd ~/net-lab && openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 -subj /CN=example.com -addext subjectAltName=DNS:example.com`.',
			'Écris `site.conf` avec un seul bloc `server` : `listen 443 ssl;`, `server_name example.com;`, `ssl_certificate /etc/nginx/certs/cert.pem;`, `ssl_certificate_key /etc/nginx/certs/key.pem;` et `return 200 "new server\\n";`.',
			'Démarre-le : `docker run -d --name netlab -p 8443:443 -v "$PWD/site.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD:/etc/nginx/certs:ro" nginx:1.27-alpine`. Vérifie le port avec `ss -tln | grep 8443` (sous macOS : `lsof -iTCP:8443 -sTCP:LISTEN`).',
			'Teste chaque couche avec `--resolve`, qui court-circuite le DNS. Mauvais port : `curl -s --resolve example.com:8444:127.0.0.1 https://example.com:8444/; echo $?`. CA inconnue : `curl -s --resolve example.com:8443:127.0.0.1 https://example.com:8443/; echo $?`.',
			'Fais confiance à ta CA, puis essaie un nom que le certificat ne couvre pas : `curl -s --cacert cert.pem --resolve example.com:8443:127.0.0.1 https://example.com:8443/`, puis la même chose avec `www.example.com` aux deux endroits, suivie de `echo $?`.',
			'Chronomètre chaque couche : `curl -s -o /dev/null --cacert cert.pem --resolve example.com:8443:127.0.0.1 -w \'%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer}\\n\' https://example.com:8443/`. Nettoie avec `docker rm -f netlab`.'
		],
		done: [
			'`ss -tln` montre 8443 en écoute à la fois sur `0.0.0.0` et sur `[::]`.',
			'Le mauvais port affiche le code de sortie `7` (connexion refusée).',
			'Sans `--cacert`, curl sort avec `60`. Avec, il affiche `new server`. Avec `www.example.com`, il sort de nouveau avec `60`.',
			'La ligne `-w` affiche quatre temps croissants, et `time_appconnect` marque la fin de TLS.'
		],
		solution: [
			'Le code 7, c’est TCP : rien n’écoute sur 8444. Le code 60, c’est TLS : soit la CA est inconnue, soit le nom ne correspond pas.',
			'Les deux erreurs `60` ont des causes différentes. `curl -v` montre laquelle : « self-signed certificate » pour la confiance, « no alternative certificate subject name matches target host name » pour le nom. Le texte exact dépend de la bibliothèque TLS de ton curl.',
			'`curl -k` afficherait `new server` dans les deux cas et cacherait les deux problèmes. Ajouter `DNS:www.example.com` au `subjectAltName` est la vraie correction pour le second.'
		]
	},
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
