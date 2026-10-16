const REPO = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const RAILS = 'https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146';
const SSRF = `${REPO}/lib/final_destination/ssrf_detector.rb`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'threat-modeling',
	part: 'Fait pour durer',
	title: 'Modélisation des menaces',
	minutes: 10,
	hook: [
		'Ta boutique ajoute une petite fonctionnalité : un vendeur colle l’URL d’une image, et **ton serveur télécharge l’image** pour la fiche produit. Elle sort en une journée. Discourse a la même forme : quand quelqu’un colle un lien dans un message, son serveur peut récupérer la page pour construire un aperçu (un onebox).',
		'Alors, qu’est-ce qui empêche un vendeur de coller `http://169.254.169.254/` (l’adresse des métadonnées du cloud) ou `http://10.0.0.5/admin`, et de faire **récupérer ça par ton serveur depuis l’intérieur de ton réseau** ? Ou un fichier de 5 Go, mille fois ? Lire le code ligne par ligne ne te le dira pas, parce que tu ne sais pas encore quelles questions poser. Il te faut un dessin des endroits où des données externes entrent dans ton système, et une courte liste de questions à poser à chaque entrée.',
		'Un **threat model** (modèle de menaces) te donne les deux. Le Threat Modeling Manifesto le résume en quatre questions : « Sur quoi travaillons-nous ? Qu’est-ce qui peut mal tourner ? Qu’allons-nous faire ? Avons-nous fait du bon travail ? » Au jour 3, tu as écrit « sécurisé » sous forme de scénarios testables, et le threat model te dit quels scénarios écrire.'
	],
	terms: [
		{ term: 'Diagramme de flux de données', def: 'Des boîtes pour les processus et les stockages, des flèches pour les données, les parties externes dessinées à part. La carte sur laquelle se fait un threat model.' },
		{ term: 'Trust boundary (frontière de confiance)', def: 'Une ligne sur cette carte où les données passent de quelqu’un à qui tu fais moins confiance à quelqu’un à qui tu fais plus confiance, ou l’inverse. Chaque flèche qui en traverse une est un endroit à examiner.' },
		{ term: 'STRIDE', def: 'Six types de menaces à examiner à chaque passage : Spoofing (usurpation), Tampering (altération), Repudiation (répudiation), Information disclosure (fuite d’information), Denial of service (déni de service), Elevation of privilege (élévation de privilèges).' },
		{ term: 'SSRF', def: 'Server-side request forgery. L’attaquant fait récupérer une URL par ton serveur à sa place, et atteint ainsi ce que seul ton serveur peut atteindre.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['subgraph ours["Frontière de confiance : ce que nous faisons tourner"]', 'lb["Load balancer"]', 'app["Appli boutique"]', 'end', 'seller(["Navigateur du vendeur"]) -->|"POST image_url"| lb', 'lb --> app'],
				highlight: ['seller', 'lb', 'app'],
				note: 'Pour la première question, sur quoi travaillons-nous, dessine le flux de données, puis la ligne autour de ce que tu fais tourner. Le navigateur est dehors : tout ce qu’il envoie, en-tête, cookie ou URL, peut être falsifié. Chaque flèche qui **traverse la ligne** reçoit les six questions STRIDE.'
			},
			{
				add: ['lb -->|"X-Forwarded-For : adresse du client"| app'],
				highlight: ['lb'],
				note: 'Un vendeur peut usurper son adresse (spoofing). La limite de débit compte les requêtes par adresse client, et l’adresse vient de l’en-tête `X-Forwarded-For`, qu’un vendeur peut envoyer lui aussi. L’appli doit faire confiance à cet en-tête **seulement s’il vient du load balancer**, sinon n’importe qui choisit l’adresse sous laquelle il est compté.'
			},
			{
				add: ['app -->|"GET image_url"| img["Hébergeur d’images sur internet"]', 'app -.->|"bloqué : adresse privée"| internal["10.0.0.5 ou 169.254.169.254"]', 'class img ext'],
				highlight: ['img', 'internal'],
				note: 'La SSRF est une elevation of privilege : l’URL vient de dehors, mais la requête part de l’intérieur. Résous le nom d’hôte, écarte chaque adresse privée ou réservée, et **connecte-toi seulement aux adresses qui ont passé le filtre**. Discourse fait exactement ça pour ses aperçus de liens.'
			},
			{
				add: ['img -->|"octets, redirections"| app'],
				highlight: ['img'],
				note: 'Au retour, l’hébergeur d’images peut provoquer un denial of service ou un tampering. Plafonne la taille, le temps et le nombre de redirections, et revérifie la cible de chaque redirection. Vérifie que les octets sont bien une image, quoi que dise le `Content-Type`.'
			},
			{
				add: ['app --> logs[("Journal d’audit : vendeur, produit, hôte de l’URL")]'],
				highlight: ['logs'],
				note: 'Contre la repudiation, journalise quel vendeur a demandé quel hôte, pour pouvoir répondre à « qui nous a fait récupérer ça ? ». Contre l’information disclosure, ne renvoie pas le corps de l’erreur de récupération au vendeur : il peut contenir une page interne. **Écris chaque choix**, y compris ce que tu as décidé de ne pas faire.'
			}
		]
	},
	example: {
		title: 'lib/final_destination/ssrf_detector.rb : chaque requête sortante vérifie où elle arrive',
		repo: 'discourse/discourse',
		url: `${SSRF}#L85-L108`,
		lang: 'ruby',
		code: `    def self.ip_allowed?(ip)
      ip = ip.is_a?(IPAddr) ? ip : IPAddr.new(ip)
      ip = ip.native

      return false if ip_in_ranges?(ip, blocked_ip_blocks) || ip_in_ranges?(ip, PRIVATE_IP_RANGES)

      true
    end

    def self.lookup_and_filter_ips(name, timeout: nil)
      begin
        ips = lookup_ips(name, timeout: timeout)
      rescue SocketError
        raise LookupFailedError, "FinalDestination: lookup failed"
      end

      return ips if host_bypasses_checks?(name)

      ips.filter! { |ip| FinalDestination::SSRFDetector.ip_allowed?(ip) }

      raise DisallowedIpError, "FinalDestination: all resolved IPs were disallowed" if ips.empty?

      ips
    end`,
		notes: [
			'La ligne 5 refuse toute adresse de `blocked_ip_blocks` ou de `PRIVATE_IP_RANGES`. `PRIVATE_IP_RANGES` est construit à partir des [registres d’adresses à usage spécial de l’IANA](' + SSRF + '#L11-L51), IPv4 et IPv6 : loopback, privées, link-local (qui contient l’adresse des métadonnées du cloud), plages de documentation. Un admin peut ajouter des plages avec le réglage `blocked_ip_blocks`. Si aucune adresse résolue ne passe, la ligne 21 lève `DisallowedIpError`, et rien n’est récupéré.',
			'[`FinalDestination::HTTP#connect`](' + REPO + '/lib/final_destination/http.rb#L8-L34) filtre les adresses, puis passe **ces adresses-là** à la couche socket, via le Connector. La vérification et la connexion utilisent la même réponse DNS.',
			'Contre le denial of service, la même classe garde au plus cinq adresses IPv4 et cinq IPv6, [`MAX_ADDRESSES_PER_FAMILY = 5`](' + REPO + '/lib/final_destination/http.rb#L4-L6) : « Limit the total to avoid DoS via a high-ip-count DNS response. » (limiter le total pour éviter un DoS via une réponse DNS avec beaucoup d’IP). `FinalDestination` suit au plus 5 redirections par défaut, et les aperçus de liens peuvent être réglés pour n’en suivre aucune.',
			'[`allowed_internal_hosts`](' + SSRF + '#L64-L83) saute les vérifications pour le CDN du site, son URL de base et tout hôte listé par un admin. Discourse note ce risque accepté dans un réglage, pour qu’un relecteur puisse le lire dans la config.',
			'Le [`RemoteIp`](' + RAILS + '/actionpack/lib/action_dispatch/middleware/remote_ip.rb#L8-L32) de Rails a le problème du spoofing une couche plus bas. Il choisit « the last-set address that is not on the list of trusted IPs » (la dernière adresse définie qui n’est pas dans la liste des IP de confiance), et prévient en majuscules : « IF YOU DON’T USE A PROXY, THIS MAKES YOU VULNERABLE TO IP SPOOFING. » Tu ne peux croire qu’un en-tête posé par ton propre proxy.'
		]
	},
	tradeoff: {
		gain: [
			'Tu poses les questions STRIDE aux quelques flèches qui traversent une frontière, au lieu de relire chaque ligne de code.',
			'Tu trouves les menaces quand elles ne sont qu’une boîte sur un tableau blanc, et la correction est alors un changement de conception plutôt qu’un hotfix.',
			'Les risques acceptés, comme `allowed_internal_hosts`, sont écrits avec leur raison, et le prochain relecteur ne les signale pas comme des bugs.',
			'Chaque mitigation te donne un test que tu peux nommer : « une URL qui se résout en 10.0.0.5 n’est jamais récupérée ».'
		],
		cost: [
			'Le modèle prend du temps et se périme : une nouvelle route ou une nouvelle file est un nouveau passage auquel personne n’a posé les questions STRIDE.',
			'Quelqu’un doit encore classer les menaces par impact et par probabilité avant que quiconque les corrige.',
			'Un relecteur peut s’arrêter aux lettres évidentes (spoofing, tampering) et sauter repudiation et denial of service.',
			'Bloquer une plage privée peut aussi bloquer un hôte interne légitime, donc Discourse a aussi besoin d’une liste d’autorisation.'
		]
	},
	task: {
		prompt: 'Ton système de tickets ajoute des webhooks : un client enregistre une URL, et ton serveur y envoie un POST pour chaque nouveau ticket. Dessine-le (admin du client, ton API, un worker, l’endpoint du client) et marque les frontières de confiance. Puis écris une menace par lettre de STRIDE et ce que tu fais contre elle. Si tu ne trouves rien pour une lettre, écris « rien trouvé ».',
		hint: 'Il y a deux parties externes : l’admin qui enregistre l’URL, et l’endpoint qui reçoit le POST. Demande-toi qui contrôle quoi, et ce que le worker peut atteindre et pas eux.',
		answer: [
			'Frontières : entre l’admin du client et ton API, et entre ton worker et l’endpoint du client. Le worker est dans ton réseau, donc l’URL est une donnée externe qui pilote une requête interne.',
			'Spoofing : le destinataire ne peut pas distinguer ton POST d’un faux. Signe chaque corps avec un secret par client (un en-tête HMAC) pour qu’il puisse le vérifier. Tampering : la même signature, avec un horodatage dedans, pour qu’un vieux message ne puisse pas être rejoué.',
			'Elevation of privilege : l’URL, c’est une SSRF qui n’attend que de se produire. Résous-la, refuse les plages privées et réservées, connecte-toi seulement aux adresses vérifiées, et revérifie chaque redirection (ou n’en suis aucune).',
			'Denial of service : un endpoint lent ne doit pas bloquer la file. Des timeouts courts, un plafond de retries, et une file par client ou une limite par client. Information disclosure : n’envoie que les champs que le client a le droit de voir, et ne renvoie jamais tel quel le corps de la réponse de l’endpoint dans ton interface.',
			'Repudiation : garde un journal de livraison avec l’id du ticket, l’heure, le code de statut et qui a enregistré l’URL, pour que « on ne l’a jamais reçu » et « on ne l’a jamais demandé » aient tous les deux une réponse.'
		]
	},
	quiz: [
		{
			q: 'Tu as un diagramme de flux de données de ton système. Où poser les questions STRIDE en premier ?',
			options: [
				'Sur chaque flèche qui traverse une frontière de confiance',
				'Sur la boîte qui a le plus de lignes de code',
				'Sur la base de données, parce que c’est là que sont les données',
				'Sur les flèches entre tes propres services internes'
			],
			answer: 0,
			why: 'Les menaces entrent là où les données passent de mains moins fiables à des mains plus fiables. Les flèches internes comptent aussi, mais c’est aux passages qu’un externe contrôle l’entrée, donc ils passent en premier.'
		},
		{
			q: 'Un utilisateur de Discourse colle un lien dont l’hôte ne se résout qu’en `10.0.0.5`. Que fait `lookup_and_filter_ips` ?',
			options: [
				'Elle récupère la page, mais retire les cookies de la requête',
				'Elle écarte l’adresse et lève `DisallowedIpError`, donc rien n’est récupéré',
				'Elle relance la résolution avec un DNS public pour trouver une autre adresse',
				'Elle récupère la page, puisque l’utilisateur qui l’a collée est connecté'
			],
			answer: 1,
			why: '10.0.0.0/8 fait partie de `PRIVATE_IP_RANGES`. Une fois chaque adresse résolue écartée, la liste est vide et la méthode lève « all resolved IPs were disallowed ». La vérification ne regarde que les adresses résolues, donc être connecté ne change rien.'
		},
		{
			q: 'Le middleware `RemoteIp` de Rails tourne sur un serveur sans proxy devant. Un client envoie `X-Forwarded-For: 203.0.113.9`. Quel est le risque ?',
			options: [
				'Aucun : Rails ignore toujours l’en-tête quand il n’y a pas de proxy',
				'La requête est refusée, parce que l’en-tête vient d’un client',
				'Le serveur ne peut pas démarrer tant qu’une liste de proxys de confiance n’est pas configurée',
				'Le client peut se réclamer de n’importe quelle adresse, donc les limites par adresse peuvent être contournées'
			],
			answer: 3,
			why: 'Son propre commentaire le dit : sans proxy, « any client can claim to have any IP address by setting the `X-Forwarded-For` header » (n’importe quel client peut prétendre avoir n’importe quelle adresse IP). Sans proxy devant, c’est le client qui écrit cet en-tête.'
		}
	],
	recall: {
		q: 'Où poses-tu les six questions STRIDE sur le diagramme de flux de données, et que fait Discourse contre la SSRF ?',
		a: 'À chaque flèche qui traverse une frontière de confiance. Pour une URL collée, Discourse résout l’hôte, écarte les adresses privées et réservées comme 10.0.0.5, et ne se connecte qu’aux adresses qui ont passé le filtre.'
	},
	sources: [
		{ title: 'Discourse, lib/final_destination/connector.rb', url: `${REPO}/lib/final_destination/connector.rb#L3-L14` },
		{ title: 'Discourse, lib/final_destination.rb (redirect limit)', url: `${REPO}/lib/final_destination.rb#L52-L57` },
		{ title: 'Discourse, lib/oneboxer.rb (link preview redirects)', url: `${REPO}/lib/oneboxer.rb#L538-L552` },
		{ title: 'Threat Modeling Manifesto', url: 'https://www.threatmodelingmanifesto.org/' },
		{ title: 'OWASP, Threat Modeling Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html' },
		{ title: 'OWASP, Threat Modeling Process (STRIDE)', url: 'https://owasp.org/www-community/Threat_Modeling_Process' },
		{ title: 'Jim Gumbley, Threat Modeling Guide for Software Teams (martinfowler.com)', url: 'https://martinfowler.com/articles/agile-threat-modelling.html' },
		{ title: 'OWASP, SSRF Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html' }
	]
};
