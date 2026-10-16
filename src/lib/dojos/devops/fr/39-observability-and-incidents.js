const KP = 'https://github.com/prometheus-operator/kube-prometheus/blob/f81c076ab8f542c457840cd4c62656b8d6b4f43a';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'observability-and-incidents',
	part: 'En production',
	title: 'Observabilité et incidents : alerter sur ce que vivent les utilisateurs',
	minutes: 10,
	hook: [
		'Tu as déjà eu l’astreinte de 3 h du matin qui disait « disque à 81 % sur db-02 ». Tu t’es levé, tu as regardé, et le site allait très bien. La semaine suivante, le site est tombé une heure et **rien n’a sonné**.',
		'C’est alerter sur des **causes**. Il y a mille causes, et la plupart ne gênent personne. Les utilisateurs ne ressentent que quelques **symptômes** : des erreurs, de la lenteur, rien qui charge.',
		'Aujourd’hui : les trois types de signaux que tu collectes, comment Prometheus en fait des alertes sur les symptômes, et ce qui se passe après l’appel, de l’astreinte au **postmortem sans reproche**.'
	],
	terms: [
		{ term: 'Métriques, logs, traces', def: 'Les métriques sont des nombres dans le temps (requêtes par seconde). Les logs sont des enregistrements d’événements. Une trace suit une requête à travers chaque service qu’elle touche.' },
		{ term: 'Quatre signaux en or', def: 'Du livre SRE de Google : latence, trafic, erreurs, saturation. Si tu ne peux mesurer que quatre choses sur un système exposé aux utilisateurs, mesure celles-là.' },
		{ term: 'Symptôme ou cause', def: 'Le symptôme, c’est ce qui est cassé pour les utilisateurs (« des HTTP 500 »). La cause, c’est pourquoi (« la base refuse les connexions »). Alerte sur les symptômes, cherche les causes sur les tableaux de bord.' },
		{ term: 'SLO et error budget', def: 'Un SLO est un objectif, par exemple 99 % des requêtes réussissent et sont rapides. L’error budget, c’est ce qui reste : 1 % peut échouer. Le **burn rate** dit à quelle vitesse tu le dépenses.' },
		{ term: 'Postmortem sans reproche', def: 'Une analyse écrite d’un incident qui cherche les causes contributives sans accuser personne. Elle part du principe que chacun a agi de bonne foi avec ce qu’il savait.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'app["Pods de l’appli : /metrics"]',
					'prom["Prometheus"]',
					'prom -->|"scrape"| app'
				],
				highlight: ['app', 'prom'],
				note: 'Prometheus **tire** : à intervalle fixe (une minute par défaut), il récupère `/metrics` sur chaque cible et stocke les nombres. Les logs et les traces vont dans leurs propres stockages, mais c’est en général sur les métriques que tu alertes.'
			},
			{
				add: [
					'rule["Règle d’alerte : taux d’erreur trop haut, pendant 2m"]',
					'prom --> rule'
				],
				highlight: ['rule'],
				note: 'Une règle d’alerte, c’est une requête PromQL plus une durée `for`. Tant que la condition est vraie mais que la durée n’est pas écoulée, l’alerte est **pending**. Ensuite elle passe **firing**. Le `for` filtre les petits pics.'
			},
			{
				add: [
					'am["Alertmanager"]',
					'oncall["Ingénieur d’astreinte"]',
					'rule -->|"firing"| am',
					'am -->|"appel"| oncall',
					'class oncall ext'
				],
				highlight: ['am', 'oncall'],
				note: 'Prometheus envoie les alertes actives à **Alertmanager**, qui les dédoublonne, les regroupe, applique les silences et les route vers un destinataire, par exemple un pager pour les alertes critiques et un e-mail ou un ticket pour les warnings. L’astreinte tourne entre les personnes, et beaucoup d’équipes ont un primaire et un secondaire.'
			},
			{
				add: [
					'fix["Atténuer, puis corriger"]',
					'pm["Postmortem sans reproche"]',
					'oncall --> fix',
					'fix --> pm',
					'pm -.->|"actions"| rule'
				],
				highlight: ['fix', 'pm'],
				note: 'D’abord arrêter l’hémorragie (rollback, scale up), ensuite chercher la cause. Après, écris le **postmortem** : chronologie, impact, causes contributives, actions. Souvent, une des actions est une meilleure alerte.'
			}
		]
	},
	example: {
		title: 'manifests/kubernetesControlPlane-prometheusRule.yaml',
		repo: 'prometheus-operator/kube-prometheus',
		url: `${KP}/manifests/kubernetesControlPlane-prometheusRule.yaml#L603-L630`,
		lang: 'yaml',
		code: `    - alert: KubeAPIErrorBudgetBurn
      annotations:
        description: The Kube API server is burning too much error budget on cluster {{ $labels.cluster }}.
        runbook_url: https://runbooks.prometheus-operator.dev/runbooks/kubernetes/kubeapierrorbudgetburn
        summary: The Kube API server is burning too much error budget.
      expr: |
        sum by(cluster) (apiserver_request:burnrate1h) > (14.40 * 0.01000)
        and on(cluster)
        sum by(cluster) (apiserver_request:burnrate5m) > (14.40 * 0.01000)
      for: 2m
      labels:
        long: 1h
        severity: critical
        short: 5m
    - alert: KubeAPIErrorBudgetBurn
      annotations:
        description: The Kube API server is burning too much error budget on cluster {{ $labels.cluster }}.
        runbook_url: https://runbooks.prometheus-operator.dev/runbooks/kubernetes/kubeapierrorbudgetburn
        summary: The Kube API server is burning too much error budget.
      expr: |
        sum by(cluster) (apiserver_request:burnrate6h) > (6.00 * 0.01000)
        and on(cluster)
        sum by(cluster) (apiserver_request:burnrate30m) > (6.00 * 0.01000)
      for: 15m
      labels:
        long: 6h
        severity: critical
        short: 30m`,
		notes: [
			'Cette alerte surveille l’API server Kubernetes tel que ses utilisateurs le vivent. `burnrate1h` est une [recording rule](https://github.com/prometheus-operator/kube-prometheus/blob/f81c076ab8f542c457840cd4c62656b8d6b4f43a/manifests/kubernetesControlPlane-prometheusRule.yaml#L1146-L1172) : les requêtes **trop lentes ou en erreur 5xx**, divisées par toutes les requêtes. Un pur symptôme.',
			'`0.01000` est l’error budget d’un [objectif à 99 %](https://github.com/kubernetes-monitoring/kubernetes-mixin/blob/f57ebcd21d8fb67fe9708b7f6d1d30aed26b2be4/config.libsonnet#L18-L21). `14.40` est le burn rate : dépenser le budget 14,4 fois plus vite que prévu. Le workbook SRE dit qu’à ce rythme pendant une heure, tu manges **2 % d’un budget sur 30 jours**.',
			'Deux fenêtres reliées par `and` : la longue (1h) prouve que c’est sérieux, la courte (5m) prouve que **ça continue**. Le workbook conseille une fenêtre courte de 1/12 de la longue, et 5m, c’est 1/12 de 1h.',
			'Chaque alerte porte un `runbook_url`. La personne réveillée à 3 h reçoit un lien vers ce qu’il faut vérifier en premier, pas juste un nom.'
		]
	},
	tradeoff: {
		gain: [
			'Moins d’appels, et de meilleurs : chacun veut dire que des utilisateurs souffrent maintenant.',
			'Les alertes sur le burn rate attrapent une fuite lente et une panne brutale avec le même jeu de règles.',
			'Les postmortems sans reproche poussent les gens à raconter ce qui s’est vraiment passé, donc le même incident ne revient pas.'
		],
		cost: [
			'Il faut d’abord définir un SLO, et se mettre d’accord dessus avec le responsable produit. C’est une discussion, pas un fichier de config.',
			'Les métriques de cause (disque, CPU) comptent toujours. Elles passent sur des tableaux de bord et des tickets, que quelqu’un doit lire.',
			'Métriques, logs et traces, ce sont trois systèmes à faire tourner, stocker et payer. La cardinalité (trop de valeurs de labels) peut faire exploser Prometheus.'
		]
	},
	task: {
		prompt: 'Ton service de paiement a ces alertes : CPU au-dessus de 80 %, pod redémarré, disque au-dessus de 85 %, et taux d’erreur au-dessus de 5 % pendant 10 minutes. L’astreinte reçoit 30 appels par semaine et en ignore la plupart. Refais l’alerting.',
		hint: 'Trie chaque alerte : est-ce qu’un utilisateur le ressent maintenant ? Puis demande-toi ce que l’appel doit contenir pour que la personne d’astreinte puisse agir.',
		answer: [
			'Garde l’appel sur le **symptôme** : le taux d’erreur. Mieux, définis un SLO (par exemple 99,5 % des paiements réussissent en moins d’1 s) et alerte sur le burn rate sur deux fenêtres.',
			'Ajoute un symptôme de **latence** : un paiement lent gêne autant qu’un paiement raté.',
			'CPU et redémarrages de pods deviennent des **panneaux de tableau de bord** ou des tickets peu prioritaires, pas des appels. Ils aident à trouver la cause une fois appelé.',
			'Le disque à 85 % est un vrai problème à venir : alerte sur « disque plein dans 4 heures » sous forme de ticket, pas sur un pourcentage fixe en pleine nuit.',
			'Chaque alerte restante reçoit un résumé, une sévérité et un `runbook_url`. Après le prochain incident, le postmortem vérifie si l’alerte a sonné assez tôt.'
		]
	},
	quiz: [
		{
			q: 'D’après le livre SRE de Google, quels sont les quatre signaux en or ?',
			options: [
				'CPU, mémoire, disque, réseau',
				'Latence, trafic, erreurs, saturation',
				'Métriques, logs, traces, événements',
				'Uptime, downtime, MTTR, MTBF'
			],
			answer: 1,
			why: 'Latence, trafic, erreurs et saturation décrivent ce que vivent les utilisateurs d’un service. CPU et disque sont des causes que tu regardes une fois que l’un d’eux se dégrade.'
		},
		{
			q: 'Une règle d’alerte a `for: 10m`. La condition devient vraie, le reste 4 minutes, puis revient à la normale. Que se passe-t-il ?',
			options: [
				'L’alerte se déclenche au bout de 4 minutes',
				'L’alerte se déclenche et reste active 10 minutes',
				'L’alerte est pending pendant 4 minutes, puis disparaît sans se déclencher',
				'Prometheus appelle quand même parce que la condition a été vraie une fois'
			],
			answer: 2,
			why: 'Une alerte active reste pending tant que la condition n’a pas tenu toute la durée `for`. Un pic de 4 minutes n’atteint jamais l’état firing.'
		},
		{
			q: 'Qu’est-ce qui rend un postmortem sans reproche ?',
			options: [
				'Il est écrit de façon anonyme',
				'Il saute la chronologie pour qu’aucun nom n’apparaisse',
				'Il cherche les causes contributives sans accuser personne ni aucune équipe, en partant du principe que chacun a agi de bonne foi',
				'Il n’est partagé qu’avec l’équipe qui a causé l’incident'
			],
			answer: 2,
			why: 'Le reproche pousse les gens à cacher ce qu’ils ont fait, et les vraies causes restent cachées. Le livre SRE définit le sans-reproche comme trouver les causes sans mettre personne en accusation.'
		}
	],
	takeaway: 'Collecte métriques, logs et traces, mais n’appelle que sur les symptômes que vivent les utilisateurs, idéalement sous forme de burn rate de SLO. Après chaque incident, écris un postmortem sans reproche et transforme ses leçons en actions.',
	sources: [
		{ title: 'Livre SRE de Google, Monitoring distributed systems', url: 'https://sre.google/sre-book/monitoring-distributed-systems/' },
		{ title: 'Workbook SRE de Google, Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
		{ title: 'Doc Prometheus, Alerting rules', url: 'https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/' },
		{ title: 'Doc Prometheus, Alerting best practices', url: 'https://prometheus.io/docs/practices/alerting/' },
		{ title: 'Livre SRE de Google, Postmortem culture', url: 'https://sre.google/sre-book/postmortem-culture/' }
	]
};
