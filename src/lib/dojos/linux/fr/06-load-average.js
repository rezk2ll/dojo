const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const LOADAVG_C = `${LINUX}/kernel/sched/loadavg.c`;
const LOADAVG_H = `${LINUX}/include/linux/sched/loadavg.h`;
const PROC_LOADAVG = `${LINUX}/fs/proc/loadavg.c`;
const GREGG = 'https://www.brendangregg.com/blog/2017-08-08/linux-load-averages.html';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'load-average',
	part: 'Les processus',
	title: 'La charge moyenne et l’ordonnanceur',
	minutes: 10,
	hook: [
		'Brendan Gregg lance `tar` sur une machine de 8 CPU au repos, pour archiver des fichiers absents de la mémoire. `pidstat` montre `tar` à 32,62 % d’un CPU. `uptime` affiche `load average: 1.19, 1.17, 1.06`.',
		'Un seul processus occupe un tiers d’un CPU, et la charge vaut 1,19. **Sous Linux, la charge compte aussi les tâches qui attendent le disque.** Gregg décompose ce 1,19 : 0,33 pour `tar` sur le CPU, 0,67 pour `tar` en attente de lectures disque, 0,11 pour les threads noyau qui vident les écritures, 0,04 pour les autres processus.',
		'Il a aussi géré un serveur mail à deux CPU, chargé entre 11 et 16 toute la journée. La latence restait correcte et personne ne se plaignait. Il précise que la plupart des systèmes souffrent dès une charge de 2 par CPU.'
	],
	terms: [
		{ term: 'Charge moyenne (load average)', def: 'Trois nombres dans `/proc/loadavg`, aussi affichés par `uptime` et `top` : une moyenne amortie des tâches exécutables ou en sommeil non interruptible, avec des constantes de 1, 5 et 15 minutes.' },
		{ term: 'Exécutable (R)', def: 'Une tâche qui tourne sur un CPU ou qui attend son tour dans la file d’un CPU. `ps` l’affiche `R`.' },
		{ term: 'Sommeil non interruptible (D)', def: 'Une tâche bloquée dans le noyau qu’aucun signal ne peut réveiller, le plus souvent en attente d’une I/O disque. `ps` l’affiche `D`, « uninterruptible sleep (usually I/O) ».' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['r["Tâche en R : sur un CPU ou dans sa file"] --> rq["Compteurs par CPU : nr_running et nr_uninterruptible"]', 'd["Tâche en D : attend une lecture disque"] --> rq'],
				highlight: ['r', 'd', 'rq'],
				note: 'Chaque file d’exécution de CPU tient deux compteurs. `nr_running` compte les tâches R de ce CPU. `nr_uninterruptible` compte les tâches passées en état D sur ce CPU. Une tâche endormie en état S, comme un serveur web bloqué dans `accept()`, n’entre dans aucun des deux.'
			},
			{
				add: ['rq -->|"toutes les 5 s, à un tick"| fold["calc_global_load_tick : ajoute la variation de ce CPU à calc_load_tasks"]'],
				highlight: ['fold'],
				note: '`LOAD_FREQ` vaut `5*HZ+1`, un peu plus de 5 secondes. Quand un CPU passe ce cap, `calc_global_load_tick()` calcule son `nr_running + nr_uninterruptible` et ajoute l’écart depuis la dernière fois à un compteur global, `calc_load_tasks`. Aucun CPU n’a besoin de lire les autres.'
			},
			{
				add: ['fold -->|"10 ticks plus tard"| calc["calc_global_load : un échantillon des tâches actives"]'],
				highlight: ['calc'],
				note: '`calc_global_load()` attend 10 ticks après le cap des 5 secondes, le temps que chaque CPU ait versé son compte. Elle lit ensuite `calc_load_tasks` : le nombre de tâches R et D sur toute la machine à cet instant. Avec un seul `tar` qui lit le disque, l’échantillon vaut 1.'
			},
			{
				add: ['calc --> avg["avenrun[0..2] = ancien x e + échantillon x (1 - e)"]'],
				highlight: ['avg'],
				note: 'Le noyau mélange chaque échantillon dans trois valeurs avec `EXP_1 = 1884`, `EXP_5 = 2014` et `EXP_15 = 2037`, sur 2048. Pour la valeur à 1 minute, chaque échantillon garde 92 % de l’ancienne charge. Un thread qui démarre sur une machine au repos amène la charge à 1 minute vers 0,62 au bout de 60 secondes.'
			},
			{
				add: ['avg --> proc["/proc/loadavg : 3 valeurs, exécutables/total, dernier PID"]'],
				highlight: ['proc'],
				note: 'Lire `/proc/loadavg` affiche les trois valeurs avec deux décimales, puis les tâches exécutables à cet instant sur le total, puis le dernier PID créé. Le serveur chargé de Gregg affichait `25.72 23.19 23.35 42/3411 43603`. `uptime` et `top` montrent les mêmes trois nombres. Le noyau garde un seul tableau `avenrun` pour toute la machine : un conteneur qui lit `/proc/loadavg` voit les chiffres de l’hôte.'
			}
		]
	},
	example: {
		title: 'kernel/sched/loadavg.c (Linux v6.12) : calc_global_load',
		repo: 'torvalds/linux',
		url: `${LOADAVG_C}#L349-L379`,
		lang: 'c',
		code: `void calc_global_load(void)
{
	unsigned long sample_window;
	long active, delta;

	sample_window = READ_ONCE(calc_load_update);
	if (time_before(jiffies, sample_window + 10))
		return;

	/*
	 * Fold the 'old' NO_HZ-delta to include all NO_HZ CPUs.
	 */
	delta = calc_load_nohz_read();
	if (delta)
		atomic_long_add(delta, &calc_load_tasks);

	active = atomic_long_read(&calc_load_tasks);
	active = active > 0 ? active * FIXED_1 : 0;

	avenrun[0] = calc_load(avenrun[0], EXP_1, active);
	avenrun[1] = calc_load(avenrun[1], EXP_5, active);
	avenrun[2] = calc_load(avenrun[2], EXP_15, active);

	WRITE_ONCE(calc_load_update, sample_window + LOAD_FREQ);

	/*
	 * In case we went to NO_HZ for multiple LOAD_FREQ intervals
	 * catch up in bulk.
	 */
	calc_global_nohz();
}`,
		notes: [
			'Les lignes 6 à 8 sortent tout de suite tant que les 10 ticks après l’échantillon ne sont pas passés. Le commentaire en tête du fichier part du principe que « 10 ticks is sufficient time for every CPU » pour avoir ajouté son compte.',
			'La ligne 17 lit le compte global. Chaque CPU le remplit dans [`calc_load_fold_active()`](' + LOADAVG_C + '#L78-L91) avec `nr_running` plus `nr_uninterruptible`. Cette somme explique pourquoi les tâches D font monter la charge sous Linux.',
			'La ligne 18 multiplie le compte par `FIXED_1`, 2048 : 3 tâches sont stockées sous la forme 6144. `FSHIFT` vaut 11 : les 11 bits du bas portent la partie décimale.',
			'Les lignes 20 à 22 mettent à jour les valeurs à 1, 5 et 15 minutes. [`calc_load()`](' + LOADAVG_H + '#L18-L38) calcule `load * exp + active * (FIXED_1 - exp)`, divisé par 2048. Avec `EXP_1 = 1884`, 1884 / 2048 donne 0,92 de l’ancienne valeur gardée toutes les 5 secondes.',
			'La ligne 24 programme l’échantillon suivant `LOAD_FREQ` plus tard. Quand tu lis `/proc/loadavg`, [`loadavg_proc_show()`](' + PROC_LOADAVG + '#L14-L27) formate `avenrun` avec `%lu.%02lu`.'
		]
	},
	tradeoff: {
		gain: [
			'Un seul nombre couvre la demande en CPU, en disque et sur certains verrous du noyau. Le `tar` de Gregg affiche 1,19 là où un compte limité au CPU donnerait 0,37.',
			'Une charge à 1 minute bien plus basse que celle à 15 minutes te dit que le pic est passé avant ta connexion.'
		],
		cost: [
			'Une charge de 6 sur 4 CPU peut venir de 6 threads exécutables, ou d’un seul plus 5 qui attendent le disque. Le nombre seul ne te dit pas lequel des deux.',
			'Sous Linux, tu ne peux pas la diviser par le nombre de CPU, car les tâches D n’utilisent aucun CPU. Gregg la compare plutôt à la valeur habituelle du même serveur.',
			'L’amortissement cache les pics courts : 40 threads exécutables pendant 10 secondes couvrent 2 échantillons et font passer la valeur à 1 minute de 0 à environ 6.'
		]
	},
	task: {
		prompt: 'Une VM de 4 CPU rame. `cat /proc/loadavg` affiche `6.12 5.90 5.31 1/388 20417`. `vmstat 1` montre `r` à 1, `b` à 6, `id` à 50 et `wa` à 45. Les CPU sont-ils le goulot ? Quelle commande liste les tâches derrière la charge ?',
		hint: 'Le quatrième champ et la colonne `r` comptent les tâches exécutables. `b` compte les processus bloqués en attente d’I/O.',
		answer: [
			'Une seule tâche est exécutable à cet instant (`1/388` et `r` = 1), et les CPU sont au repos 50 % du temps. Ajouter des CPU n’accélérerait pas cette VM.',
			'La charge d’environ 6 vient surtout de tâches D : `vmstat` montre 6 processus bloqués sur des I/O, et les CPU passent 45 % de leur temps à attendre des I/O.',
			'`ps -eo stat,pid,comm | grep ^D` liste les tâches en sommeil non interruptible. Regarde ensuite le disque avec `iostat -x 1` (chapitre 22).',
			'Sur ta machine, lance `cat /proc/loadavg; nproc; vmstat 1 5` et répartis la charge de la même façon entre `r` et `b`.'
		]
	},
	quiz: [
		{
			q: 'Que compte la charge moyenne sous Linux ?',
			options: [
				'Les tâches sur un CPU ou en attente d’un CPU, plus celles en sommeil non interruptible',
				'Le pourcentage de temps où les CPU étaient occupés, moyenné sur 1, 5 et 15 minutes',
				'Les tâches sur un CPU ou en attente d’un CPU, et rien d’autre',
				'Toutes les tâches qui existent, y compris celles qui dorment sur une socket'
			],
			answer: 0,
			why: 'Chaque CPU ajoute `nr_running + nr_uninterruptible` à `calc_load_tasks` toutes les 5 secondes, et le noyau fait la moyenne de ce compte. Les tâches en état S, comme un serveur bloqué dans `accept()`, ne comptent pas.'
		},
		{
			q: 'Une machine au repos lance un thread qui boucle sans fin. Que vaut la charge à 1 minute 60 secondes plus tard ?',
			options: ['Exactement 1,00', 'Environ 0,62', 'Environ 0,08', 'Environ 1,62'],
			answer: 1,
			why: 'Toutes les 5 secondes, le noyau garde 1884/2048 de l’ancienne valeur, environ 92 %, et ajoute 8 % du nouvel échantillon. Après 12 échantillons, la valeur atteint environ 0,62. Elle n’arrive à 1,0 qu’après plusieurs minutes.'
		},
		{
			q: 'Le disque sous une base de données se bloque. La charge monte à 40 alors que `top` montre les CPU au repos à 95 %. Pourquoi ?',
			options: [
				'Le noyau compte le temps passé à relancer le disque comme du temps CPU',
				'Les processus qui attendent des lectures disque sont en état D, que la charge compte',
				'`top` arrête d’échantillonner les CPU tant que le disque est bloqué',
				'La charge est fausse jusqu’à ce que le disque réponde à nouveau'
			],
			answer: 1,
			why: 'Les processus bloqués sur le disque attendent en sommeil non interruptible, et `nr_uninterruptible` entre dans la somme de la charge. Ils n’utilisent aucun CPU : `top` montre les CPU au repos pendant que la charge grimpe.'
		}
	],
	recall: {
		q: 'Quels deux états de tâche la charge moyenne compte-t-elle sous Linux, et à quel rythme le noyau prend-il un échantillon ?',
		a: 'R (sur un CPU ou dans une file d’exécution) et D (sommeil non interruptible, le plus souvent une I/O disque), échantillonnés toutes les 5 secondes dans `calc_global_load()` avec les constantes 1884, 2014 et 2037.'
	},
	sources: [
		{ title: 'Brendan Gregg, Linux Load Averages: Solving the Mystery (2017)', url: GREGG },
		{ title: 'proc_loadavg(5), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man5/proc_loadavg.5.html' },
		{ title: 'Linux v6.12, kernel/sched/loadavg.c', url: LOADAVG_C },
		{ title: 'Linux v6.12, include/linux/sched/loadavg.h', url: LOADAVG_H },
		{ title: 'vmstat(8), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man8/vmstat.8.html' },
		{ title: 'ps(1), page de manuel Linux (PROCESS STATE CODES)', url: 'https://man7.org/linux/man-pages/man1/ps.1.html' }
	]
};
