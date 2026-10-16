const ZULIP = 'https://github.com/zulip/zulip/blob/e45560dfcfc40c786c689b454ef6f4e7dc0f3eaf';
const MODELS = `${ZULIP}/zerver/models/messages.py`;
const DISC = 'https://github.com/discourse/discourse/blob/821e9e2f9f94483a3be8d1e077cde0fd94970479';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'composite-indexes',
	part: 'Dans le moteur',
	title: 'Index composites, partiels et couvrants',
	minutes: 10,
	hook: [
		'Ton appli de chat affiche les « messages non lus » de chaque utilisateur. La table a un index sur `user_id` et un sur `message_id`. La requête lit quand même tous les messages que l’utilisateur a jamais reçus, jette ceux déjà lus, puis trie.',
		'Un index sur `(user_id, message_id)` est trié par utilisateur, puis par message à l’intérieur de chaque utilisateur, donc **la page des non-lus lit une seule plage courte, déjà triée**. Ajoute `WHERE unread` à l’index lui-même et il ne contient plus que les lignes que cette page demande.',
		'L’exemple vient de Zulip, dont les tables de messages commentent presque chaque index.'
	],
	terms: [
		{ term: 'Index composite', def: 'Un index sur plusieurs colonnes, trié par la première, puis par la deuxième quand la première est égale, et ainsi de suite. Comme un annuaire trié par nom, puis par prénom.' },
		{ term: 'Préfixe de gauche', def: 'Les premières colonnes d’un index composite. Un B-tree sur `(a, b, c)` marche le mieux quand la requête contraint `a`, ou `a` et `b`. Il sert aussi `(a)` seul, donc un index séparé sur `a` est redondant.' },
		{ term: 'Index partiel', def: 'Un index avec une clause `WHERE` : il ne contient que les lignes qui la vérifient. Plus petit, moins cher à mettre à jour, et utilisable seulement par les requêtes dont la condition implique cette clause.' },
		{ term: 'Index couvrant', def: 'Un index qui contient toutes les colonnes dont une requête a besoin. Avec `INCLUDE`, des colonnes en plus sont rangées dans les feuilles comme charge utile, pas comme clés de recherche.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['idx["B-tree sur (realm_id, recipient_id, id) : trié par realm, puis recipient, puis id"]'],
				highlight: ['idx'],
				note: 'Un index composite a un seul ordre de tri. Les entrées sont triées par `realm_id` ; dans un realm, par `recipient_id` ; pour un recipient, par `id`.'
			},
			{
				add: ['q1["WHERE realm_id = 2 AND recipient_id = 9 ORDER BY id"] -->|"une seule plage continue, déjà dans l’ordre des id"| idx'],
				highlight: ['q1'],
				note: 'La règle de la doc : l’égalité sur les premières colonnes, plus une inégalité sur la première colonne qui n’en a pas, limitent la partie de l’index parcourue. Ici, le parcours lit une seule tranche et les lignes sortent dans l’ordre des `id` : pas de nœud de tri, et un `LIMIT` s’arrête tôt.'
			},
			{
				add: ['q2["WHERE recipient_id = 9 seulement"] -.->|"pas de première colonne : une recherche par realm, ou un parcours séquentiel"| idx'],
				highlight: ['q2'],
				note: 'Cette requête saute la première colonne, donc les lignes cherchées sont éparpillées dans tous les realms. PostgreSQL 18 peut faire un skip scan, une recherche B-tree par `realm_id`, qui ne paie que s’il y a peu de realms différents. Sinon, le planificateur préfère un autre index ou un parcours séquentiel.'
			},
			{
				add: ['part["Partiel : (user_profile_id, message_id) WHERE flags & 1 = 0"] -->|"seules les lignes non lues y sont"| unread["WHERE user_profile_id = 42 AND flags & 1 = 0"]'],
				highlight: ['part', 'unread'],
				note: 'La plupart des messages sont lus, et la page des non-lus ne les demande jamais. Cet index partiel ne contient que les lignes non lues, donc il est petit, et une ligne marquée comme lue n’y a pas d’entrée. La requête doit contenir la même condition, sinon le planificateur ne peut pas prouver que l’index a toutes les lignes.'
			},
			{
				add: ['cov["(thread_id, id) INCLUDE (user_id)"] -.->|"index-only scan, aucune visite"| heap[("pages de la table")]'],
				highlight: ['cov', 'heap'],
				note: 'La recherche utilise `thread_id` et `id`, et `INCLUDE` range `user_id` dans les feuilles. Une requête qui ne lit que ces trois colonnes peut faire un index-only scan et éviter la table, tant que les pages sont marquées all-visible. Les colonnes de charge utile ne sont pas des clés de recherche et ne comptent pas pour l’unicité.'
			}
		]
	},
	example: {
		title: 'zerver/models/messages.py : les index de la table Message de Zulip',
		repo: 'zulip/zulip',
		url: `${MODELS}#L188-L219`,
		lang: 'python',
		code: `    class Meta:
        indexes = [
            GinIndex("search_tsvector", fastupdate=False, name="zerver_message_search_tsvector"),
            models.Index(
                # For moving messages between streams or marking
                # streams as read.  The "id" at the end makes it easy
                # to scan the resulting messages in order, and perform
                # batching.
                "realm_id",
                "recipient_id",
                "id",
                name="zerver_message_realm_recipient_id",
            ),
            models.Index(
                # For generating digest emails and message archiving,
                # which both group by stream.
                "realm_id",
                "recipient_id",
                "date_sent",
                name="zerver_message_realm_recipient_date_sent",
            ),
            models.Index(
                # For exports, which want to limit both sender and
                # receiver.  The prefix of this index (realm_id,
                # sender_id) can be used for scrubbing users and/or
                # deleting users' messages.
                # Also used in send_welcome_bot_response
                "realm_id",
                "sender_id",
                "recipient_id",
                name="zerver_message_realm_sender_recipient",
            ),`,
		notes: [
			'Les lignes 4 à 13 servent à déplacer les messages d’un stream et à marquer un stream comme lu. Les deux visent un seul realm et un seul recipient, donc `realm_id` et `recipient_id` passent devant. `id` vient en dernier parce que, comme dit le commentaire, il « makes it easy to scan the resulting messages in order, and perform batching » (permet de parcourir les messages dans l’ordre et par lots). Mets `id` en premier et les lignes de tous les realms seraient mélangées.',
			'Le commentaire des lignes 23 à 27 dit que le préfixe `(realm_id, sender_id)` « can be used for scrubbing users and/or deleting users\' messages ». Zulip va plus loin sur [UserMessage](' + MODELS + '#L459-L466) et coupe l’index que Django met par défaut sur `user_profile`. L’index unique sur `(user_profile_id, message_id)` le couvre, « is always going to produce sorted message-id rows », et évite que PostgreSQL choisisse un index non trié puis trie après coup.',
			'Les index de UserMessage (dans les sources) comprennent `zerver_usermessage_unread_message_id` sur `(user_profile, message)` avec `flags__andz=...read.mask`. Le [`where_unread()`](' + MODELS + '#L534-L539) correspondant écrit le prédicat en SQL littéral, `flags & 1 = 0`, avec la constante dans le texte. La doc dit que la correspondance « takes place at query planning time » (se fait à la planification), donc « parameterized query clauses do not work with a partial index ».',
			'Une [migration Rails de Discourse](' + DISC + '/plugins/chat/db/migrate/20260421061908_add_covering_index_on_chat_messages_thread_id.rb#L9-L14) construit `(thread_id, id)` avec `include: %i[user_id]` et `where: "deleted_at IS NULL"` : un index composite, couvrant et partiel en une seule instruction.'
		]
	},
	tradeoff: {
		gain: [
			'Un seul index composite bien ordonné peut servir un filtre, un tri et un `LIMIT` d’un coup, et remplacer l’index à une colonne sur sa première colonne.',
			'Un index partiel peut ne faire qu’une petite fraction de l’index complet. Dans un test avec 2 millions de lignes et 3 % de non-lus, l’index complet `(user_profile_id, message_id)` faisait 60 MB et celui des non-lus 1,8 MB.',
			'Un index couvrant transforme un parcours qui saute partout dans la table en index-only scan, avec `Heap Fetches: 0` sur une table passée récemment au vacuum.'
		],
		cost: [
			'L’ordre de colonnes qui convient à une requête peut être inutile pour une autre, et chaque index en plus s’écrit à chaque insert et à beaucoup d’updates.',
			'Un index partiel est invisible pour les requêtes qui ne reprennent pas sa condition, y compris celles où cette condition est un paramètre lié.',
			'Les colonnes `INCLUDE` grossissent chaque entrée des feuilles. La doc conseille de « be conservative about adding non-key payload columns » (rester prudent), et ça n’aide que si la table change assez lentement pour que les pages restent all-visible.',
			'Le skip scan de PostgreSQL 18 peut masquer un mauvais ordre de colonnes : il est bon marché quand la première colonne a une poignée de valeurs, et lance une recherche par valeur quand elle en a des milliers (5 001 recherches dans l’exercice ci-dessous).'
		]
	},
	task: {
		prompt: 'Dans `psql`, crée `usermessage(id bigint generated always as identity primary key, user_profile_id int not null, message_id bigint not null, flags bigint not null default 0)` avec 2 millions de lignes : 5 000 utilisateurs, `flags = 1` (lu) pour 97 % des lignes. Ajoute `UNIQUE (user_profile_id, message_id)` et lance `VACUUM ANALYZE`. Pour chaque requête, prédis le plan puis vérifie avec `EXPLAIN (ANALYZE)` : (a) les 50 derniers messages de l’utilisateur 42 ; (b) l’utilisateur du `message_id = 123456` ; (c) les messages non lus de l’utilisateur 42 dans l’ordre. Ajoute ensuite un index partiel pour (c) et relance-la, une fois en requête simple et une fois en requête préparée avec le flag en paramètre.',
		hint: 'Écris chaque clause WHERE, puis demande-toi : contraint-elle la première colonne avec `=` ? L’ordre de l’index correspond-il à l’ORDER BY ? Pour l’index partiel, compare son prédicat au texte de la requête.',
		answer: [
			'(a) `WHERE user_profile_id = 42 ORDER BY message_id DESC LIMIT 50` donne un `Limit` au-dessus d’un `Index Only Scan Backward using` l’index unique. Égalité sur la première colonne, tri sur la deuxième : l’index est lu à l’envers, sans tri.',
			'(b) `WHERE message_id = 123456` saute la première colonne. Sur PostgreSQL 18, ça a tourné en skip scan : `Index Searches: 5001` et environ 15 000 buffers pour une seule ligne. Avec moins d’utilisateurs, ce serait bon marché ; ici, il faut un index à part sur `message_id`.',
			'(c) Avant : un Bitmap Index Scan sur l’index unique pour les 400 lignes de l’utilisateur 42, `Rows Removed by Filter: 382`, puis un `Sort`. Après `CREATE INDEX ON usermessage (user_profile_id, message_id) WHERE flags & 1 = 0` : un `Index Only Scan` sur l’index partiel, 18 lignes, pas de filtre, pas de tri, 5 buffers. Il fait 1,8 MB contre 60 MB pour l’index complet.',
			'Préparée avec `flags & $2 = 0` et un plan générique, le planificateur revient à l’index unique plus un filtre : à la planification, `$2` peut valoir n’importe quoi, donc il ne peut pas prouver que la requête ne veut que des non-lus. Garde la constante dans le texte SQL, comme le fait le `where_unread()` de Zulip.'
		]
	},
	quiz: [
		{
			q: 'Une table a un index sur `(tenant_id, created_at)`. Quelle requête l’utilise le mieux ?',
			options: [
				'`WHERE created_at > now() - interval \'1 day\'` sur tous les tenants',
				'`WHERE tenant_id = 7 ORDER BY created_at DESC LIMIT 20`',
				'`WHERE tenant_id > 7 AND created_at = \'2026-01-01\'`',
				'`ORDER BY created_at DESC LIMIT 20` sans clause WHERE'
			],
			answer: 1,
			why: 'L’égalité sur la première colonne, puis un tri sur la suivante, lit une seule tranche de l’index déjà dans l’ordre, et le LIMIT s’arrête après 20 entrées. Les autres requêtes sautent `tenant_id` ou y mettent un intervalle, donc l’ordre de `created_at` est découpé en morceaux.'
		},
		{
			q: 'Tu as `CREATE INDEX ... ON jobs (run_at) WHERE state = \'queued\'`. Quelle requête le planificateur peut-il servir avec ?',
			options: [
				'`SELECT * FROM jobs WHERE run_at < now() ORDER BY run_at`',
				'`SELECT * FROM jobs WHERE state = $1 AND run_at < now()`',
				'`SELECT * FROM jobs WHERE state = \'queued\' AND run_at < now()`',
				'`SELECT * FROM jobs WHERE state <> \'done\' AND run_at < now()`'
			],
			answer: 2,
			why: 'Un index partiel n’est utilisable que si la clause WHERE de la requête implique le prédicat de l’index au moment de la planification. Sans la condition, avec un paramètre lié, ou avec une autre condition dont il ne sait pas prouver qu’elle l’implique, le planificateur ne peut pas savoir que l’index contient toutes les lignes voulues.'
		},
		{
			q: 'Pourquoi ajouter `INCLUDE (user_id)` à un index sur `(thread_id, id)` plutôt que d’en faire `(thread_id, id, user_id)` ?',
			options: [
				'Les colonnes de charge utile restent hors de la clé, donc un index unique reste unique sur sa clé seule',
				'Les colonnes INCLUDE sont compressées, donc l’index est toujours plus petit que celui à trois colonnes',
				'Seules les colonnes INCLUDE peuvent sortir d’un index-only scan, jamais les colonnes de la clé',
				'INCLUDE fait sortir la colonne de la table, donc chaque ligne n’est stockée qu’une fois'
			],
			answer: 0,
			why: 'Les colonnes INCLUDE ne sont rangées que dans les feuilles et ne font pas partie de la clé. Un index unique vérifie alors l’unicité sur les colonnes de la clé seulement, et les niveaux hauts de l’arbre restent petits. Les colonnes de la clé peuvent aussi sortir d’un index-only scan, et la table garde toutes les colonnes.'
		}
	],
	recall: {
		q: 'Dans quel ordre mets-tu les colonnes d’un index pour `WHERE realm_id = 2 AND recipient_id = 9 ORDER BY id`, et pourquoi ?',
		a: '`(realm_id, recipient_id, id)` : les colonnes d’égalité d’abord, puis la colonne de tri. Le parcours lit une seule tranche continue, déjà dans l’ordre des `id`, donc il n’y a pas de nœud de tri et un `LIMIT` s’arrête tôt.'
	},
	sources: [
		{ title: 'Zulip, zerver/models/messages.py, index de UserMessage', url: `${MODELS}#L591-L596` },
		{ title: 'Doc PostgreSQL 18, Multicolumn Indexes', url: 'https://www.postgresql.org/docs/18/indexes-multicolumn.html' },
		{ title: 'Doc PostgreSQL 18, Partial Indexes', url: 'https://www.postgresql.org/docs/18/indexes-partial.html' },
		{ title: 'Doc PostgreSQL 18, Index-Only Scans and Covering Indexes', url: 'https://www.postgresql.org/docs/18/indexes-index-only-scans.html' },
		{ title: 'Doc Django, options des index (condition, include)', url: 'https://docs.djangoproject.com/en/5.2/ref/models/indexes/' }
	]
};
