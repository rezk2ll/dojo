/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'awk',
	part: 'Texte et données',
	title: 'awk',
	minutes: 10,
	hook: [
		'Le support signale que certains appels d’API prennent des secondes et que des commandes ont l’air fausses. Tu as le log d’accès et un export de la table des commandes, et pas le temps de les charger dans une base. `awk` lit un fichier ligne par ligne, coupe chaque ligne en champs `$1`, `$2`, `$3` et ainsi de suite, et lance un petit programme sur chaque ligne.',
		'Les exercices utilisent deux fichiers. `access.log` a 4 lignes avec les champs IP, méthode, chemin, statut et durée en ms, séparés par des espaces : `10.0.0.12 GET /api/users 200 18`, `10.0.0.7 POST /api/orders 201 95`, `10.0.0.12 GET /api/orders 500 230`, `10.0.0.9 GET /health 200 2`. `orders.csv` a l’en-tête `id,customer,country,amount` et 5 lignes : `1,ana,FR,30`, `2,bob,DE,45`, `3,chen,FR,25`, `4,dina,US,60`, `5,eve,DE,15`. Les réponses marchent avec n’importe quel awk POSIX.'
	],
	terms: [
		{ term: 'Champ', def: 'Un morceau de ligne une fois qu’awk l’a coupée. `$1` est le premier champ, et `$0` contient la ligne complète.' },
		{ term: 'Séparateur de champs', def: 'Ce sur quoi awk coupe une ligne. Par défaut, les suites d’espaces et de tabulations ; `-F,` le règle sur la virgule.' },
		{ term: 'Motif', def: 'Une condition placée avant `{...}`, comme `$4 == 500`. awk ne lance l’action que sur les lignes où elle est vraie.' }
	],
	reps: [
		{
			prompt: 'Affiche le chemin (le 3e champ) de chaque ligne de `access.log`.',
			accept: ["awk '{print $3}' access.log", "awk '{ print $3 }' access.log", 'awk "{print \\$3}" access.log', "awk '{print $3;}' access.log"],
			why: 'awk coupe chaque ligne sur les espaces, donc `$3` est le chemin. `{print $3}` tourne sur toutes les lignes, car aucun motif ne le précède.'
		},
		{
			prompt: 'Affiche l’IP et le statut de chaque ligne, séparés par une espace.',
			accept: [
				"awk '{print $1, $4}' access.log",
				"awk '{ print $1, $4 }' access.log",
				"awk '{print $1,$4}' access.log",
				"awk '{print $1 \" \" $4}' access.log",
				"awk '{print $1\" \"$4}' access.log"
			],
			why: 'La virgule de `print $1, $4` met le séparateur de sortie entre les deux valeurs, une espace par défaut. Sans virgule, `print $1 $4` les colle : `10.0.0.12200`.'
		},
		{
			prompt: 'Affiche le dernier champ de chaque ligne de `access.log` sans écrire son numéro.',
			accept: ["awk '{print $NF}' access.log", "awk '{ print $NF }' access.log"],
			why: '`NF` contient le nombre de champs de la ligne courante, ici 5. `$NF` est donc le dernier champ, la durée en ms, quel que soit le nombre de champs.'
		},
		{
			prompt: 'Affiche chaque ligne de `access.log` précédée de son numéro, comme `1 10.0.0.12 GET /api/users 200 18`.',
			accept: ["awk '{print NR, $0}' access.log", "awk '{ print NR, $0 }' access.log", "awk '{print NR,$0}' access.log", "awk '{print NR \" \" $0}' access.log"],
			why: '`NR` est le numéro de la ligne courante, compté à partir de 1. `$0` contient la ligne complète.'
		},
		{
			prompt: 'Affiche les lignes complètes de `access.log` dont le statut vaut 500.',
			accept: [
				"awk '$4 == 500' access.log",
				"awk '$4==500' access.log",
				"awk '$4 == 500 {print}' access.log",
				"awk '$4 == 500 { print }' access.log",
				"awk '$4 == 500 {print $0}' access.log",
				"awk '$4==500{print}' access.log",
				"awk '$4 == \"500\"' access.log"
			],
			why: '`$4 == 500` est un motif : awk ne garde que les lignes qui le vérifient. Un motif sans action affiche la ligne : POSIX dit qu’une action absente équivaut à `{ print }`.'
		},
		{
			prompt: 'Affiche les noms des clients (la 2e colonne) de `orders.csv`, ligne d’en-tête comprise.',
			accept: [
				"awk -F, '{print $2}' orders.csv",
				"awk -F',' '{print $2}' orders.csv",
				"awk -F ',' '{print $2}' orders.csv",
				"awk -F , '{print $2}' orders.csv",
				'awk -F"," \'{print $2}\' orders.csv',
				"awk -F, '{ print $2 }' orders.csv",
				"awk -v FS=, '{print $2}' orders.csv",
				"awk 'BEGIN {FS=\",\"} {print $2}' orders.csv"
			],
			why: '`-F,` règle le séparateur de champs sur la virgule, donc `$2` est le client. Sans lui, awk coupe sur les espaces, n’en trouve aucune, et `$2` est vide sur chaque ligne.'
		},
		{
			prompt: 'Pareil, mais saute la ligne d’en-tête.',
			accept: [
				"awk -F, 'NR > 1 {print $2}' orders.csv",
				"awk -F, 'NR>1 {print $2}' orders.csv",
				"awk -F, 'NR>1{print $2}' orders.csv",
				"awk -F, 'NR > 1 { print $2 }' orders.csv",
				"awk -F, 'NR >= 2 {print $2}' orders.csv",
				"awk -F, 'NR>=2 {print $2}' orders.csv",
				"awk -F, 'NR != 1 {print $2}' orders.csv",
				"awk -F',' 'NR > 1 {print $2}' orders.csv"
			],
			why: 'Le motif `NR > 1` est faux sur la ligne 1, l’en-tête : awk affiche de `ana` à `eve` et saute `customer`.'
		},
		{
			prompt: 'Affiche le total de la colonne des durées (champ 5) de `access.log`. Garde le total dans une variable nommée `sum`.',
			accept: [
				"awk '{sum += $5} END {print sum}' access.log",
				"awk '{ sum += $5 } END { print sum }' access.log",
				"awk '{sum+=$5} END {print sum}' access.log",
				"awk '{sum+=$5} END{print sum}' access.log",
				"awk '{sum+=$5}END{print sum}' access.log",
				"awk '{sum = sum + $5} END {print sum}' access.log"
			],
			why: '`{sum += $5}` tourne sur chaque ligne, et `END` tourne une fois après la dernière. awk démarre une variable non définie à 0 : `sum` n’a besoin d’aucune préparation, et le résultat vaut `345`.'
		},
		{
			prompt: 'Affiche le montant total des commandes `FR` de `orders.csv`, avec une variable nommée `sum`.',
			accept: [
				"awk -F, '$3 == \"FR\" {sum += $4} END {print sum}' orders.csv",
				"awk -F, '$3==\"FR\" {sum+=$4} END {print sum}' orders.csv",
				"awk -F, '$3 == \"FR\" { sum += $4 } END { print sum }' orders.csv",
				"awk -F, '$3==\"FR\"{sum+=$4}END{print sum}' orders.csv",
				"awk -F, '$3 ~ /FR/ {sum += $4} END {print sum}' orders.csv",
				"awk -F, '$3 ~ /^FR$/ {sum += $4} END {print sum}' orders.csv"
			],
			why: '`$3 == "FR"` garde les lignes de `ana` et `chen`, et `sum += $4` ajoute 30 et 25, soit `55`. Les guillemets comptent : sans eux, awk lit `FR` comme une variable vide, et aucune ligne ne correspond.'
		},
		{
			prompt: 'Compte les commandes par pays dans `orders.csv` : une ligne `pays nombre` par pays, dans n’importe quel ordre. Utilise un tableau nommé `count` et une variable de boucle `c`.',
			accept: [
				"awk -F, 'NR > 1 {count[$3]++} END {for (c in count) print c, count[c]}' orders.csv",
				"awk -F, 'NR>1 {count[$3]++} END {for (c in count) print c, count[c]}' orders.csv",
				"awk -F, 'NR>1{count[$3]++}END{for(c in count)print c,count[c]}' orders.csv",
				"awk -F, 'NR > 1 { count[$3]++ } END { for (c in count) print c, count[c] }' orders.csv",
				"awk -F, 'NR>1 {count[$3]++} END {for (c in count) print c,count[c]}' orders.csv",
				"awk -F, 'NR>1 {count[$3]++} END {for(c in count) print c, count[c]}' orders.csv",
				"awk -F, 'NR > 1 {count[$3]++} END {for (c in count) {print c, count[c]}}' orders.csv"
			],
			why: '`count[$3]++` ajoute 1 à la case du pays de la ligne. Dans `END`, `for (c in count)` passe une fois par pays et affiche `FR 2`, `DE 2` et `US 1`, dans un ordre quelconque. POSIX ne fixe pas l’ordre de `for (c in count)` : passe la sortie à `sort` si tu en veux un.'
		}
	],
	quiz: [],
	recall: {
		q: 'Avec awk, que valent `NR` et `NF` sur la ligne `10.0.0.7 POST /api/orders 201 95`, la 2e ligne de `access.log` ?',
		a: '`NR` vaut 2, le numéro de ligne compté à partir de 1. `NF` vaut 5, le nombre de champs, donc `$NF` est le dernier champ, `95`.'
	},
	sources: [
		{ title: 'POSIX : awk', url: 'https://pubs.opengroup.org/onlinepubs/9799919799/utilities/awk.html' }
	]
};
