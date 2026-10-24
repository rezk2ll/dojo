const COREUTILS = 'https://github.com/coreutils/coreutils/blob/cc8689a07c8cfece66707936e3b914174912bd36';
const CHMOD = `${COREUTILS}/src/chmod.c`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'permissions',
	part: 'Fichiers et disques',
	title: 'Les permissions au-delà de rwx',
	minutes: 10,
	hook: [
		'25 janvier 2022. Qualys publie PwnKit, CVE-2021-4034 : n’importe quel utilisateur local obtient tous les droits root grâce à `pkexec`. L’avis le décrit comme "a SUID-root program that is installed by default on every major Linux distribution", et la faille existe "since its creation, in May 2009".',
		'Qualys l’a exploitée sur Ubuntu, Debian, Fedora et CentOS. Pour les systèmes encore sans correctif, l’avis donne une seule commande : `chmod 0755 /usr/bin/pkexec`.',
		'Cette commande retire un bit. Avec `-rwsr-xr-x`, chaque utilisateur qui lance `pkexec` a root comme utilisateur effectif : un bug mémoire dans le traitement de ses arguments donne root à tout le monde. **Le `s` à la place du `x` du propriétaire est le bit set-user-ID.**'
	],
	terms: [
		{ term: 'Bit set-user-ID', def: 'Le bit de mode 04000, affiché `s` à la place de l’exécution du propriétaire. Quand on exécute un programme qui l’a, execve donne au processus l’UID effectif du propriétaire du fichier.' },
		{ term: 'Bit set-group-ID', def: 'Le bit de mode 02000, affiché `s` à la place de l’exécution du groupe. Sur un programme, il fixe le GID effectif ; sur un répertoire, les nouveaux fichiers y prennent le groupe du répertoire.' },
		{ term: 'Sticky bit', def: 'Le bit de mode 01000, affiché `t` à la place de l’exécution des autres. Dans un répertoire, seuls le propriétaire du fichier, celui du répertoire ou un processus privilégié peuvent supprimer ou renommer ce fichier.' },
		{ term: 'umask', def: 'Un masque de bits de permission propre à chaque processus, que `open` et `mkdir` retirent de chaque nouveau fichier. La valeur habituelle est `022`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['run["l’uid 1000 lance /usr/bin/passwd, -rwsr-xr-x root"] -->|"execve : bit set-user-ID"| proc["Processus : UID réel 1000, UID effectif 0"]'],
				highlight: ['run', 'proc'],
				note: 'execve(2) : "the effective user ID of the calling process is changed to that of the owner of the program file". L’UID réel reste 1000, et le programme sait donc qui l’a appelé. Sur le portable Ubuntu de ce chapitre, 11 programmes de `/usr/bin` sont set-user-ID root, dont `passwd`, `sudo` et `pkexec`.'
			},
			{
				add: ['proc -.->|"ignoré si monté nosuid ou si no_new_privs est posé"| plain["Le processus garde l’UID effectif 1000"]'],
				highlight: ['plain'],
				note: 'execve(2) liste les cas où le bit est ignoré : le thread a `no_new_privs`, ou le système de fichiers est monté `nosuid`. Un fichier setuid sur une clé USB montée `nosuid` tourne avec les droits de l’utilisateur qui le lance.'
			},
			{
				add: ['sgid["mkdir shared; chgrp docker shared; chmod g+s shared"] --> drw["drwxrwsr-x lea docker shared"]', 'drw -->|"touch shared/after.txt"| f["-rw-rw-r-- lea docker after.txt"]'],
				highlight: ['sgid', 'drw', 'f'],
				note: 'inode(7) : les fichiers créés dans un répertoire set-group-ID "inherit their group ID from the directory", et les sous-répertoires reçoivent aussi le bit. Dans le test de ce chapitre, `before.txt`, créé avant `g+s`, a le groupe `lea`. `after.txt` a le groupe `docker`.'
			},
			{
				add: ['tmp["/tmp : drwxrwxrwt root root, mode 1777"] -->|"bob lance rm /tmp/alice.log"| deny["Operation not permitted"]'],
				highlight: ['tmp', 'deny'],
				note: 'Le mode 777 permet à tout le monde de créer des fichiers dans `/tmp`, et le 1 en plus est le sticky bit. À cause de lui, seuls alice, root (propriétaire du répertoire) ou un processus privilégié peuvent supprimer ou renommer `alice.log`. Le mode du fichier lui-même ne compte pas pour la suppression.'
			},
			{
				add: ['mask["umask 022"] -->|"open(..., 0666)"| file["0666 & ~022 = 0644 : -rw-r--r--"]', 'mask -->|"mkdir(..., 0777)"| dir2["0777 & ~022 = 0755 : drwxr-xr-x"]'],
				highlight: ['mask', 'file', 'dir2'],
				note: 'umask(2) : "permissions in the umask are turned off from the mode argument to open(2) and mkdir(2)." `touch` demande 0666 et obtient 0644 ; `mkdir` demande 0777 et obtient 0755. Dans un répertoire setgid partagé, `022` prive le groupe d’écriture, et les équipes passent donc à `002`.'
			}
		]
	},
	example: {
		title: 'coreutils src/chmod.c : process_file, appliquer le mode et repérer les surprises du umask',
		repo: 'coreutils/coreutils',
		url: `${CHMOD}#L304-L358`,
		lang: 'c',
		code: `  if (ch.status == CH_NOT_APPLIED)
    {
      ch.old_mode = file_stats->st_mode;
      ch.new_mode = mode_adjust (ch.old_mode, S_ISDIR (ch.old_mode) != 0,
                                 umask_value, change, nullptr);
      bool follow_symlink = !!dereference;
      if (dereference == -1) /* -H with/without -R, -P without -R.  */
        follow_symlink = ent->fts_level == 0;
      if (fchmodat (fts->fts_cwd_fd, file, ch.new_mode,
                    follow_symlink ? 0 : AT_SYMLINK_NOFOLLOW) == 0)
        ch.status = CH_SUCCEEDED;
      else
        {
          if (! is_ENOTSUP (errno))
            {
              if (! force_silent)
                error (0, errno, _("changing permissions of %s"),
                       quoteaf (file_full_name));

              ch.status = CH_FAILED;
            }
          /* else treat not supported as not applied.  */
        }
    }
…
  if (CH_NO_CHANGE_REQUESTED <= ch.status && diagnose_surprises)
    {
      mode_t naively_expected_mode =
        mode_adjust (ch.old_mode, S_ISDIR (ch.old_mode) != 0,
                     0, change, nullptr);
      if (ch.new_mode & ~naively_expected_mode)
        {
          char new_perms[12];
          char naively_expected_perms[12];
          strmode (ch.new_mode, new_perms);
          strmode (naively_expected_mode, naively_expected_perms);
          new_perms[10] = naively_expected_perms[10] = '\\0';
          error (0, 0,
                 _("%s: new permissions are %s, not %s"),
                 quotef (file_full_name),
                 new_perms + 1, naively_expected_perms + 1);
          ch.status = CH_FAILED;
        }
    }`,
		notes: [
			'Les lignes 4 et 5 calculent le nouveau mode à partir de l’ancien, du changement demandé et de `umask_value`. `main` lit cette valeur avec `umask (0)`, ligne 632 du fichier. chmod(1) : sans `u`, `g`, `o` ni `a`, "bits that are set in the umask are not affected".',
			'La ligne 9 appelle `fchmodat` une fois avec le mode complet, bits spéciaux compris. chmod(1) prévient que le noyau peut en retirer : il "clears the set-group-ID bit of a regular file if the file\'s group ID does not match the user\'s effective group ID". [`mode_changed`](' + CHMOD + '#L126-L145) relance ensuite `fstatat` pour voir ce qui est vraiment resté.',
			'Les lignes 26 à 44 s’exécutent pour un mode comme `-w`. Les lignes 28 à 30 recalculent le mode avec un umask à 0, et la ligne 31 compare les deux. Lancé pour ce chapitre avec un umask 022 sur un fichier en 0666, `chmod -w f` a affiché `f: new permissions are r--rw-rw-, not r--r--r--` et a quitté avec le code 1.'
		]
	},
	tradeoff: {
		gain: [
			'Un programme set-user-ID root permet à tout utilisateur de faire une tâche root précise sans règle `sudo`, comme `passwd`, en mode 4755 et appartenant à root.',
			'Un répertoire set-group-ID range chaque nouveau fichier dans le groupe de l’équipe. Dans le test, `after.txt` a reçu le groupe `docker` sans aucun `chgrp`.',
			'Le sticky bit permet à tous les utilisateurs de partager un seul `/tmp` ouvert en écriture (mode 1777), où chacun ne peut supprimer que ses propres fichiers.'
		],
		cost: [
			'Un bug dans un programme set-user-ID root est un bug root pour chaque utilisateur local. PwnKit est resté dans `pkexec` de mai 2009 à janvier 2022.',
			'Avec un umask `022`, les nouveaux fichiers d’un répertoire setgid partagé sont en `-rw-r--r--` : le groupe lit mais n’écrit pas. Chaque membre doit tourner en `002` ou corriger le mode après chaque écriture.',
			'`chmod` peut perdre sans bruit un bit set-group-ID si tu n’es pas dans le groupe du fichier, et `chmod -w` sous un umask laisse en place l’écriture du groupe et des autres.'
		]
	},
	task: {
		prompt: 'Sur ta machine, lance `stat -c \'%A %a %U %G %n\' /tmp /usr/bin/passwd /usr/bin/crontab /var/mail`, puis `umask`, puis `find /usr/bin -perm -4000 -printf \'%M %u %p\\n\'`. Pour chaque ligne de `stat`, nomme le bit spécial et dis ce qu’il fait. À partir de `umask`, calcule le mode d’un nouveau fichier et d’un nouveau répertoire.',
		hint: 'Lis le premier chiffre du mode octal : 4 pour set-user-ID, 2 pour set-group-ID, 1 pour le sticky bit. Un `s` à la place du groupe signale le setgid, un `t` en dernière position le sticky bit.',
		answer: [
			'Sortie sur un portable Ubuntu 24.04 : `drwxrwxrwt 1777 root root /tmp`. Le 1 est le sticky bit : tout le monde peut créer des fichiers, seuls le propriétaire d’un fichier, root ou un processus privilégié peuvent le supprimer.',
			'`-rwsr-xr-x 4755 root root /usr/bin/passwd` : le 4 est set-user-ID, donc `passwd` tourne avec l’UID effectif 0 pour n’importe quel appelant. `-rwxr-sr-x 2755 root crontab /usr/bin/crontab` : le 2 est set-group-ID, donc il tourne avec le groupe effectif `crontab`.',
			'`drwxrwsr-x 2775 root mail /var/mail` : set-group-ID sur un répertoire, chaque nouvelle boîte aux lettres reçoit donc le groupe `mail`.',
			'`umask` a affiché `002` : un nouveau fichier reçoit 0666 & ~002 = 0664 (`-rw-rw-r--`), un nouveau répertoire 0775. `find` a listé 11 programmes set-user-ID root, dont `sudo`, `su`, `mount` et `pkexec`.'
		],
		steps: [
			{
				title: 'Lis la ligne de /tmp',
				questions: [
					{ q: '`drwxrwxrwt 1777 root root /tmp`. Quel bit spécial est posé ?', options: ['Set-user-ID', 'Set-group-ID', 'Le sticky bit', 'Aucun : `t` est un type de fichier'], answer: 2, why: 'Le premier chiffre octal vaut 1, affiché `t` à la place de l’exécution des autres : le sticky bit.' },
					{ q: 'Que permet la partie 777 dans `/tmp` ?', options: ['Y créer des fichiers', 'Y supprimer n’importe quel fichier', 'Y lire tous les fichiers', 'Y lancer chaque fichier en root'], answer: 0, why: 'L’écriture et l’exécution sur un répertoire permettent à tout le monde d’y ajouter des entrées.' },
					{ q: 'À part alice, qui peut supprimer un fichier qu’alice a créé dans `/tmp` ?', options: ['Tout membre du groupe `root`', 'Tout utilisateur, si le fichier est en mode 0666', 'Personne, pas même root', 'Root, qui possède aussi `/tmp`'], answer: 3, why: 'Avec le sticky bit, seuls le propriétaire du fichier, celui du répertoire ou un processus privilégié peuvent le supprimer. Ici, le répertoire appartient à root.' },
					{ q: 'Pourquoi le mode du fichier lui-même ne compte-t-il pas pour la suppression ?', options: ['Le noyau vérifie le mode du fichier après la suppression', 'Supprimer retire une entrée de répertoire : c’est le mode du répertoire qui décide', 'Les fichiers de `/tmp` n’ont pas de mode', 'Parce que root possède `/tmp`'], answer: 1, why: 'Un nom vit dans le répertoire parent. Le retirer, c’est écrire dans ce répertoire.' }
				]
			},
			{
				title: 'Lis les deux programmes',
				questions: [
					{ q: '`-rwsr-xr-x 4755 root root /usr/bin/passwd`. Que fait le 4 ?', options: ['Il rend le fichier lisible par root seul', 'Set-user-ID : le processus tourne avec l’UID effectif 0 pour tout appelant', 'Set-group-ID : il tourne avec le groupe root', 'Il marque le fichier sticky en mémoire'], answer: 1, why: 'execve donne l’UID effectif du propriétaire du fichier, ici root. L’UID réel reste celui de l’appelant.' },
					{ q: 'Root lui applique le correctif PwnKit : `chmod 0755 /usr/bin/passwd`. Quel mode `stat` affiche-t-il ensuite ?', options: ['`-rwsr-xr-x`', '`-rwxr-xr-x`', '`-rw-r--r--`', '`-rwxr-sr-x`'], answer: 1, why: '0755 retire le 4 de tête : la case du propriétaire affiche de nouveau `x`. `passwd` tournerait alors avec l’UID de l’appelant.' },
					{ q: '`-rwxr-sr-x 2755 root crontab /usr/bin/crontab`. Que fait le 2 ?', options: ['Il tourne avec le groupe effectif `crontab`', 'Il tourne avec l’utilisateur effectif `crontab`', 'Seul le groupe peut le lancer', 'Les nouveaux fichiers prennent le groupe `crontab`'], answer: 0, why: 'Le `s` à la place du groupe sur un programme est le set-group-ID : il fixe le GID effectif au groupe du fichier.' },
					{ q: 'Quand `passwd` garderait-il l’UID effectif 1000 malgré le bit ?', options: ['Quand l’appelant est dans le groupe `root`', 'Quand le umask vaut `022`', 'Quand son système de fichiers est monté `nosuid`, ou que `no_new_privs` est posé', 'Jamais'], answer: 2, why: 'execve(2) ignore le bit set-user-ID sur un montage `nosuid` ou quand le thread a `no_new_privs`.' }
				]
			},
			{
				title: 'Lis le répertoire et la liste',
				questions: [
					{ q: '`drwxrwsr-x 2775 root mail /var/mail`. Que fait le `s` sur un répertoire ?', options: ['Les programmes dedans tournent en `mail`', 'Seul `mail` peut le lister', 'Les nouveaux fichiers y prennent le groupe `mail`', 'Les fichiers dedans ne peuvent pas être supprimés'], answer: 2, why: 'inode(7) : les fichiers créés dans un répertoire set-group-ID "inherit their group ID from the directory".' },
					{ q: 'Un nouveau sous-répertoire sous `/var/mail` reçoit-il aussi le bit ?', options: ['Oui : les sous-répertoires en héritent', 'Non : seuls les fichiers en héritent', 'Seulement s’il est créé par root', 'Seulement avec un umask `002`'], answer: 0, why: 'Les nouveaux sous-répertoires d’un répertoire set-group-ID reçoivent aussi le bit : la règle descend.' },
					{ q: '`find /usr/bin -perm -4000` a listé 11 programmes. Qu’ont-ils en commun ?', options: ['Ils sont tous sticky', 'Ils appartiennent tous au groupe `mail`', 'Les utilisateurs ne peuvent pas les lancer', 'Ils tournent tous avec l’UID du propriétaire, ici root, pour tout appelant'], answer: 3, why: '`-perm -4000` trouve les fichiers qui ont le bit set-user-ID. Chacun tourne en root pour tout le monde.' },
					{ q: 'Pourquoi cette liste compte-t-elle après PwnKit ?', options: ['Chaque programme ralentit le démarrage', 'Un bug dans l’un d’eux est un bug root pour chaque utilisateur local', 'Chacun laisse fuir le umask', 'Ils ignorent `nosuid`'], answer: 1, why: '`pkexec` était dans une telle liste de mai 2009 à janvier 2022. Le correctif a retiré son bit avec `chmod 0755`.' }
				]
			},
			{
				title: 'Calcule depuis le umask',
				questions: [
					{ q: '`umask` affiche `002`. Quel mode `touch` demande-t-il ?', options: ['0777', '0644', '0666', '0002'], answer: 2, why: '`touch` demande 0666 à `open`. Le umask retire ensuite des bits.' },
					{ q: 'Quel mode le nouveau fichier reçoit-il ?', options: ['0664, `-rw-rw-r--`', '0644, `-rw-r--r--`', '0666, `-rw-rw-rw-`', '0775, `-rwxrwxr-x`'], answer: 0, why: '0666 & ~002 = 0664. Seuls les autres perdent l’écriture.' },
					{ q: 'Quel mode reçoit un nouveau répertoire ?', options: ['0664', '0755', '0777', '0775'], answer: 3, why: '`mkdir` demande 0777, et 0777 & ~002 = 0775.' },
					{ q: 'Pourquoi les équipes d’un répertoire setgid partagé choisissent-elles `002` plutôt que `022` ?', options: ['`022` bloque le bit setgid', 'Avec `022`, les nouveaux fichiers sont en `-rw-r--r--` : le groupe ne peut pas écrire', '`002` rend les fichiers exécutables', '`022` cache les fichiers au groupe'], answer: 1, why: 'Le répertoire setgid donne le groupe, mais c’est le umask qui décide si le groupe peut écrire.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'L’utilisateur 1000 lance un programme en mode `-rwsr-xr-x` appartenant à root. Quels sont les identifiants du processus ?',
			options: [
				'UID réel 0 et UID effectif 0, puisque le fichier appartient à root',
				'UID réel 1000 et UID effectif 1000, car seul root peut utiliser le bit',
				'UID réel 1000 et UID effectif 0, fixé par execve depuis le propriétaire',
				'UID réel 0 et UID effectif 1000, inversés une fois le programme lancé'
			],
			answer: 2,
			why: 'execve(2) change seulement l’UID effectif pour celui du propriétaire du fichier. L’UID réel reste celui de l’appelant. Sur un montage `nosuid` ou avec `no_new_privs`, même l’UID effectif reste à 1000.'
		},
		{
			q: '`/tmp` est en mode `1777`. Bob lance `rm /tmp/alice.log`, un fichier d’alice en mode 0666. Que se passe-t-il ?',
			options: [
				'Ça marche, car tout le monde peut écrire dans `/tmp`',
				'Ça marche, car tout le monde peut écrire dans le fichier',
				'Ça échoue, car le sticky bit réserve la suppression aux propriétaires',
				'Ça échoue, car les fichiers de `/tmp` ne s’effacent qu’au démarrage'
			],
			answer: 2,
			why: 'Supprimer un fichier modifie le répertoire, c’est donc le mode du répertoire qui décide. Le sticky bit de `/tmp` n’autorise la suppression qu’au propriétaire du fichier, à celui du répertoire ou à un processus privilégié. Le mode 0666 du fichier ne joue aucun rôle.'
		},
		{
			q: 'Un service tourne avec `umask 027`. Quel mode reçoit un fichier qu’il crée avec `open(..., 0666)` ?',
			options: ['0640, `-rw-r-----`', '0750, `-rwxr-x---`', '0627, `-rw--w-rwx`', '0644, `-rw-r--r--`'],
			answer: 0,
			why: 'open(2) retire les bits du umask : 0666 & ~027 = 0640. Le groupe perd l’écriture, les autres perdent tout. 0750, c’est ce que donnerait `mkdir`, qui part de 0777.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Voir chaque bit spécial agir, avec deux utilisateurs, dans un conteneur jetable où tu es root.',
		steps: [
			'Lance le conteneur. `--tmpfs` ajoute un montage de travail que Docker monte en `nosuid` : `docker run --rm -it --tmpfs /ns:exec debian:bookworm-slim bash`.',
			'Crée deux utilisateurs et un groupe : `useradd -m alice; useradd -m bob; groupadd team; usermod -aG team alice`.',
			'Sticky bit : `mkdir /shared && chmod 1777 /shared`, puis `su alice -c \'touch /shared/alice.log && chmod 666 /shared/alice.log\'` et `su bob -c \'rm /shared/alice.log\'`.',
			'Répertoire set-group-ID : `mkdir /team && chgrp team /team && chmod 2775 /team`, puis `su alice -c \'touch /team/a.txt\'` et `stat -c \'%A %U %G %n\' /team /team/a.txt`.',
			'umask : `su alice -c \'umask 027; touch /tmp/f; mkdir /tmp/d\'` et `stat -c \'%a %n\' /tmp/f /tmp/d`.',
			'Set-user-ID : `cp /usr/bin/id /usr/local/bin/myid && chmod 4755 /usr/local/bin/myid` et `su bob -c myid`. Puis le même fichier sur le montage `nosuid` : `cp /usr/bin/id /ns/myid && chmod 4755 /ns/myid` et `su bob -c /ns/myid`. Puis `exit`.'
		],
		done: [
			'L’étape 3 affiche `Operation not permitted` alors que le fichier est en mode 666.',
			'L’étape 4 montre `/team` en `drwxrwsr-x` et `a.txt` avec le groupe `team`.',
			'L’étape 5 affiche `640 /tmp/f` et `750 /tmp/d`.',
			'`su bob -c myid` affiche `euid=0(root)`, et `su bob -c /ns/myid` non.'
		],
		solution: [
			'Le sticky bit de `/shared` ne laisse qu’alice, root ou un processus privilégié retirer `alice.log`. Le mode du fichier n’est pas vérifié.',
			'`a.txt` a pris le groupe du répertoire. Il est en `-rw-r--r--` parce que le umask par défaut, `022`, a retiré l’écriture du groupe.',
			'0666 & ~027 = 0640 et 0777 & ~027 = 0750.',
			'execve a donné à bob l’UID effectif du propriétaire du fichier, root, et a laissé l’UID réel à bob. Sur le montage `nosuid`, execve a ignoré le bit.'
		]
	},
	recall: {
		q: 'Que veulent dire les chiffres octaux 4, 2 et 1 devant un mode comme `4755`, et lequel le correctif d’urgence de PwnKit a-t-il retiré de `pkexec` ?',
		a: '4 est set-user-ID, 2 set-group-ID, 1 le sticky bit. `chmod 0755 /usr/bin/pkexec` a retiré le 4 : `pkexec` ne tournait plus en root pour chaque utilisateur.'
	},
	sources: [
		{ title: 'Avis Qualys, PwnKit : élévation de privilèges locale dans pkexec de polkit (CVE-2021-4034)', url: 'https://www.qualys.com/2022/01/25/cve-2021-4034/pwnkit.txt' },
		{ title: 'inode(7), type et mode de fichier', url: 'https://man7.org/linux/man-pages/man7/inode.7.html' },
		{ title: 'execve(2)', url: 'https://man7.org/linux/man-pages/man2/execve.2.html' },
		{ title: 'chmod(1)', url: 'https://man7.org/linux/man-pages/man1/chmod.1.html' },
		{ title: 'umask(2)', url: 'https://man7.org/linux/man-pages/man2/umask.2.html' },
		{ title: 'unlink(2), EPERM dans un répertoire sticky', url: 'https://man7.org/linux/man-pages/man2/unlink.2.html' },
		{ title: 'Source coreutils 9.5, src/chmod.c', url: CHMOD }
	]
};
