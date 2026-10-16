const KAFKA = 'https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'fitness-functions',
	part: "The architect's job",
	title: 'Fitness functions: decisions that check themselves',
	minutes: 10,
	hook: [
		'Your online shop has a layer rule like day 10\'s: `web` calls `service`, `service` calls `repository`, never upward. Nothing checks it. Next year someone in a hurry imports a web helper from a repository. CI is green, the reviewer misses it, and **the rule is gone without anyone deciding to drop it**.',
		'Rules that live only in a document or in a reviewer\'s head drift. The fix is the same one you use for features: a test. Not for the feature, for the **architecture characteristic**.',
		'The book Building Evolutionary Architectures calls it a **fitness function**. In the words of a Thoughtworks article: "Fitness functions describe how close an architecture is to achieving an architectural aim." Apache Kafka has one for its layering, and it runs on every pull request. Let\'s read it.'
	],
	terms: [
		{ term: 'Fitness function', def: 'An objective check of one architecture characteristic. Most are automated and give pass or fail, not an opinion. The book also allows manual ones, which need a human.' },
		{ term: 'Evolutionary architecture', def: 'An architecture built to change in small steps. In the authors\' words, it makes "explicit what \'fit\' means with as much automation as possible".' },
		{ term: 'Drift', def: 'The code slowly moving away from a decision, one reasonable-looking change at a time.' },
		{ term: 'Allowlist', def: 'A rule that forbids everything except what it names. Known exceptions are listed one by one, so a new violation cannot slip in unnoticed.' },
		{ term: 'Triggered vs continual', def: 'Triggered checks run on an event (a commit, a release, a manual run). Continual ones run all the time, like production monitoring.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['char["Characteristic: clean layering"] -->|made measurable| scen["Rule: common never imports clients"]'],
				highlight: ['char', 'scen'],
				note: 'Start from a characteristic (day 2) and make it precise enough to check. "Clean layering" is a feeling. "Package `common` never imports package `clients`" is a rule a machine can test.'
			},
			{
				add: ['scen -->|automated as| ff["Checkstyle ImportControl"]', 'ff -->|reads| xml["import-control.xml"]'],
				highlight: ['ff', 'xml'],
				note: 'Kafka writes its layer rules in one XML file. The Checkstyle tool reads every `import` line in the Java code and compares it with that file.'
			},
			{
				add: ['ff -->|pass| green["Decision still holds"]', 'ff -->|fail| red["Build fails, PR blocked"]'],
				highlight: ['green', 'red'],
				note: 'The output is **pass or fail**, nothing in between. A red build is a conversation about the architecture, before the change is merged.'
			},
			{
				add: ['pr(["Every pull request"]) -->|gradlew check| ff'],
				highlight: ['pr'],
				note: 'Who runs it? Nobody has to remember. The CI job runs `./gradlew check`, and Gradle\'s `check` task includes every Checkstyle task. A cheap structural rule like this runs on **every** pull request.'
			},
			{
				add: ['load["Slow check: load test with a latency limit"] -->|nightly or before release| green', 'load --> red'],
				highlight: ['load'],
				note: 'Slow checks, like a 20-minute load test, cannot block every PR. They are **triggered** on a schedule or a release instead. Match the trigger to the cost.'
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
			'`kafka` is the package of the broker\'s Scala core. "No one depends on the server" is a layer rule from day 10, written so a machine can enforce it.',
			'Read the `common` block in order. Checkstyle returns the **first** matching rule. So two named `clients` classes are allowed, then every other import from `clients` is refused. The known exceptions are listed by name, and a new one needs a visible change to this file.',
			'An import that matches no rule at all is **refused by default**, per the [Checkstyle docs](https://checkstyle.sourceforge.io/checks/imports/importcontrol.html). The file is an allowlist, not a list of bans.',
			`It is wired in, not optional. The [build](${KAFKA}/build.gradle#L870-L886) points every subproject at this file, and the [CI job](${KAFKA}/.github/workflows/build.yml#L137-L158) runs \`./gradlew check\`, then a step that annotates the Checkstyle errors when it fails.`
		]
	},
	tradeoff: {
		gain: [
			'Decisions are enforced by a machine, not by a reviewer\'s memory.',
			'Drift is caught on the pull request that causes it, when the fix is one line.',
			'A characteristic becomes a rule the team can read and argue about, instead of a feeling.'
		],
		cost: [
			'Every check is code to maintain, and it breaks when the architecture changes on purpose.',
			'Flaky checks (performance tests on shared CI machines) teach people to ignore red. That is worse than no check.',
			'Slow checks cannot run on every PR, so they run rarely, and a check nobody runs guards nothing.'
		]
	},
	task: {
		prompt: 'Your online shop is in Java, with packages `com.shop.web`, `com.shop.service` and `com.shop.repository`. Write the Checkstyle import-control file for the rule: `web` may use `service`, `service` may use `repository`, never upward. Then: someone needs one `web` class inside `service` "just this once". What do you do?',
		hint: 'An import that matches no rule is refused. So you only write `allow` lines. A class that finds no rule in its own subpackage falls back to the rules of the parent.',
		answer: [
			'Root `<import-control pkg="com.shop">` with `<allow pkg="java" />`, so every layer may use the standard library.',
			'`<subpackage name="web">` allows `com.shop.web` and `com.shop.service`.',
			'`<subpackage name="service">` allows `com.shop.service` and `com.shop.repository`.',
			'`<subpackage name="repository">` allows only `com.shop.repository`. Nothing else is listed, so `web` and `service` imports from there fail the build.',
			'"Just this once": if you accept it, add one `<allow class="..." exact-match="true" />` line, like Kafka does, so the exception is **named and reviewed**. Better: move the shared class down into `service` or a common package, and keep the rule clean.',
			'Run it in the same CI job as the tests, so it guards every pull request.'
		]
	},
	quiz: [
		{
			q: 'What makes a check a **fitness function** rather than an ordinary test?',
			options: ['It tests a business feature end to end, from the UI down to the database', 'It gives an objective assessment of an architecture characteristic, ideally automated as a pass or fail', 'It only runs in production', 'It is written and owned by the architect, not by the developers who maintain the code'],
			answer: 1,
			why: 'The target is an "-ility" (layering, reliability, latency), not a feature. And it must be objective, or it is just an opinion. The book allows manual fitness functions too, but the automated ones are the ones that guard every change.'
		},
		{
			q: 'A Java file in Kafka\'s `common` package imports a class that no rule in `import-control.xml` mentions. What does Checkstyle do?',
			options: ['Allows it, because nothing forbids it', 'Logs a warning but lets the build pass', 'Refuses it: with no matching rule, an import is disallowed by default', 'Skips the file'],
			answer: 2,
			why: 'Checkstyle\'s default for ImportControl is "disallowed". The file is an allowlist: every dependency must be named somewhere.'
		},
		{
			q: 'A load test takes 20 minutes. Where does it belong?',
			options: ['On every commit, blocking merge', 'Nowhere, it is too slow to be useful', 'Only after a customer reports slowness', 'Triggered on a schedule or before a release, while cheap structural checks run on every PR'],
			answer: 3,
			why: 'Match the trigger to the cost. Fast static checks guard every change. Slow dynamic ones run on a schedule or a release gate, and someone must own the result.'
		}
	],
	takeaway: 'A decision nobody checks will drift. Turn the important ones into an automated pass or fail, and make sure something runs it.',
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
