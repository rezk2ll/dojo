const FOURKEYS = 'https://github.com/dora-team/fourkeys/blob/6cc642e037a95a280ed8d3b1624dd003b647d797';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'dora-metrics',
	part: 'L’état d’esprit DevOps',
	title: 'Les métriques DORA : est-ce que la livraison s’améliore ?',
	minutes: 10,
	hook: [
		'Ton manager demande : « Est-ce qu’on s’améliore ? » Tu montres la disponibilité (99,9 %) et les tickets fermés (212). Aucun de ces chiffres ne dit **si les changements arrivent plus vite aux utilisateurs, ou cassent moins souvent**.',
		'DORA, un programme de recherche mené par Google Cloud, étudie les équipes logicielles depuis plus de dix ans. Il a trouvé un petit ensemble de chiffres qui décrivent la livraison logicielle et prédisent la performance de l’organisation.',
		'La surprise dans les données : **vitesse et stabilité ne s’opposent pas**. Pour la plupart des équipes, elles évoluent ensemble. Les meilleures équipes sont bonnes sur les cinq chiffres, les moins bonnes sont faibles sur les cinq.'
	],
	terms: [
		{ term: 'Change lead time', def: 'Le temps entre le commit d’un changement dans le gestionnaire de versions et ce changement en prod.' },
		{ term: 'Deployment frequency', def: 'Le nombre de déploiements en prod sur une période, ou le temps entre deux déploiements.' },
		{ term: 'Failed deployment recovery time', def: 'Le temps pour se remettre d’un déploiement qui échoue et demande une intervention immédiate.' },
		{ term: 'Change fail rate', def: 'La part des déploiements qui demandent une intervention immédiate juste après, en général un rollback ou un hotfix.' },
		{ term: 'Deployment rework rate', def: 'La part des déploiements qui n’étaient pas prévus, mais faits à cause d’un incident en prod.' },
		{ term: 'Débit et instabilité', def: 'Les deux groupes de DORA. Débit : lead time, fréquence de déploiement, temps de rétablissement. Instabilité : change fail rate, rework rate.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['commit["Commit dans le gestionnaire de versions"] -->|"change lead time"| deploy["En prod"]'],
				highlight: ['commit', 'deploy'],
				note: 'Le **change lead time** commence au commit, pas au ticket. Il montre combien de temps du code fini attend : en revue, dans la file pour l’environnement de test, jusqu’à la prochaine fenêtre de release.'
			},
			{
				add: ['deploy -->|"à quelle fréquence"| freq["Déploiements par semaine"]'],
				highlight: ['freq'],
				note: '**Deployment frequency.** Comptée par application ou par service. Des déploiements fréquents veulent en général dire des petits lots, c’est pourquoi ce chiffre bouge avec les autres.'
			},
			{
				add: ['deploy -->|"rollback ou hotfix nécessaire"| fail["Déploiement en échec"]'],
				highlight: ['fail'],
				note: 'Le **change fail rate**, c’est les déploiements en échec divisés par tous les déploiements. 1 échec sur 4 déploiements, ça fait 25 %. Le plus dur est de décider, pour chaque incident, **quel déploiement l’a causé**.'
			},
			{
				add: ['fail -->|"failed deployment recovery time"| ok["Service rétabli"]'],
				highlight: ['ok'],
				note: '**Failed deployment recovery time.** En 2023, DORA a remplacé « time to restore service » (MTTR) par cette métrique plus étroite. Elle ne compte que les pannes causées par un changement, pas une panne de datacenter où tu n’es pour rien.'
			},
			{
				add: ['fail -.->|"non prévu"| hotfix["Déploiement de hotfix"]', 'hotfix --> deploy'],
				highlight: ['hotfix'],
				note: 'Le **deployment rework rate**, ajouté en 2024 : la part des déploiements qui sont des correctifs non prévus pour des incidents de prod. Avec le change fail rate, il mesure l’**instabilité**. Cinq métriques au total.'
			}
		]
	},
	example: {
		title: 'queries/incidents.sql (Four Keys)',
		repo: 'dora-team/fourkeys',
		url: `${FOURKEYS}/queries/incidents.sql#L1-L36`,
		lang: 'sql',
		code: `# Incidents Table
SELECT
source,
incident_id,
MIN(IF(root.time_created < issue.time_created, root.time_created, issue.time_created)) as time_created,
MAX(time_resolved) as time_resolved,
ARRAY_AGG(root_cause IGNORE NULLS) changes,
…
REGEXP_EXTRACT(metadata, r"root cause: ([[:alnum:]]*)") as root_cause,
CASE WHEN source LIKE "github%" THEN REGEXP_CONTAINS(JSON_EXTRACT(metadata, '$.issue.labels'), '"name":"Incident"')
     WHEN source LIKE "gitlab%" THEN REGEXP_CONTAINS(JSON_EXTRACT(metadata, '$.object_attributes.labels'), '"title":"Incident"')
     WHEN source LIKE "pagerduty%" THEN TRUE # All Pager Duty events are incident-related
     END AS bug,
…
LEFT JOIN (SELECT time_created, changes FROM four_keys.deployments d, d.changes) root on root.changes = root_cause
GROUP BY 1,2
HAVING max(bug) is True
;`,
		notes: [
			'Four Keys est un projet open source de l’équipe DORA pour calculer les métriques dans BigQuery à partir d’événements envoyés par des outils comme GitHub, GitLab ou PagerDuty. Le dépôt est **archivé** et son README liste encore les quatre anciens noms, comme « Time to Restore Services ». Lis-le pour l’idée, pas pour les définitions actuelles.',
			'Un incident, c’est une issue GitHub ou GitLab avec le label `Incident`, ou n’importe quel événement PagerDuty. **Pas de label, pas d’incident** : une panne gérée dans un canal de chat n’arrive jamais dans les chiffres.',
			'Le lien entre une panne et un déploiement est du simple texte : l’événement doit contenir `root cause: <id du commit>`. Le `LEFT JOIN` compare cet id aux commits livrés par chaque déploiement. C’est comme ça qu’une panne est attribuée à un déploiement, et ça dépend de gens qui écrivent cette ligne.',
			'`time_created` prend le plus tôt entre l’heure du déploiement et celle de l’issue. Le rétablissement se mesure donc du déploiement qui a causé la panne jusqu’à la fermeture de l’issue, comme le définit le [README](https://github.com/dora-team/fourkeys/blob/6cc642e037a95a280ed8d3b1624dd003b647d797/README.md?plain=1#L416-L418).'
		]
	},
	tradeoff: {
		gain: [
			'Vitesse et stabilité sont mesurées ensemble, donc personne ne peut gagner sur l’une en sacrifiant l’autre sans que ça se voie.',
			'Dev et ops regardent les mêmes quelques chiffres pour le même service, ce qui leur donne un langage commun.',
			'Tu peux suivre un service dans le temps et voir si un changement de processus a vraiment aidé.'
		],
		cost: [
			'Fais d’une métrique un objectif et les gens la truquent (loi de Goodhart) : découper un déploiement en dix, fermer les incidents trop tôt.',
			'Les données sont éparpillées entre Git, la CI, l’outil de déploiement et le suivi d’incidents. Relier une panne à son déploiement demande de la discipline.',
			'Les chiffres se lisent par application. Comparer une appli mobile et un mainframe, ou une équipe contre une autre, induit en erreur.'
		]
	},
	task: {
		prompt: 'Un service, les quatre dernières semaines : **20** déploiements. **3** d’entre eux ont demandé tout de suite un rollback ou un hotfix ; le rétablissement a pris 30 min, 2 h et 40 min. **2** des 20 étaient des hotfix non prévus, faits à cause d’incidents en prod. Un commit typique est mergé le lundi et déployé le jeudi. Calcule les cinq métriques, puis dis laquelle tu travaillerais en premier, et pourquoi.',
		hint: 'Les taux, c’est « combien sur l’ensemble des déploiements ». Pour le temps de rétablissement, une médiane se laisse moins tromper par un seul mauvais incident qu’une moyenne.',
		answer: [
			'**Deployment frequency :** 20 en 4 semaines, donc environ 5 par semaine.',
			'**Change fail rate :** 3 / 20 = 15 %. **Deployment rework rate :** 2 / 20 = 10 %.',
			'**Failed deployment recovery time :** médiane de 30 min, 40 min, 2 h = 40 min.',
			'**Change lead time :** au moins 3 jours : du merge le lundi au déploiement le jeudi, plus le temps que le commit a passé en revue avant le merge.',
			'Travaille d’abord le **lead time** : du code terminé attend trois jours. Demande-toi ce qu’il attend (un jour de release ? une validation manuelle ? un environnement de test partagé ?). Moins d’attente veut aussi dire des lots plus petits, ce qui tend à faire baisser le taux d’échec. Et n’annonce pas de chiffre cible : améliore le processus et observe la métrique.'
		]
	},
	quiz: [
		{
			q: 'Que mesure le change lead time de DORA ?',
			options: [
				'Le temps entre un commit dans le gestionnaire de versions et ce changement en prod',
				'Le temps entre l’ouverture d’un ticket et le début de la revue de code',
				'Le temps pour se remettre d’une panne',
				'La durée d’exécution du script de déploiement'
			],
			answer: 0,
			why: 'Il commence au commit et finit en prod. Il montre combien de temps du travail fini attend avant d’arriver aux utilisateurs.'
		},
		{
			q: 'En 2023, DORA a remplacé « time to restore service » (MTTR) par « failed deployment recovery time ». Qu’est-ce qui a changé ?',
			options: [
				'Elle mesure maintenant le temps pour détecter une panne au lieu du temps pour la corriger',
				'Elle n’est plus comptée que pour la couche base de données',
				'Elle ne compte que le rétablissement après des pannes causées par un changement en prod, pas des événements extérieurs comme une panne de datacenter',
				'Elle a été retirée des métriques DORA'
			],
			answer: 2,
			why: 'L’ancienne métrique mélangeait les pannes causées par un déploiement et les pannes venues de l’extérieur. La nouvelle se concentre sur le rétablissement après un changement raté, comme les autres métriques de livraison.'
		},
		{
			q: 'Un directeur annonce : « Chaque équipe doit déployer dix fois par jour d’ici la fin de l’année. » Quel piège du guide DORA est-ce ?',
			options: [
				'Se cacher derrière son secteur pour ne pas s’améliorer',
				'Avoir des métriques possédées par des silos',
				'Se concentrer sur la mesure au détriment de l’amélioration',
				'Faire des métriques un objectif, ce qui pousse les équipes à les truquer'
			],
			answer: 3,
			why: 'DORA cite la loi de Goodhart : dès que la métrique devient la cible, les équipes trouvent comment atteindre le chiffre sans améliorer la livraison.'
		}
	],
	takeaway: 'Cinq chiffres par service : change lead time, deployment frequency, failed deployment recovery time, change fail rate, deployment rework rate. Utilise-les pour voir si tu progresses, jamais comme objectif.',
	sources: [
		{ title: 'DORA, Software delivery performance metrics', url: 'https://dora.dev/guides/dora-metrics/' },
		{ title: 'DORA, A history of DORA’s software delivery metrics', url: 'https://dora.dev/insights/dora-metrics-history/' },
		{ title: 'Four Keys, README (définitions des métriques)', url: `${FOURKEYS}/README.md` },
		{ title: 'Four Keys, METRICS.md (comment chaque métrique est calculée)', url: `${FOURKEYS}/METRICS.md` }
	]
};
