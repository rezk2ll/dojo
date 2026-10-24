const KP = 'https://github.com/prometheus-operator/kube-prometheus/blob/f81c076ab8f542c457840cd4c62656b8d6b4f43a';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'observability-and-incidents',
	part: 'En production',
	title: 'Observabilité et incidents : alerter sur ce que vivent les utilisateurs',
	minutes: 10,
	hook: [
		'Tu as déjà eu l’astreinte de 3 h du matin qui disait « disque à 81 % sur db-02 ». Tu t’es levé, tu as regardé, et le site allait très bien. La semaine suivante, le site est tombé une heure et **rien n’a sonné**.',
		'L’alerte disque surveillait une **cause**. Un système a mille causes de panne possibles, et la plupart ne gênent personne. Les utilisateurs ne ressentent que quelques symptômes : des erreurs, de la lenteur, des pages qui ne chargent pas.',
		'Prometheus collecte des métriques et en tire des alertes sur ces symptômes. Après l’appel, la personne d’astreinte limite les dégâts, et l’équipe écrit un postmortem sans reproche.'
	],
	terms: [
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
				note: 'Prometheus **tire** les métriques, des nombres dans le temps comme les requêtes par seconde. À intervalle fixe (une minute par défaut), il récupère `/metrics` sur chaque cible et stocke les nombres. Les logs (des enregistrements d’événements) et les traces (une requête suivie à travers chaque service) vont dans leurs propres stockages. La plupart des règles d’alerte interrogent les métriques de Prometheus.'
			},
			{
				add: [
					'rule["Règle d’alerte : taux d’erreur trop haut, pendant 2m"]',
					'prom --> rule'
				],
				highlight: ['rule'],
				note: 'Une règle d’alerte, c’est une requête PromQL plus une durée `for`. Tant que la condition est vraie mais que la durée n’est pas écoulée, l’alerte est pending. Quand la condition a tenu toute la durée `for`, l’alerte passe **firing**. Un pic plus court que la durée `for` ne fait appeler personne.'
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
				note: 'Tu limites d’abord les dégâts pour les utilisateurs (rollback, scale up), puis tu cherches la cause. Après, écris le **postmortem** : chronologie, impact, causes contributives, actions. Une des actions modifie souvent une règle d’alerte.'
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
			'La ligne 7 lit `burnrate1h`, une [recording rule](https://github.com/prometheus-operator/kube-prometheus/blob/f81c076ab8f542c457840cd4c62656b8d6b4f43a/manifests/kubernetesControlPlane-prometheusRule.yaml#L1146-L1172) : les requêtes **trop lentes ou en erreur 5xx**, divisées par toutes les requêtes. L’alerte mesure donc un symptôme que vivent les clients de l’API server Kubernetes.',
			'Sur la ligne 7, `0.01000` est l’error budget d’un [objectif à 99 %](https://github.com/kubernetes-monitoring/kubernetes-mixin/blob/f57ebcd21d8fb67fe9708b7f6d1d30aed26b2be4/config.libsonnet#L18-L21). `14.40` est le burn rate : tu dépenses le budget 14,4 fois plus vite que prévu. D’après le workbook SRE, une heure à ce rythme consomme **2 % d’un budget sur 30 jours**.',
			'Les lignes 7 à 9 relient deux fenêtres par `and`. La longue (1h) montre que le taux d’erreur dure assez pour compter, la courte (5m) montre qu’il est **encore là**. Le workbook conseille une fenêtre courte de 1/12 de la longue, et 5m font 1/12 de 1h.',
			'Les lignes 4 et 18 donnent à chaque alerte un `runbook_url`. La personne réveillée à 3 h reçoit, avec le nom de l’alerte, un lien vers ce qu’il faut vérifier en premier.'
		]
	},
	tradeoff: {
		gain: [
			'L’astreinte reçoit moins d’appels, et chaque appel signale des erreurs ou de la lenteur que des utilisateurs voient maintenant.',
			'Les alertes sur le burn rate attrapent une fuite lente et une panne brutale avec le même jeu de règles.',
			'Dans un postmortem sans reproche, les gens racontent ce qu’ils ont vraiment fait, et les actions visent les vraies causes.'
		],
		cost: [
			'Avant d’écrire les règles d’alerte, tu dois te mettre d’accord sur un SLO avec le responsable produit.',
			'Les métriques de disque et de CPU partent sur des tableaux de bord et des tickets, et quelqu’un doit encore les lire.',
			'Métriques, logs et traces demandent trois systèmes à faire tourner, stocker et payer. Trop de valeurs de labels (forte cardinalité) peut surcharger Prometheus.'
		]
	},
	task: {
		prompt: 'Ton service de paiement a ces alertes : CPU au-dessus de 80 %, pod redémarré, disque au-dessus de 85 %, et taux d’erreur au-dessus de 5 % pendant 10 minutes. L’astreinte reçoit 30 appels par semaine et en ignore la plupart. Refais l’alerting.',
		hint: 'Trie chaque alerte : est-ce qu’un utilisateur le ressent maintenant ? Puis demande-toi ce que l’appel doit contenir pour que la personne d’astreinte puisse agir.',
		answer: [
			'Garde l’appel sur le **symptôme** : le taux d’erreur. Mieux, définis un SLO (par exemple 99,5 % des paiements réussissent en moins d’1 s) et alerte sur le burn rate sur deux fenêtres.',
			'Ajoute un symptôme de **latence** : un paiement lent gêne autant qu’un paiement raté.',
			'Déplace le CPU et les redémarrages de pods vers des **panneaux de tableau de bord** ou des tickets peu prioritaires, sans appel. Ils t’aident à trouver la cause une fois appelé.',
			'Le disque à 85 % est un vrai problème à venir : alerte sur « disque plein dans 4 heures » sous forme de ticket, pas sur un pourcentage fixe en pleine nuit.',
			'Chaque alerte restante reçoit un résumé, une sévérité et un `runbook_url`. Après le prochain incident, le postmortem vérifie si l’alerte a sonné assez tôt.'
		],
		steps: [
			{
				title: 'Sépare symptômes et causes',
				questions: [
					{ q: 'Laquelle des quatre alertes est un symptôme que ressentent les utilisateurs ?', options: ['CPU au-dessus de 80 %', 'Pod redémarré', 'Taux d’erreur au-dessus de 5 % pendant 10 minutes', 'Disque au-dessus de 85 % sur n’importe quel nœud du cluster'], answer: 2, why: 'Les erreurs, c’est ce qui est cassé pour les utilisateurs. Les trois autres sont des causes possibles.' },
					{ q: 'Le CPU est à 85 % et chaque paiement réussit vite. Faut-il réveiller quelqu’un ?', options: ['Non : rien n’est cassé pour les utilisateurs', 'Oui : le CPU est un signal en or', 'Oui : 80 % est la limite', 'Seulement en semaine'], answer: 0, why: 'Appelle sur les symptômes. Un CPU élevé qui ne gêne personne va sur un tableau de bord.' },
					{ q: 'Pourquoi l’astreinte ignore-t-elle la plupart des 30 appels ?', options: ['Elle est paresseuse', 'Le pager sonne trop doucement', 'Il y a trop peu d’alertes', 'La plupart des appels sont des causes qui ne gênent personne'], answer: 3, why: 'Un système a mille causes possibles de problème, et la plupart ne gênent personne. Appeler dessus apprend aux gens à ignorer les appels.' },
					{ q: 'Parmi les quatre signaux en or, lequel les alertes CPU et disque mesurent-elles ?', options: ['La latence', 'La saturation', 'Le trafic', 'Les erreurs'], answer: 1, why: 'L’usage CPU et disque dit à quel point le système est plein : la saturation. Utile sur un dashboard, mais les utilisateurs ressentent les erreurs et la latence.' }
				]
			},
			{
				title: 'Appelle sur les symptômes',
				questions: [
					{ q: 'Quelle base vaut mieux qu’un seuil fixe de 5 % pour l’appel sur les erreurs ?', options: ['Un seuil CPU plus haut', 'Un SLO, avec des alertes sur le burn rate', 'Un appel par requête ratée', 'Un mail quotidien'], answer: 1, why: 'Mets-toi d’accord sur un objectif, par exemple 99,5 % des paiements réussissent en moins d’1 s, et appelle quand le budget brûle trop vite.' },
					{ q: 'Pourquoi deux fenêtres pour une alerte de burn rate ?', options: ['La longue montre que ça dure, la courte que ça continue', 'Prometheus ne sait pas calculer un taux sur plus d’une fenêtre dans une même règle', 'Une fenêtre par data center', 'Pour appeler deux fois plus souvent'], answer: 0, why: 'La fenêtre longue dit que ça compte, la courte dit que ce n’est pas déjà fini.' },
					{ q: 'Quel symptôme manque dans la liste actuelle ?', options: ['Le disque', 'Les redémarrages de pods', 'La mémoire', 'La latence'], answer: 3, why: 'Un paiement lent gêne autant qu’un paiement raté.' },
					{ q: 'Le checkout tombe complètement à 14:00. Avec la règle actuelle (5 % pendant 10 minutes), quand l’astreinte est-elle appelée la première fois ?', options: ['À 14:00', 'Vers 14:01, après un scrape', 'Vers 14:10', 'Seulement après le prochain postmortem'], answer: 2, why: 'La condition doit tenir pendant tout le `for: 10m` avant que l’alerte se déclenche. Les utilisateurs ont dix minutes d’erreurs sans que personne soit appelé, ce que corrige une fenêtre courte de burn rate.' }
				]
			},
			{
				title: 'Retire les causes du pager',
				questions: [
					{ q: 'Où vont le CPU et les redémarrages de pods ?', options: ['Sur des panneaux de tableau de bord ou des tickets peu prioritaires', 'À la poubelle, puisqu’ils n’aident jamais pendant un incident', 'Sur la route critique du pager', 'Dans le modèle de postmortem'], answer: 0, why: 'Ils aident à trouver la cause une fois appelé. Ils n’ont pas besoin de réveiller qui que ce soit.' },
					{ q: 'Le disque à 85 % est un vrai problème à venir. Quelle alerte le remplace ?', options: ['Disque au-dessus de 95 %, appel la nuit', 'Aucune alerte', '« Disque plein dans 4 heures », sous forme de ticket', 'Un appel à chaque hausse'], answer: 2, why: 'Prévois quand il sera plein et ouvre un ticket. Un pourcentage fixe la nuit appelle trop tôt ou trop tard.' },
					{ q: 'Quel composant envoie les warnings en tickets et les alertes critiques au pager ?', options: ['Prometheus', 'Le kubelet', 'Grafana', 'Alertmanager'], answer: 3, why: 'Alertmanager déduplique, regroupe, applique les silences et route chaque alerte vers un destinataire.' },
					{ q: 'Quel est le coût de déplacer les causes vers les tableaux de bord ?', options: ['Prometheus arrête de les collecter', 'Quelqu’un doit encore les lire', 'On ne peut plus les tracer', 'Elles comptent dans l’error budget'], answer: 1, why: 'Moins d’appels, mais les tickets et les panneaux ont toujours besoin d’un responsable.' }
				]
			},
			{
				title: 'Rends chaque appel utile',
				questions: [
					{ q: 'Que doit porter chaque alerte restante ?', options: ['Un résumé, une sévérité et un `runbook_url`', 'Seulement la requête PromQL', 'Le nom de la dernière personne d’astreinte', 'Un lien vers le code source'], answer: 0, why: 'La personne appelée à 3 h du matin doit savoir ce qui est cassé, à quel point, et quoi vérifier d’abord.' },
					{ q: 'Tu es appelé pour des erreurs de paiement. Qu’est-ce qui passe en premier ?', options: ['Trouver la cause racine, pour que le correctif soit bon du premier coup', 'Écrire le postmortem', 'Limiter les dégâts : rollback ou scale up', 'Mettre l’alerte en silence'], answer: 2, why: 'Arrête d’abord le mal pour les utilisateurs, puis cherche la cause.' },
					{ q: 'Après le prochain incident, que vérifie le postmortem côté alerting ?', options: ['Qui a écrit l’alerte', 'Si l’alerte a sonné assez tôt', 'Combien d’alertes existent', 'Si le CPU était haut'], answer: 1, why: 'Une des actions change souvent une règle d’alerte.' },
					{ q: 'La chronologie montre que le déploiement d’un collègue a lancé les erreurs du checkout. Quelle action convient à un postmortem sans reproche ?', options: ['Le collègue ne déploie plus seul', 'Le collègue écrit des excuses à l’équipe', 'Retirer ce déploiement de la chronologie', 'Trouver ce qui a laissé le mauvais déploiement atteindre les utilisateurs, et le corriger, par exemple un check manquant'], answer: 3, why: 'Le déploiement reste dans la chronologie comme un fait. Les actions visent les causes contributives, car le reproche pousse les gens à cacher ce qu’ils font la fois suivante.' }
				]
			}
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
				'Il est écrit de façon anonyme, pour qu’on ne sache pas qui a écrit chaque partie',
				'Il saute la chronologie pour qu’aucun nom n’apparaisse et que personne ne soit visé',
				'Il cherche les causes contributives sans accuser personne ni aucune équipe, en supposant la bonne foi',
				'Il n’est partagé qu’avec l’équipe qui a causé l’incident, jamais avec toute l’entreprise'
			],
			answer: 2,
			why: 'Le reproche pousse les gens à cacher ce qu’ils ont fait, et les vraies causes restent cachées. Le livre SRE définit le sans-reproche comme trouver les causes sans mettre personne en accusation.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Écrire une alerte sur un symptôme avec une durée `for`, et la tester avec `promtool` : une vraie panne déclenche un appel, un pic court non.',
		steps: [
			'Crée un dossier : `mkdir -p ~/alert-lab && cd ~/alert-lab`.',
			'Écris la règle d’alerte, sur le taux d’erreur du paiement : `echo \'groups: [{name: checkout, rules: [{alert: CheckoutErrors, expr: "checkout_error_ratio > 0.05", for: 10m, labels: {severity: page}}]}]\' > rules.yml`.',
			'Écris deux tests : une panne de 20 minutes à 10 % d’erreurs, et un pic de 4 minutes. `echo \'rule_files: [rules.yml]\' > test.yml`, puis `echo \'tests: [{name: outage, input_series: [{series: checkout_error_ratio, values: "0.1x20"}], alert_rule_test: [{eval_time: 5m, alertname: CheckoutErrors, exp_alerts: []}, {eval_time: 15m, alertname: CheckoutErrors, exp_alerts: [{exp_labels: {severity: page}}]}]}, {name: blip, input_series: [{series: checkout_error_ratio, values: "0.1x3 0x16"}], alert_rule_test: [{eval_time: 3m, alertname: CheckoutErrors, exp_alerts: []}]}]\' >> test.yml`.',
			'Lance les tests avec le `promtool` de l’image Prometheus : `docker run --rm -v "$PWD":/w -w /w --entrypoint promtool prom/prometheus:v2.53.0 test rules test.yml`.',
			'Dans `rules.yml`, remplace `for: 10m` par `for: 2m` et relance la même commande. Puis essaie `for: 20m`. Remets `for: 10m` à la fin.'
		],
		done: [
			'Avec `for: 10m`, `promtool` affiche `SUCCESS` : pas d’appel à 5 minutes, un appel à 15, et pas d’appel pour le pic.',
			'Avec `for: 2m`, le test affiche `FAILED` pour `blip` à `3m` : un pic de 4 minutes aurait réveillé quelqu’un. Il échoue aussi pour `outage` à `5m`, parce que l’alerte se déclenche maintenant après 2 minutes.',
			'Avec `for: 20m`, le test affiche `FAILED` pour `outage` à `15m` : les utilisateurs voient des erreurs depuis 15 minutes et personne n’a été appelé.'
		],
		solution: [
			'`"0.1x20"` donne 21 échantillons à `0.1`, un par minute. `"0.1x3 0x16"` donne 4 minutes à 10 % d’erreurs, puis la normale.',
			'Tant que la condition est vraie depuis moins longtemps que `for`, l’alerte est pending, et `exp_alerts` ne liste que les alertes qui sonnent. C’est pour ça que le pic n’apparaît jamais avec `for: 10m`.',
			'`for` échange de la rapidité contre du calme. Une règle de burn rate sur deux fenêtres fait mieux le même travail, et se teste de la même façon. Ajoute `annotations: {runbook_url: ...}` avant qu’elle appelle pour de vrai.'
		]
	},
	recall: {
		q: 'Quelles alertes doivent appeler la personne d’astreinte, et quand `KubeAPIErrorBudgetBurn` se déclenche-t-elle ?',
		a: 'Seulement les alertes sur des symptômes que vivent les utilisateurs, comme les erreurs et la latence. `KubeAPIErrorBudgetBurn` se déclenche quand l’error budget d’un objectif à 99 % brûle 14,4 fois trop vite sur 1 heure et sur 5 minutes, pendant 2 minutes.'
	},
	sources: [
		{ title: 'Livre SRE de Google, Monitoring distributed systems', url: 'https://sre.google/sre-book/monitoring-distributed-systems/' },
		{ title: 'Workbook SRE de Google, Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
		{ title: 'Doc Prometheus, Alerting rules', url: 'https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/' },
		{ title: 'Doc Prometheus, Alerting best practices', url: 'https://prometheus.io/docs/practices/alerting/' },
		{ title: 'Livre SRE de Google, Postmortem culture', url: 'https://sre.google/sre-book/postmortem-culture/' }
	]
};
