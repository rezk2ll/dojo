const MOBY = 'https://github.com/moby/moby/blob/3f38b15147b14ce0ce7b11558a1aa9e9f14db103';
const DOCKER_SERVICE = `${MOBY}/contrib/init/systemd/docker.service`;
const MAN = 'https://www.freedesktop.org/software/systemd/man/latest';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'systemd-units',
	part: 'Le système en marche',
	title: 'Les unités systemd',
	minutes: 10,
	hook: [
		'Un service avec `Restart=on-failure` lit un fichier de config cassé et sort avec le statut 1 à chaque démarrage. Dans un essai fait pour ce chapitre sous systemd 255, son journal se termine par `restart counter is at 5`, puis `Start request repeated too quickly.` Toutes ces lignes portent la même heure, `01:49:50`. L’unité reste `failed` et systemd n’essaie plus.',
		'Ces chiffres viennent des valeurs par défaut. `RestartSec=` vaut 100 ms, et le gestionnaire accepte 5 démarrages en 10 secondes (`DefaultStartLimitBurst=5`, `DefaultStartLimitIntervalSec=10s`). Cinq démarrages espacés de 100 ms tiennent largement dans 10 secondes.',
		'Deuxième piège, dans le même essai : tu modifies `ExecStart=` dans le fichier d’unité et tu lances `systemctl restart`. systemctl affiche `Warning: The unit file, source configuration file or drop-ins of dojo-sleep.service changed on disk.` Le service redémarre avec l’ancienne ligne de commande, `/bin/sleep 600`, tant que tu n’as pas lancé `systemctl daemon-reload`.'
	],
	terms: [
		{ term: 'Fichier d’unité', def: 'Un fichier au format ini, comme `/etc/systemd/system/app.service`, avec une section `[Unit]`, une `[Service]` et une `[Install]`. systemd le lit au démarrage de la machine et à chaque `systemctl daemon-reload`.' },
		{ term: 'Dépendance d’ordre', def: '`After=` et `Before=`. `After=b.service` dans `a.service` veut dire : si les deux démarrent, `a` attend que `b` ait fini de démarrer. Elle ne lance rien à elle seule.' },
		{ term: 'Dépendance de besoin', def: '`Wants=` et `Requires=`. Démarrer l’unité démarre aussi les unités listées. Avec `Requires=`, arrêter ou redémarrer explicitement une unité listée arrête ou redémarre aussi celle-ci.' },
		{ term: 'Limite de démarrage', def: '`StartLimitBurst=` démarrages autorisés par `StartLimitIntervalSec=`. Une unité qui la dépasse est refusée avec `Start request repeated too quickly.`, et `Restart=` arrête d’essayer.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['file["/etc/systemd/system/app.service"] -->|"systemctl daemon-reload"| pid1["systemd (PID 1) : relit chaque fichier d’unité, reconstruit l’arbre des dépendances"]'],
				highlight: ['file', 'pid1'],
				note: 'systemd lit les fichiers d’unité une fois et les garde en mémoire. `systemctl daemon-reload` relance les générateurs, relit chaque fichier d’unité et reconstruit l’arbre des dépendances. Avant ça, un fichier modifié sur le disque ne change rien au prochain démarrage.'
			},
			{
				add: ['pid1 -->|"systemctl start app"| job["Job de démarrage : Wants= et Requires= ajoutent db.service"]', 'job -->|"After=db.service"| db["db.service démarré d’abord"]'],
				highlight: ['job', 'db'],
				note: '`systemctl start app` crée une transaction. `Wants=db.service` ou `Requires=db.service` y ajoute un job de démarrage pour `db.service`. Sans `After=db.service`, les deux unités démarrent en même temps : les dépendances de besoin n’imposent aucun ordre.'
			},
			{
				add: ['db --> fork["fork() puis execve() de ExecStart="]', 'fork -->|"Type=notify : attend READY=1"| up["app.service actif"]'],
				highlight: ['fork', 'up'],
				note: 'Quand `db.service` a fini de démarrer, systemd fait un fork et lance la commande de `ExecStart=`. `Type=` fixe le moment où `app` compte comme démarré : juste après `fork()` pour `simple`, après `execve()` pour `exec`, à l’envoi de `READY=1` pour `notify`. Les unités en `After=app.service` attendent ce moment.'
			},
			{
				add: ['up -->|"sort avec le statut 1"| restart["Restart=on-failure : nouveau démarrage après RestartSec=100ms"]', 'restart --> fork'],
				highlight: ['restart'],
				note: 'Le processus principal sort avec le statut 1. Avec `Restart=on-failure`, un code de sortie non nul, ou un signal autre que `SIGHUP`, `SIGINT`, `SIGTERM` et `SIGPIPE`, déclenche un redémarrage après `RestartSec=`. Un `systemctl stop` n’en déclenche jamais.'
			},
			{
				add: ['restart -->|"6e démarrage en 10 s"| failed["Start request repeated too quickly : l’unité reste failed"]'],
				highlight: ['failed'],
				note: 'Chaque démarrage compte pour la limite, les démarrages manuels aussi. Avec les valeurs par défaut, le sixième démarrage en moins de 10 secondes est refusé. `systemctl reset-failed app` remet le compteur à zéro, et un démarrage manuel repasse une fois l’intervalle écoulé.'
			}
		]
	},
	example: {
		title: 'contrib/init/systemd/docker.service : le fichier d’unité livré avec Docker',
		repo: 'moby/moby',
		url: `${DOCKER_SERVICE}#L1-L38`,
		lang: 'ini',
		code: `[Unit]
Description=Docker Application Container Engine
Documentation=https://docs.docker.com
After=network-online.target nss-lookup.target docker.socket firewalld.service containerd.service time-set.target
Wants=network-online.target containerd.service
Requires=docker.socket
StartLimitBurst=3
StartLimitIntervalSec=60

[Service]
Type=notify
# the default is not to use systemd for cgroups because the delegate issues still
# exists and systemd currently does not support the cgroup feature set required
# for containers run by docker
ExecStart=/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock
ExecReload=/bin/kill -s HUP $MAINPID
TimeoutStartSec=0
RestartSec=2
Restart=always

# Having non-zero Limit*s causes performance problems due to accounting overhead
# in the kernel. We recommend using cgroups to do container-local accounting.
LimitNPROC=infinity
LimitCORE=infinity

# Comment TasksMax if your systemd version does not support it.
# Only systemd 226 and above support this option.
TasksMax=infinity

# set delegate yes so that systemd does not reset the cgroups of docker containers
Delegate=yes

# kill only the docker process, not all processes in the cgroup
KillMode=process
OOMScoreAdjust=-500

[Install]
WantedBy=multi-user.target`,
		notes: [
			'La ligne 4 place `dockerd` après `containerd.service` et cinq autres unités. La ligne 5 ajoute `containerd.service` avec `Wants=` : si containerd échoue, Docker démarre quand même. La ligne 6 utilise `Requires=docker.socket` : arrêter explicitement le socket arrête aussi `docker.service`.',
			'Les lignes 7, 8, 18 et 19 règlent les redémarrages. `Restart=always` relance `dockerd` 2 secondes après toute sortie qui ne vient pas d’un `systemctl stop`. La limite permet 3 démarrages en 60 secondes : après trois crashs rapprochés, le quatrième démarrage est refusé et l’unité reste en échec.',
			'La ligne 11, `Type=notify`, fait attendre à systemd que `dockerd` envoie `READY=1`. Une unité en `After=docker.service` ne démarre donc qu’une fois que `dockerd` a signalé la fin de son démarrage. Avec `Type=simple`, elle démarrerait juste après le `fork()`.',
			'La ligne 38 sert à `systemctl enable docker`. La commande crée un lien symbolique dans `multi-user.target.wants/`, ce qui ajoute `Wants=docker.service` à `multi-user.target` : Docker démarre au boot.'
		]
	},
	tradeoff: {
		gain: [
			'`Restart=on-failure` relance un processus planté après `RestartSec=`, sans script d’enrobage ni tâche cron pour le surveiller.',
			'`Wants=` avec `After=` donne son ordre à Docker : containerd démarre d’abord quand les deux démarrent, et Docker démarre quand même si containerd échoue.',
			'Un fichier drop-in dans `/etc/systemd/system/docker.service.d/` remplace des réglages précis du fichier d’unité du paquet sans toucher à ce fichier.'
		],
		cost: [
			'Avec `RestartSec=100ms` et 5 démarrages par 10 secondes par défaut, systemd abandonne en moins d’une seconde un service qui échoue au démarrage. Mets `RestartSec=` à quelques secondes si la cause peut disparaître seule, comme une base encore en train de démarrer.',
			'`Requires=` arrête ton unité dès que quelqu’un arrête ou redémarre explicitement l’unité listée : redémarrer la base redémarre aussi ton app.',
			'Une modification d’un fichier d’unité ne compte qu’après `systemctl daemon-reload`. Sans lui, `systemctl restart` relance l’ancienne définition et n’affiche qu’un avertissement.'
		]
	},
	task: {
		prompt: 'Ton app `/usr/local/bin/shop` lit dans PostgreSQL. Écris `/etc/systemd/system/shop.service` pour que : `postgresql.service` démarre avec elle et avant elle ; l’app redémarre 5 secondes après un crash ; systemd abandonne après 10 démarrages en 5 minutes ; l’app démarre au boot. Donne ensuite les commandes pour l’installer et la lancer, puis celles à taper quand tu changeras `ExecStart=` plus tard.',
		hint: '`StartLimitIntervalSec=` et `StartLimitBurst=` vont dans la section `[Unit]`. `systemctl enable` recharge la configuration du gestionnaire de lui-même.',
		answer: [
			'`[Unit]` : `Wants=postgresql.service`, `After=postgresql.service`, `StartLimitIntervalSec=300`, `StartLimitBurst=10`. `Wants=` fait démarrer PostgreSQL, `After=` fait attendre `shop`.',
			'`[Service]` : `ExecStart=/usr/local/bin/shop`, `Restart=on-failure`, `RestartSec=5`. `[Install]` : `WantedBy=multi-user.target`.',
			'Installation et lancement : `systemctl enable --now shop`. `enable` crée le lien dans `multi-user.target.wants/` et recharge la configuration, `--now` démarre l’unité en plus.',
			'Après une modification : `systemctl daemon-reload`, puis `systemctl restart shop`. `systemctl show shop -p NeedDaemonReload` affiche `NeedDaemonReload=yes` tant que le rechargement manque.'
		],
		steps: [
			{
				title: 'Fais venir PostgreSQL',
				questions: [
					{ q: 'Quelle ligne fait démarrer `postgresql.service` quand `shop` démarre ?', options: ['`After=postgresql.service`', '`Before=postgresql.service`', '`Wants=postgresql.service`', '`WantedBy=postgresql.service`'], answer: 2, why: '`Wants=` ajoute un job de démarrage pour l’unité listée dans la transaction. `After=` seul ne démarre rien.' },
					{ q: 'Quelle ligne fait attendre `shop` jusqu’à ce que PostgreSQL ait fini de démarrer ?', options: ['`After=postgresql.service`', '`Requires=postgresql.service`', '`Wants=postgresql.service`', '`Before=postgresql.service`'], answer: 0, why: 'L’ordre ne vient que de `After=` et `Before=`. `After=b` veut dire que `a` attend `b` quand les deux démarrent.' },
					{ q: 'Avec les deux lignes en place, PostgreSQL échoue à démarrer. Qu’arrive-t-il à `shop` ?', options: ['systemd ne le démarre pas', 'Il attend que PostgreSQL revienne', 'systemd relance d’abord PostgreSQL 5 fois', 'Il démarre quand même, une fois le job de PostgreSQL fini'], answer: 3, why: '`Wants=` est la forme faible : si l’unité voulue échoue, celle-ci démarre quand même. `After=` la fait seulement attendre la fin du job.' },
					{ q: 'Pourquoi préférer `Wants=` à `Requires=` ici ?', options: ['`Requires=` ne démarre pas l’unité', 'Avec `Requires=`, redémarrer PostgreSQL redémarre aussi `shop`', '`Wants=` ordonne aussi les unités', '`Requires=` ne marche qu’au boot'], answer: 1, why: 'Avec `Requires=`, arrêter ou redémarrer explicitement l’unité listée arrête ou redémarre aussi celle-ci.' }
				]
			},
			{
				title: 'Règle la relance',
				questions: [
					{ q: 'Quelles lignes de `[Service]` relancent l’app 5 secondes après un crash ?', options: ['`Restart=always` et `TimeoutStartSec=5`', '`Restart=on-failure` et `RestartSec=5`', '`Restart=on-abort` et `StartLimitBurst=5`', '`Restart=no` et `RestartSec=5`'], answer: 1, why: '`on-failure` relance après une sortie non nulle ou un signal pas propre. `RestartSec=` fixe le délai avant le nouveau démarrage.' },
					{ q: 'Sans `RestartSec=`, combien de temps systemd attend-il avant une relance ?', options: ['100 ms', '5 secondes', '10 secondes', 'Il ne relance pas'], answer: 0, why: '`RestartSec=` vaut 100 ms par défaut, d’où un service cassé qui atteint la limite en moins d’une seconde.' },
					{ q: 'Comment écrire « abandonner après 10 démarrages en 5 minutes » ?', options: ['`StartLimitBurst=5` et `StartLimitIntervalSec=10`', '`RestartSec=300` et `StartLimitBurst=10`', '`StartLimitIntervalSec=5m` et `RestartSec=10`', '`StartLimitIntervalSec=300` et `StartLimitBurst=10`'], answer: 3, why: '`StartLimitBurst=` est le nombre de démarrages, `StartLimitIntervalSec=` la fenêtre : 300 secondes font 5 minutes.' },
					{ q: 'Dans quelle section vont les deux lignes de limite ?', options: ['`[Service]`', '`[Install]`', '`[Unit]`', 'L’une ou l’autre'], answer: 2, why: 'L’indice le dit : `StartLimitIntervalSec=` et `StartLimitBurst=` vont dans `[Unit]`.' }
				]
			},
			{
				title: 'Fais-la démarrer au boot',
				questions: [
					{ q: 'Quelle ligne fait démarrer `shop` au boot une fois activée ?', options: ['`WantedBy=multi-user.target`', '`After=multi-user.target`', '`Wants=multi-user.target`', '`Before=default.target`'], answer: 0, why: '`systemctl enable` lit `[Install]` et ajoute un lien dans `multi-user.target.wants/`, donc la target tire `shop`.' },
					{ q: 'Quelle commande seule l’installe et la lance tout de suite ?', options: ['`systemctl start shop`', '`systemctl daemon-reload shop`', '`systemctl link shop`', '`systemctl enable --now shop`'], answer: 3, why: '`enable` crée le lien et recharge la configuration, `--now` démarre l’unité en plus.' },
					{ q: 'Faut-il un `systemctl daemon-reload` avant `enable` pour un nouveau fichier ?', options: ['Oui, sinon `enable` échoue', 'Non : `enable` recharge la configuration du gestionnaire de lui-même', 'Oui, et un redémarrage en plus', 'Seulement si l’unité a un `Wants=`'], answer: 1, why: 'L’indice le dit : `systemctl enable` recharge la configuration du gestionnaire de lui-même.' },
					{ q: 'Que ne fait pas `systemctl start shop` seul ?', options: ['Démarrer PostgreSQL d’abord', 'Lancer `ExecStart=`', 'Faire démarrer `shop` au prochain boot', 'Appliquer la politique de relance'], answer: 2, why: '`start` lance l’unité maintenant. Seul `enable` crée le lien `.wants/` qui la relance au boot.' }
				]
			},
			{
				title: 'Applique un changement plus tard',
				questions: [
					{ q: 'Tu enregistres un nouveau `ExecStart=` pendant que `shop` tourne, sans rien lancer. Que fait le processus en cours ?', options: ['Il continue avec l’ancienne commande', 'Il redémarre avec la nouvelle commande', 'Il s’arrête', 'systemd relit le fichier et le relance sous 5 s'], answer: 0, why: 'Enregistrer un fichier n’envoie rien à systemd ni au processus. Le changement ne s’applique qu’après un rechargement et un redémarrage.' },
					{ q: 'Que lances-tu après la modification ?', options: ['`systemctl reset-failed shop`, puis `systemctl start shop`', '`systemctl enable --now shop` à nouveau', '`systemctl reload shop`', '`systemctl daemon-reload`, puis `systemctl restart shop`'], answer: 3, why: '`daemon-reload` relit tous les fichiers d’unité et reconstruit l’arbre des dépendances. Le redémarrage utilise alors la nouvelle définition.' },
					{ q: 'Quelle commande te dit qu’il manque encore un rechargement ?', options: ['`systemctl is-failed shop`', '`systemctl show shop -p NeedDaemonReload`', '`systemctl list-dependencies shop`', '`systemctl cat shop`'], answer: 1, why: 'Elle affiche `NeedDaemonReload=yes` tant que le fichier sur le disque diffère de ce que systemd a chargé.' },
					{ q: 'Après une rafale de crashs, l’unité est `failed` avec `Start request repeated too quickly.` Qu’est-ce qui la débloque ?', options: ['`systemctl daemon-reload`', '`systemctl restart shop`, tout de suite', '`systemctl reset-failed shop`', '`systemctl enable shop`'], answer: 2, why: '`reset-failed` remet le compteur à zéro. Chaque démarrage compte dans la limite, les manuels aussi.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`app.service` a `Wants=db.service` et ni `After=` ni `Before=`. Tu lances `systemctl start app`. Que se passe-t-il ?',
			options: [
				'systemd démarre `db.service` d’abord et attend qu’il ait fini',
				'systemd démarre les deux unités en même temps, sans délai entre elles',
				'systemd ne démarre que `app.service`, car `Wants=` ne sert qu’au boot',
				'systemd refuse le job tant que tu n’ajoutes pas `Requires=db.service`'
			],
			answer: 1,
			why: 'Les dépendances de besoin décident seulement quelles unités entrent dans la transaction. L’ordre vient de `After=` ou `Before=`. Sans l’un ni l’autre, systemd démarre les deux unités simultanément.'
		},
		{
			q: 'Tu changes `ExecStart=` dans `/etc/systemd/system/app.service` et tu lances `systemctl restart app`. Quelle ligne de commande tourne ?',
			options: [
				'La nouvelle, car `restart` relit d’abord le fichier sur le disque',
				'Aucune : l’unité ne se charge plus tant que tu n’as pas fait `systemctl daemon-reload`',
				'L’ancienne, et systemctl affiche un avertissement qui demande un `daemon-reload`',
				'La nouvelle, mais seulement après le prochain redémarrage de la machine'
			],
			answer: 2,
			why: 'systemd garde l’unité analysée en mémoire. Seul `systemctl daemon-reload` relit les fichiers et reconstruit l’arbre des dépendances, donc `restart` relance la définition qu’il a déjà.'
		},
		{
			q: 'Un service avec `Restart=on-failure` et les réglages par défaut sort avec le statut 1 à chaque démarrage. Que vois-tu au bout d’une seconde ?',
			options: [
				'Il redémarre toutes les 100 ms jusqu’à ce que quelqu’un lance `systemctl stop`',
				'Il redémarre une fois puis reste en échec, car `on-failure` réessaie une fois',
				'Il ne redémarre pas, car le statut 1 compte comme une sortie propre',
				'Après 5 démarrages en 10 secondes, `Start request repeated too quickly.`'
			],
			answer: 3,
			why: '`RestartSec=` vaut 100 ms par défaut, et le gestionnaire accepte 5 démarrages par 10 secondes. Le sixième tombe dans l’intervalle : systemd le refuse et laisse l’unité en échec jusqu’à `systemctl reset-failed` ou la fin de l’intervalle.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Atteindre toi-même la limite de démarrage et le piège du `daemon-reload`, avec des unités utilisateur qui se passent de root.',
		steps: [
			'Crée le dossier des unités utilisateur : `mkdir -p ~/.config/systemd/user`. Crée `~/.config/systemd/user/dojo-crash.service` avec une section `[Service]` qui contient `ExecStart=/bin/sh -c \'echo reading config; exit 1\'` et `Restart=on-failure`.',
			'Charge-la et lance-la : `systemctl --user daemon-reload && systemctl --user start dojo-crash`. Attends deux secondes, puis lance `systemctl --user show dojo-crash -p NRestarts -p ActiveState` et `journalctl --user -u dojo-crash -n 4 --no-pager`.',
			'Corrige la politique : ajoute une section `[Unit]` avec `StartLimitIntervalSec=300` et `StartLimitBurst=10`, et `RestartSec=5` sous `[Service]`. Lance `systemctl --user daemon-reload`, `systemctl --user reset-failed dojo-crash`, relance-la, et relis les deux mêmes valeurs au bout d’environ 12 secondes.',
			'Passe au piège du rechargement : crée `dojo-sleep.service` avec `ExecStart=/bin/sleep 600`, recharge, lance-la. Remplace `600` par `700` dans le fichier, puis lance `systemctl --user restart dojo-sleep` et `systemctl --user show dojo-sleep -p NeedDaemonReload`. Regarde la commande qui tourne avec `ps -o args= -p $(systemctl --user show dojo-sleep -p MainPID --value)`.',
			'Lance `systemctl --user daemon-reload`, redémarre encore et regarde la commande. Fais le ménage : `systemctl --user stop dojo-crash dojo-sleep`, supprime les deux fichiers, `systemctl --user daemon-reload`.'
		],
		done: [
			'Avec les réglages par défaut, `NRestarts=5`, l’unité est `failed`, et les dernières lignes du journal montrent `restart counter is at 5` et `Start request repeated too quickly.`',
			'Avec la correction, au bout de 12 secondes l’unité affiche `ActiveState=activating` et seulement 2 relances.',
			'Le premier `restart` de `dojo-sleep` affiche `Warning: The unit file ... changed on disk`, `NeedDaemonReload=yes`, et `ps` montre toujours `/bin/sleep 600`.',
			'Après `daemon-reload`, `ps` montre `/bin/sleep 700`.'
		],
		solution: [
			'Le `RestartSec=` par défaut de 100 ms brûle les 5 démarrages permis par 10 secondes en bien moins d’une seconde. Le journal montre `restart counter is at 5`, puis le refus.',
			'Avec `RestartSec=5` et 10 démarrages par 300 secondes, l’unité continue d’essayer en `auto-restart` au lieu d’abandonner : le cas d’une base encore en train de démarrer.',
			'Le `dojo-crash.service` corrigé contient : `[Unit]`, `StartLimitIntervalSec=300`, `StartLimitBurst=10`, puis `[Service]`, `ExecStart=...`, `Restart=on-failure`, `RestartSec=5`.',
			'`systemctl --user` parle à ton propre gestionnaire systemd, donc les unités, leurs limites et `daemon-reload` se comportent comme avec le gestionnaire système, sans `sudo`.'
		]
	},
	recall: {
		q: 'Avec les réglages par défaut, combien de démarrages systemd accorde-t-il à un service `Restart=on-failure` qui plante, et quelle ligne termine son journal ?',
		a: '5 démarrages en 10 secondes (`DefaultStartLimitBurst=5`, `DefaultStartLimitIntervalSec=10s`), espacés de 100 ms. Puis `Start request repeated too quickly.`, et l’unité reste en échec jusqu’à `systemctl reset-failed`.'
	},
	sources: [
		{ title: 'systemd.service(5)', url: `${MAN}/systemd.service.html` },
		{ title: 'systemd.unit(5)', url: `${MAN}/systemd.unit.html` },
		{ title: 'systemd-system.conf(5), DefaultStartLimitIntervalSec=', url: `${MAN}/systemd-system.conf.html` },
		{ title: 'systemctl(1)', url: `${MAN}/systemctl.html` },
		{ title: 'moby/moby, contrib/init/systemd/docker.service', url: DOCKER_SERVICE }
	]
};
