const APT = 'https://github.com/Debian/apt/blob/6b128124271e94bdb0f4e7850d9286170d712b04';
const APT_TIMER = `${APT}/debian/apt-daily.timer`;
const APT_SERVICE = `${APT}/debian/apt-daily.service`;
const APT_UPGRADE_TIMER = `${APT}/debian/apt-daily-upgrade.timer`;
const MAN = 'https://www.freedesktop.org/software/systemd/man/latest';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'systemd-timers',
	part: 'Le système en marche',
	title: 'Les timers à la place de cron',
	minutes: 10,
	hook: [
		'La crontab de root contient `0 3 * * * /usr/local/bin/backup.sh`. La VM est éteinte chaque nuit de 22:00 à 07:00 pour économiser. cron se réveille chaque minute et regarde pour chaque commande « if it should be run in the current minute » (si elle doit tourner dans la minute en cours). À 03:00, aucun cron ne tourne : la sauvegarde ne se fait jamais.',
		'La page anacron(8) de Debian le dit : contrairement à cron, « it does not assume that the machine is running continuously » (il ne suppose pas que la machine tourne en continu). Un timer systemd avec `OnCalendar=*-*-* 03:00` et `Persistent=true` garde sur le disque l’heure de son dernier déclenchement. Quand la VM démarre à 07:00, systemd voit que le passage de 03:00 a été raté et lance la sauvegarde tout de suite.',
		'La sortie arrive aussi à un endroit que tu peux lire. cron l’envoie par mail au propriétaire de la crontab. Un service lancé par un timer écrit par défaut dans le journal (`DefaultStandardOutput=journal`) : `journalctl -u backup.service` montre chaque passage avec son code de sortie.'
	],
	terms: [
		{ term: 'Unité timer', def: 'Un fichier `.timer` avec une section `[Timer]`. Quand il expire, il démarre le service du même nom : `backup.timer` démarre `backup.service`.' },
		{ term: 'OnCalendar=', def: 'Un horaire d’horloge murale écrit comme un événement de calendrier, par exemple `Mon..Fri *-*-* 02:30:00`. `systemd-analyze calendar` affiche les prochaines dates qui correspondent.' },
		{ term: 'Persistent=', def: 'Avec `true`, systemd garde sur le disque l’heure du dernier déclenchement. Si un passage était prévu pendant que le timer était inactif, machine éteinte par exemple, le service démarre dès que le timer est de nouveau actif.' },
		{ term: 'RandomizedDelaySec=', def: 'Un délai aléatoire entre 0 et la durée donnée, tiré avant chaque passage et ajouté à l’heure prévue. Il étale des timers qui expireraient tous au même instant.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['enable["systemctl enable --now backup.timer"] --> timer["backup.timer : WantedBy=timers.target"]', 'timer -.->|"Before= automatique"| svc["backup.service"]'],
				highlight: ['enable', 'timer'],
				note: 'Tu actives et démarres `backup.timer`, et c’est le timer qui démarre le service. `WantedBy=timers.target` le fait démarrer au boot. systemd ajoute de lui-même une dépendance `Before=backup.service` au timer. Un timer avec `OnCalendar=` est aussi placé après `time-sync.target` : il attend une horloge réglée.'
			},
			{
				add: ['timer --> next["Prochaine expiration : 03:00 + délai aléatoire, dans AccuracySec=1min"]'],
				highlight: ['next'],
				note: 'systemd calcule la prochaine expiration à partir de `OnCalendar=`. `RandomizedDelaySec=` ajoute un délai aléatoire, puis `AccuracySec=` (1 minute par défaut) laisse systemd décaler l’heure dans une fenêtre pour regrouper les réveils avec d’autres timers. Le timer n’expire jamais avant l’heure prévue.'
			},
			{
				add: ['next -->|"expire"| svc', 'svc -->|"stdout et stderr"| journal[("journal : journalctl -u backup.service")]'],
				highlight: ['svc', 'journal'],
				note: 'À l’expiration, systemd démarre `backup.service`, en général un service `Type=oneshot`. Si le service tourne encore depuis la fois précédente, systemd le laisse tourner et ne lance pas de deuxième copie. Sa sortie et son code de sortie arrivent dans le journal.'
			},
			{
				add: ['off["Machine éteinte à 03:00"] -->|"boot à 07:00, Persistent=true"| catchup["Le fichier stamp montre un passage raté : lancement immédiat"]', 'catchup --> svc'],
				highlight: ['off', 'catchup'],
				note: 'Avec `Persistent=true`, l’heure du dernier déclenchement reste sur le disque (sous Ubuntu 24.04, dans `/var/lib/systemd/timers/` sous le nom `stamp-backup.timer`). Au boot, si au moins un passage était prévu pendant l’inactivité du timer, systemd déclenche le service aussitôt. Ce rattrapage attend quand même `RandomizedDelaySec=`.'
			}
		]
	},
	example: {
		title: 'debian/apt-daily.timer : le timer qui lance apt update sur Debian et Ubuntu',
		repo: 'Debian/apt',
		url: `${APT_TIMER}#L1-L10`,
		lang: 'ini',
		code: `[Unit]
Description=Daily apt download activities

[Timer]
OnCalendar=*-*-* 6,18:00
RandomizedDelaySec=12h
Persistent=true

[Install]
WantedBy=timers.target`,
		notes: [
			'La ligne 5 prévoit deux passages par jour. `systemd-analyze calendar \'*-*-* 6,18:00\'` affiche la forme normalisée `*-*-* 06,18:00:00` et la prochaine expiration, `06:00:00`.',
			'La ligne 6 ajoute à chaque passage un délai aléatoire de 0 à 12 heures. Sur un portable basé sur Ubuntu 24.04, `systemctl list-timers` donnait le prochain passage de `apt-daily.timer` à `07:32:55` pour le créneau de 06:00.',
			'La ligne 7 rattrape un créneau raté pendant que le portable était éteint. La ligne 9 démarre le timer au boot via `timers.target`.',
			'Le timer ne nomme aucune unité, il démarre donc [apt-daily.service](' + APT_SERVICE + '#L7-L10) : un service `Type=oneshot` qui lance `/usr/lib/apt/apt.systemd.daily update`. Son voisin `apt-daily-upgrade.timer` expire à 6:00 avec jusqu’à 60 minutes de délai et lance l’étape `install`.'
		]
	},
	tradeoff: {
		gain: [
			'`Persistent=true` lance une tâche ratée pendant que la machine était éteinte. Une ligne de crontab pour 03:00 sur une machine éteinte à 03:00 ne tourne jamais.',
			'Chaque passage est un service : `journalctl -u backup.service` montre sa sortie, et `systemctl status` son dernier code de sortie.',
			'Un passage encore en cours à l’expiration suivante est laissé tranquille : deux copies de `backup.sh` ne tournent jamais en même temps.'
		],
		cost: [
			'Tu écris deux fichiers, un `.timer` et un `.service`, et tu lances `systemctl enable --now`, là où cron demandait une ligne de crontab.',
			'`Persistent=` ne marche qu’avec `OnCalendar=`. Un timer basé sur `OnUnitActiveSec=` ne rattrape rien après un arrêt.',
			'Le réglage par défaut `AccuracySec=1min` peut décaler le passage jusqu’à une minute. Mets `AccuracySec=1us` si la seconde compte.'
		]
	},
	task: {
		prompt: 'Transforme la ligne de crontab `30 2 * * 1-5 /usr/local/bin/report` en timer systemd qui rattrape aussi un rapport raté pendant un arrêt. Écris les deux fichiers, la commande qui vérifie ton horaire, et les commandes qui montrent le dernier passage et ce qu’il a affiché.',
		hint: 'Dans une crontab, le cinquième champ est le jour de la semaine, et 1-5 va du lundi au vendredi. L’horaire va dans `report.timer`, la commande dans `report.service`.',
		answer: [
			'`/etc/systemd/system/report.service` : `[Service]` avec `Type=oneshot` et `ExecStart=/usr/local/bin/report`. Pas de section `[Install]` : c’est le timer qui le démarre.',
			'`/etc/systemd/system/report.timer` : `[Timer]` avec `OnCalendar=Mon..Fri 02:30` et `Persistent=true`, puis `[Install]` avec `WantedBy=timers.target`.',
			'Vérification : `systemd-analyze calendar \'Mon..Fri 02:30\'` affiche `Normalized form: Mon..Fri *-*-* 02:30:00` et la prochaine expiration. Ensuite `systemctl enable --now report.timer`.',
			'Dernier et prochain passage : `systemctl list-timers report.timer` (colonnes `NEXT`, `LEFT`, `LAST`, `PASSED`). Sortie : `journalctl -u report.service`.'
		],
		steps: [
			{
				title: 'Lis la ligne de crontab',
				questions: [
					{ q: 'Dans `30 2 * * 1-5`, que veulent dire `30` et `2` ?', options: ['Le jour 30, le mois 2', 'La minute 30 de l’heure 2', 'L’heure 30 n’existe pas, donc la minute 2', 'Toutes les 30 minutes pendant 2 heures'], answer: 1, why: 'Les deux premiers champs d’une crontab sont la minute et l’heure : 02:30.' },
					{ q: 'Que veut dire le cinquième champ, `1-5` ?', options: ['Du 1er au 5 du mois', 'De janvier à mai', 'Du lundi au vendredi', 'Cinq passages de suite'], answer: 2, why: 'L’indice le dit : le cinquième champ est le jour de la semaine, et 1-5 va du lundi au vendredi.' },
					{ q: 'Que ne fait pas cette ligne de crontab, alors que la tâche le demande ?', options: ['Lancer un rapport raté pendant que la machine était éteinte', 'Tourner seulement en semaine', 'Tourner à une minute fixe', 'Tourner en root'], answer: 0, why: 'cron regarde chaque minute si une commande doit tourner. Si la machine est éteinte à 02:30, le passage est perdu.' },
					{ q: 'Combien de fichiers demande la version timer ?', options: ['Un seul `.timer` qui contient la commande', 'Une ligne dans `timers.target`', 'Trois : un timer, un service et un socket', 'Deux : `report.timer` pour l’horaire, `report.service` pour la commande'], answer: 3, why: 'Un timer démarre le service du même nom. L’horaire et la commande vivent à part.' }
				]
			},
			{
				title: 'Écris le service',
				questions: [
					{ q: 'Quel `Type=` convient à un rapport qui tourne puis s’arrête ?', options: ['`Type=oneshot`', '`Type=notify`', '`Type=simple`', '`Type=forking`'], answer: 0, why: 'Un timer démarre en général un service `Type=oneshot` : il va jusqu’au bout, puis l’unité redevient inactive.' },
					{ q: 'Quelle ligne lance le rapport ?', options: ['`Exec=/usr/local/bin/report`', '`Command=/usr/local/bin/report`', '`ExecStart=/usr/local/bin/report`', '`Run=/usr/local/bin/report`'], answer: 2, why: '`ExecStart=` est la commande que systemd lance au démarrage du service.' },
					{ q: '`report.service` a-t-il besoin d’une section `[Install]` ?', options: ['Oui, `WantedBy=multi-user.target`', 'Non : c’est le timer qui le démarre', 'Oui, `WantedBy=report.timer`', 'Oui, sinon le timer ne le trouve pas'], answer: 1, why: 'Le timer démarre le service à chaque expiration. Seul le timer est activé, donc seul le timer a besoin d’`[Install]`.' },
					{ q: 'Tu veux un passage tout de suite, hors horaire. Que tapes-tu ?', options: ['Rien : seul le timer peut le démarrer', '`systemctl start report.timer`', '`systemd-analyze calendar now`', '`systemctl start report.service`'], answer: 3, why: 'Le service est une unité ordinaire : tu peux la démarrer à la main. Démarrer le timer ne fait qu’armer l’horaire.' }
				]
			},
			{
				title: 'Écris le timer',
				questions: [
					{ q: 'Quel `OnCalendar=` correspond à `30 2 * * 1-5` ?', options: ['`OnCalendar=Mon..Fri 02:30`', '`OnCalendar=1-5 2:30`', '`OnCalendar=*-*-1..5 02:30`', '`OnCalendar=weekdays 30 2`'], answer: 0, why: 'Un événement de calendrier donne d’abord les jours de la semaine, puis la date et l’heure : `Mon..Fri *-*-* 02:30:00` en forme normalisée.' },
					{ q: 'Quelle ligne étalerait le départ de 02:30 sur 10 minutes au plus, pour que tous les serveurs ne lancent pas en même temps ?', options: ['`Persistent=true`', '`WakeSystem=true`', '`RandomizedDelaySec=10min`', '`AccuracySec=1us`'], answer: 2, why: '`RandomizedDelaySec=` tire un délai au hasard avant chaque passage et l’ajoute à l’heure prévue.' },
					{ q: 'Quelle ligne d’`[Install]` démarre le timer au boot ?', options: ['`WantedBy=multi-user.target`', '`WantedBy=timers.target`', '`After=time-sync.target`', '`Before=report.service`'], answer: 1, why: '`apt-daily.timer` fait pareil : `WantedBy=timers.target`.' },
					{ q: '`Persistent=true` marcherait-il avec `OnUnitActiveSec=1d` à la place ?', options: ['Oui, il marche avec tous les timers', 'Oui, si tu ajoutes `AccuracySec=`', 'Seulement après un redémarrage', 'Non : `Persistent=` ne marche qu’avec `OnCalendar=`'], answer: 3, why: 'Un timer basé sur `OnUnitActiveSec=` ne rattrape rien après un arrêt.' }
				]
			},
			{
				title: 'Vérifie et observe',
				questions: [
					{ q: 'Quelle commande vérifie ton horaire avant de l’activer ?', options: ['`systemctl cat report.timer`', '`systemd-analyze calendar \'Mon..Fri 02:30\'`', '`crontab -l`', '`systemctl list-units --type=timer`'], answer: 1, why: 'Elle affiche `Normalized form: Mon..Fri *-*-* 02:30:00` et la prochaine expiration.' },
					{ q: 'Quelle unité actives-tu et démarres-tu ?', options: ['`report.service`', 'Les deux, l’une après l’autre', '`report.timer`', '`timers.target`'], answer: 2, why: '`systemctl enable --now report.timer`. Le timer démarre ensuite le service à chaque expiration.' },
					{ q: 'Quelle commande montre le dernier passage et le prochain ?', options: ['`systemctl list-timers report.timer`', '`journalctl -u report.timer`', '`systemctl status report.service`', '`systemd-analyze blame`'], answer: 0, why: 'Ses colonnes sont `NEXT`, `LEFT`, `LAST` et `PASSED`.' },
					{ q: 'Juste après l’activation, `list-timers` n’affiche rien sous `LAST`. Qu’est-ce que ça dit ?', options: ['Le timer est cassé', 'Le service a échoué', 'L’horaire est invalide', 'Le timer ne s’est pas encore déclenché'], answer: 3, why: '`LAST` et `PASSED` se remplissent après le premier passage. `NEXT` et `LEFT` montrent déjà le prochain.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un timer a `OnCalendar=daily` et `Persistent=true`. La machine est éteinte de 23:00 à 08:00. Quand le service tourne-t-il ce jour-là ?',
			options: [
				'À 00:00 la nuit suivante : les passages ratés sont sautés',
				'Peu après le boot, une fois passé l’éventuel `RandomizedDelaySec=`',
				'À 00:00 grâce à l’horloge matérielle, qui réveille la machine',
				'Jamais, tant que personne ne lance `systemctl start` à la main'
			],
			answer: 1,
			why: '`daily` veut dire `*-*-* 00:00:00`. Avec `Persistent=true`, systemd lit au boot l’heure du dernier déclenchement, voit que le passage de 00:00 tombait pendant l’arrêt et déclenche le service tout de suite, après `RandomizedDelaySec=`. Réveiller la machine demande `WakeSystem=`.'
		},
		{
			q: '`backup.timer` expire toutes les heures. Un passage de `backup.service` dure 90 minutes. Que se passe-t-il à l’expiration suivante ?',
			options: [
				'systemd lance une deuxième copie du service à côté de la première',
				'systemd tue la copie en cours et en lance une nouvelle',
				'systemd laisse tourner le service en cours et ne lance rien de plus',
				'L’unité timer passe en échec et n’expire plus jusqu’à un reset'
			],
			answer: 2,
			why: 'systemd.timer(5) : si l’unité à activer « is already active at the time the timer elapses it is not restarted, but simply left running ». Un service n’a qu’une instance, il n’y a donc pas de deuxième copie.'
		},
		{
			q: 'Où lis-tu ce que `/usr/local/bin/report` a affiché au dernier passage de `report.timer` ?',
			options: [
				'`journalctl -u report.service`',
				'La boîte mail de l’utilisateur propriétaire du timer',
				'`/var/log/cron.log`',
				'`journalctl -u report.timer`'
			],
			answer: 0,
			why: 'Le timer ne fait que démarrer `report.service`. La sortie standard du service va par défaut dans le journal (`DefaultStandardOutput=journal`), rattachée à l’unité service : tu filtres donc sur `report.service`.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Faire tourner un timer sous ton propre utilisateur, lire sa sortie dans le journal, et voir `Persistent=true` rattraper un passage raté.',
		steps: [
			'Vérifie d’abord l’horaire de la tâche : `systemd-analyze calendar \'Mon..Fri 02:30\'`.',
			'Crée `~/.config/systemd/user/dojo-report.service` avec `[Service]`, `Type=oneshot` et `ExecStart=/bin/sh -c "date; echo report done"`.',
			'Crée `~/.config/systemd/user/dojo-report.timer` avec `[Timer]`, `OnCalendar=*:*:0/20` (toutes les 20 secondes, pour ne pas attendre 02:30), `AccuracySec=1s` et `Persistent=true`. Puis `systemctl --user daemon-reload && systemctl --user start dojo-report.timer`.',
			'Au bout d’une demi-minute, lance `systemctl --user list-timers dojo-report.timer` et `journalctl --user -u dojo-report.service -n 4 --no-pager`.',
			'Rate un passage exprès : `systemctl --user stop dojo-report.timer`, attends 30 secondes, `date +%T`, puis `systemctl --user start dojo-report.timer` et relis le journal avec `-o short-precise`. Fais le ménage : arrête le timer, supprime les deux fichiers et `~/.local/share/systemd/timers/stamp-dojo-report.timer`, puis `systemctl --user daemon-reload`.'
		],
		done: [
			'`systemd-analyze calendar` affiche `Normalized form: Mon..Fri *-*-* 02:30:00` et une prochaine expiration un jour de semaine.',
			'`list-timers` montre une heure `LAST` et une heure `NEXT` à 20 secondes d’écart.',
			'Le journal montre des lignes `report done` pour `dojo-report.service`.',
			'Après l’arrêt puis le démarrage, une ligne `report done` apparaît moins d’une seconde après le `start`, pas au créneau de 20 secondes suivant.'
		],
		solution: [
			'Dans l’essai, le timer a été arrêté à 14:11:20, le créneau de 14:11:40 est passé pendant qu’il était inactif, et le service a tourné à 14:11:42, juste après le `start`.',
			'Le rattrapage vient du fichier stamp : pour un timer utilisateur, `Persistent=true` le garde dans `~/.local/share/systemd/timers/`. Pour un timer système, c’est `/var/lib/systemd/timers/`.',
			'Pour la vraie tâche, les deux fichiers vont dans `/etc/systemd/system/` avec `OnCalendar=Mon..Fri 02:30`, un `[Install]` avec `WantedBy=timers.target` dans le timer, et `systemctl enable --now report.timer`.'
		]
	},
	recall: {
		q: 'Quel réglage de `[Timer]` fait tourner une tâche après le boot si son créneau est passé machine éteinte, et où systemd garde-t-il de quoi le savoir ?',
		a: '`Persistent=true`, avec `OnCalendar=`. systemd garde l’heure du dernier déclenchement sur le disque, dans `/var/lib/systemd/timers/stamp-<name>.timer` sous Ubuntu, et démarre le service au boot si un passage a été raté.'
	},
	sources: [
		{ title: 'systemd.timer(5)', url: `${MAN}/systemd.timer.html` },
		{ title: 'systemd.time(7), Calendar Events', url: `${MAN}/systemd.time.html` },
		{ title: 'systemctl(1), list-timers', url: `${MAN}/systemctl.html` },
		{ title: 'Debian cron(8)', url: 'https://manpages.debian.org/trixie/cron/cron.8.en.html' },
		{ title: 'Debian anacron(8)', url: 'https://manpages.debian.org/trixie/anacron/anacron.8.en.html' },
		{ title: 'Debian/apt, debian/apt-daily-upgrade.timer', url: APT_UPGRADE_TIMER }
	]
};
