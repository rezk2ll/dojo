const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const TX = `${DJANGO}/django/db/transaction.py`;
const DOCS = `${DJANGO}/docs/topics/db/transactions.txt`;
const TCOP = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339/src/backend/tcop/postgres.c';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'transactions',
	part: 'Plusieurs à la fois',
	title: 'Transactions et savepoints',
	minutes: 10,
	hook: [
		'Une vue de paiement enregistre la commande, puis baisse le stock. La deuxième requête échoue sur une contrainte. Le client voit une page d’erreur, et **la commande est quand même en base**, sans aucun stock retiré.',
		'Par défaut, Django tourne en autocommit. Sa doc : « Each query is immediately committed to the database, unless a transaction is active. » (chaque requête est committée tout de suite, sauf si une transaction est ouverte). Les deux requêtes font donc **deux commits séparés**, et la base garde la première quoi qu’il arrive à la seconde.',
		'Une transaction regroupe plusieurs instructions : soit elles sont toutes committées, soit aucune. Les autres sessions ne voient aucun des changements avant le COMMIT. En Django, `transaction.atomic()` en ouvre une, et un bloc `atomic` imbriqué y pose un savepoint.'
	],
	terms: [
		{ term: 'Transaction', def: 'Un groupe d’instructions que la base traite comme une seule unité. Elle finit par COMMIT (tout garder) ou ROLLBACK (ne rien garder).' },
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
				note: 'Le tutoriel de PostgreSQL prend cet exemple : l’argent quitte le compte d’Alice et arrive sur celui de Bob, en deux UPDATE séparés. Entre les deux, l’argent a quitté Alice sans être arrivé chez Bob. Aucune autre session ne devrait voir cet état.'
			},
			{
				add: ['credit --> commit["COMMIT : les deux changements visibles d’un coup"]'],
				highlight: ['commit'],
				note: 'Jusqu’au COMMIT, les autres sessions ne voient aucune des deux mises à jour. Après, elles voient les deux au même instant. Le tutoriel : les mises à jour « are invisible to other transactions until the transaction completes, whereupon all the updates become visible simultaneously » (restent invisibles jusqu’à la fin de la transaction, puis apparaissent toutes en même temps).'
			},
			{
				add: ['credit -.->|"erreur ou crash"| rollback["ROLLBACK : aucun changement n’a eu lieu"]'],
				highlight: ['rollback'],
				note: 'Si quelque chose échoue avant le COMMIT, ou si tu décides d’arrêter, ROLLBACK annule tous les changements faits jusque-là. Après un crash et un redémarrage (jour 15), une transaction non committée n’a pas d’effet non plus.'
			},
			{
				add: ['debit --> sp["SAVEPOINT avant une étape risquée"]', 'sp -.->|"ROLLBACK TO"| debit'],
				highlight: ['sp'],
				note: 'Un savepoint marque un point dans la transaction. ROLLBACK TO jette ce qui vient après et garde ce qui vient avant. À part tout annuler, c’est le seul moyen de continuer une transaction qu’une erreur a mise en échec.'
			},
			{
				add: ['auto["Autocommit : aucun BEGIN envoyé"] -->|"chaque instruction committe seule"| commit'],
				highlight: ['auto'],
				note: 'Sans BEGIN, chaque instruction est sa propre transaction. Pour deux requêtes qui vont ensemble, la première peut être committée alors que la seconde échoue. Ouvre la transaction toi-même : `transaction.atomic()` en Django.'
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
			'Les lignes 16 à 20 tournent quand aucune transaction n’est ouverte : `set_autocommit(False)` coupe l’autocommit, donc la requête suivante tourne dans une transaction. Les lignes 11 à 13 tournent quand un bloc est déjà ouvert : `connection.savepoint()` envoie un SAVEPOINT et empile son identifiant. La [doc liste les quatre cas](' + DOCS + '#L228-L233) : ouvrir, créer un savepoint, le relâcher ou y revenir, committer ou annuler.',
			'Les lignes 26 à 33 traitent une erreur dans un bloc interne : avec un savepoint, la ligne 33 revient à ce savepoint, puis le relâche. Sans savepoint (`atomic(savepoint=False)`), la ligne 30 met `needs_rollback`, et toute la transaction est annulée à la sortie du bloc le plus externe (ligne 38).',
			'La doc prévient : [« Avoid catching exceptions inside atomic! »](' + DOCS + '#L165-L180) (n’attrape pas d’exception dans atomic). Après une erreur de base, « the transaction is broken » (la transaction est cassée). PostgreSQL fait alors échouer chaque instruction suivante avec « current transaction is aborted, commands ignored until end of transaction block ». Attrape l’erreur autour d’un bloc `atomic` interne, qui revient d’abord à son savepoint.',
			'Un rollback annule les lignes en base et laisse tes objets Python tels quels : « The values of a model’s fields won’t be reverted when a transaction rollback happens » (les champs du modèle ne reviennent pas en arrière, [doc](' + DOCS + '#L192-L194)). Pour un email, une écriture en cache ou un job, utilise `on_commit`. Ses callbacks tournent après un commit réussi, et en cas de rollback ils sont « discarded, and never called » (jetés, jamais appelés).'
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
			'Envelopper chaque requête HTTP dans une transaction (le `ATOMIC_REQUESTS` de Django) est simple, mais la doc prévient que ça « makes it inefficient when traffic increases » (rend le tout inefficace quand le trafic monte).',
			'ROLLBACK n’annule pas un email envoyé ou une API appelée pendant la transaction.',
			'Chaque bloc imbriqué ajoute deux requêtes : un SAVEPOINT en entrant, un RELEASE en sortant. `atomic(savepoint=False)` les évite, mais une erreur dans ce bloc annule alors toute la transaction.'
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
		],
		steps: [
			{
				title: 'Crédite Bob d’abord',
				questions: [
					{ q: 'Quelle instruction ouvre la transaction dans `psql` ?', options: ['`BEGIN;`', '`SAVEPOINT start;`', '`SET autocommit = off;` sur le serveur', 'Rien : psql en ouvre une pour toi'], answer: 0, why: 'Sans `BEGIN`, PostgreSQL exécute chaque instruction dans sa propre transaction et la committe.' },
					{ q: 'Tu lances `UPDATE accounts SET balance = balance + 100 WHERE name = \'Bob\';`. Que se passe-t-il ?', options: ['Ça échoue, parce qu’Alice n’a pas encore été débitée', 'Ça réussit, et Bob affiche 100 dans cette session seulement', 'Ça réussit, et toutes les sessions voient Bob à 100', 'Ça attend que le débit passe'], answer: 1, why: 'L’update est valide à lui seul. Les autres sessions n’en voient rien avant le COMMIT.' },
					{ q: 'Un deuxième `psql` lit le solde de Bob maintenant. Que voit-il ?', options: ['100', '50', 'Une erreur, puisque la ligne est verrouillée', '0'], answer: 3, why: 'Les changements d’une transaction restent invisibles aux autres jusqu’à sa fin, donc la deuxième session lit toujours le 0 committé.' },
					{ q: 'Sans `BEGIN`, qu’aurait fait ce même UPDATE ?', options: ['Il aurait attendu l’instruction suivante', 'Il aurait échoué, puisque l’autocommit demande deux instructions', 'Il aurait été committé tout de suite, tout seul', 'Il aurait ouvert un savepoint'], answer: 2, why: 'En autocommit, chaque instruction est sa propre transaction, committée si elle réussit.' }
				]
			},
			{
				title: 'Débite Alice',
				questions: [
					{ q: 'Tu lances `UPDATE accounts SET balance = balance - 100 WHERE name = \'Alice\';`. Que se passe-t-il ?', options: ['Ça réussit et Alice passe à -50', 'Ça réussit et Alice passe à 0', 'Ça échoue : la contrainte CHECK refuse -50', 'Ça attend que l’update de Bob soit committé'], answer: 2, why: '`check (balance >= 0)` refuse la nouvelle valeur, donc l’instruction lève une erreur.' },
					{ q: 'Dans quel état est la transaction maintenant ?', options: ['En échec', 'Committée jusqu’à l’update de Bob', 'Normale, moins l’instruction ratée', 'Revenue au dernier savepoint'], answer: 0, why: 'Après une erreur dans une transaction, PostgreSQL refuse toutes les instructions suivantes jusqu’au rollback.' },
					{ q: 'Tu tapes `SELECT * FROM accounts;`. Que répond PostgreSQL ?', options: ['Alice 50, Bob 100', 'Alice 50, Bob 0', 'Il attend un COMMIT', 'Une erreur : « current transaction is aborted »'], answer: 3, why: 'Même un SELECT échoue avec « current transaction is aborted, commands ignored until end of transaction block ».' },
					{ q: 'Qu’est-ce qui aurait permis à la transaction de continuer après l’erreur ?', options: ['Lancer le SELECT deux fois', 'Un `ROLLBACK TO` vers un savepoint pris avant le débit', 'Un `COMMIT`, puis le débit de nouveau', 'Monter la limite du CHECK dans la transaction'], answer: 1, why: 'À part tout annuler, un savepoint est le seul moyen de continuer une transaction en échec.' }
				]
			},
			{
				title: 'Termine et lis les soldes',
				questions: [
					{ q: 'Tu tapes `COMMIT;`. Qu’affiche `psql` ?', options: ['`COMMIT`', '`ROLLBACK`', 'Une erreur, et la transaction reste ouverte', '`COMMIT 1`'], answer: 1, why: 'Une transaction en échec ne peut pas être committée. PostgreSQL la termine par un rollback et le dit.' },
					{ q: 'Quels sont les soldes à la fin ?', options: ['Alice 50, Bob 0', 'Alice 50, Bob 100', 'Alice -50, Bob 100', 'Alice 0, Bob 50'], answer: 0, why: 'Le rollback a annulé le crédit de Bob. Rien n’a changé.' },
					{ q: 'Les deux mêmes UPDATE sans `BEGIN`. Quel est l’état final ?', options: ['Alice 50, Bob 0', 'Alice -50, Bob 100', 'Alice 50, Bob 100 : 100 sortis de nulle part', 'Les deux instructions échouent'], answer: 2, why: 'L’autocommit committe le crédit de Bob tout seul, puis le débit échoue seul.' },
					{ q: 'Le serveur plante après le crédit de Bob, avant le `COMMIT`. Qu’y a-t-il dans la base après le redémarrage ?', options: ['Bob à 100, puisque l’update a été journalisé', 'Alice à -50', 'La transaction, qui attend un COMMIT', 'Alice 50, Bob 0 : la transaction non committée n’a aucun effet'], answer: 3, why: 'Après un crash et un redémarrage, une transaction non committée n’a aucun effet.' }
				]
			},
			{
				title: 'Écris la version Django',
				questions: [
					{ q: 'Comment lies-tu les deux updates en Django ?', options: ['`with transaction.atomic():` autour des deux appels à `update()`', 'Appeler `update()` deux fois de suite, Django les regroupe', 'Mettre `autocommit = True` sur la connexion', 'Mettre chaque `update()` dans son propre bloc `atomic()`'], answer: 0, why: '`atomic` ouvre une transaction, donc les deux updates sont committés ensemble ou pas du tout.' },
					{ q: 'Où attrapes-tu l’`IntegrityError` ?', options: ['Dans le bloc, juste après le débit', 'Dans la méthode `save()` du modèle', 'En dehors du bloc `atomic`', 'Nulle part : Django la cache'], answer: 2, why: 'L’erreur sort du bloc, Django annule, et tu affiches un message à l’extérieur.' },
					{ q: 'Pourquoi ne pas l’attraper dans le bloc ?', options: ['Django ne lève pas d’erreur dans `atomic`', 'Après une erreur de base, la transaction est cassée, et les requêtes suivantes échouent', 'L’erreur serait attrapée deux fois', 'Python n’autorise pas `try` dans un `with`'], answer: 1, why: 'La doc : « Avoid catching exceptions inside atomic! » PostgreSQL fait ensuite échouer chaque instruction.' },
					{ q: 'Tu veux aussi envoyer un email à Bob pour le virement. Comment ?', options: ['L’envoyer dans le bloc, avant le débit', 'L’envoyer dans un bloc `atomic` imbriqué', 'L’envoyer avant le début du bloc', 'L’enregistrer avec `on_commit`'], answer: 3, why: 'Les callbacks `on_commit` tournent après un commit réussi et sont jetés en cas de rollback.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Tomber sur une transaction en échec, puis utiliser un savepoint pour sauter un insert raté et garder le reste.',
		steps: [
			'Lance un PostgreSQL 18 jetable et ouvre `psql` dans deux terminaux : `docker run --rm -d --name pg-lab -e POSTGRES_PASSWORD=lab postgres:18`, attends quelques secondes, puis `docker exec -it pg-lab psql -U postgres` dans chacun.',
			'Dans le terminal 1 : `CREATE TABLE tags (name text primary key); INSERT INTO tags VALUES (\'sql\');`',
			'Sans savepoint : `BEGIN; INSERT INTO tags VALUES (\'db\');`. Dans le terminal 2, lance `SELECT name FROM tags;`. De retour dans le terminal 1 : `INSERT INTO tags VALUES (\'sql\'); SELECT count(*) FROM tags; COMMIT;` puis `SELECT name FROM tags ORDER BY name;`',
			'Avec un savepoint : `BEGIN; INSERT INTO tags VALUES (\'db\'); SAVEPOINT before_dup; INSERT INTO tags VALUES (\'sql\');` puis `ROLLBACK TO SAVEPOINT before_dup; INSERT INTO tags VALUES (\'wal\'); COMMIT;` et `SELECT name FROM tags ORDER BY name;`. Arrête tout avec `docker stop pg-lab`.'
		],
		done: [
			'Le terminal 2 ne voit que `sql` pendant que le terminal 1 a `db` non committé.',
			'Sans savepoint, le doublon échoue, le `SELECT` échoue avec `current transaction is aborted`, `COMMIT` affiche `ROLLBACK`, et la table ne contient toujours que `sql`.',
			'Avec le savepoint, `COMMIT` affiche `COMMIT` et la table contient `db`, `sql` et `wal`.'
		],
		solution: [
			'Une seule erreur met toute la transaction en échec : même le bon insert de `db` est perdu à la fin.',
			'`ROLLBACK TO SAVEPOINT` n’annule que ce qui vient après le savepoint et sort de l’état d’échec, donc la transaction continue.',
			'C’est ce que fait un `transaction.atomic()` imbriqué dans Django : un SAVEPOINT à l’entrée, un retour à lui en cas d’erreur.'
		]
	},
	recall: {
		q: 'Django tourne en autocommit. Une vue enregistre une commande, puis la mise à jour du stock échoue. Comment empêcher que la commande soit committée seule ?',
		a: 'Mets les deux écritures dans `transaction.atomic()`. L’erreur annule toute la transaction, donc aucune des deux lignes n’est committée. Attrape l’erreur en dehors du bloc.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Tutorial: Transactions', url: 'https://www.postgresql.org/docs/18/tutorial-transactions.html' },
		{ title: 'PostgreSQL docs, SAVEPOINT', url: 'https://www.postgresql.org/docs/18/sql-savepoint.html' },
		{ title: 'Django docs, Database transactions', url: 'https://docs.djangoproject.com/en/stable/topics/db/transactions/' },
		{ title: 'PostgreSQL source, postgres.c (aborted transaction error)', url: `${TCOP}#L1136-L1140` }
	]
};
