const K8S = 'https://github.com/kubernetes/kubernetes/blob/53fa80f55b15df3612f84b4ca8add27af9361379';
const HELPER = `${K8S}/cluster/gce/gci/configure-helper.sh`;
const AUDIT_DOCS = 'https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/';
const AUDIT_API = 'https://kubernetes.io/docs/reference/config-api/apiserver-audit.v1/';
const OWASP = 'https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'audit-logs',
	part: 'En production',
	title: 'Des logs utiles après une intrusion',
	minutes: 10,
	hook: [
		'En août 2019, un audit de sécurité de Kubernetes trouve que kube-apiserver écrit les bearer tokens dans ses logs système en verbosité `--v 10`. La faille reçoit le numéro CVE-2019-11250. Le scénario d’attaque décrit Eve, qui a accès aux logs mais pas au cluster : elle rejoue le token d’Alice et le cluster la prend pour Alice.',
		'En octobre 2020, CVE-2020-8565 annonce que la correction était incomplète. À partir du niveau de log 9, « authorization and bearer tokens will be written to log files », dans les logs de l’API server comme dans la sortie de `kubectl`. Kubernetes 1.20.0, 1.19.6, 1.18.14 et 1.17.16 corrigent le problème.',
		'Après une intrusion, quelqu’un lit les logs pour savoir qui a fait quoi, et quand. Ces mêmes logs ne doivent donner aucun token valide à leur lecteur.'
	],
	terms: [
		{ term: 'Log d’audit', def: 'Un enregistrement des événements de sécurité dans l’ordre du temps : qui a agi, sur quoi, d’où, quand et avec quel résultat. Kubernetes en écrit un par requête API quand kube-apiserver reçoit une audit policy.' },
		{ term: 'Bearer token', def: 'Une chaîne qui prouve une connexion passée. Celui qui la détient est traité comme son propriétaire, sans autre vérification.' },
		{ term: 'Niveau d’audit', def: 'Ce que Kubernetes garde d’une requête : `None`, `Metadata` (utilisateur, heure, verbe, ressource), `Request` (plus le corps de la requête) ou `RequestResponse` (plus le corps de la réponse).' },
		{ term: 'Durée de conservation', def: 'Le temps pendant lequel on garde les logs. Pour l’OWASP, ils « must not be destroyed before the duration of the required data retention period, and must not be kept beyond this time » : ni avant la fin de cette durée, ni après.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["kubectl get secret db-password, en-tête Authorization: Bearer token"] --> api["kube-apiserver lancé avec --v=10"]'],
				highlight: ['req', 'api'],
				note: 'Alice lance `kubectl`, qui envoie son bearer token dans l’en-tête `Authorization`. L’API server tourne en verbosité 10, un niveau de debug prévu pour traquer des bugs.'
			},
			{
				add: ['api --> syslog[("Log système : en-têtes de la requête, token compris")]', 'eve["Eve : lit les logs, n’a pas de compte sur le cluster"] --> syslog'],
				highlight: ['syslog', 'eve'],
				note: 'À ce niveau, le serveur écrit les en-têtes de la requête dans son log système, token compris (CVE-2019-11250). Eve peut lire les fichiers de log, mais elle n’a aucun compte sur le cluster.'
			},
			{
				add: ['eve -->|"rejoue le token d’Alice"| api'],
				highlight: ['eve', 'api'],
				note: 'Eve copie le token et envoie ses propres requêtes avec. L’API server voit un token valide et attribue chaque requête à Alice. Rien dans la requête ne montre que quelqu’un d’autre l’a envoyée.'
			},
			{
				add: ['fix["Versions corrigées sans token ; verbosité basse en production"] -.->|"plus de token à copier"| syslog'],
				highlight: ['fix'],
				note: 'La défense commence par la ligne de log : jamais de token, de mot de passe ni d’id de session, quel que soit le niveau. L’avis CVE-2020-8565 ajoute : « Do not enable verbose logging in production, limit access to logs. »'
			},
			{
				add: ['api --> audit[("Log d’audit : user, sourceIPs, verb, objectRef, code de réponse")]', 'inv["Enquêteur : qui a lu db-password, depuis quelle IP, à quelle heure"] --> audit'],
				highlight: ['audit', 'inv'],
				note: 'Le log d’audit est un enregistrement à part : il garde les faits et laisse les secrets dehors. Pour un `get` sur un Secret au niveau `Metadata`, il note l’utilisateur, les IP sources, le verbe, l’objet et le code de réponse, sans aucun corps.'
			}
		]
	},
	example: {
		title: 'cluster/gce/gci/configure-helper.sh : l’audit policy que Kubernetes fournit pour GCE',
		repo: 'kubernetes/kubernetes',
		url: `${HELPER}#L1224-L1287`,
		lang: 'yaml',
		code: `  # Don't log these read-only URLs.
  - level: None
    nonResourceURLs:
      - /healthz*
      - /version
      - /swagger*

  # Don't log events requests because of performance impact.
  - level: None
    resources:
      - group: "" # core
        resources: ["events"]
…
  # Secrets, ConfigMaps, TokenRequest and TokenReviews can contain sensitive & binary data,
  # so only log at the Metadata level.
  - level: Metadata
    resources:
      - group: "" # core
        resources: ["secrets", "configmaps", "serviceaccounts/token"]
      - group: authentication.k8s.io
        resources: ["tokenreviews"]
    omitStages:
      - "RequestReceived"
  # Get responses can be large; skip them.
  - level: Request
    verbs: ["get", "list", "watch"]
    resources: \${known_apis}
    omitStages:
      - "RequestReceived"
  # Default level for known APIs
  - level: RequestResponse
    resources: \${known_apis}
    omitStages:
      - "RequestReceived"
  # Default level for all other requests.
  - level: Metadata
    omitStages:
      - "RequestReceived"`,
		notes: [
			'Kubernetes lit les règles de haut en bas. La [doc sur l’audit](' + AUDIT_DOCS + ') : « The first matching rule sets the _audit level_ of the event. » C’est pour ça que les règles `None` sur `/healthz*` et `events` sont en haut, et la règle `Metadata` qui attrape tout en dernier.',
			'La règle `Metadata` sur `secrets`, `serviceaccounts/token` et `tokenreviews` passe avant les règles `Request` et `RequestResponse`. Un `get` sur un Secret tombe d’abord sur elle : le log note qui a lu le Secret, jamais le corps de la réponse qui contient sa valeur.',
			'La règle `RequestResponse` garde les deux corps pour les écritures sur les API connues. Quand quelqu’un modifie un Deployment, l’événement montre le nouveau nom d’image et l’auteur du patch.',
			'`omitStages: RequestReceived` supprime l’événement écrit à l’arrivée de la requête. L’événement `ResponseComplete` garde le code de réponse. La [référence de l’Event](' + AUDIT_API + ') prévient pour `sourceIPs` : « All but the last IP can be arbitrarily set by the client. » Le client choisit toutes les IP sauf la dernière.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque événement donne l’utilisateur, le verbe, l’objet et les IP sources : un enquêteur peut lister chaque lecture de `db-password` sur les 30 derniers jours.',
			'Le niveau `Metadata` sur les Secrets note la lecture sans garder la valeur : celui qui lit le log d’audit n’y trouve aucun identifiant.',
			'Écarter `/healthz*` et `events` en haut de la policy retire du volume les requêtes les plus fréquentes et les moins risquées.'
		],
		cost: [
			'La doc : « The audit logging feature increases the memory consumption of the API server ». Avec `RequestResponse` sur chaque écriture, chaque événement porte les corps complets.',
			'En mode `batch` du webhook, des événements sont perdus quand le tampon de 10000 événements déborde. La métrique `apiserver_audit_error_total` compte ces pertes.',
			'Sans `--audit-policy-file`, « no events are logged » : aucun événement. Un cluster qui n’a jamais posé ce flag n’a rien à relire après une intrusion.',
			'`--audit-log-maxage` efface les vieux fichiers après un nombre de jours fixé. Une intrusion découverte après ce délai n’a plus de trace pour ses premières semaines.'
		]
	},
	task: {
		prompt: 'Voici cinq lignes du log d’une appli web. Pour chacune, décide : garder, modifier ou supprimer. Puis dis ce qui manque à une des lignes.\n\n```\n09:14:07 INFO  login ok user=alice ip=203.0.113.7\n09:14:07 DEBUG session created sid=9f2c4e1a7b3d\n09:15:42 INFO  POST /admin/users role=admin target=bob\n09:16:03 WARN  login failed user=bob password=Summer2026! ip=198.51.100.23\n09:17:30 INFO  GET /api/orders Authorization="Bearer eyJhbGciOi..."\n```',
		hint: 'Compare chaque valeur à la liste OWASP des données à garder hors des logs : ids de session, tokens d’accès, mots de passe. Puis vérifie que chaque événement dit quand, où, qui et quoi.',
		answer: [
			'Ligne 1 : garder. Une connexion réussie avec l’utilisateur et l’IP fait partie des événements que l’OWASP demande de toujours logger.',
			'Ligne 2 : modifier. Un id de session dans un log sert de mot de passe pour cette session. L’OWASP propose de le remplacer par un hash (« replacing with a hashed value ») si tu dois suivre une session d’un événement à l’autre.',
			'Ligne 4 : modifier. Garde l’échec de connexion, l’utilisateur et l’IP : des échecs répétés révèlent du credential stuffing. Retire `password=Summer2026!` : l’OWASP range les mots de passe parmi les valeurs à garder hors des logs.',
			'Ligne 5 : retirer la valeur de `Authorization`. C’est un bearer token, la même erreur que CVE-2019-11250. À la ligne 3, il manque l’auteur et le résultat : `actor=alice action=grant_role role=admin target=bob result=success`.'
		],
		steps: [
			{
				title: 'Demande-toi à quoi sert chaque ligne',
				questions: [
					{ q: 'Ligne 1 : `login ok user=alice ip=203.0.113.7`. Que fais-tu ?', options: ['Je la garde', 'Je la modifie : je retire l’IP', 'Je la retire : les connexions sont trop fréquentes', 'Je la modifie : je hache le nom d’utilisateur'], answer: 0, why: 'Une connexion réussie avec l’utilisateur et l’IP fait partie des événements que l’OWASP demande de toujours logger.' },
					{ q: 'À quoi chaque événement de sécurité du log doit-il répondre ?', options: ['Qui, pourquoi, comment et combien de temps', 'Quand, où, qui et quoi', 'Hôte, port, processus et thread', 'Niveau, logger, thread et message'], answer: 1, why: 'C’est le contrôle de l’indice : quand, où, qui et quoi. Une ligne à qui il en manque un sert mal après une intrusion.' },
					{ q: 'Pourquoi garder l’échec de connexion de la ligne 4 ?', options: ['Pour rejouer le mot de passe plus tard', 'Parce que la durée de conservation l’exige', 'Des échecs répétés révèlent du credential stuffing', 'Parce qu’une ligne WARN ne peut pas être retirée'], answer: 2, why: 'L’événement est utile. Seul le mot de passe qu’il contient pose problème.' },
					{ q: 'Que peut faire, avec la ligne 5 telle quelle, quelqu’un qui ne fait que lire les logs ?', options: ['Rien : un token expire une fois loggé', 'Seulement voir la liste des commandes', 'Lire le code source de l’appli', 'Rejouer le bearer token et agir en tant que son propriétaire'], answer: 3, why: 'Qui détient un bearer token est traité comme son propriétaire. C’est le scénario de CVE-2019-11250 : Eve « can masquerade as Alice to the cluster ».' }
				]
			},
			{
				title: 'Trouve les secrets',
				questions: [
					{ q: 'Quelle valeur de la ligne 2 est un secret ?', options: ['`DEBUG`', '`sid=9f2c4e1a7b3d`', '`session created`', 'L’horodatage'], answer: 1, why: 'L’id de session est ce que l’appli vérifie à chaque requête de cette session.' },
					{ q: 'Pourquoi un id de session dans un log est-il dangereux ?', options: ['Il sert de mot de passe pour cette session', 'Il rend la ligne trop longue à analyser', 'Il révèle le nom du serveur', 'Il casse l’ordre chronologique du log'], answer: 0, why: 'Quiconque le copie peut utiliser la session qui va avec, sans mot de passe.' },
					{ q: 'Où se range `password=Summer2026!` selon l’OWASP ?', options: ['Avec les valeurs à toujours logger', 'Avec les valeurs à logger en DEBUG seulement', 'Avec les mots de passe d’authentification à garder hors des logs', 'Avec les valeurs à hacher et garder'], answer: 2, why: 'L’OWASP range les mots de passe d’authentification parmi les valeurs qui ne vont jamais dans un log, à aucun niveau.' },
					{ q: 'Quel bug passé fait la même erreur que la ligne 5 ?', options: ['CVE-2021-25741, un bug de subpath du kubelet', 'CVE-2024-3094, la backdoor xz', 'CVE-2019-5736, l’évasion runc', 'CVE-2019-11250, des bearer tokens dans les logs de kube-apiserver'], answer: 3, why: 'kube-apiserver en `--v 10` écrivait les en-têtes de requête, bearer tokens compris, dans son log système.' }
				]
			},
			{
				title: 'Modifie sans perdre l’événement',
				questions: [
					{ q: 'Tu dois suivre une session d’un événement à l’autre. Que mets-tu à la place du sid ?', options: ['Rien : je retire le champ de session', 'Un hash du sid', 'Le sid lui-même, en DEBUG seulement', 'Les quatre premiers caractères du sid'], answer: 1, why: 'L’OWASP propose « replacing with a hashed value » : la même session donne le même hash, et le hash n’ouvre pas la session.' },
					{ q: 'À quoi ressemble la ligne 4 après modification ?', options: ['`09:16:03 WARN  login failed user=bob ip=198.51.100.23`', '`09:16:03 WARN  login failed`', '`09:16:03 WARN  login failed password=[REDACTED]`', 'À rien : la ligne est retirée'], answer: 0, why: 'Elle garde quand, qui et d’où, et ne retire que le mot de passe.' },
					{ q: 'Sur la ligne 5, que retires-tu ?', options: ['Toute la ligne', 'Le chemin `GET /api/orders`', 'La valeur de `Authorization`', 'L’horodatage'], answer: 2, why: 'La requête mérite une ligne. Le bearer token qu’elle contient, non.' },
					{ q: 'Un collègue veut activer les logs verbeux en production pour traquer un bug. Que dit l’avis de CVE-2020-8565 ?', options: ['D’accord, si les fichiers de log sont chiffrés', 'D’accord, pour une journée au plus', 'D’accord, sur un seul nœud', '« Do not enable verbose logging in production, limit access to logs. »'], answer: 3, why: 'À partir du niveau 9, les tokens arrivaient dans les logs. La réponse de l’avis : rester loin de ces niveaux et limiter qui lit les fichiers.' }
				]
			},
			{
				title: 'Complète ce qui manque',
				questions: [
					{ q: 'Ligne 3 : `POST /admin/users role=admin target=bob`. Que manque-t-il ?', options: ['La version HTTP', 'L’auteur de l’action, et le résultat', 'Le nom d’hôte du serveur', 'Le corps de la requête'], answer: 1, why: 'La ligne dit ce qui est arrivé à qui, mais pas qui l’a fait ni si ça a marché.' },
					{ q: 'Quelle ligne comble le manque ?', options: ['`role=admin target=bob debug=true`', '`user=bob role=admin`', '`actor=alice action=grant_role role=admin target=bob result=success`', '`actor=alice password=... role=admin`'], answer: 2, why: 'Elle nomme l’auteur, l’action, la cible et le résultat, et ne porte aucun secret.' },
					{ q: 'Quelle partie d’un événement de sécurité `result=success` donne-t-il ?', options: ['Quand c’est arrivé', 'D’où ça vient', 'Qui a agi', 'Le résultat de l’action'], answer: 3, why: 'Un enregistrement d’audit dit qui a agi, sur quoi, d’où, quand, et avec quel résultat.' },
					{ q: 'Dans la ligne corrigée, qui est `target=bob` ?', options: ['L’utilisateur dont le rôle a changé', 'L’utilisateur qui a agi', 'L’admin qui a approuvé', 'Le propriétaire de l’IP source'], answer: 0, why: '`actor` est l’auteur, `target` celui qui subit l’action. Garder les deux permet de répondre à « qui a fait de bob un admin ».' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Une audit policy a `- level: Metadata` en première règle et `- level: None` pour `/healthz*` en deuxième. Comment les health checks sont-ils loggés ?',
			options: [
				'Ils sont ignorés, car une règle `None` l’emporte toujours sur les autres',
				'Ils sont loggés en `Metadata`, car la première règle qui correspond fixe le niveau',
				'Ils sont loggés deux fois, une fois par règle qui leur correspond',
				'L’API server refuse de démarrer, car deux règles visent le même chemin'
			],
			answer: 1,
			why: 'Kubernetes compare chaque requête aux règles dans l’ordre et s’arrête à la première qui correspond. Une règle attrape-tout placée en haut correspond à tout, donc aucune règle en dessous ne s’applique jamais.'
		},
		{
			q: 'Pourquoi la policy GCE logge-t-elle les `secrets` en `Metadata` plutôt qu’en `RequestResponse` ?',
			options: [
				'Les Secrets sont chiffrés au repos, donc leur corps ne montrerait que du chiffré',
				'La réponse à un `get` sur un Secret contient sa valeur, et `Metadata` ne garde aucun corps',
				'`RequestResponse` n’est permis que pour des URL hors ressource comme `/healthz`',
				'Les Secrets changent trop rarement pour mériter des événements détaillés'
			],
			answer: 1,
			why: '`Metadata` garde l’utilisateur, l’heure, la ressource et le verbe, mais aucun corps de requête ni de réponse. Le log montre toujours qui a lu le Secret, et son lecteur n’obtient pas la valeur.'
		},
		{
			q: 'CVE-2020-8565 : au niveau de log 9, kube-apiserver écrit les bearer tokens dans ses logs. Avant de pouvoir mettre à jour, que demande l’avis ?',
			options: [
				'Renouveler le certificat TLS de l’API server pour invalider les anciens tokens',
				'Activer l’audit en `RequestResponse` pour voir qui a utilisé les tokens',
				'Couper le log verbeux en production et limiter qui peut lire les logs',
				'Déplacer les fichiers de log sur un disque monté avec l’option `noexec`'
			],
			answer: 2,
			why: 'L’avis dit : « Do not enable verbose logging in production, limit access to logs. » Le token n’arrive dans le log qu’à partir du niveau 9, et seul un lecteur du log peut le rejouer. Le certificat TLS ne signe pas les bearer tokens : le renouveler les laisse valides.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Écrire un filtre qui retire les secrets des cinq lignes de log de l’exercice, et vérifier que les événements sont toujours là.',
		steps: [
			'Écris les cinq lignes dans un fichier : `mkdir -p ~/log-lab && cd ~/log-lab && printf \'%s\\n\' \'09:14:07 INFO  login ok user=alice ip=203.0.113.7\' \'09:14:07 DEBUG session created sid=9f2c4e1a7b3d\' \'09:15:42 INFO  POST /admin/users role=admin target=bob\' \'09:16:03 WARN  login failed user=bob password=Summer2026! ip=198.51.100.23\' \'09:17:30 INFO  GET /api/orders Authorization="Bearer eyJhbGciOi..."\' > app.log`.',
			'Cherche les secrets : `grep -nE \'password=|Bearer|sid=\' app.log`.',
			'Filtre-le : `sed -E -e \'s/ password=[^ ]+//\' -e \'s/Authorization="[^"]*"/Authorization=[REDACTED]/\' -e \'s/sid=[0-9a-f]+/sid=[HASHED]/\' app.log > clean.log`, puis `cat clean.log`.',
			'Regarde à quoi ressemble un id de session haché : `printf %s 9f2c4e1a7b3d | shasum -a 256 | cut -c1-12`. Lance-le deux fois : le même sid donne la même valeur.'
		],
		done: [
			'L’étape 2 liste les lignes 2, 4 et 5.',
			'`grep -cE \'password=|Bearer|sid=[0-9a-f]{12}\' clean.log` affiche `0`.',
			'`grep -c \'login failed user=bob ip=198.51.100.23\' clean.log` affiche `1` : l’échec de connexion, l’utilisateur et l’IP sont toujours là.'
		],
		solution: [
			'Un filtre `sed` après coup est un filet de sécurité. La vraie correction est dans le code qui écrit la ligne : ne jamais passer le mot de passe, le token ou le sid brut au logger.',
			'Dans l’appli, écris le hash du sid à la place de `[HASHED]`, pour pouvoir encore suivre une session d’un événement à l’autre.',
			'La ligne 3 demande aussi un changement dans le code : `actor=alice action=grant_role role=admin target=bob result=success`. Aucun filtre ne peut ajouter l’auteur.'
		]
	},
	recall: {
		q: 'Dans une audit policy Kubernetes, quel niveau note qui a lu un Secret sans garder sa valeur ?',
		a: '`Metadata` : utilisateur, heure, ressource et verbe, sans corps de requête ni de réponse. La policy GCE l’utilise pour `secrets`, `configmaps`, `serviceaccounts/token` et `tokenreviews`.'
	},
	sources: [
		{ title: 'OWASP Logging Cheat Sheet', url: OWASP },
		{ title: 'Doc Kubernetes, Auditing', url: AUDIT_DOCS },
		{ title: 'Doc Kubernetes, kube-apiserver Audit Configuration (v1)', url: AUDIT_API },
		{ title: 'kubernetes/kubernetes#81114, CVE-2019-11250 : bearer tokens visibles dans les logs', url: 'https://github.com/kubernetes/kubernetes/issues/81114' },
		{ title: 'kubernetes/kubernetes#95623, CVE-2020-8565 : fuite de token dans les logs à partir du niveau 9', url: 'https://github.com/kubernetes/kubernetes/issues/95623' },
		{ title: 'Source Kubernetes, cluster/gce/gci/configure-helper.sh (audit policy)', url: `${HELPER}#L1128-L1288` }
	]
};
