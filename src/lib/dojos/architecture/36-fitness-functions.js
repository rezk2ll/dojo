const KAFKA = 'https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'fitness-functions',
	part: "The architect's job",
	title: 'Fitness functions: decisions that check themselves',
	minutes: 10,
	hook: [
		'Your online shop has a layer rule like day 10\'s: `web` calls `service`, `service` calls `repository`, never upward. Nothing checks it. Next year someone in a hurry imports a web helper from a repository. CI is green, the reviewer misses it, and **the rule is gone without anyone deciding to drop it**.',
		'A rule written only in a document or in a reviewer\'s head has nothing that fails when the code breaks it. A test can check it, the same way tests check features. This test checks an architecture characteristic, like layering.',
		'The book Building Evolutionary Architectures calls it a **fitness function**. A Thoughtworks article: "Fitness functions describe how close an architecture is to achieving an architectural aim." Apache Kafka has one for its layering, and it runs on every pull request.'
	],
	terms: [
		{ term: 'Fitness function', def: 'An objective check of one architecture characteristic. Most are automated and pass or fail the build. The book also allows manual ones, which need a human.' },
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
				note: 'Start from a characteristic (day 2) and make it precise enough to check. No tool can check "clean layering". A machine can test "package `common` never imports package `clients`".'
			},
			{
				add: ['scen -->|automated as| ff["Checkstyle ImportControl"]', 'ff -->|reads| xml["import-control.xml"]'],
				highlight: ['ff', 'xml'],
				note: 'Kafka writes its layer rules in one XML file. The Checkstyle tool reads every `import` line in the Java code and compares it with that file.'
			},
			{
				add: ['ff -->|pass| green["Decision still holds"]', 'ff -->|fail| red["Build fails, PR blocked"]'],
				highlight: ['green', 'red'],
				note: 'Checkstyle either passes or fails the build. A failed build blocks the pull request, so the team discusses the import before the change is merged.'
			},
			{
				add: ['pr(["Every pull request"]) -->|gradlew check| ff'],
				highlight: ['pr'],
				note: 'The CI job runs `./gradlew check`, and Gradle\'s `check` task includes every Checkstyle task. So this structural rule runs on **every** pull request, and nobody has to start it by hand.'
			},
			{
				add: ['load["Slow check: load test with a latency limit"] -->|nightly or before release| green', 'load --> red'],
				highlight: ['load'],
				note: 'A slow check, like a 20-minute load test, cannot block every PR. It is **triggered** on a schedule or before a release instead.'
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
			'Lines 5 and 6: `kafka` is the package of the broker\'s Scala core. Line 6 refuses every import from it, so the day 10 rule "no one depends on the server" is enforced by a machine.',
			'Lines 8 to 12 are the `common` block, and Checkstyle uses the **first** rule that matches. Lines 9 and 10 allow two named `clients` classes, and line 12 refuses every other import from `clients`. A new exception needs a new line in this file, which a reviewer sees.',
			'An import that matches no rule at all is refused by default, per the [Checkstyle docs](https://checkstyle.sourceforge.io/checks/imports/importcontrol.html). So the file is an allowlist: every allowed dependency is named in it.',
			`Kafka's \`build.gradle\` points every subproject at this file (linked in the sources). The [CI job](${KAFKA}/.github/workflows/build.yml#L137-L158) runs \`./gradlew check\`, then a step that annotates the Checkstyle errors when it fails.`
		]
	},
	tradeoff: {
		gain: [
			'Checkstyle refuses a wrong import on every pull request, even when the reviewer misses it.',
			'Drift is caught on the pull request that causes it, when the fix is one line.',
			'The layer rule is written in `import-control.xml`, which the team can read and change in a reviewed pull request.'
		],
		cost: [
			'Every check is code to maintain, and it breaks when the architecture changes on purpose.',
			'Flaky checks (performance tests on shared CI machines) fail at random, and people learn to merge on a red build.',
			'A 20-minute load test cannot run on every PR. It runs on a schedule, and someone must read its result.'
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
			why: 'It checks an "-ility" like layering, reliability or latency. It is objective: anyone who runs it gets the same pass or fail. The book allows manual fitness functions too, but the automated ones are the ones that guard every change.'
		},
		{
			q: 'A Java file in Kafka\'s `common` package imports a class that no rule in `import-control.xml` mentions. What does Checkstyle do?',
			options: ['Allows it, because no rule in the file forbids that import', 'Logs a warning for the unknown import but lets the build pass', 'Refuses it: with no matching rule, an import is disallowed by default', 'Skips the file, since only imports named in a rule are checked'],
			answer: 2,
			why: 'Checkstyle\'s default for ImportControl is "disallowed". The file is an allowlist: every dependency must be named somewhere.'
		},
		{
			q: 'A load test takes 20 minutes. Where does it belong?',
			options: ['On every commit, blocking the merge until the full load test has passed', 'Nowhere, a 20 minute test is too slow to tell the team anything useful', 'Only after a customer reports slowness, so the test targets a real problem', 'On a schedule or before a release, while cheap structural checks run on every PR'],
			answer: 3,
			why: 'Fast static checks can run on every change without slowing the team. Slow dynamic ones run on a schedule or a release gate, and someone must own the result.'
		}
	],
	recall: {
		q: 'Which fitness function guards Kafka\'s layering, and when does it run?',
		a: 'Checkstyle ImportControl, reading `checkstyle/import-control.xml`. CI runs it with `./gradlew check` on every pull request, and an import that matches no rule fails the build.'
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
