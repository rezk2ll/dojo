/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'db-migration',
	part: 'Architecture',
	title: 'Changer de base de données',
	minutes: 10,
	hook: [
		'Une boutique tourne sur une base MySQL de 500 Go. L’équipe a décidé de passer à PostgreSQL. Aujourd’hui, chaque commande, chaque panier et chaque facture sont dans cette base MySQL.',
		'Un dump puis une restauration de 500 Go prennent des heures, et la boutique ne peut pas refuser des commandes pendant des heures. Le product owner t’accorde 5 minutes d’écritures refusées, à 3 h du matin, une seule fois.',
		'La copie doit donc se faire pendant que MySQL continue d’accepter des écritures, et la bascule doit tenir dans une fenêtre courte.'
	],
	terms: [
		{ term: 'Binlog', def: 'Le journal binaire de MySQL : chaque modification validée, dans l’ordre des commits. MySQL s’en sert pour la réplication.' },
		{ term: 'Change data capture (CDC)', def: 'Lire le journal des modifications d’une base et envoyer chaque modification ailleurs sous forme d’événement.' },
		{ term: 'Bascule', def: 'Le moment où l’application arrête d’écrire dans l’ancienne base et commence à écrire dans la nouvelle.' },
		{ term: 'Upsert', def: 'Une écriture qui insère la ligne si sa clé primaire est nouvelle, et la met à jour si la clé existe déjà.' }
	],
	kata: {
		brief: [
			'Un serveur MySQL 8 contient 500 Go répartis sur 40 tables. La plus grosse, `orders`, fait 300 Go. Douze serveurs applicatifs écrivent dedans.',
			'Les écritures montent à 1 200 par seconde le soir et tombent à 150 par seconde à 3 h. Un essai a copié des lignes dans PostgreSQL à 40 Mo par seconde.',
			'La cible est PostgreSQL 16. Pendant le déménagement, les écritures peuvent être refusées 5 minutes au total, pas plus. Aucune commande validée ne doit être perdue ni écrite deux fois.',
			'Conçois la copie, la façon de tenir PostgreSQL à jour pendant qu’elle tourne, la vérification des données, et la bascule elle-même.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit comment les 500 Go arrivent dans PostgreSQL pendant que MySQL accepte encore des écritures.',
			'Ton design dit comment les écritures faites pendant la copie arrivent dans PostgreSQL, et à partir de quel instant.',
			'Ton design dit ce qui se passe quand la même modification est appliquée deux fois après un redémarrage.',
			'Ton design donne la durée de la copie en heures, calculée à partir de 500 Go et de 40 Mo par seconde.',
			'Ton design liste les étapes de la bascule dans l’ordre, avec une durée pour chacune, pour un total sous 5 minutes.',
			'Ton design dit comment tu compares MySQL et PostgreSQL avant de basculer.',
			'Ton design dit quel sera le prochain id auto-incrémenté après la bascule.',
			'Ton design dit si tu peux revenir à MySQL une fois que PostgreSQL a reçu des écritures.'
		],
		sample: [
			'Un seul outil copie et suit les modifications : le connecteur Debezium MySQL envoie des événements dans Kafka, et le connecteur Debezium JDBC sink les écrit dans PostgreSQL. La doc Debezium exige `binlog_format = ROW` et `binlog_row_image = FULL` côté MySQL.',
			'Au premier démarrage, Debezium prend un snapshot. Il ne garde un verrou global en lecture que le temps de lire la position du binlog et la structure des tables, puis il le relâche. Ensuite il parcourt chaque table dans une seule transaction en repeatable read, puis lit le binlog à partir de la position notée. Aucune modification ne se perd entre le snapshot et le flux.',
			'Le snapshot déplace 500 Go à 40 Mo par seconde : 500 000 Mo / 40 = 12 500 secondes, environ 3 h 30. Par défaut, MySQL garde le binlog 30 jours (`binlog_expire_logs_seconds = 2592000`), donc les modifications de ces 3 h 30 sont encore là quand le flux démarre.',
			'Kafka livre au moins une fois : après un redémarrage, le sink peut recevoir deux fois le même événement. Mets `insert.mode = upsert` : sur PostgreSQL, le sink écrit `INSERT ... ON CONFLICT ... DO UPDATE`, et un événement rejoué laisse la même ligne. Mets aussi `delete.enabled = true`, sinon les lignes supprimées dans MySQL restent dans PostgreSQL.',
			'Pendant la semaine avant la bascule, lance des vérifications des deux côtés : le nombre de lignes par table, et une somme de contrôle de chaque ligne modifiée dans les dernières 24 heures. Gèle les changements de schéma sur MySQL cette semaine-là, pour que les deux côtés gardent les mêmes tables.',
			'Bascule à 3 h, à 150 écritures par seconde. Minute 0 : active un drapeau lecture seule dans l’application, qui refuse alors les écritures. Minute 1 : le sink a appliqué le dernier événement du binlog, et les nombres de lignes sont égaux.',
			'Minute 2 : lance `setval` sur chacune des 40 séquences avec le plus grand `id` de sa table, car les lignes copiées sont arrivées avec leur id et les séquences n’ont pas bougé. Minutes 3 et 4 : fais pointer les 12 serveurs applicatifs vers PostgreSQL et désactive le drapeau.',
			'Le prix à payer : dès que PostgreSQL prend sa première commande, MySQL est en retard. Revenir en arrière demande un second flux de PostgreSQL vers MySQL, que ce design ne construit pas. Tu fais aussi tourner Kafka et Kafka Connect pendant les semaines du déménagement.'
		]
	},
	quiz: [],
	recall: {
		q: 'Combien de temps dure le snapshot de 500 Go, et qu’est-ce qui permet au flux de rattraper les écritures faites pendant ce temps ?',
		a: 'Environ 3 h 30 (500 000 Mo à 40 Mo par seconde). Debezium lit la position du binlog sous verrou avant le parcours et reprend le flux à cette position, et MySQL garde les binlogs 30 jours par défaut.'
	},
	sources: [
		{ title: 'Debezium, connecteur MySQL (snapshots et réglages du binlog)', url: 'https://debezium.io/documentation/reference/stable/connectors/mysql.html' },
		{ title: 'Debezium, connecteur JDBC sink (écritures idempotentes, suppressions)', url: 'https://debezium.io/documentation/reference/stable/connectors/jdbc.html' },
		{ title: 'PostgreSQL, fonctions de manipulation des séquences (setval)', url: 'https://www.postgresql.org/docs/current/functions-sequence.html' }
	]
};
