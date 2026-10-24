const GL = 'https://github.com/gitlabhq/gitlabhq/blob/28f70ed3725bbc2bb6cbfa635ab6dd9bfa57af9a';
const BLOCKER = `${GL}/gems/gitlab-http/lib/gitlab/http_v2/url_blocker.rb`;
const CVE = 'https://gitlab.com/gitlab-org/cves/-/blob/master/2021/CVE-2021-22214.json';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ssrf',
	part: 'Les entrées et les sorties',
	title: 'La falsification de requête côté serveur (SSRF)',
	minutes: 10,
	hook: [
		'GitLab laisse le propriétaire d’un projet saisir l’URL d’un webhook, et le serveur GitLab y envoie une requête HTTP à chaque événement, un push par exemple. Le 8 juin 2021 paraît la CVE-2021-22214 : « When requests to the internal network for webhooks are enabled, a server-side request forgery vulnerability in GitLab CE/EE affecting all versions starting from 10.5 was possible to exploit for an unauthenticated attacker ». Versions corrigées : 13.10.5, 13.11.5 et 13.12.2.',
		'La requête part du serveur, donc elle atteint ce que le serveur atteint : les services sur `localhost`, le réseau privé et, sur une VM cloud, le service de métadonnées à `169.254.169.254`. Un commentaire du bloqueur d’URL de GitLab donne l’enjeu : « On IaaS these can return IAM credentials » (des identifiants IAM).'
	],
	terms: [
		{ term: 'SSRF', def: 'Server-side request forgery : l’attaquant donne une URL au serveur, et le serveur envoie la requête depuis son propre réseau.' },
		{ term: 'Service de métadonnées', def: 'Un point HTTP présent sur les VM cloud à `169.254.169.254`, qui répond sur l’instance elle-même. Chez AWS, ce service s’appelle IMDS.' },
		{ term: 'Adresse link-local', def: 'Une adresse de `169.254.0.0/16` (IPv4) ou `fe80::/10` (IPv6), joignable seulement sur le segment réseau local. L’IP des métadonnées en fait partie.' },
		{ term: 'DNS rebinding', def: 'Un nom d’hôte résout vers une IP publique quand l’appli le vérifie, puis vers une IP interne quand elle se connecte. La doc de GitLab : la technique fait « a malicious domain name resolve to an internal network resource ».' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['hook["URL du webhook : http://169.254.169.254/latest/meta-data/"] --> srv["Le serveur GitLab envoie la requête au push suivant"]'],
				highlight: ['hook', 'srv'],
				note: 'L’attaquant ne se connecte jamais à l’IP des métadonnées. Il la tape dans un formulaire. Au push suivant, le serveur GitLab, qui tourne sur la VM, envoie la requête.'
			},
			{
				add: ['srv --> inside["Atteint 127.0.0.1, 10.0.0.0/8, 169.254.169.254"]'],
				highlight: ['inside'],
				note: 'Depuis l’intérieur, le serveur atteint ce qu’un pare-feu cache à Internet. La doc des webhooks de GitLab : un attaquant « can get the GitLab server to make POST HTTP requests to endpoints that delete resources » sur des services qui font confiance aux appels locaux.'
			},
			{
				add: ['srv --> resolve["UrlBlocker : résout le nom, vérifie chaque IP"]', 'resolve -->|"loopback, privée, link-local, métadonnées"| blocked["BlockedUrlError"]'],
				highlight: ['resolve', 'blocked'],
				note: 'Le `UrlBlocker` de GitLab résout le nom d’hôte avec `getaddrinfo` et teste chaque adresse obtenue. Un nom comme `internal.attacker.example` qui pointe vers `10.0.0.5` échoue au même test que l’IP écrite en clair.'
			},
			{
				add: ['resolve -->|"dns_rebind_protection"| pin["Connexion à l’IP vérifiée, nom gardé pour TLS"]'],
				highlight: ['pin'],
				note: 'Entre la vérification et la connexion, le DNS pourrait répondre autre chose. Avec `dns_rebind_protection`, GitLab renvoie l’URI avec l’IP vérifiée comme hôte et garde le nom d’origine pour vérifier le certificat TLS. Le client ne refait pas de requête DNS.'
			},
			{
				add: ['pin --> imds["Côté cloud : IMDSv2 exige un PUT pour un jeton, hop limit 1"]'],
				highlight: ['imds'],
				note: 'Une deuxième couche chez AWS : une requête IMDSv2 a besoin d’un jeton de session, obtenu par un `PUT` sur `/latest/api/token`. La fiche OWASP conseille de passer à IMDSv2 et de couper IMDSv1. AWS : « PUT requests are rejected if they contain an X-Forwarded-For header », et la réponse au jeton a par défaut une hop limit de 1.'
			}
		]
	},
	example: {
		title: 'gems/gitlab-http/lib/gitlab/http_v2/url_blocker.rb : fixer l’IP, puis refuser les adresses locales',
		repo: 'gitlabhq/gitlabhq',
		url: `${BLOCKER}#L216-L458`,
		lang: 'ruby',
		code: `        def enforce_uri_hostname(ip_address, uri, dns_rebind_protection, proxy_in_use)
          unless dns_rebind_protection && ip_address && ip_address != uri.hostname
            return Result.new(uri, nil, proxy_in_use)
          end

          new_uri = uri.dup
          new_uri.hostname = ip_address
          Result.new(new_uri, uri.hostname, proxy_in_use)
        end
…
        def validate_local_request(
          address_info:,
          allow_localhost:,
          allow_local_network:)
          return if allow_local_network && allow_localhost

          unless allow_localhost
            validate_localhost(address_info)
            validate_loopback(address_info)
          end

          return if allow_local_network

          validate_local_network(address_info)
          validate_link_local(address_info)
          validate_shared_address(address_info)
          validate_limited_broadcast_address(address_info)
        end
…
        def validate_loopback(addrs_info)
          return unless addrs_info.any? { |addr| addr.ipv4_loopback? || addr.ipv6_loopback? }

          raise BlockedUrlError, "Requests to loopback addresses are not allowed"
        end

        def validate_local_network(addrs_info)
          return unless addrs_info.any? { |addr| addr.ipv4_private? || addr.ipv6_sitelocal? || addr.ipv6_unique_local? }

          raise BlockedUrlError, "Requests to the local network are not allowed"
        end

        def validate_link_local(addrs_info)
          netmask = IPAddr.new('169.254.0.0/16')
          return unless addrs_info.any? { |addr| addr.ipv6_linklocal? || netmask.include?(addr.ip_address) }

          raise BlockedUrlError, "Requests to the link local network are not allowed"
        end`,
		notes: [
			'Les lignes 6 à 8 fixent l’adresse. L’URI renvoyée a l’IP vérifiée comme hôte, et `uri.hostname` voyage à côté pour le contrôle TLS. Le guide de code sécurisé de GitLab prévient : « if we ignore this returned value, we will not be protected against DNS rebinding ».',
			'La ligne 22, `return if allow_local_network`, correspond au réglage admin de l’introduction. La CVE-2021-22214 demandait que « requests to the internal network for webhooks » soient activées. La [doc des webhooks](https://docs.gitlab.com/security/webhooks/) liste ce qui est bloqué quand le réglage est coupé : `127.0.0.1`, `::1`, `0.0.0.0`, `10.0.0.0/8`, `172.16.0.0/12` et `192.168.0.0/16`.',
			'Les lignes 31, 37 et 44 utilisent `any?`. Un nom avec un enregistrement A public et un privé est refusé, puisque le client pourrait se connecter à l’un ou à l’autre.',
			'La ligne 43 bloque tout `169.254.0.0/16`, IP des métadonnées comprise. Un contrôle à part, [`validate_cloud_metadata!`](' + BLOCKER + '#L460-L467), passe avant la liste d’autorisation et n’est pas sauté par `allow_local_network`. La doc des webhooks le date : « Introduced in GitLab 19.5 ».'
		]
	},
	tradeoff: {
		gain: [
			'Une seule classe porte les règles des URL sortantes, et webhooks comme intégrations obéissent aux mêmes réglages admin.',
			'Vérifier les IP résolues attrape les noms qui pointent vers l’intérieur, et fixer l’IP empêche une deuxième réponse DNS de changer la cible.'
		],
		cost: [
			'Une liste de blocage doit connaître toutes les plages internes. La fiche OWASP : « Deny-lists are bypass-prone. Prefer allow-lists. » Elle ne garde la liste de blocage que là où l’utilisateur peut saisir n’importe quelle URL externe, comme pour les webhooks.',
			'Certains admins ont besoin que les webhooks joignent un Jenkins interne. Cocher « Allow requests to the local network from webhooks and integrations » ouvre toutes les plages privées d’un coup, et c’était la condition de la CVE-2021-22214.',
			'`UrlBlocker` ne vérifie que l’URL de la première requête. Le guide de GitLab demande de « Disable redirects or validate the redirect destination », car une URL publique peut répondre par une redirection vers `169.254.169.254`.'
		]
	},
	task: {
		prompt: 'Une instance GitLab tourne sur une VM cloud avec les réglages sortants par défaut : les webhooks n’ont pas le droit d’appeler le réseau local. Pour chaque URL de webhook, dis si `UrlBlocker` l’accepte et, sinon, quel contrôle la refuse. (1) `http://127.0.0.1:6379/` (2) `http://169.254.169.254/latest/meta-data/` (3) `https://hooks.attacker.example/`, dont l’enregistrement A vaut `10.0.0.5` (4) `https://ci.example.org/hook`, dont l’enregistrement A est une adresse publique.',
		hint: 'Les contrôles portent sur les IP obtenues après le DNS, et le contrôle des métadonnées tourne aussi sur le nom avant le DNS.',
		answer: [
			'(1) Refusée. `allow_localhost` vaut false, donc `validate_localhost` et `validate_loopback` tournent, et `127.0.0.1` est une adresse loopback.',
			'(2) Refusée avant le DNS : `validate_cloud_metadata_hostname!` reconnaît l’IP écrite en clair et lève « Requests to cloud metadata endpoints are not allowed ». Sans ce contrôle, la ligne 43 de l’exemple l’attraperait quand même comme link-local.',
			'(3) Refusée après le DNS. Le nom a l’air public, mais `getaddrinfo` renvoie `10.0.0.5`, et `ipv4_private?` est vrai : « Requests to the local network are not allowed ».',
			'(4) Acceptée. Avec `dns_rebind_protection`, la requête part vers l’IP vérifiée, et `ci.example.org` est gardé pour TLS. Une redirection de ce serveur vers une adresse interne doit être revérifiée ou refusée.'
		],
		steps: [
			{
				title: 'Lis la config',
				questions: [
					{ q: 'Qui envoie la requête du webhook ?', options: ['Le navigateur du propriétaire du projet', 'Le serveur GitLab, depuis son propre réseau', 'Le serveur qui reçoit', 'Le résolveur DNS'], answer: 1, why: 'C’est ce qui en fait une SSRF : la requête atteint tout ce que le serveur atteint.' },
					{ q: 'Avec les réglages sortants par défaut, que vaut `allow_local_network` ?', options: ['true', 'true pour les admins seulement', 'false', 'Il ne sert pas'], answer: 2, why: 'Les webhooks n’ont pas le droit d’appeler le réseau local : la ligne 22 ne sort pas tout de suite et les contrôles tournent.' },
					{ q: 'Lesquelles des quatre URL ont besoin d’une réponse DNS avant que les contrôles d’adresse disent quoi que ce soit ?', options: ['(3) et (4), les deux noms d’hôte', '(1) et (2), les IP en clair', 'Les quatre', 'Aucune : les contrôles lisent le texte de l’URL'], answer: 0, why: '(1) et (2) sont déjà des adresses. Pour (3) et (4), seule l’adresse résolue dit où partirait la requête.' },
					{ q: 'Quel contrôle tourne aussi sur le nom, avant le DNS ?', options: ['Le contrôle loopback', 'Le contrôle du réseau privé', 'Le contrôle du port', 'Le contrôle des métadonnées cloud'], answer: 3, why: '`validate_cloud_metadata_hostname!` reconnaît l’IP des métadonnées écrite en clair, avant toute résolution.' }
				]
			},
			{
				title: 'Vérifie les IP en clair',
				questions: [
					{ q: '(1) `http://127.0.0.1:6379/` : acceptée ?', options: ['Oui : le port 6379 n’est pas bloqué', 'Refusée : `127.0.0.1` est une adresse loopback', 'Refusée : le contrôle des métadonnées', 'Oui : elle n’est pas dans `10.0.0.0/8`'], answer: 1, why: '`allow_localhost` vaut false, donc `validate_localhost` et `validate_loopback` la refusent.' },
					{ q: '(2) `http://169.254.169.254/latest/meta-data/` : quel contrôle la refuse en premier ?', options: ['Le contrôle du réseau privé', 'Le contrôle loopback', '`validate_cloud_metadata_hostname!`, avant le DNS', 'Aucun : elle est acceptée'], answer: 2, why: 'Il reconnaît l’IP écrite en clair et lève « Requests to cloud metadata endpoints are not allowed ».' },
					{ q: 'Sans ce contrôle des métadonnées, (2) serait-elle quand même refusée ?', options: ['Oui : la ligne 43 bloque tout `169.254.0.0/16` comme link-local', 'Non : c’est une adresse publique', 'Non : le link-local est toujours permis', 'Seulement chez AWS'], answer: 0, why: 'L’IP des métadonnées est une adresse link-local, et la ligne 43 bloque toute la plage.' },
					{ q: 'Pourquoi l’IP des métadonnées compte-t-elle tant sur une VM cloud ?', options: ['Elle est lente', 'Elle héberge l’interface de GitLab', 'Elle fait tourner le serveur DNS', 'Le commentaire de GitLab : « On IaaS these can return IAM credentials »'], answer: 3, why: 'Une requête du serveur qui l’atteint peut lire les identifiants de l’instance.' }
				]
			},
			{
				title: 'Vérifie les noms d’hôte',
				questions: [
					{ q: '(3) `hooks.attacker.example` résout vers `10.0.0.5`. Quand est-elle refusée ?', options: ['Avant le DNS, sur son nom', 'Après le DNS : `ipv4_private?` est vrai pour `10.0.0.5`', 'Jamais : le nom a l’air public', 'Seulement sur une redirection'], answer: 1, why: 'Les contrôles portent sur l’adresse résolue et répondent « Requests to the local network are not allowed ».' },
					{ q: 'Un nom a un enregistrement A public et un privé. Que se passe-t-il ?', options: ['Acceptée : une adresse est publique', 'Acceptée, avec l’adresse publique', 'Refusée : les contrôles utilisent `any?`', 'Refusée une fois sur deux'], answer: 2, why: 'Le client peut se connecter à l’une ou l’autre : un seul enregistrement privé suffit pour refuser.' },
					{ q: '(4) `ci.example.org` résout vers une adresse publique. Acceptée ?', options: ['Oui', 'Non : tous les webhooks HTTPS sont refusés', 'Non : les noms ne sont jamais acceptés', 'Seulement avec `allow_local_network`'], answer: 0, why: 'Aucun contrôle ne correspond à une adresse publique : `UrlBlocker` l’accepte.' },
					{ q: 'Lesquelles des quatre URL passent ?', options: ['(1) et (4)', '(3) et (4)', 'Les quatre', 'Seulement (4)'], answer: 3, why: 'Les adresses loopback, de métadonnées et privées sont refusées. Seule l’adresse publique passe.' }
				]
			},
			{
				title: 'Ferme les derniers trous',
				questions: [
					{ q: 'Juste après le contrôle, `ci.example.org` se met à résoudre vers `10.0.0.5`. Avec `dns_rebind_protection` actif, où part le webhook ?', options: ['Vers `10.0.0.5`', 'Vers l’IP publique qui a été vérifiée', 'Nulle part : la nouvelle réponse lève une erreur', 'Vers les deux adresses, l’une après l’autre'], answer: 1, why: 'Les lignes 6 à 8 mettent l’IP vérifiée dans l’URI : le client ne redemande jamais le DNS. La nouvelle réponse n’est jamais vue.' },
					{ q: 'Quelle attaque cet épinglage arrête-t-il ?', options: ['La CSRF', 'Le credential stuffing', 'Le DNS rebinding', 'L’injection SQL'], answer: 2, why: 'Le nom résout vers une IP publique au contrôle et vers une IP interne à la connexion. L’épinglage supprime la seconde résolution.' },
					{ q: 'Un attaquant réécrit (1) en `http://[::1]:6379/`. Que se passe-t-il ?', options: ['Refusée : le contrôle loopback teste aussi `ipv6_loopback?`', 'Acceptée : seules les adresses IPv4 sont contrôlées', 'Refusée par le contrôle des métadonnées', 'Acceptée, puisqu’aucune résolution DNS n’a lieu'], answer: 0, why: 'La ligne 31 refuse si une adresse est `ipv4_loopback?` ou `ipv6_loopback?`, et `::1` est le loopback IPv6.' },
					{ q: 'Quel contrôle reste actif même si un admin autorise le réseau local ?', options: ['Le contrôle loopback', 'Le contrôle du réseau privé', 'Le contrôle `any?`', '`validate_cloud_metadata!`, qui tourne avant la liste d’autorisation'], answer: 3, why: '`allow_local_network` ne le saute pas. La doc des webhooks le date de GitLab 19.5.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Pourquoi GitLab vérifie-t-il les IP renvoyées par le DNS, et pas seulement le nom tapé dans le formulaire du webhook ?',
			options: [
				'Parce que les noms d’hôte ignorent la casse et se comparent mal',
				'Parce que l’attaquant gère son DNS et peut pointer un nom vers l’intérieur',
				'Parce que `getaddrinfo` est plus rapide qu’une regex sur l’URL',
				'Parce qu’un certificat TLS ne se vérifie que contre une adresse IP'
			],
			answer: 1,
			why: 'Le propriétaire d’un domaine peut lui donner un enregistrement A `10.0.0.5` ou `127.0.0.1`. Le guide de GitLab : « validate the destination IP addresses themselves, not just domain names, as the attacker can control DNS. »'
		},
		{
			q: 'Avec `dns_rebind_protection` activé, que renvoie `enforce_uri_hostname` quand `hooks.example.com` résout vers `203.0.113.9` ?',
			options: [
				'L’URI d’origine, et le client HTTP résout le nom une seconde fois',
				'Une erreur, car un nom qui se résout vers une IP est jugé suspect',
				'Une URI avec `203.0.113.9` pour hôte, et le nom d’origine pour TLS',
				'Une URI avec `127.0.0.1` comme hôte, pour passer par le proxy local'
			],
			answer: 2,
			why: 'Les lignes 6 à 8 posent `new_uri.hostname = ip_address` et passent `uri.hostname` à côté. Le client se connecte à l’adresse qui a passé les contrôles, donc une deuxième réponse DNS ne peut pas envoyer la requête vers une IP interne.'
		},
		{
			q: 'Une URL de webhook passe tous les contrôles, mais son serveur répond `302 Location: http://169.254.169.254/latest/meta-data/`. Que doit faire le client HTTP ?',
			options: [
				'La refuser, ou refaire les mêmes contrôles sur la nouvelle URL',
				'La suivre, puisque la première URL a déjà passé tous les contrôles',
				'La suivre seulement si elle garde le même schéma, http ou https',
				'La suivre, puisque GitLab met toujours les réponses 302 en cache'
			],
			answer: 0,
			why: 'Les contrôles ne couvraient que la première URL. Le guide de code sécurisé de GitLab : « Disable redirects or validate the redirect destination ». La fiche OWASP demande aussi de couper le suivi des redirections dans le client web.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Écris un petit filtre d’URL qui vérifie les adresses résolues, comme `UrlBlocker`, et lance-le sur les genres d’URL de l’exercice. Il n’envoie aucune requête.',
		steps: [
			'Crée un dossier : `mkdir -p ~/ssrf-lab && cd ~/ssrf-lab`.',
			'Écris `blocker.py` avec `check(url)` : prends le nom d’hôte avec `urlsplit`, refuse `169.254.169.254` écrit en clair avant le DNS, résous le reste avec `socket.getaddrinfo`, et refuse si une adresse est loopback, link-local ou privée (`10.0.0.0/8`, `172.16.0.0/12` ou `192.168.0.0/16`). Sinon, renvoie l’adresse où se connecter. Affiche `check(u)` pour chaque URL de `sys.argv[1:]`.',
			'Lance-le sur des IP en clair : `python3 blocker.py http://127.0.0.1:6379/ http://169.254.169.254/latest/meta-data/ http://169.254.170.2/ http://10.0.0.5/ "http://[::1]/" https://1.1.1.1/hook`.',
			'Lance-le sur un nom qui ne dit rien de son adresse : `python3 blocker.py http://localhost:6379/`.',
			'Casse-le exprès : fais porter le test loopback sur le seul texte du nom (`host == "127.0.0.1"`), et relance l’étape 4.'
		],
		done: [
			'L’étape 3 refuse les cinq premières URL, chacune avec sa raison, et accepte `https://1.1.1.1/hook`.',
			'`http://169.254.169.254/...` est refusée comme métadonnées cloud, et `http://169.254.170.2/` comme link-local.',
			'L’étape 4 refuse `localhost` comme loopback, d’après l’adresse renvoyée par le DNS.',
			'Après l’étape 5, `http://localhost:6379/` est acceptée.'
		],
		solution: [
			'`ips = {ipaddress.ip_address(a[4][0]) for a in socket.getaddrinfo(host, None)}`, puis pour chaque `ip` : `if ip.is_loopback`, `if ip.is_link_local` et `if any(ip in ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))`, chacun renvoyant un refus. Évite `ip.is_private` pour le dernier test : Python compte aussi le loopback comme privé, et l’étape 5 refuserait encore `localhost`.',
			'Refuser dès qu’une adresse correspond, c’est le même choix que le `any?` de GitLab : le client peut se connecter à l’une ou l’autre.',
			'L’étape 5 montre pourquoi les contrôles tournent après le DNS : un nom n’est pas une adresse. Un vrai client doit aussi se connecter à l’IP vérifiée, comme `dns_rebind_protection`, et revérifier chaque redirection. Nettoie avec `rm -rf ~/ssrf-lab`.'
		]
	},
	recall: {
		q: 'Quelles trois familles d’adresses `UrlBlocker#validate_local_request` refuse-t-il par défaut pour les webhooks, et quelle est l’IP des métadonnées ?',
		a: 'Loopback (`127.0.0.1`, `::1`), réseaux privés (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) et link-local `169.254.0.0/16`, qui contient l’IP des métadonnées `169.254.169.254`.'
	},
	sources: [
		{ title: 'Fiche CVE de GitLab, CVE-2021-22214', url: CVE },
		{ title: 'Code GitLab (miroir GitHub), url_blocker.rb', url: BLOCKER },
		{ title: 'Doc GitLab, Webhooks and insecure internal web services', url: 'https://docs.gitlab.com/security/webhooks/' },
		{ title: 'Doc GitLab, Secure coding guidelines for Ruby : SSRF', url: 'https://docs.gitlab.com/development/secure_coding_guidelines/ruby/' },
		{ title: 'OWASP Server-Side Request Forgery Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html' },
		{ title: 'Doc AWS, Use the Instance Metadata Service to access instance metadata', url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html' }
	]
};
