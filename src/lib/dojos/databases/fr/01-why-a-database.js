const ANKI = 'https://github.com/ankitects/anki/blob/c3139c607373c99c81854d61f1ddc45e4606343c/rslib/src/storage/sqlite.rs';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'why-a-database',
	part: 'Les données et les questions',
	title: 'Pourquoi pas de simples fichiers ?',
	minutes: 10,
	hook: [
		'Ton projet perso garde ses données dans `tasks.json`. Tu lis le fichier, tu modifies la liste, tu réécris le fichier. Ça marche pendant des mois.',
		'Puis le portable s’éteint en pleine sauvegarde. Ou deux onglets enregistrent au même moment, et **les changements d’un onglet disparaissent sans la moindre erreur**. Ou quelqu’un demande « toutes les tâches de la semaine », et la seule façon de répondre, c’est **de lire tout le fichier et de boucler**.',
		'Tu pourrais écrire toi-même une parade pour chacun de ces cas. Une base de données, c’est **ces parades, écrites une fois, testées pendant des années**. Et parfois, la bonne base reste un simple fichier : la doc de SQLite dit qu’il « does not compete with client/server databases. SQLite competes with fopen(). » (il ne joue pas contre les bases client/serveur, il joue contre `fopen()`).'
	],
	terms: [
		{ term: 'Commit atomique', def: 'Un groupe de changements arrive en entier ou pas du tout. Un crash au milieu laisse l’ancien état, jamais un mélange des deux.' },
		{ term: 'Durabilité', def: 'Dès que la base répond « committed », le changement survit à un crash ou à une coupure de courant. Il est sur le disque, pas seulement dans un cache.' },
		{ term: 'Accès concurrent', def: 'Plusieurs lecteurs et écrivains utilisent les mêmes données en même temps, sans les corrompre ni perdre d’écriture en silence.' },
		{ term: 'Requête', def: 'Demander des données par ce qu’elles contiennent (« les tâches de la semaine ») et non par l’endroit où elles sont rangées dans un fichier.' },
		{ term: 'Rollback journal', def: 'L’astuce classique de SQLite : copier d’abord les pages d’origine dans un fichier à part, modifier la base, puis supprimer ce fichier pour valider.' },
		{ term: 'Base embarquée', def: 'Une base qui est une bibliothèque dans ton programme et qui lit et écrit un seul fichier. SQLite en est une. PostgreSQL, à l’inverse, est un serveur auquel tu te connectes.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App : BEGIN, modifie 3 pages"] -->|"copie les pages d’origine"| journal[("rollback journal")]'],
				highlight: ['app', 'journal'],
				note: '**Sauver l’ancienne version d’abord.** Avant de toucher au fichier de la base, SQLite « creates a separate rollback journal file and writes into the rollback journal the original content of the database pages that are to be altered » : il crée un journal et y recopie le contenu d’origine des pages qui vont changer. Le journal contient tout ce qu’il faut pour annuler.'
			},
			{
				add: ['journal -->|"fsync"| disk1["journal sur le disque"]'],
				highlight: ['disk1'],
				note: '**Le forcer sur le disque.** Un nouveau fichier ne vit souvent que dans le cache de l’OS. SQLite vide le journal vers le stockage, souvent avec deux appels `fsync()`, avant de modifier quoi que ce soit d’autre. La doc parle d’« a critical step in insuring that the database can survive an unexpected power loss » (une étape critique pour survivre à une coupure de courant).'
			},
			{
				add: ['app -->|"écrit les nouvelles pages, fsync"| db[("fichier de la base")]'],
				highlight: ['db'],
				note: '**Puis modifier le vrai fichier.** Avec un verrou exclusif, SQLite écrit les nouvelles pages et vide encore le cache. Ces deux vidages prennent l’essentiel du temps d’un commit. C’est le prix de la résistance aux crashs.'
			},
			{
				add: ['db -->|"supprime le journal"| commit["Validé"]'],
				highlight: ['commit'],
				note: '**Une suppression fait le commit.** « This is the instant where the transaction commits. » Pour un processus, supprimer un fichier a l’air atomique : le journal est là ou il n’y est pas. Plus de journal, le changement est complet.'
			},
			{
				add: ['crash["Crash avant la suppression"] -.->|"hot journal trouvé à la prochaine ouverture"| journal', 'journal -.->|"rejoue les anciennes pages"| db'],
				highlight: ['crash'],
				note: '**La reprise est automatique.** À la prochaine ouverture, SQLite voit un « hot journal » resté là et recopie les pages d’origine. La base a l’air de n’avoir jamais commencé la transaction. Ton `tasks.json`, lui, n’a pas de journal.'
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
			'**SQLite comme format de fichier.** Anki n’écrit pas son propre format. Une collection, c’est un fichier SQLite, ouvert avec `Connection::open(path)`. La doc de SQLite cite cet usage : le menu Fichier/Ouvrir « calls sqlite3_open() to attach to the database file », et « the File/Save menu option becomes superfluous » (le menu Enregistrer devient inutile).',
			'**Une seule app possède le fichier.** [`locking_mode` exclusive](' + ANKI + '#L64) garde le verrou du fichier tant que la connexion est ouverte. La doc des pragmas en fait la première raison de l’utiliser : « The application wants to prevent other processes from accessing the database file. » Avec un [`busy_timeout` à zéro](' + ANKI + '#L62), un second processus reçoit `SQLITE_BUSY` tout de suite au lieu d’attendre.',
			'**Le WAL demande un checkpoint avant une copie.** [`journal_mode` wal](' + ANKI + '#L68) écrit d’abord les changements dans un fichier `-wal` à part. D’où [`checkpoint`](' + ANKI + '#L559-L569) : « Flush data from WAL file into DB, so the DB is safe to copy. » Le [code de sauvegarde](https://github.com/ankitects/anki/blob/c3139c607373c99c81854d61f1ddc45e4606343c/rslib/src/collection/backup.rs#L41-L42) l’appelle juste avant de lire le fichier.',
			'**Tout ou rien, côté app.** Créer ou mettre à jour une collection se fait dans un [`begin exclusive`](' + ANKI + '#L505-L508), donc un crash en pleine mise à jour laisse l’ancien schéma. Les modifications normales passent par [`begin_trx` et `commit_trx`](' + ANKI + '#L585-L595), et le code [le dit franchement](' + ANKI + '#L607-L608) : Anki « uses long-running transactions as an undo mechanism » (se sert de longues transactions pour annuler).',
			'**Faire confiance, mais vérifier.** Sur demande, l’ouverture lance [`integrity_check`](' + ANKI + '#L499-L503) et refuse un fichier qui ne répond pas « ok ». Un format JSON maison aurait besoin de sa propre somme de contrôle pour en faire autant.'
		]
	},
	tradeoff: {
		gain: [
			'La résistance aux crashs, offerte : un changement arrive en entier ou pas du tout, et la reprise se fait seule à la prochaine ouverture.',
			'L’accès concurrent sans verrous écrits à la main : SQLite fait passer les écrivains un par un, un serveur comme PostgreSQL en laisse écrire plusieurs à la fois.',
			'Des questions au lieu de boucles : « les tâches de la semaine » tient en une requête, et un index la rend rapide sans tout relire.',
			'SQLite garde les bons côtés d’un fichier : un seul fichier à copier, envoyer ou sauvegarder, et aucun serveur à faire tourner.'
		],
		cost: [
			'La durabilité coûte du temps : chaque commit attend le disque. La FAQ de SQLite : il « will easily do 50,000 or more INSERT statements per second » mais « only do a few dozen transactions per second » (des dizaines de milliers d’INSERT, mais quelques dizaines de transactions par seconde). Regroupe les changements dans une transaction.',
			'Un fichier de base ne se lit pas à l’œil nu. Il te faut `sqlite3` ou un outil pour regarder dedans, là où un JSON s’ouvre dans n’importe quel éditeur.',
			'SQLite a des limites voulues : « it will only allow one writer at any instant in time » (un seul écrivain à la fois), et il n’a rien à faire sur un système de fichiers réseau partagé par plusieurs machines.',
			'Une base serveur (PostgreSQL) ajoute un processus à faire tourner, mettre à jour, sauvegarder et sécuriser.'
		]
	},
	task: {
		prompt: 'Choisis un stockage pour chaque cas : un simple fichier, SQLite ou PostgreSQL. Donne la raison qui tranche. (1) Les réglages d’un outil en ligne de commande, lus une fois au démarrage. (2) Une app de notes sur ordinateur, avec recherche et étiquettes. (3) Une boutique web avec 4 serveurs d’app qui prennent des commandes en même temps. (4) Un export CSV nocturne que quelqu’un ouvre dans un tableur.',
		hint: 'Pose trois questions : un crash au milieu fait-il mal, plus d’un processus écrit-il, et dois-tu trouver des données par leur contenu ?',
		answer: [
			'(1) Un simple fichier. Il est lu une fois, écrit rarement, par un seul processus, et quelqu’un voudra peut-être le modifier à la main.',
			'(2) SQLite. Un utilisateur, une machine, mais les modifications doivent survivre à un crash et la recherche ne doit pas relire chaque note. C’est le cas du « format de fichier d’application », comme Anki.',
			'(3) PostgreSQL. Quatre serveurs écrivent en même temps à travers le réseau. La doc de SQLite conseille d’« avoid using SQLite in situations where the same database will be accessed directly (without an intervening application server) and simultaneously from many computers over a network » (éviter SQLite quand plusieurs machines y accèdent directement et en même temps par le réseau).',
			'(4) Un simple fichier. Son rôle est d’être lu par un autre programme. Une base peut le produire, mais l’export lui-même est un fichier.'
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
			why: 'La doc : « This is the instant where the transaction commits. » Un journal encore présent après un crash est un hot journal, et il est rejoué pour annuler le changement.'
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
	takeaway: 'Une base de données, c’est la résistance aux crashs, le partage sans casse et des questions que tu n’as pas à coder toi-même ; SQLite te donne ça dans un seul fichier, un serveur se justifie quand plusieurs machines écrivent en même temps.',
	sources: [
		{ title: 'Doc SQLite, Appropriate Uses For SQLite', url: 'https://www.sqlite.org/whentouse.html' },
		{ title: 'Doc SQLite, Atomic Commit In SQLite', url: 'https://www.sqlite.org/atomiccommit.html' },
		{ title: 'Doc SQLite, SQLite As An Application File Format', url: 'https://www.sqlite.org/appfileformat.html' },
		{ title: 'Doc SQLite, Write-Ahead Logging', url: 'https://www.sqlite.org/wal.html' },
		{ title: 'FAQ SQLite, INSERT is really slow', url: 'https://www.sqlite.org/faq.html#q19' },
		{ title: 'Doc SQLite, PRAGMA locking_mode', url: 'https://www.sqlite.org/pragma.html#pragma_locking_mode' }
	]
};
