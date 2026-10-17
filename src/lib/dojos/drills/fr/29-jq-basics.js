/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'jq-basics',
	part: 'Texte et données',
	title: 'Les bases de jq',
	minutes: 10,
	hook: [
		'L’endpoint de statut de ton cluster renvoie une seule longue ligne de JSON. Tu veux savoir quel service est en panne, et faire défiler le texte brut ne te le dit pas. `jq` lit du JSON, lui applique un filtre et affiche le résultat, en JSON ou en texte brut avec `-r`.',
		'Les exercices utilisent `services.json` : `{"region":"eu-west-1","services":[{"name":"api","status":"up","replicas":3},{"name":"worker","status":"down","replicas":0},{"name":"web","status":"up","replicas":2}]}`. Donne le nom du fichier à jq en dernier argument.'
	],
	terms: [
		{ term: 'Filtre', def: 'Le programme jq que tu passes entre guillemets, comme `.services[0]`. Il prend du JSON en entrée et sort du JSON.' },
		{ term: 'Itérateur', def: '`.[]`, qui sort chaque élément d’un tableau comme un résultat séparé. `.services[]` donne 3 objets, l’un après l’autre.' },
		{ term: 'Pipe', def: '`|` dans un filtre. Il envoie chaque résultat de la partie gauche dans la partie droite, comme `.services[] | .name`.' }
	],
	reps: [
		{
			prompt: 'Affiche la région.',
			accept: ["jq '.region' services.json", 'jq .region services.json', 'jq ".region" services.json'],
			why: '`.region` lit le champ `region` de l’objet du haut. jq l’affiche comme une chaîne JSON, avec ses guillemets : `"eu-west-1"`.'
		},
		{
			prompt: 'Affiche la région sans les guillemets, pour t’en servir dans un script shell.',
			accept: [
				"jq -r '.region' services.json",
				'jq -r .region services.json',
				'jq -r ".region" services.json',
				"jq --raw-output '.region' services.json",
				'jq --raw-output .region services.json',
				"jq '.region' -r services.json"
			],
			why: '`-r` écrit un résultat de type chaîne en texte brut, sans les guillemets du JSON. `REGION=$(jq -r .region services.json)` contient alors `eu-west-1` et pas `"eu-west-1"`.'
		},
		{
			prompt: 'Affiche le nom de chaque service, un par ligne, sans guillemets.',
			accept: [
				"jq -r '.services[].name' services.json",
				"jq -r '.services[] | .name' services.json",
				"jq -r '.services[]|.name' services.json",
				"jq -r '.services | .[] | .name' services.json",
				"jq --raw-output '.services[].name' services.json"
			],
			why: '`.services[]` sort les 3 objets service un par un, et `.name` s’applique à chacun. La sortie : `api`, `worker` et `web` sur 3 lignes.'
		},
		{
			prompt: 'Affiche le nombre de services.',
			accept: ["jq '.services | length' services.json", "jq '.services|length' services.json", 'jq ".services | length" services.json'],
			why: 'Le `length` d’un tableau est son nombre d’éléments, ici `3`. Avec `.services[] | length`, tu obtiens la longueur de chaque objet, son nombre de champs : `3` trois fois.'
		},
		{
			prompt: 'Affiche les clés de l’objet du haut.',
			accept: ["jq 'keys' services.json", 'jq keys services.json', "jq '. | keys' services.json", 'jq "keys" services.json'],
			why: '`keys` renvoie les clés d’un objet dans un tableau : `["region","services"]`. Le manuel de jq : les clés sont triées "by unicode codepoint order" (par ordre des points de code Unicode), pas dans l’ordre du fichier.'
		},
		{
			prompt: 'Affiche les clés du premier service.',
			accept: ["jq '.services[0] | keys' services.json", "jq '.services[0]|keys' services.json", 'jq ".services[0] | keys" services.json'],
			why: '`.services[0]` prend l’objet `api`. `keys` renvoie `["name","replicas","status"]`, trié : `replicas` passe avant `status`, alors que le fichier le met en dernier.'
		},
		{
			prompt: 'Affiche le nom du service dont le statut est `down`, sans guillemets.',
			accept: [
				"jq -r '.services[] | select(.status == \"down\") | .name' services.json",
				"jq -r '.services[] | select(.status==\"down\") | .name' services.json",
				"jq -r '.services[]|select(.status==\"down\")|.name' services.json",
				"jq -r '.services[] | select(.status == \"down\").name' services.json",
				"jq --raw-output '.services[] | select(.status == \"down\") | .name' services.json"
			],
			why: '`select(.status == "down")` laisse passer un objet quand le test est vrai et le jette sinon. Seul l’objet `worker` arrive jusqu’à `.name` : jq affiche `worker`.'
		},
		{
			prompt: 'Affiche un tableau des nombres de réplicas, `[3,0,2]`. Utilise `map`.',
			accept: ["jq '.services | map(.replicas)' services.json", "jq '.services|map(.replicas)' services.json", 'jq ".services | map(.replicas)" services.json'],
			why: '`map(.replicas)` applique `.replicas` à chaque élément et range les résultats dans un nouveau tableau. Le manuel le définit comme `[.[] | f]` : `[.services[].replicas]` donne le même tableau.'
		},
		{
			prompt: 'Affiche un tableau des noms des services `up` : `["api","web"]`.',
			accept: [
				"jq '.services | map(select(.status == \"up\") | .name)' services.json",
				"jq '.services | map(select(.status == \"up\").name)' services.json",
				"jq '.services|map(select(.status==\"up\")|.name)' services.json",
				"jq '[.services[] | select(.status == \"up\") | .name]' services.json",
				"jq '[.services[]|select(.status==\"up\")|.name]' services.json",
				"jq '.services | map(select(.status == \"up\")) | map(.name)' services.json"
			],
			why: 'Dans `map`, `select` jette l’objet `worker`, et `.name` remplace chaque objet gardé par son nom. `map` range `"api"` et `"web"` dans un seul tableau.'
		},
		{
			prompt: 'Affiche combien de services sont `up`.',
			accept: [
				"jq '.services | map(select(.status == \"up\")) | length' services.json",
				"jq '.services|map(select(.status==\"up\"))|length' services.json",
				"jq '[.services[] | select(.status == \"up\")] | length' services.json",
				"jq '[.services[]|select(.status==\"up\")]|length' services.json"
			],
			why: '`map(select(...))` garde les 2 objets `up` dans un tableau, et `length` les compte : `2`. Sans le tableau, `.services[] | select(...) | length` afficherait le nombre de champs de chaque objet.'
		}
	],
	quiz: [],
	recall: {
		q: 'Que change `-r` dans `jq -r .region services.json` ?',
		a: 'jq affiche la chaîne en texte brut, `eu-west-1`, au lieu d’une chaîne JSON avec ses guillemets, `"eu-west-1"`.'
	},
	sources: [{ title: 'Manuel de jq 1.7', url: 'https://jqlang.org/manual/v1.7/' }]
};
