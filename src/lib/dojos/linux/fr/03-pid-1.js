const TINI = 'https://github.com/krallin/tini/blob/369448a167e8b3da4ca5bca0b3307500c3371828/src/tini.c';
const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pid-1',
	part: 'Les processus',
	title: 'Le PID 1 dans un conteneur',
	minutes: 10,
	hook: [
		'Une image de worker se termine par `CMD ["python", "worker.py"]`, et le worker n’enregistre aucun handler pour SIGTERM. Sur une VM, `kill -TERM` l’arrête tout de suite. Dans le conteneur, `docker stop` attend les 10 secondes complètes à chaque fois, puis Docker envoie SIGKILL.',
		'Dans le conteneur, `python` est le PID 1 de son propre namespace PID. D’après pid_namespaces(7), les autres processus ne peuvent envoyer un signal à ce PID 1 « only if the "init" process has established a handler for that signal ». Python n’a pas de handler pour SIGTERM, donc **le noyau jette le SIGTERM**. Seule exception : SIGKILL envoyé depuis l’extérieur du namespace, qui est « forcibly delivered ».',
		'Le PID 1 a un deuxième rôle : les processus orphelins du namespace lui sont rattachés, et seuls ses appels à `wait()` font disparaître leurs zombies. `docker run --init` démarre tini comme PID 1, et tini lance ton programme comme enfant.'
	],
	terms: [
		{ term: 'Namespace PID', def: 'Une numérotation séparée des processus. Le premier processus créé dedans reçoit le PID 1, et les processus de l’intérieur ne voient pas ceux du namespace parent.' },
		{ term: 'Processus init', def: 'Le PID 1 d’un namespace PID. Il adopte les processus orphelins, et quand il sort, le noyau tue tous les processus du namespace avec SIGKILL.' },
		{ term: 'Zombie', def: 'Un processus terminé dont aucun parent n’a encore lu le code de sortie. Il garde son PID et une place dans la table des processus du noyau.' },
		{ term: 'Reaping', def: 'Appeler `wait()` ou `waitpid()` sur un zombie : le parent lit le code de sortie et le noyau libère le PID.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['run["docker run worker"] --> py["python worker.py, PID 1 dans un nouveau namespace PID"]'],
				highlight: ['run', 'py'],
				note: 'Le premier processus créé dans un nouveau namespace PID reçoit le PID 1. Dans `kernel/fork.c`, quand le nouveau processus est le child reaper du namespace, le noyau ajoute `SIGNAL_UNKILLABLE` à ses drapeaux de signaux (lignes 2558 à 2561 en v6.12).'
			},
			{
				add: ['stop["docker stop : SIGTERM"] --> chk{"Le PID 1 a un handler SIGTERM ?"}', 'chk -->|"non : disposition SIG_DFL"| drop["Le noyau jette le signal"]'],
				highlight: ['stop', 'chk', 'drop'],
				note: 'À l’envoi, `sig_task_ignored()` dans `kernel/signal.c` renvoie vrai si la cible porte `SIGNAL_UNKILLABLE` et que son handler vaut `SIG_DFL`. Le signal est jeté avant même d’être mis en file. Python n’intercepte que SIGINT et ignore SIGPIPE : pour SIGTERM, la disposition reste `SIG_DFL`, et le signal disparaît.'
			},
			{
				add: ['drop -->|"10 s plus tard : SIGKILL depuis l’hôte"| dead["Le PID 1 meurt, le noyau tue tous les processus du namespace"]'],
				highlight: ['dead'],
				note: 'SIGKILL venu d’un namespace ancêtre passe de force. pid_namespaces(7) : « If the "init" process of a PID namespace terminates, the kernel terminates all of the processes in the namespace via a SIGKILL signal. » Aucun processus du conteneur n’a l’occasion de faire son ménage.'
			},
			{
				add: ['tini["docker run --init : tini est le PID 1"] -->|"sigtimedwait, puis kill de l’enfant avec SIGTERM"| py2["python, désormais enfant de tini"]', 'py2 --> code["Action par défaut : python se termine, tini sort avec 128 + 15 = 143"]'],
				highlight: ['tini', 'py2', 'code'],
				note: 'tini bloque les signaux et les attend avec `sigtimedwait()`. `sig_ignored()` ne jette jamais un signal bloqué, donc SIGTERM arrive jusqu’à tini, qui le transmet avec `kill()`. Python n’est plus le PID 1 : l’action par défaut s’applique et il se termine. tini sort ensuite avec 128 plus le numéro du signal.'
			},
			{
				add: ['orph["Un petit-enfant orphelin se termine : zombie rattaché au PID 1"] --> reap["tini : waitpid -1, WNOHANG, en boucle"]'],
				highlight: ['orph', 'reap'],
				note: 'Quand un parent meurt avant son enfant, l’enfant est rattaché à l’init du namespace. À sa sortie, il reste zombie jusqu’à ce que le PID 1 appelle `wait()`. wait(2) prévient que chaque zombie « will consume a slot in the kernel process table ». tini appelle `waitpid(-1, ..., WNOHANG)` jusqu’à ce qu’il ne reste plus de zombie.'
			}
		]
	},
	example: {
		title: 'src/tini.c : attendre un signal, le transmettre, puis ramasser les zombies',
		repo: 'krallin/tini',
		url: `${TINI}#L508-L688`,
		lang: 'c',
		code: `int wait_and_forward_signal(sigset_t const* const parent_sigset_ptr, pid_t const child_pid) {
	siginfo_t sig;

	if (sigtimedwait(parent_sigset_ptr, &sig, &ts) == -1) {
		switch (errno) {
			case EAGAIN:
				break;
			case EINTR:
				break;
			default:
				PRINT_FATAL("Unexpected error in sigtimedwait: '%s'", strerror(errno));
				return 1;
		}
	} else {
		/* There is a signal to handle here */
		switch (sig.si_signo) {
			case SIGCHLD:
				/* Special-cased, as we don't forward SIGCHLD. Instead, we'll
				 * fallthrough to reaping processes.
				 */
				PRINT_DEBUG("Received SIGCHLD");
				break;
			default:
				PRINT_DEBUG("Passing signal: '%s'", strsignal(sig.si_signo));
				/* Forward anything else */
				if (kill(kill_process_group ? -child_pid : child_pid, sig.si_signo)) {
					if (errno == ESRCH) {
						PRINT_WARNING("Child was dead when forwarding signal");
					} else {
						PRINT_FATAL("Unexpected error when forwarding signal: '%s'", strerror(errno));
						return 1;
					}
				}
				break;
		}
	}

	return 0;
}
…
	while (1) {
		/* Wait for one signal, and forward it */
		if (wait_and_forward_signal(&parent_sigset, child_pid)) {
			return 1;
		}

		/* Now, reap zombies */
		if (reap_zombies(child_pid, &child_exitcode)) {
			return 1;
		}

		if (child_exitcode != -1) {
			PRINT_TRACE("Exiting: child has exited");
			return child_exitcode;
		}
	}
}`,
		notes: [
			'La ligne 4 attend un signal de `parent_sigset`, l’ensemble que tini a bloqué au démarrage avec `sigprocmask()`. tini n’installe aucun handler pour SIGTERM. Le noyau le livre quand même, car [`sig_ignored()`](' + LINUX + '/kernel/signal.c#L104-L123) renvoie faux pour tout signal présent dans `blocked` ou `real_blocked`.',
			'`ts` vaut une seconde : sans signal, `sigtimedwait()` renvoie `EAGAIN` (ligne 6) au moins une fois par seconde. La boucle passe alors quand même au ramassage des zombies.',
			'La ligne 26 transmet chaque signal sauf SIGCHLD avec `kill()`. Par défaut, il part vers le seul PID de l’enfant. Avec `tini -g`, `kill_process_group` est activé et le signal part vers tout le groupe de processus de l’enfant : les enfants d’un script shell le reçoivent aussi.',
			'La ligne 48 appelle `reap_zombies()`, qui boucle sur `waitpid(-1, &current_status, WNOHANG)` : `-1` veut dire n’importe quel enfant, `WNOHANG` veut dire rendre la main tout de suite si aucun n’est sorti. Quand le PID ramassé est l’enfant principal, la fonction note son code de sortie, `128 + WTERMSIG` si un signal l’a tué.',
			'Les lignes 52 à 54 font sortir tini dès que l’enfant principal a disparu, avec le code de l’enfant. Capturé pendant cette session : `docker-init -s -- sleep 30` (tini 0.19.0), après `kill -TERM`, a transmis le signal à `sleep` et est sorti avec 143.'
		]
	},
	tradeoff: {
		gain: [
			'SIGTERM atteint un programme qui n’a jamais enregistré de handler, et l’action par défaut le termine avant le SIGKILL de Docker.',
			'Les zombies rattachés au PID 1 sont ramassés par la boucle `waitpid()` de tini, et ne s’accumulent pas dans la table des processus.'
		],
		cost: [
			'Par défaut, tini envoie chaque signal au PID de son enfant direct. Les tâches de fond d’un script shell ne reçoivent pas SIGTERM, sauf si tu lances tini avec `-g`.',
			'Un processus de plus dans chaque conteneur, et le code de sortie que tu vois est celui de tini : 143 quand SIGTERM a terminé l’enfant, pas le code que ton programme aurait choisi.'
		]
	},
	task: {
		prompt: 'Dans un conteneur, `grep -E "Name|SigCgt" /proc/1/status` affiche `Name: python3` et `SigCgt: 0000000000000002`. Prévois ce que fait `docker stop`. Dis ensuite ce qui change avec `docker run --init`.',
		hint: 'Le bit n-1 du masque représente le signal n. Quel signal correspond au bit 1 ? SIGTERM (15) est-il dans le masque ?',
		answer: [
			'0x2, c’est le bit 1, donc le signal 2 : SIGINT. Capturé pendant cette session, un simple processus `python3` affiche exactement `SigCgt: 0000000000000002` : Python intercepte SIGINT pour lever `KeyboardInterrupt`, et rien d’autre.',
			'SIGTERM n’est pas intercepté, sa disposition vaut `SIG_DFL`. Le PID 1 du namespace est `SIGNAL_UNKILLABLE`, et le noyau jette le SIGTERM. `docker stop` attend 10 secondes et envoie SIGKILL.',
			'Avec `--init`, le PID 1 est `docker-init`, c’est-à-dire tini. Il récupère SIGTERM avec `sigtimedwait()` et le transmet à python, qui n’est plus le PID 1 : l’action par défaut le termine tout de suite.',
			'Le conteneur sort alors avec le code 143, soit 128 plus 15, la valeur que tini calcule dans `reap_zombies()`.'
		]
	},
	quiz: [
		{
			q: 'Le PID 1 d’un conteneur n’a pas de handler SIGTERM. `docker exec app kill -TERM 1` tourne en root, et le processus continue. Pourquoi ?',
			options: [
				'Le noyau ne livre à l’init d’un namespace que les signaux pour lesquels il a un handler',
				'`docker exec` tourne dans le namespace PID de l’hôte, où le PID 1 est le systemd de l’hôte',
				'Root dans un conteneur n’a pas la capability nécessaire pour signaler un autre processus',
				'SIGTERM reste en file jusqu’à ce que le programme relise son entrée standard'
			],
			answer: 0,
			why: 'pid_namespaces(7) : seuls les signaux pour lesquels l’init « has established a signal handler » peuvent lui être envoyés par les autres membres du namespace, et la règle « applies even to privileged processes ». Dans le noyau, `sig_task_ignored()` jette le signal si la cible est `SIGNAL_UNKILLABLE` et que son handler vaut `SIG_DFL`.'
		},
		{
			q: 'Le PID 1 d’un conteneur sort alors que 12 autres processus tournent encore dedans. Que leur arrive-t-il ?',
			options: [
				'Ils sont rattachés au PID 1 de l’hôte et continuent de tourner',
				'Le noyau envoie SIGKILL à chacun d’eux',
				'Ils tournent jusqu’à ce que quelqu’un lance `docker rm` sur le conteneur',
				'Ils reçoivent chacun SIGHUP et peuvent choisir de continuer'
			],
			answer: 1,
			why: 'pid_namespaces(7) : « If the "init" process of a PID namespace terminates, the kernel terminates all of the processes in the namespace via a SIGKILL signal. » Ensuite, un `fork()` dans ce namespace échoue avec `ENOMEM`.'
		},
		{
			q: '`ps` dans un conteneur montre 200 processus à l’état `Z` avec PPID 1. Qu’est-ce qui les fait disparaître ?',
			options: [
				'Envoyer SIGKILL à chaque PID zombie depuis l’hôte',
				'Monter la limite `pids.max` du conteneur pour que les nouveaux processus tiennent',
				'Envoyer SIGCONT au PID 1 pour qu’il relance ses enfants',
				'Un PID 1 qui appelle `waitpid()`, comme tini lancé par `--init`'
			],
			answer: 3,
			why: 'Un zombie est déjà terminé : un signal ne lui fait rien. wait(2) : il reste « as long as a zombie is not removed from the system via a wait ». Seul son parent, ici le PID 1, peut faire ce wait, et tini appelle `waitpid(-1, ..., WNOHANG)` en boucle.'
		}
	],
	recall: {
		q: 'Pourquoi le PID 1 d’un conteneur ignore-t-il SIGTERM quand il n’a pas de handler, et comment tini fait-il passer le signal ?',
		a: 'Le noyau marque l’init d’un namespace `SIGNAL_UNKILLABLE` et jette les signaux dont la disposition vaut `SIG_DFL`. tini bloque les signaux, les récupère avec `sigtimedwait()` et les transmet avec `kill()` à ton programme, qui n’est pas le PID 1 et subit l’action par défaut.'
	},
	sources: [
		{ title: 'pid_namespaces(7), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man7/pid_namespaces.7.html' },
		{ title: 'wait(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/wait.2.html' },
		{ title: 'Linux v6.12, kernel/signal.c, sig_task_ignored et sig_ignored', url: LINUX + '/kernel/signal.c#L82-L123' },
		{ title: 'Linux v6.12, kernel/fork.c, SIGNAL_UNKILLABLE pour le child reaper', url: LINUX + '/kernel/fork.c#L2558-L2561' },
		{ title: 'README de tini', url: 'https://github.com/krallin/tini/blob/369448a167e8b3da4ca5bca0b3307500c3371828/README.md' },
		{ title: 'Doc Docker, docker container run, Specify an init process', url: 'https://docs.docker.com/reference/cli/docker/container/run/#init' },
		{ title: 'Doc Python, module signal, General rules', url: 'https://docs.python.org/3/library/signal.html' }
	]
};
