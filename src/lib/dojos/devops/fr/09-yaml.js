const AIRFLOW = 'https://github.com/apache/airflow/blob/8317410ef7d935cfd4d40857cbc35efcb65a0867';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'yaml',
	part: 'Les fondamentaux',
	title: 'YAML : la syntaxe et les types devinés',
	minutes: 10,
	hook: [
		'Avant, tu configurais tes serveurs avec des accolades et des points-virgules : `nginx.conf`, `named.conf`. À partir de maintenant, presque tout ce que tu écris est en **YAML** : pipelines de CI, fichiers Compose, playbooks Ansible, manifestes Kubernetes.',
		'YAML ressemble à du texte brut, mais le parseur choisit le type de chaque valeur sans guillemets d’après son allure. Écris `country: NO` et un parseur YAML 1.1 donne **`false`** à ton programme. On appelle ça le problème norvégien.',
		'Une version comme `1.10`, un mapping de ports comme `22:22` et des droits de fichier comme `0755` changent aussi de type si tu ne les mets pas entre guillemets.'
	],
	terms: [
		{ term: 'Mapping', def: 'Des paires clé et valeur, `key: value`. L’imbrication se lit à l’indentation, avec des espaces uniquement : les tabulations sont interdites pour indenter.' },
		{ term: 'Scalaire', def: 'Une valeur unique. Sans guillemets (plain), le parseur choisit son type : chaîne, nombre, booléen ou null. Un scalaire entre guillemets est toujours une chaîne.' },
		{ term: 'Bloc scalaire', def: 'Du texte sur plusieurs lignes. `|` garde les retours à la ligne, `>` les replie en espaces. Ajoute `-` (`|-`) pour supprimer le retour à la ligne final.' },
		{ term: 'Ancre et alias', def: '`&name` étiquette un nœud, `*name` le réutilise ailleurs. La clé de fusion `<<: *name` copie les clés d’un mapping dans un autre mapping.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['src["Texte YAML"]', 'src --> map["Mapping : clé, valeur"]', 'src --> seq["Séquence : un élément par ligne"]'],
				highlight: ['src', 'map', 'seq'],
				note: 'Les mappings et les séquences (des listes, un élément `- ` par ligne) s’imbriquent par **l’indentation**, en général deux espaces par niveau. Une tabulation dans l’indentation est une erreur, et une mauvaise indentation déplace une clé chez un autre parent sans aucun message.'
			},
			{
				add: ['sc["Scalaire plain : NO, 1.10, 22:22, 0755"]', 'map --> sc', 'sc -->|"parseur YAML 1.1"| typed["false, 1.1, 1342, 493"]'],
				highlight: ['sc', 'typed'],
				note: 'PyYAML suit YAML 1.1. Il lit `NO` comme false, `1.10` comme le nombre 1.1, `22:22` comme un nombre en base 60 (1342) et `0755` comme de l’octal (493). Ton programme ne reçoit **aucune des quatre chaînes** que tu as écrites.'
			},
			{
				add: ['sc -->|"entre guillemets"| str["Des chaînes, telles qu’écrites"]'],
				highlight: ['str'],
				note: 'Une valeur entre guillemets reste une chaîne : `\'NO\'`, `"1.10"`, `"22:22"`. YAML 1.2 a réduit les booléens à `true` et `false`, mais beaucoup d’outils parsent encore avec les règles 1.1, et `1.10` est un nombre dans les deux. Mets entre guillemets toute valeur qui ressemble à un nombre, un booléen ou une heure.'
			},
			{
				add: ['blk["Bloc scalaire : texte multiligne"]', 'map --> blk'],
				highlight: ['blk'],
				note: 'Pour un script dans un fichier de CI, utilise `|` : chaque ligne reste une ligne. `>` joint les lignes avec des espaces : ça convient à une longue phrase et ça casse un script shell.'
			},
			{
				add: ['anc["Ancre : un bloc partagé"]', 'anc -.->|"alias et clé de fusion"| map'],
				highlight: ['anc'],
				note: 'Écris un bloc une fois avec `&common`, réutilise-le avec `*common`, ou fusionne-le dans un mapping avec `<<: *common` et ajoute des clés par-dessus. Tu copies moins, et le lecteur doit chercher l’ancre ailleurs dans le fichier pour voir toutes les valeurs.'
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
			'Lignes 1 à 3 : `---` ouvre le document, et `&airflow-common` ancre tout le bloc sous `x-airflow-common`. Compose [ignore les clés de premier niveau qui commencent par `x-`](https://docs.docker.com/reference/compose-file/extension/), donc ce bloc n’existe que pour être réutilisé.',
			'Ligne 25 : `<<: *airflow-common` fusionne ce bloc dans le service. Les clés des lignes 26 à 28 (`command`, `ports`) s’ajoutent par-dessus. Chaque service Airflow du fichier fusionne le même bloc de cette façon.',
			'Lignes 13 et 14 : `\'true\'` est entre guillemets exprès. La [doc de Compose](https://docs.docker.com/reference/compose-file/services/) demande de mettre entre guillemets les booléens comme `true`, `false`, `yes`, `no` dans `environment`, pour que le parseur YAML les garde comme chaînes.',
			'Ligne 28 : `"8080:8080"` est entre guillemets aussi. La même doc demande d’écrire toujours `HOST:CONTAINER` comme une chaîne entre guillemets, à cause de la règle YAML de la base 60. Sans guillemets, `22:22` est le nombre 1342.',
			'Lignes 17 et 31 : `depends_on` est un mapping, donc tu peux le fusionner. La [doc des fragments Compose](https://docs.docker.com/reference/compose-file/fragments/) précise que la fusion ne marche que sur les mappings, et qu’une séquence ne se fusionne pas. Ce fichier écrit donc `environment` (ligne 9) en paires `KEY: value` au lieu d’une liste de `- KEY=value`.',
			'Ligne 5 : `|version|` est un marqueur que le build de la doc Airflow remplace par une vraie version. Ce n’est pas de la syntaxe YAML.'
		]
	},
	tradeoff: {
		gain: [
			'Un fichier YAML accepte des commentaires `#`, ce que JSON ne permet pas.',
			'La CI, Compose, Ansible et Kubernetes utilisent tous YAML, donc les mêmes règles de syntaxe s’appliquent partout.',
			'Les ancres permettent à un bloc de servir à plusieurs services, et `---` met plusieurs ressources Kubernetes dans un seul fichier.'
		],
		cost: [
			'Le parseur devine le type d’une valeur sans guillemets : `NO`, `1.10`, `22:22` et `0755` changent tous de sens si tu ne les mets pas entre guillemets.',
			'Une indentation fausse déplace une clé chez un autre parent, et souvent le fichier se parse quand même.',
			'Les parseurs diffèrent : règles YAML 1.1, règles YAML 1.2, et extras propres à chaque outil comme la clé de fusion. Un linter comme `yamllint` (sa règle `truthy`) en attrape une partie.'
		]
	},
	task: {
		prompt: 'Repère chaque valeur qui n’arrivera pas au programme comme tu le voulais : `country: NO`, `version: 1.10`, `ssh_port: 22:22`, `mode: 0755`, `debug: off`, et un bloc `script: >` qui contient trois commandes shell, une par ligne. Corrige chacune.',
		hint: 'Lis chaque scalaire plain comme le ferait un parseur YAML 1.1. Pour le script, regarde ce qui arrive aux retours à la ligne.',
		answer: [
			'Le parseur lit `country: NO` comme `false`. Écris `country: \'NO\'`.',
			'Le parseur lit `version: 1.10` comme le nombre 1.1. Écris `version: "1.10"`.',
			'`ssh_port: 22:22` est un nombre en base 60, 1342. Écris `"22:22"`.',
			'`mode: 0755` vaut 493 (octal) en YAML 1.1, mais le simple nombre 755 en YAML 1.2. Mets des guillemets, `"0755"`, et laisse l’outil faire la conversion.',
			'En YAML 1.1, le parseur lit `debug: off` comme `false`. Écris `false` si tu veux un booléen, `\'off\'` si tu veux le mot.',
			'`>` replie les trois lignes en une seule ligne avec des espaces. Utilise `|` pour que chaque commande reste sur sa ligne.'
		],
		steps: [
			{
				title: 'Lis chaque valeur comme le parseur',
				questions: [
					{ q: 'Laquelle des six valeurs arrive au programme sous forme de texte avant toute correction ?', options: ['`country: NO`', 'Le bloc `script: >`, avec ses retours à la ligne repliés', '`mode: 0755`', '`ssh_port: 22:22`'], answer: 1, why: 'Un bloc scalaire est toujours du texte. Les scalaires simples sont typés selon leur allure, et aucun de ces trois ne reste la chaîne que tu as écrite.' },
					{ q: 'Le chapitre dit de mettre entre guillemets toute valeur qui ressemble à un nombre, un booléen ou une heure. Quelle valeur de la liste ressemble à une heure ?', options: ['`version: 1.10`', '`mode: 0755`', '`ssh_port: 22:22`', '`debug: off`'], answer: 2, why: '`22:22` se lit comme une heure, et YAML 1.1 traite des nombres séparés par deux-points en base 60. C’est pour ça qu’on met les mappings de ports entre guillemets.' },
					{ q: 'Quelle valeur est un nombre en YAML 1.1 comme en 1.2, si bien qu’un parseur plus récent ne te sauve pas ?', options: ['`version: 1.10`', '`country: NO`', '`debug: off`', 'Le bloc `script: >`'], answer: 0, why: '`1.10` ressemble à un flottant dans les deux règles, donc le zéro final disparaît quel que soit le parseur. Seuls les guillemets le gardent.' },
					{ q: 'Quelqu’un indente la ligne `mode` avec une tabulation. Que fait le parseur ?', options: ['Il compte la tabulation comme deux espaces', 'Il saute la ligne', 'Il lit `mode` comme une chaîne', 'Il s’arrête sur une erreur : les tabulations sont interdites dans l’indentation'], answer: 3, why: 'YAML imbrique par l’indentation, avec des espaces seulement. Une tabulation dans l’indentation est une erreur.' }
				]
			},
			{
				title: 'Repère le piège des versions',
				questions: [
					{ q: 'Comme `mode`, quelle autre valeur de la liste est lue différemment par un parseur YAML 1.1 et un parseur YAML 1.2 ?', options: ['`version: 1.10`', '`debug: off`', 'Le bloc `script: >`', 'Aucune : `mode` est la seule'], answer: 1, why: 'YAML 1.2 a réduit les booléens à `true` et `false`, donc `off` est un booléen en 1.1 et la chaîne `off` en 1.2. `1.10` est un nombre dans les deux, et le bloc est du texte dans les deux.' },
					{ q: 'Et `mode: 0755` en YAML 1.2 ?', options: ['L’octal 493', 'La chaîne `0755`', 'Le simple nombre 755', '`false`'], answer: 2, why: 'YAML 1.2 a abandonné cette règle de l’octal, donc le même texte donne un autre nombre.' },
					{ q: 'Vu cette différence, comment écris-tu les droits ?', options: ['Entre guillemets, `"0755"`, et l’outil fait la conversion', 'Écrire `493`', 'Écrire `755` et espérer', 'Le laisser sans guillemets'], answer: 0, why: 'Une valeur entre guillemets est la même chaîne pour tous les parseurs, donc c’est l’outil qui décide comment la lire.' },
					{ q: 'Quelle version de YAML PyYAML suit-il ?', options: ['1.2', '1.0', 'Il choisit selon le fichier', '1.1'], answer: 3, why: 'PyYAML est un parseur YAML 1.1, et beaucoup d’outils suivent encore les règles 1.1.' }
				]
			},
			{
				title: 'Corrige les scalaires',
				questions: [
					{ q: 'Tu voulais pour `debug` le mot `off`, pour un réglage de logs. Qu’écris-tu ?', options: ['`debug: off`', '`debug: \'off\'`', '`debug: false`', '`debug: OFF`'], answer: 1, why: 'Un `off` (ou `OFF`) sans guillemets est un booléen avec les règles YAML 1.1. Entre guillemets, c’est la chaîne `off` pour tous les parseurs.' },
					{ q: 'Quel contrôle attrape des valeurs comme `NO` et `off` en revue, avant qu’un programme ne les lise ?', options: ['`shellcheck`', '`git diff --check`', '`yamllint` avec sa règle `truthy`', '`python -m json.tool`'], answer: 2, why: 'La règle `truthy` de yamllint signale les valeurs simples qu’un parseur peut lire comme des booléens. Elle attrape une partie des types devinés, pas tout.' },
					{ q: 'Le mapping `ssh_port` va dans une liste `ports:` de Compose, à côté de `8080:8080`. Quelle règle la doc de Compose donne-t-elle pour ces valeurs ?', options: ['Toujours écrire `HOST:CONTAINER` comme une chaîne entre guillemets', 'Ne mettre entre guillemets que celles qui ressemblent à une heure', 'Écrire l’hôte et le conteneur dans deux clés séparées', 'Les laisser sans guillemets : Compose les reconvertit'], answer: 0, why: 'La doc demande une chaîne entre guillemets à chaque fois, à cause de la règle de la base 60 de YAML. Le fichier Airflow met `"8080:8080"` entre guillemets pour la même raison.' },
					{ q: 'Tu voulais un booléen pour `debug`. Qu’écris-tu pour que tout parseur, 1.1 ou 1.2, en lise un ?', options: ['`debug: \'off\'`', '`debug: no`', '`debug: 0`', '`debug: false`'], answer: 3, why: '`false` est un booléen en YAML 1.1 comme en 1.2. Mets `\'off\'` entre guillemets seulement si tu veux le mot.' }
				]
			},
			{
				title: 'Corrige le bloc du script',
				questions: [
					{ q: 'Que fait `>` à trois commandes sur trois lignes ?', options: ['Il garde chacune sur sa ligne', 'Il les replie en une seule ligne avec des espaces', 'Il ne garde que la première', 'Il en fait une liste'], answer: 1, why: '`>` est le style folded : les retours à la ligne deviennent des espaces.' },
					{ q: 'Que se passe-t-il quand le shell lance cette ligne repliée ?', options: ['Les trois commandes tournent l’une après l’autre', 'Rien, c’est un commentaire', 'Elles tournent ensemble comme une seule commande avec des arguments en plus', 'Le shell les lance en parallèle'], answer: 2, why: '`echo one echo two`, c’est un seul `echo` avec quatre arguments.' },
					{ q: '`>` ne convient pas à ce script. À quel genre de texte convient-il ?', options: ['Une longue phrase, comme une description, coupée sur plusieurs lignes pour la lecture', 'Un script shell avec une commande par ligne', 'Une liste d’hôtes', 'Un mapping de ports'], answer: 0, why: '`>` joint les lignes avec des espaces, ce qui convient à une longue phrase et casse un script shell.' },
					{ q: 'Que change `|-` par rapport à `|` ?', options: ['Il replie les lignes', 'Il met le texte entre guillemets', 'Il retire l’indentation', 'Il supprime le retour à la ligne final'], answer: 3, why: 'Le `-` supprime le retour à la ligne de la fin.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Pourquoi `country: NO` peut-il donner `false` en YAML ?',
			options: [
				'Les parseurs YAML 1.1 lisent `NO`, `no` et `off` sans guillemets comme des booléens',
				'Toute valeur de deux lettres devient un booléen si elle n’a pas de guillemets',
				'Les codes pays sont des mots réservés en YAML, comme `null` et `true`',
				'Les valeurs en majuscules sont toujours des booléens, dans toutes les versions de YAML'
			],
			answer: 0,
			why: 'Le type booléen de YAML 1.1 inclut `yes`, `no`, `on` et `off`, dans plusieurs casses. YAML 1.2 ne garde que `true` et `false`, mais beaucoup d’outils suivent encore 1.1. Mets des guillemets : `\'NO\'`.'
		},
		{
			q: 'Tu as besoin d’un script shell dans un fichier de CI, chaque commande sur sa ligne. Quel bloc scalaire utilises-tu ?',
			options: ['`>`', '`|`', '`>-`', 'Un scalaire plain sur une seule ligne'],
			answer: 1,
			why: '`|` (literal) garde chaque retour à la ligne. `>` (folded) joint les lignes avec des espaces, ce qui colle tes commandes les unes aux autres.'
		},
		{
			q: 'Un fichier Compose a `x-common: &common` avec un mapping `environment`, et un service utilise `<<: *common`. Que reçoit le service ?',
			options: [
				'Rien, Compose ignore tout ce qui commence par `x-`, ancres comprises',
				'Toutes les clés du bloc ancré, plus les clés que le service écrit à côté de `<<`',
				'Seulement les clés ancrées, et les clés que le service écrit à côté de `<<` sont ignorées',
				'Une copie de chaque clé de premier niveau du fichier Compose, sous le service'
			],
			answer: 1,
			why: 'Compose ignore la clé `x-` elle-même, mais l’ancre fonctionne quand même. La clé de fusion copie les clés du mapping, et les clés écrites dans le service s’ajoutent par-dessus.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Donner les valeurs de l’exercice à un vrai parseur YAML 1.1, voir ce que ton programme recevrait, puis les corriger jusqu’à ce qu’il reçoive ce que tu as écrit.',
		steps: [
			'Installe PyYAML dans un venv jetable : `mkdir -p ~/yaml-lab && cd ~/yaml-lab && python3 -m venv .venv && .venv/bin/pip install pyyaml`.',
			'Écris le fichier cassé : `printf \'country: NO\\nversion: 1.10\\nssh_port: 22:22\\nmode: 0755\\ndebug: off\\nscript: >\\n  echo one\\n  echo two\\n  echo three\\n\' > bad.yaml`.',
			'Parse-le comme le ferait un programme : `.venv/bin/python -c \'import sys, yaml; print(yaml.safe_load(open(sys.argv[1])))\' bad.yaml`.',
			'Copie-le dans `good.yaml` et corrige chaque ligne : mets `NO`, `1.10`, `22:22` et `0755` entre guillemets, écris `debug: false`, et remplace `script: >` par `script: |`. Parse `good.yaml` avec la même commande.',
			'Fais passer le bloc du script dans bash : `.venv/bin/python -c \'import sys, yaml; print(yaml.safe_load(open(sys.argv[1]))["script"], end="")\' good.yaml | bash`. Essaie la même chose sur `bad.yaml`.'
		],
		done: [
			'`bad.yaml` affiche `\'country\': False, \'version\': 1.1, \'ssh_port\': 1342, \'mode\': 493, \'debug\': False`.',
			'`good.yaml` affiche `\'NO\'`, `\'1.10\'`, `\'22:22\'` et `\'0755\'` comme des chaînes.',
			'Le script de `good.yaml` affiche `one`, `two` et `three` sur trois lignes. Celui de `bad.yaml` affiche `one echo two echo three` sur une seule ligne.'
		],
		solution: [
			'`country: "NO"`, `version: "1.10"`, `ssh_port: "22:22"`, `mode: "0755"`, `debug: false`.',
			'`script: |` suivi des trois commandes, chacune indentée de deux espaces.',
			'Supprime le dossier à la fin : le venv ne vit que dans `~/yaml-lab`.'
		]
	},
	recall: {
		q: 'Que fait un parseur YAML 1.1 des valeurs sans guillemets `NO`, `1.10`, `22:22` et `0755`, et comment les gardes-tu comme chaînes ?',
		a: 'Il les lit comme false, 1.1, 1342 et 493. Des guillemets, comme `\'NO\'` ou `"1.10"`, les gardent comme chaînes.'
	},
	sources: [
		{ title: 'Spécification YAML 1.2.2 (schéma core, blocs scalaires, ancres)', url: 'https://yaml.org/spec/1.2.2/' },
		{ title: 'Type booléen de YAML 1.1 (yes, no, on, off)', url: 'https://yaml.org/type/bool.html' },
		{ title: 'PyYAML, un parseur YAML 1.1', url: 'https://pyyaml.org/wiki/PyYAML' },
		{ title: 'Référence Compose, Fragments (ancres et fusion)', url: 'https://docs.docker.com/reference/compose-file/fragments/' },
		{ title: 'Règles yamllint, truthy', url: 'https://yamllint.readthedocs.io/en/stable/rules.html' }
	]
};
