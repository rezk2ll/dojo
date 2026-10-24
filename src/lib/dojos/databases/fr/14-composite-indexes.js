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
		],
		steps: [
			{
				title: 'Prédis (a), les 50 derniers',
				questions: [
					{ q: 'Comment l’index unique sur `(user_profile_id, message_id)` est-il trié ?', options: ['Par id de message, puis par utilisateur pour un même message', 'Par utilisateur, puis par id de message pour un même utilisateur', 'Dans l’ordre d’insertion des lignes', 'Par le hash des deux colonnes'], answer: 1, why: 'Un index composite est trié par sa première colonne, puis par la deuxième quand la première est égale.' },
					{ q: 'Quelle requête demande (a) ?', options: ['`WHERE message_id > 0 ORDER BY user_profile_id LIMIT 50`', '`WHERE user_profile_id = 42 LIMIT 50`', '`ORDER BY message_id DESC LIMIT 50`', '`WHERE user_profile_id = 42 ORDER BY message_id DESC LIMIT 50`'], answer: 3, why: 'Égalité sur l’utilisateur, puis les messages les plus récents d’abord, puis arrêt à 50.' },
					{ q: 'Quel plan obtiens-tu pour (a) ?', options: ['`Limit` au-dessus d’un `Index Only Scan Backward` sur l’index unique', '`Sort` au-dessus d’un `Seq Scan` de la table', '`Limit` au-dessus d’un `Bitmap Heap Scan`', '`Index Scan` sur la clé primaire, puis un `Sort`'], answer: 0, why: 'Le parcours lit la tranche de l’utilisateur 42 depuis la fin, dans l’ordre de `message_id`, et le `Limit` s’arrête après 50 entrées.' },
					{ q: 'Pourquoi n’y a-t-il pas de nœud Sort ?', options: ['PostgreSQL saute le tri quand le LIMIT vaut 50 lignes ou moins', 'Le planificateur trie les 50 lignes dans le nœud Limit lui-même', 'L’égalité sur la première colonne laisse une tranche déjà triée par la deuxième', 'La table est rangée dans l’ordre de `message_id`'], answer: 2, why: 'Pour un même utilisateur, les entrées sont dans l’ordre de `message_id`. Les lire à l’envers donne le `DESC` gratuitement.' }
				]
			},
			{
				title: 'Prédis (b), un id de message',
				questions: [
					{ q: 'Quel est le problème de `WHERE message_id = 123456` avec cet index ?', options: ['`message_id` ne fait pas partie de l’index', 'Elle saute la première colonne, donc les correspondances sont réparties chez tous les utilisateurs', 'Un index unique ne sert pas une égalité', 'La valeur est trop grande pour l’index'], answer: 1, why: 'Sans `user_profile_id`, les entrées qui correspondent peuvent être dans la tranche de n’importe quel utilisateur.' },
					{ q: 'Comment PostgreSQL 18 l’a-t-il exécutée ?', options: ['En skip scan : `Index Searches: 5001`', 'En Seq Scan avec un filtre', 'En une seule recherche d’index sur `message_id`', 'En Bitmap Index Scan sur la clé primaire'], answer: 0, why: 'Le skip scan lance une recherche B-tree par valeur de la première colonne : une par utilisateur ici.' },
					{ q: 'Pourquoi ce skip scan coûte-t-il cher ici ?', options: ['Le skip scan lit la table en plus de l’index', 'Il doit d’abord trier les 5 000 utilisateurs', 'Il verrouille chaque page qu’il lit', 'Avec 5 000 utilisateurs, il lui faut environ 15 000 buffers pour une ligne'], answer: 3, why: 'Le skip scan est rentable avec une poignée de valeurs en tête. Avec des milliers, c’est une recherche par valeur.' },
					{ q: 'De quoi (b) a-t-elle besoin ?', options: ['D’une cible de statistiques plus haute sur `message_id`', 'D’un index partiel sur les non-lus', 'D’un index à elle sur `message_id`', 'D’un `LIMIT 1` à la fin'], answer: 2, why: 'Une requête qui ne contraint pas la première colonne a besoin d’un index qui commence par la colonne qu’elle contraint.' }
				]
			},
			{
				title: 'Règle (c) avec un index partiel',
				questions: [
					{ q: 'Avant l’index partiel, comment (c) s’exécute-t-elle ?', options: ['Un Index Only Scan sur l’index unique, sans tri', 'Un Seq Scan de toute la table', 'Un Bitmap Index Scan pour les 400 lignes de l’utilisateur 42, `Rows Removed by Filter: 382`, puis un `Sort`', 'Un Index Scan sur la clé primaire, puis un filtre'], answer: 2, why: 'L’index unique trouve tous les messages de l’utilisateur 42, le filtre jette les lus, et le bitmap perd l’ordre, d’où le Sort.' },
					{ q: 'Quel index partiel sert (c) ?', options: ['`CREATE INDEX ON usermessage (user_profile_id, message_id) WHERE flags & 1 = 0`', '`CREATE INDEX ON usermessage (flags) WHERE user_profile_id = 42`', '`CREATE INDEX ON usermessage (user_profile_id, message_id, flags)`', '`CREATE INDEX ON usermessage (message_id) WHERE flags = 1`'], answer: 0, why: 'Même clé et même ordre que la requête, et il ne contient que les lignes non lues, celles que (c) demande.' },
					{ q: 'Que fait (c) avec l’index partiel ?', options: ['Le même Bitmap Index Scan, un peu plus vite', 'Un skip scan sur tous les utilisateurs', 'Un Seq Scan, parce que l’index est trop petit', 'Un `Index Only Scan` dessus, 18 lignes, pas de filtre, pas de tri, 5 buffers'], answer: 3, why: 'L’index ne contient que des lignes non lues, déjà dans l’ordre de `message_id` pour chaque utilisateur.' },
					{ q: 'L’index partiel fait 1,8 MB, le complet 60 MB. Pourquoi ?', options: ['Les index partiels sont compressés', 'Il ne contient que les 3 % de lignes non lues', 'Il laisse de côté la colonne `message_id`', 'Il est construit sans les niveaux hauts de l’arbre'], answer: 1, why: 'Un index partiel ne contient que les lignes qui vérifient son `WHERE`, et 97 % des lignes sont lues.' }
				]
			},
			{
				title: 'Essaie la requête préparée',
				questions: [
					{ q: 'Préparée avec `flags & $2 = 0` et un plan générique, quel index (c) utilise-t-elle ?', options: ['L’index partiel, comme avec la constante', 'L’index unique plus un filtre', 'Aucun index : un Seq Scan', 'Les deux index dans un BitmapAnd'], answer: 1, why: 'Le planificateur revient à l’index unique et filtre les lignes lues.' },
					{ q: 'Pourquoi le planificateur ne peut-il pas utiliser l’index partiel ici ?', options: ['Les requêtes préparées n’utilisent jamais d’index, quelle que soit sa définition', 'Les index partiels ne marchent que pour les requêtes lancées dans une transaction', 'À la planification, `$2` peut valoir n’importe quoi, donc il ne peut pas prouver que la requête ne veut que des non-lus', 'Le paramètre rend la requête trop longue'], answer: 2, why: 'La correspondance avec un index partiel « takes place at query planning time », donc « parameterized query clauses do not work with a partial index ».' },
					{ q: 'Comment gardes-tu l’index partiel en service ?', options: ['Garde la constante dans le texte SQL, comme le `where_unread()` de Zulip', 'Ajoute `flags` aux colonnes de l’index', 'Lance `ANALYZE` avant chaque appel', 'Monte la cible de statistiques de `flags`'], answer: 0, why: 'Zulip écrit `flags & 1 = 0` en SQL littéral, pour que le prédicat soit visible quand la requête est planifiée.' },
					{ q: 'Quelle clause WHERE peut utiliser l’index partiel ?', options: ['`user_profile_id = 42 AND flags & $1 = 0`', '`user_profile_id = 42`', '`user_profile_id = 42 AND flags <> 1`', '`user_profile_id = 42 AND flags & 1 = 0`'], answer: 3, why: 'Seule une requête dont la condition implique le prédicat de l’index à la planification peut l’utiliser. Le littéral `flags & 1 = 0` lui correspond exactement.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Comparer les deux ordres de colonnes d’un index composite, puis faire du bon un index couvrant.',
		steps: [
			'Lance un PostgreSQL 18 jetable et ouvre `psql` : `docker run --rm -d --name pg-lab -e POSTGRES_PASSWORD=lab postgres:18`, attends quelques secondes, puis `docker exec -it pg-lab psql -U postgres`.',
			'Crée un million d’événements pour 500 clients, un par seconde : `CREATE TABLE events (id bigint generated always as identity primary key, tenant_id int not null, created_at timestamptz not null, kind text not null);` puis `INSERT INTO events (tenant_id, created_at, kind) SELECT (random()*500)::int, timestamptz \'2026-01-01\' + i * interval \'1 second\', \'k\' || i % 10 FROM generate_series(1, 1000000) i;`',
			'Indexe d’abord le temps : `CREATE INDEX events_created_tenant ON events (created_at, tenant_id); VACUUM ANALYZE events;` puis `EXPLAIN (ANALYZE, BUFFERS) SELECT id, created_at FROM events WHERE tenant_id = 7 AND created_at >= \'2026-01-05\' AND created_at < \'2026-01-06\' ORDER BY created_at;`',
			'Indexe d’abord le client : `CREATE INDEX events_tenant_created ON events (tenant_id, created_at);` et relance le même `EXPLAIN`. Compare les buffers du nœud de parcours d’index.',
			'Rends-le couvrant : `CREATE INDEX events_tenant_created_cov ON events (tenant_id, created_at) INCLUDE (id); VACUUM events;` puis `EXPLAIN (ANALYZE, BUFFERS) SELECT id, created_at FROM events WHERE tenant_id = 7 ORDER BY created_at DESC LIMIT 20;`. Arrête tout avec `docker stop pg-lab`.'
		],
		done: [
			'Avec `(created_at, tenant_id)`, le parcours d’index touche quelques centaines de buffers (environ 480 dans un test) pour environ 170 lignes.',
			'Avec `(tenant_id, created_at)`, le `Bitmap Index Scan on events_tenant_created` lit environ 4 buffers.',
			'La dernière requête montre `Index Only Scan Backward using events_tenant_created_cov`, `Heap Fetches: 0`, et aucun nœud Sort.'
		],
		solution: [
			'Le temps d’abord : le parcours traverse toutes les entrées de la journée, des 500 clients, et vérifie `tenant_id` sur chacune. Le client d’abord : égalité sur la première colonne, puis un intervalle sur la suivante, donc une seule tranche courte.',
			'`INCLUDE (id)` range `id` dans les feuilles, donc la requête trouve toutes ses colonnes dans l’index et saute la table une fois que `VACUUM` a marqué les pages visibles pour tous.',
			'Le prix : chaque index est écrit à chaque insert. Supprime ceux dont aucune requête n’a besoin, ici `events_created_tenant`.'
		]
	},
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
