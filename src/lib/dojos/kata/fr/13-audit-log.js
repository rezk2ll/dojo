/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'audit-log',
	part: 'Les données',
	title: 'Un journal d’audit',
	minutes: 10,
	hook: [
		'Un logiciel de paie garde les salaires de 2 000 entreprises. En mars, une salariée de l’une d’elles voit son salaire baisser de 300 euros, et personne aux RH ne reconnaît la modification.',
		'Son entreprise demande à l’éditeur : qui a changé ce champ, quand, depuis quel compte ? Elle demande aussi comment prouver que personne n’a retouché la réponse ensuite, pas même les admins de base de données de l’éditeur.',
		'Le contrat avec chaque client impose de garder cet historique 7 ans.'
	],
	terms: [
		{ term: 'Chaîne de hachage', def: 'Chaque enregistrement stocke un hash calculé sur son contenu et sur le hash de l’enregistrement précédent : changer un enregistrement change tous les hash suivants.' },
		{ term: 'Ancre', def: 'Une copie du dernier hash écrite à un endroit que les admins de la base ne peuvent pas modifier, qui sert plus tard à vérifier la chaîne.' },
		{ term: 'Infalsifiable a posteriori', def: 'Une modification des enregistrements se détecte après coup. Ça ne veut pas dire qu’elle a été empêchée.' }
	],
	kata: {
		brief: [
			'Chaque action d’admin est enregistrée : qui, quand, sur quel objet, l’ancienne et la nouvelle valeur. 500 000 actions par jour, environ 1 Ko chacune, avec un pic à 50 par seconde.',
			'Les enregistrements sont gardés 7 ans, puis supprimés. Une action réussie doit avoir son enregistrement ; une action dont l’enregistrement n’a pas pu être écrit doit échouer.',
			'Un auditeur cherche par utilisateur et par période : « toutes les actions de l’utilisateur 1234 en mars 2025 ». La réponse arrive en moins de 2 secondes.',
			'Un admin de base de données qui réécrit ou supprime des enregistrements doit être repéré par une vérification lancée chaque nuit.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit comment l’enregistrement d’audit et l’action d’admin sont écrits ensemble, pour que l’un n’existe jamais sans l’autre.',
			'Ton design donne la place prise sur 7 ans, et comment partent les enregistrements de plus de 7 ans.',
			'Ton design dit quel index ou quel découpage répond à « utilisateur 1234 en mars 2025 » sans lire les 7 ans.',
			'Ton design dit ce qu’un admin de base avec tous les droits devrait modifier pour cacher une retouche, et pourquoi la vérification de nuit la trouve quand même.',
			'Ton design dit combien de temps une retouche peut passer inaperçue.',
			'Ton design donne le nombre maximal d’enregistrements d’audit par seconde, et ce qui le limite.'
		],
		sample: [
			'La table d’audit est dans la même base PostgreSQL que le produit. L’action d’admin et son insertion d’audit tournent dans une seule transaction : les deux sont validées, ou aucune. Le rôle de base de l’appli n’a que `INSERT` et `SELECT` sur la table d’audit.',
			'Chaque ligne stocke `hash = SHA-256(previous_hash || row content)`. Pour lire le hash précédent sans course, l’insertion appelle d’abord `pg_advisory_xact_lock(42)`. La doc PostgreSQL dit qu’un verrou de transaction est "automatically released at the end of the transaction" (libéré tout seul à la fin). Au niveau Read Committed par défaut, l’insertion suivante lit donc le hash que la précédente a validé.',
			'Ce verrou est le prix principal : une seule insertion d’audit à la fois, tous serveurs confondus. L’insertion se fait en dernier, juste avant la validation. Si le verrou est tenu 5 ms, le plafond est de 200 lignes par seconde, 4 fois le pic de 50.',
			'Stockage : 500 000 lignes de 1 Ko font 500 Mo par jour, environ 183 Go par an, environ 1,3 To sur 7 ans. La table est partitionnée par mois, soit 84 partitions d’environ 15 Go. Chaque partition a un index sur `(user_id, created_at)`.',
			'« Utilisateur 1234 en mars 2025 » vise un seul mois. L’élagage de partitions de PostgreSQL saute les 83 autres, et l’index trouve les lignes dans celle de mars. Après 7 ans, une tâche supprime la plus vieille partition : selon la doc, `DROP TABLE` sur une partition "can very quickly delete millions of records".',
			'Un admin de base avec tous les droits peut réécrire une ligne et recalculer tous les hash suivants. Les ancres l’en empêchent. Toutes les 10 minutes, une tâche écrit le dernier `(id, hash)` dans un bucket S3 avec Object Lock en mode compliance et une rétention de 7 ans.',
			'La doc S3 : en mode compliance, un objet "can\'t be overwritten or deleted by any user, including the root user" (même le compte racine ne peut ni l’écraser ni le supprimer). La vérification de nuit recalcule la chaîne du jour et la compare aux 144 ancres de la journée. Une ligne réécrite donne un hash différent à l’ancre suivante.',
			'Les lignes écrites depuis la dernière ancre peuvent être réécrites sans être vues, pendant 10 minutes au plus. La vérification de nuit repère une retouche, mais ne rend pas les valeurs d’origine : il faut une sauvegarde pour ça.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse proposée, qu’est-ce qui empêche un admin de base de réécrire une ligne et de recalculer toute la chaîne de hachage ?',
		a: 'Toutes les 10 minutes, le dernier hash part dans un bucket S3 avec Object Lock en mode compliance, que personne ne peut écraser. La vérification de nuit compare la chaîne recalculée à ces 144 ancres par jour.'
	},
	sources: [
		{ title: 'Doc Amazon S3, Locking objects with Object Lock (mode compliance)', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html' },
		{ title: 'Doc PostgreSQL, verrous consultatifs (Advisory Locks)', url: 'https://www.postgresql.org/docs/current/explicit-locking.html' },
		{ title: 'Doc PostgreSQL, partitionnement (élagage et suppression de partitions)', url: 'https://www.postgresql.org/docs/current/ddl-partitioning.html' }
	]
};
