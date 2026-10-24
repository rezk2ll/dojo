const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const FD = `${PG}/src/backend/storage/file/fd.c`;
const THREAD = 'https://www.postgresql.org/message-id/flat/CAMsr%2BYHh%2B5Oq4xziwwoEfhoTZgr07vdGG%2Bhu%3D1adXx59aTeaoQ%40mail.gmail.com';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'fsync',
	part: 'Fichiers et disques',
	title: 'fsync et durabilité',
	minutes: 10,
	hook: [
		'28 mars 2018, pgsql-hackers. Craig Ringer signale une base PostgreSQL corrompue après une erreur de stockage sur XFS. Une écriture en arrière-plan vers le disque a échoué, et au checkpoint suivant `fsync()` a renvoyé `EIO`. PostgreSQL a marqué le checkpoint comme raté et a réessayé.',
		'Le deuxième `fsync()` a réussi, "because the prior fsync() *cleared the AS_EIO bad page flag*". Son résumé : "The write never made it to disk, but we completed the checkpoint, and merrily carried on our way. Whoops, data loss."',
		'PostgreSQL supposait qu’un `fsync` réussi couvre "all writes since the last SUCCESSFUL fsync". **Sous Linux, un deuxième appel après un échec peut renvoyer 0 alors que les pages ratées ont déjà disparu.** En novembre 2018, PostgreSQL s’est mis à faire un PANIC dès le premier échec de `fsync` sur un fichier de données, avec un back-port jusqu’à 9.4.'
	],
	terms: [
		{ term: 'fsync', def: 'L’appel système qui écrit les pages sales et les métadonnées d’un fichier du cache de pages vers le périphérique, et ne rend la main que quand le périphérique annonce le transfert terminé.' },
		{ term: 'Writeback', def: 'L’écriture par le noyau, en arrière-plan, des pages sales du cache vers le disque, un moment après que `write(2)` a déjà rendu la main.' },
		{ term: 'Durable', def: 'Toujours là après un plantage ou une coupure de courant. Une donnée est durable dès qu’un `fsync` sur elle a renvoyé 0.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['w["write(fd, 8 kB)"] -->|"rend la main tout de suite"| pc["Cache de pages : pages sales"]'],
				highlight: ['w', 'pc'],
				note: '`write(2)` copie les octets dans le cache de pages et rend la main avant qu’aucun d’eux n’atteigne le disque. Un plantage à ce moment perd les 8 kB, alors que `write` a annoncé un succès.'
			},
			{
				add: ['pc -->|"writeback en arrière-plan"| fail["Le disque renvoie une erreur d’E/S"]', 'fail -->|"erreur notée, pages marquées propres"| gone["Les 8 kB n’existent plus nulle part"]'],
				highlight: ['fail', 'gone'],
				note: 'LWN sur le comportement de Linux en 2018 : après une écriture ratée, le noyau "usually includes discarding the data in the affected pages and marking them as being clean". Le noyau garde un drapeau d’erreur sur le fichier, et personne n’est encore prévenu.'
			},
			{
				add: ['f1["fsync(fd) au checkpoint"] -->|"remonte l’erreur notée"| eio["-1, EIO"]'],
				highlight: ['f1', 'eio'],
				note: 'fsync(2) sur `EIO` : "Since Linux 4.13, errors from write-back will be reported to all file descriptors that might have written the data which triggered the error." Le premier `fsync` après l’échec reçoit l’erreur.'
			},
			{
				add: ['f2["fsync(fd) encore"] -->|"erreur déjà remontée"| ok["0, succès"]'],
				highlight: ['f2', 'ok'],
				note: 'Le wiki PostgreSQL sur Linux 4.14 et 4.16+ : "you still only get the error once (so retrying fsync() is not OK)". Le deuxième appel renvoie 0 et les 8 kB perdus le restent. PostgreSQL fait maintenant un PANIC à la place et rejoue son WAL, qui contient encore la modification.'
			},
			{
				add: ['tmp["écrire config.json.tmp, fsync(tmp)"] --> ren["rename(config.json.tmp, config.json)"]', 'ren --> dsync["fsync du répertoire"]'],
				highlight: ['tmp', 'ren', 'dsync'],
				note: 'Pour remplacer un fichier sans risque : écris un fichier temporaire dans le même répertoire, fais un `fsync` dessus, puis un `rename` par-dessus l’ancien nom. rename(2) : la cible "will be atomically replaced, so that there is no point at which another process attempting to access newpath will find it missing".'
			},
			{
				add: ['dsync -->|"entrée de répertoire sur le disque"| done["Après un plantage : l’ancien ou le nouveau config.json, jamais un mélange"]'],
				highlight: ['done'],
				note: 'fsync(2) : "Calling fsync() does not necessarily ensure that the entry in the directory containing the file has also reached disk. For that an explicit fsync() on a file descriptor for the directory is also needed." Sans lui, le rename lui-même peut se perdre dans un plantage.'
			}
		]
	},
	example: {
		title: 'src/backend/storage/file/fd.c : durable_rename, le fsync, rename, fsync de PostgreSQL',
		repo: 'postgres/postgres',
		url: `${FD}#L781-L854`,
		lang: 'c',
		code: `int
durable_rename(const char *oldfile, const char *newfile, int elevel)
{
	int			fd;

	/*
	 * First fsync the old and target path (if it exists), to ensure that they
	 * are properly persistent on disk. Syncing the target file is not
	 * strictly necessary, but it makes it easier to reason about crashes;
	 * because it's then guaranteed that either source or target file exists
	 * after a crash.
	 */
	if (fsync_fname_ext(oldfile, false, false, elevel) != 0)
		return -1;
…
	/* Time to do the real deal... */
	if (rename(oldfile, newfile) < 0)
	{
		ereport(elevel,
				(errcode_for_file_access(),
				 errmsg("could not rename file \\"%s\\" to \\"%s\\": %m",
						oldfile, newfile)));
		return -1;
	}

	/*
	 * To guarantee renaming the file is persistent, fsync the file with its
	 * new name, and its containing directory.
	 */
	if (fsync_fname_ext(newfile, false, false, elevel) != 0)
		return -1;

	if (fsync_parent_path(newfile, elevel) != 0)
		return -1;

	return 0;
}`,
		notes: [
			'La ligne 13 fait un `fsync` du fichier source avant toute chose : ses données sont sur le disque avant qu’un nom pointe vers lui. Les lignes omises ouvrent la cible existante, s’il y en a une, et font aussi un `fsync` dessus.',
			'La ligne 17 est le `rename(2)` lui-même. Un lecteur qui ouvre `newfile` voit à tout moment soit l’ancien fichier, soit le nouveau.',
			'Les lignes 30 et 33 rendent le rename durable : un `fsync` sur le fichier sous son nouveau nom, un sur le répertoire qui porte l’entrée. Le commentaire d’en-tête promet qu’un plantage laisse "either the pre-existing or the moved file in place of the new file; no mixed state or truncated files are possible".',
			'Toute erreur de `fsync` ici passe par [`data_sync_elevel`](' + FD + '#L4000-L4004), qui renvoie `PANIC` sauf si `data_sync_retry` est activé. Son commentaire : "A later attempt to fsync again might falsely report success."'
		]
	},
	tradeoff: {
		gain: [
			'Une fois que `fsync` a renvoyé 0, les données et les métadonnées du fichier survivent à un plantage ou à une coupure de courant. fsync(2) inclut "writing through or flushing a disk cache if present".',
			'Fichier temporaire, `fsync`, `rename`, `fsync` du répertoire : un lecteur ne voit jamais un fichier à moitié écrit, et après un plantage le fichier est soit l’ancien, soit le nouveau.',
			'En faisant un PANIC au premier échec de `fsync`, PostgreSQL refait les écritures perdues depuis le WAL au redémarrage, au lieu de terminer un checkpoint par-dessus des pages manquantes.'
		],
		cost: [
			'"The call blocks until the device reports that the transfer has completed." Chaque `fsync` attend le disque : un programme qui l’appelle à chaque petite écriture avance à la vitesse du périphérique.',
			'Un `fsync` Linux ne remonte une erreur de writeback qu’une fois. Une application qui réessaie reçoit 0 et perd des données : la seule réaction sûre est de réécrire les données depuis une autre copie.',
			'Chaque remplacement durable coûte deux appels `fsync`, un sur le fichier et un sur son répertoire.'
		]
	},
	task: {
		prompt: 'Enregistre ceci sous `save.py` et lance `strace -e trace=openat,write,fsync,rename,close python3 save.py` dans un répertoire vide : `import os; tmp = "config.json.tmp"; f = open(tmp, "w"); f.write(\'{"port": 8080}\\n\'); f.flush(); os.fsync(f.fileno()); f.close(); os.rename(tmp, "config.json"); d = os.open(".", os.O_RDONLY); os.fsync(d); os.close(d)`. Associe chaque appel tracé à une étape du remplacement sûr. Puis dis ce qu’un plantage pourrait laisser sans chacun des deux `fsync`.',
		hint: 'Les deux lignes `fsync` utilisent le fd 3, mais le fd 3 désigne un fichier différent à chaque fois.',
		answer: [
			'Sortie relevée sur un portable pour ce chapitre, après les appels de démarrage de l’interpréteur : `openat(AT_FDCWD, "config.json.tmp", O_WRONLY|O_CREAT|O_TRUNC|O_CLOEXEC, 0666) = 3`, `write(3, "{\\"port\\": 8080}\\n", 15) = 15`, `fsync(3) = 0`, `close(3) = 0`.',
			'Puis `rename("config.json.tmp", "config.json") = 0`, `openat(AT_FDCWD, ".", O_RDONLY|O_CLOEXEC) = 3`, `fsync(3) = 0`, `close(3) = 0`. Le premier `fsync` couvre les 15 octets et l’inode du fichier temporaire ; le second couvre l’entrée de répertoire modifiée par le rename.',
			'Sans le premier `fsync`, le rename peut atteindre le disque avant les données : c’est le fichier de 0 octet du chapitre précédent. Sans le `fsync` du répertoire, un plantage peut ramener l’ancien `config.json`, comme si le rename n’avait jamais eu lieu.'
		],
		steps: [
			{
				title: 'Trace le fichier temporaire',
				questions: [
					{ q: 'Le premier appel tracé est `openat(..., "config.json.tmp", O_WRONLY|O_CREAT|O_TRUNC|O_CLOEXEC, 0666) = 3`. Quelle étape est-ce ?', options: ['Ouvrir l’ancien `config.json` pour le lire', 'Créer le fichier temporaire dans le même répertoire', 'Ouvrir le répertoire', 'Verrouiller la config'], answer: 1, why: 'Le remplacement sûr commence par un fichier temporaire à côté de la cible, pour que le `rename` reste sur un seul système de fichiers.' },
					{ q: '`write(3, ..., 15) = 15` rend la main. Où sont les 15 octets maintenant ?', options: ['Sur le disque', 'Dans le journal', 'Dans le cache de pages, en pages sales', 'Dans l’entrée de répertoire'], answer: 2, why: '`write(2)` copie les octets dans le cache de pages et rend la main avant qu’ils n’atteignent le disque.' },
					{ q: 'Pourquoi le fichier temporaire doit-il être dans le même répertoire, et pas dans `/tmp` ?', options: ['`rename` ne traverse pas les systèmes de fichiers', '`/tmp` n’a pas de cache de pages', 'On ne peut pas faire de `fsync` dans `/tmp`', 'Python refuse les autres chemins'], answer: 0, why: '`rename` entre deux systèmes de fichiers échoue avec `EXDEV`. Le même répertoire garde les deux noms sur un seul système de fichiers.' },
					{ q: 'Pourquoi ne pas ouvrir `config.json` avec `O_TRUNC` et écrire sur place ?', options: ['C’est plus lent', 'Il faut être root', 'Ça casse `strace`', 'Un plantage en pleine écriture laisse un fichier vide ou partiel'], answer: 3, why: 'L’ancien contenu disparaît dès que la troncature arrive. Le fichier temporaire garde l’ancien intact jusqu’au rename.' }
				]
			},
			{
				title: 'Place le premier fsync',
				questions: [
					{ q: 'Quel appel rend les 15 octets durables ?', options: ['`write(3, ..., 15)`', 'Le premier `fsync(3) = 0`', '`close(3)`', '`rename`'], answer: 1, why: 'Une donnée est durable dès qu’un `fsync` sur elle a renvoyé 0. `write` et `close` n’attendent pas le disque.' },
					{ q: 'Que couvre ce premier `fsync` ?', options: ['Les 15 octets et l’inode du fichier temporaire', 'L’entrée de répertoire de `config.json`', 'Tous les fichiers du répertoire', 'Seulement la taille du fichier'], answer: 0, why: 'fsync écrit les pages sales et les métadonnées d’un fichier, et rend la main quand le périphérique annonce le transfert terminé.' },
					{ q: 'Si ce premier `fsync` échoue, quelle étape suivante le script ne doit-il pas lancer ?', options: ['Le `close`', 'Le second `openat`', 'Le `rename`', 'Le `strace` lui-même'], answer: 2, why: 'Le rename ferait pointer `config.json` vers des données peut-être absentes du disque. S’arrêter avant laisse l’ancien fichier en place.' },
					{ q: 'Pourquoi `durable_rename` de PostgreSQL fait-il d’abord un `fsync` du fichier source ?', options: ['Pour le verrouiller', 'Pour vérifier sa taille', 'Pour libérer son cache de pages', 'Pour que ses données soient sur le disque avant qu’un nom pointe vers lui'], answer: 3, why: 'La ligne 13 fait un `fsync` de l’ancien fichier avant le rename : le nouveau nom ne pointe jamais vers des données absentes.' }
				]
			},
			{
				title: 'Place le rename et le second fsync',
				questions: [
					{ q: 'Que garantit `rename("config.json.tmp", "config.json") = 0` aux lecteurs ?', options: ['L’ancien ou le nouveau fichier à tout moment, jamais de nom absent', 'Un court moment sans `config.json`', 'Une copie des deux fichiers', 'Un fichier fusionné'], answer: 0, why: 'rename(2) : la cible "will be atomically replaced", sans aucun moment où `newpath` manque.' },
					{ q: 'Le `openat(AT_FDCWD, ".", O_RDONLY|O_CLOEXEC) = 3` suivant ouvre quoi ?', options: ['Le nouveau `config.json`', 'Encore le fichier temporaire', 'Le répertoire courant', 'Le journal'], answer: 2, why: '`"."` est le répertoire qui porte l’entrée modifiée par le rename.' },
					{ q: 'Les deux lignes `fsync` utilisent le fd 3. Est-ce le même fichier ?', options: ['Oui : le fd 3 désigne toujours un seul fichier', 'Oui : le noyau réutilise l’inode', 'Non : le second est `config.json`', 'Non : le fd 3 a été fermé puis réutilisé pour le répertoire'], answer: 3, why: '`close(3)` a libéré le numéro, et l’`openat` suivant l’a récupéré pour `"."`.' },
					{ q: 'Que couvre le second `fsync` ?', options: ['L’entrée de répertoire modifiée par le rename', 'Encore les 15 octets', 'Les données de l’ancien `config.json`', 'Rien : on ne peut pas faire de `fsync` sur un répertoire'], answer: 0, why: 'fsync(2) : synchroniser un fichier ne garantit pas que son entrée de répertoire a atteint le disque. Il faut un `fsync` explicite sur le répertoire.' }
				]
			},
			{
				title: 'Dis ce que laisse un plantage',
				questions: [
					{ q: 'Dans le répertoire vide, sans le premier `fsync`, que peut laisser un plantage ?', options: ['L’ancien fichier, toujours', 'Un `config.json` de 0 octet : le rename est arrivé avant les données', 'Un fichier moitié ancien, moitié nouveau', 'Deux fichiers `config.json`'], answer: 1, why: 'Le rename peut atteindre le disque avant les données : c’est le fichier de 0 octet du chapitre précédent. Sans ancien `config.json` à remplacer, `auto_da_alloc` d’ext4 n’intervient pas.' },
					{ q: 'Cette fois, un ancien `config.json` existe, le système est ext4, et seul le premier `fsync` manque. Qu’est-ce qui empêche encore les nouvelles données de revenir vides ?', options: ['Rien : un fichier de 0 octet est probable', 'Le `fsync` du répertoire', '`auto_da_alloc` d’ext4, qui vide les blocs avant un rename sur un fichier existant', 'Le cache de pages'], answer: 2, why: 'Le rename remplace un nom existant : ext4 écrit d’abord les blocs du fichier temporaire. Les autres systèmes de fichiers ne promettent rien de tel.' },
					{ q: 'Avec les deux, que peut laisser un plantage ?', options: ['Un fichier de 0 octet', 'L’ancien ou le nouveau `config.json`, jamais un mélange', 'Toujours l’ancien fichier', 'Seulement un fichier temporaire'], answer: 1, why: 'Les données d’abord, puis un rename atomique, puis l’entrée de répertoire sur le disque. `durable_rename` promet "no mixed state or truncated files".' },
					{ q: 'Que coûte chaque remplacement durable ?', options: ['Rien de plus', 'Un seul `fsync`, sur le répertoire', 'Un `sync` complet du disque', 'Deux appels `fsync`, qui attendent chacun le périphérique'], answer: 3, why: 'Un sur le fichier et un sur son répertoire. "The call blocks until the device reports that the transfer has completed."' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Sous Linux, `fsync(fd)` renvoie -1 avec `EIO`. L’application rappelle `fsync(fd)` et reçoit 0. Les données sont-elles sur le disque ?',
			options: [
				'Oui, le deuxième appel a écrit les pages qui avaient échoué la première fois',
				'Oui, le noyau réessaie les pages ratées jusqu’à ce qu’une écriture passe',
				'Non, le noyau a pu marquer les pages ratées propres et les jeter',
				'Non, car `EIO` veut dire que le fichier a été supprimé du disque'
			],
			answer: 2,
			why: 'Après un writeback raté, Linux peut marquer les pages propres et les jeter, et il ne remonte l’erreur qu’une fois. Le wiki PostgreSQL : "retrying fsync() is not OK". Il faut réécrire les données depuis une autre copie, comme le WAL.'
		},
		{
			q: 'Quel ordre remplace `config.json` de façon qu’un plantage laisse soit l’ancien, soit le nouveau fichier ?',
			options: [
				'Ouvrir `config.json` avec `O_TRUNC`, écrire, fsync, fermer',
				'Écrire `config.json.tmp`, fsync, le renommer en `config.json`, fsync du répertoire',
				'Écrire `config.json.tmp`, le renommer en `config.json`, fsync de `config.json`',
				'Écrire `/tmp/config.json`, fsync, le renommer dans le répertoire de l’appli'
			],
			answer: 1,
			why: '`O_TRUNC` laisse un fichier vide ou partiel si le plantage tombe en pleine écriture. Renommer avant le `fsync` peut mettre le nom sur le disque avant les données. `rename` ne traverse pas les systèmes de fichiers (`EXDEV`) : le fichier temporaire doit être dans le même répertoire.'
		},
		{
			q: 'Un programme fait un fsync de son nouveau fichier et le renomme par-dessus l’ancien, mais ne fait jamais de fsync du répertoire. Le courant saute une seconde plus tard. Que peux-tu trouver au redémarrage ?',
			options: [
				'Toujours le nouveau fichier, car ses données ont eu un fsync avant le rename',
				'Peut-être l’ancien fichier, car le rename n’a peut-être pas atteint le disque',
				'Un fichier moitié ancien, moitié nouveau',
				'Plus aucun fichier, car le rename a d’abord retiré l’ancien nom'
			],
			answer: 1,
			why: 'fsync(2) dit que synchroniser un fichier ne garantit pas que son entrée de répertoire a atteint le disque. Le rename a modifié le répertoire, et cette modification peut se perdre. `rename` lui-même ne laisse jamais le nom absent ou mélangé.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Mesurer ce que coûte `fsync`, et voir pourquoi un programme groupe ses écritures avant un seul `fsync`.',
		steps: [
			'Crée un dossier sur un vrai disque, pas sur un `tmpfs` : `mkdir -p ~/fsync-lab && cd ~/fsync-lab`.',
			'Chronomètre 500 petites écritures sans `fsync` : `python3 -c "import os, time; fd = os.open(\'log.txt\', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644); t = time.time(); [os.write(fd, b\'event\\n\') for i in range(500)]; print(\'%.3f s\' % (time.time() - t))"`.',
			'Chronomètre la même chose avec un `fsync` après chaque écriture : remplace la liste par `[(os.write(fd, b\'event\\n\'), os.fsync(fd)) for i in range(500)]`.',
			'Chronomètre les 500 écritures suivies d’un seul `fsync` : reprends la liste de l’étape 2 et ajoute `os.fsync(fd);` juste après.',
			'Sous Linux, compte les appels : `strace -c -e trace=fsync python3 -c "import os; fd = os.open(\'log.txt\', os.O_WRONLY); [(os.write(fd, b\'event\\n\'), os.fsync(fd)) for i in range(500)]"`.'
		],
		done: [
			'L’étape 2 affiche à peu près `0.000 s`.',
			'L’étape 3 prend bien plus longtemps sur le même disque, une bonne partie d’une seconde ou plus.',
			'L’étape 4 reste proche de l’étape 2.',
			'Le tableau de `strace -c` montre 500 appels `fsync`.'
		],
		solution: [
			'`write` ne fait que remplir le cache de pages : l’étape 2 n’attend jamais le disque. Chaque `fsync` bloque jusqu’à ce que le périphérique annonce le transfert terminé : l’étape 3 avance à la vitesse du périphérique.',
			'Un seul `fsync` après beaucoup d’écritures les rend toutes durables d’un coup, pour le prix d’une seule attente du périphérique.',
			'Sur un `tmpfs`, les trois étapes sont rapides : il n’y a aucun périphérique à attendre, et rien ne survit au redémarrage de toute façon.'
		]
	},
	recall: {
		q: 'Qu’a changé PostgreSQL en novembre 2018 après le signalement du fsyncgate, et pourquoi ne se contente-t-il pas de réessayer `fsync` ?',
		a: 'Il fait maintenant un PANIC au premier échec de `fsync` sur un fichier de données (`data_sync_retry` désactivé par défaut) et rejoue le WAL au redémarrage. Linux peut jeter les pages ratées et ne remonter l’erreur qu’une fois : un deuxième `fsync` peut renvoyer 0 pour des données perdues.'
	},
	sources: [
		{ title: 'pgsql-hackers, PostgreSQL’s handling of fsync() errors is unsafe and risks data loss at least on XFS (2018)', url: THREAD },
		{ title: 'Wiki PostgreSQL, Fsync Errors', url: 'https://wiki.postgresql.org/wiki/Fsync_Errors' },
		{ title: 'LWN, PostgreSQL’s fsync() surprise', url: 'https://lwn.net/Articles/752063/' },
		{ title: 'Commit PostgreSQL 9ccdd7f, PANIC on fsync() failure', url: 'https://github.com/postgres/postgres/commit/9ccdd7f66e3324d2b6d3dec282cfa9ff084083f1' },
		{ title: 'fsync(2)', url: 'https://man7.org/linux/man-pages/man2/fsync.2.html' },
		{ title: 'rename(2)', url: 'https://man7.org/linux/man-pages/man2/rename.2.html' }
	]
};
