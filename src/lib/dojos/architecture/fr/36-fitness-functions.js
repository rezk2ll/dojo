const KAFKA = 'https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'fitness-functions',
	part: 'Le métier d’architecte',
	title: 'Fitness functions : des décisions qui se vérifient toutes seules',
	minutes: 10,
	hook: [
		'Ta boutique en ligne a une règle de couches comme celle du jour 10 : `web` appelle `service`, `service` appelle `repository`, jamais dans l’autre sens. Rien ne la vérifie. L’an prochain, quelqu’un de pressé importe un helper web depuis un repository. La CI est verte, le relecteur ne voit rien, et **la règle disparaît sans que personne ait décidé de l’abandonner**.',
		'Quand une règle n’existe que dans un document ou dans la tête d’un relecteur, rien n’échoue le jour où le code la viole. Un test peut la vérifier, comme les tests vérifient les fonctionnalités. Ce test-là vérifie une caractéristique d’architecture, par exemple les couches.',
		'Le livre Building Evolutionary Architectures appelle ça une **fitness function**. Un article de Thoughtworks : « Les fitness functions décrivent à quel point une architecture est proche d’atteindre un objectif architectural. » Apache Kafka en a une pour ses couches, et elle tourne sur chaque pull request.'
	],
	terms: [
		{ term: 'Fitness function', def: 'Une vérification objective d’une caractéristique d’architecture. La plupart sont automatisées et font passer ou échouer le build. Le livre admet aussi des vérifications manuelles, qui demandent un humain.' },
		{ term: 'Dérive', def: 'Le code qui s’éloigne lentement d’une décision, un changement d’apparence raisonnable à la fois.' },
		{ term: 'Allowlist', def: 'Une règle qui interdit tout sauf ce qu’elle nomme. Les exceptions connues sont listées une par une, donc une nouvelle violation ne peut pas passer inaperçue.' },
		{ term: 'Déclenchée ou continue', def: 'Les vérifications déclenchées tournent sur un événement (un commit, une release, un lancement manuel). Les continues tournent en permanence, comme le monitoring de production.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['char["Caractéristique : couches propres"] -->|rendue mesurable| scen["Règle : common n’importe jamais clients"]'],
				highlight: ['char', 'scen'],
				note: 'Pars d’une caractéristique (jour 2) et rends-la assez précise pour être vérifiée. Aucun outil ne sait vérifier « des couches propres ». Une machine sait tester « le package `common` n’importe jamais le package `clients` ».'
			},
			{
				add: ['scen -->|automatisée par| ff["Checkstyle ImportControl"]', 'ff -->|lit| xml["import-control.xml"]'],
				highlight: ['ff', 'xml'],
				note: 'Kafka écrit ses règles de couches dans un seul fichier XML. L’outil Checkstyle lit chaque ligne `import` du code Java et la compare à ce fichier.'
			},
			{
				add: ['ff -->|succès| green["La décision tient toujours"]', 'ff -->|échec| red["Build en échec, PR bloquée"]'],
				highlight: ['green', 'red'],
				note: 'Checkstyle fait passer ou échouer le build. Un build en échec bloque la pull request, donc l’équipe discute de l’import avant de merger le changement.'
			},
			{
				add: ['pr(["Chaque pull request"]) -->|gradlew check| ff'],
				highlight: ['pr'],
				note: 'Le job de CI lance `./gradlew check`, et la tâche `check` de Gradle inclut toutes les tâches Checkstyle. Cette règle structurelle tourne donc sur **chaque** pull request, sans que personne la lance à la main.'
			},
			{
				add: ['load["Vérification lente : test de charge avec une limite de latence"] -->|la nuit ou avant une release| green', 'load --> red'],
				highlight: ['load'],
				note: 'Une vérification lente, comme un test de charge de 20 minutes, ne peut pas bloquer chaque PR. Tu la **déclenches** plutôt selon un planning ou avant une release.'
			}
		]
	},
	example: {
		title: 'checkstyle/import-control.xml',
		repo: 'apache/kafka',
		url: `${KAFKA}/checkstyle/import-control.xml#L21-L55`,
		lang: 'xml',
		code: `<import-control pkg="org.apache.kafka">

  <!-- THINK HARD ABOUT THE LAYERING OF THE PROJECT BEFORE CHANGING THIS FILE -->
…
  <!-- no one depends on the server -->
  <disallow pkg="kafka" />
…
  <subpackage name="common">
    <allow class="org.apache.kafka.clients.consumer.ConsumerRecord" exact-match="true" />
    <allow class="org.apache.kafka.clients.NodeApiVersions" exact-match="true" />
    <allow class="org.apache.kafka.common.message.ApiMessageType" exact-match="true" />
    <disallow pkg="org.apache.kafka.clients" />`,
		notes: [
			'Lignes 5 et 6 : `kafka` est le package du cœur Scala du broker. La ligne 6 refuse tout import depuis ce package, et une machine fait ainsi respecter la règle du jour 10 « personne ne dépend du serveur ».',
			'Les lignes 8 à 12 forment le bloc `common`, et Checkstyle applique la **première** règle qui correspond. Les lignes 9 et 10 autorisent deux classes de `clients` nommées, et la ligne 12 refuse tout autre import depuis `clients`. Une nouvelle exception demande une nouvelle ligne dans ce fichier, et un relecteur la voit.',
			'Un import qui ne correspond à aucune règle est refusé par défaut, selon la [doc Checkstyle](https://checkstyle.sourceforge.io/checks/imports/importcontrol.html). Le fichier est donc une allowlist : chaque dépendance autorisée y est nommée.',
			`Le \`build.gradle\` de Kafka fait pointer chaque sous-projet vers ce fichier (lien dans les sources). Le [job de CI](${KAFKA}/.github/workflows/build.yml#L137-L158) lance \`./gradlew check\`, puis une étape qui annote les erreurs Checkstyle en cas d’échec.`
		]
	},
	tradeoff: {
		gain: [
			'Checkstyle refuse un mauvais import sur chaque pull request, même quand le relecteur le rate.',
			'La dérive est attrapée sur la pull request qui la cause, quand la correction tient en une ligne.',
			'La règle de couches est écrite dans `import-control.xml`, que l’équipe peut lire et modifier dans une pull request relue.'
		],
		cost: [
			'Chaque vérification est du code à maintenir, et elle casse quand l’architecture change volontairement.',
			'Les vérifications instables (tests de performance sur des machines de CI partagées) échouent au hasard, et les gens prennent l’habitude de merger sur un build rouge.',
			'Un test de charge de 20 minutes ne peut pas tourner sur chaque PR. Il tourne selon un planning, et quelqu’un doit lire son résultat.'
		]
	},
	task: {
		prompt: 'Ta boutique en ligne est en Java, avec les packages `com.shop.web`, `com.shop.service` et `com.shop.repository`. Écris le fichier import-control de Checkstyle pour la règle : `web` peut utiliser `service`, `service` peut utiliser `repository`, jamais dans l’autre sens. Ensuite : quelqu’un a besoin d’une classe de `web` dans `service`, « juste pour cette fois ». Que fais-tu ?',
		hint: 'Un import qui ne correspond à aucune règle est refusé. Tu n’écris donc que des lignes `allow`. Une classe qui ne trouve aucune règle dans son propre sous-package se rabat sur les règles du parent.',
		answer: [
			'Une racine `<import-control pkg="com.shop">` avec `<allow pkg="java" />`, pour que chaque couche puisse utiliser la bibliothèque standard.',
			'`<subpackage name="web">` autorise `com.shop.web` et `com.shop.service`.',
			'`<subpackage name="service">` autorise `com.shop.service` et `com.shop.repository`.',
			'`<subpackage name="repository">` n’autorise que `com.shop.repository`. Rien d’autre n’est listé, donc les imports de `web` et de `service` depuis ce package font échouer le build.',
			'« Juste pour cette fois » : si tu l’acceptes, ajoute une ligne `<allow class="..." exact-match="true" />`, comme Kafka, pour que l’exception soit **nommée et relue**. Mieux : descends la classe partagée dans `service` ou dans un package commun, et garde la règle propre.',
			'Lance-la dans le même job de CI que les tests, pour qu’elle protège chaque pull request.'
		],
		steps: [
			{
				title: 'Pars du comportement par défaut',
				questions: [
					{ q: 'Un import ne correspond à aucune règle du fichier. Que fait Checkstyle ?', options: ['Il l’autorise', 'Il affiche un avertissement et laisse passer', 'Il le refuse', 'Il saute le fichier'], answer: 2, why: 'ImportControl refuse par défaut, donc le fichier est une allowlist.' },
					{ q: 'Quel type de lignes écris-tu alors pour cette règle ?', options: ['Seulement des lignes `allow`', 'Seulement des lignes `disallow`', 'Un `disallow` par paire interdite', 'Un `allow` et un `disallow` par couche'], answer: 0, why: 'Tout ce qui n’est pas nommé est déjà refusé. Tu nommes seulement ce que chaque couche peut utiliser.' },
					{ q: 'Que mets-tu sur l’élément racine ?', options: ['`<import-control pkg="com.shop.web">`', '`<import-control pkg="java">`', '`<import-control pkg="com.shop.repository">`', '`<import-control pkg="com.shop">`'], answer: 3, why: 'La racine couvre toute la boutique, et chaque couche est un sous-package en dessous.' },
					{ q: 'Pourquoi ajouter `<allow pkg="java" />` à la racine ?', options: ['Pour autoriser tous les imports du projet', 'Pour que chaque couche puisse utiliser la bibliothèque standard', 'Parce que Checkstyle a besoin d’au moins une règle', 'Pour laisser `repository` appeler `web`'], answer: 1, why: 'Une classe qui ne trouve aucune règle dans son sous-package se rabat sur les règles du parent, donc une ligne couvre toutes les couches.' }
				]
			},
			{
				title: 'Écris chaque couche',
				questions: [
					{ q: 'Qu’autorise `<subpackage name="web">` ?', options: ['`com.shop.web` et `com.shop.service`', 'Seulement `com.shop.web`', '`com.shop.web`, `com.shop.service` et `com.shop.repository`', 'Seulement `com.shop.service`'], answer: 0, why: '`web` appelle `service`, et ses propres classes. Il ne descend pas directement jusqu’à `repository`.' },
					{ q: 'Qu’autorise `<subpackage name="service">` ?', options: ['`com.shop.service` et `com.shop.web`', '`com.shop.service` et `com.shop.repository`', 'Seulement `com.shop.repository`', 'Tout ce qui est sous `com.shop`'], answer: 1, why: '`service` appelle `repository`, jamais vers le haut jusqu’à `web`.' },
					{ q: 'Qu’autorise `<subpackage name="repository">` ?', options: ['`com.shop.repository` et `com.shop.service`', 'Tout ce qui est sous `com.shop`', 'Rien du tout', 'Seulement `com.shop.repository`'], answer: 3, why: 'C’est la couche du bas, donc elle ne peut utiliser qu’elle-même (et la bibliothèque standard, via la racine).' },
					{ q: 'Une classe de repository importe un helper de `web`. Que se passe-t-il ?', options: ['Ça passe : `web` est autorisé à la racine', 'Checkstyle affiche un avertissement', 'Le build échoue : aucune règle ne l’autorise', 'Ça passe si le relecteur approuve'], answer: 2, why: 'Rien ne nomme `com.shop.web` pour `repository`, donc le comportement par défaut le refuse.' }
				]
			},
			{
				title: 'Traite le « juste pour cette fois »',
				questions: [
					{ q: 'Quelqu’un a besoin d’une classe de `web` dans `service`. Que se passe-t-il si tu ne fais rien ?', options: ['Le build échoue sur sa pull request', 'Checkstyle l’autorise une fois', 'L’import marche jusqu’à la prochaine release', 'Le relecteur reçoit seulement un avertissement'], answer: 0, why: 'L’import n’est pas autorisé, donc la vérification bloque la pull request et l’équipe en discute d’abord.' },
					{ q: 'Si tu acceptes l’exception, comment l’écris-tu ?', options: ['Autoriser tout `com.shop.web` dans `service`', 'Désactiver Checkstyle pour ce fichier', 'Une ligne `<allow class="..." exact-match="true" />`', 'Un commentaire au-dessus de l’import'], answer: 2, why: 'Kafka fait ça dans son bloc `common` : l’exception est nommée, une classe à la fois, et un relecteur la voit.' },
					{ q: 'Pourquoi nommer la seule classe plutôt que tout le package ?', options: ['Checkstyle ne sait pas autoriser un package entier', 'Pour qu’une nouvelle violation ne puisse pas passer sous la même ligne', 'Une règle de classe tourne plus vite', 'Les règles de package ne marchent qu’à la racine'], answer: 1, why: 'Une allowlist liste les exceptions connues une par une. Une règle de package laisserait entrer toutes les autres classes de `web`.' },
					{ q: 'Quelle est la meilleure correction ?', options: ['Ajouter l’exception et corriger plus tard', 'Copier la classe dans `service`', 'Supprimer la règle de `service`', 'Descendre la classe partagée dans `service` ou un package commun'], answer: 3, why: 'Si la classe a sa place plus bas, la déplacer garde la règle propre et ne demande aucune exception.' }
				]
			},
			{
				title: 'Fais-la tourner sur chaque PR',
				questions: [
					{ q: 'Où tourne cette vérification ?', options: ['Dans le même job de CI que les tests', 'Une fois par mois, chez l’architecte', 'Seulement avant une release', 'Dans la supervision de production'], answer: 0, why: 'Une vérification structurelle rapide peut protéger chaque pull request sans ralentir l’équipe.' },
					{ q: 'Chez Kafka, quelle commande lance Checkstyle en CI ?', options: ['`./gradlew test`', '`./gradlew checkstyle`', '`./gradlew build --scan`', '`./gradlew check`'], answer: 3, why: 'La tâche `check` de Gradle inclut chaque tâche Checkstyle, donc la règle tourne sans étape en plus.' },
					{ q: 'Cette vérification est-elle déclenchée ou continue ?', options: ['Continue : elle tourne tout le temps', 'Déclenchée : elle tourne à chaque commit', 'Ni l’un ni l’autre : elle est manuelle', 'Les deux, puisque la CI ne s’arrête jamais'], answer: 1, why: 'Une vérification déclenchée tourne sur un événement, comme un commit. Une continue tourne tout le temps, comme la supervision de production.' },
					{ q: 'Sans cette vérification, que devient la règle des couches avec le temps ?', options: ['Rien : les relecteurs attrapent toujours les imports vers le haut', 'Java refuse de toute façon les imports vers le haut', 'Elle dérive, un changement d’apparence raisonnable à la fois', 'Gradle prévient'], answer: 2, why: 'Une règle sans rien qui échoue quand le code la casse disparaît sans que personne ait décidé de l’abandonner.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Qu’est-ce qui fait d’une vérification une **fitness function** plutôt qu’un test ordinaire ?',
			options: ['Elle teste une fonctionnalité métier de bout en bout, de l’interface jusqu’à la base de données', 'Elle donne une évaluation objective d’une caractéristique d’architecture, idéalement automatisée en succès ou échec', 'Elle ne tourne qu’en production', 'Elle est écrite et possédée par l’architecte, pas par les développeurs qui maintiennent le code'],
			answer: 1,
			why: 'Elle vérifie une « -ilité » comme les couches, la fiabilité ou la latence. Elle est objective : toute personne qui la lance obtient le même succès ou échec. Le livre admet aussi des fitness functions manuelles, mais ce sont les automatisées qui protègent chaque changement.'
		},
		{
			q: 'Un fichier Java du package `common` de Kafka importe une classe qu’aucune règle de `import-control.xml` ne mentionne. Que fait Checkstyle ?',
			options: ['Il l’autorise, puisqu’aucune règle du fichier n’interdit cet import', 'Il affiche un avertissement pour l’import inconnu mais laisse passer le build', 'Il le refuse : sans règle correspondante, un import est interdit par défaut', 'Il ignore le fichier, car seuls les imports nommés dans une règle sont vérifiés'],
			answer: 2,
			why: 'Par défaut, ImportControl de Checkstyle considère l’import comme « disallowed ». Le fichier est une allowlist : chaque dépendance doit être nommée quelque part.'
		},
		{
			q: 'Un test de charge prend 20 minutes. Où a-t-il sa place ?',
			options: ['Sur chaque commit, en bloquant le merge tant que le test de charge complet n’est pas passé', 'Nulle part, un test de 20 minutes est trop lent pour apprendre quoi que ce soit à l’équipe', 'Seulement après qu’un client a signalé de la lenteur, pour viser un vrai problème', 'Selon un planning ou avant une release, pendant que les vérifications structurelles légères tournent à chaque PR'],
			answer: 3,
			why: 'Les vérifications statiques rapides peuvent tourner sur chaque changement sans ralentir l’équipe. Les dynamiques lentes tournent selon un planning ou comme barrière de release, et quelqu’un doit être responsable du résultat.'
		}
	],
	recall: {
		q: 'Quelle fitness function protège les couches de Kafka, et quand tourne-t-elle ?',
		a: 'ImportControl de Checkstyle, qui lit `checkstyle/import-control.xml`. La CI la lance avec `./gradlew check` sur chaque pull request, et un import sans règle correspondante fait échouer le build.'
	},
	sources: [
		{ title: 'Thoughtworks, Fitness function-driven development (Paul, Wang, 2019)', url: 'https://www.thoughtworks.com/en-us/insights/articles/fitness-function-driven-development' },
		{ title: 'Parsons, Ford, Kua, Sadalage, Building Evolutionary Architectures, 2nd ed.', url: 'https://www.thoughtworks.com/en-us/insights/books/building-evolutionaryarchitectures-second-edition' },
		{ title: 'Neal Ford, Evolutionary Architectures workshop slides (categories of fitness functions)', url: 'https://nealford.com/downloads/Evolutionary_Architectures_workshop_by_Neal_Ford.pdf' },
		{ title: 'Ford, Parsons, Kua, Evolutionary Architecture (book site, 1st ed.)', url: 'https://evolutionaryarchitecture.com/' },
		{ title: 'Checkstyle docs, ImportControl', url: 'https://checkstyle.sourceforge.io/checks/imports/importcontrol.html' },
		{ title: 'Apache Kafka, checkstyle/import-control.xml', url: `${KAFKA}/checkstyle/import-control.xml#L21-L55` },
		{ title: 'Apache Kafka, CI build workflow (Compile and Check)', url: `${KAFKA}/.github/workflows/build.yml#L111-L158` },
		{ title: 'Apache Kafka, build.gradle (Checkstyle config)', url: `${KAFKA}/build.gradle#L870-L886` }
	]
};
