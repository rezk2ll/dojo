/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'xargs',
	part: 'Le shell',
	title: 'xargs',
	minutes: 10,
	hook: [
		'Le disque d’un serveur de build est plein à 97 %. `find` et `grep` te donnent des listes de noms de fichiers, un par ligne, mais `rm`, `gzip` et `cp` attendent ces noms en arguments. `xargs` lit la liste sur l’entrée standard et construit ces lignes de commande à ta place.',
		'Les exercices se passent dans un seul dossier. `logs/` contient `api.log` (3 lignes, dont `FATAL db down`), `web.log` (2 lignes), `old report.log`, `stale.tmp` et `cache 1.tmp` ; 2 de ces noms contiennent une espace. `files.txt` liste `logs/api.log` et `logs/web.log`, un par ligne. `paths.txt` liste 3 chemins complets : `/var/log/nginx/access.log`, `/var/log/nginx/error.log` et `/var/log/syslog`. `hosts.txt` liste `web1`, `web2` et `db1`.'
	],
	terms: [
		{ term: 'élément', def: 'Un mot que `xargs` lit sur l’entrée standard. Par défaut, les blancs et les sauts de ligne séparent les éléments : `cache 1.tmp` en donne 2.' },
		{ term: 'caractère nul', def: 'L’octet de valeur 0. `find -print0` et `xargs -0` s’en servent pour séparer les noms de fichiers : une espace ou un saut de ligne dans un nom reste dans le nom.' },
		{ term: '-print0', def: 'Une action de `find` qui affiche chaque nom de fichier suivi d’un caractère nul au lieu d’un saut de ligne.' }
	],
	reps: [
		{
			prompt: 'Affiche les 3 noms d’hôtes de `hosts.txt` sur une seule ligne, séparés par des espaces.',
			accept: ['xargs < hosts.txt', 'cat hosts.txt | xargs', 'xargs echo < hosts.txt', 'cat hosts.txt | xargs echo', '< hosts.txt xargs', 'xargs -a hosts.txt', 'xargs <hosts.txt'],
			why: 'Sans commande, `xargs` lance `echo` avec tous les éléments en arguments. Tu obtiens `web1 web2 db1`.'
		},
		{
			prompt: 'Compte les lignes de chaque fichier listé dans `files.txt` avec un seul appel à `wc -l`.',
			accept: [
				'xargs wc -l < files.txt',
				'cat files.txt | xargs wc -l',
				'< files.txt xargs wc -l',
				'xargs wc -l <files.txt',
				'xargs -a files.txt wc -l',
				'xargs --arg-file=files.txt wc -l'
			],
			why: '`xargs` ajoute les éléments après `wc -l` et lance donc `wc -l logs/api.log logs/web.log`. `wc` affiche 3 lignes : un compte par fichier et une ligne `total`.'
		},
		{
			prompt: 'Supprime les fichiers listés dans `files.txt` et affiche la commande `rm` sur la sortie d’erreur avant qu’elle tourne.',
			accept: ['xargs -t rm < files.txt', 'cat files.txt | xargs -t rm', 'xargs --verbose rm < files.txt', 'xargs -a files.txt -t rm', '< files.txt xargs -t rm', 'xargs -t -a files.txt rm'],
			why: '`-t` affiche `rm logs/api.log logs/web.log` sur la sortie d’erreur, puis la lance. Tu vois ainsi ce que `xargs` construit avant de lui confier un `rm`.'
		},
		{
			prompt: 'Affiche le nom de fichier de chaque chemin de `paths.txt` avec `basename`, qui prend un chemin par appel.',
			accept: [
				'xargs -n 1 basename < paths.txt',
				'xargs -n1 basename < paths.txt',
				'cat paths.txt | xargs -n 1 basename',
				'cat paths.txt | xargs -n1 basename',
				'xargs --max-args=1 basename < paths.txt',
				'xargs -L 1 basename < paths.txt',
				'xargs -a paths.txt -n 1 basename',
				'< paths.txt xargs -n 1 basename'
			],
			why: '`-n 1` met au plus 1 élément par ligne de commande : `basename` tourne 3 fois et affiche `access.log`, `error.log`, `syslog`. Sans cette option, `xargs` lance `basename` une fois avec 3 chemins et `basename` s’arrête sur `extra operand`.'
		},
		{
			prompt: 'Copie chaque fichier listé dans `files.txt` vers le même nom suivi de `.bak`, comme `logs/api.log.bak`.',
			accept: [
				'xargs -I {} cp {} {}.bak < files.txt',
				'xargs -I{} cp {} {}.bak < files.txt',
				'cat files.txt | xargs -I {} cp {} {}.bak',
				'cat files.txt | xargs -I{} cp {} {}.bak',
				"xargs -I '{}' cp '{}' '{}'.bak < files.txt",
				'xargs -I % cp % %.bak < files.txt',
				'xargs -a files.txt -I {} cp {} {}.bak',
				'< files.txt xargs -I {} cp {} {}.bak'
			],
			why: '`-I {}` lance la commande une fois par ligne lue et remplace chaque `{}` par cette ligne. Le premier appel est `cp logs/api.log logs/api.log.bak`.'
		},
		{
			prompt: 'Supprime tous les fichiers `.tmp` sous `logs/`, y compris `cache 1.tmp`, dont le nom contient une espace.',
			accept: [
				"find logs -name '*.tmp' -print0 | xargs -0 rm",
				'find logs -name "*.tmp" -print0 | xargs -0 rm',
				'find logs -name \\*.tmp -print0 | xargs -0 rm',
				"find logs -name '*.tmp' -print0 | xargs --null rm",
				"find logs -name '*.tmp' -print0 | xargs -0 rm -f",
				"find logs/ -name '*.tmp' -print0 | xargs -0 rm",
				"find logs -type f -name '*.tmp' -print0 | xargs -0 rm",
				"find logs -name '*.tmp' -type f -print0 | xargs -0 rm"
			],
			why: '`-print0` termine chaque nom par un caractère nul et `-0` fait couper `xargs` sur ce seul caractère : `logs/cache 1.tmp` reste un seul élément. Avec un simple `| xargs rm`, `rm` reçoit `logs/cache` et `1.tmp` et ne trouve ni l’un ni l’autre.'
		},
		{
			prompt: 'Compresse avec gzip les fichiers `.log` placés directement dans `logs/` qui contiennent `FATAL`. Si aucun ne correspond, ne lance pas `gzip` du tout.',
			accept: [
				'grep -l FATAL logs/*.log | xargs -r gzip',
				"grep -l 'FATAL' logs/*.log | xargs -r gzip",
				'grep -l "FATAL" logs/*.log | xargs -r gzip',
				'grep -l FATAL logs/*.log | xargs --no-run-if-empty gzip',
				'grep -l FATAL logs/*.log|xargs -r gzip'
			],
			why: '`grep -l` affiche `logs/api.log` et `xargs` lance `gzip logs/api.log`. `-r` saute l’appel quand l’entrée est vide ; sans cette option, `xargs` de GNU lance `gzip` une fois sans aucun nom de fichier.'
		},
		{
			prompt: 'Compresse avec gzip tous les fichiers `.log` sous `logs/`, un fichier par appel à `gzip` et 4 appels à la fois. Certains noms contiennent une espace.',
			accept: [
				"find logs -name '*.log' -print0 | xargs -0 -P 4 -n 1 gzip",
				"find logs -name '*.log' -print0 | xargs -0 -n 1 -P 4 gzip",
				"find logs -name '*.log' -print0 | xargs -0 -P4 -n1 gzip",
				"find logs -name '*.log' -print0 | xargs -0 -n1 -P4 gzip",
				"find logs -name '*.log' -print0 | xargs -P 4 -n 1 -0 gzip",
				"find logs -name '*.log' -print0 | xargs -n 1 -P 4 -0 gzip",
				'find logs -name "*.log" -print0 | xargs -0 -P 4 -n 1 gzip',
				"find logs -name '*.log' -print0 | xargs --null --max-procs=4 --max-args=1 gzip"
			],
			why: '`-P 4` laisse `xargs` lancer jusqu’à 4 processus `gzip` en même temps. `-n 1` donne un fichier à chaque processus ; sans `-n`, les 3 noms tiennent sur une seule ligne de commande et un seul `gzip` tourne.'
		}
	],
	quiz: [],
	recall: {
		q: 'Pourquoi `find logs -name \'*.tmp\' | xargs rm` échoue-t-il sur `logs/cache 1.tmp`, et quelles 2 options corrigent le problème ?',
		a: '`xargs` coupe les éléments sur les blancs, donc `rm` reçoit `logs/cache` et `1.tmp`. `find -print0` avec `xargs -0` sépare les noms par un caractère nul à la place.'
	},
	sources: [
		{ title: 'xargs(1)', url: 'https://man7.org/linux/man-pages/man1/xargs.1.html' },
		{ title: 'find(1) : -print0', url: 'https://man7.org/linux/man-pages/man1/find.1.html' }
	]
};
