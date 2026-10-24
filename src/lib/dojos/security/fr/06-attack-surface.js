const SB = 'https://github.com/spring-projects/spring-boot/blob/e9644b19f559db8ad4825526c245ab5a5cb40909/module/spring-boot-actuator-autoconfigure/src/main/java/org/springframework/boot/actuate/autoconfigure/endpoint';
const FILTER = `${SB}/expose/IncludeExcludeEndpointFilter.java`;
const EXPOSURE = `${SB}/expose/EndpointExposure.java`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'attack-surface',
	part: 'Les menaces',
	title: 'La surface d’attaque : ce qu’un attaquant peut atteindre',
	minutes: 10,
	hook: [
		'Le 1er mars 2022, Spring publie la CVE-2022-22947 pour Spring Cloud Gateway. Avec une requête forgée, un attaquant à distance exécute du code sur la machine. Le NVD lui donne 10.0, la note maximale. Le 16 mai 2022, la CISA l’ajoute à son catalogue des failles exploitées en conditions réelles.',
		'L’avis pose une seule condition. Les applis sont vulnérables "when the Gateway Actuator endpoint is enabled, exposed and unsecured", soit quand l’endpoint actuator du gateway est activé, exposé et sans protection. Un gateway avec cet endpoint coupé tournait sur le même jar vulnérable, et cette condition ne le concernait pas.'
	],
	terms: [
		{ term: 'Surface d’attaque', def: 'Pour l’OWASP : "all of the different points where an attacker could get into a system, and where they could get data out", tous les points par où un attaquant entre ou sort des données. Ports, URL, fichiers reçus, files de messages, et le code derrière chacun.' },
		{ term: 'Socket en écoute', def: 'Un port qu’un processus a ouvert pour accepter des connexions. `ss -tlnp` liste ceux en TCP avec l’adresse et le processus. `0.0.0.0` veut dire toutes les interfaces réseau, `127.0.0.1` cette machine seulement.' },
		{ term: 'Endpoint actuator', def: 'Une URL Spring Boot sous `/actuator` pour l’exploitation : `health`, `env`, `threaddump`, `heapdump`, et `gateway` dans Spring Cloud Gateway.' },
		{ term: 'Exposition', def: 'Le réglage Spring Boot `management.endpoints.web.exposure.include` : la liste des ids d’endpoints qui répondent en HTTP. Sa valeur par défaut est `health`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['scan["Scanner sur internet"] --> port["Machine du gateway : 0.0.0.0:8080 ouvert"]'],
				highlight: ['scan', 'port'],
				note: 'Le gateway écoute sur `0.0.0.0:8080` : toutes les interfaces réseau acceptent des connexions. Quiconque peut envoyer un paquet à la machine parle au port 8080. Un port lié à `127.0.0.1` n’accepterait que les connexions venues de la même machine.'
			},
			{
				add: ['port --> act["GET /actuator/gateway/routes répond"]'],
				highlight: ['act'],
				note: 'Quelqu’un a mis `management.endpoints.web.exposure.include=gateway`. La doc du gateway liste ce que propose cet endpoint : `POST /actuator/gateway/routes/{id}` crée une route et `POST /actuator/gateway/refresh` l’applique. Sans authentification, un inconnu peut appeler les deux.'
			},
			{
				add: ['act -->|"requête forgée"| rce["Du code tourne sur la machine : CVE-2022-22947"]'],
				highlight: ['rce'],
				note: 'Sur Spring Cloud Gateway 3.1.0, et 3.0.6 ou plus ancien, une requête forgée vers cet endpoint exécute du code sur la machine. Le correctif arrive en 3.1.1 et 3.0.7. L’avis cite cet endpoint comme condition de l’attaque.'
			},
			{
				add: ['cut["exposure.include=health, la valeur par défaut"] -.->|"endpoint gateway non mappé"| act', 'mgmt["management.server.address=127.0.0.1"] -.->|"pas de connexion distante"| port'],
				highlight: ['cut', 'mgmt'],
				note: 'Deux coupures cassent le chemin. Avec la liste par défaut, Spring Boot ne mappe jamais `/actuator/gateway`. Avec `management.server.port=8081` et `management.server.address=127.0.0.1`, la doc dit que l’appli "does not allow remote management connections". Le repli proposé par l’avis : `management.endpoint.gateway.enabled: false`.'
			}
		]
	},
	example: {
		title: 'IncludeExcludeEndpointFilter.java : quels endpoints actuator Spring Boot expose',
		repo: 'spring-projects/spring-boot',
		url: `${FILTER}#L113-L169`,
		lang: 'java',
		code: `	public final boolean match(EndpointId endpointId) {
		return isIncluded(endpointId) && !isExcluded(endpointId);
	}

	private boolean isIncluded(EndpointId endpointId) {
		if (this.include.isEmpty()) {
			return this.defaultIncludes.matches(endpointId);
		}
		return this.include.matches(endpointId);
	}

	private boolean isExcluded(EndpointId endpointId) {
		if (this.exclude.isEmpty()) {
			return false;
		}
		return this.exclude.matches(endpointId);
	}
…
		EndpointPatterns(@Nullable Collection<String> patterns) {
			patterns = (patterns != null) ? patterns : Collections.emptySet();
			boolean matchesAll = false;
			Set<EndpointId> endpointIds = new LinkedHashSet<>();
			for (String pattern : patterns) {
				if ("*".equals(pattern)) {
					matchesAll = true;
				}
				else {
					endpointIds.add(EndpointId.fromPropertyValue(pattern));
				}
			}
			this.empty = patterns.isEmpty();
			this.matchesAll = matchesAll;
			this.endpointIds = endpointIds;
		}

		boolean isEmpty() {
			return this.empty;
		}

		boolean matches(EndpointId endpointId) {
			return this.matchesAll || this.endpointIds.contains(endpointId);
		}`,
		notes: [
			'La liste par défaut tient en un id. Dans [`EndpointExposure.java`](' + EXPOSURE + '#L18-L23), l’exposition web vaut `WEB("health")`, et `WebEndpointAutoConfiguration` la passe en `defaultIncludes` (lignes 135 à 138). Une appli sans réglage d’exposition ne répond que sur `/actuator/health`.',
			'`isIncluded` ne revient à la valeur par défaut que si ta liste include est vide. Mets `include=gateway` : la liste ne contient plus que `gateway`, et `health` ne répond plus tant que tu ne l’ajoutes pas.',
			'La ligne `"*".equals(pattern)` passe `matchesAll` à vrai. Un seul caractère dans `application.properties` expose alors tous les endpoints de l’appli. `match` renvoie `isIncluded && !isExcluded` : un id présent dans `exclude` reste coupé, même avec `*`.',
			'Spring Boot contrôle aussi l’accès de chaque endpoint. La doc : "By default, access to all endpoints except for shutdown and heapdump is unrestricted." La doc actuelle de Spring Cloud Gateway précise que l’endpoint `gateway` "has its access disabled by default".'
		]
	},
	tradeoff: {
		gain: [
			'Avec `exposure.include=health`, l’endpoint gateway n’a pas d’URL : un bug dans son code ne peut pas être atteint en HTTP, quelle que soit la version.',
			'Moins de points d’entrée, c’est moins de cas à tester. L’OWASP propose de les compter par type (interfaces d’admin, API, fichiers reçus) pour chiffrer la revue.',
			'Lier le port de management à `127.0.0.1` garde `/actuator` hors du réseau, même si quelqu’un ajoute `*` à la liste plus tard.'
		],
		cost: [
			'Les outils d’exploitation perdent des données : Prometheus ne peut pas lire `/actuator/prometheus` tant que personne n’ajoute `prometheus` à la liste.',
			'Un port de management 8081 séparé demande son propre routage. Sur Cloud Foundry, la doc précise que les applis reçoivent les requêtes "only on port 8080" par défaut.',
			'Chaque nouvelle dépendance, route ou port modifie la liste, et l’OWASP écrit qu’un tel changement "should trigger threat modeling".'
		]
	},
	task: {
		prompt: 'Un serveur affiche ceci pour `ss -tlnp` : `0.0.0.0:22 sshd`, `0.0.0.0:8080 java`, `0.0.0.0:6379 redis-server`, `127.0.0.1:5432 postgres`. L’appli Java a `management.endpoints.web.exposure.include=*`. Seul le port 8080 doit servir les utilisateurs. Note ce qu’une autre machine peut atteindre, et le changement qui retire chaque élément en trop.',
		hint: 'Lis d’abord la colonne des adresses : quelles lignes disent `0.0.0.0` ? Ensuite, quels ids actuator `*` active-t-il ?',
		answer: [
			'Accessibles depuis une autre machine : 22 (SSH), 8080 (l’appli) et 6379 (Redis), car les trois écoutent sur `0.0.0.0`. PostgreSQL sur `127.0.0.1:5432` n’accepte que les connexions locales.',
			'Redis : mets `bind 127.0.0.1` dans `redis.conf`, ou bloque 6379 au pare-feu. SSH : n’autorise le port 22 que depuis ton réseau d’admin.',
			'Actuator : `*` active `matchesAll`, donc `env`, `beans`, `mappings`, `threaddump` et tous les autres endpoints en accès libre répondent sur 8080. Remplace par `include=health`, ou déplace le management sur `management.server.port=8081` avec `management.server.address=127.0.0.1`.',
			'Vérifie : `ss -tlnp` montre 6379 sur `127.0.0.1`, et `curl http://host:8080/actuator/env` lancé d’une autre machine ne renvoie plus l’endpoint.'
		],
		steps: [
			{
				title: 'Lis la colonne des adresses',
				questions: [
					{ q: 'Dans chaque ligne de `ss -tlnp`, quelle partie dit qui peut se connecter ?', options: ['Le nom du processus, comme `redis-server`', 'L’adresse devant le port', 'L’ordre des lignes', 'Le numéro de port seul'], answer: 1, why: 'L’adresse à laquelle le socket est attaché décide quelles interfaces acceptent les connexions. Le port et le nom du processus ne disent rien de qui peut l’atteindre.' },
					{ q: 'Quels ports une autre machine peut-elle atteindre ?', options: ['Seulement 8080', '8080 et 5432', 'Les quatre', '22, 8080 et 6379'], answer: 3, why: 'Ces trois-là écoutent sur `0.0.0.0`. PostgreSQL sur `127.0.0.1` n’accepte que les connexions locales.' },
					{ q: 'L’appli Java de ce même serveur se connecte à `127.0.0.1:5432`. Ça marche ?', options: ['Non : 5432 n’est pas sur `0.0.0.0`', 'Seulement avec une règle de pare-feu en plus', 'Oui : un processus de la même machine peut passer par le loopback', 'Seulement si l’appli tourne en root'], answer: 2, why: '`127.0.0.1` accepte les connexions des processus de cette machine. L’appli garde sa base, et les autres machines ne l’atteignent toujours pas.' },
					{ q: 'Seul 8080 doit servir les utilisateurs. Quels éléments accessibles sont en trop ?', options: ['Redis sur 6379, et SSH hors de tes admins', 'Seulement PostgreSQL', 'Seulement SSH', 'Rien : chaque port est utile'], answer: 0, why: 'Les utilisateurs ont besoin de 8080. Redis n’a aucune raison d’être accessible, et SSH seulement depuis ton réseau d’admin.' }
				]
			},
			{
				title: 'Coupe les ports en trop',
				questions: [
					{ q: 'Quel changement retire Redis du réseau ?', options: ['Le passer sur le port 16379', 'Mettre `protected-mode no`', '`bind 127.0.0.1` dans `redis.conf`', 'Renommer le processus `redis-server`'], answer: 2, why: 'Attaché au loopback, il n’accepte que les clients locaux. Bloquer 6379 au pare-feu marche aussi.' },
					{ q: 'Que fais-tu de SSH sur le port 22 ?', options: ['Ne l’autoriser que depuis ton réseau d’admin', 'Le fermer et perdre l’accès à distance', 'Le passer sur le port 2222 et le laisser ouvert', 'Le laisser, puisque SSH a un mot de passe'], answer: 0, why: 'Les admins en ont encore besoin. Limiter qui peut l’atteindre réduit la surface sans perdre l’accès.' },
					{ q: 'Pourquoi changer un service de port ne réduit-il pas la surface ?', options: ['Les scanners ne testent que les petits ports', 'Il répond toujours à quiconque atteint le nouveau port', 'Les ports au-dessus de 1024 sont privés', 'Ça la réduit, de moitié'], answer: 1, why: 'Le service répond toujours à quiconque peut lui envoyer un paquet. Seul le numéro a changé.' },
					{ q: 'Que compte l’OWASP dans la surface d’attaque ?', options: ['Seulement les ports TCP ouverts', 'Seulement les URL publiques du site', 'Seulement le code avec une CVE connue', 'Chaque point par où un attaquant entre ou sort des données'], answer: 3, why: 'L’OWASP : « all of the different points where an attacker could get into a system, and where they could get data out ».' }
				]
			},
			{
				title: 'Coupe l’actuator',
				questions: [
					{ q: 'Que fait `exposure.include=*` ?', options: ['Il active `matchesAll`, donc chaque endpoint répond', 'Il n’expose que `health` et `info`', 'Il n’expose rien tant que tu ne listes pas d’ids', 'Il n’expose que les endpoints en lecture seule'], answer: 0, why: 'La ligne `"*".equals(pattern)` active `matchesAll`. Un seul caractère expose tous les endpoints de l’appli.' },
					{ q: 'Quels endpoints répondent alors sur 8080 ?', options: ['Seulement `health`', 'Seulement `shutdown` et `heapdump`', '`env`, `beans`, `threaddump` et tous les autres en accès libre', 'Seulement ceux listés dans `exclude`'], answer: 2, why: 'Par défaut, tous les endpoints sauf `shutdown` et `heapdump` sont en accès libre, donc `*` les met tous sur le port des utilisateurs.' },
					{ q: 'Le monitoring a besoin de métriques, donc tu mets `include=health,prometheus`. `/actuator/env` répond-il encore sur 8080 ?', options: ['Oui : `env` est toujours exposé', 'Oui, jusqu’à deux redémarrages de l’appli', 'Seulement pour les requêtes GET', 'Non : seuls `health` et `prometheus` sont exposés'], answer: 3, why: 'Avec une liste non vide, `isIncluded` ne retient que les ids qu’elle contient. Tous les autres endpoints, `env` compris, n’ont pas d’URL.' },
					{ q: 'Quel autre montage garde `/actuator` hors du réseau ?', options: ['`management.server.port=8080` sur toutes les interfaces', '`management.server.port=8081` avec `management.server.address=127.0.0.1`', 'Une seconde copie de l’appli sur le port 8080', '`management.endpoints.web.base-path=/hidden`'], answer: 1, why: 'La doc dit que l’appli « does not allow remote management connections ». Même un `*` ajouté plus tard reste hors du réseau.' }
				]
			},
			{
				title: 'Vérifie à nouveau',
				questions: [
					{ q: 'Quelle sortie montre que le correctif de Redis a marché ?', options: ['`ss -tlnp` montre 6379 sur `0.0.0.0`', 'Redis répond `PONG` depuis une autre machine', '`redis-cli ping` échoue sur le serveur', '`ss -tlnp` montre 6379 sur `127.0.0.1`'], answer: 3, why: 'La colonne des adresses est la preuve : loopback seulement.' },
					{ q: 'Comment testes-tu le changement de l’actuator ?', options: ['`curl localhost:8080/actuator/env` sur le serveur', '`curl http://host:8080/actuator/env` depuis une autre machine', 'En relisant `application.properties`', 'En redémarrant l’appli et en lisant son journal'], answer: 1, why: 'Teste depuis la place de l’attaquant. L’endpoint ne doit plus revenir.' },
					{ q: 'Après les correctifs, que peut atteindre une autre machine ?', options: ['8080 pour les utilisateurs, et 22 depuis le réseau d’admin', '8080, plus Redis en lecture seule', '8080, 6379 et 5432', 'Plus rien du tout'], answer: 0, why: 'Redis et l’actuator sont hors du réseau, et SSH est limité à tes admins.' },
					{ q: 'Un collègue ouvre plus tard un nouveau port. Que doit déclencher ce changement selon l’OWASP ?', options: ['Rien, si le port est au-dessus de 1024', 'Une nouvelle note CVSS', 'Une modélisation des menaces', 'Un redémarrage de chaque service'], answer: 2, why: 'Chaque nouvelle route, dépendance ou port change la liste, et l’OWASP dit qu’un tel changement « should trigger threat modeling ».' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`ss -tlnp` affiche `0.0.0.0:6379 redis-server` et `127.0.0.1:5432 postgres`. Auquel une autre machine du réseau peut-elle se connecter ?',
			options: [
				'Seulement PostgreSQL, car 127.0.0.1 est l’adresse publique du serveur',
				'Seulement Redis, car 0.0.0.0 désigne toutes les interfaces du serveur',
				'Aucun des deux, car ces deux adresses sont réservées au trafic local',
				'Les deux, car `ss -tlnp` ne liste que les ports ouverts à distance'
			],
			answer: 1,
			why: 'Un socket lié à `0.0.0.0` accepte les connexions sur toutes les interfaces, y compris l’interface externe. `127.0.0.1` est l’adresse de loopback : seuls les processus de la même machine joignent PostgreSQL à cette adresse.'
		},
		{
			q: 'Une appli Spring Boot a la dépendance actuator et aucun réglage `management.endpoints.web.exposure.include`. Quels endpoints actuator répondent en HTTP ?',
			options: [
				'Tous, sauf `shutdown` et `heapdump`',
				'`health` et `info`, les deux en lecture seule',
				'Seulement `health`',
				'Aucun, tant que le réglage est absent'
			],
			answer: 2,
			why: '`EndpointExposure.WEB` a pour valeur par défaut `"health"`. Avec une liste include vide, `isIncluded` revient à cette valeur, donc `health` est le seul endpoint mappé en HTTP.'
		},
		{
			q: 'Tu fais tourner Spring Cloud Gateway 3.1.0 et tu ne peux pas mettre à jour aujourd’hui. Que te dit l’avis CVE-2022-22947 ?',
			options: [
				'Mettre `management.endpoint.gateway.enabled: false`, ou protéger l’actuator avec Spring Security',
				'Passer le gateway du port 8080 au port 8443 pour que les scanners l’ignorent',
				'Ajouter `gateway` à `management.endpoints.web.exposure.exclude` et garder `include=*`',
				'Couper l’endpoint `health`, que les scanners utilisent pour trouver les gateways'
			],
			answer: 0,
			why: 'L’avis exige un endpoint actuator du gateway "enabled, exposed and unsecured". Le désactiver, ou mettre une authentification devant, supprime ce chemin. L’option `exclude` masquerait aussi l’endpoint, mais l’avis ne la propose pas, et `*` expose toujours tout le reste.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Ouvre deux sockets d’écoute, l’un sur toutes les interfaces et l’autre sur le loopback, et vois lequel le réseau peut atteindre.',
		steps: [
			'Crée un dossier et lance deux serveurs web : `mkdir -p ~/surface-lab && cd ~/surface-lab`, puis `python3 -m http.server 8001 --bind 0.0.0.0 &` et `python3 -m http.server 8002 --bind 127.0.0.1 &`.',
			'Liste les sockets d’écoute. Linux : `ss -tln | grep 800`. macOS : `lsof -nP -iTCP -sTCP:LISTEN | grep 800`.',
			'Trouve ton adresse sur le réseau local : `hostname -I` sous Linux, `ipconfig getifaddr en0` sous macOS. Appelle les deux ports par elle : `curl -s -o /dev/null -w "%{http_code}\\n" http://<ton-ip>:8001/`, puis pareil pour `8002`.',
			'Liste tout ce que ton portable écoute : `ss -tlnp` (Linux) ou `lsof -nP -iTCP -sTCP:LISTEN` (macOS). Marque chaque ligne sur `0.0.0.0`, `*` ou `[::]` comme accessible depuis le réseau.',
			'Arrête les deux serveurs : `kill %1 %2`.'
		],
		done: [
			'La liste montre `0.0.0.0:8001` (`*:8001` dans lsof) et `127.0.0.1:8002`.',
			'Par ton adresse locale, 8001 renvoie `200` et 8002 renvoie `000` : la connexion est refusée.',
			'Tu as la liste des sockets de ton propre portable qui écoutent sur toutes les interfaces.'
		],
		solution: [
			'L’adresse d’attache décide qui peut se connecter. `0.0.0.0` accepte sur toutes les interfaces, `127.0.0.1` seulement depuis la même machine.',
			'Une requête vers l’adresse locale arrive sur l’interface externe, où rien n’écoute sur 8002. C’est pour ça qu’elle est refusée.',
			'Le correctif de Redis dans l’exercice suit le même geste : `bind 127.0.0.1` dans `redis.conf`, après quoi `ss -tlnp` montre `127.0.0.1:6379`.'
		]
	},
	recall: {
		q: 'À quelle condition une appli Spring Cloud Gateway 3.1.0 était-elle exposée à la CVE-2022-22947, et qu’expose Spring Boot en HTTP par défaut ?',
		a: 'Quand l’endpoint actuator du gateway était activé, exposé et sans protection. Par défaut, Spring Boot n’expose que `health` en HTTP.'
	},
	sources: [
		{ title: 'Avis Spring CVE-2022-22947, injection de code dans Spring Cloud Gateway', url: 'https://spring.io/security/cve-2022-22947' },
		{ title: 'NVD, CVE-2022-22947', url: 'https://nvd.nist.gov/vuln/detail/CVE-2022-22947' },
		{ title: 'Doc Spring Boot, endpoints Actuator', url: 'https://docs.spring.io/spring-boot/reference/actuator/endpoints.html' },
		{ title: 'Doc Spring Boot, supervision et gestion en HTTP', url: 'https://docs.spring.io/spring-boot/reference/actuator/monitoring.html' },
		{ title: 'Doc Spring Cloud Gateway, API Actuator', url: 'https://docs.spring.io/spring-cloud-gateway/reference/spring-cloud-gateway-server-webflux/actuator-api.html' },
		{ title: 'OWASP, Attack Surface Analysis Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Attack_Surface_Analysis_Cheat_Sheet.html' },
		{ title: 'Page de manuel ss(8)', url: 'https://man7.org/linux/man-pages/man8/ss.8.html' }
	]
};
