const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const AV = `${PG}/src/backend/postmaster/autovacuum.c`;
const MAINT = `${PG}/doc/src/sgml/maintenance.sgml`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'vacuum',
	part: 'Dans le moteur',
	title: 'Lignes mortes et VACUUM',
	minutes: 10,
	hook: [
		'Ta table `jobs` ne contient jamais plus de quelques milliers de lignes. Les workers mettent à jour chaque ligne trois ou quatre fois : en attente, en cours, terminée. Un mois plus tard, **la table pèse des gigaoctets sur le disque** et un simple `SELECT count(*)` a ralenti.',
		'Dans PostgreSQL, **un UPDATE n’écrase pas la ligne**. Il écrit une nouvelle version et laisse l’ancienne à sa place. Un DELETE laisse lui aussi la ligne en place. Une autre transaction lit peut-être encore l’ancienne version, donc PostgreSQL ne peut pas la retirer tout de suite.',
		'VACUUM retire ces lignes mortes dès qu’aucune transaction ne peut plus les voir. La plupart du temps, un processus de fond appelé autovacuum le lance pour toi. Il gèle aussi les vieilles lignes, et s’il prend trop de retard sur ce travail, le serveur refuse les nouvelles écritures.'
	],
	terms: [
		{ term: 'Ligne morte', def: 'Une ancienne version de ligne laissée par un UPDATE ou un DELETE. Elle prend encore de la place dans sa page (jour 9) jusqu’à ce que VACUUM la retire.' },
		{ term: 'VACUUM', def: 'Retire les versions mortes qu’aucune transaction ne peut voir et marque la place comme libre pour de nouvelles lignes de la même table. Il ne bloque ni les lectures ni les écritures.' },
		{ term: 'Autovacuum', def: 'Un processus lanceur et des processus workers qui vérifient chaque table et lancent VACUUM et ANALYZE quand assez de lignes ont changé.' },
		{ term: 'Identifiant de transaction (XID)', def: 'Un nombre sur 32 bits que reçoit chaque transaction qui écrit. Chaque version de ligne garde le XID qui l’a créée, et la visibilité compare des XID.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['upd["UPDATE jobs SET state = done"] --> v2["Nouvelle version : vivante"]', 'upd --> v1["Ancienne version : morte"]'],
				highlight: ['upd', 'v1', 'v2'],
				note: 'L’UPDATE écrit une nouvelle version de la ligne et marque l’ancienne comme remplacée. La doc : un UPDATE ou un DELETE « does not immediately remove the old version of the row » (ne retire pas tout de suite l’ancienne version). Les deux versions restent dans les pages de la table.'
			},
			{
				add: ['tx["Transaction ouverte avant"] -.->|"peut encore lire"| v1'],
				highlight: ['tx'],
				note: 'Une transaction qui a commencé avant l’UPDATE a peut-être encore besoin de l’ancienne version. La doc : la version « must not be deleted while it is still potentially visible to other transactions » (ne doit pas être supprimée tant que d’autres transactions peuvent encore la voir). Donc **une seule longue transaction ouverte bloque le nettoyage** de toutes les tables qu’elle pourrait lire.'
			},
			{
				add: ['av["Worker autovacuum"] -->|"lignes mortes au-delà du seuil"| v1'],
				highlight: ['av'],
				note: 'Un worker visite chaque base toutes les `autovacuum_naptime` (1 minute par défaut). Il lance VACUUM sur une table quand ses lignes mortes dépassent 50 + 20 % des lignes de la table. Une grosse table peut accumuler beaucoup de lignes mortes avant ça.'
			},
			{
				add: ['v1 --> free["Place libre dans la page, réutilisée par de nouvelles lignes"]'],
				highlight: ['free'],
				note: 'Un VACUUM simple retire les versions mortes et marque la place comme libre pour les futures lignes de la même table. Il ne rend le disque au système que si des pages entières sont vides à la fin de la table. Le fichier garde donc en général la même taille.'
			},
			{
				add: ['av -->|"gèle les vieilles lignes"| frozen["Lignes gelées : à l’abri du wraparound des XID"]'],
				highlight: ['frozen'],
				note: 'Les XID font 32 bits et se comparent en cercle, donc une ligne plus vieille qu’environ deux milliards de transactions semblerait tout à coup venir du futur. Avant ce point, VACUUM gèle les vieilles lignes : il les marque visibles par toutes les transactions, et leur XID n’est plus comparé. Autovacuum force ce passage même sur les tables où tu l’as coupé.'
			}
		]
	},
	example: {
		title: 'src/backend/postmaster/autovacuum.c : comment un worker décide qu’une table a besoin de VACUUM',
		repo: 'postgres/postgres',
		url: `${AV}#L2939-L3147`,
		lang: 'c',
		code: ` * A table needs to be vacuumed if the number of dead tuples exceeds a
 * threshold.  This threshold is calculated as
 *
 * threshold = vac_base_thresh + vac_scale_factor * reltuples
 * if (threshold > vac_max_thresh)
 *     threshold = vac_max_thresh;
…
	/* Force vacuum if table is at risk of wraparound */
	xidForceLimit = recentXid - freeze_max_age;
	if (xidForceLimit < FirstNormalTransactionId)
		xidForceLimit -= FirstNormalTransactionId;
	relfrozenxid = classForm->relfrozenxid;
	force_vacuum = (TransactionIdIsNormal(relfrozenxid) &&
					TransactionIdPrecedes(relfrozenxid, xidForceLimit));
…
	*wraparound = force_vacuum;
…
		vacthresh = (float4) vac_base_thresh + vac_scale_factor * reltuples;
		if (vac_max_thresh >= 0 && vacthresh > (float4) vac_max_thresh)
			vacthresh = (float4) vac_max_thresh;
…
		/* Determine if this table needs vacuum or analyze. */
		*dovacuum = force_vacuum || (vactuples > vacthresh) ||
			(vac_ins_base_thresh >= 0 && instuples > vacinsthresh);
		*doanalyze = (anltuples > anlthresh);`,
		notes: [
			'Les lignes 18 à 20 calculent le seuil que décrivent les lignes 4 à 6. La [doc donne la même formule](' + MAINT + '#L925-L935) et les valeurs par défaut : une base de 50 lignes, un facteur d’échelle de 0.2 et un plafond de 100 000 000. Une table d’un million de lignes attend donc 200 050 lignes mortes, et une table d’un milliard de lignes touche le plafond.',
			'La ligne 23 compare `vactuples` à ce seuil. `vactuples` est lu dans `tabentry->dead_tuples`, les statistiques cumulées, que la doc décrit comme « an eventually-consistent count updated by each UPDATE, DELETE and INSERT operation » (un compte cohérent à terme, mis à jour par chaque UPDATE, DELETE et INSERT, [source](' + MAINT + '#L960-L962)). Tu lis le même nombre dans la colonne `n_dead_tup` de `pg_stat_user_tables`.',
			'Les lignes 8 à 14 calculent `force_vacuum` en premier, à partir de `relfrozenxid` et de `freeze_max_age`, et la ligne 23 lance VACUUM dès qu’il vaut vrai. Le retour anticipé pour une table où autovacuum est coupé est sauté si la table est en danger : « (But ignore if at risk) ». La doc : le passage forcé a lieu [« even if autovacuum is disabled »](' + MAINT + '#L530-L534) (même si autovacuum est désactivé).',
			'Si autovacuum prend quand même du retard, le serveur écrit un avertissement par base à quarante millions de transactions du wraparound. À trois millions, il [« will refuse to assign new XIDs »](' + MAINT + '#L684-L694) (refuse d’attribuer de nouveaux XID) : seules les transactions en lecture seule peuvent démarrer. La doc liste les réparations, à commencer par terminer les longues transactions et supprimer les vieux slots de réplication, parce qu’ils retiennent les vieilles lignes.'
		]
	},
	tradeoff: {
		gain: [
			'Les lecteurs n’attendent jamais les écrivains : un UPDATE laisse l’ancienne version en place, donc un lecteur qui en a besoin la trouve encore.',
			'Un UPDATE ou un DELETE coûte peu au commit. Le nettoyage se fait plus tard, en tâche de fond, hors du chemin de la requête.',
			'SELECT, INSERT, UPDATE et DELETE continuent de marcher pendant qu’un VACUUM simple passe sur la même table.'
		],
		cost: [
			'Une table souvent mise à jour grossit au-delà de ses données vivantes, et un VACUUM simple ne réduit pas le fichier.',
			'Pour la réduire, il faut VACUUM FULL, qui prend un verrou ACCESS EXCLUSIVE et du disque en plus pour la nouvelle copie. Aucune lecture ni écriture ne passe pendant ce temps.',
			'Une transaction oubliée, ou un slot de réplication pour un serveur disparu, bloque le nettoyage de tout le cluster.',
			'Les I/O de VACUUM « can cause poor performance for other active sessions » (peuvent dégrader les performances des autres sessions), prévient la doc. Pour limiter ça, autovacuum fait des pauses en travaillant (`autovacuum_vacuum_cost_delay`, 2 ms par défaut).'
		]
	},
	task: {
		prompt: 'Avec les réglages par défaut, combien de lignes mortes chaque table accumule-t-elle avant qu’autovacuum passe : `sessions` (10 000 lignes), `orders` (1 000 000 lignes), `events` (1 000 000 000 lignes) ? Écris ensuite la requête que tu lancerais dans `psql` pour trouver les tables avec le plus de lignes mortes, et un changement pour `events`.',
		hint: 'Seuil = 50 + 0,2 × lignes, plafonné à 100 000 000. Les comptes vivent dans une vue de statistiques.',
		answer: [
			'`sessions` : 50 + 0,2 × 10 000 = 2 050 lignes mortes, donc une petite table passe au VACUUM après quelques milliers de changements.',
			'`orders` : 50 + 0,2 × 1 000 000 = 200 050 lignes mortes.',
			'`events` : 50 + 0,2 × 1 000 000 000 = 200 000 050, au-dessus du plafond, donc 100 000 000 lignes mortes.',
			'Dans `psql` : `SELECT relname, n_live_tup, n_dead_tup, last_autovacuum FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;`',
			'Pour `events`, baisse son propre facteur d’échelle : `ALTER TABLE events SET (autovacuum_vacuum_scale_factor = 0.01);` met le seuil à 10 000 050. Et cherche les transactions qui restent ouvertes des heures : aucun réglage n’aide tant que l’une d’elles retient les vieilles lignes.'
		]
	},
	quiz: [
		{
			q: 'Tu lances `UPDATE jobs SET state = \'done\' WHERE id = 7` et tu commites. Qu’arrive-t-il à l’ancienne version de la ligne ?',
			options: [
				'Elle reste dans la table jusqu’à ce que VACUUM la retire, quand plus personne ne la voit',
				'Elle est écrasée sur place, et l’ancienne valeur n’est gardée que dans le WAL',
				'Elle part dans une zone d’annulation séparée, que le prochain checkpoint vide',
				'Elle est retirée au commit, donc seules les transactions encore ouvertes la perdent'
			],
			answer: 0,
			why: 'PostgreSQL garde les anciennes versions dans la table elle-même. Une transaction commencée avant peut encore en avoir besoin, donc seul VACUUM, plus tard, la retire et marque la place comme libre.'
		},
		{
			q: 'Une table a 1 000 000 de lignes et les réglages autovacuum par défaut. Environ combien de lignes mortes doit-elle accumuler avant qu’autovacuum passe ?',
			options: [
				'50, le seuil de base, quelle que soit la taille de la table',
				'1 000 050, une fois que chaque ligne a été remplacée une fois',
				'200 050, soit 50 plus 20 % des lignes de la table',
				'100 000 000, le seuil maximum fixé pour toutes les tables'
			],
			answer: 2,
			why: 'Le seuil, c’est la base (50) plus le facteur d’échelle (0,2) fois `reltuples`, plafonné à `autovacuum_vacuum_max_threshold`. Pour un million de lignes, ça fait 200 050, bien sous le plafond.'
		},
		{
			q: 'Tu mets `autovacuum_enabled = false` sur une grosse table jamais mise à jour. Des mois plus tard, autovacuum passe quand même dessus. Pourquoi ?',
			options: [
				'Autovacuum ignore les réglages par table et ne lit que `postgresql.conf`',
				'Les insertions comptent comme lignes mortes, donc la table a franchi son seuil',
				'Son plus vieux XID non gelé a dépassé `autovacuum_freeze_max_age`, le passage est forcé',
				'ANALYZE avait besoin de statistiques fraîches, et il tourne toujours dans VACUUM'
			],
			answer: 2,
			why: 'Les XID font le tour après environ deux milliards de transactions. Pour que les vieilles lignes ne passent pas pour des lignes du futur, autovacuum force un passage de gel dès que `relfrozenxid` est plus vieux que `autovacuum_freeze_max_age`, même si autovacuum est coupé pour cette table.'
		}
	],
	recall: {
		q: 'Un UPDATE laisse l’ancienne version de la ligne dans la table. Avec les réglages par défaut, quand autovacuum la retire-t-il ?',
		a: 'Quand les lignes mortes de la table dépassent 50 + 20 % de ses lignes (200 050 pour un million de lignes), et seulement quand plus aucune transaction ouverte ne peut voir l’ancienne version.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Routine Vacuuming', url: 'https://www.postgresql.org/docs/18/routine-vacuuming.html' },
		{ title: 'PostgreSQL docs, Automatic Vacuuming settings', url: 'https://www.postgresql.org/docs/18/runtime-config-vacuum.html' },
		{ title: 'PostgreSQL docs, The Cumulative Statistics System (pg_stat_all_tables)', url: 'https://www.postgresql.org/docs/18/monitoring-stats.html' },
		{ title: 'PostgreSQL source, autovacuum.c', url: `${AV}` }
	]
};
