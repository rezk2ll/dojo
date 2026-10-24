const PROCPS = 'https://gitlab.com/procps-ng/procps/-/blob/9bd4021f13bc3148e5753d4195669917dad14135';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'Les conteneurs vus du noyau',
	title: 'Un serveur lent en 60 secondes',
	minutes: 10,
	hook: [
		'Le billet de Brendan Gregg sur le blog tech de Netflix, en 2015, s’ouvre sur une question : « You login to a Linux server with a performance issue: what do you check in the first minute? » Sa réponse tient en dix commandes : `uptime`, `dmesg | tail`, `vmstat 1`, `mpstat -P ALL 1`, `pidstat 1`, `iostat -xz 1`, `free -m`, `sar -n DEV 1`, `sar -n TCP,ETCP 1` et `top`.',
		'Les sorties de ce chapitre viennent du portable à 16 CPU qui a servi à l’écrire, sous Linux 6.17. Deux conteneurs, `dojo-slow` et `dojo-slow2`, font tourner chacun 32 boucles shell qui ne dorment jamais. Six minutes et demie après le démarrage du premier, `uptime` affiche `load average: 73.08, 50.69, 24.90`.',
		'Le billet dit de chercher d’abord « errors and saturation metrics », et définit la saturation comme une ressource qui « has more load than it can handle ». Les dix commandes ci-dessous trouvent **quelle ressource est saturée**, écartent les autres, et mènent au processus puis au conteneur.'
	],
	terms: [
		{ term: 'Saturation', def: 'Du travail qu’une ressource ne peut pas encore prendre, et qui attend. Le billet : elle se voit « either as the length of a request queue, or time spent waiting ». Pour les CPU, la file est celle des tâches exécutables.' },
		{ term: 'Méthode USE', def: 'La liste de Gregg : pour chaque ressource (CPU, mémoire, disques, réseau), vérifier l’utilisation, la saturation et les erreurs. Chaque ressource écartée réduit la recherche.' },
		{ term: 'Tâche exécutable', def: 'Une tâche qui tourne sur un CPU ou qui en attend un. vmstat les compte dans la colonne `r`, à partir de `procs_running` dans `/proc/stat`. En anglais : runnable task.' },
		{ term: '%wait', def: 'Une colonne de pidstat : la part de temps CPU qu’une tâche a passée « waiting to run ». Elle compte le temps dans la file d’exécution. L’attente du disque apparaît ailleurs, dans `wa` chez vmstat.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['up["uptime : 73.08, 50.69, 24.90"] --> dm["dmesg | tail : Operation not permitted"]'],
				highlight: ['up', 'dm'],
				note: 'La moyenne sur 1 minute vaut trois fois celle sur 15 minutes : la charge monte (chapitre 6). La charge compte aussi les tâches qui attendent le disque, elle ne nomme donc pas encore la ressource. `dmesg` échoue car `kernel.dmesg_restrict = 1` exige CAP_SYSLOG (chapitre 36) ; avec sudo, il affiche les messages du noyau, et l’exemple de Gregg y montre un OOM kill (chapitre 11).'
			},
			{
				add: ['dm --> vm["vmstat 1 : r de 67 à 80, us de 96 à 98, id 0, wa 0"]'],
				highlight: ['vm'],
				note: 'Gregg : « an “r” value greater than the CPU count is saturation ». Ici `r` va de 67 à 80 sur 16 CPU. `us` va de 96 à 98 et `wa` vaut 0 : les CPU exécutent du code utilisateur et aucune tâche n’attend le disque. `so` vaut 0 après la première ligne, et `si` vaut 0 sauf deux secondes à 148 et 4 (chapitre 12).'
			},
			{
				add: ['vm --> mp["mpstat : tous les CPU de 92 à 100 %usr"]', 'mp --> pid["pidstat : 64 processus sh, %wait 78 en moyenne"]'],
				highlight: ['mp', 'pid'],
				note: 'mpstat montre `all` à 98.37 %usr et chaque CPU entre 92 et 100 : la charge est répartie, ce n’est pas un seul thread chaud. pidstat liste 64 processus `sh` en root. En moyenne, 21 %usr et 78.5 %wait : chaque boucle passe l’essentiel de son temps dans la file d’exécution.'
			},
			{
				add: ['pid --> clear["iostat, free, sar : disque, mémoire et réseau écartés"]'],
				highlight: ['clear'],
				note: '`iostat -xz 1` : nvme0n1 à 0.50 %util et `aqu-sz` 0.01 (chapitre 22). `free -m` : 19 122 Mo disponibles, 17 198 Mo en buff/cache (chapitre 10). `sar -n DEV 1` : 0.35 rxkB/s sur l’interface Wi-Fi. `sar -n TCP,ETCP 1` : `retrans/s` 0.00.'
			},
			{
				add: ['clear --> top["top : 65 running, sh à 100 %CPU"]', 'top --> cg["/proc/102713/cgroup : docker-99bc8f06....scope"]'],
				highlight: ['top', 'cg'],
				note: '`top` confirme les outils en continu : `65 running`, 0.0 id, des processus `sh` de 50 à 100 %CPU. Le fichier cgroup d’un PID `sh` donne `/system.slice/docker-99bc8f06fddc....scope`, et `docker ps --no-trunc` relie cet ID à `dojo-slow` (chapitre 34).'
			}
		]
	},
	example: {
		title: 'procps src/vmstat.c : pourquoi la première ligne de vmstat 1 est différente',
		repo: 'procps-ng/procps',
		url: `${PROCPS}/src/vmstat.c#L469-L571`,
		lang: 'c',
		code: `#define V(n) fields[n].value
	V( 0) = SYSv(stat_PRU);
	V( 1) = SYSv(stat_PBL);
	V( 2) = unitConvert(MEMv(mem_SUS));
	V( 3) = unitConvert(MEMv(mem_FREE));
	V( 4) = unitConvert((a_option?MEMv(mem_INA):MEMv(mem_BUF)));
	V( 5) = unitConvert((a_option?MEMv(mem_ACT):MEMv(mem_CAC)));
	V( 6) = (unsigned)( unitConvert(VMSTAT_GET(vm_info, VMSTAT_PSWPIN, ul_int)  * kb_per_page) / uptime );
	V( 7) = (unsigned)( unitConvert(VMSTAT_GET(vm_info, VMSTAT_PSWPOUT, ul_int)  * kb_per_page) / uptime );
	V( 8) = (unsigned)( VMSTAT_GET(vm_info, VMSTAT_PGPGIN, ul_int) / uptime );
	V( 9) = (unsigned)( VMSTAT_GET(vm_info, VMSTAT_PGPGOUT, ul_int) / uptime );
	V(10) = (unsigned)( SYSv(stat_INT) / uptime );
	V(11) = (unsigned)( SYSv(stat_CTX) / Div );
	V(12) = (100*cpu_use + divo2) / Div;
	V(13) = (100*cpu_sys + divo2) / Div;
	V(14) = (100*cpu_idl + divo2) / Div;
	V(15) = (100*cpu_iow + divo2) / Div;
	V(16) = (100*cpu_sto + divo2) / Div;
	V(17) = (100*cpu_gue + divo2) / Div;
#undef V

	output_line(fields, timebuf);
…
#define V(n) fields[n].value
	V( 0) = SYSv(stat_PRU);
	V( 1) = SYSv(stat_PBL);
	V( 2) = unitConvert(MEMv(mem_SUS));
	V( 3) = unitConvert(MEMv(mem_FREE));
	V( 4) = unitConvert((a_option?MEMv(mem_INA):MEMv(mem_BUF)));
	V( 5) = unitConvert((a_option?MEMv(mem_ACT):MEMv(mem_CAC)));
	V( 6) = (unsigned)( ( unitConvert((pswpin [tog] - pswpin [!tog])*kb_per_page)+sleep_half )/sleep_time );
	V( 7) = (unsigned)( ( unitConvert((pswpout [tog] - pswpout [!tog])*kb_per_page)+sleep_half )/sleep_time );
	V( 8) = (unsigned)( (  pgpgin [tog] - pgpgin [!tog]           +sleep_half )/sleep_time );
	V( 9) = (unsigned)( (  pgpgout[tog] - pgpgout[!tog]           +sleep_half )/sleep_time );
	V(10) = (unsigned)( (  DSYSv(stat_INT)           +sleep_half )/sleep_time );
	V(11) = (unsigned)( (  DSYSv(stat_CTX)           +sleep_half )/sleep_time );
	V(12) = (100*cpu_use + divo2) / Div;
	V(13) = (100*cpu_sys + divo2) / Div;
	V(14) = (100*cpu_idl + divo2) / Div;
	V(15) = (100*cpu_iow + divo2) / Div;
	V(16) = (100*cpu_sto + divo2) / Div;
	V(17) = (100*cpu_gue + divo2) / Div;
#undef V

	output_line(fields, timebuf);`,
		notes: [
			'Les lignes 2 et 3 remplissent `r` et `b` avec `procs_running` et `procs_blocked` de `/proc/stat`, que proc_stat(5) définit comme les tâches « in runnable state » et les tâches « blocked waiting for I/O to complete ». La page de man de vmstat(8) : ces valeurs « are instantaneous ».',
			'Les lignes 8 et 9 calculent `si` et `so` pour la première ligne : toutes les pages échangées depuis le démarrage, divisées par `uptime`. La page de man : « The first report produced gives averages since the last reboot. » C’est pour cela que Gregg conseille de sauter la première ligne.',
			'La ligne 13 divise le total des changements de contexte par `Div`, la somme des ticks CPU depuis le démarrage, là où les lignes 8 à 12 divisent par `uptime`. Dans la capture, la première ligne affiche `cs` 41, et les suivantes de 45 563 à 304 830.',
			'Les lignes 31, 32 et 36 sont dans la boucle : chaque ligne soustrait l’échantillon précédent et divise par `sleep_time`, le `1` de `vmstat 1`. Le résultat est un taux par seconde sur le dernier intervalle.',
			'Les lignes 37 à 42 traduisent les ticks CPU en pourcentages de `Div`, les ticks user, system, idle, iowait et stolen de l’intervalle. `us` 98 et `id` 0 veulent dire que presque chaque tick a exécuté du code utilisateur.'
		]
	},
	tradeoff: {
		gain: [
			'Les dix commandes lisent des compteurs que le noyau tient déjà, comme `/proc/stat`, et répondent en quelques secondes sans installer de traceur.',
			'Dans la capture, `iostat`, `free` et `sar` ont écarté le disque, la mémoire et le réseau en moins d’une minute, ce qui laissait les CPU et les 64 processus `sh`.'
		],
		cost: [
			'`mpstat`, `pidstat`, `iostat` et `sar` demandent le paquet sysstat. Sur ce portable, les quatre manquaient ; ils ont tourné depuis un conteneur `alpine:3.20` avec `--pid=host --network host` et `apk add sysstat`.',
			'`dmesg` exige CAP_SYSLOG quand `kernel.dmesg_restrict` vaut 1, ce qui était le cas ici.',
			'Les commandes nomment la ressource saturée et le processus qui l’utilise. Pour voir quel code tourne, la section de suite du billet renvoie vers un tutoriel sur le profilage et le traçage (chapitres 7 et 39).',
			'`top` efface l’écran, et le billet prévient que les traces d’un problème intermittent « can also be lost ». `vmstat` et `pidstat` impriment des lignes en continu que tu peux coller dans tes notes.'
		]
	},
	task: {
		prompt: 'Cette sortie vient du billet de Gregg, sur un serveur à 32 CPU. `uptime` : `load average: 30.02, 26.43, 19.02`. `vmstat 1` : `r` de 32 à 34, `b` 0, `us` de 96 à 99, `wa` 0, `si` et `so` 0. `pidstat 1` : deux processus `java` à 1591 et 1573 %CPU. Nomme la ressource saturée s’il y en a une, le processus, et la prochaine commande que tu lancerais.',
		hint: 'Compare `r` au nombre de CPU, et lis le %CPU des lignes java comme un nombre de CPU.',
		answer: [
			'La charge monte : 30 sur 1 minute contre 19 sur 15 minutes. `wa` 0 et `b` 0 écartent le disque, et `si`/`so` 0 écartent le swap.',
			'`r` va de 32 à 34 sur 32 CPU : les CPU sont pleinement occupés, juste au seuil de saturation. Le billet : « This isn’t necessarily a problem; check for the degree of saturation using the “r” column. »',
			'Le %CPU de pidstat est additionné sur tous les CPU : 1591 % fait presque 16 CPU pour un seul processus java, et les deux ensemble occupent presque les 32.',
			'Ensuite : lance `mpstat -P ALL 1` pour vérifier que la charge est répartie sur les CPU, puis profile les processus java pour voir quel code consomme le CPU.'
		],
		steps: [
			{
				title: 'Lis uptime',
				questions: [
					{ q: '`load average: 30.02, 26.43, 19.02`. Que dit la tendance ?', options: ['La charge baisse', 'La charge monte : 30 sur 1 minute contre 19 sur 15', 'La charge est stable depuis 15 minutes', 'Le serveur vient de redémarrer'], answer: 1, why: 'Les trois nombres sont les moyennes sur 1, 5 et 15 minutes. Celle sur 1 minute est la plus haute, donc la charge monte.' },
					{ q: 'La charge moyenne nomme-t-elle la ressource occupée ?', options: ['Oui, la charge ne compte que les tâches sur un CPU', 'Oui, une charge au-dessus du nombre de CPU veut dire le disque', 'Non, sous Linux la charge compte aussi les tâches qui attendent le disque', 'Non, la charge ne compte que les attentes réseau'], answer: 2, why: 'Sous Linux, la charge moyenne inclut les tâches « blocked in uninterruptible I/O » : seule, elle ne distingue pas le CPU du disque.' },
					{ q: 'Une charge de 30 sur 32 CPU. Est-ce une saturation à elle seule ?', options: ['Impossible à dire, il faut une colonne qui sépare CPU et disque', 'Oui, toute charge au-dessus de 16 sature 32 CPU', 'Non, la charge n’est un problème qu’au-dessus de 100', 'Oui, la valeur sur 1 minute est toujours une saturation'], answer: 0, why: 'La charge mélange tâches exécutables et tâches bloquées sur le disque. La commande suivante, `vmstat 1`, les sépare en `r` et `b`.' },
					{ q: 'Ta commande suivante, `dmesg | tail`, échoue avec `Operation not permitted`. Pourquoi ?', options: ['Le journal du noyau est vide', '`dmesg` demande le paquet sysstat', 'La charge est trop haute pour lire le journal', '`kernel.dmesg_restrict` vaut 1, il faut donc CAP_SYSLOG'], answer: 3, why: 'Avec `kernel.dmesg_restrict` à 1, lire le journal du noyau demande CAP_SYSLOG. Lance-la avec `sudo`.' }
				]
			},
			{
				title: 'Lis vmstat',
				questions: [
					{ q: '`r` va de 32 à 34 sur 32 CPU. Que dit-il ?', options: ['Les CPU sont inactifs', 'Les CPU sont pleinement occupés, juste au seuil de saturation', 'Les disques sont saturés', 'La mémoire vient à manquer'], answer: 1, why: 'Gregg : une valeur de `r` plus grande que le nombre de CPU est une saturation. 32 à 34 sur 32 CPU, c’est juste au bord.' },
					{ q: 'Qu’écartent `b` 0 et `wa` 0 ?', options: ['Le disque : aucune tâche n’est bloquée sur des E/S', 'Le réseau : aucun paquet n’attend', 'Le swap : aucune page ne bouge', 'Le CPU : aucune tâche n’attend'], answer: 0, why: '`b` compte les tâches « blocked waiting for I/O to complete », et `wa` le temps CPU passé à attendre le disque. Les deux à 0 écartent le disque.' },
					{ q: 'Qu’écartent `si` et `so` à 0 ?', options: ['Les lectures disque', 'Les retransmissions réseau', 'Le swap', 'Le temps volé par l’hyperviseur'], answer: 2, why: '`si` et `so` sont les pages entrées et sorties du swap par seconde. À zéro après la première ligne, il n’y a pas de swap.' },
					{ q: '`us` va de 96 à 99. Où passe le temps CPU ?', options: ['Dans le noyau', 'Dans l’attente du disque', 'Chez d’autres machines virtuelles', 'Dans du code utilisateur'], answer: 3, why: '`us` est la part des ticks qui ont exécuté du code utilisateur. Presque chaque tick a exécuté du code applicatif.' }
				]
			},
			{
				title: 'Lis pidstat',
				questions: [
					{ q: 'Un processus `java` affiche 1591 %CPU. Combien de CPU est-ce ?', options: ['Environ 1,6', 'Environ 16', 'Environ 159', 'Environ 32'], answer: 1, why: 'Le %CPU de pidstat est additionné sur tous les CPU : 100 %, c’est un CPU, et 1591 %, presque 16.' },
					{ q: 'Que tiennent les deux lignes java ensemble ?', options: ['Presque les 32 CPU', 'À peu près la moitié des CPU', 'Un CPU chacune', 'Moins que le temps inactif'], answer: 0, why: '1591 % plus 1573 % font environ 31,6 CPU sur 32.' },
					{ q: 'Quel processus nommes-tu, alors ?', options: ['Le noyau', 'Celui qui a le plus petit PID', 'Les deux processus `java`', '`pidstat` lui-même'], answer: 2, why: 'Ce sont eux qui consomment le temps CPU que `vmstat` montrait en `us`.' },
					{ q: 'Quelle ressource est saturée, s’il y en a une ?', options: ['Le disque', 'La mémoire', 'Le réseau', 'Le CPU, juste à sa limite'], answer: 3, why: '`r` égale le nombre de CPU, `us` frôle 100, et le disque comme le swap sont écartés. Ce sont les CPU qui sont occupés.' }
				]
			},
			{
				title: 'Choisis la commande suivante',
				questions: [
					{ q: '`r` égal au nombre de CPU, est-ce toujours un problème ?', options: ['Pas forcément : mesure le degré de saturation avec `r`', 'Oui, c’est toujours une panne', 'Non, `r` ne compte jamais sous Linux', 'Seulement si `wa` est haut aussi'], answer: 0, why: 'Le billet : « This isn’t necessarily a problem; check for the degree of saturation using the “r” column. »' },
					{ q: 'Quelle commande vérifie que la charge est répartie sur les CPU ?', options: ['`iostat -xz 1`', '`mpstat -P ALL 1`', '`free -m`', '`sar -n TCP,ETCP 1`'], answer: 1, why: '`mpstat -P ALL 1` affiche chaque CPU. Des chiffres proches veulent dire que le travail est réparti, pas un seul thread brûlant.' },
					{ q: 'Ensuite, comment trouves-tu quel code consomme le CPU ?', options: ['En laissant `top` tourner plus longtemps', 'En ajoutant des CPU pour comparer', 'En profilant les processus java', 'En relisant `dmesg`'], answer: 2, why: 'Les dix commandes nomment la ressource et le processus. Un profileur montre quel code tourne.' },
					{ q: 'Pourquoi coller dans tes notes des lignes de `vmstat` et `pidstat` plutôt qu’un écran de `top` ?', options: ['`top` ne sait pas afficher le %CPU', '`top` demande le paquet sysstat', '`top` cache les processus java', '`top` efface l’écran, et les traces d’un problème intermittent peuvent se perdre'], answer: 3, why: 'Le billet prévient qu’avec `top`, les traces d’un problème intermittent « can also be lost ». `vmstat` et `pidstat` affichent des lignes qui défilent.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'La première ligne de `vmstat 1` affiche `si 3 so 56`, et toutes les suivantes affichent 0. Pourquoi ?',
			options: [
				'La première ligne moyenne tout le swap depuis le démarrage',
				'La première ligne compte le swap pendant le lancement de vmstat',
				'Le noyau remet les compteurs de swap à zéro après la lecture',
				'La première ligne compte en pages, les suivantes en kilo-octets'
			],
			answer: 0,
			why: 'vmstat.c divise les totaux de swap par l’uptime pour la première ligne, et la page de man dit « The first report produced gives averages since the last reboot. » Les lignes suivantes soustraient l’échantillon précédent et divisent par l’intervalle.'
		},
		{
			q: 'La charge moyenne vaut 73 sur un serveur à 16 CPU. Quel nombre te dit que les CPU sont saturés, sans compter les tâches qui attendent le disque ?',
			options: [
				'La colonne `wa` de `vmstat 1`',
				'La colonne `r` de `vmstat 1`, comparée au nombre de CPU',
				'La charge sur 15 minutes, comparée à celle sur 1 minute',
				'La colonne `%util` de `iostat -xz 1`'
			],
			answer: 1,
			why: 'Sous Linux, la charge moyenne inclut les tâches « blocked in uninterruptible I/O ». Gregg : `r` « provides a better signal than load averages for determining CPU saturation, as it does not include I/O ». Dans la capture, `r` allait de 67 à 80 sur 16 CPU.'
		},
		{
			q: 'pidstat montre un processus `sh` à 21 %usr et 78 %wait. Que faisait-il la plupart du temps ?',
			options: [
				'Il attendait la fin d’une lecture sur le disque',
				'Il dormait dans un appel `wait` pour ses processus fils',
				'Il était exécutable et attendait un CPU dans la file',
				'Il était stoppé par la limite CPU du cgroup de son conteneur'
			],
			answer: 2,
			why: 'pidstat(1) définit %wait comme « Percentage of CPU spent by the task while waiting to run ». Avec 64 boucles actives sur 16 CPU, chaque boucle tournait environ un cinquième du temps et attendait le reste.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Saturer tes propres CPU depuis un conteneur, puis trouver la ressource, le processus et le conteneur avec les commandes de la première minute.',
		steps: [
			'Lance deux fois plus de boucles actives que tu as de CPU : `N=$(( $(nproc) * 2 )); docker run -d --name slow-lab -e N=$N busybox sh -c \'for i in $(seq $N); do (while :; do :; done) & done; wait\'`. Ton portable sera lent jusqu’à la dernière étape.',
			'Attends une demi-minute, puis lance `uptime` et `vmstat 1 5`. Compare `r` à `nproc`, et lis `us`, `id` et `wa`.',
			'Écarte la mémoire et le disque : `free -m`, et `iostat -xz 1 3` si sysstat est installé.',
			'Trouve un processus occupé et son cgroup : `PID=$(ps -eo pid,comm,pcpu --sort=-pcpu | awk \'$2=="sh"{print $1; exit}\'); cat /proc/$PID/cgroup`.',
			'Relie le cgroup à un conteneur : `ID=$(sed \'s/.*docker-\\(.*\\)\\.scope/\\1/\' /proc/$PID/cgroup); docker ps --no-trunc --format \'{{.ID}} {{.Names}}\' | grep "$ID"`. Arrête la charge avec `docker rm -f slow-lab`.'
		],
		done: [
			'La charge sur 1 minute dépasse celle sur 15 minutes et continue de monter.',
			'Après la première ligne, `vmstat` montre `r` à deux fois `nproc` environ ou plus, `us` au-dessus de 80, `id` à 0 et `wa` à 0.',
			'`free -m` montre toujours de la mémoire disponible, et `iostat` (si lancé) un `%util` bas.',
			'`/proc/$PID/cgroup` nomme un `docker-<id>.scope`, et la ligne de `docker ps` affiche `slow-lab`.'
		],
		solution: [
			'`r` au-dessus du nombre de CPU avec `wa` à 0, c’est une saturation CPU, pas disque : Gregg dit que `r` « does not include I/O », contrairement à la charge moyenne.',
			'La première ligne de `vmstat` est une moyenne depuis le démarrage : lis à partir de la deuxième.',
			'Un conteneur est un cgroup sur l’hôte (chapitre 34) : le chemin de cgroup de n’importe quel PID occupé mène à l’ID du conteneur, et `docker ps --no-trunc` change cet ID en nom.'
		]
	},
	recall: {
		q: 'Cite les dix commandes de Gregg dans l’ordre, et la colonne qui montre la saturation des CPU.',
		a: '`uptime`, `dmesg | tail`, `vmstat 1`, `mpstat -P ALL 1`, `pidstat 1`, `iostat -xz 1`, `free -m`, `sar -n DEV 1`, `sar -n TCP,ETCP 1`, `top`. La colonne `r` de vmstat, quand elle dépasse le nombre de CPU.'
	},
	sources: [
		{ title: 'Netflix Tech Blog, Linux Performance Analysis in 60,000 Milliseconds (2015), copie sur brendangregg.com', url: 'https://www.brendangregg.com/Articles/Netflix_Linux_Perf_Analysis_60s.pdf' },
		{ title: 'vmstat(8), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man8/vmstat.8.html' },
		{ title: 'proc_stat(5), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man5/proc_stat.5.html' },
		{ title: 'pidstat(1), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man1/pidstat.1.html' },
		{ title: 'Doc du noyau Linux, sysctl kernel : dmesg_restrict', url: 'https://docs.kernel.org/admin-guide/sysctl/kernel.html#dmesg-restrict' },
		{ title: 'procps, src/vmstat.c', url: `${PROCPS}/src/vmstat.c` }
	]
};
