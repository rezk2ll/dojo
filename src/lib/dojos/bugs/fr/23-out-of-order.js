const GIT = 'https://github.com/git/git';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'out-of-order',
	part: 'L’état et le temps',
	title: 'Deux handlers de signal posés dans le mauvais ordre',
	minutes: 10,
	hook: [
		'Pendant un `git push`, le serveur lance le hook `pre-receive` et écrit la liste des refs mises à jour sur son stdin. Les tests de git ont un hook qui se termine sans lire cette entrée (test t5401.13, "pre-receive hook that forgets to read its input"). Après le passage du code des hooks à `run_processes_parallel()`, ce test **s’est mis à échouer sur la plateforme NonStop**.',
		'Écrire dans un pipe dont le lecteur est parti lève `SIGPIPE`. Ici, git veut l’ignorer et pose `SIG_IGN` pour ce signal. L’extrait montre deux fonctions qui posent un handler pour `SIGPIPE`, et l’ordre dans lequel elles s’exécutent.'
	],
	terms: [
		{ term: 'SIGPIPE', def: 'Le signal qu’un processus reçoit quand il écrit dans un pipe que plus personne ne lit. Par défaut, il tue le processus.' },
		{ term: 'sigchain', def: 'La pile de handlers de signal de git. `sigchain_push` pose un handler au sommet, `sigchain_pop` retire celui du sommet. Quand un signal arrive, c’est le handler du sommet qui s’exécute.' },
		{ term: '`sigchain_push_common`', def: 'Pose le même handler pour SIGINT, SIGHUP, SIGTERM, SIGQUIT et SIGPIPE.' }
	],
	bug: {
		title: 'run_processes_parallel(): fix order of sigpipe handling',
		repo: 'git/git',
		url: `${GIT}/blob/26c27dd3db0e1386fe541ebd7aae001c722e5c10/run-command.c#L1548-L1937`,
		fix: `${GIT}/commit/2226ffaacd93d3fe5554687a70d9190d72596f96`,
		lang: 'c',
		code: `static void handle_children_on_signal(int signo)
{
\tkill_children_signal(pp_for_signal, signo);
\tsigchain_pop(signo);
\traise(signo);
}

static void pp_init(struct parallel_processes *pp,
\t\t    const struct run_process_parallel_opts *opts,
\t\t    struct parallel_processes_for_signal *pp_sig)
{
\tconst size_t n = opts->processes;
…
\tpp_sig->pp = pp;
\tpp_sig->opts = opts;
\tpp_for_signal = pp_sig;
\tsigchain_push_common(handle_children_on_signal);
}
…
void run_processes_parallel(const struct run_process_parallel_opts *opts)
{
…
\t/*
\t * Child tasks might receive input via stdin, terminating early (or not), so
\t * ignore the default SIGPIPE which gets handled by each feed_pipe_fn which
\t * actually writes the data to children stdin fds.
\t */
\tsigchain_push(SIGPIPE, SIG_IGN);

\tpp_init(&pp, opts, &pp_sig);
\twhile (1) {
…
\t}

\tpp_cleanup(&pp, opts);

\tsigchain_pop(SIGPIPE);
…
}`,
		lines: [30, 35],
		diff: `+\tpp_init(&pp, opts, &pp_sig);
+
 \t/*
 …
 \tsigchain_push(SIGPIPE, SIG_IGN);

-\tpp_init(&pp, opts, &pp_sig);
 \twhile (1) {
 …
-\tpp_cleanup(&pp, opts);
-
 \tsigchain_pop(SIGPIPE);

+\tpp_cleanup(&pp, opts);
+`,
		notes: [
			'**Le dernier posé gagne.** `sigchain_push(SIGPIPE, SIG_IGN)` s’exécute d’abord. Ensuite `pp_init` appelle `sigchain_push_common`, qui pose `handle_children_on_signal` par-dessus. Quand SIGPIPE arrive, c’est le handler du sommet qui s’exécute, pas `SIG_IGN`.',
			'**Ce qui se passe sur SIGPIPE.** Le hook se termine sans lire. git écrit sur son stdin et reçoit SIGPIPE. `handle_children_on_signal` appelle `kill()` sur les enfants, se retire de la pile et appelle `raise()`. Le signal relancé tombe alors sur `SIG_IGN` et il est ignoré : git survit, mais il vient d’essayer de tuer le hook. Le commit : "a hook that exits without reading all of its input will cause us to get SIGPIPE, which will put us in a signal handler that then tries to kill() that same child."',
			'**Pourquoi seul NonStop échouait.** Sous Linux, l’enfant est déjà terminé, et le `kill()` "does not affect the exit status of the process" (ne change pas son code de sortie). Le commit dit que ça "seems not to be true on all platforms", et t5401.13 échouait sur NonStop. Avec plusieurs enfants, une seule sortie précoce ferait que git va "kill() all of the children (which might still actually be running)". L’API des hooks ne lance pas encore de hooks en parallèle, donc aucun test ne couvre ce cas.',
			'**Le correctif.** Appeler `pp_init()` d’abord, puis poser `SIG_IGN`, pour que `SIG_IGN` soit au sommet pendant que git alimente les enfants. À la fin, `sigchain_pop(SIGPIPE)` passe maintenant avant `pp_cleanup()`, donc chaque retrait enlève le handler posé en dernier. Le commit attribue le signalement à Randall S. Becker.'
		]
	},
	quiz: [
		{
			q: 'Dans le code bogué, SIGPIPE arrive pendant que git écrit vers un hook. Quel handler s’exécute en premier ?',
			options: [
				'`SIG_IGN`, parce qu’il a été posé exprès pour SIGPIPE',
				'`handle_children_on_signal`, parce qu’il a été posé en dernier',
				'L’action par défaut, qui termine le processus git',
				'Les deux à la fois, dans l’ordre où ils ont été posés'
			],
			answer: 1,
			why: 'La sigchain est une pile. `pp_init` pose son handler après `SIG_IGN`, donc il est au sommet et passe en premier.'
		},
		{
			q: 'Pourquoi le test passait-il sous Linux malgré le bug ?',
			options: [
				'Linux n’envoie jamais SIGPIPE à un processus qui écrit dans un pipe',
				'Le hook était déjà terminé, donc le `kill()` ne changeait rien',
				'Linux exécute les handlers depuis le bas de la pile',
				'Ce test est sauté quand il tourne sous Linux'
			],
			answer: 1,
			why: 'Le hook était parti, seulement pas encore récupéré par `wait()`. Le tuer ne changeait pas son code de sortie sous Linux.'
		},
		{
			q: 'Deux étapes d’initialisation posent chacune un handler pour le même signal. Qu’est-ce qui décide lequel le traite ?',
			options: [
				'Le handler dont la liste de signaux est la plus précise',
				'L’ordre des poses : le dernier posé est au sommet',
				'Le handler enregistré par la fonction appelante',
				'L’ordre dans lequel les handlers sont écrits dans le fichier'
			],
			answer: 1,
			why: 'Avec une pile de handlers, seul l’ordre des poses compte. Ici, il fallait appeler `pp_init()` avant de poser `SIG_IGN`.'
		}
	],
	takeaway: 'Quand une fonction que tu appelles installe son propre handler pour un signal, ta surcharge doit venir après cet appel, et tes retraits doivent défaire les poses dans l’ordre inverse. Regarde ce que pose chaque appel d’initialisation avant de placer le tien.',
	sources: [
		{ title: 'git, commit 2226ffaac', url: `${GIT}/commit/2226ffaacd93d3fe5554687a70d9190d72596f96` }
	]
};
