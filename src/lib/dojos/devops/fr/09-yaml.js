const AIRFLOW = 'https://github.com/apache/airflow/blob/8317410ef7d935cfd4d40857cbc35efcb65a0867';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'yaml',
	part: 'Les fondamentaux',
	title: 'YAML : le format qui devine',
	minutes: 10,
	hook: [
		'Avant, tu configurais tes serveurs avec des accolades et des points-virgules : `nginx.conf`, `named.conf`. À partir de maintenant, presque tout ce que tu écris est en **YAML** : pipelines de CI, fichiers Compose, playbooks Ansible, manifestes Kubernetes.',
		'YAML a l’air de texte brut. Ce n’en est pas. Le parseur décide du type de chaque valeur, et il **devine**. Écris `country: NO` et un parseur YAML 1.1 donne `false` à ton programme. On appelle ça le problème norvégien.',
		'Aujourd’hui : les quelques règles qui couvrent le YAML de tous les jours, et les pièges qui transforment une version, un port ou un code pays en autre chose.'
	],
	terms: [
		{ term: 'Mapping', def: 'Des paires clé et valeur, `key: value`. L’imbrication se lit à l’indentation, avec des espaces uniquement : les tabulations sont interdites pour indenter.' },
		{ term: 'Séquence', def: 'Une liste. Un élément par ligne, chacun commence par `- `.' },
		{ term: 'Scalaire', def: 'Une valeur unique. Sans guillemets (plain), le parseur choisit son type : chaîne, nombre, booléen ou null. Entre guillemets, c’est toujours une chaîne.' },
		{ term: 'Bloc scalaire', def: 'Du texte sur plusieurs lignes. `|` garde les retours à la ligne, `>` les replie en espaces. Ajoute `-` (`|-`) pour supprimer le retour à la ligne final.' },
		{ term: 'Ancre et alias', def: '`&name` étiquette un nœud, `*name` le réutilise ailleurs. La clé de fusion `<<: *name` copie les clés d’un mapping dans un autre mapping.' },
		{ term: 'Document', def: 'Un seul fichier YAML peut contenir plusieurs documents, séparés par des lignes `---`. Kubernetes s’en sert pour mettre plusieurs ressources dans un fichier.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['src["Texte YAML"]', 'src --> map["Mapping : clé, valeur"]', 'src --> seq["Séquence : un élément par ligne"]'],
				highlight: ['src', 'map', 'seq'],
				note: 'Deux briques de base, imbriquées par **l’indentation**. Deux espaces, c’est le pas habituel. Une tabulation dans l’indentation est une erreur, et une mauvaise indentation déplace une clé chez un autre parent sans rien dire.'
			},
			{
				add: ['sc["Scalaire plain : NO, 1.10, 22:22, 0755"]', 'map --> sc', 'sc -->|"parseur YAML 1.1"| typed["false, 1.1, 1342, 493"]'],
				highlight: ['sc', 'typed'],
				note: 'PyYAML suit YAML 1.1. Il lit `NO` comme **false**, `1.10` comme le nombre **1.1**, `22:22` comme un nombre en base 60 (**1342**), `0755` comme de l’octal (**493**). Ta version, ton port et tes droits de fichier ont disparu.'
			},
			{
				add: ['sc -->|"entre guillemets"| str["Des chaînes, telles qu’écrites"]'],
				highlight: ['str'],
				note: 'Les guillemets arrêtent les devinettes : `\'NO\'`, `"1.10"`, `"22:22"`. YAML 1.2 a réduit les booléens à `true` et `false`, mais beaucoup d’outils parsent encore avec les règles 1.1, et `1.10` est un nombre dans les deux. **Dans le doute, mets des guillemets.**'
			},
			{
				add: ['blk["Bloc scalaire : texte multiligne"]', 'map --> blk'],
				highlight: ['blk'],
				note: 'Pour un script dans un fichier de CI, utilise `|` : chaque ligne reste une ligne. `>` joint les lignes avec des espaces, pratique pour une longue phrase, faux pour un script shell.'
			},
			{
				add: ['anc["Ancre : un bloc partagé"]', 'anc -.->|"alias et clé de fusion"| map'],
				highlight: ['anc'],
				note: 'Écris un bloc une fois avec `&common`, réutilise-le avec `*common`, ou fusionne-le dans un mapping avec `<<: *common` et ajoute des clés par-dessus. Moins de copier-coller, mais le lecteur doit maintenant sauter d’un bout à l’autre du fichier.'
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
			'`---` ouvre le document. `&airflow-common` ancre tout le bloc sous `x-airflow-common`. Compose [ignore les clés de premier niveau qui commencent par `x-`](https://docs.docker.com/reference/compose-file/extension/), donc ce bloc n’existe que pour être réutilisé.',
			'`<<: *airflow-common` fusionne ce bloc dans chaque service. Les clés écrites à côté (`command`, `ports`) s’ajoutent par-dessus. Un bloc, plusieurs services.',
			'`\'true\'` est entre guillemets exprès. La [doc de Compose](https://docs.docker.com/reference/compose-file/services/) dit que les booléens comme `true`, `false`, `yes`, `no` dans `environment` doivent être entre guillemets, pour que le parseur YAML ne les transforme pas en booléens.',
			'`"8080:8080"` est entre guillemets aussi. La même doc demande d’écrire toujours `HOST:CONTAINER` comme une chaîne entre guillemets, à cause de la règle YAML de la base 60. `22:22` sans guillemets, c’est le nombre 1342.',
			'`depends_on` est un mapping, donc il peut être fusionné. La [doc des fragments Compose](https://docs.docker.com/reference/compose-file/fragments/) précise que la fusion ne marche que sur des mappings, pas sur des séquences. C’est pour ça que ce fichier écrit `environment` sous la forme `KEY: value`, et pas comme une liste de `- KEY=value`.',
			'`|version|` n’est pas du YAML : c’est un marqueur que le build de la doc Airflow remplace par une vraie version.'
		]
	},
	tradeoff: {
		gain: [
			'Lisible par un humain, avec des commentaires, contrairement au JSON.',
			'Un seul format pour la CI, Compose, Ansible et Kubernetes : tu l’apprends une fois.',
			'Les ancres et les documents multiples par fichier gardent les grosses configs courtes.'
		],
		cost: [
			'Les types sont devinés. `NO`, `1.10`, `22:22` et `0755` changent tous de sens sans guillemets.',
			'L’indentation fait partie de la syntaxe. Une seule indentation fausse déplace une clé, et souvent le fichier se parse quand même.',
			'Les parseurs diffèrent : règles YAML 1.1, règles YAML 1.2, et extras propres à chaque outil comme la clé de fusion. Un linter comme `yamllint` (sa règle `truthy`) en attrape une partie.'
		]
	},
	task: {
		prompt: 'Repère chaque valeur qui n’arrivera pas au programme comme tu le voulais : `country: NO`, `version: 1.10`, `ssh_port: 22:22`, `mode: 0755`, `debug: off`, et un bloc `script: >` qui contient trois commandes shell, une par ligne. Corrige chacune.',
		hint: 'Lis chaque scalaire plain comme le ferait un parseur YAML 1.1. Pour le script, demande-toi ce que deviennent les retours à la ligne.',
		answer: [
			'`country: NO` devient `false`. Écris `country: \'NO\'`.',
			'`version: 1.10` devient le nombre 1.1. Écris `version: "1.10"`.',
			'`ssh_port: 22:22` est un nombre en base 60, 1342. Écris `"22:22"`.',
			'`mode: 0755` vaut 493 (octal) en YAML 1.1, mais le simple nombre 755 en YAML 1.2. Mets des guillemets, `"0755"`, et laisse l’outil faire la conversion.',
			'`debug: off` devient `false` en YAML 1.1. Écris `false` si tu veux un booléen, `\'off\'` si tu veux le mot.',
			'`>` replie les trois lignes en une seule ligne avec des espaces. Utilise `|` pour que chaque commande reste sur sa ligne.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi `country: NO` peut-il devenir `false` en YAML ?',
			options: [
				'Les parseurs YAML 1.1 lisent `NO`, `no` et `off` sans guillemets comme des booléens',
				'Toute valeur de deux lettres devient un booléen',
				'Les codes pays sont des mots réservés en YAML',
				'Les valeurs en majuscules sont toujours des booléens'
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
				'Rien, Compose ignore tout ce qui commence par `x-`',
				'Toutes les clés du bloc ancré, plus les clés que le service écrit à côté de `<<`',
				'Seulement la première clé du bloc ancré',
				'Une copie du fichier Compose entier'
			],
			answer: 1,
			why: 'Compose ignore la clé `x-` elle-même, mais l’ancre fonctionne quand même. La clé de fusion copie les clés du mapping, et les clés écrites dans le service s’ajoutent par-dessus.'
		}
	],
	takeaway: 'YAML devine le type des valeurs sans guillemets. Indente avec des espaces, mets entre guillemets tout ce qui ressemble à un nombre, un booléen ou une heure, et utilise `|` pour les scripts.',
	sources: [
		{ title: 'Spécification YAML 1.2.2 (schéma core, blocs scalaires, ancres)', url: 'https://yaml.org/spec/1.2.2/' },
		{ title: 'Type booléen de YAML 1.1 (yes, no, on, off)', url: 'https://yaml.org/type/bool.html' },
		{ title: 'PyYAML, un parseur YAML 1.1', url: 'https://pyyaml.org/wiki/PyYAML' },
		{ title: 'Référence Compose, Fragments (ancres et fusion)', url: 'https://docs.docker.com/reference/compose-file/fragments/' },
		{ title: 'Règles yamllint, truthy', url: 'https://yamllint.readthedocs.io/en/stable/rules.html' }
	]
};
