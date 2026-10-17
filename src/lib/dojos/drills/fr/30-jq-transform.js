/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'jq-transform',
	part: 'Texte et données',
	title: 'Transformer avec jq',
	minutes: 10,
	hook: [
		'Ton outil de déploiement exporte son historique en JSON, et l’équipe veut un petit rapport : quels déploiements ont été les plus lents, combien ont tourné par environnement, quelles versions de `api` sont parties. jq répond à chacune de ces questions avec un seul filtre sur le fichier.',
		'Les exercices utilisent deux fichiers. `deploys.json` est un tableau de 4 déploiements : `{"service":"api","env":"prod","version":"1.4.2","minutes":6}`, `{"service":"web","env":"staging","version":"2.0.0","minutes":3}`, `{"service":"api","env":"staging","version":"1.5.0","minutes":4}`, `{"service":"worker","env":"prod","version":"0.9.1","minutes":11}`. `labels.json` est un seul objet : `{"app":"api","team":"payments","tier":"backend"}`.'
	],
	terms: [
		{ term: 'Construction d’objet', def: '`{...}` dans un filtre. Il fabrique un nouvel objet, comme `{name: .service}`, à partir des champs de l’entrée.' },
		{ term: 'Entrée (entry)', def: 'Une clé et sa valeur, que `to_entries` écrit sous la forme `{"key": ..., "value": ...}`.' },
		{ term: 'Affectation par mise à jour', def: '`|=` dans un filtre. Il passe l’ancienne valeur d’un champ dans un filtre et range le résultat au même endroit.' }
	],
	reps: [
		{
			prompt: 'Pour chaque déploiement, affiche un objet avec seulement `service` et `version`, un objet compact par ligne.',
			accept: [
				"jq -c '.[] | {service, version}' deploys.json",
				"jq -c '.[]|{service,version}' deploys.json",
				"jq -c '.[] | {service: .service, version: .version}' deploys.json",
				"jq --compact-output '.[] | {service, version}' deploys.json",
				"jq -c '.[] | { service, version }' deploys.json"
			],
			why: '`{service, version}` est le raccourci de jq pour `{service: .service, version: .version}`. `-c` affiche chaque objet sur une ligne : `{"service":"api","version":"1.4.2"}`.'
		},
		{
			prompt: 'Pareil, mais appelle la première clé `name` : affiche `{"name":"api","env":"prod"}` et ainsi de suite, un objet compact par ligne.',
			accept: [
				"jq -c '.[] | {name: .service, env}' deploys.json",
				"jq -c '.[] | {name: .service, env: .env}' deploys.json",
				"jq -c '.[]|{name:.service,env}' deploys.json",
				"jq -c '.[] | { name: .service, env }' deploys.json",
				"jq --compact-output '.[] | {name: .service, env}' deploys.json"
			],
			why: 'Dans `{name: .service}`, ce qui précède les deux-points est la nouvelle clé, et ce qui suit est un filtre appliqué à l’entrée. `env` tout seul garde la clé `env` avec la valeur de `.env`.'
		},
		{
			prompt: 'Affiche les noms des services triés par durée de déploiement, du plus rapide au plus lent, un par ligne sans guillemets.',
			accept: [
				"jq -r 'sort_by(.minutes) | .[].service' deploys.json",
				"jq -r 'sort_by(.minutes)|.[].service' deploys.json",
				"jq -r 'sort_by(.minutes)[].service' deploys.json",
				"jq -r 'sort_by(.minutes) | .[] | .service' deploys.json",
				"jq -r 'sort_by(.minutes) | map(.service) | .[]' deploys.json"
			],
			why: '`sort_by(.minutes)` trie le tableau selon le champ `minutes`, de 3 à 11. `.[].service` affiche ensuite `web`, `api`, `api` et `worker`.'
		},
		{
			prompt: 'Affiche les noms des services triés par durée de déploiement, du plus lent au plus rapide, un par ligne sans guillemets.',
			accept: [
				"jq -r 'sort_by(.minutes) | reverse | .[].service' deploys.json",
				"jq -r 'sort_by(.minutes)|reverse|.[].service' deploys.json",
				"jq -r 'sort_by(-.minutes) | .[].service' deploys.json",
				"jq -r 'sort_by(.minutes) | reverse | .[] | .service' deploys.json",
				"jq -r 'sort_by(.minutes) | reverse[].service' deploys.json"
			],
			why: '`sort_by` trie toujours du plus petit au plus grand. `reverse` retourne le tableau trié : `worker` (11 minutes) passe en tête.'
		},
		{
			prompt: 'Regroupe les déploiements par environnement et affiche les groupes sur une seule ligne compacte.',
			accept: ["jq -c 'group_by(.env)' deploys.json", "jq --compact-output 'group_by(.env)' deploys.json", 'jq -c "group_by(.env)" deploys.json'],
			why: '`group_by(.env)` renvoie un tableau de tableaux : un tableau de déploiements par valeur de `env`. Le manuel dit que les groupes sortent "sorted by the value of the .foo field" (triés selon la valeur du champ) : `prod` passe avant `staging`.'
		},
		{
			prompt: 'Affiche le nombre de déploiements par environnement sous la forme `[{"env":"prod","count":2},{"env":"staging","count":2}]`, sur une ligne.',
			accept: [
				"jq -c 'group_by(.env) | map({env: .[0].env, count: length})' deploys.json",
				"jq -c 'group_by(.env)|map({env:.[0].env,count:length})' deploys.json",
				"jq -c 'group_by(.env) | map({ env: .[0].env, count: length })' deploys.json",
				"jq -c '[group_by(.env)[] | {env: .[0].env, count: length}]' deploys.json",
				"jq -c 'group_by(.env) | map({env: first.env, count: length})' deploys.json"
			],
			why: 'Dans `map`, l’entrée est un groupe. `.[0].env` lit l’environnement de son premier déploiement, et `length` compte les déploiements du groupe.'
		},
		{
			prompt: 'Affiche chaque label de `labels.json` sous la forme `key=value`, un par ligne, comme `team=payments`.',
			accept: [
				"jq -r 'to_entries[] | \"\\(.key)=\\(.value)\"' labels.json",
				"jq -r 'to_entries | .[] | \"\\(.key)=\\(.value)\"' labels.json",
				"jq -r 'to_entries[] | .key + \"=\" + .value' labels.json",
				"jq -r 'to_entries | .[] | .key + \"=\" + .value' labels.json",
				"jq -r 'to_entries[]|\"\\(.key)=\\(.value)\"' labels.json",
				"jq -r 'to_entries | map(\"\\(.key)=\\(.value)\") | .[]' labels.json"
			],
			why: '`to_entries` change l’objet en tableau d’entrées `{"key": "app", "value": "api"}`. `"\\(.key)=\\(.value)"` est une interpolation de chaîne : jq met la valeur de chaque filtre à la place de son `\\(...)`.'
		},
		{
			prompt: 'Affiche les versions du service dont le shell passe le nom dans une variable jq `$svc`, qui vaut `api`, une par ligne sans guillemets.',
			accept: [
				"jq -r --arg svc api '.[] | select(.service == $svc) | .version' deploys.json",
				"jq -r --arg svc \"api\" '.[] | select(.service == $svc) | .version' deploys.json",
				"jq -r --arg svc 'api' '.[] | select(.service == $svc) | .version' deploys.json",
				"jq --arg svc api -r '.[] | select(.service == $svc) | .version' deploys.json",
				"jq -r --arg svc api '.[] | select(.service == $svc).version' deploys.json",
				"jq -r --arg svc api '.[]|select(.service==$svc)|.version' deploys.json"
			],
			why: '`--arg svc api` définit `$svc` avec la chaîne `"api"` : le filtre reste entre guillemets simples. jq affiche `1.4.2` et `1.5.0`. La valeur est toujours une chaîne : `--arg n 6` n’est jamais égal au nombre de `.minutes`, il faut `--argjson` pour ça.'
		},
		{
			prompt: 'Ajoute 1 aux `minutes` de chaque déploiement avec `|=` et affiche le tableau mis à jour.',
			accept: [
				"jq '.[].minutes |= . + 1' deploys.json",
				"jq '.[].minutes |= .+1' deploys.json",
				"jq 'map(.minutes |= . + 1)' deploys.json",
				"jq 'map(.minutes |= .+1)' deploys.json",
				"jq -c '.[].minutes |= . + 1' deploys.json",
				"jq -c 'map(.minutes |= . + 1)' deploys.json"
			],
			why: 'À droite de `|=`, `.` est l’ancienne valeur de chaque champ `minutes`, et `. + 1` la nouvelle. jq affiche tout le tableau avec `7`, `4`, `5` et `12` ; les autres champs ne bougent pas.'
		}
	],
	quiz: [],
	recall: {
		q: 'Pourquoi `jq --arg n 6 \'.[] | select(.minutes == $n)\' deploys.json` n’affiche rien ?',
		a: '`--arg` lie toujours une chaîne : `$n` vaut `"6"` et n’est jamais égal au nombre `6`. `--argjson n 6` lie le nombre et trouve le déploiement `api` en prod.'
	},
	sources: [{ title: 'Manuel de jq 1.7', url: 'https://jqlang.org/manual/v1.7/' }]
};
