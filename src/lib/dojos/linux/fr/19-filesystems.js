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
