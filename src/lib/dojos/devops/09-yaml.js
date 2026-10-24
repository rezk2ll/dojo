const AIRFLOW = 'https://github.com/apache/airflow/blob/8317410ef7d935cfd4d40857cbc35efcb65a0867';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'yaml',
	part: 'Fundamentals',
	title: 'YAML: syntax and type guessing',
	minutes: 10,
	hook: [
		'You used to configure servers with braces and semicolons: `nginx.conf`, `named.conf`. From now on, almost everything you write is **YAML**: CI pipelines, Compose files, Ansible playbooks, Kubernetes manifests.',
		'YAML looks like plain text, but the parser decides the type of every unquoted value from how it looks. Write `country: NO` and a YAML 1.1 parser hands your program **`false`**. People call it the Norway problem.',
		'A version like `1.10`, a port mapping like `22:22` and a file mode like `0755` also change type unless you quote them.'
	],
	terms: [
		{ term: 'Mapping', def: 'Key and value pairs, `key: value`. Nesting is shown by indentation, with spaces only: tabs are not allowed for indentation.' },
		{ term: 'Scalar', def: 'A single value. Unquoted (plain), the parser picks its type: string, number, boolean or null. A quoted scalar is always a string.' },
		{ term: 'Block scalar', def: 'Multi-line text. `|` keeps the line breaks, `>` folds them into spaces. Add `-` (`|-`) to drop the final newline.' },
		{ term: 'Anchor and alias', def: '`&name` labels a node, `*name` reuses it elsewhere. The merge key `<<: *name` copies a mapping\'s keys into another mapping.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['src["YAML text"]', 'src --> map["Mapping: key, value"]', 'src --> seq["Sequence: one item per line"]'],
				highlight: ['src', 'map', 'seq'],
				note: 'Mappings and sequences (lists, one `- ` item per line) nest by **indentation**, usually two spaces per level. A tab in the indentation is an error, and a wrong indent silently moves a key to another parent.'
			},
			{
				add: ['sc["Plain scalar: NO, 1.10, 22:22, 0755"]', 'map --> sc', 'sc -->|"YAML 1.1 parser"| typed["false, 1.1, 1342, 493"]'],
				highlight: ['sc', 'typed'],
				note: 'PyYAML follows YAML 1.1. It reads `NO` as false, `1.10` as the number 1.1, `22:22` as a base 60 number (1342), and `0755` as octal (493). Your program receives **none of the four strings** you wrote.'
			},
			{
				add: ['sc -->|"quoted"| str["Strings, exactly as written"]'],
				highlight: ['str'],
				note: 'A quoted value stays a string: `\'NO\'`, `"1.10"`, `"22:22"`. YAML 1.2 shrank booleans to `true` and `false`, but many tools still parse with 1.1 rules, and `1.10` is a number in both. Quote any value that looks like a number, a boolean or a time.'
			},
			{
				add: ['blk["Block scalar: multi-line text"]', 'map --> blk'],
				highlight: ['blk'],
				note: 'For a script inside a CI file, use `|`: every line stays a line. `>` joins lines with spaces, which suits one long sentence and breaks a shell script.'
			},
			{
				add: ['anc["Anchor: one shared block"]', 'anc -.->|"alias and merge key"| map'],
				highlight: ['anc'],
				note: 'Write a block once with `&common`, reuse it with `*common`, or merge it into a mapping with `<<: *common` and add keys on top. You copy less, and a reader has to find the anchor elsewhere in the file to see the full values.'
			}
		]
	},
	example: {
		title: 'airflow-core/docs/howto/docker-compose/docker-compose.yaml',
		repo: 'apache/airflow',
		url: `${AIRFLOW}/airflow-core/docs/howto/docker-compose/docker-compose.yaml#L46-L137`,
		lang: 'yaml',
		code: `---
x-airflow-common:
  &airflow-common
…
  image: \${AIRFLOW_IMAGE_NAME:-apache/airflow:|version|}
  # build: .
  env_file:
    - \${ENV_FILE_PATH:-.env}
  environment:
    &airflow-common-env
    AIRFLOW__CORE__EXECUTOR: CeleryExecutor
…
    AIRFLOW__CORE__DAGS_ARE_PAUSED_AT_CREATION: 'true'
    AIRFLOW__CORE__LOAD_EXAMPLES: 'true'
…
  user: "\${AIRFLOW_UID:-50000}:0"
  depends_on:
    &airflow-common-depends-on
    redis:
      condition: service_healthy
    postgres:
      condition: service_healthy
…
  airflow-apiserver:
    <<: *airflow-common
    command: api-server
    ports:
      - "8080:8080"
…
    depends_on:
      <<: *airflow-common-depends-on
      airflow-init:
        condition: service_completed_successfully`,
		notes: [
			'Lines 1 to 3: `---` opens the document, and `&airflow-common` anchors the whole block under `x-airflow-common`. Compose [ignores top-level keys that start with `x-`](https://docs.docker.com/reference/compose-file/extension/), so the block exists only to be reused.',
			'Line 25: `<<: *airflow-common` merges that block into the service. The keys on lines 26 to 28 (`command`, `ports`) are added on top. Each Airflow service in the file merges the same block this way.',
			'Lines 13 and 14: `\'true\'` is quoted on purpose. The [Compose docs](https://docs.docker.com/reference/compose-file/services/) say boolean values like `true`, `false`, `yes`, `no` in `environment` should be quoted, so the YAML parser keeps them as strings.',
			'Line 28: `"8080:8080"` is quoted too. The same docs say to always write `HOST:CONTAINER` as a quoted string, because of the YAML base 60 rule. `22:22` unquoted is the number 1342.',
			'Lines 17 and 31: `depends_on` is a mapping, so it can be merged. The [Compose fragments docs](https://docs.docker.com/reference/compose-file/fragments/) say merge works on mappings only, and a sequence cannot be merged. So this file writes `environment` (line 9) as `KEY: value` pairs instead of a list of `- KEY=value`.',
			'Line 5: `|version|` is a placeholder that the Airflow docs build replaces with a real version. It is not YAML syntax.'
		]
	},
	tradeoff: {
		gain: [
			'A YAML file allows `#` comments, which JSON does not.',
			'CI, Compose, Ansible and Kubernetes all use YAML, so the same syntax rules apply in each.',
			'Anchors let one block serve many services, and `---` puts several Kubernetes resources in one file.'
		],
		cost: [
			'The parser guesses the type of an unquoted value: `NO`, `1.10`, `22:22` and `0755` all change meaning unless quoted.',
			'A wrong indent moves a key to another parent, and the file often still parses.',
			'Parsers differ: YAML 1.1 rules, YAML 1.2 rules, and tool specific extras like the merge key. A linter such as `yamllint` (its `truthy` rule) catches part of it.'
		]
	},
	task: {
		prompt: 'Spot every value that will not reach the program as you meant it: `country: NO`, `version: 1.10`, `ssh_port: 22:22`, `mode: 0755`, `debug: off`, and a `script: >` block holding three shell commands, one per line. Fix each one.',
		hint: 'Read each plain scalar as a YAML 1.1 parser would. For the script, ask what happens to the line breaks.',
		answer: [
			'`country: NO` is parsed as `false`. Write `country: \'NO\'`.',
			'`version: 1.10` is parsed as the number 1.1. Write `version: "1.10"`.',
			'`ssh_port: 22:22` is a base 60 number, 1342. Write `"22:22"`.',
			'`mode: 0755` is octal 493 in YAML 1.1, but the plain number 755 in YAML 1.2. Quote it, `"0755"`, and let the tool convert it.',
			'`debug: off` is parsed as `false` in YAML 1.1. Write `false` if you mean a boolean, `\'off\'` if you mean the word.',
			'`>` folds the three lines into one line with spaces. Use `|` so each command stays on its own line.'
		],
		steps: [
			{
				title: 'Read each value as the parser does',
				questions: [
					{ q: 'Which of the six values reaches the program as text before any fix?', options: ['`country: NO`', 'The `script: >` block, with its line breaks folded', '`mode: 0755`', '`ssh_port: 22:22`'], answer: 1, why: 'A block scalar is always text. The plain scalars are typed by how they look, and none of these three stays the string you wrote.' },
					{ q: 'The chapter says to quote any value that looks like a number, a boolean or a time. Which value in the list looks like a time?', options: ['`version: 1.10`', '`mode: 0755`', '`ssh_port: 22:22`', '`debug: off`'], answer: 2, why: '`22:22` reads like a clock time, and YAML 1.1 treats colon-separated numbers as base 60. That is why port mappings get quoted.' },
					{ q: 'Which value is a number under both YAML 1.1 and 1.2, so a newer parser does not save you?', options: ['`version: 1.10`', '`country: NO`', '`debug: off`', 'The `script: >` block'], answer: 0, why: '`1.10` looks like a float under both rules, so the trailing zero is lost whatever the parser. Only quotes keep it.' },
					{ q: 'Someone indents the `mode` line with a tab. What does the parser do?', options: ['It treats the tab as two spaces', 'It skips the line', 'It reads `mode` as a string', 'It stops with an error: tabs are not allowed for indentation'], answer: 3, why: 'YAML nests by indentation with spaces only. A tab in the indentation is an error.' }
				]
			},
			{
				title: 'Spot the version trap',
				questions: [
					{ q: 'Like `mode`, which other value in the list is read differently by a YAML 1.1 and a YAML 1.2 parser?', options: ['`version: 1.10`', '`debug: off`', 'The `script: >` block', 'None: `mode` is the only one'], answer: 1, why: 'YAML 1.2 shrank booleans to `true` and `false`, so `off` is a boolean under 1.1 and the string `off` under 1.2. `1.10` is a number in both, and the block is text in both.' },
					{ q: 'And `mode: 0755` in YAML 1.2?', options: ['Octal 493', 'The string `0755`', 'The plain number 755', '`false`'], answer: 2, why: 'YAML 1.2 dropped that octal rule, so the same text gives a different number.' },
					{ q: 'Given that difference, how do you write the mode?', options: ['Quote it, `"0755"`, and let the tool convert it', 'Write `493`', 'Write `755` and hope', 'Leave it unquoted'], answer: 0, why: 'A quoted value is the same string under every parser, so the tool decides how to read it.' },
					{ q: 'Which YAML version does PyYAML follow?', options: ['1.2', '1.0', 'It picks per file', '1.1'], answer: 3, why: 'PyYAML is a YAML 1.1 parser, and many tools still use 1.1 rules.' }
				]
			},
			{
				title: 'Fix the scalars',
				questions: [
					{ q: 'You meant `debug` as the word `off`, for a log setting. What do you write?', options: ['`debug: off`', '`debug: \'off\'`', '`debug: false`', '`debug: OFF`'], answer: 1, why: 'Plain `off` (or `OFF`) is a boolean under YAML 1.1 rules. Quoted, it is the string `off` under every parser.' },
					{ q: 'Which check catches values like `NO` and `off` in review, before any program reads them?', options: ['`shellcheck`', '`git diff --check`', '`yamllint` with its `truthy` rule', '`python -m json.tool`'], answer: 2, why: 'The `truthy` rule of yamllint flags plain values a parser may read as booleans. It catches part of the type guessing, not all of it.' },
					{ q: 'The `ssh_port` mapping goes into a Compose `ports:` list next to `8080:8080`. What rule do the Compose docs give for these values?', options: ['Always write `HOST:CONTAINER` as a quoted string', 'Quote only the ones that look like a time', 'Write host and container as two separate keys', 'Leave them plain: Compose converts them back'], answer: 0, why: 'The docs ask for a quoted string every time, because of the YAML base 60 rule. The Airflow file quotes `"8080:8080"` for the same reason.' },
					{ q: 'You meant `debug` as a boolean. What do you write so every parser, 1.1 or 1.2, reads one?', options: ['`debug: \'off\'`', '`debug: no`', '`debug: 0`', '`debug: false`'], answer: 3, why: '`false` is a boolean in YAML 1.1 and 1.2. Quote `\'off\'` only if you mean the word.' }
				]
			},
			{
				title: 'Fix the script block',
				questions: [
					{ q: 'What does `>` do to three commands on three lines?', options: ['Keeps each on its own line', 'Folds them into one line with spaces', 'Drops all but the first', 'Turns them into a list'], answer: 1, why: '`>` is the folded style: line breaks become spaces.' },
					{ q: 'What happens when the shell runs that folded line?', options: ['The three commands run one after another', 'Nothing, it is a comment', 'They run together as one command with extra arguments', 'The shell runs them in parallel'], answer: 2, why: '`echo one echo two` is a single `echo` with four arguments.' },
					{ q: '`>` is wrong for this script. What kind of text does it suit?', options: ['One long sentence, such as a description, split over lines for reading', 'A shell script with one command per line', 'A list of hosts', 'A port mapping'], answer: 0, why: '`>` joins lines with spaces, which suits one long sentence and breaks a shell script.' },
					{ q: 'What does `|-` change compared with `|`?', options: ['It folds the lines', 'It quotes the text', 'It removes indentation', 'It drops the final newline'], answer: 3, why: 'The `-` chomping indicator strips the trailing newline.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Why can a parser read `country: NO` as `false`?',
			options: [
				'YAML 1.1 parsers read plain `NO`, `no` and `off` as booleans',
				'Any two-letter value becomes a boolean unless it is quoted',
				'Country codes are reserved words in YAML, like `null` and `true`',
				'Uppercase values are always booleans in every YAML version'
			],
			answer: 0,
			why: 'The YAML 1.1 boolean type includes `yes`, `no`, `on` and `off`, in several cases. YAML 1.2 only keeps `true` and `false`, but many tools still follow 1.1. Quote it: `\'NO\'`.'
		},
		{
			q: 'You need a shell script inside a CI file, each command on its own line. Which block scalar do you use?',
			options: ['`>`', '`|`', '`>-`', 'A plain scalar on one line'],
			answer: 1,
			why: '`|` (literal) keeps every line break. `>` (folded) joins lines with spaces, which runs your commands together.'
		},
		{
			q: 'A Compose file has `x-common: &common` with an `environment` mapping, and a service uses `<<: *common`. What does the service get?',
			options: [
				'Nothing, Compose ignores everything that starts with `x-`, anchors included',
				'All keys of the anchored block, plus any keys the service writes next to `<<`',
				'Only the anchored keys, and the keys the service writes next to `<<` are ignored',
				'A copy of every top-level key of the Compose file, nested under the service'
			],
			answer: 1,
			why: 'Compose ignores the `x-` key itself, but the anchor still works. The merge key copies the mapping\'s keys, and keys written in the service are added on top.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Feed the task\'s values to a real YAML 1.1 parser, see what your program would receive, then fix them until it receives what you wrote.',
		steps: [
			'Install PyYAML in a throwaway venv: `mkdir -p ~/yaml-lab && cd ~/yaml-lab && python3 -m venv .venv && .venv/bin/pip install pyyaml`.',
			'Write the broken file: `printf \'country: NO\\nversion: 1.10\\nssh_port: 22:22\\nmode: 0755\\ndebug: off\\nscript: >\\n  echo one\\n  echo two\\n  echo three\\n\' > bad.yaml`.',
			'Parse it as a program would: `.venv/bin/python -c \'import sys, yaml; print(yaml.safe_load(open(sys.argv[1])))\' bad.yaml`.',
			'Copy it to `good.yaml` and fix each line: quote `NO`, `1.10`, `22:22` and `0755`, write `debug: false`, and change `script: >` to `script: |`. Parse `good.yaml` with the same command.',
			'Run the script block through bash: `.venv/bin/python -c \'import sys, yaml; print(yaml.safe_load(open(sys.argv[1]))["script"], end="")\' good.yaml | bash`. Try the same on `bad.yaml`.'
		],
		done: [
			'`bad.yaml` prints `\'country\': False, \'version\': 1.1, \'ssh_port\': 1342, \'mode\': 493, \'debug\': False`.',
			'`good.yaml` prints `\'NO\'`, `\'1.10\'`, `\'22:22\'` and `\'0755\'` as strings.',
			'The script from `good.yaml` prints `one`, `two` and `three` on three lines. The one from `bad.yaml` prints `one echo two echo three` on one line.'
		],
		solution: [
			'`country: "NO"`, `version: "1.10"`, `ssh_port: "22:22"`, `mode: "0755"`, `debug: false`.',
			'`script: |` followed by the three commands, each indented by two spaces.',
			'Delete the folder when done: the venv lives only in `~/yaml-lab`.'
		]
	},
	recall: {
		q: 'What does a YAML 1.1 parser make of the unquoted values `NO`, `1.10`, `22:22` and `0755`, and how do you keep them as strings?',
		a: 'It reads them as false, 1.1, 1342 and 493. Quotes, like `\'NO\'` or `"1.10"`, keep them as strings.'
	},
	sources: [
		{ title: 'YAML 1.2.2 specification (core schema, block scalars, anchors)', url: 'https://yaml.org/spec/1.2.2/' },
		{ title: 'YAML 1.1 Boolean type (yes, no, on, off)', url: 'https://yaml.org/type/bool.html' },
		{ title: 'PyYAML, a YAML 1.1 parser', url: 'https://pyyaml.org/wiki/PyYAML' },
		{ title: 'Compose file reference, Fragments (anchors and merge)', url: 'https://docs.docker.com/reference/compose-file/fragments/' },
		{ title: 'yamllint rules, truthy', url: 'https://yamllint.readthedocs.io/en/stable/rules.html' }
	]
};
