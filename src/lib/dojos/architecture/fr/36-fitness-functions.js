const KAFKA = 'https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'fitness-functions',
	part: 'Le métier d’architecte',
	title: 'Fitness functions : des décisions qui se vérifient toutes seules',
	minutes: 10,
	hook: [
		'Ta boutique en ligne a une règle de couches comme celle du jour 10 : `web` appelle `service`, `service` appelle `repository`, jamais dans l’autre sens. Rien ne la vérifie. L’an prochain, quelqu’un de pressé importe un helper web depuis un repository. La CI est verte, le relecteur ne voit rien, et **la règle disparaît sans que personne ait décidé de l’abandonner**.',
		'Les règles qui vivent seulement dans un document ou dans la tête d’un relecteur dérivent. La solution est la même que pour les fonctionnalités : un test. Pas pour la fonctionnalité, pour la **caractéristique d’architecture**.',
		'Le livre Building Evolutionary Architectures appelle ça une **fitness function**. Comme le dit un article de Thoughtworks : « Fitness functions describe how close an architecture is to achieving an architectural aim. » (les fitness functions décrivent à quel point une architecture est proche d’atteindre un objectif d’architecture). Apache Kafka en a une pour ses couches, et elle tourne sur chaque pull request. Allons la lire.'
	],
	terms: [
		{ term: 'Fitness function', def: 'Une vérification objective d’une caractéristique d’architecture. La plupart sont automatisées et donnent un succès ou un échec, pas une opinion. Le livre admet aussi des vérifications manuelles, qui demandent un humain.' },
		{ term: 'Architecture évolutive', def: 'Une architecture conçue pour changer par petits pas. Selon les auteurs, elle rend « explicit what “fit” means with as much automation as possible » (explicite ce que « adapté » veut dire, avec autant d’automatisation que possible).' },
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
				note: 'Pars d’une caractéristique (jour 2) et rends-la assez précise pour être vérifiée. « Des couches propres », c’est une impression. « Le package `common` n’importe jamais le package `clients` », c’est une règle qu’une machine peut tester.'
			},
			{
				add: ['scen -->|automatisée par| ff["Checkstyle ImportControl"]', 'ff -->|lit| xml["import-control.xml"]'],
				highlight: ['ff', 'xml'],
				note: 'Kafka écrit ses règles de couches dans un seul fichier XML. L’outil Checkstyle lit chaque ligne `import` du code Java et la compare à ce fichier.'
			},
			{
				add: ['ff -->|succès| green["La décision tient toujours"]', 'ff -->|échec| red["Build en échec, PR bloquée"]'],
				highlight: ['green', 'red'],
				note: 'Le résultat est **succès ou échec**, rien entre les deux. Un build rouge, c’est une discussion sur l’architecture, avant que le changement soit mergé.'
			},
			{
				add: ['pr(["Chaque pull request"]) -->|gradlew check| ff'],
				highlight: ['pr'],
				note: 'Qui la lance ? Personne n’a besoin d’y penser. Le job de CI lance `./gradlew check`, et la tâche `check` de Gradle inclut toutes les tâches Checkstyle. Une règle structurelle peu coûteuse comme celle-ci tourne sur **chaque** pull request.'
			},
			{
				add: ['load["Vérification lente : test de charge avec une limite de latence"] -->|la nuit ou avant une release| green', 'load --> red'],
				highlight: ['load'],
				note: 'Les vérifications lentes, comme un test de charge de 20 minutes, ne peuvent pas bloquer chaque PR. Elles sont plutôt **déclenchées** selon un planning ou à une release. Adapte le déclencheur au coût.'
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
			'`kafka` est le package du cœur Scala du broker. « Personne ne dépend du serveur », c’est une règle de couches du jour 10, écrite pour qu’une machine puisse la faire respecter.',
			'Lis le bloc `common` dans l’ordre. Checkstyle retient la **première** règle qui correspond. Donc deux classes de `clients` nommées sont autorisées, puis tout autre import depuis `clients` est refusé. Les exceptions connues sont listées par leur nom, et une nouvelle exception demande un changement visible dans ce fichier.',
			'Un import qui ne correspond à aucune règle est **refusé par défaut**, selon la [doc Checkstyle](https://checkstyle.sourceforge.io/checks/imports/importcontrol.html). Le fichier est une allowlist, pas une liste d’interdictions.',
			`C’est branché, pas optionnel. Le [build](${KAFKA}/build.gradle#L870-L886) fait pointer chaque sous-projet vers ce fichier, et le [job de CI](${KAFKA}/.github/workflows/build.yml#L137-L158) lance \`./gradlew check\`, puis une étape qui annote les erreurs Checkstyle en cas d’échec.`
		]
	},
	tradeoff: {
		gain: [
			'Les décisions sont appliquées par une machine, pas par la mémoire d’un relecteur.',
			'La dérive est attrapée sur la pull request qui la cause, quand la correction tient en une ligne.',
			'Une caractéristique devient une règle que l’équipe peut lire et discuter, au lieu d’une impression.'
		],
		cost: [
			'Chaque vérification est du code à maintenir, et elle casse quand l’architecture change volontairement.',
			'Les vérifications instables (tests de performance sur des machines de CI partagées) apprennent aux gens à ignorer le rouge. C’est pire que pas de vérification du tout.',
			'Les vérifications lentes ne peuvent pas tourner sur chaque PR, donc elles tournent rarement, et une vérification que personne ne lance ne protège rien.'
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
		]
	},
	quiz: [
		{
			q: 'Qu’est-ce qui fait d’une vérification une **fitness function** plutôt qu’un test ordinaire ?',
			options: ['Elle teste une fonctionnalité métier de bout en bout, de l’interface jusqu’à la base de données', 'Elle donne une évaluation objective d’une caractéristique d’architecture, idéalement automatisée en succès ou échec', 'Elle ne tourne qu’en production', 'Elle est écrite et possédée par l’architecte, pas par les développeurs qui maintiennent le code'],
			answer: 1,
			why: 'La cible est une « -ilité » (couches, fiabilité, latence), pas une fonctionnalité. Et elle doit être objective, sinon ce n’est qu’une opinion. Le livre admet aussi des fitness functions manuelles, mais ce sont les automatisées qui protègent chaque changement.'
		},
		{
			q: 'Un fichier Java du package `common` de Kafka importe une classe qu’aucune règle de `import-control.xml` ne mentionne. Que fait Checkstyle ?',
			options: ['Il l’autorise, puisque rien ne l’interdit', 'Il affiche un avertissement mais laisse passer le build', 'Il le refuse : sans règle correspondante, un import est interdit par défaut', 'Il ignore le fichier'],
			answer: 2,
			why: 'Par défaut, ImportControl de Checkstyle considère l’import comme « disallowed ». Le fichier est une allowlist : chaque dépendance doit être nommée quelque part.'
		},
		{
			q: 'Un test de charge prend 20 minutes. Où a-t-il sa place ?',
			options: ['Sur chaque commit, en bloquant le merge', 'Nulle part, il est trop lent pour être utile', 'Seulement après qu’un client a signalé de la lenteur', 'Déclenché selon un planning ou avant une release, pendant que les vérifications structurelles peu coûteuses tournent sur chaque PR'],
			answer: 3,
			why: 'Adapte le déclencheur au coût. Les vérifications statiques rapides protègent chaque changement. Les dynamiques lentes tournent selon un planning ou comme barrière de release, et quelqu’un doit être responsable du résultat.'
		}
	],
	takeaway: 'Une décision que personne ne vérifie finira par dériver. Transforme les plus importantes en succès ou échec automatisé, et assure-toi que quelque chose les lance.',
	sources: [
		{ title: 'Thoughtworks, Fitness function-driven development (Paul, Wang, 2019)', url: 'https://www.thoughtworks.com/en-us/insights/articles/fitness-function-driven-development' },
		{ title: 'Parsons, Ford, Kua, Sadalage, Building Evolutionary Architectures, 2nd ed.', url: 'https://www.thoughtworks.com/en-us/insights/books/building-evolutionaryarchitectures-second-edition' },
		{ title: 'Neal Ford, Evolutionary Architectures workshop slides (categories of fitness functions)', url: 'https://nealford.com/downloads/Evolutionary_Architectures_workshop_by_Neal_Ford.pdf' },
		{ title: 'Ford, Parsons, Kua, Evolutionary Architecture (book site, 1st ed.)', url: 'https://evolutionaryarchitecture.com/' },
		{ title: 'Checkstyle docs, ImportControl', url: 'https://checkstyle.sourceforge.io/checks/imports/importcontrol.html' },
		{ title: 'Apache Kafka, checkstyle/import-control.xml', url: `${KAFKA}/checkstyle/import-control.xml#L21-L55` },
		{ title: 'Apache Kafka, CI build workflow (Compile and Check)', url: `${KAFKA}/.github/workflows/build.yml#L111-L158` }
	]
};
