const DISCOURSE = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const KEP = 'https://github.com/kubernetes/enhancements/blob/6ebe0a94771723b3f27cb4a757f0cc22f29e38a2/keps/sig-node/4781-kublet-restart-pod-status/README.md';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'three-audiences',
	part: 'Le métier d’architecte',
	title: 'Une décision, trois publics',
	minutes: 10,
	hook: [
		'Discourse, le logiciel de forum, peut héberger plusieurs communautés sur un seul serveur. Chaque communauté, appelée **site**, a sa propre base PostgreSQL. La même semaine, trois questions sur cette décision. Une nouvelle développeuse demande pourquoi une migration tourne des dizaines de fois. Un product manager demande pourquoi « une seule recherche sur toutes nos communautés » est estimée en semaines. Une directrice demande : **un client peut-il un jour voir les messages d’un autre client ?**',
		'Donne la même réponse aux trois et tu en perds deux. La développeuse reçoit un slogan, la directrice un cours sur les pools de connexions.',
		'Gregor Hohpe appelle ça **prendre l’Architect Elevator** : l’architecte relie la salle des machines, où vit le code, au penthouse, où se décide la stratégie. **Les mêmes faits à chaque étage. D’autres mots, un autre niveau de détail, une autre longueur.**'
	],
	terms: [
		{ term: 'Architect Elevator', def: 'L’image de Hohpe : l’architecte fait l’ascenseur entre la salle des machines de l’IT et le penthouse de la direction, et garde les deux connectés.' },
		{ term: 'Salle des machines', def: 'Là où vivent le code et l’infrastructure. Les gens qui y sont ont besoin du mécanisme, pour pouvoir construire dessus.' },
		{ term: 'Penthouse', def: 'Là où se décident la stratégie, le budget et les risques. Les gens qui y sont ont besoin de la conséquence, pour pouvoir décider.' },
		{ term: 'Altitude', def: 'La quantité de détail dont un public a besoin pour agir. Pas son niveau d’intelligence.' },
		{ term: 'Multisite', def: 'Le mode de Discourse où un seul serveur héberge plusieurs sites, chacun avec sa propre base de données et ses propres noms d’hôte.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['dec["Décision : une base de données par site"]'],
				highlight: ['dec'],
				note: 'Une seule décision, déjà prise (jour 4). Les faits ne changent pas dans ce chapitre. Seule la façon de les raconter change.'
			},
			{
				add: ['eng["Salle des machines : développeuse, 5 minutes"]', 'dec -.-> eng'],
				highlight: ['eng'],
				note: '**Développeuse, 5 min.** Le nom d’hôte de la requête choisit le site, et le site choisit sa base. Chaque migration tourne une fois par base. Aucune requête SQL ne peut joindre deux sites, donc tout ce qui traverse les sites est du code qui visite chaque base à tour de rôle.'
			},
			{
				add: ['mid["Étage du milieu : product manager, 2 minutes"]', 'eng <-->|ascenseur| mid', 'dec -.-> mid'],
				highlight: ['mid'],
				note: '**Product manager, 2 min.** Les données de chaque communauté sont complètement séparées, donc une nouvelle communauté, c’est une nouvelle base et une entrée de config de plus. Le prix : une recherche sur toutes les communautés ne peut pas être une seule requête en base, donc elle prend plus de temps à construire.'
			},
			{
				add: ['pent["Penthouse : directrice, 30 secondes"]', 'mid <-->|ascenseur| pent', 'dec -.-> pent'],
				highlight: ['pent'],
				note: '**Directrice, 30 s.** Chaque client a une base de données séparée : une page d’une communauté n’interroge que la base de cette communauté. Le coût, c’est plus de bases à mettre à jour et à faire tourner : une ligne de budget d’exploitation, pas un risque.'
			},
			{
				add: [],
				highlight: ['eng', 'mid', 'pent'],
				note: 'Chaque version garde **un gain et un coût**. Retire le coût au dernier étage et tu vends au lieu d’informer. L’ascenseur descend aussi : rapporte ce qui compte pour le penthouse, pour que la salle des machines optimise la bonne chose.'
			}
		]
	},
	example: {
		title: 'config/multisite.yml.production-sample',
		repo: 'discourse/discourse',
		url: `${DISCOURSE}/config/multisite.yml.production-sample#L1-L28`,
		lang: 'yaml',
		code: `mlp:
  adapter: postgresql
  database: discourse_mlp
  username: discourse_mlp
  password: applejack
  host: dbhost
  pool: 5
  timeout: 5000
…
  host_names:
    - discourse.equestria.com
    - discourse.equestria.internal

drwho:
  adapter: postgresql
  database: discourse_who
  username: discourse_who
…
  host_names:
    - discuss.tardis.gallifrey`,
		notes: [
			`Voici le fait de la salle des machines derrière chaque étage. Chaque site nomme **sa propre base, son propre utilisateur de base et ses propres noms d’hôte**. Le [guide du développeur](${DISCOURSE}/docs/developer-guides/docs/02-development-environments/09-multisite-setup.md#L7) le dit clairement : « Un serveur multisite utilise une base et un nom d’hôte différents pour chaque site qu’il sert. »`,
			`Vérifie ton affirmation de penthouse dans le code avant de la faire. Un [request spec](${DISCOURSE}/spec/integration/multisite_spec.rb#L10-L33) vérifie que chaque hôte connu reçoit le topic de son propre site, et qu’un hôte inconnu reçoit une 404 pour une page du forum.`,
			`Le côté coût est dans la [tâche de migration](${DISCOURSE}/lib/tasks/db.rake#L112-L187) : elle boucle sur chaque base de site et migre chacune. Le commentaire explique l’option de concurrence : « nous avons beaucoup de sites », et elle fait gagner « énormément de temps ». C’est la ligne de budget de la directrice, vue d’en bas.`,
			'Remarque le commentaire dans l’exemple : si tu changes les noms d’hôte, tu dois redémarrer Sidekiq et refaire le rendu des messages (rebake). Ce genre de détail a sa place dans la version développeuse. La directrice n’en a jamais besoin.'
		]
	},
	tradeoff: {
		gain: [
			'Les décisions sont comprises, financées et défendues par des gens qui ne liront jamais le code.',
			'Les malentendus apparaissent tôt : « attends, donc la recherche entre communautés est difficile ? », mieux vaut l’entendre en réunion que lors d’une release.',
			'Préparer la version courte t’oblige à trouver la seule conséquence qui compte.'
		],
		cost: [
			'Trois versions demandent du temps de préparation. Celle de 30 secondes est la plus dure à écrire.',
			'Simplifier peut induire en erreur. Si la version du dernier étage cache le coût, tu perds la confiance dès la première fois où il se fait sentir.',
			'Raconter des histoires différentes à chaque étage, c’est de la politique, pas de l’architecture. Les faits doivent rester identiques.'
		]
	},
	task: {
		prompt: 'Reprends la proposition d’hier, la KEP-4781 : le kubelet garde le dernier statut de chaque pod après un redémarrage au lieu de marquer tous les pods « pas Ready ». Écris-la pour un développeur de la plateforme (5 lignes), un PM (2 lignes), une directrice (1 phrase). Chaque version doit garder un gain et un coût.',
		hint: 'Demande-toi ce que chaque personne va **faire** de ta réponse. Le développeur la construit et l’exploite, le PM planifie les mises à jour et le support, la directrice décide si ça compte pour les clients.',
		answer: [
			'**Développeur :** après un redémarrage, le kubelet garde le statut `Started` et `Ready` des conteneurs qui tournaient déjà, au lieu de les remettre à false. Un pod qui n’était pas Ready avant reste pas Ready jusqu’à ce que sa probe passe. Le gate `ChangeContainerStatusOnKubeletRestart` rétablit l’ancien comportement. Coût : un conteneur qui a cassé pendant que le kubelet était arrêté garde son statut Ready jusqu’au prochain cycle de probe.',
			'**PM :** redémarrer l’agent du nœud, par exemple pendant une mise à jour, ne retire plus un instant les services sains de la rotation. Coût : un service vraiment cassé pendant ce redémarrage est repéré une probe plus tard.',
			'**Directrice :** « La maintenance courante des nœuds ne causera plus de brèves fausses pannes, au prix d’une réaction un peu plus lente à une vraie panne pendant cette fenêtre. C’est le comportement par défaut depuis Kubernetes 1.35. »',
			'Vérifie : les mêmes faits dans les trois ? Un gain et un coût pour chacune ? Rien au dernier étage que tu ne pourrais pas appuyer par une ligne de la KEP ?'
		]
	},
	quiz: [
		{
			q: 'Une directrice demande : « Un client peut-il un jour voir les données d’un autre client ? » Quelle réponse convient à cet étage ?',
			options: ['Ça dépend de la façon dont PostgreSQL isole les lignes et les schémas', 'Nous suivons les bonnes pratiques du secteur, le risque est couvert', 'Non, chaque client a sa propre base. Le prix : plus de bases à exploiter', 'Dérouler la recherche de connexion par nom d’hôte et la tâche de migration'],
			answer: 2,
			why: 'Une réponse directe, la raison en mots simples, et un coût honnête. Le mécanisme est vrai mais inutile à cette altitude, et « bonnes pratiques » ne dit rien.'
		},
		{
			q: 'Qu’est-ce que l’Architect Elevator de Hohpe ?',
			options: ['Un pattern de répartition de charge', 'L’architecte qui fait l’ascenseur entre le code (salle des machines) et la stratégie (penthouse), en les reliant', 'Un parcours de carrière où un développeur monte étage par étage de la salle des machines jusqu’au management', 'Un des niveaux de zoom du C4'],
			answer: 1,
			why: 'La valeur est dans le lien : une stratégie qui sait ce que le code peut faire, et un code qui sait ce dont le métier a besoin.'
		},
		{
			q: 'Entre les versions développeur, PM et directrice, qu’est-ce qui doit changer ?',
			options: ['Le détail et la conséquence sur laquelle chaque public agit, jamais les faits', 'Les faits, un peu plus simplifiés à chaque étage en montant', 'Seulement la longueur, avec le même détail tassé en moins de lignes', 'La décision elle-même, ajustée à ce que chaque public veut entendre'],
			answer: 0,
			why: 'L’altitude change les mots et le détail. Si les faits changent d’un étage à l’autre, tu as trois décisions, et un jour elles se retrouveront dans la même réunion.'
		}
	],
	takeaway: 'Les mêmes faits à chaque étage. Donne à chaque public le détail dont il a besoin pour agir, et toujours un gain et un coût.',
	sources: [
		{ title: 'Gregor Hohpe, The Architect Elevator', url: 'https://architectelevator.com/' },
		{ title: 'Gregor Hohpe, The Software Architect Elevator (book)', url: 'https://architectelevator.com/book/' },
		{ title: 'Discourse, config/multisite.yml.production-sample', url: `${DISCOURSE}/config/multisite.yml.production-sample#L1-L28` },
		{ title: 'Discourse, multisite migration task (lib/tasks/db.rake)', url: `${DISCOURSE}/lib/tasks/db.rake#L112-L187` },
		{ title: 'KEP-4781, Restarting kubelet does not change pod status (provisional)', url: KEP },
		{ title: 'Kubernetes v1.35.0, ChangeContainerStatusOnKubeletRestart feature gate', url: 'https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/features/kube_features.go#L1189-L1192' }
	]
};
