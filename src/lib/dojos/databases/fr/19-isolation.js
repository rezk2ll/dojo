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
