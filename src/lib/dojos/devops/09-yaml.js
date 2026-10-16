const AIRFLOW = 'https://github.com/apache/airflow/blob/8317410ef7d935cfd4d40857cbc35efcb65a0867';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'yaml',
	part: 'Fundamentals',
	title: 'YAML: the format that guesses',
	minutes: 10,
	hook: [
		'You used to configure servers with braces and semicolons: `nginx.conf`, `named.conf`. From now on, almost everything you write is **YAML**: CI pipelines, Compose files, Ansible playbooks, Kubernetes manifests.',
		'YAML looks like plain text. It is not. The parser decides the type of every value, and it **guesses**. Write `country: NO` and a YAML 1.1 parser hands your program `false`. People call it the Norway problem.',
		'Today: the few rules that cover everyday YAML, and the traps that turn a version, a port or a country code into something else.'
	],
	terms: [
		{ term: 'Mapping', def: 'Key and value pairs, `key: value`. Nesting is shown by indentation, with spaces only: tabs are not allowed for indentation.' },
		{ term: 'Sequence', def: 'A list. One item per line, each starting with `- `.' },
		{ term: 'Scalar', def: 'A single value. Unquoted (plain), the parser picks its type: string, number, boolean or null. Quoted, it is always a string.' },
		{ term: 'Block scalar', def: 'Multi-line text. `|` keeps the line breaks, `>` folds them into spaces. Add `-` (`|-`) to drop the final newline.' },
		{ term: 'Anchor and alias', def: '`&name` labels a node, `*name` reuses it elsewhere. The merge key `<<: *name` copies a mapping\'s keys into another mapping.' },
		{ term: 'Document', def: 'One YAML file can hold several documents, separated by `---` lines. Kubernetes uses this to put many resources in one file.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['src["YAML text"]', 'src --> map["Mapping: key, value"]', 'src --> seq["Sequence: one item per line"]'],
				highlight: ['src', 'map', 'seq'],
				note: 'Two building blocks, nested by **indentation**. Two spaces is the usual step. A tab in the indentation is an error, and a wrong indent silently moves a key to another parent.'
			},
			{
				add: ['sc["Plain scalar: NO, 1.10, 22:22, 0755"]', 'map --> sc', 'sc -->|"YAML 1.1 parser"| typed["false, 1.1, 1342, 493"]'],
				highlight: ['sc', 'typed'],
				note: 'PyYAML follows YAML 1.1. It reads `NO` as **false**, `1.10` as the number **1.1**, `22:22` as a base 60 number (**1342**), `0755` as octal (**493**). Your version, port and file mode are gone.'
			},
			{
				add: ['sc -->|"quoted"| str["Strings, exactly as written"]'],
				highlight: ['str'],
				note: 'Quotes stop the guessing: `\'NO\'`, `"1.10"`, `"22:22"`. YAML 1.2 shrank booleans to `true` and `false`, but many tools still parse with 1.1 rules, and `1.10` is a number in both. **When in doubt, quote it.**'
			},
			{
				add: ['blk["Block scalar: multi-line text"]', 'map --> blk'],
				highlight: ['blk'],
				note: 'For a script inside a CI file, use `|`: every line stays a line. `>` joins lines with spaces, handy for one long sentence, wrong for a shell script.'
			},
			{
				add: ['anc["Anchor: one shared block"]', 'anc -.->|"alias and merge key"| map'],
				highlight: ['anc'],
				note: 'Write a block once with `&common`, reuse it with `*common`, or merge it into a mapping with `<<: *common` and add keys on top. Less copy and paste, but the reader now has to jump around the file.'
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
			'`---` opens the document. `&airflow-common` anchors the whole block under `x-airflow-common`. Compose [ignores top-level keys that start with `x-`](https://docs.docker.com/reference/compose-file/extension/), so the block exists only to be reused.',
			'`<<: *airflow-common` merges that block into each service. Keys written next to it (`command`, `ports`) are added on top. One block, many services.',
			'`\'true\'` is quoted on purpose. The [Compose docs](https://docs.docker.com/reference/compose-file/services/) say boolean values like `true`, `false`, `yes`, `no` in `environment` should be quoted, so the YAML parser does not turn them into booleans.',
			'`"8080:8080"` is quoted too. The same docs say to always write `HOST:CONTAINER` as a quoted string, because of the YAML base 60 rule. `22:22` unquoted is the number 1342.',
			'`depends_on` is a mapping, so it can be merged. The [Compose fragments docs](https://docs.docker.com/reference/compose-file/fragments/) note that merge only works on mappings, not on sequences. That is why this file writes `environment` as `KEY: value`, not as a list of `- KEY=value`.',
			'`|version|` is not YAML: it is a placeholder the Airflow docs build replaces with a real version.'
		]
	},
	tradeoff: {
		gain: [
			'Readable by humans, with comments, unlike JSON.',
			'One format for CI, Compose, Ansible and Kubernetes: learn it once.',
			'Anchors and several documents per file keep big configs short.'
		],
		cost: [
			'Types are guessed. `NO`, `1.10`, `22:22` and `0755` all change meaning unless quoted.',
			'Indentation is syntax. One wrong indent moves a key, and the file often still parses.',
			'Parsers differ: YAML 1.1 rules, YAML 1.2 rules, and tool specific extras like the merge key. A linter such as `yamllint` (its `truthy` rule) catches part of it.'
		]
	},
	task: {
		prompt: 'Spot every value that will not reach the program as you meant it: `country: NO`, `version: 1.10`, `ssh_port: 22:22`, `mode: 0755`, `debug: off`, and a `script: >` block holding three shell commands, one per line. Fix each one.',
		hint: 'Read each plain scalar as a YAML 1.1 parser would. For the script, ask what happens to the line breaks.',
		answer: [
			'`country: NO` becomes `false`. Write `country: \'NO\'`.',
			'`version: 1.10` becomes the number 1.1. Write `version: "1.10"`.',
			'`ssh_port: 22:22` is a base 60 number, 1342. Write `"22:22"`.',
			'`mode: 0755` is octal 493 in YAML 1.1, but the plain number 755 in YAML 1.2. Quote it, `"0755"`, and let the tool convert it.',
			'`debug: off` becomes `false` in YAML 1.1. Write `false` if you mean a boolean, `\'off\'` if you mean the word.',
			'`>` folds the three lines into one line with spaces. Use `|` so each command stays on its own line.'
		]
	},
	quiz: [
		{
			q: 'Why can `country: NO` turn into `false` in YAML?',
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
	takeaway: 'YAML guesses types for unquoted values. Indent with spaces, quote anything that looks like a number, a boolean or a time, and use `|` for scripts.',
	sources: [
		{ title: 'YAML 1.2.2 specification (core schema, block scalars, anchors)', url: 'https://yaml.org/spec/1.2.2/' },
		{ title: 'YAML 1.1 Boolean type (yes, no, on, off)', url: 'https://yaml.org/type/bool.html' },
		{ title: 'PyYAML, a YAML 1.1 parser', url: 'https://pyyaml.org/wiki/PyYAML' },
		{ title: 'Compose file reference, Fragments (anchors and merge)', url: 'https://docs.docker.com/reference/compose-file/fragments/' },
		{ title: 'yamllint rules, truthy', url: 'https://yamllint.readthedocs.io/en/stable/rules.html' }
	]
};
