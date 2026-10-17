/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pipes',
	part: 'Le shell',
	title: 'Pipes et redirections',
	minutes: 10,
	hook: [
		'Le job de CI a échoué et le ticket demande la sortie du build. Tu lances `./build.sh` sur ta machine et 5 lignes défilent. Tu les veux dans un fichier, filtrées, ou les deux, mais la ligne d’erreur s’affiche toujours à l’écran au lieu d’aller dans le fichier.',
		'Les exercices se passent dans un seul dossier. `./build.sh` écrit 4 lignes sur la sortie standard : `step 1/3: compile api`, `step 2/3: compile web`, `warning: web/legacy.js is not used`, `step 3/3: package`. Il écrit 1 ligne sur la sortie d’erreur : `error: API_KEY is not set`. `hosts.txt` contient 3 noms d’hôtes, un par ligne, et la variable `$BRANCH` vaut `feature/login`.'
	],
	terms: [
		{ term: 'descripteur de fichier', def: 'Le numéro que le shell donne à chaque flux ouvert d’une commande : 0 pour l’entrée standard, 1 pour la sortie standard, 2 pour la sortie d’erreur.' },
		{ term: 'sortie d’erreur', def: 'Le descripteur 2, où `./build.sh` écrit sa ligne `error:`. `>` et `|` la laissent sur le terminal tant que tu ne la déplaces pas.' },
		{ term: 'pipe', def: 'L’opérateur `|` : il branche la sortie standard de la commande de gauche sur l’entrée standard de la commande de droite.' },
		{ term: 'here string', def: 'L’opérateur `<<<` : le shell passe un mot, suivi d’un retour à la ligne, sur l’entrée standard de la commande.' }
	],
	reps: [
		{
			prompt: 'Lance `./build.sh` et enregistre sa sortie standard dans `build.log`, en remplaçant le contenu du fichier.',
			accept: ['./build.sh > build.log', './build.sh >build.log', './build.sh 1> build.log', './build.sh 1>build.log'],
			why: '`>` ouvre `build.log` sur le descripteur 1 et le vide d’abord. La ligne `error:` s’affiche quand même sur ton terminal : seul le descripteur 1 a changé de cible.'
		},
		{
			prompt: 'Relance `./build.sh` et ajoute sa sortie standard à la fin de `build.log`, sans effacer les anciennes lignes.',
			accept: ['./build.sh >> build.log', './build.sh >>build.log', './build.sh 1>> build.log', './build.sh 1>>build.log'],
			why: '`>>` ouvre `build.log` en ajout : les 4 nouvelles lignes arrivent après les anciennes. Si le fichier n’existe pas, bash le crée.'
		},
		{
			prompt: 'Enregistre seulement les messages d’erreur de `./build.sh` dans `errors.log`. La sortie normale reste à l’écran.',
			accept: ['./build.sh 2> errors.log', './build.sh 2>errors.log'],
			why: 'Le `2` devant `>` désigne le descripteur 2, la sortie d’erreur. `errors.log` reçoit la ligne `error: API_KEY is not set` et les 4 lignes d’étapes restent sur le terminal.'
		},
		{
			prompt: 'Lance `./build.sh` et jette ses messages d’erreur. Garde la sortie normale à l’écran.',
			accept: ['./build.sh 2>/dev/null', './build.sh 2> /dev/null'],
			why: '`2>` envoie le descripteur 2 vers `/dev/null`, un fichier spécial qui jette tout ce qu’on y écrit. Tu ne vois plus que les 4 lignes de la sortie standard.'
		},
		{
			prompt: 'Enregistre à la fois la sortie standard et les messages d’erreur de `./build.sh` dans `build.log`.',
			accept: [
				'./build.sh > build.log 2>&1',
				'./build.sh >build.log 2>&1',
				'./build.sh 1> build.log 2>&1',
				'./build.sh 1>build.log 2>&1',
				'./build.sh &> build.log',
				'./build.sh &>build.log',
				'./build.sh >& build.log',
				'./build.sh >&build.log'
			],
			why: '`> build.log` dirige le descripteur 1 vers le fichier, puis `2>&1` dirige le descripteur 2 là où pointe le 1 à ce moment. Bash lit les redirections de gauche à droite : avec `2>&1 > build.log`, l’erreur resterait sur le terminal. Le manuel de bash préfère la forme courte `&>`.'
		},
		{
			prompt: 'Affiche seulement les lignes de la sortie standard de `./build.sh` qui contiennent `warning`.',
			accept: ['./build.sh | grep warning', './build.sh|grep warning', "./build.sh | grep 'warning'", './build.sh | grep "warning"'],
			why: '`|` branche la sortie standard de `./build.sh` sur l’entrée standard de `grep`, qui garde la seule ligne qui correspond. La ligne `error:` ne passe pas par le pipe et s’affiche toujours sur le terminal.'
		},
		{
			prompt: 'Fais passer les deux flux de `./build.sh` dans le pipe et garde seulement les lignes qui contiennent `error`.',
			accept: [
				'./build.sh 2>&1 | grep error',
				"./build.sh 2>&1 | grep 'error'",
				'./build.sh 2>&1 | grep "error"',
				'./build.sh |& grep error',
				"./build.sh |& grep 'error'",
				'./build.sh |& grep "error"'
			],
			why: '`2>&1` dirige la sortie d’erreur vers le pipe : `grep` lit les 5 lignes et affiche `error: API_KEY is not set`. En bash, `|&` est un raccourci pour `2>&1 |`.'
		},
		{
			prompt: 'Regarde la sortie standard de `./build.sh` à l’écran et garde en même temps une copie dans `build.log`.',
			accept: ['./build.sh | tee build.log'],
			why: '`tee` recopie son entrée standard dans chaque fichier donné et aussi sur sa sortie standard. Tu vois les 4 lignes et `build.log` contient les mêmes 4.'
		},
		{
			prompt: 'Même chose, mais ajoute à la fin de `build.log` au lieu de le remplacer.',
			accept: ['./build.sh | tee -a build.log', './build.sh | tee --append build.log'],
			why: 'Avec `-a`, `tee` ajoute à la fin du fichier. Sans cette option, `tee` écrase `build.log`, comme `>`.'
		},
		{
			prompt: '`wc -l hosts.txt` affiche `3 hosts.txt`. Affiche seulement `3` en donnant le fichier à `wc -l` sur son entrée standard avec `<`.',
			accept: ['wc -l < hosts.txt', 'wc -l <hosts.txt', '< hosts.txt wc -l', '<hosts.txt wc -l'],
			why: '`<` ouvre `hosts.txt` sur le descripteur 0. `wc` lit alors un flux sans nom et n’affiche que le nombre.'
		},
		{
			prompt: '`$BRANCH` vaut `feature/login`. Affiche `feature-login` en passant la variable à `tr / -` avec une here string.',
			accept: [
				'tr / - <<< "$BRANCH"',
				'tr / - <<<"$BRANCH"',
				'tr / - <<< $BRANCH',
				"tr '/' '-' <<< \"$BRANCH\"",
				"tr '/' '-' <<< $BRANCH",
				'tr "/" "-" <<< "$BRANCH"',
				'tr "/" "-" <<< $BRANCH'
			],
			why: '`<<<` développe `$BRANCH` et envoie `feature/login` suivi d’un retour à la ligne sur l’entrée standard. `tr / -` remplace chaque `/` par `-`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Pourquoi `./build.sh 2>&1 > build.log` affiche-t-il encore la ligne d’erreur sur ton terminal ?',
		a: 'Bash applique les redirections de gauche à droite. `2>&1` copie le descripteur 1 pendant qu’il pointe encore sur le terminal, et c’est seulement après que `> build.log` envoie le descripteur 1 vers le fichier.'
	},
	sources: [
		{ title: 'bash(1) : Pipelines et REDIRECTION', url: 'https://man7.org/linux/man-pages/man1/bash.1.html' },
		{ title: 'tee(1)', url: 'https://man7.org/linux/man-pages/man1/tee.1.html' },
		{ title: 'null(4) : /dev/null', url: 'https://man7.org/linux/man-pages/man4/null.4.html' }
	]
};
