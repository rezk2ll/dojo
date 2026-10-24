const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8';
const JSON_DOC = `${PG}/doc/src/sgml/json.sgml`;
const PH = 'https://github.com/PostHog/posthog/blob/c105d57fd7fc59f40458556be6f5171e29e9adfe';
const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'documents',
	part: 'Au-delà d’un serveur',
	title: 'Documents et JSONB',
	minutes: 10,
	hook: [
		'Ton équipe avait besoin de quelques réglages par client, et personne ne voulait écrire de migration. Vous avez ajouté une colonne `settings` de type `jsonb`, et vous êtes passés à autre chose.',
		'Six mois plus tard, la page de facturation filtre sur `settings->>\'plan\' = \'pro\'` et lit toutes les lignes de la table. Un client a `"plan": "Pro"`, un autre `"plan": null`, un troisième n’a pas de clé `plan` du tout. **Aucune contrainte n’a rien bloqué**, parce que la base voit tout le document comme une seule valeur.',
		'PostgreSQL stocke une valeur `jsonb` sous forme de document binaire, qu’il sait chercher avec un index GIN. Les colonnes typées à côté gardent leurs types et leurs contraintes. Mets en colonne chaque valeur que tu filtres, tries ou contrôles, et garde dans le document la partie dont la forme varie.'
	],
	terms: [
		{ term: 'jsonb', def: 'Stocke une forme binaire déjà analysée. Perd les espaces et les clés en double, ne garde pas l’ordre des clés, et peut être indexé. Le type `json`, lui, garde le texte exact reçu.' },
		{ term: 'Containment (@>)', def: '`a @> b` est vrai quand chaque clé et chaque valeur de `b` se trouve dans `a`, au même endroit. C’est l’opérateur principal qu’un index GIN sur jsonb sait servir.' },
		{ term: 'jsonb_path_ops', def: 'Une classe d’opérateurs GIN plus compacte. Une entrée hachée par chemin vers une valeur. Supporte `@>`, `@?` et `@@`, mais pas `?`. La classe par défaut, `jsonb_ops`, supporte aussi `?`.' },
		{ term: '->> et ->', def: '`->` renvoie un champ en jsonb, `->>` le renvoie en texte. Un index GIN simple sur la colonne n’aide pas un filtre sur `doc->>\'key\'`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["L’app envoie du texte JSON"] --> parse["Analyse une seule fois à l’entrée"]', 'parse --> row[("Ligne : colonnes typées + detail en jsonb")]'],
				highlight: ['parse', 'row'],
				note: 'PostgreSQL analyse le texte JSON une seule fois, à l’entrée. La doc dit que `jsonb` est « slightly slower to input due to added conversion overhead, but significantly faster to process, since no reparsing is needed » (un peu plus lent à l’écriture, bien plus rapide à traiter). Le document vit dans la ligne à côté des colonnes ordinaires, et un gros document part dans TOAST comme toute grosse valeur (jour 9).'
			},
			{
				add: ['row --> gin["Index GIN, jsonb_path_ops : un hash par chemin vers une valeur"]'],
				highlight: ['gin'],
				note: 'Un index GIN (jour 11) est un index inversé : il stocke des entrées qui pointent vers les lignes. Avec `jsonb_path_ops`, `{"foo": {"bar": "baz"}}` donne une seule entrée, le hash du chemin `foo.bar.baz`. L’index est petit et très précis, mais il ne sait pas dire si une clé existe toute seule.'
			},
			{
				add: ['q1["WHERE detail @> type FeatureFlag"] -->|"parcours d’index"| gin'],
				highlight: ['q1'],
				note: 'Une requête de containment utilise l’index. PostgreSQL hache les chemins de `detail @> \'{"type": "FeatureFlag"}\'`, cherche ces hashs dans le GIN, puis revérifie les lignes trouvées.'
			},
			{
				add: ['q2["WHERE detail->>name = x"] -.->|"pas d’index, lit toutes les lignes"| row'],
				highlight: ['q2'],
				note: 'Une recherche par clé avec `->>` n’utilise pas l’index. La doc explique qu’un opérateur n’utilise l’index que s’il est « applied directly to the indexed column » (appliqué directement à la colonne indexée). `detail->>\'name\' = \'x\'` compare une valeur texte, donc le plan retombe sur un parcours séquentiel, sauf si tu ajoutes un index d’expression sur exactement cette expression.'
			},
			{
				add: ['col["Clé chaude promue en colonne"] -->|"B-tree, NOT NULL, CHECK"| row'],
				highlight: ['col'],
				note: 'Si tu filtres, tries, joins ou imposes une règle sur une valeur, donne-lui une vraie colonne. Elle gagne un type, un NOT NULL, une clé étrangère (jour 22) et un B-tree classique. Ne garde en jsonb que la partie dont la forme varie vraiment.'
			}
		]
	},
	example: {
		title: 'posthog/models/activity_logging/activity_log.py : des colonnes typées autour d’un seul document jsonb',
		repo: 'PostHog/posthog',
		url: `${PH}/posthog/models/activity_logging/activity_log.py#L195-L294`,
		lang: 'python',
		code: `class ActivityLog(UUIDTModel):
    class Meta:
        constraints = [
            models.CheckConstraint(
                name="must_have_team_or_organization_id",
                condition=models.Q(team_id__isnull=False) | models.Q(organization_id__isnull=False),
            ),
        ]
        indexes = [
            models.Index(fields=["team_id", "scope", "item_id"]),
            models.Index(
                fields=["organization_id", "scope", "-created_at"],
                name="idx_alog_org_scope_created_at",
                condition=models.Q(detail__isnull=False) & models.Q(detail__jsonb_typeof="object"),
            ),
            models.Index(
                fields=["organization_id"],
                name="idx_alog_org_detail_exists",
                condition=models.Q(detail__isnull=False) & models.Q(detail__jsonb_typeof="object"),
            ),
            # Serves whole-column containment (\`detail @> ...\`), the only detail lookup an index
            # can answer. Key-path lookups and the \`detail::text\` search are not GIN-servable
            # under any opclass. \`jsonb_path_ops\` stores one hash per root-to-leaf path, so it is
            # smaller and cheaper to maintain than \`jsonb_ops\`, whose only extra operators are the
            # key-existence family (\`?\`, \`?|\`, \`?&\`) that no query path uses. It also stores no
            # entry for a JSON structure that holds no scalar, so containment against an empty
            # object or array (\`detail @> '{"changes": []}'\`) falls back to a full index scan.
            GinIndex(
                name="idx_alog_detail_gin_path_ops",
                fields=["detail"],
                opclasses=["jsonb_path_ops"],
            ),
…
    activity = models.fields.CharField(max_length=79, null=False)
    # if scoped to a model this activity log holds the id of the model being logged
    # if not scoped to a model this log might not hold an item_id
    # this might be a numerical id, short id, or UUID, so each will be converted to string
    # it will be used to lookup rows with exactly matching item_ids
    # it probably only needs to be 36 characters in order to hold a GUID
    # but 72 may be useful to avoid a migration in future
    item_id = models.fields.CharField(max_length=72, null=True)
    # e.g. FeatureFlags - this will often be the name of a model class
    scope = models.fields.CharField(max_length=79, null=False)
    detail = models.JSONField(encoder=ActivityDetailEncoder, null=True)
    created_at = models.DateTimeField(default=timezone.now)`,
		notes: [
			'Les lignes 3 à 10 ajoutent une contrainte CHECK et un B-tree sur `team_id`, `scope` et `item_id`, et les lignes 34 à 45 déclarent `activity`, `scope` et `created_at` en colonnes typées. Seul `detail` (ligne 44), dont la forme change selon le scope, est un document. Django traduit `JSONField` en [`jsonb`](' + DJANGO + '/django/db/backends/postgresql/base.py#L123) sur PostgreSQL.',
			'Le commentaire des lignes 21 à 27 choisit `jsonb_path_ops` parce qu’aucune requête n’utilise `?`. C’est ce que dit la [doc](' + JSON_DOC + '#L527-L537) : un index `jsonb_path_ops` « is usually much smaller than a `jsonb_ops` index over the same data, and the specificity of searches is better » (bien plus petit, et des recherches plus précises).',
			'Les lignes 25 à 27 préviennent que `detail @> \'{"changes": []}\'` retombe sur un parcours complet de l’index. La [doc](' + JSON_DOC + '#L572-L577) dit pareil : `jsonb_path_ops` « produces no index entries for JSON structures not containing any values », et une telle recherche « will require a full-index scan, which is quite slow » (il faut lire tout l’index, c’est lent).',
			'La migration 0854 crée l’index GIN des lignes 28 à 32 en SQL brut avec [`CREATE INDEX CONCURRENTLY ... USING GIN (detail jsonb_path_ops)`](' + PH + '/posthog/migrations/0854_add_activitylog_detail_gin_path_ops_index.py#L28-L33), pour que les écritures dans le journal continuent pendant la construction (jour 26). La migration 0850 (dans les sources) crée de la même façon l’index partiel des lignes 11 à 15, avec `WHERE detail IS NOT NULL AND jsonb_typeof(detail) = \'object\'`.'
		]
	},
	tradeoff: {
		gain: [
			'Les champs qui changent d’une ligne à l’autre (un diff d’audit, le contenu d’un webhook, les réglages d’un plugin) tiennent dans une colonne, sans migration pour chaque nouvelle clé.',
			'Un index GIN répond aux requêtes de containment sur n’importe quelle clé du document, sans un index par champ.',
			'Le document se relit d’un bloc, sans jointure, ce qui convient aux données que l’app charge toujours en entier.'
		],
		cost: [
			'La base ne vérifie ni type, ni NOT NULL, ni clé étrangère dans le document. Elle stocke `"plan": "Pro"` sans erreur, sauf si tu ajoutes des contraintes CHECK ou valides côté app.',
			'Un index GIN simple ne sert ni les filtres `->>`, ni les tris, ni les intervalles. Chaque clé chaude demande son propre index d’expression ou sa propre colonne.',
			'Modifier une clé écrit une nouvelle version de toute la ligne, et la doc prévient que « any update acquires a row-level lock on the whole row » (toute mise à jour verrouille la ligne entière, jours 18 et 20).',
			'Les clés sont répétées dans chaque document, donc une table de nombreux petits documents pèse plus lourd que les mêmes données en colonnes.'
		]
	},
	task: {
		prompt: 'Table `customers(id bigint, settings jsonb)`. La page de facturation lance `WHERE settings->>\'plan\' = \'pro\'` et elle est lente. Le support cherche aussi les clients dont les réglages contiennent `{"beta": true}`. Écris les index ou les changements de schéma que tu ferais, et dis quelle requête chacun sert.',
		hint: 'Pour chaque requête, demande-toi si son opérateur s’applique à la colonne elle-même ou à une expression. Puis demande-toi si `plan` mérite des règles qu’un document ne peut pas lui donner.',
		answer: [
			'Pour la recherche du support, `CREATE INDEX ON customers USING GIN (settings jsonb_path_ops)`. Réécris la requête en `settings @> \'{"beta": true}\'`, pour que ce soit un containment sur la colonne indexée.',
			'Pour la facturation, l’index GIN n’aide pas : `settings->>\'plan\'` est une expression. Solution rapide : `CREATE INDEX ON customers ((settings->>\'plan\'))`, un B-tree sur exactement cette expression.',
			'Meilleure solution : on filtre sur `plan` et ses valeurs sont fixes, donc promeus-le. Ajoute `plan text NOT NULL DEFAULT \'free\' CHECK (plan IN (\'free\', \'pro\', \'team\'))`, remplis-le depuis `settings` par lots, bascule le code, puis retire la clé (expand et contract).',
			'Vérifie avec `EXPLAIN` (jour 12) que chaque requête montre bien un index scan ou un bitmap index scan sur l’index prévu.'
		],
		steps: [
			{
				title: 'Lis chaque requête',
				questions: [
					{ q: 'Comment écris-tu la recherche du support sur les réglages qui contiennent `{"beta": true}` ?', options: ['`settings @> \'{"beta": true}\'`', '`settings ? \'beta\'`', '`settings::text LIKE \'%beta%\'`', '`settings->\'beta\' IS NOT NULL`'], answer: 0, why: 'Le containment vérifie la clé et sa valeur, à cet endroit. `?` et `IS NOT NULL` vérifient seulement que la clé est là.' },
					{ q: 'Que compare le filtre de facturation `settings->>\'plan\' = \'pro\'` ?', options: ['Le document entier avec une valeur jsonb', 'Une valeur texte tirée de la colonne par une expression', 'Une colonne `plan` typée', 'Les clés du document'], answer: 1, why: '`->>` renvoie le champ en texte. La comparaison porte sur cette expression, pas sur la colonne elle-même.' },
					{ q: 'Pourquoi la page de facturation lit-elle aujourd’hui toutes les lignes de la table ?', options: ['`pro` est trop courant pour un index', 'On ne peut pas filtrer des valeurs jsonb', 'Aucun index ne stocke la valeur de `settings->>\'plan\'`', 'Les index GIN cessent de marcher sur les grosses tables'], answer: 2, why: 'Sans rien d’indexé sur cette expression, le plan retombe sur un parcours séquentiel.' },
					{ q: 'Comment un client s’est-il retrouvé avec `"plan": "Pro"` ?', options: ['jsonb change la casse des valeurs', 'Des clés en double ont été fusionnées à l’entrée', 'L’index GIN a réécrit la valeur', 'La base ne vérifie aucun type ni aucune règle dans le document'], answer: 3, why: 'PostgreSQL voit le document comme une seule valeur. Aucun CHECK ni NOT NULL n’atteint les clés à l’intérieur, sauf si tu en ajoutes.' }
				]
			},
			{
				title: 'Indexe la recherche du support',
				questions: [
					{ q: 'Quel index sert `settings @> \'{"beta": true}\'` ?', options: ['`CREATE INDEX ON customers USING GIN (settings jsonb_path_ops)`', '`CREATE INDEX ON customers (settings)`, un B-tree', '`CREATE INDEX ON customers ((settings->>\'beta\'))`', '`CREATE INDEX ON customers USING HASH (settings)`'], answer: 0, why: 'Un index GIN sur la colonne sert le containment sur n’importe quelle clé du document.' },
					{ q: 'Pourquoi choisir `jsonb_path_ops` plutôt que `jsonb_ops`, le défaut ?', options: ['Seul `jsonb_path_ops` supporte `@>`', 'Il est en général bien plus petit et plus précis, et aucune requête ici n’a besoin de `?`', 'Il sert aussi les filtres `->>`', 'Il n’a pas besoin de revérifier les lignes'], answer: 1, why: 'La doc dit qu’un index `jsonb_path_ops` est en général bien plus petit sur les mêmes données. Sa seule limite, pas de `?`, ne coûte rien ici.' },
					{ q: 'Qu’est-ce qu’un index `jsonb_path_ops` ne sait pas servir ?', options: ['`@>`', '`@?`', '`?`, l’existence d’une clé seule', '`@@`'], answer: 2, why: 'Il stocke un hash par chemin vers une valeur, donc il ne sait pas dire si une clé existe toute seule.' },
					{ q: 'Comment PostgreSQL répond-il à la recherche du support avec cet index ?', options: ['Il lit chaque document et analyse le JSON', 'Il parcourt un B-tree de valeurs texte', 'Il lit une copie en cache du dernier résultat', 'Il hache les chemins de la requête, les cherche dans le GIN, puis revérifie les lignes'], answer: 3, why: 'GIN est un index inversé : les entrées renvoient vers les lignes, et les lignes trouvées sont revérifiées.' }
				]
			},
			{
				title: 'Corrige le filtre de facturation',
				questions: [
					{ q: '`customers` reçoit des écritures toute la journée. Comment construire l’index de facturation sur `((settings->>\'plan\'))` sans les bloquer ?', options: ['`CREATE INDEX ON customers ((settings->>\'plan\'))` dans une transaction', '`CREATE INDEX CONCURRENTLY ON customers ((settings->>\'plan\'))`', '`REINDEX TABLE customers` d’abord', '`VACUUM FULL customers`, puis l’index'], answer: 1, why: 'Une construction concurrente laisse passer les écritures pendant qu’elle tourne (jour 26), et c’est ainsi que PostHog construit ses index GIN et partiels.' },
					{ q: 'Un client change d’offre, et l’application ne modifie que la clé `plan` dans `settings`. Qu’écrit PostgreSQL ?', options: ['Seulement la clé modifiée, sur place', 'Une nouvelle entrée dans l’index sur expression, et rien dans la table', 'Une nouvelle version de toute la ligne, sous un verrou sur toute la ligne', 'Rien jusqu’au prochain `VACUUM`'], answer: 2, why: 'Une valeur jsonb est réécrite en entier. La doc prévient que "any update acquires a row-level lock on the whole row".' },
					{ q: 'Quelles requêtes cet index sur expression peut-il servir ?', options: ['N’importe quel filtre sur `settings`', 'Seulement les filtres sur exactement `settings->>\'plan\'`', 'Les requêtes de containment avec `@>`', 'N’importe quelle clé lue avec `->>`'], answer: 1, why: 'Il indexe une seule expression. Chaque clé chaude demande la sienne, signe que la clé veut une colonne.' },
					{ q: 'Quelle réécriture laisserait plutôt l’index GIN de l’étape 2 servir la facturation ?', options: ['`settings->\'plan\' = \'"pro"\'`', '`lower(settings->>\'plan\') = \'pro\'`', '`settings::text LIKE \'%"pro"%\'`', '`settings @> \'{"plan": "pro"}\'`'], answer: 3, why: 'Le containment s’applique à la colonne elle-même, donc l’index GIN sait y répondre.' }
				]
			},
			{
				title: 'Promeus `plan` en colonne',
				questions: [
					{ q: 'Une fois que `plan` a sa propre colonne, que reste-t-il dans `settings` ?', options: ['Les clés dont la forme varie d’un client à l’autre, comme `beta`', 'Rien : supprime la colonne `settings`', 'Une copie de `plan`, tenue à jour par sécurité', 'Toutes les clés, pour que l’ancien code marche pour toujours'], answer: 0, why: 'Ne garde en jsonb que la partie dont la forme varie. La recherche du support sur `{"beta": true}` tourne toujours sur l’index GIN.' },
					{ q: 'Quelle définition de colonne bloque `"Pro"` et les plans absents ?', options: ['`plan jsonb`', '`plan text`, validé par l’application', '`plan text NOT NULL DEFAULT \'free\' CHECK (plan IN (\'free\', \'pro\', \'team\'))`', '`plan text UNIQUE`'], answer: 2, why: 'NOT NULL, un défaut et un CHECK sont appliqués par la base à chaque écriture. Une vérification côté application seule peut être contournée.' },
					{ q: 'Dans quel ordre fais-tu le changement ?', options: ['Retirer la clé, puis ajouter la colonne', 'Ajouter la colonne, la remplir par lots, basculer le code, puis retirer la clé', 'Basculer le code d’abord, puis ajouter la colonne', 'Ajouter, remplir et retirer dans une seule longue transaction'], answer: 1, why: 'Expand et contract : l’ancien et le nouveau code marchent à chaque étape, et le remplissage par lots garde les verrous courts.' },
					{ q: 'Comment vérifies-tu que chaque requête utilise l’index prévu ?', options: ['En comptant les lignes renvoyées', 'En la chronométrant sur un portable', 'En lisant la taille de l’index', '`EXPLAIN` montre un index scan ou un bitmap index scan dessus'], answer: 3, why: '`EXPLAIN` (jour 12) nomme l’index dans le plan. Une exécution rapide sur peu de données ne prouve rien.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu insères `{"a": 1, "a": 2}` dans une colonne `jsonb` et tu le relis. Qu’obtiens-tu ?',
			options: [
				'`{"a": 2}`, parce que jsonb ne garde que la dernière valeur d’une clé en double',
				'`{"a": 1}`, parce que jsonb ne garde que la première valeur d’une clé en double',
				'`{"a": 1, "a": 2}`, parce que jsonb garde le texte reçu exactement tel quel',
				'Une erreur, parce que jsonb refuse tout document avec une clé en double'
			],
			answer: 0,
			why: 'La doc : jsonb « does not keep duplicate object keys. If duplicate keys are specified in the input, only the last value is kept. » C’est le type `json` qui garde le texte exact, doublons compris.'
		},
		{
			q: 'Une table a `CREATE INDEX ON events USING GIN (data)`. Quel filtre peut utiliser cet index ?',
			options: [
				'`WHERE data->>\'country\' = \'FR\'`',
				'`WHERE data @> \'{"country": "FR"}\'`',
				'`WHERE (data->\'country\')::text = \'"FR"\'`',
				'`WHERE data::text LIKE \'%FR%\'`'
			],
			answer: 1,
			why: 'Les classes d’opérateurs GIN pour jsonb servent les opérateurs appliqués à la colonne indexée elle-même, comme `@>`. Les autres filtres comparent une expression construite à partir de la colonne, que cet index ne stocke pas.'
		},
		{
			q: 'Ton app filtre sur `status`, trie dessus, et ne doit jamais stocker une valeur inconnue. Où doit vivre `status` ?',
			options: [
				'Dans le document jsonb, avec un index GIN en jsonb_ops',
				'Dans le document jsonb, avec un index GIN en jsonb_path_ops',
				'Dans sa propre colonne typée, avec un CHECK et un B-tree',
				'Dans le document jsonb, validé par l’app avant chaque écriture'
			],
			answer: 2,
			why: 'Une colonne typée a un B-tree pour filtrer et trier, et une contrainte CHECK que la base applique à chaque écriture. La validation côté app seule peut être contournée et peut subir une course (jour 22).'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Indexer une colonne jsonb `customers.settings` en local, voir quels filtres utilisent quel index, et promouvoir `plan` en colonne vérifiée.',
		steps: [
			'Lance PostgreSQL et ouvre `psql` : `docker run -d --name doc-lab -e POSTGRES_PASSWORD=lab postgres:16`, attends quelques secondes, puis `docker exec -it doc-lab psql -U postgres`.',
			'Charge 200 000 clients, puis casse-en deux comme dans l’accroche : `CREATE TABLE customers (id bigint PRIMARY KEY, settings jsonb); INSERT INTO customers SELECT g, jsonb_build_object(\'plan\', (ARRAY[\'free\',\'free\',\'free\',\'pro\',\'team\'])[1 + g % 5], \'beta\', g % 50 = 0, \'theme\', \'dark\') FROM generate_series(1, 200000) g; UPDATE customers SET settings = settings || \'{"plan": "Pro"}\' WHERE id = 7; UPDATE customers SET settings = settings - \'plan\' WHERE id = 8;`',
			'Ajoute l’index GIN, nommé `customers_settings_gin`, et lance `ANALYZE customers;`. Puis `EXPLAIN (COSTS OFF)` sur les deux requêtes : `SELECT id FROM customers WHERE settings @> \'{"beta": true}\';` et `SELECT id FROM customers WHERE settings->>\'plan\' = \'pro\';`.',
			'Ajoute l’index sur expression pour `plan`, relance `ANALYZE`, et refais l’`EXPLAIN` de la facturation. Puis regarde les données : `SELECT settings->>\'plan\' AS plan, count(*) FROM customers GROUP BY 1 ORDER BY 1;`.',
			'Promeus `plan` : ajoute la colonne vérifiée, puis remplis-la avec `UPDATE customers SET plan = settings->>\'plan\' WHERE settings->>\'plan\' IS NOT NULL;`. Lis l’erreur, corrige le remplissage, ajoute un B-tree sur `plan`, et essaie `INSERT INTO customers (id, settings, plan) VALUES (0, \'{}\', \'Pro\');`.',
			'Quand tu as fini : `docker rm -f doc-lab`.'
		],
		done: [
			'Le plan du `@>` montre `Bitmap Index Scan on customers_settings_gin`.',
			'Avant l’index sur expression, le plan du `->>` montre un `Seq Scan` avec un `Filter`. Après, il montre un bitmap index scan sur l’index sur expression.',
			'Le `GROUP BY` liste `Pro` et un plan vide à côté de `free`, `pro` et `team`.',
			'Le premier remplissage échoue avec `violates check constraint "customers_plan_check"` sur la ligne 7, et l’insert de `\'Pro\'` échoue de la même façon.',
			'`EXPLAIN SELECT id FROM customers WHERE plan = \'pro\';` utilise le B-tree sur `plan`.'
		],
		solution: [
			'`CREATE INDEX customers_settings_gin ON customers USING GIN (settings jsonb_path_ops);` et `CREATE INDEX customers_plan_expr ON customers ((settings->>\'plan\'));`',
			'`ALTER TABLE customers ADD COLUMN plan text NOT NULL DEFAULT \'free\' CHECK (plan IN (\'free\', \'pro\', \'team\'));` La ligne 8, sans clé, garde le défaut `free`.',
			'Remplissage corrigé : `UPDATE customers SET plan = lower(settings->>\'plan\') WHERE settings->>\'plan\' IS NOT NULL;`, puis `CREATE INDEX ON customers (plan);`. Sur une vraie table, fais le remplissage par lots.',
			'Les mauvaises valeurs étaient dans le document depuis le début. La colonne les a transformées en erreurs dès la première écriture.'
		]
	},
	recall: {
		q: 'Quel filtre jsonb un index GIN sur la colonne peut-il servir, et de quoi un filtre `->>` a-t-il besoin à la place ?',
		a: 'Du containment appliqué à la colonne elle-même, comme `settings @> \'{"beta": true}\'`. Un filtre `->>` demande un index d’expression sur exactement cette expression, ou la clé déplacée dans une colonne typée avec un B-tree.'
	},
	sources: [
		{ title: 'Documentation PostgreSQL, JSON Types', url: 'https://www.postgresql.org/docs/current/datatype-json.html' },
		{ title: 'Documentation PostgreSQL, JSON Functions and Operators', url: 'https://www.postgresql.org/docs/current/functions-json.html' },
		{ title: 'Documentation PostgreSQL, Indexes on Expressions', url: 'https://www.postgresql.org/docs/current/indexes-expressional.html' },
		{ title: 'Documentation Django, JSONField', url: 'https://docs.djangoproject.com/en/stable/ref/models/fields/#jsonfield' },
		{ title: 'PostHog, migration 0850 (index partiel sur le journal d’activité)', url: `${PH}/posthog/migrations/0850_add_activitylog_org_scope_created_at.py#L26-L31` }
	]
};
