const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const VIS = `${PG}/src/backend/access/heap/heapam_visibility.c`;
const SNAP = `${PG}/src/include/utils/snapshot.h`;
const DDL = `${PG}/doc/src/sgml/ddl.sgml`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'mvcc',
	part: 'Plusieurs à la fois',
	title: 'MVCC : versions de lignes et snapshots',
	minutes: 10,
	hook: [
		'À 10 h, la compta lance un rapport : `SELECT sum(total) FROM orders`, vingt minutes sur une grosse table. La boutique continue de prendre des commandes pendant tout ce temps. **Aucun paiement n’attend le rapport, et le rapport n’attend aucun paiement.**',
		'Le total du rapport ne compte pas la moitié d’une commande en cours d’écriture, ni une commande arrivée à la douzième minute. **Il voit la table telle qu’elle était quand il a commencé.**',
		'Pour ça, PostgreSQL garde plusieurs versions de chaque ligne au lieu de verrouiller les lignes pour le rapport. Chaque UPDATE écrit une nouvelle version de la ligne (jour 16), et chaque version note quelle transaction l’a créée et laquelle l’a remplacée. **Chaque requête tient un snapshot** qui dit lesquelles de ces transactions comptent. La doc : « reading never blocks writing and writing never blocks reading » (lire ne bloque jamais l’écriture, et écrire ne bloque jamais la lecture).'
	],
	terms: [
		{ term: 'MVCC', def: 'Multiversion concurrency control, ou contrôle de concurrence multiversion. La base garde plusieurs versions d’une ligne, et chaque transaction lit celle qui correspond à son snapshot.' },
		{ term: 'xmin', def: 'Une colonne cachée sur chaque version de ligne : l’identifiant de la transaction qui l’a insérée. Tu peux la sélectionner : `SELECT xmin, xmax, * FROM orders`.' },
		{ term: 'xmax', def: 'L’identifiant de la transaction qui a supprimé ou remplacé cette version, ou zéro. Un xmax non nul sur une ligne visible veut en général dire que cette transaction n’a pas committé, ou a été annulée.' },
		{ term: 'Snapshot', def: 'Trois choses : xmin (toute transaction plus ancienne est terminée), xmax (toute transaction à partir de là est invisible), et la liste des transactions encore en cours entre les deux.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['t100["Tx 100 : INSERT commande 7, committée"] --> v1["Version A : xmin 100, xmax 0"]'],
				highlight: ['t100', 'v1'],
				note: 'La transaction 100 insère la commande 7 et committe. La version de ligne note `xmin = 100`. Son `xmax` vaut zéro : personne ne l’a supprimée ni remplacée.'
			},
			{
				add: ['t105["Tx 105 : UPDATE commande 7, encore ouverte"] -->|"pose xmax 105"| v1', 't105 --> v2["Version B : xmin 105, xmax 0"]'],
				highlight: ['t105', 'v2'],
				note: 'Un UPDATE, c’est une suppression plus une insertion. La transaction 105 modifie la commande 7 et n’a pas encore committé. Elle pose `xmax = 105` sur la version A et écrit la version B avec `xmin = 105`, donc les deux versions sont sur le disque.'
			},
			{
				add: ['snap["Snapshot du rapport 103:106:105"] -.->|"105 encore en cours : voit A"| v1', 'snap -.->|"ignore B"| v2'],
				highlight: ['snap'],
				note: 'Le snapshot du rapport s’écrit `xmin:xmax:en_cours` : tout XID sous 103 est terminé, tout XID à partir de 106 est invisible, et 105 était encore en cours. La suppression de la version A ne compte donc pas encore, et A est visible. L’insertion de B ne compte pas non plus, donc B est ignorée. **Ni le rapport ni la transaction 105 n’ont attendu.**'
			},
			{
				add: ['t105 --> commit["Tx 105 committe"]', 'later["Requête lancée après le commit"] -.->|"voit B"| v2'],
				highlight: ['commit', 'later'],
				note: 'Après le commit de 105, une nouvelle requête prend un nouveau snapshot où 105 est terminée, et voit B. Le rapport commencé avant continue de voir A jusqu’au bout, parce que son snapshot liste toujours 105 comme en cours.'
			},
			{
				add: ['v1 -.->|"morte quand plus aucun snapshot n’en a besoin"| vac["VACUUM"]'],
				highlight: ['vac'],
				note: 'La version A reste sur le disque tant qu’un snapshot pourrait en avoir besoin. Quand plus aucun ne le peut, elle est morte et VACUUM la retire (jour 16). Un rapport de vingt minutes, ou une transaction restée ouverte, garde donc de vieilles versions sur le disque tant qu’il tourne.'
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
			'Les règles d’un snapshot sont dans [`snapshot.h`](' + SNAP + '#L148-L165) : « An MVCC snapshot can never see the effects of XIDs >= xmax. It can see the effects of all older XIDs except those listed in the snapshot. » (un snapshot ne voit jamais les XID à partir de xmax, et voit tous les plus anciens sauf ceux de sa liste). Cette liste, c’est `xip`, les transactions en cours au moment du snapshot. La définition de la struct ajoute qu’il voit aussi les « previous commands of this transaction » (les commandes précédentes de cette transaction) : une transaction voit toujours ses propres écritures.',
			'Les lignes 5 à 22 vérifient si l’insertion compte : si `xmin` est dans la liste des transactions en cours du snapshot (ligne 10), la version est invisible. Si elle a committé, la ligne 13 le note dans l’en-tête de la ligne avec `SetHintBits`, et le lecteur suivant saute la vérification. Sinon, « it must have aborted or crashed » (elle a dû être annulée ou planter, ligne 17) et la version est invisible. Poser un hint bit [marque la page comme modifiée](' + VIS + '#L6-L11), donc un simple SELECT peut provoquer des écritures.',
			'Les lignes 23 à 29 traitent une version dont le `xmin` porte déjà le hint bit de commit. Si ce `xmin` est dans la liste de ce snapshot, la version reste ignorée : « treat as still in progress » (à traiter comme encore en cours), dit le commentaire de la ligne 28. Une ligne gelée (jour 16) saute ce test, parce qu’elle est assez vieille pour être visible par tout le monde.',
			'Les lignes 33 à 52 vérifient si la suppression compte. Pas de `xmax`, ou un `xmax` qui a seulement verrouillé la ligne (lignes 33 à 37) : visible. Un `xmax` dans la liste des transactions en cours du snapshot, ou un `xmax` annulé (lignes 39 à 47) : toujours visible. Seule une suppression committée avant le snapshot cache la version (ligne 52), et la [doc des colonnes système](' + DDL + '#L1525-L1531) dit la même chose d’un `xmax` non nul sur une ligne visible.'
		]
	},
	tradeoff: {
		gain: [
			'Un rapport de vingt minutes et les paiements tournent côte à côte, et aucun n’attend l’autre.',
			'Chaque requête voit un état cohérent de la base, sans prendre un seul verrou pour l’obtenir.',
			'Annuler coûte peu : les versions de la transaction annulée ne sont jamais visibles, et VACUUM les nettoie plus tard.'
		],
		cost: [
			'Chaque UPDATE écrit une version complète de la ligne, et l’ancienne reste jusqu’à ce que VACUUM la retire (jour 16).',
			'Une longue requête ou une transaction ouverte et inactive garde de vieilles versions en vie pour toute la base, donc les tables gonflent.',
			'Vérifier la visibilité coûte du travail à chaque ligne lue, et poser des hint bits peut transformer une lecture en écriture sur le disque.',
			'Deux transactions qui modifient la même ligne passent toujours chacune leur tour : la seconde attend que la première finisse (verrous de ligne, jour 20).'
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
		],
		steps: [
			{
				title: 'Lis le snapshot',
				questions: [
					{ q: 'Dans `103:106:105`, que veut dire 103 ?', options: ['Le XID de ta propre transaction', 'Tout XID sous 103 est terminé', 'Tout XID sous 103 est invisible', 'Le nombre de lignes du snapshot'], answer: 1, why: 'Le premier nombre est le xmin du snapshot : toute transaction plus ancienne a committé ou a été annulée.' },
					{ q: 'Que veut dire 106 ?', options: ['Tout XID à partir de 106 a committé', '106 est la prochaine version de ligne', 'Tout XID à partir de 106 est invisible', '106 tourne encore'], answer: 2, why: 'Le deuxième nombre est le xmax du snapshot : un snapshot « can never see the effects of XIDs >= xmax ».' },
					{ q: 'Que veut dire le 105 à la fin ?', options: ['105 tournait encore quand le snapshot a été pris', '105 a été annulée', '105 est le dernier XID qui a committé', '105 est ta propre transaction'], answer: 0, why: 'La liste après le deuxième deux-points contient les transactions en cours. Leur travail est invisible pour ce snapshot.' },
					{ q: 'La transaction 104 est entre 103 et 106, absente de la liste, et a committé. Son travail compte-t-il ?', options: ['Non, tout ce qui est au-dessus de 103 est invisible', 'Seulement pour les lignes qu’elle a insérées', 'Seulement après un VACUUM', 'Oui, elle a fini avant le snapshot'], answer: 3, why: 'Un snapshot voit tous les XID sous son xmax, sauf ceux de sa liste des transactions en cours.' }
				]
			},
			{
				title: 'Vérifie A, B et C',
				questions: [
					{ q: 'A (xmin 90, xmax 0) ?', options: ['Visible', 'Invisible : l’insertion ne compte pas', 'Invisible : la suppression compte', 'Visible, mais seulement quand 105 aura committé'], answer: 0, why: '90 est sous 103 et a committé, et personne ne l’a supprimée.' },
					{ q: 'B (xmin 101, xmax 104) ?', options: ['Visible', 'Invisible : l’insertion ne compte pas', 'Invisible : la suppression compte', 'Visible, mais seulement quand 105 aura committé'], answer: 2, why: '101 compte, et 104 a committé avant le snapshot, donc la suppression compte aussi.' },
					{ q: 'C (xmin 104, xmax 105) ?', options: ['Visible', 'Invisible : l’insertion ne compte pas', 'Invisible : la suppression compte', 'Visible, mais seulement quand 105 aura committé'], answer: 0, why: '104 compte, et la suppression par 105 est dans la liste des transactions en cours, donc elle ne compte pas encore.' },
					{ q: 'Admettons que 105 soit un UPDATE qui a changé C en D. 105 commite, puis une nouvelle requête démarre. Quelle version voit-elle ?', options: ['C, comme ta requête', 'D : dans son snapshot, 105 est terminée, donc la suppression de C et l’insertion de D comptent toutes les deux', 'C et D à la fois', 'Aucune, tant que VACUUM n’est pas passé'], answer: 1, why: 'Une nouvelle requête prend un nouveau snapshot où 105 est terminée. Ton snapshot plus ancien liste toujours 105 comme en cours et continue de voir C.' }
				]
			},
			{
				title: 'Vérifie D, E et F',
				questions: [
					{ q: 'D (xmin 105, xmax 0) ?', options: ['Visible', 'Invisible : l’insertion ne compte pas', 'Invisible : la suppression compte', 'Visible, mais seulement après un VACUUM'], answer: 1, why: 'D a été insérée par 105, encore en cours pour ce snapshot.' },
					{ q: 'E (xmin 107, xmax 0), et 107 a committé ?', options: ['Visible, puisque 107 a committé', 'Visible, mais seulement après un VACUUM', 'Invisible : la suppression compte', 'Invisible : l’insertion ne compte pas'], answer: 3, why: '107 est à 106 ou au-dessus, le xmax du snapshot. Committer plus tard ne change pas un snapshot déjà pris.' },
					{ q: 'F (xmin 102, xmax 0) ?', options: ['Invisible : l’insertion ne compte pas', 'Visible', 'Invisible : la suppression compte', 'Visible, mais seulement après un VACUUM'], answer: 0, why: '102 a été annulée, donc sa version ne devient jamais visible pour personne.' },
					{ q: '102 est sous 103, donc terminée. Pourquoi F ne compte-t-elle toujours pas ?', options: ['Parce que F n’est pas encore gelée', 'Parce que 102 est dans la liste des transactions en cours', 'Parce que terminée inclut annulée, et une insertion annulée ne compte jamais', 'Parce que les lignes sous 103 sont toujours cachées'], answer: 2, why: 'Sous xmin veut dire committée ou annulée. Le test de visibilité demande quand même laquelle des deux.' }
				]
			},
			{
				title: 'Regarde-le en vrai',
				questions: [
					{ q: 'Quel niveau garde un seul snapshot pour toute ta transaction dans `psql` ?', options: ['Read Committed', 'L’autocommit', 'Repeatable Read', 'Aucun : les snapshots sont par instruction'], answer: 2, why: '`BEGIN ISOLATION LEVEL REPEATABLE READ` garde le snapshot de la première instruction jusqu’à la fin.' },
					{ q: 'Quelle fonction affiche ton snapshot ?', options: ['`pg_current_snapshot()`', '`pg_current_wal_lsn()`', '`txid_status()`', '`pg_stat_activity`'], answer: 0, why: '`pg_current_snapshot()` l’affiche sous la forme `xmin:xmax:liste en cours`.' },
					{ q: 'L’autre session modifie une ligne et committe. Tu refais le SELECT dans la première. Que vois-tu ?', options: ['La nouvelle version, puisqu’elle a committé', 'Une erreur, puisque la ligne a changé', 'L’ancienne version', 'Les deux versions'], answer: 2, why: 'Ton snapshot a été pris avant ce commit, donc la transaction qui a modifié la ligne reste en cours ou invisible pour toi.' },
					{ q: 'Que montre maintenant la colonne `xmax` de l’ancienne version ?', options: ['0, puisque ton snapshot ne voit pas l’update', 'Ton propre XID', 'Le XID de la transaction suivante', 'Le XID de la transaction qui l’a modifiée'], answer: 3, why: 'Un UPDATE pose son propre XID comme xmax sur l’ancienne version, et c’est rangé sur la ligne pour tout le monde.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Lire `xmin`, `xmax` et un snapshot en vrai, et voir une ancienne version de ligne survivre à l’update qui l’a remplacée.',
		steps: [
			'Lance un PostgreSQL 18 jetable et ouvre `psql` dans deux terminaux : `docker run --rm -d --name pg-lab -e POSTGRES_PASSWORD=lab postgres:18`, attends quelques secondes, puis `docker exec -it pg-lab psql -U postgres` dans chacun.',
			'Dans le terminal 1 : `CREATE TABLE accounts (id int primary key, balance int not null); INSERT INTO accounts VALUES (1, 100), (2, 50);` puis `BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT pg_current_snapshot(), xmin, xmax, * FROM accounts;`',
			'Dans le terminal 2 : `BEGIN; SELECT pg_current_xact_id(); UPDATE accounts SET balance = balance - 10 WHERE id = 1; SELECT xmin, xmax, * FROM accounts; COMMIT;`',
			'Dans le terminal 1, relance le même `SELECT pg_current_snapshot(), xmin, xmax, * FROM accounts;`, puis `COMMIT;` et `SELECT xmin, xmax, * FROM accounts;`',
			'Dans le terminal 2, annule un changement : `BEGIN; UPDATE accounts SET balance = 0 WHERE id = 2; ROLLBACK;` puis `SELECT xmin, xmax, * FROM accounts;`. Arrête tout avec `docker stop pg-lab`.'
		],
		done: [
			'Dans le terminal 2, la ligne 1 affiche `balance` 90 et un `xmin` égal au XID de `pg_current_xact_id()`.',
			'De retour dans le terminal 1, avant le `COMMIT`, la ligne 1 affiche toujours 100, avec maintenant `xmax` égal à ce même XID. Le snapshot n’a pas changé.',
			'Après le rollback, la ligne 2 affiche 50 avec un `xmax` non nul.'
		],
		solution: [
			'L’UPDATE a écrit une nouvelle version (xmin = son XID) et posé son XID comme xmax sur l’ancienne. Les deux versions sont sur disque.',
			'La transaction du terminal 2 a reçu son XID après la prise du snapshot du terminal 1, donc ce XID est au xmax du snapshot ou au-dessus, et son travail est invisible. L’ancienne version reste visible pour le terminal 1 jusqu’à la fin de sa transaction.',
			'Une ligne visible avec un xmax non nul veut dire que la suppression tourne encore, a été annulée, ou n’a fait que verrouiller la ligne. Ici, elle a été annulée.'
		]
	},
	recall: {
		q: 'Un rapport de vingt minutes additionne `orders` pendant que les paiements modifient des lignes. Comment obtient-il un total cohérent sans les faire attendre ?',
		a: 'Chaque version de ligne note xmin (la transaction qui l’a insérée) et xmax (celle qui l’a supprimée). Le snapshot du rapport dit quels XID comptent : il lit les versions committées à son début, pendant que les paiements écrivent de nouvelles versions.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Concurrency Control: Introduction', url: 'https://www.postgresql.org/docs/18/mvcc-intro.html' },
		{ title: 'PostgreSQL docs, System Columns', url: 'https://www.postgresql.org/docs/18/ddl-system-columns.html' },
		{ title: 'PostgreSQL docs, Transaction ID and Snapshot Information Functions', url: 'https://www.postgresql.org/docs/18/functions-info.html#FUNCTIONS-PG-SNAPSHOT' },
		{ title: 'PostgreSQL source, heapam_visibility.c', url: `${VIS}` },
		{ title: 'PostgreSQL source, snapshot.h (SnapshotData definition)', url: `${SNAP}#L33-L46` }
	]
};
