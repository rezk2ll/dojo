const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const TX = `${DJANGO}/django/db/transaction.py`;
const DOCS = `${DJANGO}/docs/topics/db/transactions.txt`;
const TCOP = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339/src/backend/tcop/postgres.c';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'transactions',
	part: 'Plusieurs à la fois',
	title: 'Tout ou rien',
	minutes: 10,
	hook: [
		'Une vue de paiement enregistre la commande, puis baisse le stock. La deuxième requête échoue sur une contrainte. Le client voit une page d’erreur, et **la commande est quand même en base**, sans aucun stock retiré.',
		'C’est l’autocommit. La doc de Django le dit clairement : « Each query is immediately committed to the database, unless a transaction is active. » (chaque requête est committée tout de suite, sauf si une transaction est ouverte). **Deux requêtes, ce sont deux commits séparés**, et la première n’attend pas de voir comment se passe la seconde.',
		'Une transaction fait de plusieurs étapes une seule : **elles ont toutes lieu, ou aucune**. Personne d’autre ne voit les étapes intermédiaires. Ce chapitre montre comment en ouvrir une, comment en annuler une partie avec un savepoint, et ce que fait ton ORM quand tu écris `atomic` ou `transaction`.'
	],
	terms: [
		{ term: 'Transaction', def: 'Un groupe d’instructions que la base traite comme une seule unité. Elle finit par COMMIT (tout garder) ou ROLLBACK (ne rien garder).' },
		{ term: 'Atomicité', def: 'Vu des autres transactions, le groupe a lieu entièrement ou pas du tout. Un crash à mi-chemin ne laisse aucune trace de la première moitié.' },
		{ term: 'Autocommit', def: 'Sans BEGIN, PostgreSQL enveloppe chaque instruction dans sa propre transaction et la committe si elle réussit. Django tourne dans ce mode par défaut.' },
		{ term: 'Savepoint', def: 'Un repère dans une transaction. ROLLBACK TO annule ce qui vient après et garde ce qui vient avant, sans terminer la transaction.' },
		{ term: 'Transaction en échec', def: 'Après une erreur dans une transaction, PostgreSQL refuse toutes les instructions suivantes jusqu’à un ROLLBACK, ou un ROLLBACK TO vers un savepoint.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['begin["BEGIN"] --> debit["UPDATE accounts : Alice moins 100"]', 'debit --> credit["UPDATE accounts : Bob plus 100"]'],
				highlight: ['begin', 'debit', 'credit'],
				note: '**Le virement.** Le tutoriel de PostgreSQL prend cet exemple : l’argent quitte le compte d’Alice et arrive sur celui de Bob. Deux UPDATE séparés. Entre les deux, la base est dans un état que personne ne devrait voir : l’argent est parti et pas encore arrivé.'
			},
			{
				add: ['credit --> commit["COMMIT : les deux changements visibles d’un coup"]'],
				highlight: ['commit'],
				note: '**Commit.** Jusqu’au COMMIT, les autres sessions ne voient aucune des deux mises à jour. Après, elles voient les deux au même instant. Le tutoriel : les mises à jour « are invisible to other transactions until the transaction completes, whereupon all the updates become visible simultaneously » (restent invisibles jusqu’à la fin de la transaction, puis deviennent toutes visibles en même temps).'
			},
			{
				add: ['credit -.->|"erreur ou crash"| rollback["ROLLBACK : aucun changement n’a eu lieu"]'],
				highlight: ['rollback'],
				note: '**Rollback.** Si quelque chose échoue avant le COMMIT, ou si tu décides d’arrêter, ROLLBACK annule tous les changements faits jusque-là. Un crash fait pareil : au redémarrage (jour 15), une transaction non committée n’a aucun effet.'
			},
			{
				add: ['debit --> sp["SAVEPOINT avant une étape risquée"]', 'sp -.->|"ROLLBACK TO"| debit'],
				highlight: ['sp'],
				note: '**En annuler une partie.** Un savepoint marque un point dans la transaction. ROLLBACK TO jette ce qui vient après et garde ce qui vient avant. C’est aussi le seul moyen de récupérer une transaction qu’une erreur a mise en échec, à part tout annuler.'
			},
			{
				add: ['auto["Autocommit : aucun BEGIN envoyé"] -->|"chaque instruction committe seule"| commit'],
				highlight: ['auto'],
				note: '**Ce que fait ton ORM par défaut.** Sans BEGIN, chaque instruction est sa propre transaction. C’est sans danger pour une requête, et faux pour deux qui vont ensemble. La solution : ouvrir la transaction toi-même, avec `transaction.atomic()` en Django.'
			}
		]
	},
	example: {
		title: 'django/db/transaction.py : atomic ouvre une transaction à l’extérieur, un savepoint à l’intérieur',
		repo: 'django/django',
		url: `${TX}#L165-L309`,
		lang: 'python',
		code: `    When it's used as a context manager, __enter__ creates a transaction or a
    savepoint, depending on whether a transaction is already in progress, and
    __exit__ commits the transaction or releases the savepoint on normal exit,
    and rolls back the transaction or to the savepoint on exceptions.
…
        if connection.in_atomic_block:
            # We're already in a transaction; create a savepoint, unless we
            # were told not to or we're already waiting for a rollback. The
            # second condition avoids creating useless savepoints and prevents
            # overwriting needs_rollback until the rollback is performed.
            if self.savepoint and not connection.needs_rollback:
                sid = connection.savepoint()
                connection.savepoint_ids.append(sid)
            else:
                connection.savepoint_ids.append(None)
        else:
            connection.set_autocommit(
                False, force_begin_transaction_with_broken_autocommit=True
            )
            connection.in_atomic_block = True
…
            else:
                # This flag will be set to True again if there isn't a
                # savepoint allowing to perform the rollback at this level.
                connection.needs_rollback = False
                if connection.in_atomic_block:
                    # Roll back to savepoint if there is one, mark for rollback
                    # otherwise.
                    if sid is None:
                        connection.needs_rollback = True
                    else:
                        try:
                            connection.savepoint_rollback(sid)
…
                else:
                    # Roll back transaction
                    try:
                        connection.rollback()`,
		notes: [
			'**Bloc le plus externe : BEGIN.** Quand aucune transaction n’est ouverte, `set_autocommit(False)` coupe l’autocommit, donc la requête suivante tourne dans une transaction. Quand un bloc est déjà ouvert, `connection.savepoint()` envoie un SAVEPOINT à la place et empile son identifiant. La [doc liste les quatre cas](' + DOCS + '#L228-L233) : ouvrir, créer un savepoint, le relâcher ou y revenir, committer ou annuler.',
			'**Exception à l’intérieur : annuler juste ce bloc.** En sortant sur une erreur, un bloc interne avec savepoint revient à ce savepoint, puis le relâche. Sans savepoint (`atomic(savepoint=False)`), il met [`needs_rollback`](' + TX + '#L286-L294) et toute la transaction est annulée à la sortie du bloc le plus externe.',
			'**N’avale pas l’erreur à l’intérieur.** La doc prévient : [« Avoid catching exceptions inside atomic! »](' + DOCS + '#L165-L180) (n’attrape pas d’exception dans atomic). Après une erreur de base, « the transaction is broken » (la transaction est cassée). PostgreSQL est d’accord : chaque instruction suivante échoue avec [« current transaction is aborted, commands ignored until end of transaction block »](' + TCOP + '#L1136-L1140). Attrape l’erreur autour d’un bloc `atomic` interne, qui revient d’abord à son savepoint.',
			'**Le rollback annule des lignes, pas ton code.** « The values of a model’s fields won’t be reverted when a transaction rollback happens » (les champs du modèle ne reviennent pas en arrière, [doc](' + DOCS + '#L192-L194)). Pour un email, une écriture en cache ou un job, utilise `on_commit` : les callbacks tournent après un commit réussi, et en cas de rollback ils sont [« discarded, and never called »](' + DOCS + '#L327-L330) (jetés, jamais appelés).'
		]
	},
	tradeoff: {
		gain: [
			'Pas de travail à moitié fait : une commande et son changement de stock sont committés ensemble ou pas du tout, même si le serveur plante entre les deux.',
			'Les autres ne voient jamais l’état intermédiaire, donc un rapport qui additionne les soldes n’attrape pas d’argent en transit.',
			'Les savepoints laissent une partie échouer et être retentée (une clé en double, par exemple) sans jeter le reste.'
		],
		cost: [
			'Une transaction ouverte garde les verrous de ligne qu’elle a pris et peut garder en vie de vieilles versions de lignes. Fais-la courte, sinon VACUUM prend du retard (jour 16).',
			'Envelopper chaque requête HTTP dans une transaction (le `ATOMIC_REQUESTS` de Django) est simple, mais la doc prévient que ça « makes it inefficient when traffic increases » (devient inefficace quand le trafic monte).',
			'Une transaction ne couvre que la base. Un email envoyé ou une API appelée dedans n’est pas annulé par ROLLBACK.',
			'Chaque bloc imbriqué ajoute des requêtes : un SAVEPOINT en entrant, un RELEASE en sortant. C’est pour ça que `atomic(savepoint=False)` existe, au prix d’une gestion d’erreur plus grossière.'
		]
	},
	task: {
		prompt: 'Dans `psql`, crée `accounts(name text primary key, balance numeric check (balance >= 0))` avec Alice à 50 et Bob à 0. Vire 100 d’Alice vers Bob dans une transaction, en créditant Bob d’abord. Que se passe-t-il à chaque étape, et quels sont les soldes à la fin ? Écris ensuite la version Django qui ne peut pas laisser Bob crédité tout seul.',
		hint: 'La contrainte CHECK échoue sur l’UPDATE d’Alice. Pense à ce que PostgreSQL accepte après une erreur dans un bloc de transaction.',
		answer: [
			'`BEGIN;` puis `UPDATE accounts SET balance = balance + 100 WHERE name = \'Bob\';` réussit. Bob affiche 100, mais seulement dans cette session.',
			'`UPDATE accounts SET balance = balance - 100 WHERE name = \'Alice\';` échoue : la contrainte CHECK refuse -50. La transaction est maintenant en échec.',
			'Toute instruction suivante, même un `SELECT`, échoue avec « current transaction is aborted ». `COMMIT;` répond `ROLLBACK`. Alice a toujours 50, Bob toujours 0.',
			'Sans `BEGIN`, l’autocommit aurait committé le crédit de Bob tout seul, et le débit raté aurait laissé 100 sortis de nulle part.',
			'En Django : `with transaction.atomic():` autour des deux appels à `update()`. L’IntegrityError sort du bloc, Django annule, et tu attrapes l’erreur en dehors du bloc pour afficher un message.'
		]
	},
	quiz: [
		{
			q: 'Une vue Django appelle `order.save()` puis `stock.save()`, sans `atomic` et avec les réglages par défaut. Le deuxième save lève une erreur. Qu’y a-t-il en base ?',
			options: [
				'La commande, car chaque requête a été committée seule en mode autocommit',
				'Rien, car Django enveloppe chaque vue dans une transaction sauf avis contraire',
				'Rien, car l’erreur annule toutes les requêtes de la même connexion',
				'La commande et le stock, car l’erreur est levée après la requête'
			],
			answer: 0,
			why: 'Django tourne en autocommit par défaut : chaque requête est committée dès qu’elle s’exécute. Les transactions par requête HTTP n’existent que si tu actives `ATOMIC_REQUESTS`. Pour lier les deux saves, enveloppe-les dans `transaction.atomic()`.'
		},
		{
			q: 'Dans une transaction, un INSERT échoue sur une contrainte unique. Ton code attrape l’erreur et lance un SELECT. Que fait PostgreSQL ?',
			options: [
				'Il lance le SELECT, puisque seul l’INSERT raté a été annulé',
				'Il refuse le SELECT tant que tu n’as pas annulé la transaction',
				'Il committe ce qui précède l’INSERT, puis lance le SELECT',
				'Il retente l’INSERT une fois, puis lance le SELECT ensuite'
			],
			answer: 1,
			why: 'Une erreur met toute la transaction en échec : chaque instruction échoue avec « current transaction is aborted » jusqu’au ROLLBACK. Un ROLLBACK TO vers un savepoint pris avant l’INSERT permet de continuer, et c’est ce qu’un bloc `atomic` imbriqué fait pour toi.'
		},
		{
			q: 'Dans `transaction.atomic()`, tu envoies un email de confirmation, puis la transaction est annulée. Comment le code aurait-il dû être écrit ?',
			options: [
				'Envoyer l’email dans un bloc atomic imbriqué, que son savepoint peut annuler',
				'Envoyer l’email d’abord, avant le bloc, pour qu’il soit hors transaction',
				'Enregistrer l’email avec `on_commit`, pour qu’il parte seulement après un commit',
				'L’envoyer dans le bloc, puis envoyer un email d’excuse après un rollback'
			],
			answer: 2,
			why: 'ROLLBACK n’annule que les changements en base. Les callbacks `on_commit` tournent après un commit réussi et sont jetés en cas de rollback, donc l’email ne part que si la commande existe vraiment.'
		}
	],
	takeaway: 'Quand deux écritures vont ensemble, mets-les toi-même dans une transaction. Attrape les erreurs en dehors du bloc, et fais les effets de bord après le commit.',
	sources: [
		{ title: 'PostgreSQL docs, Tutorial: Transactions', url: 'https://www.postgresql.org/docs/18/tutorial-transactions.html' },
		{ title: 'PostgreSQL docs, SAVEPOINT', url: 'https://www.postgresql.org/docs/18/sql-savepoint.html' },
		{ title: 'Django docs, Database transactions', url: 'https://docs.djangoproject.com/en/stable/topics/db/transactions/' }
	]
};
