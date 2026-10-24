const SYNAPSE = 'https://github.com/element-hq/synapse/blob/26a92c711161be9f9b8c69b33144ba7fe5b31063';
const DB = `${SYNAPSE}/synapse/storage/database.py`;
const ENGINE = `${SYNAPSE}/synapse/storage/engines/postgres.py`;
const MVCC = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339/doc/src/sgml/mvcc.sgml';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'isolation',
	part: 'Plusieurs à la fois',
	title: 'Niveaux d’isolation',
	minutes: 10,
	hook: [
		'Il reste un article en stock. Deux clients cliquent sur « acheter » dans la même seconde. Chaque paiement lit `stock = 1`, conclut qu’il y en a assez, et écrit `stock = 0`. **Les deux commandes passent. Tu as vendu un article deux fois.**',
		'Chaque paiement tournait dans une transaction, et rien n’a échoué ni n’est resté à moitié fait. Le problème est entre les deux : **chacun a agi sur une valeur que l’autre allait changer**. L’atomicité (jour 17) ne couvre pas ça. Le niveau d’isolation décide de ce qu’une transaction voit des autres, et des courses que PostgreSQL arrête.',
		'PostgreSQL a trois niveaux. Read Committed, le défaut, prend un nouveau snapshot (jour 18) à chaque instruction. Repeatable Read garde le snapshot de la première instruction pendant toute la transaction, et Serializable suit en plus ce que chaque transaction a lu. Quand un niveau plus strict attrape une course, il **annule ta transaction**, et ton code doit la relancer.'
	],
	terms: [
		{ term: 'Mise à jour perdue', def: 'Deux transactions lisent une valeur, en calculent une nouvelle dans l’appli, et la réécrivent. La deuxième écriture efface la première sans rien dire.' },
		{ term: 'Write skew', def: 'Deux transactions lisent les mêmes lignes, vérifient une règle, et chacune écrit une ligne différente. Chaque écriture est correcte seule. Ensemble, elles cassent la règle.' },
		{ term: 'Échec de sérialisation', def: 'L’erreur que PostgreSQL lève pour empêcher une anomalie, toujours avec le SQLSTATE 40001. La solution : annuler et relancer toute la transaction.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['rc["Read Committed (défaut) : nouveau snapshot par instruction"] -->|"lire dans l’appli, réécrire"| lost["Mise à jour perdue : les deux committent, une écriture disparaît"]'],
				highlight: ['rc', 'lost'],
				note: 'Chaque paiement lance `SELECT stock`, puis `UPDATE ... SET stock = 0`. Le deuxième UPDATE attend le commit du premier, puis applique sa propre valeur par-dessus, et les deux réussissent. Read Committed est « fast and simple to use » (rapide et simple), mais la doc dit qu’il « is not sufficient for all cases » (ne suffit pas dans tous les cas).'
			},
			{
				add: ['rr["Repeatable Read : un snapshot par transaction"] -->|"ligne changée depuis mon snapshot"| err1["ERROR 40001 : could not serialize access due to concurrent update"]'],
				highlight: ['rr', 'err1'],
				note: 'En Repeatable Read, le snapshot du deuxième paiement montre `stock = 1`. Au moment de son update, une autre transaction a déjà modifié la ligne et committé, donc PostgreSQL annule la deuxième transaction au lieu d’écrire par-dessus. La doc : une telle transaction « cannot modify or lock rows changed by other transactions after the repeatable read transaction began » (ne peut ni modifier ni verrouiller des lignes changées par d’autres après son début).'
			},
			{
				add: ['rr -.->|"lignes différentes écrites"| skew["Write skew : toujours permis"]'],
				highlight: ['skew'],
				note: 'Repeatable Read rate le write skew. L’exemple de la doc : la transaction A additionne les lignes de la classe 1 et insère le total comme ligne de classe 2, et B additionne la classe 2 et insère dans la classe 1. Elles écrivent des lignes différentes, donc il n’y a aucun conflit d’update. En Repeatable Read, « both would be allowed to commit » (les deux pourraient committer), avec un résultat qu’aucun ordre une par une ne donnerait.'
			},
			{
				add: ['ser["Serializable : suit les dépendances lecture/écriture"] -->|"aucun ordre sériel ne colle"| err2["ERROR 40001 : read/write dependencies among transactions"]'],
				highlight: ['ser', 'err2'],
				note: 'Serializable marche comme Repeatable Read, mais note aussi ce que chaque transaction a lu. Quand les commits ne peuvent correspondre à aucun ordre une par une, une transaction échoue. Ce suivi « does not introduce any blocking beyond that present in repeatable read » (n’ajoute aucun blocage par rapport à Repeatable Read), mais il a un coût.'
			},
			{
				add: ['err1 --> retry["Annuler, relancer toute la transaction"]', 'err2 --> retry'],
				highlight: ['retry'],
				note: 'La doc : avec les deux niveaux, il faut « be prepared to retry transactions due to serialization failures » (être prêt à relancer les transactions après un échec de sérialisation). Relance **toute** la transaction, lectures comprises. La deuxième fois, son snapshot contient déjà l’autre commit, donc elle décide sur des données fraîches.'
			}
		]
	},
	example: {
		title: 'synapse/storage/database.py : le serveur Matrix relance une transaction sur 40001',
		repo: 'element-hq/synapse',
		url: `${DB}#L737-L876`,
		lang: 'python',
		code: `        """Start a new database transaction with the given connection.

        Note: The given func may be called multiple times under certain
        failure modes. This is normally fine when in a standard transaction,
        but care must be taken if the connection is in \`autocommit\` mode that
        the function will correctly handle being aborted and retried half way
        through its execution.
…
        try:
            MAX_NUMBER_OF_ATTEMPTS = 5
            for attempt_number in range(1, MAX_NUMBER_OF_ATTEMPTS + 1):
…
                try:
…
                        r = func(cursor, *args, **kwargs)
                        opentracing.log_kv({"message": "commit"})
                        conn.commit()
                        return r
…
                except self.engine.module.DatabaseError as e:
                    if self.engine.is_deadlock(e):
                        transaction_logger.warning(
                            "[TXN DEADLOCK] {%s} %d/%d",
                            name,
                            attempt_number,
                            MAX_NUMBER_OF_ATTEMPTS,
                        )
                        try:
                            with opentracing.start_active_span("db.rollback"):
                                conn.rollback()
                        except self.engine.module.Error as e1:
                            transaction_logger.warning(
                                "[TXN EROLL] {%s} %s",
                                name,
                                e1,
                            )
                        # Keep retrying if we haven't reached max attempts
                        if attempt_number < MAX_NUMBER_OF_ATTEMPTS:
                            continue
                    raise`,
		notes: [
			'Synapse remplace le Read Committed de PostgreSQL : son moteur [définit REPEATABLE READ](' + ENGINE + '#L88-L95) comme `default_isolation_level` et l’applique à chaque nouvelle connexion. Chaque transaction qu’il lance peut donc subir un échec de sérialisation, et chacune passe par cette boucle.',
			'La ligne 21 décide de ce qui se relance. Malgré son nom, [`is_deadlock`](' + ENGINE + '#L224-L229) renvoie vrai pour deux codes : `40001` (serialization_failure) et `40P01` (deadlock_detected). La doc de PostgreSQL recommande la même liste : 40001 toujours, et « It may also be advisable to retry deadlock failures. » (il peut être utile de relancer aussi les deadlocks).',
			'Les lignes 28 à 30 annulent, et la ligne 39 continue la boucle, qui rappelle `func` depuis le début (ligne 15), jusqu’à 5 tentatives en tout (ligne 10). Après la dernière, la ligne 40 lève l’erreur. La doc : « abort the current transaction and retry the whole transaction from the beginning. The second time through, the transaction will see the previously-committed change » (annule et relance toute la transaction depuis le début, la deuxième fois elle verra le changement committé, [source](' + MVCC + '#L549-L554)).',
			'Les lignes 3 à 7 préviennent que la fonction doit supporter deux passages : « The given func may be called multiple times under certain failure modes. » (la fonction peut être appelée plusieurs fois dans certains cas d’échec). Les effets hors de la base, comme envoyer un message, doivent attendre le commit, sinon ils ont lieu une fois par tentative.'
		]
	},
	tradeoff: {
		gain: [
			'Repeatable Read arrête les mises à jour perdues sans changer la requête : le deuxième écrivain échoue au lieu d’écraser.',
			'Serializable te laisse raisonner sur chaque transaction seule : si elle est juste quand elle tourne seule, elle est juste dans n’importe quel mélange, ou elle ne committe pas.',
			'Aucun des deux niveaux ne fait attendre les lecteurs : en Serializable, les verrous de prédicat « do not cause any blocking » (ne bloquent rien).'
		],
		cost: [
			'Chaque transaction en Repeatable Read ou Serializable peut échouer avec 40001, donc chaque appel a besoin d’une boucle de relance autour de toute la transaction.',
			'Les relances coûtent du travail et de la latence, et sous forte concurrence la même transaction peut échouer plusieurs fois.',
			'Serializable suit les lectures, ce qui coûte de la mémoire et du CPU, et ses verrous de lecture « often need to be kept past transaction commit » (doivent souvent survivre au commit).',
			'Read Committed ne lève jamais 40001, donc une mise à jour perdue passe inaperçue : le stock est faux et aucune erreur n’apparaît dans les logs.'
		]
	},
	task: {
		prompt: 'Règle : une boutique doit toujours garder au moins un admin. Deux admins, Ana et Ben, ouvrent la page de réglages et cliquent sur « retirer mon rôle d’admin » en même temps. Le code lance `SELECT count(*) FROM users WHERE admin` et, si le compte dépasse 1, `UPDATE users SET admin = false WHERE id = me`. Que se passe-t-il en Read Committed, Repeatable Read et Serializable ? Esquisse ensuite la boucle de relance.',
		hint: 'Chaque transaction modifie une ligne différente. Quel niveau regarde au-delà des conflits sur une ligne ?',
		answer: [
			'Read Committed : les deux comptent 2, les deux modifient leur propre ligne. Aucun conflit sur une ligne, les deux committent. La boutique n’a plus aucun admin.',
			'Repeatable Read : les deux committent aussi. Chaque snapshot montre 2 admins, et les deux UPDATE touchent des lignes différentes, donc pas de 40001. C’est un write skew.',
			'Serializable : chacune a lu les lignes que l’autre a écrites. Aucun ordre sériel ne donne « zéro admin », donc l’une des deux échoue avec 40001. À la relance, elle compte 1 et refuse.',
			'Boucle de relance : `for attempt in 1..5: BEGIN ISOLATION LEVEL SERIALIZABLE; run the whole function; COMMIT; return`. Sur SQLSTATE 40001 (et 40P01) : ROLLBACK, attends éventuellement un peu, recommence. Après la dernière tentative, lève l’erreur.',
			'Sans Serializable, verrouille ce que la règle lit : `SELECT ... FROM users WHERE admin FOR UPDATE` fait attendre le deuxième admin jusqu’à ce que le premier ait fini (jour 20).'
		],
		steps: [
			{
				title: 'Lance-le en Read Committed',
				questions: [
					{ q: 'Ana et Ben lancent chacun `SELECT count(*) FROM users WHERE admin`. Qu’obtient chacun ?', options: ['1, puisque l’autre est déjà parti', '2', '0', 'Une erreur, puisque l’autre lit aussi'], answer: 1, why: 'Aucun des deux n’a encore modifié quoi que ce soit, donc les deux voient deux admins.' },
					{ q: 'Les deux UPDATE sont-ils en conflit sur une ligne ?', options: ['Oui, les deux modifient la table `users`', 'Oui, les deux changent la colonne `admin`', 'Seulement s’ils tournent dans la même milliseconde', 'Non, chacun modifie une ligne différente'], answer: 3, why: 'Ana modifie la ligne d’Ana, Ben celle de Ben. Aucune ligne n’est écrite deux fois.' },
					{ q: 'Quel est le résultat ?', options: ['Les deux committent, et la boutique n’a plus aucun admin', 'Ben attend Ana, puis refuse', 'L’une échoue avec 40001', 'Les deux échouent et sont annulées'], answer: 0, why: 'Pas de conflit de ligne, pas de contrôle de sérialisation : les deux commits passent et la règle est cassée.' },
					{ q: 'Pourquoi Read Committed laisse-t-il passer ?', options: ['Il ne prend aucun snapshot', 'Il verrouille la table pendant le comptage', 'Il ne lève jamais d’erreur de sérialisation, et ici aucune ligne n’est partagée', 'Il ne vérifie les règles que la nuit'], answer: 2, why: 'Read Committed prend un nouveau snapshot par instruction et ne lève pas de 40001. Rien n’empêche deux écritures sur des lignes différentes.' }
				]
			},
			{
				title: 'Lance-le en Repeatable Read',
				questions: [
					{ q: 'En Repeatable Read, que montre le snapshot de chaque transaction ?', options: ['2 admins', '1 admin', '0 admin', 'Ça dépend de qui committe en premier'], answer: 0, why: 'Chaque snapshot est pris à la première instruction, avant les deux updates.' },
					{ q: 'Repeatable Read lève-t-il 40001 ici ?', options: ['Oui, le deuxième comptage voit un changement', 'Oui, dès que les deux committent', 'Non : il n’échoue que sur une ligne modifiée par d’autres depuis son début, et chaque ligne n’est modifiée qu’une fois', 'Non, Repeatable Read ne lève jamais 40001'], answer: 2, why: 'Une transaction Repeatable Read « cannot modify or lock rows changed by other transactions ». Ici, personne ne touche la ligne de l’autre.' },
					{ q: 'Quel est le résultat ?', options: ['L’une échoue avec 40001', 'Les deux committent, zéro admin', 'Ben attend, puis voit 1 admin', 'Les deux sont annulées'], answer: 1, why: 'Les deux écritures touchent des lignes différentes, donc les deux committent, comme en Read Committed.' },
					{ q: 'Comment s’appelle cette anomalie ?', options: ['Mise à jour perdue', 'Deadlock', 'Lecture sale', 'Write skew'], answer: 3, why: 'Deux transactions lisent les mêmes lignes, vérifient une règle, et chacune écrit une ligne différente. Ensemble, elles cassent la règle.' }
				]
			},
			{
				title: 'Lance-le en Serializable',
				questions: [
					{ q: 'Qu’ajoute Serializable par rapport à Repeatable Read ?', options: ['Il verrouille chaque ligne lue jusqu’au commit', 'Il suit ce que chaque transaction a lu', 'Il exécute une transaction à la fois', 'Il prend un nouveau snapshot par instruction'], answer: 1, why: 'Il note les dépendances lecture/écriture et fait échouer une transaction quand aucun ordre sériel ne colle aux commits.' },
					{ q: 'Quel est le résultat ?', options: ['L’une des deux échoue avec 40001', 'Les deux committent, zéro admin', 'Les deux s’attendent pour toujours', 'Les deux échouent avec 40001'], answer: 0, why: 'Chacune a lu les lignes que l’autre a écrites. Aucun ordre où elles tournent l’une après l’autre ne donne zéro admin, donc l’une échoue.' },
					{ q: 'Ce suivi fait-il attendre Ana ou Ben ?', options: ['Oui, Ben attend à son SELECT', 'Oui, les deux attendent au COMMIT', 'Seulement si la table est grosse', 'Non, il n’ajoute aucun blocage par rapport à Repeatable Read'], answer: 3, why: 'La doc : il « does not introduce any blocking beyond that present in repeatable read ».' },
					{ q: 'La transaction en échec est relancée. Que se passe-t-il ?', options: ['Elle échoue encore avec 40001', 'Elle retire le rôle quand même', 'Elle compte 1 admin et refuse', 'Elle attend que l’autre soit annulée'], answer: 2, why: 'Le nouveau snapshot contient déjà l’autre commit, donc le compte vaut 1 et la règle tient.' }
				]
			},
			{
				title: 'Esquisse la boucle de relance',
				questions: [
					{ q: 'La fonction envoie aussi un email aux autres admins : « Ana a retiré son rôle ». Où va cet email ?', options: ['Dans la fonction, avant le `COMMIT`', 'Avant le `BEGIN`, pour qu’il ne parte qu’une fois', 'Après la réussite du commit', 'Dans la branche ROLLBACK, pour signaler l’échec'], answer: 2, why: 'La boucle peut appeler la fonction jusqu’à 5 fois. Un email envoyé dedans part une fois par tentative, même pour celles qui sont annulées.' },
					{ q: 'Quels codes SQLSTATE la boucle relance-t-elle ?', options: ['40001, et aussi 40P01 pour les deadlocks', 'Seulement 23505, violation d’unicité', 'Toutes les erreurs', 'Seulement 40P01'], answer: 0, why: '40001 toujours. La doc ajoute : « It may also be advisable to retry deadlock failures. »' },
					{ q: 'Que se passe-t-il après l’échec de la dernière tentative ?', options: ['La boucle tourne pour toujours', 'Tu lèves l’erreur', 'Tu committes ce que tu as', 'Tu passes en Read Committed pour un dernier essai'], answer: 1, why: 'Synapse s’arrête après 5 tentatives et lève l’erreur. L’appelant apprend que la transaction n’a pas eu lieu.' },
					{ q: 'Sans Serializable, comment la règle peut-elle tenir quand même ?', options: ['Compter deux fois avant l’update', 'Passer en Repeatable Read et relancer sur 40001', 'Ajouter un CHECK sur la colonne `admin`', '`SELECT ... FROM users WHERE admin FOR UPDATE`, pour que le deuxième admin attende'], answer: 3, why: 'Verrouiller les lignes que la règle lit fait attendre le deuxième admin jusqu’à ce que le premier ait fini (jour 20).' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'En Read Committed, deux paiements font chacun `SELECT stock` (1), puis chacun lance `UPDATE items SET stock = 0`. Quel est le résultat ?',
			options: [
				'Le deuxième UPDATE échoue avec une erreur de sérialisation et doit être relancé',
				'Les deux committent, le stock vaut 0, et l’article a été vendu deux fois',
				'Le deuxième UPDATE voit le stock à 0 et saute la ligne parce qu’elle a changé',
				'Le deuxième paiement bloque sur son SELECT jusqu’au commit du premier'
			],
			answer: 1,
			why: 'Read Committed ne lève pas d’erreur de sérialisation. Le deuxième UPDATE attend le premier, puis écrit sa propre valeur. Cette valeur venait d’une lecture périmée dans l’appli, donc une vente est perdue. `SET stock = stock - 1 WHERE stock > 0` ou un niveau plus strict règle le problème.'
		},
		{
			q: 'En Repeatable Read, ta transaction modifie une ligne qu’une autre transaction a changée et committée après le début de la tienne. Que se passe-t-il ?',
			options: [
				'Ton UPDATE s’applique par-dessus la version plus récente de la ligne',
				'Ton UPDATE attend, puis saute sans rien dire la ligne qui a changé',
				'Ta transaction échoue avec 40001 et doit être relancée',
				'Ton UPDATE écrase la version plus récente avec ta propre valeur'
			],
			answer: 2,
			why: 'Une transaction Repeatable Read ne peut pas modifier une ligne changée par d’autres après son début. PostgreSQL lève « could not serialize access due to concurrent update ». La solution : relancer toute la transaction, qui part alors de la nouvelle version.'
		},
		{
			q: 'Deux transactions lisent les mêmes lignes, vérifient une règle, et écrivent dans des lignes différentes. Ensemble, elles cassent la règle. Quel est le niveau le plus bas qui l’empêche ?',
			options: [
				'Read Committed, parce que chaque instruction prend un snapshot neuf',
				'Repeatable Read, parce que toute la transaction a un seul snapshot',
				'Serializable, parce qu’il suit ce que chaque transaction a lu',
				'Aucun : seul un verrou explicite sur la table peut l’empêcher'
			],
			answer: 2,
			why: 'C’est un write skew. Il n’y a de conflit sur aucune ligne, donc Repeatable Read laisse les deux committer. Serializable suit les dépendances lecture/écriture et en fait échouer une. Les verrous explicites marchent aussi, mais ce n’est pas le seul moyen.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Vendre deux fois un seul article en Read Committed, prendre un 40001 en Repeatable Read, puis corriger avec un seul UPDATE.',
		steps: [
			'Lance un PostgreSQL 18 jetable et ouvre `psql` dans deux terminaux, A et B : `docker run --rm -d --name pg-lab -e POSTGRES_PASSWORD=lab postgres:18`, attends quelques secondes, puis `docker exec -it pg-lab psql -U postgres` dans chacun. Dans les deux, lance `\\set VERBOSITY verbose` pour voir les codes d’erreur.',
			'Dans A : `CREATE TABLE items (id int primary key, stock int not null); INSERT INTO items VALUES (1, 1);`',
			'Read Committed, lire puis écrire : dans A, lance `BEGIN; SELECT stock FROM items WHERE id = 1;`, puis la même chose dans B. Dans A : `UPDATE items SET stock = 0 WHERE id = 1; COMMIT;`. Dans B : `UPDATE items SET stock = 0 WHERE id = 1; COMMIT;`',
			'Remets le stock avec `UPDATE items SET stock = 1;` et refais l’étape 3 avec `BEGIN ISOLATION LEVEL REPEATABLE READ;` dans les deux terminaux. Quand B échoue, lance `ROLLBACK;` dans B, puis toute la transaction de nouveau depuis `BEGIN ISOLATION LEVEL REPEATABLE READ;`.',
			'Remets le stock encore. En Read Committed, dans A lance `BEGIN; UPDATE items SET stock = stock - 1 WHERE id = 1 AND stock > 0;` puis la même chose dans B (il attend). Lance `COMMIT;` dans A, puis `COMMIT;` dans B. Arrête tout avec `docker stop pg-lab`.'
		],
		done: [
			'À l’étape 3, les deux terminaux affichent `COMMIT` : deux achats ont vendu l’unique article.',
			'À l’étape 4, l’UPDATE de B échoue avec `ERROR:  40001: could not serialize access due to concurrent update`, et sa relance lit `stock` 0.',
			'À l’étape 5, A affiche `UPDATE 1`, et B, une fois A committé, affiche `UPDATE 0`.'
		],
		solution: [
			'Read Committed : l’UPDATE de B attend A, puis écrit sa propre valeur par-dessus. La valeur venait d’une lecture périmée dans l’appli, donc une vente est perdue et aucune erreur n’est journalisée.',
			'Repeatable Read : B ne peut pas modifier une ligne changée par d’autres depuis son début, donc il échoue, et la relance part d’un snapshot qui contient le commit de A.',
			'`stock = stock - 1 WHERE stock > 0` revérifie la ligne après l’attente, donc le deuxième achat ne trouve aucune ligne. L’appli lit `UPDATE 0` et refuse la vente.'
		]
	},
	recall: {
		q: 'Deux admins retirent leur propre rôle d’admin en même temps, et la boutique finit sans aucun admin. Quel niveau d’isolation l’empêche, et que doit faire ton code ensuite ?',
		a: 'Serializable. Il fait échouer l’une des deux transactions avec le SQLSTATE 40001, et ton code annule puis relance toute la transaction, qui compte alors 1 admin et refuse.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Transaction Isolation', url: 'https://www.postgresql.org/docs/18/transaction-iso.html' },
		{ title: 'PostgreSQL docs, Serialization Failure Handling', url: 'https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html' },
		{ title: 'PostgreSQL docs, SET TRANSACTION', url: 'https://www.postgresql.org/docs/18/sql-set-transaction.html' },
		{ title: 'Synapse, engines/postgres.py (isolation level set on each new connection)', url: `${ENGINE}#L191-L192` }
	]
};
