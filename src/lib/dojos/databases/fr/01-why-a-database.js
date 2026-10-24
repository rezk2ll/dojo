const ANKI = 'https://github.com/ankitects/anki/blob/c3139c607373c99c81854d61f1ddc45e4606343c/rslib/src/storage/sqlite.rs';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'why-a-database',
	part: 'Les données et les questions',
	title: 'Pourquoi une base de données plutôt qu’un fichier',
	minutes: 10,
	hook: [
		'Ton projet perso garde ses données dans `tasks.json`. Tu lis le fichier, tu modifies la liste, tu réécris le fichier. Ça marche pendant des mois.',
		'Puis le portable s’éteint en pleine sauvegarde. Ou deux onglets enregistrent au même moment, et **les changements d’un onglet disparaissent sans la moindre erreur**. Ou quelqu’un demande « toutes les tâches de la semaine », et pour répondre tu dois lire tout le fichier et boucler.',
		'Tu pourrais écrire toi-même une parade à chacun de ces trois problèmes. Une base de données contient déjà les trois. Et parfois, la bonne base reste un simple fichier : la doc de SQLite dit qu’il « does not compete with client/server databases. SQLite competes with fopen(). » (il ne joue pas contre les bases client/serveur, il joue contre `fopen()`).'
	],
	terms: [
		{ term: 'Commit atomique', def: 'Un groupe de changements arrive en entier ou pas du tout. Un crash au milieu laisse l’ancien état, jamais un mélange des deux.' },
		{ term: 'Durabilité', def: 'Dès que la base répond « committed », le changement survit à un crash ou à une coupure de courant. Il est sur le disque, pas seulement dans un cache.' },
		{ term: 'Accès concurrent', def: 'Plusieurs lecteurs et écrivains utilisent les mêmes données en même temps, sans les corrompre ni perdre d’écriture en silence.' },
		{ term: 'Rollback journal', def: 'Un fichier à part où SQLite recopie les pages d’origine avant de modifier la base. Supprimer ce fichier valide le changement.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App : BEGIN, modifie 3 pages"] -->|"copie les pages d’origine"| journal[("rollback journal")]'],
				highlight: ['app', 'journal'],
				note: 'Avant de toucher au fichier de la base, SQLite « creates a separate rollback journal file and writes into the rollback journal the original content of the database pages that are to be altered » : il crée un journal et y recopie le contenu d’origine des pages qui vont changer. Avec ce journal, SQLite peut tout annuler.'
			},
			{
				add: ['journal -->|"fsync"| disk1["journal sur le disque"]'],
				highlight: ['disk1'],
				note: 'Un nouveau fichier ne vit souvent que dans le cache de l’OS. SQLite force donc le journal sur le disque, souvent avec deux appels `fsync()`, avant de modifier quoi que ce soit d’autre. La doc parle d’« a critical step in insuring that the database can survive an unexpected power loss » (une étape critique pour survivre à une coupure de courant).'
			},
			{
				add: ['app -->|"écrit les nouvelles pages, fsync"| db[("fichier de la base")]'],
				highlight: ['db'],
				note: 'Avec un verrou exclusif, SQLite écrit les nouvelles pages dans le fichier de la base et vide encore le cache. Ces deux vidages prennent l’essentiel du temps d’un commit.'
			},
			{
				add: ['db -->|"supprime le journal"| commit["Validé"]'],
				highlight: ['commit'],
				note: 'La suppression du journal valide la transaction : « This is the instant where the transaction commits. » Pour un processus, supprimer un fichier a l’air atomique : le journal est là ou il n’y est pas. Une fois le journal supprimé, les nouvelles pages forment la base.'
			},
			{
				add: ['crash["Crash avant la suppression"] -.->|"hot journal trouvé à la prochaine ouverture"| journal', 'journal -.->|"rejoue les anciennes pages"| db'],
				highlight: ['crash'],
				note: 'À la prochaine ouverture, SQLite trouve le « hot journal » resté là et recopie les pages d’origine. La base a alors l’air de n’avoir jamais commencé la transaction. Ton `tasks.json` n’a aucun journal à rejouer.'
			}
		]
	},
	example: {
		title: 'rslib/src/storage/sqlite.rs : Anki range chaque collection de cartes dans un seul fichier SQLite',
		repo: 'ankitects/anki',
		url: `${ANKI}#L52-L595`,
		lang: 'rust',
		code: `fn open_or_create_collection_db(path: &Path) -> Result<Connection> {
    let db = Connection::open(path)?;
…
    db.busy_timeout(std::time::Duration::from_secs(0))?;

    db.pragma_update(None, "locking_mode", "exclusive")?;
    db.pragma_update(None, "page_size", 4096)?;
    db.pragma_update(None, "cache_size", -40 * 1024)?;
    db.pragma_update(None, "legacy_file_format", false)?;
    db.pragma_update(None, "journal_mode", "wal")?;
…

        if check_integrity {
            let s =
                db.pragma_query_value(None, "integrity_check", |row| row.get::<_, String>(0))?;
            require!(s == "ok", "corrupt: {s}");
        }

        let upgrade = ver != SCHEMA_MAX_VERSION;
        if create || upgrade {
            db.execute("begin exclusive", [])?;
        }
…
    /// Flush data from WAL file into DB, so the DB is safe to copy. Caller must
    /// not call this while there is an active transaction.
    pub(crate) fn checkpoint(&self) -> Result<()> {
        if !self.db.is_autocommit() {
            return Err(AnkiError::db_error(
                "active transaction",
                DbErrorKind::Other,
            ));
        }
        self.db
            .query_row_and_then("pragma wal_checkpoint(truncate)", [], |row| {
…
    pub(crate) fn begin_trx(&self) -> Result<()> {
        self.db.prepare_cached("begin exclusive")?.execute([])?;
        Ok(())
    }

    pub(crate) fn commit_trx(&self) -> Result<()> {
        if !self.db.is_autocommit() {
            self.db.prepare_cached("commit")?.execute([])?;
        }
        Ok(())
    }`,
		notes: [
			'La ligne 2 ouvre la collection avec `Connection::open(path)`. Anki n’a pas de format à lui : une collection est un fichier SQLite. La doc de SQLite décrit cet usage : le menu Fichier/Ouvrir « calls sqlite3_open() to attach to the database file », et « the File/Save menu option becomes superfluous » (le menu Enregistrer ne sert plus à rien).',
			'La ligne 6 règle `locking_mode` sur exclusive : Anki garde le verrou du fichier tant que la connexion est ouverte. La doc des pragmas en fait la première raison de l’utiliser : « The application wants to prevent other processes from accessing the database file. » La ligne 4 met `busy_timeout` à zéro, donc un second processus reçoit `SQLITE_BUSY` tout de suite au lieu d’attendre.',
			'La ligne 10 active `journal_mode` wal, qui écrit d’abord les changements dans un fichier `-wal` à part. Les lignes 24 à 34 contiennent `checkpoint`, qui recopie le fichier `-wal` dans la base : « Flush data from WAL file into DB, so the DB is safe to copy. » Le [code de sauvegarde](https://github.com/ankitects/anki/blob/c3139c607373c99c81854d61f1ddc45e4606343c/rslib/src/collection/backup.rs#L41-L42) l’appelle juste avant de lire le fichier.',
			'La ligne 21 crée ou met à jour une collection dans un `begin exclusive`, donc un crash en pleine mise à jour laisse l’ancien schéma. Les lignes 36 à 46 ouvrent et valident la transaction des modifications normales. Un commentaire du même fichier dit qu’Anki [« uses long-running transactions as an undo mechanism »](' + ANKI + '#L607-L608) (se sert de longues transactions pour annuler).',
			'Les lignes 13 à 16 lancent `integrity_check` quand l’appelant le demande, et refusent un fichier qui ne répond pas « ok ». Un format JSON maison aurait besoin de sa propre somme de contrôle pour en faire autant.'
		]
	},
	tradeoff: {
		gain: [
			'Un changement arrive en entier ou pas du tout, et SQLite lance la reprise tout seul à la prochaine ouverture.',
			'L’accès concurrent sans verrous écrits à la main : SQLite fait passer les écrivains un par un, un serveur comme PostgreSQL en laisse écrire plusieurs à la fois.',
			'« Les tâches de la semaine » tient en une requête, et un index y répond sans relire toutes les tâches.',
			'SQLite garde les bons côtés d’un fichier : un seul fichier à copier, envoyer ou sauvegarder, et aucun serveur à faire tourner.'
		],
		cost: [
			'Chaque commit attend le disque. La FAQ de SQLite : il « will easily do 50,000 or more INSERT statements per second » mais « only do a few dozen transactions per second » (des dizaines de milliers d’INSERT, mais quelques dizaines de transactions par seconde). Regroupe les changements dans une transaction.',
			'Il te faut `sqlite3` ou un autre outil pour regarder dans un fichier de base. Un JSON s’ouvre dans n’importe quel éditeur.',
			'SQLite « will only allow one writer at any instant in time » (un seul écrivain à la fois), et il n’a rien à faire sur un système de fichiers réseau partagé par plusieurs machines.',
			'Une base serveur (PostgreSQL) ajoute un processus à faire tourner, mettre à jour, sauvegarder et sécuriser.'
		]
	},
	task: {
		prompt: 'Choisis un stockage pour chaque cas : un simple fichier, SQLite ou PostgreSQL. Donne la raison qui tranche. (1) Les réglages d’un outil en ligne de commande, lus une fois au démarrage. (2) Une app de notes sur ordinateur, avec recherche et étiquettes. (3) Une boutique web avec 4 serveurs d’app qui prennent des commandes en même temps. (4) Un export CSV nocturne que quelqu’un ouvre dans un tableur.',
		hint: 'Pose trois questions : un crash au milieu fait-il mal, plus d’un processus écrit-il, et dois-tu trouver des données par leur contenu ?',
		answer: [
			'(1) Un simple fichier. Il est lu une fois, écrit rarement, par un seul processus, et quelqu’un voudra peut-être le modifier à la main.',
			'(2) SQLite. Un utilisateur, une machine, mais les modifications doivent survivre à un crash et la recherche ne doit pas relire chaque note. La doc de SQLite appelle cet usage un « format de fichier d’application », et Anki s’en sert ainsi.',
			'(3) PostgreSQL. Quatre serveurs écrivent en même temps à travers le réseau. La doc de SQLite conseille d’« avoid using SQLite in situations where the same database will be accessed directly (without an intervening application server) and simultaneously from many computers over a network » (éviter SQLite quand plusieurs machines y accèdent directement et en même temps par le réseau).',
			'(4) Un simple fichier. Un autre programme le lit. Une base peut le produire, mais l’export lui-même est un fichier.'
		],
		steps: [
			{
				title: 'Pose les trois questions',
				questions: [
					{ q: 'Ton app plante en pleine réécriture de `tasks.json`. Que trouves-tu sur le disque ?', options: ['Toujours l’ancien fichier : l’OS annule une écriture partielle', 'Un fichier qui peut mélanger ancien et nouveau, ou s’arrêter net', 'Toujours le nouveau fichier : un appel d’écriture est tout ou rien', 'Un rollback journal que l’app peut rejouer au démarrage'], answer: 1, why: 'Un simple fichier n’a pas de journal. Rien n’annule une sauvegarde arrêtée au milieu.' },
					{ q: 'Deux onglets enregistrent `tasks.json` au même moment. Que se passe-t-il ?', options: ['La seconde sauvegarde échoue avec une erreur claire', 'Le fichier garde les deux séries de changements, fusionnées', 'Les changements d’un onglet disparaissent sans erreur', 'L’OS verrouille le fichier jusqu’à la fermeture du premier onglet'], answer: 2, why: 'Chaque onglet réécrit sa propre copie de la liste. La dernière écriture gagne, et rien ne te prévient.' },
					{ q: 'Quelqu’un demande « toutes les tâches de la semaine ». Comment un fichier JSON répond-il ?', options: ['Tu lis tout le fichier et tu boucles sur chaque tâche', 'L’OS tient un index des clés du fichier', 'Tu sautes à la bonne ligne, car le JSON est trié', 'Tu lances une requête, comme avec une base'], answer: 0, why: 'Un fichier n’a pas d’index. Une base répond en une requête, et un index évite de relire toutes les tâches.' },
					{ q: 'Une fois qu’il te faut une base, quelle question tranche entre SQLite et PostgreSQL ?', options: ['Si les données tiennent en mémoire', 'Si tu dois chercher par contenu', 'Si l’app est écrite en Rust ou en Python', 'Si plusieurs machines écrivent en même temps'], answer: 3, why: 'SQLite « will only allow one writer at any instant in time » (un seul écrivain à la fois). Plusieurs machines qui écrivent ensemble, c’est le cas de PostgreSQL.' }
				]
			},
			{
				title: 'Tranche les cas à un utilisateur',
				questions: [
					{ q: '(1) Les réglages d’un outil en ligne de commande, lus une fois au démarrage. Tu choisis quoi ?', options: ['PostgreSQL', 'Un simple fichier', 'SQLite', 'SQLite sur un partage réseau'], answer: 1, why: 'Lu une fois, écrit rarement, par un seul processus. Une base règle des problèmes que ce cas n’a pas.' },
					{ q: 'Qu’est-ce qui fait pencher (1) vers un simple fichier, au-delà de sa taille ?', options: ['Quelqu’un voudra peut-être le modifier à la main', 'Un fichier est plus rapide que SQLite pour toute lecture', 'SQLite ne sait pas stocker des paires clé et valeur', 'Les réglages doivent être partagés avec d’autres machines'], answer: 0, why: 'Un JSON ou un fichier texte s’ouvre dans n’importe quel éditeur. Un fichier de base demande `sqlite3` ou un autre outil.' },
					{ q: '(2) Une app de notes sur ordinateur, avec recherche et étiquettes. Tu choisis quoi ?', options: ['Un simple fichier par note', 'PostgreSQL sur le même portable', 'SQLite', 'Un export CSV nocturne'], answer: 2, why: 'Un utilisateur sur une machine, mais les modifications doivent survivre à un crash et la recherche ne doit pas relire chaque note. La doc de SQLite parle de « format de fichier d’application ».' },
					{ q: 'Quelle app de ce chapitre utilise SQLite comme le ferait (2) ?', options: ['Chrome, qui range chaque onglet dans son propre JSON', 'Anki, qui range chaque collection de cartes dans un seul fichier SQLite', 'Firefox, qui fait tourner un serveur PostgreSQL pour les favoris', 'Anki, qui écrit un fichier JSON et calcule sa somme de contrôle'], answer: 1, why: 'Anki ouvre sa collection avec `Connection::open(path)`. Il n’a pas de format à lui.' }
				]
			},
			{
				title: 'Tranche la boutique',
				questions: [
					{ q: '(3) Une boutique web avec 4 serveurs d’app qui prennent des commandes en même temps. Tu choisis quoi ?', options: ['SQLite sur un disque réseau partagé', 'Un fichier JSON par commande', 'SQLite sur chaque serveur d’app', 'PostgreSQL'], answer: 3, why: 'Quatre serveurs écrivent en même temps à travers le réseau. Un serveur comme PostgreSQL en laisse écrire plusieurs à la fois.' },
					{ q: 'Pourquoi pas un seul fichier SQLite sur un système de fichiers réseau pour (3) ?', options: ['Le verrouillage de fichiers est bogué sur beaucoup de systèmes réseau, et ça peut corrompre le fichier', 'SQLite refuse d’ouvrir un fichier qui n’est pas sur un disque local', 'SQLite ne sait pas ranger plus d’une table par fichier', 'Les systèmes de fichiers réseau n’ont pas du tout d’appel `fsync()`'], answer: 0, why: 'La doc prévient que deux clients peuvent alors écrire au même endroit du fichier, « resulting in corruption ».' },
					{ q: 'Que fait SQLite quand un second écrivain arrive pendant que le premier tient son verrou d’écriture ?', options: ['Il fusionne les deux écritures en un seul commit', 'Il laisse les deux écrire, puis garde la dernière', 'Il fait attendre le second, ou lui renvoie `SQLITE_BUSY`', 'Il écrit le second changement dans un nouveau fichier'], answer: 2, why: 'SQLite fait passer les écrivains un par un. Anki met même `busy_timeout` à zéro, donc un second processus reçoit `SQLITE_BUSY` tout de suite.' },
					{ q: 'Que te coûte PostgreSQL que SQLite ne coûte pas ?', options: ['Un fichier que tu ne peux ni copier ni envoyer', 'Un processus à faire tourner, mettre à jour, sauvegarder et sécuriser', 'Aucun moyen de lancer une requête avec un index', 'Aucune prise en charge des transactions'], answer: 1, why: 'Une base serveur, c’est un service de plus à surveiller. C’est le prix de plusieurs écrivains à la fois.' }
				]
			},
			{
				title: 'Tranche l’export',
				questions: [
					{ q: '(4) Un export CSV nocturne que quelqu’un ouvre dans un tableur. Tu choisis quoi ?', options: ['Un simple fichier', 'SQLite', 'PostgreSQL', 'Un rollback journal'], answer: 0, why: 'Un autre programme le lit, et un tableur ouvre un CSV directement.' },
					{ q: 'Les données de la boutique vivent dans PostgreSQL. Ça change la réponse pour (4) ?', options: ['Oui : le tableur doit se connecter à PostgreSQL', 'Oui : l’export doit devenir un fichier SQLite', 'Non : une base peut le produire, mais l’export lui-même est un fichier', 'Non : un CSV est une sorte de base de données'], answer: 2, why: 'Où vivent les données et ce dont le lecteur a besoin sont deux questions. Ici, le lecteur a besoin d’un fichier.' },
					{ q: 'L’app de notes (2) plante en pleine sauvegarde, en mode rollback journal. Que fait SQLite à l’ouverture suivante ?', options: ['Il garde les pages à moitié écrites et note un avertissement', 'Il demande à l’utilisateur quelle version de chaque note garder', 'Il refuse le fichier tant que tu ne restaures pas une sauvegarde', 'Il trouve le journal resté là et recopie les pages d’origine'], answer: 3, why: 'Le journal resté derrière est « hot ». SQLite le rejoue, et la base a l’air de n’avoir jamais commencé la sauvegarde.' },
					{ q: 'Ton app de notes passe de JSON à SQLite. Qu’est-ce que ça coûte à l’utilisateur ?', options: ['Il lui faut `sqlite3` ou un autre outil pour regarder dans le fichier', 'Il lui faut un serveur qui tourne en arrière-plan', 'Il ne peut plus copier ses données en un seul fichier', 'Il perd toutes les modifications depuis la dernière sauvegarde'], answer: 0, why: 'SQLite garde la simplicité d’un seul fichier, mais un JSON s’ouvre dans n’importe quel éditeur, un fichier de base non.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'En mode rollback journal de SQLite, à quel moment une transaction compte-t-elle comme validée ?',
			options: [
				'Quand les nouvelles pages sont écrites dans le cache de l’OS du fichier de la base',
				'Quand le rollback journal est supprimé, après le vidage du fichier de la base',
				'Quand le rollback journal est vidé sur le disque avec son en-tête de pages',
				'Quand l’écrivain a fait passer son verrou pending en verrou exclusif sur le fichier'
			],
			answer: 1,
			why: 'La doc : « This is the instant where the transaction commits. » Un journal encore présent après un crash est un hot journal, et SQLite le rejoue pour annuler le changement.'
		},
		{
			q: 'Anki ouvre sa collection avec `locking_mode` exclusive. Pendant qu’Anki tourne, un script ouvre le même fichier et lance un SELECT. Que se passe-t-il ?',
			options: [
				'Le SELECT attend qu’Anki valide sa transaction en cours, puis il lit',
				'Le SELECT lit les dernières données validées dans le fichier WAL, sans verrou',
				'Le SELECT renvoie SQLITE_BUSY, car Anki garde le verrou du fichier en continu',
				'Le SELECT marche, et Anki reçoit SQLITE_BUSY à sa prochaine écriture'
			],
			answer: 2,
			why: 'La doc du WAL : « If another database connection has the database mode open in exclusive locking mode then all queries against the database will return SQLITE_BUSY. » Elle note que Chrome et Firefox font pareil avec leurs propres fichiers.'
		},
		{
			q: 'Dans quel cas la doc de SQLite elle-même conseille-t-elle une base client/serveur plutôt que SQLite ?',
			options: [
				'Une app de bureau qui range chaque document dans un fichier sur le disque local',
				'Une app mobile qui garde un cache des données du serveur pour lire hors ligne',
				'Un site sur un seul serveur dont les pages lisent beaucoup et écrivent peu',
				'Plusieurs machines qui écrivent dans un même fichier sur un système de fichiers réseau'
			],
			answer: 3,
			why: 'Le verrouillage de fichiers « is buggy in many network filesystem implementations », et deux clients peuvent alors écrire au même endroit du fichier, « resulting in corruption ». Les trois autres cas, la doc les donne comme de bons usages.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Faire planter SQLite en pleine transaction, et le voir garder l’ancien état et refuser un second écrivain.',
		steps: [
			'Crée un dossier de test et une table : `mkdir -p ~/db-lab && cd ~/db-lab && sqlite3 tasks.db "CREATE TABLE task(id INTEGER PRIMARY KEY, title TEXT NOT NULL);"`.',
			'Lance un écrivain qui ouvre une transaction et ne valide jamais : `(echo "BEGIN; INSERT INTO task(title) VALUES (\'buy milk\'), (\'call mom\');"; sleep 30) | sqlite3 tasks.db &`. Lance `ls` tout de suite : un fichier `tasks.db-journal` est apparu à côté de la base.',
			'Dans les 30 secondes, essaie un second écrivain : `sqlite3 tasks.db "INSERT INTO task(title) VALUES (\'from tab 2\');"`.',
			'Fais planter le premier écrivain avec `kill -9 %1`, puis compte les lignes : `sqlite3 tasks.db "SELECT count(*) FROM task;"`, et vérifie le fichier avec `sqlite3 tasks.db "PRAGMA integrity_check;"`.',
			'Refais-le avec un commit : `sqlite3 tasks.db "BEGIN; INSERT INTO task(title) VALUES (\'buy milk\'), (\'call mom\'); COMMIT;"`, et compte à nouveau.'
		],
		done: [
			'Le second écrivain de l’étape 3 affiche `database is locked`.',
			'Après le crash, `SELECT count(*) FROM task;` affiche `0` et `PRAGMA integrity_check;` affiche `ok`.',
			'Après la version validée, le compte vaut `2`.'
		],
		solution: [
			'Le journal contient ce qu’il faut à SQLite pour annuler le changement, donc le crash laisse l’ancien état : aucune ligne, et aucun fichier à moitié écrit.',
			'SQLite laisse entrer un écrivain à la fois. Le second reçoit `SQLITE_BUSY`, affiché `database is locked`, au lieu de perdre une écriture en silence comme les deux onglets.',
			'Seul le `COMMIT` fait compter les lignes. Refais le même test avec `tasks.json` et un `kill -9` en pleine sauvegarde : rien ne te protège.'
		]
	},
	recall: {
		q: 'Quels trois problèmes de `tasks.json` une base de données règle-t-elle, et quand choisis-tu PostgreSQL plutôt que SQLite ?',
		a: 'Un crash en pleine sauvegarde, deux écrivains qui effacent les changements l’un de l’autre, et la lecture de tout le fichier pour répondre à une question. Tu prends PostgreSQL quand plusieurs machines écrivent en même temps, car SQLite n’accepte qu’un écrivain à la fois.'
	},
	sources: [
		{ title: 'Doc SQLite, Appropriate Uses For SQLite', url: 'https://www.sqlite.org/whentouse.html' },
		{ title: 'Doc SQLite, Atomic Commit In SQLite', url: 'https://www.sqlite.org/atomiccommit.html' },
		{ title: 'Doc SQLite, SQLite As An Application File Format', url: 'https://www.sqlite.org/appfileformat.html' },
		{ title: 'Doc SQLite, Write-Ahead Logging', url: 'https://www.sqlite.org/wal.html' },
		{ title: 'FAQ SQLite, INSERT is really slow', url: 'https://www.sqlite.org/faq.html#q19' },
		{ title: 'Doc SQLite, PRAGMA locking_mode', url: 'https://www.sqlite.org/pragma.html#pragma_locking_mode' }
	]
};
