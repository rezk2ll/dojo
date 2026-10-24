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
		'Dans les données de DORA, **vitesse et stabilité progressent ensemble** pour la plupart des équipes. Les meilleures équipes sont bonnes sur les cinq chiffres, et les moins bonnes sont faibles sur les cinq.'
	],
	terms: [
		{ term: 'Change lead time', def: 'Le temps entre le commit d’un changement dans le gestionnaire de versions et ce changement en prod.' },
		{ term: 'Failed deployment recovery time', def: 'Le temps pour se remettre d’un déploiement qui échoue et demande une intervention immédiate.' },
		{ term: 'Change fail rate', def: 'La part des déploiements qui demandent une intervention immédiate juste après, en général un rollback ou un hotfix.' },
		{ term: 'Deployment rework rate', def: 'La part des déploiements faits sans être prévus, à cause d’un incident en prod.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['commit["Commit dans le gestionnaire de versions"] -->|"change lead time"| deploy["En prod"]'],
				highlight: ['commit', 'deploy'],
				note: 'Le change lead time commence au commit : le temps passé par un ticket dans le backlog ne compte pas. Il montre combien de temps du code fini attend : en revue, dans la file pour l’environnement de test, jusqu’à la prochaine fenêtre de release.'
			},
			{
				add: ['deploy -->|"à quelle fréquence"| freq["Déploiements par semaine"]'],
				highlight: ['freq'],
				note: 'La deployment frequency se compte par application ou par service. Des déploiements fréquents veulent en général dire des petits lots, c’est pourquoi ce chiffre bouge avec les autres.'
			},
			{
				add: ['deploy -->|"rollback ou hotfix nécessaire"| fail["Déploiement en échec"]'],
				highlight: ['fail'],
				note: 'Le change fail rate, c’est les déploiements en échec divisés par tous les déploiements. 1 échec sur 4 déploiements, ça fait 25 %. Le plus dur est de décider, pour chaque incident, **quel déploiement l’a causé**.'
			},
			{
				add: ['fail -->|"failed deployment recovery time"| ok["Service rétabli"]'],
				highlight: ['ok'],
				note: 'En 2023, DORA a remplacé « time to restore service » (MTTR) par le failed deployment recovery time. La nouvelle métrique ne compte que les pannes causées par un changement. Une panne de datacenter où tu n’es pour rien n’y entre pas.'
			},
			{
				add: ['fail -.->|"non prévu"| hotfix["Déploiement de hotfix"]', 'hotfix --> deploy'],
				highlight: ['hotfix'],
				note: 'DORA a ajouté le deployment rework rate en 2024 : la part des déploiements qui sont des correctifs non prévus pour des incidents de prod. Avec le change fail rate, il mesure l’**instabilité**. Les trois autres mesurent le débit, soit cinq métriques au total.'
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
			'Four Keys est un projet open source de l’équipe DORA pour calculer les métriques dans BigQuery à partir d’événements envoyés par des outils comme GitHub, GitLab ou PagerDuty. Le dépôt est **archivé** et son README liste encore les quatre anciens noms, comme « Time to Restore Services ». Sers-t’en pour voir comment les chiffres se calculent, et prends les définitions actuelles sur dora.dev.',
			'Lignes 10 à 13 : un incident, c’est une issue GitHub ou GitLab avec le label `Incident`, ou n’importe quel événement PagerDuty. **Une panne gérée dans un canal de chat, sans issue étiquetée, n’arrive jamais dans les chiffres.**',
			'La ligne 9 relie une panne à un déploiement par du simple texte : l’événement doit contenir `root cause: <id du commit>`. Le `LEFT JOIN` de la ligne 15 compare cet id aux commits livrés par chaque déploiement. Si personne n’écrit cette ligne, la panne n’est jamais rattachée à un déploiement.',
			'Ligne 5 : `time_created` prend le plus tôt entre l’heure du déploiement et celle de l’issue. Le rétablissement se mesure donc du déploiement qui a causé la panne jusqu’à la fermeture de l’issue, comme le définit le [README](https://github.com/dora-team/fourkeys/blob/6cc642e037a95a280ed8d3b1624dd003b647d797/README.md?plain=1#L416-L418).'
		]
	},
	tradeoff: {
		gain: [
			'Une équipe qui déploie plus souvent en sautant les tests le voit dans son change fail rate, parce que DORA mesure vitesse et stabilité côte à côte.',
			'Dev et ops regardent les mêmes cinq chiffres pour le même service.',
			'Tu peux suivre un service dans le temps et voir si un changement de processus a vraiment aidé.'
		],
		cost: [
			'Quand une métrique sert d’objectif, les gens la truquent (loi de Goodhart) : ils découpent un déploiement en dix, ou ferment les incidents trop tôt.',
			'Les données sont éparpillées entre Git, la CI, l’outil de déploiement et le suivi d’incidents. Une panne ne compte que si quelqu’un y écrit `root cause: <id du commit>`.',
			'Chaque chiffre décrit une seule application, donc classer une appli mobile face à un mainframe, ou une équipe face à une autre, induit en erreur.'
		]
	},
	task: {
		prompt: 'Un service, les quatre dernières semaines : **20 déploiements**. 3 d’entre eux ont demandé tout de suite un rollback ou un hotfix ; le rétablissement a pris 30 min, 2 h et 40 min. 2 des 20 étaient des hotfix non prévus, faits à cause d’incidents en prod. Un commit typique est mergé le lundi et déployé le jeudi. Calcule les cinq métriques, puis dis laquelle tu travaillerais en premier, et pourquoi.',
		hint: 'Un taux compte combien de déploiements sur l’ensemble des déploiements. Pour le temps de rétablissement, un seul mauvais incident fait moins bouger une médiane qu’une moyenne.',
		answer: [
			'Deployment frequency : 20 en 4 semaines, donc environ 5 par semaine.',
			'Change fail rate : 3 / 20 = 15 %. Deployment rework rate : 2 / 20 = 10 %.',
			'Failed deployment recovery time : médiane de 30 min, 40 min, 2 h = 40 min.',
			'Change lead time : au moins 3 jours : du merge le lundi au déploiement le jeudi, plus le temps que le commit a passé en revue avant le merge.',
			'Travaille d’abord le **lead time** : du code terminé attend trois jours. Demande-toi ce qu’il attend (un jour de release ? une validation manuelle ? un environnement de test partagé ?). Avec moins d’attente, les lots sont aussi plus petits, ce qui tend à faire baisser le taux d’échec. N’annonce pas de chiffre cible : améliore le processus et observe la métrique.'
		],
		steps: [
			{
				title: 'Compte les déploiements',
				questions: [
					{ q: '20 déploiements en 4 semaines. Quelle est la deployment frequency ?', options: ['Environ 20 par semaine', 'Environ 1 par semaine', 'Environ 5 par semaine', 'Environ 4 par semaine'], answer: 2, why: '20 divisé par 4 semaines, ça fait 5 par semaine. Elle se compte par service.' },
					{ q: '3 des 20 ont demandé tout de suite un rollback ou un hotfix. Quel est le change fail rate ?', options: ['15 %', '3 %', '30 %', '10 %'], answer: 0, why: 'Les déploiements en échec divisés par tous les déploiements : 3 / 20 = 15 %.' },
					{ q: '2 des 20 étaient des hotfix non prévus, faits à cause d’incidents en prod. Quel est le deployment rework rate ?', options: ['2 %', '15 %', '20 %', '10 %'], answer: 3, why: 'Les déploiements non prévus divisés par tous les déploiements : 2 / 20 = 10 %.' },
					{ q: 'Ensemble, le change fail rate et le deployment rework rate mesurent quoi ?', options: ['Le débit', 'L’instabilité', 'Le lead time', 'La disponibilité'], answer: 1, why: 'Ces deux-là mesurent l’instabilité. Les trois autres mesurent le débit.' }
				]
			},
			{
				title: 'Calcule le temps de rétablissement',
				questions: [
					{ q: 'Quelles pannes comptent dans le failed deployment recovery time ?', options: ['Toutes les pannes, quelle qu’en soit la cause', 'Seulement les pannes causées par un déploiement', 'Seulement les pannes de datacenter', 'Seulement les pannes trouvées par les utilisateurs'], answer: 1, why: 'Depuis 2023, la métrique ne compte que les pannes causées par un changement, contrairement à l’ancien « time to restore service ».' },
					{ q: 'Les rétablissements ont pris 30 min, 2 h et 40 min. Quelle est la médiane ?', options: ['30 min', '2 h', '40 min', '1 h 03'], answer: 2, why: 'Dans l’ordre : 30 min, 40 min, 2 h. La valeur du milieu est 40 min.' },
					{ q: 'Pourquoi prendre la médiane plutôt que la moyenne ici ?', options: ['Un seul mauvais incident fait moins bouger une médiane qu’une moyenne', 'DORA interdit les moyennes', 'La moyenne est toujours plus basse', 'La médiane ne compte que les déploiements prévus'], answer: 0, why: 'L’incident de 2 h tirerait la moyenne vers le haut. La médiane montre le rétablissement typique.' },
					{ q: 'Dans Four Keys, quand commence le temps de rétablissement ?', options: ['Quand l’issue reçoit son label', 'Quand quelqu’un ouvre un canal de chat', 'Quand le hotfix est mergé', 'Au déploiement qui a causé la panne'], answer: 3, why: 'Four Keys prend le plus tôt entre l’heure du déploiement et celle de l’issue, donc le rétablissement va du mauvais déploiement à la fermeture de l’issue.' }
				]
			},
			{
				title: 'Mesure le lead time',
				questions: [
					{ q: 'Où commence le change lead time ?', options: ['À la création du ticket', 'Au commit dans le gestionnaire de versions', 'Au début de la revue de code', 'Au démarrage du pipeline'], answer: 1, why: 'Il va du commit jusqu’au changement en prod. Le temps dans le backlog ne compte pas.' },
					{ q: 'Un commit typique est mergé le lundi et déployé le jeudi. Quel est le lead time ?', options: ['Au moins 3 jours, plus le temps de revue avant le merge', 'Exactement 1 jour', 'Zéro, puisque le code était déjà mergé', 'Exactement 4 semaines'], answer: 0, why: 'Du lundi au jeudi, ça fait trois jours, et le commit a pu aussi attendre en revue avant le merge.' },
					{ q: 'Que montre en général un lead time long ?', options: ['Que le pipeline met longtemps à tourner', 'Que les développeurs écrivent trop peu de code', 'Que du code fini attend : en revue, dans une file, pour une fenêtre de release', 'Que trop de déploiements échouent'], answer: 2, why: 'Le lead time montre combien de temps du code fini attend avant d’arriver aux utilisateurs.' },
					{ q: '5 déploiements par semaine avec un lead time de 3 jours, est-ce contradictoire ?', options: ['Oui, des déploiements fréquents veulent toujours dire un lead time court', 'Oui, un des chiffres doit être faux', 'Non, parce que le lead time ne compte que les hotfix', 'Non : le service déploie souvent, mais chaque commit attend quand même des jours'], answer: 3, why: 'La fréquence compte les déploiements. Le lead time suit un commit, et chacun attend toujours du lundi au jeudi.' }
				]
			},
			{
				title: 'Choisis quoi améliorer',
				questions: [
					{ q: 'Quelle métrique travailles-tu en premier ?', options: ['Le lead time', 'La deployment frequency', 'Le deployment rework rate', 'Le temps de rétablissement'], answer: 0, why: 'Du code terminé attend trois jours. C’est la plus grosse attente dans les chiffres.' },
					{ q: 'Quelle question poses-tu sur l’attente du lundi au jeudi ?', options: ['Qui a mergé le code en retard', 'Ce que le code attend : un jour de release, une validation manuelle, un environnement de test partagé', 'Comment déployer moins souvent', 'Quel développeur blâmer'], answer: 1, why: 'Trouve ce que le code fini attend, puis supprime cette attente.' },
					{ q: 'Pourquoi un lead time plus court peut-il aussi faire baisser le taux d’échec ?', options: ['Parce que moins de déploiements, c’est moins de pannes', 'Parce que les hotfix ne comptent plus', 'Parce que moins d’attente veut dire des lots plus petits', 'Parce qu’on peut sauter les tests'], answer: 2, why: 'Des lots plus petits, c’est moins de changements par déploiement, et dans les données de DORA vitesse et stabilité progressent ensemble.' },
					{ q: 'Ton manager veut annoncer « lead time sous 1 jour d’ici juin ». Que réponds-tu ?', options: ['Bonne idée, les objectifs rendent les équipes plus rapides', 'Prendre plutôt la deployment frequency comme objectif', 'Fixer l’objectif pour toutes les équipes d’un coup', 'Pas de chiffre cible : améliorer le processus et observer la métrique'], answer: 3, why: 'Une métrique qui sert d’objectif pousse à la truquer (loi de Goodhart).' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Que mesure le change lead time de DORA ?',
			options: [
				'Le temps entre un commit dans le gestionnaire de versions et ce changement en prod',
				'Le temps entre l’ouverture d’un ticket et le début de la revue de code',
				'Le temps pour rétablir le service après qu’un déploiement a causé une panne',
				'La durée du pipeline de déploiement, de la première étape de build à la dernière'
			],
			answer: 0,
			why: 'Il commence au commit et finit en prod. Il montre combien de temps du travail fini attend avant d’arriver aux utilisateurs.'
		},
		{
			q: 'En 2023, DORA a remplacé « time to restore service » (MTTR) par « failed deployment recovery time ». Qu’est-ce qui a changé ?',
			options: [
				'Elle mesure maintenant le temps pour détecter une panne au lieu du temps pour la corriger',
				'Elle n’est plus comptée que pour la couche base de données, où démarrent la plupart des pannes',
				'Elle ne compte que le rétablissement après une panne causée par un changement en prod, pas par l’extérieur',
				'Elle a été retirée des métriques DORA et remplacée par le change failure rate'
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
			why: 'DORA cite la loi de Goodhart : dès que la métrique sert de cible, les équipes trouvent comment atteindre le chiffre sans améliorer la livraison.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Calculer des chiffres DORA à partir de l’historique git d’un vrai projet, et trouver ceux que git ne peut pas te donner.',
		steps: [
			'Clone la CLI GitHub avec son historique et ses tags, sans le contenu des fichiers : `mkdir -p ~/dora-lab && cd ~/dora-lab && git clone --filter=blob:none https://github.com/cli/cli.git && cd cli`.',
			'Liste ses releases, de la plus récente à la plus ancienne, dans un CSV que tu peux ouvrir dans un tableur : `git for-each-ref --sort=-creatordate --format=\'%(creatordate:short),%(refname:short)\' \'refs/tags/v*\' > ../releases.csv && head ../releases.csv`. Compte chaque release comme un déploiement.',
			'Compte les releases des 12 dernières semaines, et parmi elles les releases de patch (un dernier chiffre autre que 0, comme `v2.103.1`) : `awk -F, -v since="$(date -d \'12 weeks ago\' +%F)" \'$1 >= since {n++; if ($2 !~ /\\.0$/) p++} END {print n " releases, " p " patch releases"}\' ../releases.csv`. Sur macOS, utilise `date -v-12w +%F`.',
			'Mesure le change lead time de la dernière release mineure, de chaque commit jusqu’à la release : `last=$(grep \'\\.0$\' ../releases.csv | sed -n 1p | cut -d, -f2); prev=$(grep \'\\.0$\' ../releases.csv | sed -n 2p | cut -d, -f2); t=$(git log -1 --format=%ct "$last"); git log --no-merges --format=%ct "$prev..$last" | awk -v t="$t" \'{print (t - $1) / 86400}\' | sort -n | awk \'{a[NR] = $1} END {print NR " commits, median " a[int((NR + 1) / 2)] " days"}\'`. Compare avec le nombre de jours entre `$prev` et `$last` dans `releases.csv`.',
			'Écris `~/dora-lab/notes.txt` avec une ligne par métrique : déploiements par semaine, deployment rework rate, change lead time, et pour le change fail rate et le temps de rétablissement, un chiffre ou les données qu’il te faudrait.'
		],
		done: [
			'`releases.csv` a une ligne par tag `v*`, de la plus récente à la plus ancienne, chacune avec une date.',
			'L’étape 3 affiche deux nombres, et tu en as tiré des releases par semaine (nombre / 12) et une part de releases de patch.',
			'L’étape 4 affiche un nombre de commits et une médiane en jours.',
			'`notes.txt` a une ligne pour chacune des cinq métriques.'
		],
		solution: [
			'Au moment de l’écriture : 9 releases en 12 semaines (environ 0,75 par semaine), dont 3 patchs (33 %), et un lead time médian de 6 jours sur les 193 commits de `v2.103.0`. Tes chiffres seront différents, parce que le projet continue de sortir des releases.',
			'Une release de patch est une correction non prévue, donc patchs / toutes les releases donne un deployment rework rate. Pour le change fail rate, compte les releases `.0` qui ont eu une `.1` : `v2.103.0` en a eu deux en deux jours.',
			'Un commit mergé juste après une release attend la suivante, donc le lead time suit l’écart entre les releases. Cette attente, c’est la fenêtre de release de la leçon, pas le build.',
			'Le temps de rétablissement n’est pas dans git : il te faut le début et la fin de chaque panne, depuis un outil de tickets ou un pager. C’est le problème de Four Keys : les chiffres ne comptent que ce que quelqu’un enregistre.',
			'Un tag est une release que les utilisateurs installent eux-mêmes, pas un déploiement sur un serveur. Utilise ces chiffres pour suivre un projet dans le temps, pas pour le classer face à un service web. Nettoie avec `rm -rf ~/dora-lab`.'
		]
	},
	recall: {
		q: 'Quels sont les cinq chiffres que DORA suit par service, et pourquoi un manager ne doit-il pas en faire un objectif ?',
		a: 'Change lead time, deployment frequency, failed deployment recovery time, change fail rate et deployment rework rate. Un objectif pousse à truquer le chiffre (loi de Goodhart), par exemple en découpant un déploiement en dix.'
	},
	sources: [
		{ title: 'DORA, Software delivery performance metrics', url: 'https://dora.dev/guides/dora-metrics/' },
		{ title: 'DORA, A history of DORA’s software delivery metrics', url: 'https://dora.dev/insights/dora-metrics-history/' },
		{ title: 'Four Keys, README (définitions des métriques)', url: `${FOURKEYS}/README.md` },
		{ title: 'Four Keys, METRICS.md (comment chaque métrique est calculée)', url: `${FOURKEYS}/METRICS.md` }
	]
};
