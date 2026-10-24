const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const IALLOC = `${LINUX}/fs/ext4/ialloc.c`;
const NAMEI = `${LINUX}/fs/ext4/namei.c`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'inodes',
	part: 'Fichiers et disques',
	title: 'Inodes et liens',
	minutes: 10,
	hook: [
		'Juin 2026, ticket Rancher #55479. Une installation de Rancher dans Docker ne démarre plus, une nuit après l’autre. Le démon Docker écrit `mkdir /var/lib/docker/tmp: no space left on device`, alors que `df -h` montre de la place libre.',
		'`df -i /var/lib/docker` affiche un `IUse%` de 100. Un seul répertoire contient 169 582 fichiers socket, et k3s a gardé des années de dossiers `tls-*`. Chaque fichier et chaque dossier occupe un inode, et le système de fichiers n’en a plus.',
		'L’auteur du ticket supprime les vieux dossiers `tls-*` : l’usage des inodes tombe de 100 % à 32 %, et 6 GB de données partent avec. **Le disque refusait de nouveaux fichiers alors qu’il avait encore la place pour leurs octets.**'
	],
	terms: [
		{ term: 'Inode', def: 'La fiche qu’un système de fichiers garde pour un fichier : type et mode, propriétaire, taille, dates, nombre de liens et emplacement des blocs de données. Elle porte un numéro, et son nom est rangé ailleurs, dans le répertoire.' },
		{ term: 'Entrée de répertoire', def: 'Une ligne d’un répertoire qui associe un nom à un numéro d’inode. `ls -i` affiche ce numéro à côté du nom.' },
		{ term: 'Lien physique', def: 'Une deuxième entrée de répertoire avec le même numéro d’inode que la première. Le nombre de liens de l’inode augmente de un.' },
		{ term: 'Lien symbolique', def: 'Un fichier à part, avec son propre inode, dont le contenu est un chemin. Le noyau suit ce chemin quand tu ouvres le lien.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['touch["echo hello > report.txt"] -->|"bit libre dans une bitmap d’inodes"| ino["Inode 55646733 : mode 0664, uid 1000, taille 6, liens 1"]', 'dir["Entrée de répertoire : report.txt vers 55646733"] --> ino'],
				highlight: ['touch', 'ino', 'dir'],
				note: 'ext4 prend un inode libre dans un groupe de blocs et y écrit les métadonnées. Selon la doc ext4, l’inode "stores all the metadata pertaining to the file", et le nom se trouve dans l’entrée de répertoire. Le nom `report.txt` vit dans le répertoire parent, à côté du numéro 55646733.'
			},
			{
				add: ['hard["ln report.txt copy.txt"] -->|"même numéro, liens 2"| ino'],
				highlight: ['hard'],
				note: 'link(2) ajoute une entrée de répertoire sans allouer d’inode. `ls -li` affiche alors 55646733 pour les deux noms, avec 2 liens. link(2) : "it is impossible to tell which name was the \'original\'", aucun des deux noms n’est l’original.'
			},
			{
				add: ['soft["ln -s report.txt link.txt"] --> sino["Inode 55646734 : symlink, taille 10, contenu report.txt"]', 'sino -.->|"résolution du chemin à l’ouverture"| dir'],
				highlight: ['soft', 'sino'],
				note: 'Un lien symbolique a son propre inode, ici 55646734. inode(7) : la taille d’un symlink "is the length of the pathname it contains", et `report.txt` fait 10 octets. Le lien stocke un nom : il peut donc changer de système de fichiers et viser un répertoire.'
			},
			{
				add: ['rm["rm report.txt"] -->|"liens 2 à 1"| ino', 'rm -.->|"nom disparu : lien cassé"| sino'],
				highlight: ['rm'],
				note: 'unlink(2) retire un nom et fait passer le nombre de liens à 1. `cat copy.txt` affiche toujours `hello`. `cat link.txt` échoue avec `No such file or directory`, car le chemin qu’il contient n’existe plus.'
			},
			{
				add: ['last["rm copy.txt, aucun processus ne l’a ouvert"] -->|"liens 0 : inode et blocs libérés"| free["Inode rendu à la bitmap"]'],
				highlight: ['last', 'free'],
				note: 'unlink(2) : "If that name was the last link to a file and no processes have the file open, the file is deleted and the space it was using is made available for reuse." C’est seulement à ce moment que `df -i` montre un inode libre de plus.'
			},
			{
				add: ['full["IFree = 0 dans tous les groupes de blocs"] -->|"open(O_CREAT), mkdir, bind d’un socket"| err["ENOSPC : No space left on device"]'],
				highlight: ['full', 'err'],
				note: 'Par défaut, mke2fs crée un inode pour 16384 octets de disque, et ce nombre est figé au formatage. Quand tous les inodes sont pris, tout appel qui crée un fichier échoue avec `ENOSPC`, quoi que dise `df -h` sur les blocs.'
			}
		]
	},
	example: {
		title: 'fs/ext4/ialloc.c : __ext4_new_inode, la recherche d’un inode libre dans les groupes de blocs',
		repo: 'torvalds/linux',
		url: `${IALLOC}#L1019-L1118`,
		lang: 'c',
		code: `got_group:
	EXT4_I(dir)->i_last_alloc_group = group;
	err = -ENOSPC;
	if (ret2 == -1)
		goto out;

	/*
	 * Normally we will only go through one pass of this loop,
	 * unless we get unlucky and it turns out the group we selected
	 * had its last inode grabbed by someone else.
	 */
	for (i = 0; i < ngroups; i++, ino = 0) {
		err = -EIO;

		gdp = ext4_get_group_desc(sb, group, &group_desc_bh);
		if (!gdp)
			goto out;

		/*
		 * Check free inodes count before loading bitmap.
		 */
		if (ext4_free_inodes_count(sb, gdp) == 0)
			goto next_group;
…
		ret2 = find_inode_bit(sb, group, inode_bitmap_bh, &ino);
		if (!ret2)
			goto next_group;
…
		ino++;		/* the inode bitmap is zero-based */
		if (!ret2)
			goto got; /* we grabbed the inode! */

next_group:
		if (++group == ngroups)
			group = 0;
	}
	err = -ENOSPC;
	goto out;`,
		notes: [
			'La ligne 12 parcourt tous les groupes de blocs du système de fichiers, en partant du groupe choisi par l’allocateur. La ligne 22 lit le nombre d’inodes libres dans le descripteur du groupe et saute le groupe s’il vaut 0, sans charger de bitmap.',
			'La ligne 25 cherche un bit à zéro dans la bitmap d’inodes du groupe. Un bit à zéro, c’est une case libre dans la table d’inodes de ce groupe, et la ligne 31 saute à `got` pour la prendre.',
			'Les lignes 37 et 38 s’exécutent quand aucun groupe n’a d’inode libre. Elles renvoient `-ENOSPC`, que errno(3) nomme "No space left on device". Cette boucle ne regarde jamais les blocs de données libres : les octets libres de `df -h` n’y changent rien.',
			'Un lien physique ne passe jamais par ce code. [`__ext4_link`](' + NAMEI + '#L3453-L3488) augmente le nombre de liens avec `ext4_inc_count` et ajoute une entrée de répertoire avec `ext4_add_entry`, sur l’inode qui existe déjà.'
		]
	},
	tradeoff: {
		gain: [
			'ext4 retrouve un inode à partir de son seul numéro : le groupe vaut `(inode_number - 1) / s_inodes_per_group`, et la position dans la table du groupe est le reste de cette division.',
			'Le ratio par défaut donne assez d’inodes pour des fichiers ordinaires. Sur un système de fichiers racine de 934 GB, `df -i` affiche 62 251 008 inodes dont 31 % utilisés, à peu près un par 16 Kio.',
			'Un lien physique coûte une entrée de répertoire et aucun inode, et les données restent accessibles jusqu’à la suppression du dernier nom.'
		],
		cost: [
			'mke2fs(8) : "it is not possible to change this ratio on a file system after it is created". Des millions de petits fichiers, comme les 169 582 sockets du ticket Rancher, peuvent épuiser les inodes avant les blocs.',
			'Un inode ext4 occupe 256 octets par défaut : les tables d’inodes prennent 256 / 16384, environ 1,6 % du disque, qu’elles servent ou non.',
			'Un lien physique reste dans un seul système de fichiers (sinon `EXDEV`) et ne peut pas viser un répertoire. Un lien symbolique fait les deux, mais il casse quand sa cible est renommée ou supprimée.'
		]
	},
	task: {
		prompt: 'Dans un répertoire vide sur ext4, lance `echo hello > report.txt`, `ln report.txt copy.txt`, `ln -s report.txt link.txt`, puis `ls -li`. Avant de regarder, devine les numéros d’inode, les nombres de liens et la taille de `link.txt`. Lance ensuite `rm report.txt` et devine ce qu’affichent `cat copy.txt` et `cat link.txt`. Pour finir, lance `df -i .` et dis combien de fichiers ce système de fichiers peut encore accueillir.',
		hint: 'Compte les inodes : quelles commandes en créent un nouveau ? La taille d’un symlink est la longueur du chemin qu’il stocke.',
		answer: [
			'Sortie relevée sur un portable en ext4 pour ce chapitre : `55646733 -rw-rw-r-- 2 ... 6 copy.txt`, `55646734 lrwxrwxrwx 1 ... 10 link.txt -> report.txt`, `55646733 -rw-rw-r-- 2 ... 6 report.txt`. Deux noms partagent l’inode 55646733 avec 2 liens. Le symlink a son propre inode et une taille de 10, la longueur de `report.txt`.',
			'Après `rm report.txt`, `copy.txt` n’a plus qu’un lien et `cat copy.txt` affiche `hello`. `cat link.txt` affiche `No such file or directory` : le symlink existe encore, le nom qu’il vise n’existe plus.',
			'`df -i .` a affiché `62251008` inodes, `18931731` utilisés, `43319277` libres, `31%`. Ce système de fichiers peut encore prendre environ 43 millions de fichiers, répertoires, symlinks ou sockets, quels que soient les octets libres.'
		],
		steps: [
			{
				title: 'Compte les inodes',
				questions: [
					{ q: 'Lesquelles des trois commandes allouent un nouvel inode ?', options: ['Les trois', '`echo` et `ln -s`', 'Seulement `echo`', '`echo` et `ln`'], answer: 1, why: '`echo > report.txt` crée un fichier. `ln -s` crée un symlink, un fichier à part avec son propre inode. `ln` ajoute seulement une entrée de répertoire.' },
					{ q: 'Quel numéro d’inode `copy.txt` va-t-il afficher ?', options: ['Le même que `report.txt`', 'Le prochain numéro libre', 'Le même que `link.txt`', 'Aucun : un lien physique n’a pas d’inode'], answer: 0, why: 'Un lien physique est une deuxième entrée de répertoire avec le même numéro d’inode que la première.' },
					{ q: 'Où est stocké le nom `report.txt` ?', options: ['Dans l’inode', 'Dans les blocs de données du fichier', 'Dans le répertoire parent, à côté du numéro d’inode', 'Dans la bitmap des inodes'], answer: 2, why: 'L’inode a un numéro et pas de nom. L’entrée de répertoire relie le nom à ce numéro.' },
					{ q: 'Après `ln`, lequel des deux noms est l’original ?', options: ['`report.txt`, parce qu’il est venu en premier', '`copy.txt`, parce qu’il est plus récent', 'Celui qui a le moins de liens', 'Aucun : les deux entrées visent le même inode'], answer: 3, why: 'link(2) : "it is impossible to tell which name was the \'original\'."' }
				]
			},
			{
				title: 'Devine les compteurs',
				questions: [
					{ q: 'Quel nombre de liens `ls -li` affiche-t-il pour `report.txt` et `copy.txt` ?', options: ['1 chacun', '2 chacun', '3 chacun', '2 pour `report.txt`, 1 pour `copy.txt`'], answer: 1, why: 'Les deux noms partagent un inode, et `ln` a monté de un le nombre de liens de cet inode.' },
					{ q: 'Le symlink monte-t-il le nombre de liens de `report.txt` ?', options: ['Oui, de un', 'Oui, de deux', 'Non : il a son propre inode et stocke un chemin', 'Seulement tant qu’il est ouvert'], answer: 2, why: 'Un symlink est un fichier à part. Il contient une chaîne de chemin et ne touche jamais au nombre de liens de sa cible.' },
					{ q: 'Quelle taille `ls -l` affiche-t-il pour `link.txt` ?', options: ['6, la taille de la cible', '0', '4096, un bloc', '10, la longueur de `report.txt`'], answer: 3, why: 'inode(7) : la taille d’un symlink "is the length of the pathname it contains". `report.txt` fait 10 octets.' },
					{ q: 'Quelle taille affichent `report.txt` et `copy.txt` ?', options: ['6 chacun : `hello` et un saut de ligne', '12 : 6 pour chaque nom', '6 pour l’un, 0 pour l’autre', '10 chacun'], answer: 0, why: 'C’est le même inode, donc les mêmes 6 octets. Deux noms ne doublent pas les données.' }
				]
			},
			{
				title: 'Devine le rm',
				questions: [
					{ q: 'Après `rm report.txt`, quel numéro d’inode `ls -li` affiche-t-il pour `copy.txt` ?', options: ['Un nouveau numéro', '0', 'Le même qu’avant', 'Aucun : l’inode est passé à `link.txt`'], answer: 2, why: '`rm` retire une entrée de répertoire. L’inode ne bouge pas, et `copy.txt` pointe toujours dessus.' },
					{ q: 'Qu’affiche `cat copy.txt` ?', options: ['`hello`', 'Rien : le fichier est vide', '`No such file or directory`', 'Des octets au hasard venus de blocs libérés'], answer: 0, why: 'L’inode a encore un lien, ses blocs sont donc toujours là.' },
					{ q: 'Qu’affiche `cat link.txt` ?', options: ['`hello`, en passant par `copy.txt`', 'Une ligne vide', '`Permission denied`', '`No such file or directory`'], answer: 3, why: 'Le symlink existe encore, mais le chemin qu’il contient, `report.txt`, n’existe plus. Il pointe dans le vide.' },
					{ q: 'Quand l’inode revient-il dans la bitmap ?', options: ['Maintenant : un nom a disparu', 'Quand le nombre de liens atteint 0 et qu’aucun processus n’a le fichier ouvert', 'Au prochain redémarrage', 'Quand `fsck` passe'], answer: 1, why: 'unlink(2) : le fichier n’est supprimé que quand le dernier lien a disparu et qu’aucun processus ne l’a ouvert.' }
				]
			},
			{
				title: 'Lis df -i',
				questions: [
					{ q: '`df -i .` affiche `62251008` inodes, `18931731` utilisés. Combien de fichiers tiennent encore, environ ?', options: ['Environ 18 millions', 'Environ 62 millions', 'Environ 43 millions', 'Ça dépend des octets libres'], answer: 2, why: '62251008 − 18931731 = 43319277 inodes libres, un par nouveau fichier.' },
					{ q: 'Lequel de ces éléments consomme aussi un de ces inodes ?', options: ['Un nouveau répertoire, symlink ou socket', 'Un nouveau lien physique', 'Écrire plus d’octets dans un fichier existant', 'Lire un fichier'], answer: 0, why: 'Chaque fichier, répertoire, symlink et socket demande un inode. Un lien physique en réutilise un.' },
					{ q: 'Avec 18931731 utilisés sur 62251008, qu’affiche à peu près la colonne `IUse%` ?', options: ['Environ 43 %', 'Environ 69 %', '100 %', 'Environ 30 %'], answer: 3, why: '18931731 / 62251008 donne environ 0,30. Les 43 millions sont le nombre de libres, pas un pourcentage.' },
					{ q: 'Un jour, `IUse%` atteint 100. Qu’est-ce qui libère des inodes sur ce système ?', options: ['Vider les gros fichiers à zéro octet', 'Supprimer les fichiers et répertoires dont tu n’as plus besoin', 'Monter `ulimit -n`', 'Lancer `sync`'], answer: 1, why: 'Chaque fichier supprimé rend son inode dès que plus rien ne l’a ouvert. Dans le rapport Rancher, supprimer les vieux dossiers `tls-*` a fait passer l’usage des inodes de 100 % à 32 %. Un fichier vidé garde son inode.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`touch /data/x` échoue avec `No space left on device`, et `df -h /data` affiche 40 % d’usage. Que vérifies-tu ensuite ?',
			options: [
				'`df -i /data`, car chaque nouveau fichier demande un inode libre',
				'`free -h`, car le cache de pages est peut-être plein',
				'`ulimit -n`, car le shell a peut-être trop de fichiers ouverts',
				'`dmesg`, car le disque est peut-être monté en lecture seule'
			],
			answer: 0,
			why: 'ext4 renvoie `ENOSPC` depuis `__ext4_new_inode` quand aucun groupe de blocs n’a d’inode libre, quels que soient les blocs libres. open(2) signale trop de fichiers ouverts par `EMFILE` et un système en lecture seule par `EROFS`, et `free -h` parle de la RAM.'
		},
		{
			q: 'Deux noms dans `ls -li` ont le même numéro d’inode et 2 liens. Tu fais `rm` sur l’un des deux. Qu’arrive-t-il aux données ?',
			options: [
				'Elles sont effacées, et l’autre nom pointe vers des blocs libérés',
				'Elles restent : l’inode passe à 1 lien et l’autre nom les lit encore',
				'Elles passent à l’autre nom, qui reçoit un nouveau numéro d’inode',
				'Elles restent seulement si l’autre nom a été créé en premier'
			],
			answer: 1,
			why: 'unlink(2) retire une entrée de répertoire et baisse le nombre de liens. L’inode et ses blocs ne sont libérés qu’à 0 lien, quand plus aucun processus n’a le fichier ouvert. link(2) précise qu’aucun des deux noms n’est l’original.'
		},
		{
			q: 'Tu veux un second chemin vers `/etc/app/config.yaml` depuis `/home/me/`, qui est sur un autre système de fichiers. Qu’est-ce qui marche, et pourquoi ?',
			options: [
				'Un lien physique, car il copie l’inode vers l’autre système de fichiers',
				'Un lien physique, car les numéros d’inode sont uniques sur la machine',
				'Un lien symbolique, car il stocke le chemin et non un numéro d’inode',
				'Aucun des deux, car un lien ne marche que dans un même répertoire'
			],
			answer: 2,
			why: 'Une entrée de répertoire contient un numéro d’inode, unique seulement dans un système de fichiers : link(2) échoue donc avec `EXDEV`. Un symlink contient la chaîne `/etc/app/config.yaml`, et le noyau la résout à l’ouverture.'
		}
	],
	lab: {
		minutes: 10,
		goal: 'Épuiser les inodes d’un système de fichiers qui a encore des octets libres, et obtenir `No space left on device`.',
		steps: [
			'Lance un conteneur avec un petit `tmpfs` qui a de la place pour 10 MB mais seulement 200 inodes : `docker run --rm -it --tmpfs /small:size=10m,nr_inodes=200 alpine sh`.',
			'Dedans, va dans ce dossier et lis les deux vues : `cd /small && df -i . && df -h .`.',
			'Crée des fichiers vides jusqu’au refus : `i=0; while touch f$i 2>/dev/null; do i=$((i+1)); done; echo $i`.',
			'Relis les deux vues, puis essaie encore un fichier : `df -i . && df -h . && touch extra`.',
			'Supprime un fichier et réessaie : `rm f1 && touch extra && echo ok`. Puis `exit`.'
		],
		done: [
			'L’étape 3 affiche 199 : le répertoire lui-même a pris le premier inode.',
			'L’étape 4 montre `Use%` à 100 % dans `df -i` et à 0 % dans `df -h`, puis `touch: extra: No space left on device`.',
			'L’étape 5 affiche `ok`.'
		],
		solution: [
			'Les fichiers vides ne prennent aucun bloc de données, donc `df -h` ne bouge pas. Chacun prend quand même un inode, et les 200 s’épuisent.',
			'L’erreur est `ENOSPC`, la même que pour un disque plein. Seul `df -i` distingue les deux cas.',
			'Supprimer le dernier nom d’un fichier qu’aucun processus n’a ouvert libère son inode : un fichier de plus tient.'
		]
	},
	recall: {
		q: 'Pourquoi `df -h` peut-il montrer de la place libre alors que la création d’un fichier échoue avec `ENOSPC`, et quelle commande le montre ?',
		a: 'Chaque fichier, répertoire, symlink et socket demande un inode, et ext4 fixe leur nombre au mkfs, un pour 16384 octets par défaut. `df -i` affiche `IUse%`, qui valait 100 dans le ticket Rancher.'
	},
	sources: [
		{ title: 'Ticket Rancher #55479, inodes épuisés par des dossiers tls et des sockets', url: 'https://github.com/rancher/rancher/issues/55479' },
		{ title: 'inode(7)', url: 'https://man7.org/linux/man-pages/man7/inode.7.html' },
		{ title: 'link(2)', url: 'https://man7.org/linux/man-pages/man2/link.2.html' },
		{ title: 'unlink(2)', url: 'https://man7.org/linux/man-pages/man2/unlink.2.html' },
		{ title: 'symlink(7)', url: 'https://man7.org/linux/man-pages/man7/symlink.7.html' },
		{ title: 'mke2fs(8)', url: 'https://man7.org/linux/man-pages/man8/mke2fs.8.html' },
		{ title: 'e2fsprogs, misc/mke2fs.conf.in (inode_ratio = 16384)', url: 'https://github.com/tytso/e2fsprogs/blob/8fd79523d051d5ea881237f27eb1c664486e0078/misc/mke2fs.conf.in#L1-L8' },
		{ title: 'Doc du noyau Linux, ext4 Index Nodes', url: 'https://docs.kernel.org/filesystems/ext4/inodes.html' },
		{ title: 'Doc du noyau Linux, ext4 Directory Entries', url: 'https://docs.kernel.org/filesystems/ext4/directory.html' }
	]
};
