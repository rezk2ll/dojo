const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const HEAPAM = `${PG}/src/backend/access/heap/heapam.c`;
const README = `${PG}/src/backend/access/transam/README`;
const XACT = `${PG}/src/backend/access/transam/xact.c`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'wal',
	part: 'Dans le moteur',
	title: 'Le journal d’écriture anticipée',
	minutes: 10,
	hook: [
		'Tu fais un virement de 10 euros entre deux comptes et tu reçois `COMMIT`. Une seconde plus tard, le courant saute. Quand le serveur redémarre, les 10 euros sont-ils sur un compte, sur l’autre, sur les deux ou sur aucun ?',
		'Écrire les pages modifiées sur le disque à chaque commit donnerait la bonne réponse, mais lentement : un virement peut toucher des pages partout dans la table et ses index, et chacune est une écriture aléatoire. **PostgreSQL écrit d’abord une entrée de journal, et les pages plus tard.** Le journal est un fichier écrit dans l’ordre, et un commit n’attend que l’arrivée de ce fichier sur le disque.',
		'Après un crash, PostgreSQL reconstruit les changements de pages perdus en **rejouant** le journal depuis le dernier checkpoint. SQLite a un mode WAL qui suit la même règle.'
	],
	terms: [
		{ term: 'WAL', def: 'Write-ahead log : un enregistrement en ajout seul de chaque changement des tables et des index, dans les fichiers de `pg_wal`. Un changement est journalisé avant que la page qu’il décrit puisse arriver sur le disque.' },
		{ term: 'LSN', def: 'Log sequence number : une position dans le WAL. Chaque page de données retient le LSN du dernier enregistrement WAL qui l’a modifiée.' },
		{ term: 'Checkpoint', def: 'Un point où toutes les pages modifiées en mémoire ont été écrites dans les fichiers de données. La reprise part du dernier, et le WAL plus ancien peut être recyclé. Toutes les 5 minutes ou tous les 1 GB de WAL par défaut.' },
		{ term: 'Full-page write', def: 'Le premier changement d’une page après un checkpoint journalise une copie de la page entière de 8 kB, pour pouvoir reconstruire une page déchirée par un crash en pleine écriture.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['tx["UPDATE accounts SET balance = balance - 10"] --> buf["Shared buffer : la page de 8 kB modifiée en mémoire, marquée sale"]'],
				highlight: ['tx', 'buf'],
				note: 'PostgreSQL charge la page dans les shared buffers, y modifie la ligne et marque la page comme sale. Rien ne part encore dans le fichier de données. Le changement en mémoire va vite, et un crash à ce moment-là l’effacerait.'
			},
			{
				add: ['buf --> rec["Enregistrement WAL ajouté, page tamponnée avec son LSN"]', 'rec -->|"COMMIT : vidage jusqu’à l’enregistrement de commit"| wal[("pg_wal : écrit dans l’ordre")]'],
				highlight: ['rec', 'wal'],
				note: 'Un enregistrement WAL qui décrit le changement part dans les buffers WAL, et la page est tamponnée avec la position de cet enregistrement, son LSN. Au `COMMIT`, le serveur vide le WAL jusqu’à l’enregistrement de commit et attend le disque. Un seul vidage séquentiel peut couvrir beaucoup de petites transactions d’un coup.'
			},
			{
				add: ['wal --> ok["Le client reçoit COMMIT"]'],
				highlight: ['ok'],
				note: 'Avec `synchronous_commit = on`, le réglage par défaut, `COMMIT` n’est annoncé qu’une fois le WAL vidé sur le disque. La page de données elle-même peut rester sale en mémoire pendant des minutes. Après un crash, le journal suffit pour la reconstruire.'
			},
			{
				add: ['ckpt["Checkpoint : toutes les 5 min ou tous les 1 GB de WAL"] -->|"écrit toutes les pages sales"| data[("Fichiers de données : tables et index")]', 'buf -.->|"seulement une fois le WAL vidé jusqu’au LSN de la page"| data'],
				highlight: ['ckpt', 'data'],
				note: 'Avant d’écrire une page sale dans les fichiers de données, le gestionnaire de buffers vérifie que le WAL est vidé au moins jusqu’au LSN de la page. Un checkpoint écrit toutes les pages sales, étalées dans le temps pour éviter un pic d’I/O, et note d’où la reprise pourra partir. Le WAL d’avant ce point peut être recyclé.'
			},
			{
				add: ['crash["Après un crash : redo depuis le dernier checkpoint"] --> wal', 'crash -->|"réapplique les enregistrements plus récents que chaque page"| data'],
				highlight: ['crash'],
				note: 'Au redémarrage, PostgreSQL lance le redo : il lit le WAL depuis le point de redo du dernier checkpoint et réapplique chaque enregistrement à sa page, en sautant les pages dont le LSN montre que le changement y est déjà. Les virements commités reviennent. Ceux qui ne l’étaient pas n’ont pas d’enregistrement de commit et restent invisibles.'
			}
		]
	},
	example: {
		title: 'src/backend/access/heap/heapam.c : heap_insert, modifier la page, puis la journaliser',
		repo: 'postgres/postgres',
		url: `${HEAPAM}#L2142-L2258`,
		lang: 'c',
		code: `	/* NO EREPORT(ERROR) from here till changes are logged */
	START_CRIT_SECTION();

	RelationPutHeapTuple(relation, buffer, heaptup,
						 (options & HEAP_INSERT_SPECULATIVE) != 0);
…
	MarkBufferDirty(buffer);

	/* XLOG stuff */
	if (RelationNeedsWAL(relation))
	{
…
		XLogBeginInsert();
		XLogRegisterData(&xlrec, SizeOfHeapInsert);
…
		XLogRegisterBuffer(HEAP_INSERT_BLKREF_HEAP, buffer,
						   REGBUF_STANDARD | bufflags);
		XLogRegisterBufData(HEAP_INSERT_BLKREF_HEAP, &xlhdr,
							SizeOfHeapHeader);
…
		recptr = XLogInsert(RM_HEAP_ID, info);

		PageSetLSN(page, recptr);

		if (vmbuffer_modified)
			PageSetLSN(BufferGetPage(vmbuffer), recptr);
	}

	END_CRIT_SECTION();`,
		notes: [
			'Les [règles d’écriture du WAL](' + README + '#L437-L469) du README listent les étapes que ce code suit dans l’ordre : verrouiller le buffer, `START_CRIT_SECTION()` (ligne 2), appliquer le changement (lignes 4 et 5), `MarkBufferDirty()` (ligne 7), construire et insérer l’enregistrement WAL (lignes 13 à 21), `PageSetLSN()` (ligne 23), `END_CRIT_SECTION()` (ligne 29).',
			'Les lignes 2 et 29 ouvrent et ferment une section critique. Le README dit que toute erreur pendant ces étapes « must cause a PANIC because the shared buffers will contain unlogged changes, which we have to ensure don\'t get to disk » (doit provoquer un PANIC, car les buffers contiennent des changements non journalisés qui ne doivent pas atteindre le disque). Le commentaire de la ligne 1 dit la même chose : pas d’`ERROR` avant que le changement soit journalisé.',
			'La ligne 23 tamponne la page avec le LSN de son enregistrement WAL. Le [même README](' + README + '#L407-L415) pose la règle de base : « log entries must reach stable storage before the data-page changes they describe » (le journal doit être durable avant les pages qu’il décrit). C’est ce tampon qui l’impose : « Before the bufmgr can write out a dirty page, it must ensure that xlog has been flushed to disk at least up to the page\'s LSN. »',
			'Dans [`RecordTransactionCommit`](' + XACT + '#L1502-L1533), une transaction qui a écrit du WAL avec `synchronous_commit` activé appelle `XLogFlush(XactLastRecEnd)` avant que le commit soit visible. Désactivé, `XLogSetAsyncXactLSN` dit seulement au WAL writer de vider bientôt. La doc fixe la fenêtre de risque à « three times wal_writer_delay » (trois fois wal_writer_delay) : 600 ms avec la valeur par défaut de 200 ms.',
			'SQLite suit la même règle en mode WAL : « the changes are appended into a separate WAL file » (les changements s’ajoutent dans un fichier WAL à part) et « A COMMIT occurs when a special record indicating a commit is appended to the WAL ». Il fait un checkpoint par défaut quand le WAL atteint 1000 pages. Avec `PRAGMA synchronous=NORMAL`, il saute le sync au commit : les commits vont plus vite, et les derniers peuvent se perdre à une coupure de courant.'
		]
	},
	tradeoff: {
		gain: [
			'Des commits rapides : un seul vidage séquentiel du journal au lieu d’écritures aléatoires sur chaque page modifiée, et un seul `fsync` peut commiter beaucoup de transactions concurrentes.',
			'La sûreté face aux crashs : après une coupure, rejouer le WAL ramène chaque transaction commitée et aucune de celles qui ne l’étaient pas.',
			'Le même journal alimente les sauvegardes à un instant précis et les réplicas en streaming (jours 27 et 28).'
		],
		cost: [
			'Chaque changement est écrit deux fois : une fois dans le WAL, plus tard dans le fichier de données. Les full-page writes ajoutent une page entière de 8 kB au premier changement après chaque checkpoint.',
			'Avec des checkpoints fréquents, la reprise est courte, mais il y a plus d’écritures de pages et plus d’images complètes. Avec des checkpoints rares, il y a moins d’I/O, mais la reprise après un crash est plus longue.',
			'La garantie ne tient que si `fsync` rend la main une fois les données vraiment sur le stockage durable. Un disque ou un contrôleur avec un cache write-back volatil peut annoncer une écriture comme faite et la perdre à la coupure de courant.',
			'`synchronous_commit = off` accélère les commits mais peut perdre les dernières centaines de millisecondes de transactions commitées lors d’un crash.'
		]
	},
	task: {
		prompt: 'Dans `psql` : crée `accounts(id int primary key, balance int not null)` avec 100 000 lignes, puis lance `CHECKPOINT`. Lance ensuite trois updates avec `EXPLAIN (ANALYZE, WAL)` : `UPDATE accounts SET balance = balance - 10 WHERE id = 1`, puis la même chose pour `id = 2` (même page), puis un nouveau `CHECKPOINT` et `id = 3`. Compare la ligne `WAL:` du nœud du haut. Explique la différence.',
		hint: 'Regarde `fpi` (full-page images) et `bytes`. Quel update est le premier changement de sa page depuis le dernier checkpoint ?',
		answer: [
			'`id = 1`, juste après le checkpoint : `WAL: records=4 fpi=3 bytes=19737` sur PostgreSQL 18. Chaque page touchée pour la première fois depuis le checkpoint voit son image entière de 8 kB journalisée : trois images ici.',
			'`id = 2`, même page, sans checkpoint entre les deux : `WAL: records=2 bytes=127`. La page a déjà une image complète dans le WAL depuis le dernier checkpoint, donc seul le petit changement est journalisé.',
			'`id = 3` après un nouveau `CHECKPOINT` : `fpi=1 bytes=8342`. Le checkpoint remet la règle à zéro, et le premier changement de la page repaie une image complète.',
			'La doc prévient qu’un intervalle de checkpoint plus court « increases the volume of output to the WAL » (augmente le volume écrit dans le WAL). Ces images permettent à la reprise de reconstruire une page à moitié écrite au moment de la coupure.'
		],
		steps: [
			{
				title: 'Prépare le test',
				questions: [
					{ q: 'Pourquoi lancer `CHECKPOINT` avant le premier update ?', options: ['Pour vider le WAL et partir de zéro', 'Pour que les updates aillent plus vite', 'Pour que le prochain changement de chaque page soit le premier depuis un checkpoint', 'Pour verrouiller la table pendant le test'], answer: 2, why: 'La règle des pages complètes compte à partir du dernier checkpoint. Juste après, chaque page que tu touches paie une image.' },
					{ q: 'Quelle commande affiche le WAL écrit par chaque update ?', options: ['`EXPLAIN (ANALYZE, WAL) UPDATE ...`', '`EXPLAIN (BUFFERS) UPDATE ...`', '`SELECT * FROM pg_wal`', '`SHOW wal_level`'], answer: 0, why: 'L’option `WAL` ajoute à chaque nœud une ligne `WAL:` avec les enregistrements, les images de pages complètes et les octets.' },
					{ q: 'Que fait un checkpoint ?', options: ['Il vide sur disque le WAL de chaque transaction ouverte et les committe', 'Il écrit toutes les pages modifiées dans les fichiers de données et marque d’où la reprise peut partir', 'Il copie les fichiers de données dans une sauvegarde d’où part la reprise', 'Il retire les lignes mortes de chaque table et libère leur place'], answer: 1, why: 'La reprise part du dernier checkpoint, et le WAL d’avant ce point peut être recyclé.' },
					{ q: 'Dans la ligne `WAL:`, que compte `fpi` ?', options: ['Les insertions de pages ratées que le serveur a relancées', 'Les appels à fsync faits au commit pour vider le WAL', 'Les pages libres restées dans la table après l’update', 'Les full-page images : des pages entières de 8 kB copiées dans le WAL'], answer: 3, why: '`fpi` est le nombre d’images de pages complètes que l’instruction a journalisées.' }
				]
			},
			{
				title: 'Lis le premier update',
				questions: [
					{ q: 'Que montre `id = 1`, juste après le checkpoint, sur PostgreSQL 18 ?', options: ['`WAL: records=2 bytes=127`', '`WAL: records=4 fpi=3 bytes=19737`', '`WAL: records=1 fpi=1 bytes=8342`', 'Pas de ligne WAL, puisque rien n’est écrit avant le commit'], answer: 1, why: 'Quatre enregistrements, trois images de pages complètes, environ 19,7 kB pour un changement de quelques octets.' },
					{ q: 'Pourquoi autant d’octets pour un petit changement ?', options: ['Trois pages sont touchées pour la première fois depuis le checkpoint, et chacune journalise une image complète', 'L’update réécrit toutes les lignes de la table, et chaque ligne est journalisée', 'Le WAL garde le texte SQL complet et le résultat de l’instruction', 'Le checkpoint tourne encore et ajoute ses propres enregistrements à la ligne'], answer: 0, why: 'Chaque page touchée pour la première fois depuis le checkpoint voit son image entière journalisée : trois images ici.' },
					{ q: 'Quelle taille environ pour une image de page complète ?', options: ['127 octets', '1 GB', '8 kB, une page entière', '19,7 kB'], answer: 2, why: 'Une image est une copie de la page entière de 8 kB. Trois images font l’essentiel des 19 737 octets.' },
					{ q: 'Pourquoi journaliser une page entière plutôt que le seul changement ?', options: ['Pour rendre les commits plus rapides', 'Pour que les réplicas sautent les fichiers de données', 'Parce que le WAL ne sait pas garder de petits enregistrements', 'Pour pouvoir reconstruire une page déchirée par un crash en pleine écriture'], answer: 3, why: 'Si le courant coupe pendant qu’une page est à moitié écrite, l’image dans le WAL permet à la reprise de la reconstruire.' }
				]
			},
			{
				title: 'Compare les deux suivants',
				questions: [
					{ q: 'Que montre `id = 2`, sur la même page, sans checkpoint entre les deux ?', options: ['`WAL: records=4 fpi=3 bytes=19737`', '`WAL: records=1 fpi=1 bytes=8342`', '`WAL: records=2 bytes=127`', '`WAL: records=0 bytes=0`'], answer: 2, why: 'Pas d’image de page complète : seul le petit changement est journalisé.' },
					{ q: 'Pourquoi pas d’image complète cette fois ?', options: ['Les updates de l’id 2 ne sont jamais journalisés', 'La page a déjà une image complète dans le WAL depuis le dernier checkpoint', 'Le premier update tient encore la page', 'Les buffers du WAL étaient pleins'], answer: 1, why: 'L’image n’est due qu’une fois par page et par checkpoint. L’update de `id = 1` l’a déjà payée.' },
					{ q: 'Que montre `id = 3`, après un nouveau `CHECKPOINT` ?', options: ['`fpi=1 bytes=8342`', '`fpi=0 bytes=127`', '`fpi=3 bytes=19737`', '`fpi=2 bytes=16000`'], answer: 0, why: 'Une image de page complète, environ 8 kB, plus le changement lui-même.' },
					{ q: 'Qu’est-ce qui a fait repayer une image à `id = 3` ?', options: ['Une autre ligne sur une nouvelle page', 'Un changement plus gros que les deux premiers', 'L’autovacuum passé entre les deux', 'Le nouveau checkpoint a remis la règle à zéro'], answer: 3, why: 'Le checkpoint remet la règle à zéro, et le premier changement de la page après lui journalise de nouveau une image complète.' }
				]
			},
			{
				title: 'Explique la différence',
				questions: [
					{ q: 'Tu baisses `checkpoint_timeout`. Qu’arrive-t-il au WAL ?', options: ['Il grossit : plus de premiers changements après un checkpoint journalisent une image complète', 'Il rétrécit : chaque checkpoint efface du WAL', 'Rien : les images complètes ne dépendent pas des checkpoints', 'Les commits n’y écrivent plus'], answer: 0, why: 'La doc prévient qu’un intervalle de checkpoint plus court « increases the volume of output to the WAL ».' },
					{ q: 'Que coûte plutôt un intervalle de checkpoint plus long ?', options: ['Des commits plus lents', 'Des commits moins durables', 'Un rejeu plus long après un crash', 'Plus d’images de pages complètes'], answer: 2, why: 'Des checkpoints rares font moins d’I/O, mais la reprise a plus de WAL à rejouer.' },
					{ q: 'Quand l’`UPDATE` de `id = 1` est commité, qu’est-ce qui est sûrement sur disque ?', options: ['La page modifiée dans le fichier de données', 'Le WAL jusqu’à l’enregistrement de commit', 'Rien avant le prochain checkpoint', 'Seulement les images de pages complètes'], answer: 1, why: 'Avec `synchronous_commit = on`, le commit attend le flush du WAL. La page de données peut rester modifiée en mémoire.' },
					{ q: 'Après un crash, comment PostgreSQL récupère-t-il ce changement ?', options: ['Depuis une copie du changement que le client garde jusqu’à l’écriture', 'Depuis le réplica, qui renvoie les pages qu’il a déjà', 'En relançant les instructions SQL trouvées dans le journal du serveur', 'En rejouant le WAL depuis le dernier checkpoint sur chaque page'], answer: 3, why: 'Le redo lit le WAL depuis le dernier checkpoint et réapplique chaque enregistrement, en sautant les pages dont le LSN montre que le changement y est déjà.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Avec les réglages par défaut, qu’est-ce qui est arrivé sur le disque quand le client reçoit `COMMIT` ?',
			options: [
				'Chaque page de table et d’index modifiée par la transaction, vidée avec fsync',
				'Le WAL jusqu’à l’enregistrement de commit ; les pages modifiées peuvent être encore en mémoire',
				'Rien encore : le WAL writer vide le commit quelques centaines de millisecondes plus tard',
				'Seulement l’enregistrement de commit, les autres enregistrements WAL attendent le checkpoint'
			],
			answer: 1,
			why: 'Avec `synchronous_commit = on`, `RecordTransactionCommit` appelle `XLogFlush` jusqu’à la fin de l’enregistrement de commit avant d’annoncer le succès. Le WAL est vidé dans l’ordre, donc tous les enregistrements précédents de la transaction sont aussi sur le disque. Les pages de données suivent au prochain checkpoint, ou quand le gestionnaire de buffers les évince.'
		},
		{
			q: 'Pourquoi PostgreSQL peut-il laisser une page modifiée non écrite pendant des minutes après le commit ?',
			options: [
				'Parce que la page n’est écrite que lorsque la requête suivante la lit',
				'Parce que le client garde une copie du changement jusqu’à l’écriture de la page',
				'Parce que le WAL sur disque contient tout ce qu’il faut pour refaire le changement après un crash',
				'Parce que les fichiers de données sont recopiés depuis un réplica après un crash'
			],
			answer: 2,
			why: 'Une fois l’enregistrement WAL durable, la page peut être reconstruite à partir de lui après un crash. Le gestionnaire de buffers doit seulement s’assurer que le WAL est vidé jusqu’au LSN de la page avant de l’écrire.'
		},
		{
			q: 'Tu baisses `checkpoint_timeout` de 5 minutes à 30 secondes pour accélérer la reprise. Que se passe-t-il d’autre ?',
			options: [
				'Les commits ralentissent, parce que chaque commit attend maintenant un checkpoint',
				'Le WAL grossit, parce que plus de premiers changements après un checkpoint journalisent une page entière',
				'Rien d’autre, parce que les checkpoints ne touchent que des pages déjà propres',
				'La durabilité baisse, parce que les pages sont écrites avant leurs enregistrements WAL'
			],
			answer: 1,
			why: 'Avec full_page_writes activé, le premier changement de chaque page après un checkpoint journalise la page entière. Plus de checkpoints, c’est plus de ces images et plus d’écritures de pages. Les commits n’attendent toujours que le vidage du WAL, et la règle du WAL avant les données ne change pas.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Tuer PostgreSQL en plein travail et voir le WAL ramener les changements commités, et seulement eux.',
		steps: [
			'Lance PostgreSQL 18 sans `--rm`, pour que ses données survivent à un kill : `docker run -d --name pg-wal -e POSTGRES_PASSWORD=lab postgres:18`, attends quelques secondes, puis `docker exec -it pg-wal psql -U postgres`.',
			'Crée la table et note la position du WAL : `CREATE TABLE accounts (id int primary key, balance int not null); INSERT INTO accounts SELECT i, 100 FROM generate_series(1, 100000) i; CHECKPOINT; SELECT pg_current_wal_lsn();`',
			'Commite un virement et regarde de nouveau : `BEGIN; UPDATE accounts SET balance = balance - 10 WHERE id = 1; UPDATE accounts SET balance = balance + 10 WHERE id = 2; COMMIT; SELECT pg_current_wal_lsn(), pg_walfile_name(pg_current_wal_lsn());`. Dans un autre terminal, liste les fichiers du WAL : `docker exec pg-wal ls /var/lib/postgresql/18/docker/pg_wal`.',
			'Dans un deuxième `psql` (`docker exec -it pg-wal psql -U postgres`), commence un changement sans le commiter : `BEGIN; UPDATE accounts SET balance = 0 WHERE id <= 50;`',
			'Coupe le courant : `docker kill pg-wal` (pas d’arrêt propre), puis `docker start pg-wal`, attends quelques secondes et lis le journal : `docker logs pg-wal 2>&1 | grep -E "not properly shut down|redo"`. Reconnecte-toi et lance `SELECT id, balance FROM accounts WHERE id <= 2;` puis `SELECT count(*) FROM accounts WHERE balance = 0;`. Nettoie avec `docker rm -f pg-wal`.'
		],
		done: [
			'Le LSN après le virement est plus haut que celui d’après le checkpoint.',
			'Le journal affiche `database system was not properly shut down; automatic recovery in progress`, puis `redo starts at` et `redo done at`.',
			'Après le redémarrage, les comptes 1 et 2 ont 90 et 110, et le comptage de `balance = 0` vaut 0.'
		],
		solution: [
			'`COMMIT` a attendu que le WAL arrive sur le disque, pas les pages de données. Les pages modifiées pouvaient encore n’être qu’en mémoire au moment du kill.',
			'Au redémarrage, le redo a rejoué le WAL depuis le dernier checkpoint et réappliqué le virement à ses pages.',
			'L’update non commité n’a pas d’enregistrement de commit dans le WAL, donc ses versions de lignes restent invisibles : aucun compte n’est à 0.'
		]
	},
	recall: {
		q: 'Avec les réglages par défaut, qu’est-ce qui est sur le disque quand le client reçoit `COMMIT`, et comment PostgreSQL récupère-t-il les pages modifiées après un crash ?',
		a: 'Le WAL jusqu’à l’enregistrement de commit, vidé par `XLogFlush`. Les pages modifiées peuvent être encore en mémoire. Après un crash, le redo rejoue le WAL depuis le dernier checkpoint et réapplique chaque enregistrement à sa page.'
	},
	sources: [
		{ title: 'Doc PostgreSQL 18, Write-Ahead Logging (WAL)', url: 'https://www.postgresql.org/docs/18/wal-intro.html' },
		{ title: 'Doc PostgreSQL 18, WAL Configuration', url: 'https://www.postgresql.org/docs/18/wal-configuration.html' },
		{ title: 'Doc PostgreSQL 18, Asynchronous Commit', url: 'https://www.postgresql.org/docs/18/wal-async-commit.html' },
		{ title: 'Source PostgreSQL, src/backend/access/transam/README', url: 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339/src/backend/access/transam/README' },
		{ title: 'Doc SQLite, Write-Ahead Logging', url: 'https://www.sqlite.org/wal.html' }
	]
};
