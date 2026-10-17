const SYSTEMD = 'https://github.com/systemd/systemd/blob/84b71c1525e792c2ba44670d2171386af8605edd';
const RATE_LIMIT = `${SYSTEMD}/src/journal/journald-rate-limit.c`;
const MANAGER = `${SYSTEMD}/src/journal/journald-manager.c`;
const MAN = 'https://www.freedesktop.org/software/systemd/man/latest';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'journald',
	part: 'Le système en marche',
	title: 'Le journal',
	minutes: 10,
	hook: [
		'À 03:12, la base derrière `app.service` disparaît, et l’app écrit une erreur par requête ratée : 3 000 lignes par seconde. Le lendemain, `journalctl -u app` montre environ 13 secondes d’erreurs, puis un trou d’environ 17 secondes. La ligne suivante vient de journald : `Suppressed N messages from app.service`, avec le nombre à la place de N. Le motif se répète toutes les 30 secondes.',
		'journald jette ces lignes exprès. Par défaut, chaque service peut écrire 10 000 messages par 30 secondes (`RateLimitBurst=10000`, `RateLimitIntervalSec=30s`). journald multiplie ce plafond par un facteur qui grandit avec l’espace disque libre pour le journal : 4 quand il dispose de 4 GB. Ça donne 40 000 lignes, soit environ 13 secondes à 3 000 lignes par seconde.',
		'Sur un portable, `journalctl --disk-usage` affiche `Archived and active journals take up 885.6M in the file system.` Par défaut, le journal peut prendre 10 % de son système de fichiers, plafonné à 4G, et laisse 15 % libres.'
	],
	terms: [
		{ term: 'Journal', def: 'Les fichiers de logs structurés et indexés que `systemd-journald` écrit dans `/var/log/journal/` (gardés d’un boot à l’autre) ou `/run/log/journal/` (perdus au reboot). Chaque entrée est un ensemble de champs comme `MESSAGE=`, `PRIORITY=` et `_SYSTEMD_UNIT=`.' },
		{ term: 'Priorité', def: 'Le niveau syslog d’une entrée, de 0 (`emerg`) à 7 (`debug`), avec 3 pour `err` et 6 pour `info`. `journalctl -p err` montre le niveau 3 et tous les numéros plus petits.' },
		{ term: 'Limite de débit', def: 'Au-delà de `RateLimitBurst=` messages d’un même service pendant `RateLimitIntervalSec=`, les messages sont jetés jusqu’à la fin de l’intervalle. journald note ensuite combien il en a jeté.' },
		{ term: 'SystemMaxUse=', def: 'L’espace disque maximal que peuvent prendre les fichiers du journal dans `/var/log/journal/`. Par défaut 10 % du système de fichiers, plafonné à 4G.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["app.service écrit sur stdout"] -->|"socket de flux"| jd["systemd-journald ajoute _PID=, _SYSTEMD_UNIT=, PRIORITY="]'],
				highlight: ['app', 'jd'],
				note: 'Par défaut, systemd démarre chaque service avec stdout et stderr branchés sur journald. journald découpe le flux à chaque saut de ligne en entrées et ajoute des champs que le processus ne peut pas falsifier, comme `_PID=` et `_SYSTEMD_UNIT=app.service`. Un simple `echo` arrive avec `PRIORITY=6` (info).'
			},
			{
				add: ['jd --> rl{"Limite : sous le plafond pour cette unité et ce groupe de priorité ?"}'],
				highlight: ['rl'],
				note: 'journald tient un compteur par unité, et dedans un par groupe de priorité : erreurs, avertissements et infos ont chacun leur budget. Avec les réglages par défaut et 4 GB libres pour le journal, les 40 000 premiers messages d’un groupe dans une fenêtre de 30 secondes passent.'
			},
			{
				add: ['rl -->|"au-dessus du plafond"| drop["Jeté, compté dans suppressed"]', 'drop -->|"premier message après la fenêtre de 30 s"| note1["Suppressed N messages from app.service"]'],
				highlight: ['drop', 'note1'],
				note: 'journald jette chaque message au-delà du plafond et ajoute 1 au compteur `suppressed`. Quand le message suivant arrive après la fin de la fenêtre, journald écrit d’abord `Suppressed N messages from app.service`, avec le nombre dans un champ `N_DROPPED=`. journald ne garde aucune copie des lignes jetées.'
			},
			{
				add: ['rl -->|"sous le plafond"| file[("/var/log/journal/MACHINE_ID/system.journal")]', 'file -->|"au-delà de SystemMaxUse="| vac["Plus vieux fichiers archivés supprimés"]'],
				highlight: ['file', 'vac'],
				note: 'Les entrées acceptées vont dans le fichier actif `system.journal`. Quand les fichiers atteignent `SystemMaxUse=`, ou laisseraient moins que `SystemKeepFree=`, journald supprime les plus vieux fichiers archivés. Il ne supprime jamais le fichier actif : l’usage peut rester un moment au-dessus de la limite.'
			},
			{
				add: ['file -->|"journalctl -u app -b -1 -p err"| read["Erreurs de app.service du boot précédent"]'],
				highlight: ['read'],
				note: '`journalctl` filtre sur les champs, sans `grep`. `-u app` correspond à `_SYSTEMD_UNIT=app.service`, `-b -1` au `_BOOT_ID=` du boot d’avant, et `-p err` garde les priorités 0 à 3.'
			}
		]
	},
	example: {
		title: 'src/journal/journald-rate-limit.c : le test de débit que journald fait pour chaque message',
		repo: 'systemd/systemd',
		url: `${RATE_LIMIT}#L148-L238`,
		lang: 'c',
		code: `static unsigned burst_modulate(unsigned burst, uint64_t available) {
        unsigned k;

        /* Modulates the burst rate a bit with the amount of available
         * disk space */

        k = log2u64(available);

        /* 1MB */
        if (k <= 20)
                return burst;

        burst = (burst * (k-16)) / 4;
…
int journal_ratelimit_test(
                OrderedHashmap **groups_by_id,
                const char *id,
                usec_t rl_interval,
                unsigned rl_burst,
                int priority,
                uint64_t available) {
…
        if (rl_interval == 0 || rl_burst == 0)
                return 1;

        burst = burst_modulate(rl_burst, available);

        p = &g->pools[priority_map[priority]];

        if (p->begin <= 0) {
                p->suppressed = 0;
                p->num = 1;
                p->begin = ts;
                return 1;
        }

        if (usec_add(p->begin, rl_interval) < ts) {
                unsigned s;

                s = p->suppressed;
                p->suppressed = 0;
                p->num = 1;
                p->begin = ts;

                return 1 + s;
        }

        if (p->num < burst) {
                p->num++;
                return 1;
        }

        p->suppressed++;
        return 0;
}`,
		notes: [
			'La ligne 13 ajuste le plafond selon l’espace libre du journal. Pour 4 GB, `log2u64` donne 32 : le plafond par défaut de 10 000 passe à 10 000 × (32 − 16) / 4 = 40 000. Les lignes 10 et 11 rendent le plafond tel quel sous 2 MB libres (`k <= 20`).',
			'Les lignes 23 et 24 coupent la limite quand `RateLimitIntervalSec=` ou `RateLimitBurst=` vaut 0, comme le dit journald.conf(5). La ligne 28 prend le compteur du groupe de priorité du message : un flot d’infos n’entame pas le budget des erreurs.',
			'Les lignes 37 à 45 tournent quand la fenêtre a expiré : le compteur repart et la fonction renvoie `1 + s`, le nombre de messages jetés plus un. Les lignes 48 à 54 laissent passer un message tant que le compte est sous le plafond, sinon le comptent comme jeté et renvoient 0.',
			'L’[appelant dans journald-manager.c](' + MANAGER + '#L1282-L1298) s’arrête sur 0. Sur une valeur au-dessus de 1, il écrit d’abord `Suppressed %i messages from %s` avec `N_DROPPED=`, puis enregistre le message.'
		]
	},
	tradeoff: {
		gain: [
			'Un service en boucle ne remplit que son propre budget : deux services qui écrivent « do not interfere with each other’s limits » (ne se gênent pas).',
			'Chaque entrée porte `_SYSTEMD_UNIT=`, `_BOOT_ID=` et `PRIORITY=` : `journalctl -u app -b -1 -p err` trouve les erreurs du boot d’avant sans expression régulière.',
			'`SystemMaxUse=` et `SystemKeepFree=` empêchent le journal de remplir le disque, sans tâche logrotate à configurer.'
		],
		cost: [
			'Les lignes au-delà du plafond disparaissent, seul leur nombre reste. Pendant une panne, tu peux perdre justement les lignes qui l’expliquent.',
			'Sur un disque de VM de 40 GB, les réglages par défaut laissent le journal prendre 4G. Le nettoyage ne supprime que des fichiers archivés : l’usage peut rester au-dessus d’une limite plus basse que tu fixes.'
		]
	},
	task: {
		prompt: 'Une VM a un système de fichiers racine de 40 GB. `journalctl --disk-usage` dit que les journaux prennent 3.9G, et l’équipe veut 500M au plus. Explique les 3.9G, donne le changement de config et la commande qui libère la place tout de suite. Écris ensuite la commande qui montre seulement les erreurs de `nginx.service` du boot d’avant.',
		hint: 'Calcule 10 % de 40 GB et compare avec le plafond de 4G. Les changements locaux vont dans un drop-in sous `/etc/systemd/journald.conf.d/`.',
		answer: [
			'10 % de 40 GB font 4 GB, ce qui est aussi le plafond : le journal a droit à 4G. Avec 3.9G, il reste dans ce que ses valeurs par défaut autorisent.',
			'Crée `/etc/systemd/journald.conf.d/60-size.conf` avec `[Journal]` et `SystemMaxUse=500M`, puis lance `systemctl restart systemd-journald`. La page de journald dit que ce redémarrage est sans risque : les flux de logs des services y survivent.',
			'`journalctl --vacuum-size=500M` supprime les plus vieux fichiers archivés jusqu’à passer sous 500M. Le fichier actif n’est pas touché, donc `--disk-usage` peut rester un peu au-dessus.',
			'Erreurs du boot d’avant : `journalctl -u nginx -b -1 -p err`. Il faut un stockage persistant dans `/var/log/journal/` : avec seulement `/run/log/journal/`, les boots précédents sont perdus.'
		]
	},
	quiz: [
		{
			q: 'Un service écrit 100 000 lignes en 10 secondes. Le journal a 2 GB libres et la limite de débit par défaut. Qu’arrive-t-il dans le journal ?',
			options: [
				'Les 100 000 lignes, car la limite ne touche que les messages du noyau',
				'Les 37 500 premières lignes, et plus tard une ligne avec le nombre jeté',
				'Les 10 000 dernières lignes, car les plus anciennes partent en premier',
				'Rien de ce service tant que la fenêtre de 30 secondes n’est pas finie'
			],
			answer: 1,
			why: 'Pour 2 GB, `log2u64` donne 31 : le plafond vaut 10 000 × (31 − 16) / 4 = 37 500. Les 37 500 premiers messages passent, les 62 500 autres sont comptés et jetés, et le premier message après la fenêtre arrive avec `Suppressed N messages`.'
		},
		{
			q: 'Quelle commande montre seulement les erreurs de `ssh.service` du boot d’avant ?',
			options: [
				'`journalctl -u ssh -b -p err`',
				'`journalctl -u ssh -b 1 -p 3..7`',
				'`journalctl -u ssh -b -1 -p err`',
				'`journalctl -u ssh --since -1 -p 3`'
			],
			answer: 2,
			why: '`-b -1` désigne l’avant-dernier boot du journal, alors que `-b` seul désigne le boot en cours et `-b 1` le premier enregistré. `-p err` montre la priorité 3 et tout ce qui est plus important, de 0 à 3. `-p 3..7` ajouterait avertissements, notices, infos et debug.'
		},
		{
			q: '`SystemMaxUse=` vaut 500M. Tu lances `journalctl --vacuum-size=500M`, et `--disk-usage` affiche encore 540M. Pourquoi ?',
			options: [
				'Le nettoyage ne supprime que des fichiers archivés, et le journal actif n’en est pas un',
				'La nouvelle limite demande un reboot avant que le nettoyage puisse s’en servir',
				'`--disk-usage` compte deux fois les fichiers de `/run/log/journal/`',
				'journald garde une réserve de 15 % que le nettoyage ne touche jamais'
			],
			answer: 0,
			why: 'Le nettoyage retire les plus vieux fichiers archivés jusqu’à ce qu’ils passent sous la taille. `--disk-usage` compte en plus les fichiers actifs, jamais supprimés. journalctl(1) dit que le nettoyage n’a qu’un « indirect effect » sur ce chiffre.'
		}
	],
	recall: {
		q: 'Avec les réglages par défaut, combien de messages un service peut-il écrire dans le journal par 30 secondes quand le journal a 4 GB libres, et quelle ligne signale ceux qui ont été jetés ?',
		a: '10 000 × 4 = 40 000, à partir de `RateLimitBurst=10000` ajusté selon l’espace libre. Le premier message après la fenêtre est précédé de `Suppressed N messages from app.service`.'
	},
	sources: [
		{ title: 'journald.conf(5)', url: `${MAN}/journald.conf.html` },
		{ title: 'journalctl(1)', url: `${MAN}/journalctl.html` },
		{ title: 'systemd-journald.service(8)', url: `${MAN}/systemd-journald.service.html` },
		{ title: 'systemd.exec(5), LogRateLimitIntervalSec=', url: `${MAN}/systemd.exec.html` },
		{ title: 'systemd source, src/journal/journald-manager.c', url: MANAGER }
	]
};
