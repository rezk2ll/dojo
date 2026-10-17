/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sed',
	part: 'Texte et données',
	title: 'sed',
	minutes: 10,
	hook: [
		'Le serveur de staging a disparu, et chaque hôte de `deploy.conf` doit maintenant viser la production. Ouvrir le fichier dans un éditeur sur une machine en SSH, ça passe une fois. Sur 40 machines, `sed` fait la même modification en une ligne de commande : il lit le fichier ligne par ligne, lance un petit script sur chaque ligne et affiche le résultat.',
		'Les exercices utilisent GNU sed sur ce `deploy.conf` de 7 lignes. Ligne 1 : `# deploy settings`. Ligne 2 : `host=staging.example.com`. Ligne 3 : `port=8080`. Ligne 4 : `path=/var/www/app`. Ligne 5 : `# health check`. Ligne 6 : `url=http://staging.example.com/staging/health`. Ligne 7 : `debug=true`. Sauf si l’énoncé dit autre chose, affiche le résultat et ne modifie pas le fichier.'
	],
	terms: [
		{ term: 'Adresse', def: 'La partie placée avant une commande sed, qui choisit les lignes où elle s’applique : un numéro comme `2`, une regex comme `/^#/`, ou un intervalle comme `2,4`.' },
		{ term: 'Pattern space', def: 'Le tampon qui contient la ligne courante pendant que sed lui applique le script. sed l’affiche à la fin de chaque ligne, sauf avec `-n`.' },
		{ term: 'Délimiteur', def: 'Le caractère qui sépare les parties de `s/REGEXP/REPLACEMENT/`. C’est `/` par défaut, et ça peut être n’importe quel autre caractère.' }
	],
	reps: [
		{
			prompt: 'Remplace le premier `staging` de chaque ligne par `prod`.',
			accept: [
				"sed 's/staging/prod/' deploy.conf",
				'sed "s/staging/prod/" deploy.conf',
				'sed s/staging/prod/ deploy.conf',
				"sed -e 's/staging/prod/' deploy.conf",
				'sed -e "s/staging/prod/" deploy.conf'
			],
			why: '`s/staging/prod/` remplace la première correspondance de chaque ligne. La ligne 6 sort en `url=http://prod.example.com/staging/health` : le second `staging` de cette ligne reste là.'
		},
		{
			prompt: 'Remplace tous les `staging` de toutes les lignes par `prod`.',
			accept: [
				"sed 's/staging/prod/g' deploy.conf",
				'sed "s/staging/prod/g" deploy.conf',
				'sed s/staging/prod/g deploy.conf',
				"sed -e 's/staging/prod/g' deploy.conf",
				'sed -e "s/staging/prod/g" deploy.conf'
			],
			why: 'Le drapeau `g` après le dernier `/` applique le remplacement à toutes les correspondances de la ligne. La ligne 6 sort en `url=http://prod.example.com/prod/health`.'
		},
		{
			prompt: 'Fais ce même remplacement global dans `deploy.conf` lui-même, et garde l’original sous le nom `deploy.conf.bak`.',
			accept: [
				"sed -i.bak 's/staging/prod/g' deploy.conf",
				'sed -i.bak "s/staging/prod/g" deploy.conf',
				"sed --in-place=.bak 's/staging/prod/g' deploy.conf",
				'sed --in-place=.bak "s/staging/prod/g" deploy.conf',
				"sed -i.bak -e 's/staging/prod/g' deploy.conf",
				"sed -e 's/staging/prod/g' -i.bak deploy.conf"
			],
			why: '`-i` réécrit le fichier avec le résultat, et le suffixe collé derrière, `.bak`, donne le nom de la copie de secours. Avec une espace, `sed -i .bak` échoue : GNU sed prend `.bak` pour le script et s’arrête sur "unknown command".'
		},
		{
			prompt: 'Affiche le fichier sans ses lignes de commentaire (celles qui commencent par `#`).',
			accept: [
				"sed '/^#/d' deploy.conf",
				'sed "/^#/d" deploy.conf',
				'sed /^#/d deploy.conf',
				"sed -e '/^#/d' deploy.conf",
				'sed -e "/^#/d" deploy.conf'
			],
			why: '`/^#/` est une adresse : elle choisit les lignes qui correspondent à la regex. `d` supprime ces lignes, donc les lignes 1 et 5 ne sortent pas.'
		},
		{
			prompt: 'Affiche le fichier sans sa dernière ligne.',
			accept: ["sed '$d' deploy.conf", "sed -e '$d' deploy.conf", 'sed \\$d deploy.conf'],
			why: 'L’adresse `$` désigne la dernière ligne, donc `$d` enlève `debug=true`. Garde les guillemets simples : dans `"$d"`, le shell remplace `$d` par la valeur d’une variable `d`, en général vide, et sed ne supprime alors rien.'
		},
		{
			prompt: 'Affiche seulement les lignes 2 à 4.',
			accept: [
				"sed -n '2,4p' deploy.conf",
				'sed -n "2,4p" deploy.conf',
				'sed -n 2,4p deploy.conf',
				"sed -n -e '2,4p' deploy.conf",
				"sed --quiet '2,4p' deploy.conf",
				"sed --silent '2,4p' deploy.conf",
				"sed '2,4!d' deploy.conf"
			],
			why: '`-n` coupe l’affichage automatique de chaque ligne. `2,4p` affiche alors les lignes 2 à 4 et rien d’autre : `host`, `port` et `path`. Sans `-n`, ces 3 lignes sortiraient deux fois.'
		},
		{
			prompt: 'Affiche de la ligne `# health check` jusqu’à la fin du fichier.',
			accept: [
				"sed -n '/^# health check/,$p' deploy.conf",
				"sed -n '/# health check/,$p' deploy.conf",
				"sed -n '/health check/,$p' deploy.conf",
				"sed -n '/^# health check$/,$p' deploy.conf",
				"sed -n -e '/^# health check/,$p' deploy.conf"
			],
			why: 'Un intervalle peut commencer à une regex : `/^# health check/` trouve la ligne 5, et `$` est la dernière ligne. Avec `-n` et `p`, sed affiche les lignes 5 à 7.'
		},
		{
			prompt: 'Remplace `/var/www/app` par `/srv/app`. Prends un autre délimiteur que `/` pour ne pas avoir à échapper les barres obliques.',
			accept: [
				"sed 's|/var/www/app|/srv/app|' deploy.conf",
				'sed "s|/var/www/app|/srv/app|" deploy.conf',
				"sed 's#/var/www/app#/srv/app#' deploy.conf",
				'sed "s#/var/www/app#/srv/app#" deploy.conf',
				"sed 's,/var/www/app,/srv/app,' deploy.conf",
				"sed 's@/var/www/app@/srv/app@' deploy.conf",
				"sed 's:/var/www/app:/srv/app:' deploy.conf"
			],
			why: 'Le manuel de GNU sed : "The / characters may be uniformly replaced by any other single character within any given s command." (tu peux remplacer tous les `/` d’une commande `s` par un autre caractère). Avec `|`, les barres obliques des deux chemins sont du texte normal. Avec `/`, il faudrait écrire `s/\\/var\\/www\\/app/\\/srv\\/app/`.'
		},
		{
			prompt: 'Change chaque ligne `key=value` en `key: value`, par exemple `port: 8080`. Capture la clé avec un groupe, en regex étendue.',
			accept: [
				"sed -E 's/^([a-z]+)=/\\1: /' deploy.conf",
				"sed -r 's/^([a-z]+)=/\\1: /' deploy.conf",
				"sed --regexp-extended 's/^([a-z]+)=/\\1: /' deploy.conf",
				"sed -E 's/^([^=]+)=/\\1: /' deploy.conf",
				"sed -E 's/^(\\w+)=/\\1: /' deploy.conf",
				"sed -E 's/([a-z]+)=/\\1: /' deploy.conf",
				'sed -E "s/^([a-z]+)=/\\1: /" deploy.conf'
			],
			why: '`-E` active la regex étendue : `(...)` forme un groupe sans antislash. Dans le remplacement, `\\1` remet le texte du groupe 1, ici `port`, suivi de `: `. Les lignes de commentaire n’ont pas de `=` et restent telles quelles.'
		},
		{
			prompt: 'Remplace tous les `staging` par `prod`, et affiche seulement les lignes modifiées.',
			accept: [
				"sed -n 's/staging/prod/gp' deploy.conf",
				'sed -n "s/staging/prod/gp" deploy.conf',
				"sed -n 's/staging/prod/pg' deploy.conf",
				"sed --quiet 's/staging/prod/gp' deploy.conf",
				"sed -n -e 's/staging/prod/gp' deploy.conf"
			],
			why: '`-n` coupe l’affichage automatique. Le drapeau `p` de `s` affiche la ligne seulement si un remplacement a eu lieu : sed affiche les nouvelles lignes 2 et 6, et rien d’autre.'
		}
	],
	quiz: [],
	recall: {
		q: 'Comment faire modifier `deploy.conf` sur place par sed en gardant l’original sous `deploy.conf.bak` ?',
		a: 'Avec `-i.bak`, le suffixe collé à `-i` : `sed -i.bak \'s/staging/prod/g\' deploy.conf`. Avec une espace (`-i .bak`), GNU sed prend `.bak` pour le script et échoue.'
	},
	sources: [
		{ title: 'Manuel GNU sed : options de la ligne de commande', url: 'https://www.gnu.org/software/sed/manual/html_node/Command_002dLine-Options.html' },
		{ title: 'Manuel GNU sed : la commande s', url: 'https://www.gnu.org/software/sed/manual/html_node/The-_0022s_0022-Command.html' },
		{ title: 'Manuel GNU sed : intervalles d’adresses', url: 'https://www.gnu.org/software/sed/manual/html_node/Range-Addresses.html' }
	]
};
