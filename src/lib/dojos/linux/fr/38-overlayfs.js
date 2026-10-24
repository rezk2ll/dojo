const CONTAINERD = 'https://github.com/containerd/containerd/blob/eea131263805bb19f26d0ade516c4c375fcc9029';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'overlayfs',
	part: 'Les conteneurs vus du noyau',
	title: 'Les couches d’image et overlayfs',
	minutes: 10,
	hook: [
		'Un Dockerfile écrit un fichier de 100 MB dans une étape `RUN` et le supprime à l’étape suivante. Dans un conteneur de cette image, `ls /big.bin` répond `No such file or directory`. Pourtant `docker history` affiche `100MB` et `4.1kB` pour ces deux étapes, et `docker save` produit une archive de 103 678 464 octets.',
		'L’étape de suppression n’a retiré aucun octet. Sa couche est un tar de 77 octets qui contient une seule entrée, `.wh.big.bin` : un whiteout, un marqueur qui cache `big.bin` aux couches du dessous. **La couche de 100 MB fait toujours partie de l’image**, et chaque push ou pull de l’image la transporte.',
		'Avec `head -c 100000000 /dev/urandom > /big.bin && rm /big.bin` dans un seul `RUN`, la couche pèse `4.1kB` et l’archive 3 646 464 octets. Ces chiffres viennent de Docker 29.9 sur Linux 6.17, lancé pendant l’écriture de ce chapitre.'
	],
	terms: [
		{ term: 'Répertoire inférieur', def: 'Une arborescence en lecture seule dans un montage overlay. Chaque couche d’image en est une, et l’option `lowerdir=` les liste, la couche du haut en premier, séparées par `:`. En anglais : lower directory.' },
		{ term: 'Répertoire supérieur', def: 'L’arborescence modifiable posée au-dessus, donnée par `upperdir=`. Toutes les modifications du conteneur y atterrissent. Docker l’appelle la couche du conteneur.' },
		{ term: 'Copy-up', def: 'L’étape où overlayfs copie un fichier d’un répertoire inférieur vers le répertoire supérieur, avant la première écriture ou avant un changement de propriétaire ou de droits.' },
		{ term: 'Whiteout', def: 'Une entrée du répertoire supérieur qui cache un nom aux répertoires inférieurs. Sur le disque, c’est un périphérique caractère de numéro 0/0 ; dans le tar d’une couche d’image, un fichier vide nommé `.wh.<name>`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['snap["snapshotter overlay de containerd"] -->|"mount -t overlay"| merged["/ du conteneur (vue fusionnée)"]', 'lower[("lowerdir : couches de l’image, lecture seule")] --> merged', 'upper[("upperdir : couche du conteneur, vide au départ")] --> merged'],
				highlight: ['snap', 'merged'],
				note: 'Au démarrage d’un conteneur, le snapshotter monte un overlay comme racine. Dans un conteneur `alpine:3.20`, `/proc/self/mountinfo` montre `lowerdir=` avec deux chemins sous `snapshots/<id>/fs`, puis `upperdir=.../snapshots/25038/fs` et `workdir=.../snapshots/25038/work`. La doc du noyau exige que le répertoire de travail soit sur le même système de fichiers que le supérieur.'
			},
			{
				add: ['merged -->|"ouvrir a.txt en lecture"| look{"nom dans upper ? sinon premier lower qui l’a"}'],
				highlight: ['look'],
				note: 'Une recherche regarde d’abord le répertoire supérieur, puis les inférieurs à partir du haut. La doc : avec `lowerdir=/lower1:/lower2:/lower3`, « lower1 will be the top, lower2 the middle and lower3 the bottom layer ». La lecture d’un fichier jamais modifié va directement à la copie du dessous, sans aucune écriture.'
			},
			{
				add: ['merged -->|"première écriture dans big.bin"| cu["copy_up : fichier entier copié dans upper, puis écrit"]', 'cu --> upper'],
				highlight: ['cu'],
				note: 'Avant la première écriture, overlayfs remonte le fichier : il crée les répertoires parents dans upper, puis le fichier avec le même propriétaire, les mêmes droits et la même mtime, puis copie les données. Pendant l’écriture, `echo x >> merged/big.bin` sur un fichier inférieur de 50 000 000 octets a laissé un fichier de 50 000 002 octets dans upper.'
			},
			{
				add: ['merged -->|"rm big.bin"| wh["whiteout dans upper : périphérique caractère 0, 0"]', 'wh --> upper'],
				highlight: ['wh'],
				note: 'Une suppression ne peut pas toucher au répertoire inférieur, donc overlayfs écrit un whiteout. `ls -l upper` affichait `c--------- ... 0, 0 ... big.bin`, et `du -s lower` montrait toujours 48 836 KB. La vue fusionnée ne liste plus `big.bin`.'
			},
			{
				add: ['upper -->|"fin de l’étape de build"| layer["couche d’image : tar de upper, .wh.big.bin pour le whiteout"]'],
				highlight: ['layer'],
				note: 'Pendant un build, chaque `RUN` écrit ses changements dans une nouvelle couche : un tar des fichiers ajoutés ou modifiés, plus des whiteouts pour les fichiers supprimés. La spec d’image OCI note un whiteout comme un fichier vide dont le nom est « the prefix `.wh.` plus the basename of the path to be deleted ». Les couches du dessous gardent leurs octets.'
			}
		]
	},
	example: {
		title: 'plugins/snapshots/overlay/overlay.go : le montage que containerd passe au runtime',
		repo: 'containerd/containerd',
		url: `${CONTAINERD}/plugins/snapshots/overlay/overlay.go#L556-L619`,
		lang: 'go',
		code: `func (o *snapshotter) mounts(s storage.Snapshot, info snapshots.Info) []mount.Mount {
	var options []string
…
	if len(s.ParentIDs) == 0 {
		// if we only have one layer/no parents then just return a bind mount as overlay
		// will not work
		roFlag := "rw"
		if s.Kind == snapshots.KindView {
			roFlag = "ro"
		}
		return []mount.Mount{
			{
				Source: o.upperPath(s.ID),
				Type:   "bind",
				Options: append(options,
					roFlag,
					"rbind",
				),
			},
		}
	}

	if s.Kind == snapshots.KindActive {
		options = append(options,
			"workdir="+o.workPath(s.ID),
			"upperdir="+o.upperPath(s.ID),
		)
	} else if len(s.ParentIDs) == 1 {
		return []mount.Mount{
			{
				Source: o.upperPath(s.ParentIDs[0]),
				Type:   "bind",
				Options: append(options,
					"ro",
					"rbind",
				),
			},
		}
	}

	parentPaths := make([]string, len(s.ParentIDs))
	for i := range s.ParentIDs {
		parentPaths[i] = o.upperPath(s.ParentIDs[i])
	}
	options = append(options, "lowerdir="+strings.Join(parentPaths, ":"))
	options = append(options, o.options...)

	return []mount.Mount{
		{
			Type:    "overlay",
			Source:  "overlay",
			Options: options,
		},
	}
}`,
		notes: [
			'Lignes 4 à 20 : un snapshot sans parent reçoit un simple bind mount de son répertoire `fs`. Le commentaire de la ligne 5 dit qu’avec une seule couche, overlay « will not work ».',
			'Lignes 23 à 27 : un snapshot actif, le type modifiable que reçoit un conteneur, ajoute `workdir=` et `upperdir=`, tous deux dans `snapshots/<id>/`.',
			'Lignes 28 à 39 : une vue en lecture seule sur une seule couche donne encore un bind mount, cette fois avec `ro`.',
			'Les lignes 41 à 45 construisent `lowerdir=` en joignant les chemins `fs` des parents avec `:`. containerd range `ParentIDs` « ordered from the highest to the lowest base » ([metastore.go](' + CONTAINERD + '/core/snapshots/storage/metastore.go#L49-L54)) : la couche la plus récente vient en premier, c’est le haut pour le noyau.',
			'Les lignes 48 à 54 renvoient un seul montage de type `overlay`. Le runtime le monte ensuite comme racine du conteneur, et c’est la ligne que tu lis dans `/proc/self/mountinfo`.'
		]
	},
	tradeoff: {
		gain: [
			'Les conteneurs d’une même image partagent les mêmes répertoires inférieurs. La doc de Docker : à la création d’un conteneur, Docker « only needs to create the thin writable container layer ».',
			'Un conteneur qui supprime un fichier inférieur de 50 MB laisse le répertoire inférieur intact : `du -s lower` affichait encore 48 836 KB, pour tous les autres conteneurs qui utilisent cette couche.'
		],
		cost: [
			'Un fichier supprimé dans une couche suivante reste dans la précédente : la couche de 100 MB reste dans l’image après le `rm`.',
			'La première écriture dans un gros fichier le copie en entier : ajouter 2 octets à un fichier de 50 MB a écrit 50 MB dans upper. La doc de Docker conseille des volumes pour les charges qui écrivent beaucoup, comme les bases de données.',
			'Un `chmod` ou un `chown` sur un fichier inférieur déclenche aussi un copy-up : un `RUN chown -R` sur un gros répertoire le duplique dans une nouvelle couche.'
		]
	},
	task: {
		prompt: 'Construis deux images à partir d’`alpine:3.20`. Image A : `RUN head -c 100000000 /dev/urandom > /big.bin`, puis `RUN rm /big.bin`. Image B : les deux mêmes commandes reliées par `&&` dans un seul `RUN`. Compare `docker history` et la taille de `docker save <image> | wc -c`. Puis extrais l’archive de A et liste la dernière couche avec `tar tvf`. Explique les chiffres.',
		hint: 'Dans l’archive, `manifest.json` liste les couches dans l’ordre. La dernière correspond à l’étape `rm`.',
		answer: [
			'Image A : `docker history` affiche `100MB` pour l’étape `head` et `4.1kB` pour `rm`. `docker save` écrit 103 678 464 octets.',
			'La dernière couche de A est un tar de 77 octets avec une seule entrée : `---------- 0/0 0 ... .wh.big.bin`. Le whiteout cache `big.bin` dans la vue fusionnée, et la couche de 100 MB du dessous ne change pas.',
			'Image B : une couche de `4.1kB`, et `docker save` écrit 3 646 464 octets. Le fichier a été créé et supprimé dans la même étape, il n’a jamais atteint une couche.',
			'Des octets aléatoires ne se compressent pas : la couche de 100 MB reste proche de 100 MB dans l’archive (100 030 702 octets ici).'
		],
		steps: [
			{
				title: 'Construis les deux images',
				questions: [
					{ q: 'Combien de couches l’image A ajoute-t-elle au-dessus d’`alpine:3.20` ?', options: ['Une', 'Deux, une par `RUN`', 'Trois, une par ligne', 'Aucune, les étapes `RUN` n’ajoutent pas de couche'], answer: 1, why: 'Chaque `RUN` écrit ses changements dans une nouvelle couche : A en ajoute une pour `head` et une pour `rm`.' },
					{ q: 'Que contient la couche d’une étape `RUN` ?', options: ['Une copie complète du système de fichiers après l’étape', 'Seulement la ligne de commande lancée', 'Un tar des fichiers ajoutés ou modifiés, plus des whiteouts pour les suppressions', 'Un diff binaire de chaque bloc modifié'], answer: 2, why: 'Une couche est un ensemble de changements : les fichiers que l’étape a ajoutés ou modifiés, et une entrée `.wh.<name>` pour chaque fichier supprimé.' },
					{ q: 'Dans l’image B, pourquoi `big.bin` n’atteint-il aucune couche ?', options: ['Il a été créé et supprimé dans la même étape', 'Le builder ignore les fichiers de plus de 50 MB', 'B compresse mieux les octets aléatoires', '`&&` lance la deuxième commande dans un nouveau conteneur'], answer: 0, why: 'La couche enregistre l’état à la fin de l’étape. À ce moment, `big.bin` a déjà disparu.' },
					{ q: 'Les deux images partent d’`alpine:3.20`. Que partagent leurs conteneurs sur le disque ?', options: ['Rien, chaque image a sa propre copie', 'Seulement le dossier `/etc`', 'Le répertoire supérieur', 'Les répertoires inférieurs d’alpine'], answer: 3, why: 'Les conteneurs qui ont les mêmes couches partagent les mêmes répertoires inférieurs. Chacun n’a que son propre répertoire supérieur, très fin.' }
				]
			},
			{
				title: 'Compare les tailles',
				questions: [
					{ q: 'Qu’affiche `docker history` pour les deux étapes de A ?', options: ['`100MB` et `0B`', '`100MB` et `4.1kB`', '`4.1kB` et `4.1kB`', '`100MB` et `-100MB`'], answer: 1, why: 'La couche `head` contient le fichier de 100 MB. La couche `rm` ne contient qu’un whiteout, elle est minuscule.' },
					{ q: '`docker save` écrit 103 678 464 octets pour A et 3 646 464 pour B. Qu’est-ce qui explique l’écart ?', options: ['L’archive de A contient le cache de build', 'B a été compressé et pas A', 'A porte toujours la couche de 100 MB, B ne l’a jamais eue', 'A a une image de base plus grosse'], answer: 2, why: 'L’étape de suppression n’a retiré aucun octet de la couche du dessous. Seul B a gardé le fichier hors de toute couche.' },
					{ q: 'Pourquoi la couche de 100 MB reste-t-elle proche de 100 MB dans l’archive ?', options: ['Des octets aléatoires ne se compressent pas', '`docker save` ajoute le cache de build à chaque couche', 'Le whiteout la double', 'Docker remplit les couches jusqu’à une taille fixe'], answer: 0, why: 'Le fichier vient de `/dev/urandom`. Sans rien à compresser, la couche reste vers 100 030 702 octets.' },
					{ q: 'Tu pousses l’image A vers un registre. Que passe sur le réseau ?', options: ['Seulement la dernière couche, la plus récente', 'Seulement les fichiers visibles dans la vue fusionnée', 'Rien pour `big.bin`, le whiteout l’annule', 'La couche de 100 MB aussi, car elle fait partie de l’image'], answer: 3, why: 'Un push ou un pull transporte toutes les couches. Le whiteout cache le fichier dans la vue fusionnée, mais n’enlève pas les octets du dessous.' }
				]
			},
			{
				title: 'Lis la dernière couche',
				questions: [
					{ q: 'Dans l’archive extraite, quel fichier donne l’ordre des couches ?', options: ['`manifest.json`', '`index.json` tout seul', 'Les noms de fichiers, triés par hash', '`repositories`'], answer: 0, why: '`manifest.json` liste les couches dans l’ordre. La dernière correspond à l’étape `rm`.' },
					{ q: '`tar tvf` sur cette couche affiche une seule entrée. Laquelle ?', options: ['`big.bin`, vide', '`.wh.big.bin`, un fichier vide', '`big.bin.deleted`, 100 MB', 'Un périphérique caractère nommé `big.bin`'], answer: 1, why: 'La couche est un tar de 77 octets qui contient `.wh.big.bin`, le whiteout sous sa forme de couche d’image.' },
					{ q: 'Que veut dire le préfixe `.wh.` ?', options: ['Un fichier caché écrit par l’appli', 'Un lien physique vers le fichier inférieur', 'Un whiteout : cache ce nom aux couches du dessous', 'Un fichier qui attend un copy-up'], answer: 2, why: 'La spec d’image OCI stocke un whiteout comme un fichier vide nommé « the prefix `.wh.` plus the basename of the path to be deleted ».' },
					{ q: 'Dans le répertoire supérieur d’un conteneur qui tourne, à quoi ressemble ce même whiteout ?', options: ['Un fichier `.wh.big.bin`', 'Un lien symbolique vers `/dev/null`', 'Un dossier vide', 'Un périphérique caractère de numéro 0/0'], answer: 3, why: 'Sur le disque, overlayfs écrit un périphérique caractère 0/0. Le nom `.wh.` est sa forme dans le tar d’une couche.' }
				]
			},
			{
				title: 'Explique les chiffres',
				questions: [
					{ q: 'Pourquoi `rm` n’a-t-il pas fait maigrir l’image A ?', options: ['Une suppression ne peut pas toucher une couche inférieure, elle ajoute juste un whiteout au-dessus', 'Docker a oublié de lancer l’étape `rm`', 'L’étape `rm` a échoué sans rien dire', 'Un whiteout prend autant de place que le fichier'], answer: 0, why: 'Les couches inférieures sont en lecture seule. La nouvelle couche cache le nom, et la couche du dessous garde ses octets.' },
					{ q: 'Comment gardes-tu un fichier temporaire hors de toute couche ?', options: ['En le supprimant dans un `RUN` suivant', 'En le créant et le supprimant dans le même `RUN`', 'En l’écrivant dans `/tmp`, qui n’est jamais dans une couche', 'En l’ajoutant au `.dockerignore`'], answer: 1, why: 'Une couche, c’est l’état à la fin de son étape. Si le fichier a disparu à ce moment, aucune couche ne le contient.' },
					{ q: 'Un `RUN chown -R app /data` passe sur un gros dossier venu d’une couche précédente. Que se passe-t-il ?', options: ['Seul le champ propriétaire change dans l’ancienne couche', 'Rien n’est écrit, le propriétaire n’est qu’une métadonnée', 'Chaque fichier est remonté par copy-up, le dossier est dupliqué dans une nouvelle couche', 'Le build échoue car les couches inférieures sont en lecture seule'], answer: 2, why: '`chmod` ou `chown` sur un fichier inférieur déclenche un copy-up : la nouvelle couche en garde une copie complète.' },
					{ q: 'Un conteneur ajoute 2 octets à un fichier de 50 MB venu de l’image. Qu’arrive-t-il dans le répertoire supérieur ?', options: ['Un diff de 2 octets', 'Rien, l’écriture va dans le fichier inférieur', 'Un whiteout et les 2 octets', 'Une copie complète de 50 MB du fichier, plus les 2 octets'], answer: 3, why: 'La première écriture remonte tout le fichier. Pendant l’écriture du chapitre, le répertoire supérieur contenait un fichier de 50 000 002 octets.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un Dockerfile télécharge une archive de 300 MB dans un `RUN` et la supprime dans le `RUN` suivant. Quelle taille fait l’image ?',
			options: [
				'Environ 300 MB de plus, car la première couche contient toujours l’archive',
				'La même que sans l’archive, car la suppression libère la place',
				'Environ 600 MB de plus, car l’étape de suppression remonte l’archive',
				'La même, car le builder fusionne les couches qui s’annulent'
			],
			answer: 0,
			why: 'La couche de la deuxième étape ne contient qu’un whiteout, `.wh.<name>`, qui cache le fichier dans la vue fusionnée. La première couche ne change pas et fait toujours partie de l’image. Faire les deux dans un seul `RUN` garde le fichier hors de toute couche.'
		},
		{
			q: 'Un conteneur ajoute une ligne à un fichier de 2 GB venu de l’image. Que se passe-t-il la première fois ?',
			options: [
				'La ligne va dans la couche de l’image, qu’overlayfs rend modifiable pour l’occasion',
				'Seule la nouvelle ligne est écrite dans le répertoire supérieur, sous forme de diff',
				'overlayfs copie les 2 GB entiers dans le répertoire supérieur, puis écrit',
				'L’écriture échoue avec `EROFS`, car les répertoires inférieurs sont en lecture seule'
			],
			answer: 2,
			why: 'Une écriture dans un fichier inférieur déclenche un copy-up : overlayfs crée le fichier dans le répertoire supérieur et copie toutes ses données avant l’écriture. La doc du noyau : « the data is copied from the lower to the upper filesystem ». Les écritures suivantes vont directement dans la copie du haut.'
		},
		{
			q: 'Dans un conteneur qui tourne, tu fais `rm` sur un fichier qui vient de l’image. Qu’apparaît-il dans le répertoire supérieur ?',
			options: [
				'Rien : overlayfs supprime le fichier du répertoire inférieur',
				'Un périphérique caractère de numéro 0/0, avec le même nom',
				'Une copie du fichier, marquée avec l’attribut `trusted.overlay.opaque`',
				'Un fichier nommé `.wh.<name>` qui garde les octets supprimés'
			],
			answer: 1,
			why: 'La doc du noyau : « A whiteout is created as a character device with 0/0 device number ». Quand la vue fusionnée le trouve, le nom correspondant des répertoires inférieurs est caché. Le nom `.wh.` est la forme d’un whiteout dans le tar d’une couche d’image.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Construire une image dont l’étape de suppression ne libère rien, trouver le whiteout dans sa dernière couche, et voir les changements propres d’un conteneur.',
		steps: [
			'Crée deux dossiers de build : `mkdir -p ~/layers-lab/a ~/layers-lab/b && cd ~/layers-lab`, puis `printf \'FROM alpine:3.20\\nRUN head -c 100000000 /dev/urandom > /big.bin\\nRUN rm /big.bin\\n\' > a/Dockerfile` et `printf \'FROM alpine:3.20\\nRUN head -c 100000000 /dev/urandom > /big.bin && rm /big.bin\\n\' > b/Dockerfile`.',
			'Construis les deux : `docker build -q -t layers-a a && docker build -q -t layers-b b`.',
			'Compare : `docker history layers-a | head -3`, `docker history layers-b | head -2`, puis `docker save layers-a | wc -c` et `docker save layers-b | wc -c`.',
			'Ouvre l’archive de A et liste sa dernière couche : `mkdir -p out && docker save layers-a | tar -x -C out`, puis `LAST=$(grep -o \'blobs/sha256/[0-9a-f]*\' out/manifest.json | tail -1); ls -l out/$LAST; tar tvf out/$LAST`.',
			'Regarde la couche supérieure d’un conteneur : `docker run --name ovl-lab alpine:3.20 sh -c \'rm /etc/motd; echo x >> /etc/profile; touch /new.txt\'`, puis `docker diff ovl-lab`. Fais le ménage avec `docker rm ovl-lab` et `docker rmi layers-a layers-b`.'
		],
		done: [
			'`docker history layers-a` affiche `4.1kB` pour l’étape `rm` et `100MB` pour l’étape `head`. `layers-b` a une seule étape de `4.1kB`.',
			'`docker save` donne environ 103,7 millions d’octets pour A et environ 3,6 millions pour B.',
			'La dernière couche de A fait 77 octets, et `tar tvf` affiche une seule entrée, `.wh.big.bin`.',
			'`docker diff` affiche `C /etc`, `C /etc/profile`, `D /etc/motd` et `A /new.txt`.'
		],
		solution: [
			'Le deuxième `RUN` de A ne pouvait pas retirer d’octets de la couche du dessous, il a donc écrit un whiteout. B a créé et supprimé le fichier dans la même étape : aucune couche ne l’a jamais contenu.',
			'`manifest.json` liste d’abord le blob de config, puis les couches dans l’ordre : la dernière correspondance `blobs/sha256/...` est la couche `rm`.',
			'`docker diff` lit le répertoire supérieur du conteneur : `D` est un whiteout, `C` un copy-up (tout `/etc/profile` a été copié avant l’ajout), et `A` un nouveau fichier.'
		]
	},
	recall: {
		q: 'Une étape de build supprime un fichier de 100 MB créé à l’étape d’avant. Que contient la nouvelle couche, et pourquoi l’image ne rétrécit-elle pas ?',
		a: 'Un whiteout : un tar de 77 octets avec une seule entrée, `.wh.big.bin`. Il cache le fichier dans la vue fusionnée, et la couche de 100 MB du dessous garde ses octets et reste dans l’image.'
	},
	sources: [
		{ title: 'Doc du noyau Linux, Overlay Filesystem', url: 'https://docs.kernel.org/filesystems/overlayfs.html' },
		{ title: 'Spec d’image OCI, Image Layer Filesystem Changeset : Whiteouts', url: 'https://github.com/opencontainers/image-spec/blob/ca68a05fad732be329ef67e713c3af60fb7d5f76/layer.md#whiteouts' },
		{ title: 'Doc Docker, Storage drivers', url: 'https://docs.docker.com/engine/storage/drivers/' },
		{ title: 'containerd, plugins/snapshots/overlay/overlay.go', url: `${CONTAINERD}/plugins/snapshots/overlay/overlay.go` }
	]
};
