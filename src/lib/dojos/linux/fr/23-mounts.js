const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const EXEC = `${LINUX}/fs/exec.c`;
const NAMEI = `${LINUX}/fs/namei.c`;
const MAN = 'https://man7.org/linux/man-pages';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'mounts',
	part: 'Fichiers et disques',
	title: 'Les montages et leurs options',
	minutes: 10,
	hook: [
		'Dans un conteneur de test monté pour ce chapitre, `/scratch` est un tmpfs monté avec `noexec`. `ls -l` montre `/scratch/hello.sh` en `-rwxr-xr-x`. Lancer `/scratch/hello.sh` affiche `Permission denied`, et bash sort avec 126. Lancer `sh /scratch/hello.sh` affiche `hello`.',
		'Le mode du fichier autorise l’exécution, le montage l’interdit. mount(8) définit `noexec` ainsi : « Do not permit direct execution of any binaries on the mounted filesystem » (pas d’exécution directe de binaires sur ce montage). **Au moment de l’`execve`, le noyau vérifie les options du montage en plus du mode du fichier.** `sh` lit le script comme de simples données, ce que `noexec` ne bloque pas.',
		'Le même conteneur montre `nosuid` à l’œuvre. Une copie de `/usr/bin/id` avec le bit setuid, lancée sous l’utilisateur `nobody`, affiche `euid=0(root)` depuis un tmpfs normal, et aucun `euid` depuis un tmpfs monté avec `nosuid`.'
	],
	terms: [
		{ term: 'Montage', def: 'Le rattachement d’un système de fichiers à un répertoire, le point de montage. Après `mount /dev/sdb1 /data`, les chemins sous `/data` mènent dans ce système de fichiers. `findmnt` liste chaque montage avec ses options.' },
		{ term: 'Option de montage', def: 'Un drapeau posé sur un montage, comme `ro`, `noexec`, `nosuid` ou `nodev`. Le noyau le vérifie à chaque accès par ce montage. Deux montages du même système de fichiers peuvent avoir des options différentes.' },
		{ term: 'Montage bind', def: 'Un second montage d’un répertoire déjà monté, créé avec `mount --bind olddir newdir`. Les deux chemins montrent les mêmes fichiers.' },
		{ term: 'Propagation', def: 'Le fait qu’un montage ou un démontage sous un point de montage soit répété dans d’autres espaces de noms de montage. Les types sont shared, slave, private et unbindable.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['fstab["/etc/fstab : UUID=0f22... / ext4 noatime,errors=remount-ro 0 1"] --> boot["Monté au démarrage avec ces options"]'],
				highlight: ['fstab', 'boot'],
				note: 'Chaque ligne de fstab a six champs : le périphérique, le point de montage, le type, les options, un drapeau pour dump et l’ordre de fsck. Cette ligne vient du portable de test : la racine, montée en `noatime`, vérifiée en premier (`1`). fstab(5) ajoute que sur un système systemd, « it’s recommended to use systemctl daemon-reload after fstab modification ».'
			},
			{
				add: ['boot --> opts["Chaque montage a ses drapeaux : /run est rw,nosuid,nodev,noexec"]'],
				highlight: ['opts'],
				note: 'Sur le portable de test, `findmnt --target /run` montre les options `rw,nosuid,nodev,noexec,relatime,size=2836536k,mode=755,inode64`. `nodev` veut dire « Do not interpret character or block special devices on the filesystem » (les fichiers de périphérique y sont ignorés). Ces drapeaux appartiennent au montage, donc `findmnt` les affiche par point de montage.'
			},
			{
				add: ['opts --> ex["execve(/scratch/hello.sh)"]', 'ex -->|"path_noexec : MNT_NOEXEC posé"| eacces["EACCES : Permission denied, bash sort avec 126"]'],
				highlight: ['ex', 'eacces'],
				note: 'execve(2) liste « EACCES The filesystem is mounted noexec. » bash(1) : « If a command is found but is not executable, the return status is 126. » `sh hello.sh` marche, parce que `execve` lance `/bin/sh`, qui vit sur le montage racine, puis `sh` ouvre le script avec un simple `read`.'
			},
			{
				add: ['opts --> suid["execve d’un fichier setuid sur un montage nosuid"]', 'suid -->|"mnt_may_suid est faux"| plain["Tourne avec l’UID de l’appelant : pas d’euid=0"]'],
				highlight: ['suid', 'plain'],
				note: 'mount(8) : `nosuid` veut dire « Do not honor set-user-ID and set-group-ID bits or file capabilities when executing programs from this filesystem. » Le programme tourne quand même, sous l’utilisateur qui l’a lancé. Sur le portable de test, `/dev/shm` et `/run` sont montés en `nosuid` : un utilisateur qui peut y écrire ne peut pas y déposer un binaire setuid root qui fonctionne.'
			},
			{
				add: ['bind["mount --bind /scratch /ro"] --> rob["mount -o remount,bind,ro /ro"]', 'rob --> two["/ro est en lecture seule, /scratch reste inscriptible"]'],
				highlight: ['bind', 'rob', 'two'],
				note: 'mount(8) : « After this call the same contents are accessible in two places. » Dans le conteneur de test, `touch /ro/x` a échoué avec `Read-only file system`, `touch /scratch/y` a marché, puis `ls /ro` a listé `y`. Le drapeau `ro` est posé sur le montage `/ro` seulement, et le superbloc reste inscriptible.'
			},
			{
				add: ['two --> prop["Propagation : shared sur la plupart des systèmes, private après unshare"]'],
				highlight: ['prop'],
				note: 'mount_namespaces(7) : « systemd(1) automatically remounts all mounts as MS_SHARED on system startup. » Un montage fait sous un montage shared est répété sous tous les autres montages de son groupe de pairs, y compris dans d’autres espaces de noms. Sur le portable de test, `findmnt` affiche `shared` dans la colonne PROPAGATION pour `/`. unshare(1) fait l’inverse et lance l’équivalent de `mount --make-rprivate /` dans le nouvel espace de noms.'
			}
		]
	},
	example: {
		title: 'fs/exec.c : do_open_execat refuse un fichier sur un montage noexec',
		repo: 'torvalds/linux',
		url: `${EXEC}#L884-L916`,
		lang: 'c',
		code: `static struct file *do_open_execat(int fd, struct filename *name, int flags)
{
	struct file *file;
	struct open_flags open_exec_flags = {
		.open_flag = O_LARGEFILE | O_RDONLY | __FMODE_EXEC,
		.acc_mode = MAY_EXEC,
		.intent = LOOKUP_OPEN,
		.lookup_flags = LOOKUP_FOLLOW,
	};

	if ((flags & ~(AT_SYMLINK_NOFOLLOW | AT_EMPTY_PATH)) != 0)
		return ERR_PTR(-EINVAL);
	if (flags & AT_SYMLINK_NOFOLLOW)
		open_exec_flags.lookup_flags &= ~LOOKUP_FOLLOW;
	if (flags & AT_EMPTY_PATH)
		open_exec_flags.lookup_flags |= LOOKUP_EMPTY;

	file = do_filp_open(fd, name, &open_exec_flags);
	if (IS_ERR(file))
		return file;

	/*
	 * In the past the regular type check was here. It moved to may_open() in
	 * 633fb6ac3980 ("exec: move S_ISREG() check earlier"). Since then it is
	 * an invariant that all non-regular files error out before we get here.
	 */
	if (WARN_ON_ONCE(!S_ISREG(file_inode(file)->i_mode)) ||
	    path_noexec(&file->f_path)) {
		fput(file);
		return ERR_PTR(-EACCES);
	}

	return file;`,
		notes: [
			'`execve` arrive dans cette fonction par `alloc_bprm`. La ligne 6 ouvre le fichier avec `MAY_EXEC`. Dans `do_filp_open` (ligne 18), [`may_open`](' + NAMEI + '#L3359-L3364) renvoie `-EACCES` pour un fichier ordinaire quand `path_noexec()` est vrai, puis vérifie les bits `x` du fichier.',
			'Les lignes 27 et 28 refont la vérification une fois le fichier ouvert. [`path_noexec`](' + EXEC + '#L112-L116) est vrai quand le montage porte `MNT_NOEXEC` ou que le superbloc porte `SB_I_NOEXEC`. La ligne 30 renvoie `-EACCES`, que bash affiche comme `Permission denied`.',
			'La vérification utilise `file->f_path`, le montage par lequel le chemin est passé. Sur un montage bind en `noexec`, le même fichier s’exécute sans problème par l’autre chemin.',
			'`nosuid` est traité plus loin dans le même fichier : [`bprm_fill_uid`](' + EXEC + '#L1622-L1623) s’arrête tout de suite quand `mnt_may_suid()` est faux, donc le nouveau programme garde l’UID et le GID de l’appelant.'
		]
	},
	tradeoff: {
		gain: [
			'`noexec`, `nosuid` et `nodev` sur `/tmp`, `/dev/shm` ou un répertoire d’upload empêchent un utilisateur d’y lancer un binaire déposé ou un fichier setuid planté.',
			'Un montage bind en lecture seule donne à un conteneur ou à un chroot l’accès à un répertoire sans droit d’écriture, alors que le chemin d’origine reste inscriptible.',
			'La propagation shared fait apparaître un montage fait sur l’hôte (un disque USB, un partage NFS) dans les conteneurs qui utilisent des montages slave ou shared.'
		],
		cost: [
			'`noexec` n’arrête ni `sh script.sh` ni `python3 script.py` : l’interpréteur vit sur un autre montage et se contente de lire le fichier.',
			'Un `remount` remet à zéro les drapeaux VFS que tu ne répètes pas. mount(8) : « The default kernel behavior for VFS mount flags (nodev,nosuid,noexec,ro) is to reset all unspecified flags on remount. »',
			'Une faute de frappe dans `/etc/fstab` peut bloquer le prochain démarrage sur un shell de secours. `findmnt --verify` vérifie le fichier avant le redémarrage.'
		]
	},
	task: {
		prompt: 'Écris une ligne `/etc/fstab` qui monte un tmpfs de 2 GiB sur `/var/tmp`, sans exécution, sans setuid et sans fichiers de périphérique. Donne les commandes pour l’appliquer sans redémarrer et pour vérifier les options.',
		hint: 'Les six champs sont : périphérique, point de montage, type, options, dump, ordre de fsck. tmpfs accepte une option `size=` avec un suffixe `k`, `m` ou `g`.',
		answer: [
			'`tmpfs /var/tmp tmpfs size=2g,nosuid,nodev,noexec 0 0`. Le champ périphérique vaut juste `tmpfs`. Dump et ordre de fsck valent 0 : il n’y a rien à sauvegarder ni à vérifier sur un système de fichiers en mémoire.',
			'`sudo findmnt --verify` vérifie le fichier. Ensuite `sudo systemctl daemon-reload`, comme le recommande fstab(5) sur un système systemd, puis `sudo mount /var/tmp`, qui lit le reste de la ligne dans fstab.',
			'`findmnt /var/tmp` doit montrer `rw,nosuid,nodev,noexec` et la taille. Teste : copie `/bin/true` dedans et lance-le. Tu dois obtenir `Permission denied` et le code de sortie 126.',
			'Ce qui était dans `/var/tmp` avant reste sur la racine, caché sous le nouveau montage jusqu’au démontage.'
		],
		steps: [
			{
				title: 'Remplis les champs',
				questions: [
					{ q: 'Dans quel ordre viennent les six champs de fstab ?', options: ['Point de montage, périphérique, type, options, ordre de fsck, dump', 'Périphérique, point de montage, type, options, dump, ordre de fsck', 'Type, périphérique, point de montage, options, dump, ordre de fsck', 'Périphérique, type, point de montage, options, ordre de fsck, dump'], answer: 1, why: 'fstab(5) : le périphérique, le point de montage, le type, les options, un drapeau pour dump et l’ordre de fsck.' },
					{ q: 'Que mets-tu dans le champ périphérique pour un tmpfs ?', options: ['`/dev/shm`', 'L’UUID du disque racine', '`/dev/tmpfs0`', 'Juste `tmpfs`'], answer: 3, why: 'Un tmpfs vit en mémoire et n’a pas de périphérique bloc. Le champ vaut juste le mot `tmpfs`.' },
					{ q: 'Que mets-tu dans les deux derniers champs ?', options: ['`0 0`', '`0 1`', '`1 1`', '`0 2`'], answer: 0, why: 'Il n’y a rien à sauvegarder ni à vérifier sur un système de fichiers en mémoire. `1` sert pour la racine, vérifiée en premier.' },
					{ q: 'Comment écris-tu la taille de 2 GiB ?', options: ['`size=2GiB`', '`blocks=2g`', '`size=2g`', '`maxsize=2048`'], answer: 2, why: 'tmpfs accepte une option `size=` avec un suffixe `k`, `m` ou `g`.' }
				]
			},
			{
				title: 'Choisis les options',
				questions: [
					{ q: 'Quelle option empêche de lancer directement un programme depuis `/var/tmp` ?', options: ['`noexec`', '`ro`', '`nodev`', '`noatime`'], answer: 0, why: 'mount(8) : `noexec` veut dire « Do not permit direct execution of any binaries on the mounted filesystem ».' },
					{ q: 'Quelle option fait ignorer le bit setuid au noyau ?', options: ['`nodev`', '`nosuid`', '`noexec`', '`nouser`'], answer: 1, why: '`nosuid` : « Do not honor set-user-ID and set-group-ID bits or file capabilities ». Le programme tournerait sous son appelant.' },
					{ q: 'Quelle option rend inopérants les fichiers de périphérique ?', options: ['`nosuid`', '`noexec`', '`private`', '`nodev`'], answer: 3, why: '`nodev` : « Do not interpret character or block special devices on the filesystem ».' },
					{ q: 'La ligne complète est donc...', options: ['`/var/tmp tmpfs tmpfs size=2g,nosuid,nodev,noexec 0 0`', '`tmpfs /var/tmp ext4 size=2g,nosuid,nodev,noexec 0 1`', '`tmpfs /var/tmp tmpfs size=2g,nosuid,nodev,noexec 0 0`', '`tmpfs /var/tmp tmpfs size=2g,ro,noexec 0 0`'], answer: 2, why: 'Périphérique `tmpfs`, point de montage `/var/tmp`, type `tmpfs`, la taille et les trois options, puis `0 0`.' }
				]
			},
			{
				title: 'Applique-la sans redémarrer',
				questions: [
					{ q: 'Que lances-tu d’abord, avant de monter quoi que ce soit ?', options: ['`sudo reboot`', '`sudo findmnt --verify`', '`sudo mount -a --fake`', '`sudo fsck /var/tmp`'], answer: 1, why: 'Une faute de frappe dans fstab peut bloquer le prochain démarrage sur un shell de secours. `findmnt --verify` vérifie le fichier avant.' },
					{ q: 'Que recommande fstab(5) après une modification du fichier sur un système systemd ?', options: ['`sudo systemctl daemon-reload`', '`sudo systemctl restart fstab`', '`sudo update-fstab`', 'Rien : systemd le relit à chaque montage'], answer: 0, why: 'fstab(5) : « it’s recommended to use systemctl daemon-reload after fstab modification ».' },
					{ q: 'Quelle commande le monte avec les options de la ligne ?', options: ['`sudo mount --fake /var/tmp`', '`sudo mount -o remount /var/tmp`', '`sudo mount --bind /var/tmp /var/tmp`', '`sudo mount /var/tmp`'], answer: 3, why: 'Avec seulement le point de montage, `mount` lit le reste de la ligne dans fstab.' },
					{ q: 'Que deviennent les fichiers déjà présents dans `/var/tmp` ?', options: ['Ils sont copiés dans le tmpfs', 'Ils sont supprimés', 'Ils restent sur la racine, cachés jusqu’au démontage', 'Ils partent dans `/tmp`'], answer: 2, why: 'Un montage recouvre le répertoire. Les anciens fichiers sont toujours sur le disque, dessous.' }
				]
			},
			{
				title: 'Vérifie les options',
				questions: [
					{ q: 'Quelle commande montre les options réelles du montage ?', options: ['`cat /etc/fstab`', '`findmnt /var/tmp`', '`ls -ld /var/tmp`', '`df -i /var/tmp`'], answer: 1, why: 'fstab, c’est ce que tu as demandé. `findmnt` montre le montage en place : `rw,nosuid,nodev,noexec` et la taille.' },
					{ q: 'Root lance `mknod /var/tmp/null c 1 3`, puis `echo hi > /var/tmp/null`. Que se passe-t-il ?', options: ['`Permission denied` : `nodev` empêche d’ouvrir le fichier de périphérique', '`hi` part vers le périphérique null', '`mknod` échoue avec `Read-only file system`', 'Le noyau supprime le fichier'], answer: 0, why: 'mount(8) : `nodev` veut dire "Do not interpret character or block special devices". Le fichier existe, mais l’ouvrir comme périphérique est refusé.' },
					{ q: 'Une tâche écrit 3 GiB dans `/var/tmp`. Que se passe-t-il à 2 GiB ?', options: ['Le noyau tue la tâche', 'Le reste déborde sur le disque racine', 'Le tmpfs grandit pour suivre', 'L’écriture échoue avec `No space left on device`'], answer: 3, why: '`size=2g` plafonne le tmpfs. Une fois plein, les écritures échouent comme sur un disque plein.' },
					{ q: 'Qu’est-ce qui remet ces options en place au prochain démarrage ?', options: ['Un `mount -o remount` lancé une fois', '`systemctl daemon-reload` tout seul', 'La ligne dans `/etc/fstab`', '`findmnt --verify`'], answer: 2, why: 'Au démarrage, systemd transforme chaque ligne de fstab en unité de montage. Les autres commandes ne font que vérifier ou changer le système en cours.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`/tmp` est monté en `noexec`. Un utilisateur lance `bash /tmp/payload.sh`. Que se passe-t-il ?',
			options: [
				'bash refuse avec Permission denied et sort avec 126',
				'Le script tourne, parce que bash ne fait que lire le fichier',
				'Le noyau tue bash avec SIGKILL pour avoir touché un montage noexec',
				'Le script tourne seulement si l’utilisateur possède le fichier'
			],
			answer: 1,
			why: '`noexec` est vérifié dans `execve`, pour le fichier exécuté. Ici `execve` lance `/bin/bash` depuis le montage racine, et bash ouvre le script en lecture. Seul `/tmp/payload.sh` lancé directement reçoit `EACCES`.'
		},
		{
			q: 'Tu lances `mount --bind /srv/data /mnt/ro` puis `mount -o remount,bind,ro /mnt/ro`. Une appli écrit dans `/srv/data/log`. Que se passe-t-il ?',
			options: [
				'L’écriture marche, et le nouveau fichier apparaît sous /mnt/ro',
				'L’écriture échoue, car le système de fichiers est en lecture seule',
				'L’écriture marche, mais /mnt/ro garde l’ancien contenu',
				'L’écriture échoue tant que /mnt/ro n’est pas démonté'
			],
			answer: 0,
			why: 'Le drapeau `ro` est posé sur le montage `/mnt/ro`, et le superbloc reste inscriptible. Les deux montages montrent les mêmes fichiers, donc une écriture par `/srv/data` apparaît sous `/mnt/ro`.'
		},
		{
			q: 'Un programme setuid root se trouve sur un disque USB monté en `nosuid`. Un utilisateur ordinaire le lance. Que fait le noyau ?',
			options: [
				'Il refuse de lancer le programme et renvoie EACCES',
				'Il lance le programme en root et écrit un avertissement',
				'Il lance le programme avec l’UID de l’appelant',
				'Il retire le bit setuid du fichier sur le disque'
			],
			answer: 2,
			why: 'Dans `bprm_fill_uid`, `mnt_may_suid()` est faux sur un montage nosuid, donc la fonction s’arrête avant de prendre l’UID effectif du propriétaire du fichier. Le programme tourne, sans privilège en plus.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Appliquer la ligne fstab de la tâche dans un conteneur jetable, puis voir `noexec` et un montage bind en lecture seule à l’œuvre.',
		steps: [
			'Lance un conteneur qui a le droit de monter (rien ne change sur ton hôte) : `docker run --rm -it --privileged debian:12-slim bash`.',
			'Ajoute la ligne et vérifie le fichier : `echo "tmpfs /var/tmp tmpfs size=2g,nosuid,nodev,noexec 0 0" >> /etc/fstab`, puis `findmnt --verify`.',
			'Monte-le depuis fstab et lis les options en place : `mount /var/tmp`, puis `findmnt /var/tmp`.',
			'Essaie d’y lancer du code : `cp /bin/true /var/tmp/true; /var/tmp/true; echo $?`. Puis `printf \'#!/bin/sh\\necho hello\\n\' > /var/tmp/hello.sh; chmod +x /var/tmp/hello.sh`, et lance `/var/tmp/hello.sh` puis `sh /var/tmp/hello.sh`.',
			'Crée une seconde vue en lecture seule : `mkdir /ro; mount --bind /var/tmp /ro; mount -o remount,bind,ro /ro`. Lance `touch /ro/x`, `touch /var/tmp/y`, `ls /ro`, puis sors avec `exit`.'
		],
		done: [
			'`findmnt --verify` affiche `Success, no errors or warnings detected`.',
			'`findmnt /var/tmp` montre `rw,nosuid,nodev,noexec` et `size=2097152k`.',
			'`/var/tmp/true` affiche `Permission denied` et `echo $?` affiche `126`, alors que `sh /var/tmp/hello.sh` affiche `hello`.',
			'`touch /ro/x` échoue avec `Read-only file system`, et `ls /ro` liste le `y` créé par `/var/tmp`.'
		],
		solution: [
			'`--privileged` donne au conteneur le droit d’appeler `mount`. Sans lui, `mount` échoue avec `Permission denied`.',
			'`2g` s’affiche comme `2097152k` : 2 × 1024 × 1024 KiB.',
			'Le script en mode `-rwxr-xr-x` échoue quand même lancé directement : le drapeau du montage l’emporte sur le mode du fichier à l’`execve`. `sh` vit sur le montage racine et lit le script comme des données.',
			'`findmnt -o TARGET,OPTIONS /ro` montre `ro` sur `/ro` alors que `/var/tmp` reste en `rw` : le drapeau appartient au montage, pas au système de fichiers.'
		]
	},
	recall: {
		q: 'Un script sur un montage `noexec` a le mode `-rwxr-xr-x`. Que font `./script.sh` et `sh script.sh`, et pourquoi ?',
		a: '`./script.sh` échoue avec `Permission denied` et le code 126 : l’ouverture pour exécution voit `MNT_NOEXEC` par `path_noexec` et renvoie `EACCES`. `sh script.sh` tourne : `execve` lance `/bin/sh` depuis un autre montage, qui lit le script comme des données.'
	},
	sources: [
		{ title: 'mount(8), page de manuel Linux', url: `${MAN}/man8/mount.8.html` },
		{ title: 'fstab(5), page de manuel Linux', url: `${MAN}/man5/fstab.5.html` },
		{ title: 'mount_namespaces(7), page de manuel Linux', url: `${MAN}/man7/mount_namespaces.7.html` },
		{ title: 'execve(2), page de manuel Linux', url: `${MAN}/man2/execve.2.html` },
		{ title: 'tmpfs(5), page de manuel Linux', url: `${MAN}/man5/tmpfs.5.html` },
		{ title: 'bash(1), page de manuel Linux (EXIT STATUS)', url: `${MAN}/man1/bash.1.html` }
	]
};
