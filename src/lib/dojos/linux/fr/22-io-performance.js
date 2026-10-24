const SYSSTAT = 'https://github.com/sysstat/sysstat/blob/efd0c445b89dab7cf2db69ffaedf94ccbbc5bc90';
const RD_STATS = `${SYSSTAT}/rd_stats.c`;
const IOSTAT_C = `${SYSSTAT}/iostat.c`;
const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const MAN = 'https://man7.org/linux/man-pages';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'io-performance',
	part: 'Fichiers et disques',
	title: 'Les I/O disque et iostat',
	minutes: 10,
	hook: [
		'Un seul `dd` lit un fichier de 2 GB par blocs de 4 KiB avec `iflag=direct`, sur un SSD NVMe. Il obtient 291 MB/s, et le disque affiche 81,5 % d’occupation. Avec 64 `dd` qui lisent le même fichier en parallèle, le disque débite 3578 MB/s, douze fois plus, et affiche 73,0 %. Ces chiffres viennent d’un essai fait pour ce chapitre sous Linux 6.17.',
		'iostat(1) prévient pour cette colonne : « for devices serving requests in parallel, such as RAID arrays and modern SSDs, this number does not reflect their performance limits » (sur un SSD ou un RAID, elle ne montre pas la limite). **`%util` compte le temps où au moins une requête est en cours, quel que soit leur nombre.**',
		'Pour la lenteur, regarde plutôt `await`. Brendan Gregg la décrit comme « the time that the application suffers, as it includes both time queued and time being serviced » (le temps que subit l’appli, attente en file comprise). Dans le même essai, `r_await` est passé de 0,012 ms avec un lecteur à 0,064 ms avec 64.'
	],
	terms: [
		{ term: '%util', def: 'La part de l’intervalle pendant laquelle le périphérique avait au moins une requête d’I/O en cours. iostat la calcule à partir du compteur `io_ticks` du noyau.' },
		{ term: 'await', def: 'Le temps moyen en millisecondes entre la création d’une requête dans la couche bloc et sa fin : attente en file plus temps passé sur le périphérique. `r_await` vaut pour les lectures, `w_await` pour les écritures.' },
		{ term: 'aqu-sz', def: 'Le nombre moyen de requêtes en cours pendant l’intervalle, c’est-à-dire la profondeur de file que voit le périphérique. Les anciennes versions d’iostat l’appelaient `avgqu-sz`.' },
		{ term: 'I/O directe', def: 'Des lectures et écritures ouvertes avec `O_DIRECT`, qui passent entre le buffer du programme et le disque sans le cache de pages. `dd iflag=direct` l’utilise, donc chaque lecture atteint le périphérique.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["dd appelle read() sur un fichier ouvert avec O_DIRECT"] --> rq["La couche bloc alloue une requête : le chrono démarre"]'],
				highlight: ['app', 'rq'],
				note: 'La doc iostats du noyau dit que le temps d’une lecture est « measured from blk_mq_alloc_request() to __blk_mq_end_request() ». Le chrono part quand la couche bloc crée la requête, avant que le périphérique la voie. Toute attente dans la file compte dans `await`.'
			},
			{
				add: ['rq --> dev["Le pilote l’envoie au périphérique : in_flight + 1"]', 'dev --> many["Un SSD NVMe traite beaucoup de requêtes à la fois"]'],
				highlight: ['dev', 'many'],
				note: 'Le champ `in_flight` « counts the number of I/O requests that have been issued to the device driver but have not yet completed » (les requêtes envoyées au pilote et pas encore finies). iostat(1) distingue les « devices serving requests serially » des « RAID arrays and modern SSDs », qui servent les requêtes en parallèle. Le SSD de test a servi 64 lecteurs avec 12 fois le débit d’un seul.'
			},
			{
				add: ['many --> done["Fin : read I/Os + 1, read ticks + son attente"]', 'done -->|"delta ticks / delta I/Os"| await["await"]'],
				highlight: ['done', 'await'],
				note: 'À la fin d’une requête, le noyau ajoute 1 à `read I/Os` et ajoute son attente à `read ticks` dans `/sys/block/<dev>/stat`. La doc donne un exemple : « if 60 read requests wait for an average of 30 ms, the read_ticks field will increase by 60*30 = 1800 ». iostat divise la variation des ticks par la variation des I/O pour obtenir `await`.'
			},
			{
				add: ['dev --> busy["io_ticks : ms avec au moins une requête en file"]', 'busy -->|"delta / intervalle"| util["%util"]'],
				highlight: ['busy', 'util'],
				note: '`io_ticks` « counts the number of milliseconds during which the device has had I/O requests queued ». Une requête en cours pendant toute la seconde donne 1000 ms, et 64 requêtes en cours donnent aussi 1000 ms. Dans l’essai, `%util` est resté entre 73 % et 82 % pendant que le débit passait de 291 à 3578 MB/s.'
			},
			{
				add: ['done --> wq["time_in_queue : ms fois requêtes en attente"]', 'wq -->|"delta / intervalle"| aqu["aqu-sz"]'],
				highlight: ['wq', 'aqu'],
				note: '`time_in_queue` augmente du nombre de requêtes en attente à chaque milliseconde, donc sa variation par seconde est la profondeur de file moyenne. Tu peux vérifier avec r/s fois await : 873 584 lectures/s × 0,064 ms = 55,9, et l’essai a mesuré `aqu-sz` 55,51. Gregg : « Values greater than 1 can be evidence of saturation » sur un périphérique qui sert une requête à la fois.'
			}
		]
	},
	example: {
		title: 'sysstat rd_stats.c : compute_ext_disk_stats, %util et await à partir de deux relevés',
		repo: 'sysstat/sysstat',
		url: `${RD_STATS}#L619-L636`,
		lang: 'c',
		code: `void compute_ext_disk_stats(struct stats_disk *sdc, struct stats_disk *sdp,
			    unsigned long long itv, struct ext_disk_stats *xds)
{
	xds->util  = sdc->tot_ticks < sdp->tot_ticks ?
		     0.0 :
		     S_VALUE(sdp->tot_ticks, sdc->tot_ticks, itv);
	/*
	 * Kernel gives ticks already in milliseconds for all platforms
	 * => no need for further scaling.
	 * Origin (unmerged) flush operations are counted as writes.
	 */
	xds->await = (sdc->nr_ios > sdp->nr_ios) ?
		((sdc->rd_ticks - sdp->rd_ticks) + (sdc->wr_ticks - sdp->wr_ticks) + (sdc->dc_ticks - sdp->dc_ticks)) /
		((double) (sdc->nr_ios - sdp->nr_ios)) : 0.0;
	xds->arqsz = (sdc->nr_ios > sdp->nr_ios) ?
		((sdc->rd_sect - sdp->rd_sect) + (sdc->wr_sect - sdp->wr_sect) + (sdc->dc_sect - sdp->dc_sect)) /
		((double) (sdc->nr_ios - sdp->nr_ios)) : 0.0;
}`,
		notes: [
			'`sdc` est le relevé courant du fichier stat et `sdp` le précédent. iostat lit les deux avec un seul `fscanf` de 17 champs ; [la ligne 432 d’iostat.c](' + IOSTAT_C + '#L430-L434) range le champ 10 dans `tot_ticks` (le `io_ticks` du noyau) et le champ 11 dans `rq_ticks` (`time_in_queue`).',
			'Les lignes 4 à 6 calculent `util` à partir de la variation de `tot_ticks` sur l’intervalle `itv`. `S_VALUE` vaut `(n - m) / p * 100` dans common.h, et iostat divise ensuite le résultat par 10 pour afficher un pourcentage. Aucune de ces lignes ne regarde combien de requêtes étaient en cours.',
			'Les lignes 12 à 14 calculent `await` : la variation des ticks de lecture, d’écriture et de discard, divisée par la variation du nombre d’I/O terminées. Le commentaire des lignes 8 et 9 rappelle que le noyau donne déjà les ticks en millisecondes.',
			'Les lignes 15 à 17 calculent `arqsz`, la taille moyenne des requêtes en secteurs de 512 octets. iostat l’affiche en kB sous le nom `areq-sz`, après une division par 2. Si les requêtes passent de 4 kB à 512 kB, un même r/s ne représente plus le même volume.'
		]
	},
	tradeoff: {
		gain: [
			'`/sys/block/<dev>/stat` donne 17 compteurs sur une ligne, donc une seule lecture du fichier donne un instantané cohérent du périphérique.',
			'`await` et `aqu-sz` viennent des mêmes compteurs et montrent si les requêtes attendent : 64 lecteurs ont fait passer `r_await` de 0,012 à 0,064 ms.'
		],
		cost: [
			'`%util` cache la marge d’un SSD ou d’un RAID : le disque de test affichait 81,5 % à 291 MB/s et 73,0 % à 3578 MB/s.',
			'Chaque colonne est une moyenne sur l’intervalle d’une seconde de `iostat -x 1`. Un relevé d’une seconde peut cacher un blocage de 50 ms qui a touché quelques requêtes.',
			'Depuis Linux 5.0, `io_ticks` « counts jiffies when at least one request was started or completed », et la doc du noyau prévient qu’une partie du temps d’I/O « might be not accounted » pour les longues requêtes concurrentes.'
		]
	},
	task: {
		prompt: 'Deux essais de lectures directes de 4 KiB sur le même SSD NVMe. Essai A, 1 lecteur : r/s 71 008, r_await 0,012 ms, %util 81,5. Essai B, 64 lecteurs : r/s 873 584, r_await 0,064 ms, %util 73,0. Calcule la profondeur de file moyenne de chaque essai à partir de r/s et de r_await. Dis ensuite quel chiffre montre que le disque avait de la marge dans l’essai A.',
		hint: 'Chaque seconde, les lectures passent au total r/s × await millisecondes à attendre. Divise par 1000 ms pour savoir combien étaient en cours en moyenne.',
		answer: [
			'Essai A : 71 008 × 0,012 ms = 852 ms d’attente par seconde, donc `aqu-sz` vaut environ 0,85. L’essai a mesuré 0,83. Un seul `dd` garde au plus une lecture en cours, et les trous entre deux lectures (le temps passé dans `dd` lui-même) expliquent qu’on reste sous 1.',
			'Essai B : 873 584 × 0,064 ms = 55 909 ms par seconde, donc `aqu-sz` vaut environ 55,9. L’essai a mesuré 55,51, proche des 64 lecteurs.',
			'`%util` ne montre pas la marge : il est à peu près le même dans les deux essais. C’est l’essai B qui la montre : 12 fois plus de lectures par seconde, et `r_await` n’est monté que de 0,012 à 0,064 ms. Sur un disque qui sert une requête à la fois, r/s resterait plat et `await` grandirait avec la file.',
			'Pour essayer, lance `iostat -x 1 nvme0n1` dans un terminal et `dd if=big.file of=/dev/null bs=4k iflag=direct` dans un autre, puis démarre d’autres `dd` avec des valeurs `skip=` différentes.'
		],
		steps: [
			{
				title: 'Lis les deux essais',
				questions: [
					{ q: 'Les deux essais utilisent `dd iflag=direct`. Pourquoi est-ce important ici ?', options: ['Chaque lecture fait 4 KiB de plus', 'Ça coupe le calcul de `%util`', 'Chaque lecture saute le cache de pages et atteint le périphérique', 'Ça permet à `dd` de garder 64 lectures en cours'], answer: 2, why: 'L’I/O directe utilise `O_DIRECT`, donc aucune lecture n’est servie depuis la mémoire. Les compteurs les voient toutes.' },
					{ q: 'Que comprend `r_await` ?', options: ['Seulement le temps passé sur le périphérique', 'L’attente en file plus le service, de la création de la requête à sa fin', 'Le temps que `dd` passe entre deux lectures', 'Seulement le temps d’attente dans la file'], answer: 1, why: 'Le noyau mesure de `blk_mq_alloc_request()` à `__blk_mq_end_request()`, donc l’attente en file en fait partie.' },
					{ q: 'Que compte `%util` ?', options: ['La part de l’intervalle avec au moins une requête en cours', 'La part du débit maximal du périphérique utilisée', 'La part des places de la file qui sont prises', 'La part du temps où le CPU attendait le disque'], answer: 0, why: 'iostat le calcule à partir de `io_ticks`, les millisecondes avec des requêtes en file, quel que soit leur nombre.' },
					{ q: 'Que te dit `aqu-sz` ?', options: ['La taille de chaque requête en kB', 'Le nombre de requêtes refusées par seconde', 'Le nombre de processus qui lisent le disque', 'Le nombre moyen de requêtes en cours'], answer: 3, why: '`aqu-sz` est la profondeur de file que voit le périphérique, en moyenne sur l’intervalle.' }
				]
			},
			{
				title: 'Calcule l’essai A',
				questions: [
					{ q: 'Comment obtenir la profondeur de file moyenne à partir de r/s et de r_await ?', options: ['r/s ÷ r_await', 'r/s × r_await ÷ 1000 ms', 'r_await × 1000 ÷ r/s', 'r/s × %util ÷ 100'], answer: 1, why: 'Chaque seconde, les lectures passent au total r/s × await millisecondes à attendre. Divisé par les 1000 ms de la seconde, ça donne combien étaient en cours en moyenne.' },
					{ q: 'Essai A : 71 008 r/s × 0,012 ms, c’est environ combien d’attente par seconde ?', options: ['85 ms', '8 520 ms', '852 ms', '71 ms'], answer: 2, why: '71 008 × 0,012 = 852 ms d’attente dans chaque seconde.' },
					{ q: 'Donc `aqu-sz` pour l’essai A vaut environ...', options: ['0,85', '8,5', '1', '85'], answer: 0, why: '852 ms ÷ 1000 ms donne environ 0,85. L’essai a mesuré 0,83.' },
					{ q: 'Pourquoi l’essai A reste-t-il sous 1 ?', options: ['Le SSD perd des lectures', '`%util` plafonne la file à 81,5 %', 'L’I/O directe divise la profondeur de file par deux', 'Un seul `dd` garde au plus une lecture en cours, avec des trous entre deux lectures'], answer: 3, why: 'Un seul lecteur envoie une lecture, l’attend, puis passe un peu de temps dans `dd` lui-même avant la suivante.' }
				]
			},
			{
				title: 'Calcule l’essai B',
				questions: [
					{ q: 'Essai B : 873 584 r/s × 0,064 ms, c’est environ combien d’attente par seconde ?', options: ['55 909 ms', '5 591 ms', '559 ms', '873 ms'], answer: 0, why: '873 584 × 0,064 = 55 909 ms d’attente dans chaque seconde.' },
					{ q: 'Donc `aqu-sz` pour l’essai B vaut environ...', options: ['5,6', '64', '55,9', '0,064'], answer: 2, why: '55 909 ms ÷ 1000 ms donne environ 55,9. L’essai a mesuré 55,51.' },
					{ q: 'Pourquoi est-ce proche de 64 ?', options: ['iostat arrondit la file au nombre de lecteurs', 'Les 64 lecteurs gardent chacun environ une lecture en cours', 'La file NVMe fait 64 places', '`%util` est monté à 64 %'], answer: 1, why: 'Chaque `dd` a une lecture en cours à la fois, donc 64 d’entre eux donnent une profondeur de file proche de 64.' },
					{ q: 'De combien `r_await` a-t-il grandi entre A et B ?', options: ['Il est resté à 0,012 ms', 'De 0,012 à 0,64 ms', 'Il est descendu à 0,006 ms', 'De 0,012 à 0,064 ms'], answer: 3, why: 'Environ 5 fois plus long par lecture, pour une file proche de 56 au lieu de moins de 1. Le périphérique les a servies en parallèle.' }
				]
			},
			{
				title: 'Trouve la marge',
				questions: [
					{ q: '`%util` montre-t-il que l’essai A avait de la marge ?', options: ['Oui : 81,5 % laisse 18,5 % de libre', 'Oui : il est plus haut que dans l’essai B', 'Non : il est à peu près le même dans les deux essais', 'Non : il ne compte que les écritures'], answer: 2, why: '`%util` est passé de 81,5 à 73,0 alors que les lectures par seconde ont été multipliées par 12. Il ne voit pas les requêtes en parallèle.' },
					{ q: 'Quels chiffres montrent la marge ?', options: ['r/s multiplié par 12 alors que `r_await` n’est monté qu’à 0,064 ms', '`%util` descendu de 81,5 à 73,0', '`aqu-sz` resté sous 1 dans l’essai A', 'La taille des requêtes restée à 4 KiB'], answer: 0, why: 'Le disque a fait plus de travail avec peu d’attente en plus par lecture, donc il n’était pas saturé dans l’essai A.' },
					{ q: 'Sur un disque qui sert une requête à la fois, que feraient 64 lecteurs ?', options: ['Multiplier r/s par 12, comme le SSD', 'Faire tomber `aqu-sz` sous 1', 'Garder `await` égal et baisser `%util`', 'Laisser r/s plat et faire grandir `await` avec la file'], answer: 3, why: 'Un périphérique série ne peut pas faire plus par seconde, donc les requêtes en plus attendent leur tour.' },
					{ q: 'Comment le voir sur ton propre disque ?', options: ['`iostat -x 1` dans un terminal, `dd ... iflag=direct` dans un autre, puis d’autres `dd` avec des `skip=` différents', '`df -h` avant et après un `dd`', 'Un `dd` sans `iflag=direct`, deux fois de suite', '`du -sh big.file` pendant que `dd` tourne'], answer: 0, why: 'Ajouter des lecteurs à des positions différentes augmente la profondeur de file, et iostat montre comment r/s et `await` réagissent.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un SSD NVMe affiche `%util` 100 dans `iostat -x 1`. Que sais-tu à coup sûr ?',
			options: [
				'Le périphérique a atteint son débit maximal pendant cette seconde',
				'Au moins une requête était en cours pendant toute la seconde',
				'La file de requêtes est pleine et les nouvelles sont refusées',
				'Les requêtes attendent plus longtemps en file que sur le périphérique'
			],
			answer: 1,
			why: '`%util` vient de `io_ticks`, qui compte les millisecondes avec des requêtes en cours. Une requête ou 64 requêtes donnent le même compte. Un périphérique qui sert les requêtes en parallèle peut encore en prendre plus.'
		},
		{
			q: 'Sur un volume de base de données, `r_await` passe de 0,5 ms à 9 ms alors que `r/s` reste à 2000. Que mesure `r_await` ?',
			options: [
				'Seulement le temps que le périphérique a mis à servir chaque lecture',
				'Le temps que l’application a passé entre deux de ses appels read',
				'L’attente en file plus le service, de la création de la requête à sa fin',
				'Le temps que le cache de pages a mis à chercher le bloc lors d’un défaut'
			],
			answer: 2,
			why: 'Le noyau mesure le temps de lecture de `blk_mq_alloc_request()` à `__blk_mq_end_request()`, et iostat divise la variation des read ticks par la variation du nombre de lectures. Le temps d’attente dans la file en fait partie.'
		},
		{
			q: 'Un disque fait 2000 lectures par seconde avec un `r_await` de 4 ms. Environ quel `aqu-sz` iostat devrait-il afficher ?',
			options: ['0.5', '8', '2000', '4'],
			answer: 1,
			why: 'Chaque seconde, les lectures passent au total 2000 × 4 ms = 8000 ms à attendre. Divisé par 1000 ms, cela fait 8 requêtes en cours en moyenne, ce que mesure le compteur `time_in_queue`.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Calculer toi-même `await`, `%util` et `aqu-sz` à partir de `/sys/block/<dev>/stat`, avec un lecteur puis huit.',
		steps: [
			'Travaille dans un dossier sur un vrai disque, sous ton home (pas `/tmp`, qui peut être un tmpfs où `O_DIRECT` échoue). Crée un fichier de test et écris-le sur le disque, pour que ses écritures ne tombent pas dans tes relevés : `head -c 512M /dev/urandom > big.file && sync`.',
			'Trouve le périphérique derrière le dossier : `dev=$(basename "$(readlink -f "$(findmnt -no SOURCE -T .)")"); echo $dev; cat /sys/class/block/$dev/stat`. Le 1er champ compte les lectures, le 4e les read ticks (ms), le 10e `io_ticks`, le 11e `time_in_queue`.',
			'Un lecteur : `cat /sys/class/block/$dev/stat > before; dd if=big.file of=/dev/null bs=4k iflag=direct; cat /sys/class/block/$dev/stat > after`. Note les secondes affichées par `dd`.',
			'Compare les deux relevés : `awk \'NR==1{for(i=1;i<=NF;i++)a[i]=$i} NR==2{r=$1-a[1]; print "reads",r,"await_ms",($4-a[4])/r,"io_ticks_ms",$10-a[10],"queue_ms",$11-a[11]}\' before after`.',
			'Huit lecteurs sur des parties différentes du fichier, dans bash : `cat /sys/class/block/$dev/stat > before; time (for i in 0 1 2 3 4 5 6 7; do dd if=big.file of=/dev/null bs=4k iflag=direct skip=$((i*16384)) count=16384 2>/dev/null & done; wait); cat /sys/class/block/$dev/stat > after`, puis le même `awk`. Fais le ménage avec `rm big.file before after`.'
		],
		done: [
			'Tu as `await` en ms pour les deux essais : les read ticks divisés par le nombre de lectures.',
			'Tu as `%util` pour les deux essais : `io_ticks_ms` divisé par les ms écoulées.',
			'Tu as `aqu-sz` pour les deux essais : `queue_ms` divisé par les ms écoulées, autour de 1 avec un lecteur et plusieurs fois plus haut avec huit.'
		],
		solution: [
			'Sur le portable de test, un lecteur a mis 3,21 s : 131 903 lectures, `await` 0,020 ms, `io_ticks` 2524 ms (79 % d’util), `time_in_queue` 2843 ms (`aqu-sz` 0,89).',
			'Huit lecteurs ont lu les mêmes 512 MB en 0,97 s : `await` 0,054 ms, `io_ticks` 970 ms (100 % d’util), `time_in_queue` 7115 ms (`aqu-sz` 7,3).',
			'Le débit a été multiplié par environ 3,3 alors que `%util` n’est passé que de 79 % à 100 %. Le disque avait une marge que `%util` ne montrait pas. D’autres processus écrivent sur le disque pendant l’essai, donc attends-toi à un peu de bruit dans les chiffres.'
		]
	},
	recall: {
		q: 'Que compte le `%util` d’iostat, et pourquoi un SSD NVMe à 80 % de `%util` peut-il encore servir 12 fois plus de lectures ?',
		a: 'Le temps avec au moins une requête en cours (`io_ticks`), quel que soit leur nombre. Un SSD sert beaucoup de requêtes en parallèle : dans l’essai, 64 lecteurs ont obtenu 3578 MB/s contre 291 MB/s pour un seul, à `%util` à peu près égal.'
	},
	sources: [
		{ title: 'iostat(1), page de manuel Linux', url: `${MAN}/man1/iostat.1.html` },
		{ title: 'Linux v6.12, Documentation/admin-guide/iostats.rst', url: `${LINUX}/Documentation/admin-guide/iostats.rst` },
		{ title: 'Linux v6.12, Documentation/block/stat.rst', url: `${LINUX}/Documentation/block/stat.rst` },
		{ title: 'Brendan Gregg, Linux Performance Analysis in 60,000 Milliseconds (Netflix Tech Blog, copie PDF)', url: 'https://www.brendangregg.com/Articles/Netflix_Linux_Perf_Analysis_60s.pdf' },
		{ title: 'open(2), page de manuel Linux (O_DIRECT)', url: `${MAN}/man2/open.2.html` }
	]
};
