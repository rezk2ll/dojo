const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const DEADLOCK = `${PG}/src/backend/storage/lmgr/deadlock.c`;
const README = `${PG}/src/backend/storage/lmgr/README`;
const MVCC = `${PG}/doc/src/sgml/mvcc.sgml`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'locks',
	part: 'Plusieurs à la fois',
	title: 'Verrous et deadlocks',
	minutes: 10,
	hook: [
		'Un job de remboursement fait passer de l’argent du compte A au compte B. Au même moment, un virement fait passer de l’argent de B vers A. Les deux restent bloqués une seconde, puis l’un échoue avec **`ERROR: deadlock detected`**. Personne n’a écrit de verrou dans le code.',
		'MVCC (jour 18) laisse lecteurs et écrivains se croiser, mais **deux écrivains sur la même ligne passent toujours chacun leur tour**. Chaque UPDATE ou DELETE prend un verrou de ligne, gardé jusqu’à la fin de la transaction. L’écrivain suivant sur cette ligne attend.',
		'Un deadlock arrive quand deux transactions s’attendent l’une l’autre : chacune tient une ligne et veut celle de l’autre. PostgreSQL le repère au bout d’environ une seconde, annule l’une des deux, et l’autre continue. Prendre les verrous de ligne dans un ordre fixe empêche le deadlock.'
	],
	terms: [
		{ term: 'Verrou de ligne', def: 'Pris par UPDATE, DELETE et SELECT FOR UPDATE sur chaque ligne qu’ils touchent. Il bloque les autres écrivains et verrouilleurs de cette ligne, jamais les simples lecteurs. Relâché à la fin de la transaction.' },
		{ term: 'Deadlock', def: 'Deux transactions ou plus tiennent chacune un verrou qu’une autre veut. Aucune ne peut avancer tant qu’on n’en annule pas une.' },
		{ term: 'deadlock_timeout', def: 'Le temps pendant lequel une transaction qui attend dort avant de chercher un deadlock. Une seconde par défaut.' },
		{ term: 'lock_timeout', def: 'Annule une instruction qui attend un verrou plus longtemps que ça. Désactivé (zéro) par défaut, donc une attente peut durer pour toujours.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['t1["Tx 1 : UPDATE compte 11111"] -->|"tient le verrou de ligne"| r1[("ligne 11111")]', 't2["Tx 2 : UPDATE compte 22222"] -->|"tient le verrou de ligne"| r2[("ligne 22222")]'],
				highlight: ['t1', 't2'],
				note: 'L’exemple de la doc : la transaction 1 modifie le compte 11111, et la transaction 2 modifie le compte 22222. Chaque UPDATE prend un verrou sur sa ligne. Il n’y a pas encore de conflit, et les deux réussissent.'
			},
			{
				add: ['t2 -.->|"attend"| r1'],
				highlight: ['r1'],
				note: 'La transaction 2 modifie maintenant 11111 aussi. Cette ligne est verrouillée par la transaction 1, donc la transaction 2 attend son commit ou son rollback. La plupart des attentes finissent dès que l’autre transaction se termine.'
			},
			{
				add: ['t1 -.->|"attend"| r2'],
				highlight: ['r2'],
				note: 'La transaction 1 modifie maintenant 22222, que la transaction 2 tient. La 1 attend la 2, et la 2 attend la 1 : c’est un cycle. La doc : une attente de verrou dure indéfiniment « so long as no deadlock situation is detected » (tant qu’aucun deadlock n’est détecté), et ici aucune des deux ne relâchera son verrou.'
			},
			{
				add: ['det["Recherche de deadlock après deadlock_timeout"] -->|"trouve le cycle, en annule une"| t1'],
				highlight: ['det'],
				note: 'Après avoir attendu `deadlock_timeout` (1 seconde par défaut), la transaction qui attend cherche un cycle dans le graphe de qui attend qui. Elle en trouve un, donc elle annule sa propre demande de verrou et sa transaction échoue avec `deadlock detected`. L’autre obtient le verrou et continue. Laquelle échoue est « difficult to predict and should not be relied upon » (difficile à prévoir, ne compte pas dessus).'
			},
			{
				add: ['order["Solution : chaque transaction verrouille 11111, puis 22222"] -.-> r1'],
				highlight: ['order'],
				note: 'Si les deux transactions avaient modifié les lignes dans le même ordre, la deuxième aurait attendu sur la première ligne, et aucun cycle n’aurait pu se former. La doc appelle ça « the best defense against deadlocks » (la meilleure défense contre les deadlocks).'
			}
		]
	},
	example: {
		title: 'src/backend/storage/lmgr/deadlock.c : trouver le cycle, réordonner la file ou annuler',
		repo: 'postgres/postgres',
		url: `${DEADLOCK}#L207-L1138`,
		lang: 'c',
		code: ` * This code looks for deadlocks involving the given process.  If any
 * are found, it tries to rearrange lock wait queues to resolve the
 * deadlock.  If resolution is impossible, return DS_HARD_DEADLOCK ---
 * the caller is then expected to abort the given proc's transaction.
…
DeadLockState
DeadLockCheck(PGPROC *proc)
{
…
	/* Search for deadlocks and possible fixes */
	if (DeadLockCheckRecurse(proc))
	{
		/*
		 * Call FindLockCycle one more time, to record the correct
		 * deadlockDetails[] for the basic state with no rearrangements.
		 */
		int			nSoftEdges;

		TRACE_POSTGRESQL_DEADLOCK_FOUND();

		nWaitOrders = 0;
		if (!FindLockCycle(proc, possibleConstraints, &nSoftEdges))
			elog(FATAL, "deadlock seems to have disappeared");

		return DS_HARD_DEADLOCK;	/* cannot find a non-deadlocked state */
	}
…
	/* Return code tells caller if we had to escape a deadlock or not */
	if (nWaitOrders > 0)
		return DS_SOFT_DEADLOCK;
	else if (blocking_autovacuum_proc != NULL)
		return DS_BLOCKED_BY_AUTOVACUUM;
	else
		return DS_NO_DEADLOCK;
}
…
	ereport(ERROR,
			(errcode(ERRCODE_T_R_DEADLOCK_DETECTED),
			 errmsg("deadlock detected"),
			 errdetail_internal("%s", clientbuf.data),
			 errdetail_log("%s", logbuf.data),
			 errhint("See server log for query details.")));`,
		notes: [
			'Un processus qui n’obtient pas un verrou s’endort sans aucune vérification et lance un minuteur, ce que le README appelle l’[« optimistic waiting »](' + README + '#L346-L360) (attente optimiste). `DeadLockCheck` (lignes 6 à 35) ne tourne que si le minuteur expire. La plupart des attentes finissent avant, donc elles ne paient jamais la vérification. La doc de configuration donne la valeur par défaut, une seconde, et conseille qu’elle « should exceed your typical transaction time » (dépasse la durée typique de tes transactions).',
			'Le [README](' + README + '#L393-L410) trace, dans le graphe des attentes (WFG), une arête de A vers B « if A waits for B » (si A attend B), et « There is a deadlock condition if and only if the WFG contains a cycle. » (il y a deadlock si et seulement si ce graphe contient un cycle). Pour le casser, PostgreSQL annule la demande de verrou du processus qui a fait la vérification : « it’s sufficient to cancel one request to remove the cycle » (annuler une seule demande suffit).',
			'Si A attend seulement parce qu’il est dans la file derrière B, le README parle d’une [arête « soft »](' + README + '#L428-L442), et réordonner la file d’attente peut supprimer le cycle. Dans des lignes sautées ici, le code reconstruit les files, et la ligne 30 renvoie `DS_SOFT_DEADLOCK` : aucune transaction n’est annulée. Ce n’est que si aucun ordre ne marche que la ligne 25 renvoie `DS_HARD_DEADLOCK`, et l’appelant annule la transaction.',
			'Les lignes 37 à 42 lèvent l’erreur, et `DeadLockReport` écrit une ligne par processus : « Process %d waits for %s on %s; blocked by process %d. » Le code d’erreur est `40P01`, celui que Synapse relance (jour 19). La [doc](' + MVCC + '#L1491-L1501) dit que relancer est la solution de repli quand tu ne peux pas garantir un ordre de verrouillage constant.'
		]
	},
	tradeoff: {
		gain: [
			'Les verrous de ligne sont automatiques : deux UPDATE sur la même ligne ne s’entremêlent jamais, et le deuxième travaille sur le résultat committé du premier.',
			'Les simples SELECT ne prennent jamais de verrou de ligne, donc les verrous ne ralentissent que les écrivains sur les mêmes lignes.',
			'PostgreSQL trouve un cycle de deadlock après `deadlock_timeout` et annule une transaction, pour que les autres puissent finir.'
		],
		cost: [
			'Chaque verrou est gardé jusqu’à la fin de la transaction, donc une transaction lente, ou qui attend une saisie de l’utilisateur, fait attendre tous les autres écrivains de ces lignes.',
			'Avec `lock_timeout` à zéro (le défaut), une attente n’a pas de limite, et une transaction coincée peut accumuler une file de demandes derrière elle.',
			'La détection de deadlock coûte un `deadlock_timeout` d’attente, puis une transaction annulée qu’il faut relancer.',
			'Avec SELECT FOR UPDATE, tous ceux qui verrouillent les mêmes lignes passent un par un.'
		]
	},
	task: {
		prompt: 'Ouvre deux sessions `psql` sur la table `accounts` de la doc. Reproduis le deadlock : la session 1 modifie 11111, la session 2 modifie 22222 puis 11111, la session 1 modifie 22222. Écris ce que chaque session affiche. Réécris ensuite le virement pour que les deux ne puissent jamais se bloquer, et dis quoi régler pour qu’un verrou coincé échoue vite au lieu d’attendre.',
		hint: 'L’ordre des deux UPDATE dans un virement dépend du sens de l’argent. Choisis un ordre qui n’en dépend pas.',
		answer: [
			'La session 2 bloque sur son deuxième UPDATE. La session 1 bloque sur 22222. Après environ une seconde, l’une des deux affiche `ERROR: deadlock detected` avec des lignes « Process N waits for ShareLock on transaction M; blocked by process P. ». L’autre UPDATE se termine alors.',
			'La transaction de la session qui a échoué est annulée : lance `ROLLBACK`, puis relance-la depuis le début.',
			'Solution : verrouille les deux lignes dans un ordre fixe, par exemple le plus petit numéro de compte d’abord, quel que soit le sens : `UPDATE accounts ... WHERE acctnum = 11111;` puis `... WHERE acctnum = 22222;`. Le deuxième virement attend alors sur la première ligne au lieu de prendre l’autre.',
			'Échouer vite : `SET lock_timeout = \'2s\';` dans la transaction. Une instruction qui attend un verrou plus de 2 secondes est annulée, ce qui vaut mieux qu’une requête qui pend. Utilise `SELECT ... FOR UPDATE NOWAIT` pour échouer tout de suite.',
			'Pour voir qui bloque qui pendant l’attente : `SELECT pid, pg_blocking_pids(pid), query FROM pg_stat_activity WHERE wait_event_type = \'Lock\';`'
		]
	},
	quiz: [
		{
			q: 'La transaction A a lancé `UPDATE orders SET status = \'paid\' WHERE id = 7` sans committer. La transaction B lance `SELECT * FROM orders WHERE id = 7`. Qu’arrive-t-il à B ?',
			options: [
				'Elle attend le commit ou le rollback de A, puis lit le nouveau statut',
				'Elle répond tout de suite avec l’ancien statut, car lire ne prend aucun verrou',
				'Elle échoue avec une erreur de sérialisation car la ligne est en train de changer',
				'Elle répond tout de suite avec le nouveau statut, car A tient le verrou de ligne'
			],
			answer: 1,
			why: 'Les verrous de ligne « block only writers and lockers to the same row » (ne bloquent que les écrivains et verrouilleurs de la même ligne). Un simple SELECT lit la version que son snapshot autorise (jour 18), c’est-à-dire l’ancienne tant que A n’a pas committé.'
		},
		{
			q: 'Deux transactions tombent en deadlock sur deux lignes. Que fait PostgreSQL ?',
			options: [
				'Il annule les deux, pour qu’aucune ne laisse la moitié de ses changements',
				'Il attend `lock_timeout`, puis annule la transaction la plus récente',
				'Après `deadlock_timeout`, il en annule une, et l’autre continue',
				'Il laisse les deux continuer, car les verrous de ligne ne se bloquent pas'
			],
			answer: 2,
			why: 'Une transaction qui attend cherche un cycle après `deadlock_timeout`. Quand elle en trouve un, annuler une seule demande de verrou suffit à le casser. Laquelle échoue est difficile à prévoir, donc le code doit être prêt à relancer l’une ou l’autre.'
		},
		{
			q: 'Les virements entre deux comptes tombent parfois en deadlock. Quelle est la solution la plus fiable ?',
			options: [
				'Augmenter `deadlock_timeout`, pour que la vérification tourne moins souvent',
				'Verrouiller les deux lignes dans le même ordre dans chaque transaction',
				'Lancer les virements en Serializable pour que la base les ordonne',
				'Lire les deux lignes avec un simple SELECT avant de les modifier'
			],
			answer: 1,
			why: 'Un deadlock demande un cycle, et un cycle demande deux transactions qui prennent les verrous dans des ordres opposés. Avec un seul ordre global, la deuxième transaction attend au premier verrou et aucun cycle ne peut se former.'
		}
	],
	recall: {
		q: 'Un virement de A vers B et un autre de B vers A échouent parfois avec `deadlock detected`. Pourquoi, et quel changement l’empêche ?',
		a: 'Chaque virement verrouille la ligne d’un compte et attend celle que l’autre tient. Verrouille les deux lignes dans un ordre fixe, par exemple le plus petit numéro de compte d’abord, et le deuxième virement attend sur la première ligne.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Explicit Locking', url: 'https://www.postgresql.org/docs/18/explicit-locking.html' },
		{ title: 'PostgreSQL docs, Lock Management settings', url: 'https://www.postgresql.org/docs/18/runtime-config-locks.html' },
		{ title: 'PostgreSQL source, src/backend/storage/lmgr/README', url: `${README}` },
		{ title: 'PostgreSQL source, deadlock.c', url: `${DEADLOCK}` }
	]
};
