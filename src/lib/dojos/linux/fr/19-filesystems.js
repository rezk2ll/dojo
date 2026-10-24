const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const INODE = `${LINUX}/fs/ext4/inode.c`;
const NAMEI = `${LINUX}/fs/ext4/namei.c`;
const LP = 'https://bugs.launchpad.net/ubuntu/+source/linux/+bug/317781';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'filesystems',
	part: 'Fichiers et disques',
	title: 'Systèmes de fichiers et journalisation',
	minutes: 10,
	hook: [
		'Janvier 2009, bug Ubuntu #317781, « Ext4 data loss ». Un utilisateur de Kubuntu Jaunty fait planter sa machine en testant des réglages du BIOS. Au redémarrage, "pretty much any file written to by any application (during the previous boot) was 0 bytes" : les fichiers de configuration de KDE et de Plasma, quelques bases MySQL.',
		'Son ext4 tournait avec les réglages par défaut : "Barriers on, extents on, ordered data mode". Un autre utilisateur perd son registre Wine et ses réglages GNOME, et fsck "removed 760+ orphaned inodes".',
		'En mode ordered, le journal d’ext4 couvre les répertoires, les inodes et les tables de blocs. **Le contenu des fichiers ne passe jamais par le journal.** Le noyau 2.6.30 a livré l’option de montage `auto_da_alloc`, active par défaut, qui pousse les données sur le disque avant le commit d’un rename qui écrase un fichier existant.'
	],
	terms: [
		{ term: 'Journal', def: 'Une zone réservée du système de fichiers, en général l’inode 8 sur ext4, où jbd2 écrit chaque changement de métadonnées avant de l’écrire à sa place définitive.' },
		{ term: 'Métadonnées', def: 'Les fiches du système de fichiers lui-même : inodes, entrées de répertoire, bitmaps de blocs et d’inodes. Les octets à l’intérieur d’un fichier sont ses données.' },
		{ term: 'data=ordered', def: 'Le mode par défaut d’ext4 : seules les métadonnées passent par le journal, et les blocs de données d’une transaction sont écrits avant le commit de ses métadonnées.' },
		{ term: 'Allocation différée', def: '`write(2)` ne fait que réserver de la place, et ext4 choisit les blocs du disque juste avant d’y écrire les données. C’est l’option de montage `delalloc`, active par défaut.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['w["write(fd, config, 4 KB) vers foo.new"] -->|"delalloc : aucun bloc choisi"| pc["Cache de pages : page sale, i_size 4096"]'],
				highlight: ['w', 'pc'],
				note: 'Avec `delalloc`, ext4 repousse l’allocation des blocs "until just before ext4 writes out the block(s) in question". Les 4 KB restent dans le cache de pages. L’inode annonce déjà 4096 octets, et aucun bloc du disque ne les contient.'
			},
			{
				add: ['ren["rename(foo.new, foo)"] -->|"changement de métadonnées"| tx["Transaction jbd2 en cours, en mémoire : entrée de répertoire, inodes"]'],
				highlight: ['ren', 'tx'],
				note: 'Le rename ne touche que des métadonnées : l’entrée `foo` pointe maintenant vers le nouvel inode, et l’ancien inode perd son dernier lien. jbd2 ajoute ces blocs modifiés à la transaction ouverte en mémoire.'
			},
			{
				add: ['tx -->|"toutes les 5 s : commit=5"| jr[("Journal : blocs de métadonnées, puis un enregistrement de commit")]', 'pc -.->|"data=ordered : les données d’abord"| disk[("Blocs de données à leur place")]'],
				highlight: ['jr', 'disk'],
				note: 'Le réglage par défaut `commit=5` limite l’âge d’une transaction à 5 secondes. En `data=ordered`, "When it\'s time to write the new metadata out to disk, the associated data blocks are written first." Seuls les blocs de données déjà alloués font partie de cette transaction.'
			},
			{
				add: ['crash["Coupure de courant 3 s après le commit"] -->|"rejeu jusqu’au dernier commit"| rec["foo désigne le nouvel inode, taille 4096, sans bloc de données : 0 octet"]'],
				highlight: ['crash', 'rec'],
				note: 'Au montage suivant, jbd2 rejoue le journal "all the way to the latest commit record". L’entrée de répertoire et les inodes reviennent dans un état cohérent. En 2009, les blocs différés n’étaient pas encore alloués : les données ne passaient donc pas avant le rename, et `foo` revenait vide.'
			},
			{
				add: ['fix["auto_da_alloc : rename par-dessus un fichier existant"] -->|"allouer et lancer l’écriture de foo.new d’abord"| disk'],
				highlight: ['fix'],
				note: 'Avec `auto_da_alloc`, ext4 repère "the replace-via-rename and replace-via-truncate patterns" et force l’écriture pour que "the data blocks of the new file are forced to disk before the rename() operation is committed". Un fichier tout neuf, écrit sans `fsync`, peut encore revenir vide.'
			}
		]
	},
	example: {
		title: 'fs/ext4/inode.c : ext4_alloc_da_blocks, le vidage déclenché par auto_da_alloc',
		repo: 'torvalds/linux',
		url: `${INODE}#L3077-L3116`,
		lang: 'c',
		code: `int ext4_alloc_da_blocks(struct inode *inode)
{
	trace_ext4_alloc_da_blocks(inode);

	if (!EXT4_I(inode)->i_reserved_data_blocks)
		return 0;

	/*
	 * We do something simple for now.  The filemap_flush() will
	 * also start triggering a write of the data blocks, which is
	 * not strictly speaking necessary (and for users of
	 * laptop_mode, not even desirable).  However, to do otherwise
	 * would require replicating code paths in:
	 *
	 * ext4_writepages() ->
	 *    write_cache_pages() ---> (via passed in callback function)
	 *        __mpage_da_writepage() -->
	 *           mpage_add_bh_to_extent()
	 *           mpage_da_map_blocks()
	 *
	 * The problem is that write_cache_pages(), located in
	 * mm/page-writeback.c, marks pages clean in preparation for
	 * doing I/O, which is not desirable if we're not planning on
	 * doing I/O at all.
	 *
	 * We could call write_cache_pages(), and then redirty all of
	 * the pages by calling redirty_page_for_writepage() but that
	 * would be ugly in the extreme.  So instead we would need to
	 * replicate parts of the code in the above functions,
	 * simplifying them because we wouldn't actually intend to
	 * write out the pages, but rather only collect contiguous
	 * logical block extents, call the multi-block allocator, and
	 * then update the buffer heads with the block allocations.
	 *
	 * For now, though, we'll cheat by calling filemap_flush(),
	 * which will map the blocks, and start the I/O, but not
	 * actually wait for the I/O to complete.
	 */
	return filemap_flush(inode->i_mapping);
}`,
		notes: [
			'[`ext4_rename`](' + NAMEI + '#L3869-L3870) appelle cette fonction quand le nom cible existe déjà (`new.inode`) et que le système de fichiers n’est pas monté en `noauto_da_alloc`. Elle s’exécute pendant l’étape `rename("foo.new", "foo")`, avant que le rename ouvre son handle de journal.',
			'Les lignes 5 et 6 rendent la main tout de suite si l’inode n’a aucun bloc différé réservé : ses données ont déjà des blocs sur le disque, et `data=ordered` s’en charge.',
			'La ligne 39 appelle `filemap_flush`. Le commentaire des lignes 35 à 37 dit ce qu’elle fait : elle "will map the blocks, and start the I/O, but not actually wait for the I/O to complete". Une fois alloués, les blocs font partie des données ordonnées de la transaction.',
			'Ted Ts’o dans le bug : le correctif "only protects against a file which is replaced via rename or truncate". Pour un fichier qui n’existait pas avant, l’application a toujours besoin de `fsync`, le sujet du chapitre suivant.'
		]
	},
	tradeoff: {
		gain: [
			'Après un plantage, jbd2 rejoue le journal jusqu’au dernier commit : un répertoire ou un inode ne reste jamais à moitié modifié.',
			'En `data=ordered`, les blocs de données d’une transaction arrivent sur le disque avant ses métadonnées. La doc d’ext4 sur `data=writeback`, qu’elle compare à la journalisation des métadonnées de XFS : "A crash+recovery can cause incorrect data to appear in files which were written shortly before the crash."',
			'Le réglage par défaut `commit=5` borne la perte : "you will lose as much as the latest 5 seconds of metadata changes (your filesystem will not be damaged though, thanks to the journaling)".'
		],
		cost: [
			'`data=ordered` ne journalise que les métadonnées. La doc de jbd2 : "file data blocks are /not/ guaranteed to be in any consistent state after a crash."',
			'`data=journal` écrit toutes les données deux fois, d’abord dans le journal, puis à leur place, et "will disable delayed allocation and O_DIRECT support".',
			'`nodelalloc` aurait évité les fichiers vides de 2009. Ts’o : "You will take a performance hit and your files will be more fragmented."'
		]
	},
	task: {
		prompt: 'Sur une machine avec une racine en ext4, lance `findmnt -no SOURCE,FSTYPE,OPTIONS /`, puis `ls /proc/fs/ext4/` et `cat /proc/fs/ext4/<dev>/options`. Quel mode de données et quel intervalle de commit le système de fichiers utilise-t-il, et `auto_da_alloc` est-il actif ? Laquelle des deux commandes te le dit ?',
		hint: 'Cherche `data=`, `commit=` et `auto_da_alloc` dans les deux sorties. Le guide d’administration d’ext4 marque les options par défaut avec `(*)`.',
		answer: [
			'Sortie relevée sur un portable pour ce chapitre : `findmnt` a affiché `/dev/mapper/data-root ext4 rw,noatime,errors=remount-ro`. Ni le mode de données ni l’intervalle de commit n’y figurent.',
			'`/proc/fs/ext4/dm-0/options` a listé `delalloc`, `auto_da_alloc`, `commit=5` et `data=ordered`, parmi 27 lignes. Ce sont les valeurs par défaut marquées `(*)` dans le guide d’ext4.',
			'Un plantage coûte donc au plus 5 secondes environ de changements de métadonnées, les données d’un fichier partent avant les métadonnées qui pointent vers elles, et un rename par-dessus un fichier existant vide d’abord les nouvelles données.'
		],
		steps: [
			{
				title: 'Lis findmnt',
				questions: [
					{ q: '`findmnt` a affiché `/dev/mapper/data-root ext4 rw,noatime,errors=remount-ro`. Quel mode de données montre-t-il ?', options: ['`data=ordered`', '`data=writeback`', 'Aucun : la ligne n’a pas d’option `data=`', '`data=journal`'], answer: 2, why: 'La ligne ne liste que `rw`, `noatime` et `errors=remount-ro`. Ni mode de données ni intervalle de commit.' },
					{ q: 'Pourquoi `data=` et `commit=` manquent-ils sur cette ligne ?', options: ['Ce sont des valeurs par défaut, que la ligne de montage ne répète pas', 'Le système de fichiers n’a pas de journal', 'Seul root peut les voir', '`findmnt` cache toutes les options d’ext4'], answer: 0, why: 'Le fichier propre à ext4 a listé `data=ordered` et `commit=5`, les valeurs par défaut marquées `(*)` dans le guide.' },
					{ q: 'Que te dit la colonne `ext4` sur le journal ?', options: ['Qu’il journalise les données des fichiers', 'Qu’il n’y en a pas', 'Qu’il fait un commit chaque seconde', 'Rien encore : il faut les options d’ext4 pour connaître le mode'], answer: 3, why: 'Le type seul ne dit pas quel mode de données tourne. ext4 peut tourner en `ordered`, `writeback` ou `journal`.' },
					{ q: 'Quelle partie de ce système de fichiers un journal jbd2 contient-il ?', options: ['Chaque octet écrit dans les fichiers', 'Seulement la bitmap des blocs libres', 'Les changements de métadonnées, avant leur place définitive', 'Une copie du cache de pages'], answer: 2, why: 'jbd2 écrit d’abord chaque changement de métadonnées dans le journal. En mode ordered, le contenu des fichiers n’y passe jamais.' }
				]
			},
			{
				title: 'Trouve les options d’ext4',
				questions: [
					{ q: '`ls /proc/fs/ext4/` a affiché `dm-0`. Qu’est-ce que c’est ?', options: ['Le nom du journal', 'Le nom noyau du périphérique qui porte le système ext4', 'Une option de montage', 'Le premier inode'], answer: 1, why: 'ext4 garde un dossier par système de fichiers monté, au nom du périphérique bloc. `/dev/mapper/data-root` est `dm-0`.' },
					{ q: 'Quel fichier liste toutes les options qu’ext4 utilise vraiment ?', options: ['`/proc/fs/ext4/dm-0/options`', '`/etc/fstab`', '`/proc/mounts`', '`/proc/fs/ext4/dm-0/journal`'], answer: 0, why: 'Il a listé 27 lignes, valeurs par défaut comprises, là où `findmnt` en montrait trois.' },
					{ q: 'Laquelle des deux commandes répond donc à la question ?', options: ['`findmnt`, parce qu’il lit le noyau', 'Les deux donnent les mêmes lignes', 'Aucune : seul `dumpe2fs` le peut', 'Le fichier `options`, parce qu’il inclut les valeurs par défaut'], answer: 3, why: '`findmnt` a laissé de côté toutes les valeurs par défaut. Le fichier `options` a montré `data=ordered`, `commit=5` et `auto_da_alloc`.' },
					{ q: 'Quel inode contient en général le journal d’ext4 ?', options: ['L’inode 1', 'L’inode 2', 'L’inode 8', 'L’inode 11'], answer: 2, why: 'Le journal est une zone réservée du système de fichiers, en général l’inode 8 sur ext4.' }
				]
			},
			{
				title: 'Lis les options',
				questions: [
					{ q: 'Que fait `data=ordered` ?', options: ['Il ne journalise que les métadonnées, et écrit les blocs de données d’une transaction avant son commit', 'Il journalise données et métadonnées, écrites deux fois', 'Il écrit les données dans l’ordre du fichier', 'Il coupe le journal pour les données et les métadonnées'], answer: 0, why: 'En mode ordered, seules les métadonnées passent par le journal. Les blocs de données déjà alloués sont écrits d’abord.' },
					{ q: 'Que limite `commit=5` ?', options: ['La taille du journal à 5 MB', 'L’âge de la transaction en cours à 5 secondes', 'Le nombre de passages de `fsck`', 'Les écritures par seconde'], answer: 1, why: '`commit=nrsec` borne l’âge de la transaction ouverte avant que jbd2 ne l’écrive.' },
					{ q: 'Que veut dire `delalloc` pour un `write` ?', options: ['L’écriture attend le disque', 'L’écriture est journalisée', 'L’écriture est jetée après 5 s', 'Il ne fait que réserver de la place ; ext4 choisit les blocs juste avant de les écrire'], answer: 3, why: 'L’allocation différée repousse le choix des blocs "until just before ext4 writes out the block(s) in question".' },
					{ q: 'Que fait `auto_da_alloc` sur `rename(foo.new, foo)` quand `foo` existe ?', options: ['Il refuse le rename', 'Il journalise les données de `foo.new`', 'Il vide les blocs différés de `foo.new` avant le commit du rename', 'Il garde une copie de l’ancien `foo`'], answer: 2, why: '`ext4_rename` appelle `ext4_alloc_da_blocks`, qui alloue les blocs et lance l’écriture : les données passent avant le rename.' }
				]
			},
			{
				title: 'Dis ce que coûte un plantage',
				questions: [
					{ q: 'Avec `commit=5`, combien de métadonnées une coupure peut-elle coûter ?', options: ['Jusqu’aux 5 dernières secondes de changements', 'Rien du tout', 'Tout le système de fichiers', 'Chaque fichier ouvert depuis le démarrage'], answer: 0, why: 'La doc d’ext4 : tu perds "as much as the latest 5 seconds of metadata changes", et le système de fichiers n’est pas abîmé.' },
					{ q: 'Après le plantage, dans quel état sont les répertoires et les inodes ?', options: ['À moitié modifiés tant que `fsck` n’est pas passé', 'Cohérents, jusqu’au dernier enregistrement de commit', 'Vides', 'Revenus à l’état du dernier démarrage'], answer: 1, why: 'jbd2 rejoue le journal "all the way to the latest commit record" : aucun répertoire ni inode ne reste à moitié modifié.' },
					{ q: 'Un programme enregistre sa config dans `foo.new` puis fait un `rename` sur l’ancien `foo`. Est-ce sûr ici sans `fsync` ?', options: ['Non : il revient à 0 octet, comme en 2009', 'Oui, toujours, pour n’importe quel fichier', 'Seulement avec `commit=1`', 'Oui pour le rename sur un fichier existant, grâce à `auto_da_alloc`'], answer: 3, why: 'Le vidage a lieu parce que le nom cible existe déjà : les données arrivent sur le disque avant le commit du rename.' },
					{ q: 'Quel cas `auto_da_alloc` ne couvre-t-il pas ?', options: ['Un rename sur un fichier existant', 'Une troncature d’un fichier existant', 'Un fichier tout neuf écrit sans `fsync`', 'La sauvegarde de config KDE de 2009, renommée sur l’ancien fichier'], answer: 2, why: 'Ts’o : le correctif "only protects against a file which is replaced via rename or truncate". Un nouveau fichier a toujours besoin de `fsync`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un ext4 en mode par défaut `data=ordered` perd le courant. Que garantit le journal au montage suivant ?',
			options: [
				'Chaque octet écrit avant la coupure est sur le disque, données et métadonnées',
				'Répertoires, inodes et bitmaps sont cohérents ; des données récentes peuvent manquer',
				'Rien tant qu’un `fsck` complet n’a pas vérifié chaque bloc du système',
				'Les données des fichiers sont cohérentes, les répertoires sont à refaire'
			],
			answer: 1,
			why: 'En `data=ordered`, jbd2 ne journalise que les métadonnées, et le rejeu les ramène au dernier commit. La doc de jbd2 dit que les blocs de données ne sont pas garantis cohérents. Pour journaliser aussi les données, il faut `data=journal`.'
		},
		{
			q: 'En 2009, sur ext4 avec allocation différée, un programme enregistre sa config avec `open("foo", O_TRUNC)`, `write`, `close` et aucun `fsync`. La machine plante 3 s plus tard. Pourquoi `foo` fait-il 0 octet ?',
			options: [
				'La troncature était commitée, mais les données n’avaient pas de bloc',
				'Le journal était plein, et ext4 a jeté l’écriture pour faire de la place',
				'`close` jette les données qui ne sont jamais passées par `fsync`',
				'Le plantage a corrompu le journal, et fsck a vidé le fichier'
			],
			answer: 0,
			why: 'La troncature est un changement de métadonnées, parti dans un commit du journal. Avec `delalloc`, les nouvelles données n’avaient pas encore de blocs : `data=ordered` n’avait rien à écrire avant. `auto_da_alloc` repère aujourd’hui ce motif de remplacement par troncature.'
		},
		{
			q: 'Tu montes ext4 avec `commit=60` pour réduire les écritures d’un portable. Que peut te coûter une coupure de courant ?',
			options: [
				'Tout le système de fichiers, car le journal n’est rejoué que toutes les 60 s',
				'Rien de plus, car `commit` règle seulement la fréquence de fsck',
				'Jusqu’à 60 s de changements de métadonnées ; le système reste cohérent',
				'Seulement les fichiers de plus de 60 MB ouverts à ce moment-là'
			],
			answer: 2,
			why: '`commit=nrsec` limite l’âge de la transaction en cours. La doc d’ext4 : avec la valeur par défaut de 5, tu perds "as much as the latest 5 seconds of metadata changes", et le journal garde le système de fichiers intact. Une valeur plus grande élargit cette fenêtre.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Construire un système ext4 dans un fichier, sans le monter, et y trouver son journal et son mode de données par défaut.',
		steps: [
			'Crée une image de 64 MB et formate-la : `mkdir -p ~/fs-lab && cd ~/fs-lab && truncate -s 64M disk.img && mke2fs -q -t ext4 -F disk.img`. Sous macOS, fais le lab dans `docker run --rm -it debian:bookworm-slim bash`, qui a e2fsprogs.',
			'Lis le superbloc : `dumpe2fs -h disk.img 2>/dev/null | grep -iE \'features|journal|mount options\'`.',
			'Regarde le journal comme un fichier : `debugfs -R \'stat <8>\' disk.img 2>/dev/null | head -5`.',
			'Range un autre mode de données par défaut dans l’image, puis relis-le : `tune2fs -o journal_data disk.img` et `dumpe2fs -h disk.img 2>/dev/null | grep \'Default mount\'`.',
			'Crée-en une sans journal : `truncate -s 64M nojournal.img && mke2fs -q -t ext4 -O ^has_journal -F nojournal.img && dumpe2fs -h nojournal.img 2>/dev/null | grep -ic journal`.',
			'Sur une machine Linux en ext4, compare avec le système monté : `cat /proc/fs/ext4/*/options | grep -E \'^(data=|commit=|auto_da_alloc|delalloc)\'`.'
		],
		done: [
			'L’étape 2 montre `has_journal` dans les features, `Journal inode: 8` et `Total journal size: 4096k`.',
			'L’étape 3 montre `Inode: 8   Type: regular` avec `Size: 4194304`.',
			'L’étape 4 affiche `Default mount options:    journal_data user_xattr acl`.',
			'L’étape 5 affiche `0`, et l’étape 6 affiche `delalloc`, `auto_da_alloc`, `commit=5` et `data=ordered`.'
		],
		solution: [
			'Le journal est un inode ordinaire, le numéro 8, qu’ext4 réserve au formatage. jbd2 y écrit les changements de métadonnées avant leur place définitive.',
			'`Journal start: 0` à l’étape 2 veut dire que le journal est vide : rien à rejouer. Après un plantage, le montage suivant le rejoue jusqu’au dernier commit.',
			'`tune2fs -o` ne fait que ranger une valeur par défaut dans le superbloc. Sans elle, un montage reçoit `data=ordered`, ce que montre l’étape 6 sur un système en marche.'
		]
	},
	recall: {
		q: 'Dans le mode par défaut d’ext4, qu’est-ce qui passe par le journal, et qu’a ajouté `auto_da_alloc` après les fichiers vides de 2009 ?',
		a: '`data=ordered` : seules les métadonnées sont journalisées, et les blocs de données sont écrits avant le commit de leurs métadonnées. `auto_da_alloc` (par défaut depuis 2.6.30) vide les blocs différés d’un fichier avant qu’un rename ou une troncature remplace un fichier existant.'
	},
	sources: [
		{ title: 'Bug Ubuntu #317781, Ext4 data loss', url: LP },
		{ title: 'Doc du noyau Linux, ext4 General Information (options de montage, modes de données)', url: 'https://docs.kernel.org/admin-guide/ext4.html' },
		{ title: 'Doc du noyau Linux, ext4 Journal (jbd2)', url: 'https://docs.kernel.org/filesystems/ext4/journal.html' },
		{ title: 'ext4(5)', url: 'https://man7.org/linux/man-pages/man5/ext4.5.html' },
		{ title: 'Doc du noyau Linux, The SGI XFS Filesystem', url: 'https://docs.kernel.org/admin-guide/xfs.html' },
		{ title: 'Commit Linux afd4672, ext4: Add auto_da_alloc mount option', url: 'https://github.com/torvalds/linux/commit/afd4672dc7610b7feef5190168aa917cc2e417e4' }
	]
};
