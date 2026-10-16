const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const VIS = `${PG}/src/backend/access/heap/heapam_visibility.c`;
const SNAP = `${PG}/src/include/utils/snapshot.h`;
const DDL = `${PG}/doc/src/sgml/ddl.sgml`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'mvcc',
	part: 'Plusieurs à la fois',
	title: 'Les lecteurs ne bloquent pas les écrivains',
	minutes: 10,
	hook: [
		'À 10 h, la compta lance un rapport : `SELECT sum(total) FROM orders`, vingt minutes sur une grosse table. La boutique continue de prendre des commandes pendant tout ce temps. **Aucun paiement n’attend le rapport, et le rapport n’attend aucun paiement.**',
		'Et le total reste juste. Il ne compte pas la moitié d’une commande en cours d’écriture, ni une commande arrivée à la douzième minute. **Il voit la table telle qu’elle était quand il a commencé.**',
		'PostgreSQL y arrive avec des versions, pas avec des verrous. Chaque UPDATE écrit une nouvelle version de la ligne (jour 16), et chaque version note quelle transaction l’a créée et laquelle l’a remplacée. **Chaque requête tient un snapshot** qui dit lesquelles de ces transactions comptent. La doc le résume : « reading never blocks writing and writing never blocks reading » (lire ne bloque jamais l’écriture, et écrire ne bloque jamais la lecture).'
	],
	terms: [
		{ term: 'MVCC', def: 'Multiversion concurrency control, ou contrôle de concurrence multiversion. La base garde plusieurs versions d’une ligne, et chaque transaction lit celle qui correspond à son snapshot.' },
		{ term: 'xmin', def: 'Une colonne cachée sur chaque version de ligne : l’identifiant de la transaction qui l’a insérée. Tu peux la sélectionner : `SELECT xmin, xmax, * FROM orders`.' },
		{ term: 'xmax', def: 'L’identifiant de la transaction qui a supprimé ou remplacé cette version, ou zéro. Un xmax non nul sur une ligne visible veut en général dire que cette transaction n’a pas committé, ou a été annulée.' },
		{ term: 'Snapshot', def: 'Trois choses : xmin (toute transaction plus ancienne est terminée), xmax (toute transaction à partir de là est invisible), et la liste des transactions encore en cours entre les deux.' },
		{ term: 'Visible', def: 'Une version de ligne est visible pour un snapshot si sa transaction d’insertion compte comme committée pour ce snapshot, et sa transaction de suppression non.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['t100["Tx 100 : INSERT commande 7, committée"] --> v1["Version A : xmin 100, xmax 0"]'],
				highlight: ['t100', 'v1'],
				note: '**Chaque version est tamponnée.** La transaction 100 insère la commande 7 et committe. La version de ligne note `xmin = 100`. Son `xmax` vaut zéro : personne ne l’a supprimée ni remplacée.'
			},
			{
				add: ['t105["Tx 105 : UPDATE commande 7, encore ouverte"] -->|"pose xmax 105"| v1', 't105 --> v2["Version B : xmin 105, xmax 0"]'],
				highlight: ['t105', 'v2'],
				note: '**Un update, c’est une suppression plus une insertion.** La transaction 105 modifie la commande 7 et n’a pas encore committé. Elle pose `xmax = 105` sur la version A et écrit la version B avec `xmin = 105`. Les deux versions sont maintenant sur le disque.'
			},
			{
				add: ['snap["Snapshot du rapport 103:106:105"] -.->|"105 encore en cours : voit A"| v1', 'snap -.->|"ignore B"| v2'],
				highlight: ['snap'],
				note: '**Le rapport décide d’après son snapshot.** Écrit `xmin:xmax:en_cours`, il dit : tout XID sous 103 est terminé, tout XID à partir de 106 est invisible, et 105 était encore en cours. La suppression de la version A ne compte donc pas encore : A est visible. L’insertion de B ne compte pas : B est ignorée. **Personne n’a attendu.**'
			},
			{
				add: ['t105 --> commit["Tx 105 committe"]', 'later["Requête lancée après le commit"] -.->|"voit B"| v2'],
				highlight: ['commit', 'later'],
				note: '**Un commit ne change pas les vieux snapshots.** Après le commit de 105, une nouvelle requête prend un nouveau snapshot où 105 est terminée, et voit B. Le rapport commencé avant continue de voir A jusqu’au bout, parce que son snapshot liste toujours 105 comme en cours.'
			},
			{
				add: ['v1 -.->|"morte quand plus aucun snapshot n’en a besoin"| vac["VACUUM"]'],
				highlight: ['vac'],
				note: '**Le prix.** La version A reste sur le disque tant qu’un snapshot pourrait en avoir besoin. Quand plus aucun ne le peut, elle est morte et VACUUM la retire (jour 16). C’est pour ça qu’un rapport de vingt minutes, ou une transaction restée ouverte, garde de vieilles versions en vie.'
			}
		]
	},
	example: {
		title: 'src/backend/access/heap/heapam_visibility.c : cette version de ligne est-elle visible pour mon snapshot ?',
		repo: 'postgres/postgres',
		url: `${VIS}#L937-L1153`,
		lang: 'c',
		code: `/*
 * HeapTupleSatisfiesMVCC
 *		True iff heap tuple is valid for the given MVCC snapshot.
…
	if (!HeapTupleHeaderXminCommitted(tuple))
	{
		if (HeapTupleHeaderXminInvalid(tuple))
			return false;
…
		else if (XidInMVCCSnapshot(HeapTupleHeaderGetRawXmin(tuple), snapshot))
			return false;
		else if (TransactionIdDidCommit(HeapTupleHeaderGetRawXmin(tuple)))
			SetHintBits(tuple, buffer, HEAP_XMIN_COMMITTED,
						HeapTupleHeaderGetRawXmin(tuple));
		else
		{
			/* it must have aborted or crashed */
			SetHintBits(tuple, buffer, HEAP_XMIN_INVALID,
						InvalidTransactionId);
			return false;
		}
	}
	else
	{
		/* xmin is committed, but maybe not according to our snapshot */
		if (!HeapTupleHeaderXminFrozen(tuple) &&
			XidInMVCCSnapshot(HeapTupleHeaderGetRawXmin(tuple), snapshot))
			return false;		/* treat as still in progress */
	}
…
	/* by here, the inserting transaction has committed */

	if (tuple->t_infomask & HEAP_XMAX_INVALID)	/* xid invalid or aborted */
		return true;

	if (HEAP_XMAX_IS_LOCKED_ONLY(tuple->t_infomask))
		return true;
…
		if (XidInMVCCSnapshot(HeapTupleHeaderGetRawXmax(tuple), snapshot))
			return true;

		if (!TransactionIdDidCommit(HeapTupleHeaderGetRawXmax(tuple)))
		{
			/* it must have aborted or crashed */
			SetHintBits(tuple, buffer, HEAP_XMAX_INVALID,
						InvalidTransactionId);
			return true;
		}
…
	/* xmax transaction committed */

	return false;`,
		notes: [
			'**Ce que contient un snapshot.** Dans [`snapshot.h`](' + SNAP + '#L148-L165) : « An MVCC snapshot can never see the effects of XIDs >= xmax. It can see the effects of all older XIDs except those listed in the snapshot. » (un snapshot ne voit jamais les XID à partir de xmax, et voit tous les plus anciens sauf ceux de sa liste). Cette liste, c’est `xip`, les transactions en cours au moment du snapshot. Sa [définition](' + SNAP + '#L33-L46) ajoute qu’il voit aussi les « previous commands of this transaction » : tes propres écritures sont toujours à toi.',
			'**Première question : l’insertion compte-t-elle ?** Si `xmin` est dans la liste des transactions en cours du snapshot, la version est invisible. Si elle a committé, le code le note dans l’en-tête de la ligne avec `SetHintBits`, pour que le lecteur suivant saute la vérification. Sinon, « it must have aborted or crashed » (elle a dû être annulée ou planter) et la version est invisible. Poser un hint bit [marque la page comme modifiée](' + VIS + '#L6-L11), c’est pour ça qu’un simple SELECT peut provoquer des écritures.',
			'**Committée, mais peut-être pas pour nous.** Même avec le hint bit de commit posé, une version dont le `xmin` est dans la liste de ce snapshot est ignorée : [« treat as still in progress »](' + VIS + '#L1076-L1082) (à traiter comme encore en cours), dit le commentaire. Une ligne gelée (jour 16) saute ce test : elle est assez vieille pour être visible par tout le monde.',
			'**Deuxième question : la suppression compte-t-elle ?** Pas de `xmax`, ou un `xmax` qui a seulement verrouillé la ligne : visible. Un `xmax` dans la liste des transactions en cours du snapshot, ou un `xmax` annulé : toujours visible. Seule une suppression committée avant le snapshot cache la version. La [doc des colonnes système](' + DDL + '#L1525-L1531) dit la même chose d’un `xmax` non nul sur une ligne visible.'
		]
	},
	tradeoff: {
		gain: [
			'Les lectures n’attendent jamais les écritures, et les écritures n’attendent jamais les lectures. Un long rapport et un paiement chargé tournent côte à côte.',
			'Chaque requête voit un état cohérent de la base, sans prendre un seul verrou pour l’obtenir.',
			'Annuler coûte peu : les versions de la transaction annulée ne sont jamais visibles, et VACUUM les nettoie plus tard.'
		],
		cost: [
			'Chaque UPDATE écrit une version complète de la ligne, et l’ancienne reste jusqu’à ce que VACUUM la retire (jour 16).',
			'Une longue requête ou une transaction ouverte et inactive garde de vieilles versions en vie pour toute la base, donc les tables gonflent.',
			'Vérifier la visibilité coûte du travail à chaque ligne lue, et poser des hint bits peut transformer une lecture en écriture sur le disque.',
			'Les écrivains bloquent toujours les écrivains : deux transactions qui modifient la même ligne passent chacune leur tour. Ce sont les verrous (jour 20).'
		]
	},
	task: {
		prompt: 'Ton snapshot est `103:106:105`. Les transactions 90, 101, 104 et 107 ont committé, 102 a été annulée, 105 tourne encore. Pour chaque version de ligne, dis si ta requête la voit : A (xmin 90, xmax 0), B (xmin 101, xmax 104), C (xmin 104, xmax 105), D (xmin 105, xmax 0), E (xmin 107, xmax 0), F (xmin 102, xmax 0).',
		hint: 'Deux questions par version : l’insertion compte-t-elle pour ce snapshot, et si oui, la suppression compte-t-elle ? Sous 103, c’est terminé. À partir de 106, c’est invisible. 105 est dans la liste des transactions en cours.',
		answer: [
			'A : visible. 90 est sous 103 et a committé, et personne ne l’a supprimée.',
			'B : invisible. 101 a committé, mais 104 est sous 106, absent de la liste, et committé : la suppression compte.',
			'C : visible. 104 compte, et la suppression par 105 est dans la liste des transactions en cours, donc elle ne compte pas encore.',
			'D : invisible, insérée par 105, encore en cours pour ce snapshot. E : invisible, 107 est à 106 ou au-dessus, même s’il a committé. F : invisible, 102 a été annulée.',
			'Pour le voir en vrai : ouvre deux sessions `psql`, lance `BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT pg_current_snapshot(), xmin, xmax, * FROM accounts;` dans l’une, modifie une ligne dans l’autre, puis refais le SELECT dans la première. Elle voit toujours l’ancienne version.'
		]
	},
	quiz: [
		{
			q: 'Un rapport de vingt minutes lance `SELECT sum(total) FROM orders` pendant que les paiements continuent de modifier les commandes. Que se passe-t-il ?',
			options: [
				'Les paiements attendent la fin du rapport, pour que la somme ne bouge pas',
				'Le rapport attend sur chaque ligne qu’un paiement modifie, jusqu’à son commit',
				'Les deux tournent sans attendre, et le rapport voit les lignes selon son snapshot',
				'Les deux tournent, et le rapport additionne chaque commande dans l’état où il la lit'
			],
			answer: 2,
			why: 'Avec MVCC, lire ne bloque jamais l’écriture et écrire ne bloque jamais la lecture. Le rapport utilise son snapshot pour choisir, pour chaque ligne, la version qui était committée quand il a commencé.'
		},
		{
			q: 'Ton snapshot est `103:106:105`. La transaction 105 committe une seconde après le début de ta requête. Ta requête voit-elle les lignes insérées par 105 ?',
			options: [
				'Oui, parce que 105 est sous 106, le xmax du snapshot',
				'Oui, dès que le hint bit est posé sur chaque ligne',
				'Non, parce que 105 est listée en cours dans le snapshot',
				'Non, parce que tout XID au-dessus de 103 est invisible'
			],
			answer: 2,
			why: 'Un snapshot est figé au moment où il est pris. 105 est dans sa liste des transactions en cours, donc ses lignes restent invisibles pour ce snapshot même après le commit. Le code de visibilité traite une telle version comme encore en cours, hint bit ou pas.'
		},
		{
			q: 'Tu sélectionnes `xmin, xmax, *` et tu vois une ligne avec `xmax = 812` que ta requête renvoie quand même. Quelle est la raison la plus probable ?',
			options: [
				'La transaction 812 l’a supprimée ou verrouillée, sans avoir committé de suppression',
				'La transaction 812 l’a supprimée, et VACUUM ne l’a pas encore retirée',
				'La transaction 812 a inséré une version plus récente qui remplace celle-ci',
				'La ligne est gelée, donc son xmax n’est gardé que pour des analyses futures'
			],
			answer: 0,
			why: 'Une suppression committée qui compte pour ton snapshot cacherait la ligne. Une ligne visible avec un xmax non nul veut dire que la transaction de suppression tourne encore, a été annulée, ou n’a pris qu’un verrou de ligne.'
		}
	],
	takeaway: 'Chaque version de ligne porte qui l’a créée (xmin) et qui l’a remplacée (xmax). Un snapshot décide lesquelles comptent, donc lecteurs et écrivains ne s’attendent jamais, et les vieilles versions traînent jusqu’à ce qu’aucun snapshot n’en ait besoin.',
	sources: [
		{ title: 'PostgreSQL docs, Concurrency Control: Introduction', url: 'https://www.postgresql.org/docs/18/mvcc-intro.html' },
		{ title: 'PostgreSQL docs, System Columns', url: 'https://www.postgresql.org/docs/18/ddl-system-columns.html' },
		{ title: 'PostgreSQL docs, Transaction ID and Snapshot Information Functions', url: 'https://www.postgresql.org/docs/18/functions-info.html#FUNCTIONS-PG-SNAPSHOT' },
		{ title: 'PostgreSQL source, heapam_visibility.c', url: `${VIS}` }
	]
};
