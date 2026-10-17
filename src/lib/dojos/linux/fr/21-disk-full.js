const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const BALLOC = `${LINUX}/fs/ext4/balloc.c`;
const SUPER = `${LINUX}/fs/ext4/super.c`;
const MAN = 'https://man7.org/linux/man-pages';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'disk-full',
	part: 'Fichiers et disques',
	title: 'Un disque plein qui a encore de la place',
	minutes: 10,
	hook: [
		'Un processus garde ouvert en écriture un fichier de 500 MB sur `/dev/shm`. Tu lances `rm big.log`. `ls` ne trouve plus le fichier et `du -sh /dev/shm` affiche `248K`, mais `df -h` affiche toujours `501M` utilisés. Ces lignes viennent d’un essai fait pour ce chapitre sous Linux 6.17.',
		'La page unlink(2) donne la raison : « If the name was the last link to a file but any processes still have the file open, the file will remain in existence until the last file descriptor referring to it is closed. » (le fichier existe tant qu’un descripteur ouvert pointe dessus). `rm` a retiré le nom. **Les blocs restent occupés jusqu’à ce que le processus ferme le fichier.**',
		'Deux autres cas affichent `No space left on device` alors qu’il reste de la place en apparence : le système de fichiers n’a plus d’inodes, ou il ne reste que la part réservée à root. Sur le même portable, `df` sur une racine ext4 de 934 GB affiche `568G` utilisés et `319G` disponibles. Les 47 GB d’écart correspondent à la réserve par défaut de 5 %.'
	],
	terms: [
		{ term: 'ENOSPC', def: 'Le code d’erreur qu’un appel système renvoie quand le périphérique n’a plus de place. Son message est `No space left on device`. `write` le renvoie quand il manque des blocs, `open` quand il ne peut pas créer un nouveau fichier.' },
		{ term: 'Compteur de liens', def: 'Le nombre d’entrées de répertoire (de noms) qui pointent vers un inode. `rm` le baisse de un. Le noyau libère l’inode et ses blocs quand le compteur vaut 0 et qu’aucun processus n’a le fichier ouvert.' },
		{ term: 'Blocs réservés', def: 'Une part d’un système de fichiers ext4 que seul root (ou l’utilisateur et le groupe fixés par `tune2fs -u` et `-g`) peut allouer. `mke2fs` la fixe à 5 % par défaut.' },
		{ term: 'Inode', def: 'L’enregistrement qui porte les métadonnées d’un fichier : son propriétaire, son mode, son compteur de liens. ext4 en crée un nombre fixe au moment du `mke2fs`, donc un disque peut manquer d’inodes avec des gigaoctets encore libres.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["L’appli appelle write() ou open()"] --> err["Le noyau renvoie ENOSPC : No space left on device"]'],
				highlight: ['app', 'err'],
				note: 'write(2) renvoie `ENOSPC` quand « The device containing the file referred to by fd has no room for the data ». open(2) le renvoie quand il faut créer un fichier et que le périphérique « has no room for the new file ». Le message est le même dans les deux cas. Les trois étapes suivantes séparent les causes avec `df -h`, `du` et `df -i`.'
			},
			{
				add: ['err --> held["df dit plein, du trouve beaucoup moins"]', 'held -->|"lsof +L1"| fd["Un processus garde ouvert un fichier supprimé"]'],
				highlight: ['held', 'fd'],
				note: '`df` demande au système de fichiers combien de blocs sont utilisés, `du` parcourt l’arbre des répertoires. Un fichier supprimé mais encore ouvert n’a plus de nom, donc `du` ne le voit pas. D’après lsof(8), `+L1` sert à « select open files that have been unlinked ». Dans l’essai, lsof a affiché `sleep 4049392 lea 3w REG 0,28 524288000 0 3835 /dev/shm/big.log (deleted)` : 524 288 000 octets, compteur de liens à 0.'
			},
			{
				add: ['err --> rsv["df affiche Avail 0 et Use 100 %, mais Size moins Used fait 5 %"]', 'rsv --> root["Seul root ou CAP_SYS_RESOURCE peut puiser dans la réserve"]'],
				highlight: ['rsv', 'root'],
				note: 'ext4 retire la réserve de la colonne `Avail` : il annonce les blocs libres moins les blocs réservés. Un processus qui tourne sous `postgres` ou `www-data` reçoit `ENOSPC` quand ce nombre tombe à 0. Un processus root peut encore écrire dans les 5 %. tune2fs(8) garde cette réserve « to allow system daemons, such as syslogd(8), to continue to function correctly after non-privileged processes are prevented from writing to the file system » (pour que les démons système continuent d’écrire).'
			},
			{
				add: ['err --> ino["df -h montre de la place, df -i montre IUse 100 %"]', 'ino --> fixed["Nombre d’inodes fixé au mke2fs"]'],
				highlight: ['ino', 'fixed'],
				note: 'Chaque fichier et chaque répertoire prend un inode. `mke2fs` crée un inode tous les `inode_ratio` octets, 16384 par défaut dans `/etc/mke2fs.conf`. La racine de 1 TB du portable de test a 62 251 008 inodes, un pour 16 KiB. Des millions de petits fichiers (un cache, une file de mails, des fichiers de session) les épuisent avant les blocs. mke2fs(8) prévient : « it is not possible to change this ratio on a file system after it is created ».'
			},
			{
				add: ['fd --> fix1["Redémarrer ou signaler le processus pour rouvrir son log, ou tronquer /proc/PID/fd/N"]', 'root --> fix2["Libérer de la place, ou baisser la réserve avec tune2fs -m"]', 'fixed --> fix3["Supprimer des petits fichiers, ou recréer avec mke2fs -i ou -N"]'],
				highlight: ['fix1', 'fix2', 'fix3'],
				note: 'Dans l’essai, `: > /proc/4049392/fd/3` a ramené le fichier supprimé à 0 octet, et `df` est passé de `501M` à `248K` utilisés, processus toujours en vie. L’option `copytruncate` de logrotate tronque le log sur place pour un programme qui « cannot be told to close its logfile ». `tune2fs -m 1` garde 1 % au lieu de 5 % sur un disque de données.'
			}
		]
	},
	example: {
		title: 'fs/ext4/balloc.c : qui a le droit d’allouer les blocs réservés',
		repo: 'torvalds/linux',
		url: `${BALLOC}#L620-L676`,
		lang: 'c',
		code: `static int ext4_has_free_clusters(struct ext4_sb_info *sbi,
				  s64 nclusters, unsigned int flags)
{
	s64 free_clusters, dirty_clusters, rsv, resv_clusters;
	struct percpu_counter *fcc = &sbi->s_freeclusters_counter;
	struct percpu_counter *dcc = &sbi->s_dirtyclusters_counter;

	free_clusters  = percpu_counter_read_positive(fcc);
	dirty_clusters = percpu_counter_read_positive(dcc);
	resv_clusters = atomic64_read(&sbi->s_resv_clusters);

	/*
	 * r_blocks_count should always be multiple of the cluster ratio so
	 * we are safe to do a plane bit shift only.
	 */
	rsv = (ext4_r_blocks_count(sbi->s_es) >> sbi->s_cluster_bits) +
	      resv_clusters;
…
	/* Check whether we have space after accounting for current
	 * dirty clusters & root reserved clusters.
	 */
	if (free_clusters >= (rsv + nclusters + dirty_clusters))
		return 1;

	/* Hm, nope.  Are (enough) root reserved clusters available? */
	if (uid_eq(sbi->s_resuid, current_fsuid()) ||
	    (!gid_eq(sbi->s_resgid, GLOBAL_ROOT_GID) && in_group_p(sbi->s_resgid)) ||
	    capable(CAP_SYS_RESOURCE) ||
	    (flags & EXT4_MB_USE_ROOT_BLOCKS)) {

		if (free_clusters >= (nclusters + dirty_clusters +
				      resv_clusters))
			return 1;
	}
	/* No free blocks. Let's see if we can dip into reserved pool */
	if (flags & EXT4_MB_USE_RESERVED) {
		if (free_clusters >= (nclusters + dirty_clusters))
			return 1;
	}

	return 0;
}
…
int ext4_claim_free_clusters(struct ext4_sb_info *sbi,
			     s64 nclusters, unsigned int flags)
{
	if (ext4_has_free_clusters(sbi, nclusters, flags)) {
		percpu_counter_add(&sbi->s_dirtyclusters_counter, nclusters);
		return 0;
	} else
		return -ENOSPC;
}`,
		notes: [
			'La ligne 16 calcule `rsv` : le nombre de blocs réservés lu dans le superbloc (celui que fixent `tune2fs -m` ou `-r`), plus `s_resv_clusters`. La doc ext4 du noyau fixe cette seconde réserve à « 2% or 4096 clusters, whichever is smaller » (le plus petit des deux). Sans l’option `bigalloc`, un cluster est un bloc.',
			'La ligne 22 traite le cas normal : il reste assez de clusters libres une fois retirés la réserve et les clusters déjà promis aux pages sales. Sinon, les lignes 26 à 29 n’ouvrent la réserve qu’à l’UID de réserve (root par défaut), à un membre du groupe fixé par `tune2fs -g`, à un processus qui a `CAP_SYS_RESOURCE`, ou à un appel du noyau qui passe `EXT4_MB_USE_ROOT_BLOCKS`.',
			'La ligne 51 est l’endroit où le disque plein remonte vers l’espace utilisateur : `ext4_claim_free_clusters` renvoie `-ENOSPC`, et l’appel `write` échoue avec `No space left on device`.',
			'`df` lit sa colonne `Avail` dans le champ `f_bavail` de statfs(2), « Free blocks available to unprivileged user ». Dans [`ext4_statfs`](' + SUPER + '#L6815-L6818), ext4 y met les blocs libres moins la réserve, et 0 quand il ne reste que la réserve.'
		]
	},
	tradeoff: {
		gain: [
			'Les démons root continuent d’écrire leurs logs après qu’un processus non privilégié a rempli le disque : tu peux encore te connecter et lire ce qui s’est passé.',
			'Un fichier supprimé reste lisible pour les processus qui l’ont ouvert : un programme dont on remplace le binaire ou le log continue de tourner.',
			'`df -i` donne une alerte à part : l’usage des inodes est un chiffre que tu peux surveiller, comme l’usage des blocs.'
		],
		cost: [
			'5 % d’un disque de données de 1 TB, c’est environ 50 GB qu’une base qui tourne sous un utilisateur non root ne pourra jamais utiliser.',
			'La place prise par un fichier supprimé encore ouvert n’apparaît ni dans `du` ni dans `ls`. Il faut `lsof +L1` ou un tour dans `/proc/<pid>/fd` pour la trouver.',
			'Le nombre d’inodes d’ext4 est fixé à la création. Un système de fichiers rempli de petits fichiers doit être recréé avec un ratio `-i` plus petit, ou il faut déplacer les fichiers.'
		]
	},
	task: {
		prompt: 'Reproduis l’accroche sans être root, sur `/dev/shm` : crée un fichier de 500 MB, garde-le ouvert en arrière-plan avec `(exec 3>>/dev/shm/big.log; sleep 300) &`, puis supprime-le. Regarde `du -sh /dev/shm` et `df -h /dev/shm`. Retrouve le fichier avec `lsof +L1` et rends la place sans tuer le processus.',
		hint: '`head -c 500M /dev/zero > /dev/shm/big.log` crée le fichier. lsof affiche le PID et le descripteur (`3w`). Le fichier reste joignable par `/proc/<pid>/fd/3`.',
		answer: [
			'Après `rm`, `du -sh /dev/shm` affiche `248K` et `df -h /dev/shm` affiche toujours `501M` utilisés : le nom a disparu, l’inode et ses blocs sont toujours là.',
			'`lsof +L1` affiche une ligne qui finit par `/dev/shm/big.log (deleted)`, avec SIZE `524288000`, NLINK `0` et FD `3w` (descripteur 3, ouvert en écriture). La colonne COMMAND dit `sleep`, qui a hérité du descripteur 3 du sous-shell.',
			'`: > /proc/<pid>/fd/3` tronque le fichier à travers le descripteur ouvert. `df -h` redescend à `248K` utilisés alors que `sleep` tourne encore, et lsof affiche maintenant SIZE `0`.',
			'Sur un vrai serveur, c’est souvent un démon dont quelqu’un a supprimé le log à la main. Le redémarrer, ou lui envoyer le signal qui lui fait rouvrir ses logs, ferme l’ancien descripteur et libère les blocs.'
		]
	},
	quiz: [
		{
			q: 'Tu supprimes un log de 20 GB dans lequel nginx écrit encore. `df` montre toujours le disque plein. Qu’est-ce qui libère la place ?',
			options: [
				'Lancer `sync` pour que la suppression quitte le cache de pages',
				'Faire fermer le fichier à nginx, en rouvrant ses logs ou en le redémarrant',
				'Lancer `fsck` sur le système de fichiers pour récupérer les blocs orphelins',
				'Supprimer les vieux logs `.gz` à côté pour faire de la place'
			],
			answer: 1,
			why: 'unlink retire le nom, mais l’inode et ses blocs vivent jusqu’à la fermeture du dernier descripteur ouvert. nginx en garde un, donc la place ne revient que quand il ferme le fichier.'
		},
		{
			q: 'Une appli qui tourne sous l’utilisateur `app` reçoit `No space left on device`. `df -h` affiche Size 1.0T, Used 950G, Avail 0, Use 100 %. Pourquoi ne peut-elle pas utiliser les 50 derniers GB ?',
			options: [
				'Le journal prend les 5 % restants et df ne le montre jamais',
				'Le disque n’a plus d’inodes, ce que df -h affiche comme Avail 0',
				'ext4 garde environ 5 % pour root, et Avail ne compte pas ces blocs',
				'Le cache de pages garde 50 GB de données sales pas encore écrites'
			],
			answer: 2,
			why: 'ext4 annonce `f_bavail` comme les blocs libres moins les blocs réservés. `ext4_has_free_clusters` ne laisse allouer dans la réserve que l’UID ou le GID de réserve, ou un processus qui a `CAP_SYS_RESOURCE`.'
		},
		{
			q: '`df -h /var` montre 40 % utilisés, mais `touch /var/spool/x` échoue avec `No space left on device`. Quelle commande confirme la cause ?',
			options: [
				'`df -i /var`, pour voir si tous les inodes sont pris',
				'`du -sh /var`, pour comparer avec ce que dit df',
				'`lsof +L1 /var`, pour trouver les fichiers supprimés encore ouverts',
				'`tune2fs -m 0`, pour libérer les blocs réservés'
			],
			answer: 0,
			why: 'Créer un fichier demande un inode libre, et open(2) renvoie ENOSPC quand le périphérique « has no room for the new file ». Avec 60 % des blocs libres, ni un fichier supprimé ouvert ni la réserve ne l’expliquent. `df -i` montre IUse 100 %.'
		}
	],
	recall: {
		q: 'Tu as supprimé un gros log, `du` trouve bien moins que `df`, et le disque reste plein. Où est la place, et quelle commande la retrouve ?',
		a: 'Un processus garde le fichier supprimé ouvert, donc ses blocs restent pris jusqu’à la fermeture du dernier descripteur. `lsof +L1` liste les fichiers ouverts dont le compteur de liens vaut 0, marqués `(deleted)`.'
	},
	sources: [
		{ title: 'unlink(2), page de manuel Linux', url: `${MAN}/man2/unlink.2.html` },
		{ title: 'lsof(8), page de manuel Linux', url: `${MAN}/man8/lsof.8.html` },
		{ title: 'tune2fs(8), page de manuel Linux', url: `${MAN}/man8/tune2fs.8.html` },
		{ title: 'mke2fs(8), page de manuel Linux', url: `${MAN}/man8/mke2fs.8.html` },
		{ title: 'statfs(2), page de manuel Linux', url: `${MAN}/man2/statfs.2.html` },
		{ title: 'logrotate(8), page de manuel Linux', url: `${MAN}/man8/logrotate.8.html` },
		{ title: 'Linux v6.12, Documentation/admin-guide/ext4.rst', url: `${LINUX}/Documentation/admin-guide/ext4.rst` }
	]
};
