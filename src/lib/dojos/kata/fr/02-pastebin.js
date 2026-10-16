/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pastebin',
	part: 'Petits services',
	title: 'Un service de paste',
	minutes: 10,
	hook: [
		'Une développeuse a une stack trace de 900 lignes et un collègue à l’autre bout d’un chat. Le chat coupe les longs messages et casse l’indentation. Elle colle donc la trace dans un service de paste, reçoit un lien et envoie le lien.',
		'Le collègue ouvre le lien une fois, trouve la ligne fautive, et plus personne ne regarde le paste. Elle a choisi « expire après 1 jour » : la trace, qui contient le nom d’un serveur de base de données, doit avoir disparu demain.'
	],
	terms: [
		{ term: 'Date d’expiration', def: 'Le moment après lequel un paste ne doit plus être servi. L’auteur la choisit en créant le paste.' },
		{ term: 'TOAST', def: 'Le stockage de PostgreSQL pour les grandes valeurs : il les compresse ou les range dans une table annexe, sans rien changer à tes requêtes.' },
		{ term: 'Version morte de ligne', def: 'Dans PostgreSQL, l’ancienne copie d’une ligne supprimée ou modifiée. Elle garde sa place sur le disque jusqu’à ce que `VACUUM` marque cette place comme libre.' }
	],
	kata: {
		brief: [
			'N’importe qui colle du texte et reçoit un lien difficile à deviner. Un paste contient jusqu’à 1 Mo de texte. L’auteur choisit une expiration : 10 minutes, 1 jour ou 30 jours.',
			'Les utilisateurs créent **10 000 pastes par jour**, de 20 Ko en moyenne. Il y a 50 000 lectures par jour, et la plupart des pastes sont lus une fois ou jamais.',
			'Un paste expiré ne doit plus être servi dès sa date d’expiration, à la seconde près. Sa ligne doit être supprimée au plus tard un jour après.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit où est stocké le texte d’un paste, et quelle place il prend avec l’expiration la plus longue.',
			'Ton design dit ce qui empêche de servir un paste expiré entre sa date d’expiration et sa suppression.',
			'Ton design dit ce qui supprime les pastes expirés, à quelle fréquence, et combien de lignes chaque passage enlève.',
			'Ton design dit où un paste de plus de 1 Mo est refusé.',
			'Ton design dit combien de caractères fait un lien de paste, et pourquoi personne ne peut en déduire les autres pastes.',
			'Ton design dit si les lectures passent par un cache, en tenant compte du fait que la plupart des pastes sont lus une fois.'
		],
		sample: [
			'D’abord les chiffres. 10 000 pastes de 20 Ko font 200 Mo par jour. Si tous les auteurs choisissaient 30 jours, le service garderait 6 Go. Au pire, chaque paste fait 1 Mo : 10 Go par jour et 300 Go sur 30 jours. 50 000 lectures par jour, c’est moins d’une lecture par seconde.',
			'Tout va dans une seule table PostgreSQL : `pastes(code, body text, expires_at, created_at)`, avec `code` comme clé primaire. Un texte de 20 Ko dépasse les 2 kB à partir desquels TOAST se déclenche : PostgreSQL le compresse ou le sort de la ligne tout seul. L’appli refuse un texte de plus de 1 Mo avant d’ouvrir une transaction.',
			'Le lien fait 8 caractères base62 tirés au hasard, environ 218 000 milliards de valeurs. Comme les codes sont aléatoires, changer un caractère de ton lien ne mène pas aux pastes des autres.',
			'La requête de lecture est `SELECT body FROM pastes WHERE code = $1 AND expires_at > now()`. Un paste expiré ne renvoie plus rien à sa date d’expiration, même si sa ligne est encore sur le disque.',
			'Une tâche horaire lance `DELETE FROM pastes WHERE expires_at < now()`, qui enlève environ 400 lignes à chaque passage. Une ligne supprimée reste sur le disque comme version morte. L’autovacuum marque ensuite cette place comme libre, et les nouveaux pastes la réutilisent. La table reste autour de 6 Go. Le fichier ne rétrécit pas : un VACUUM standard ne rend pas la place au système.',
			'Il n’y a pas de cache. Un paste lu une seule fois entrerait dans le cache sans jamais y être relu, et la base sert moins d’une lecture par seconde.',
			'Le choix principal est de garder le texte des pastes dans la base, et il se paie en taille de sauvegarde : chaque sauvegarde et chaque réplica portent tous les pastes vivants, jusqu’à 300 Go au pire. La doc PostgreSQL dit que supprimer une partition avec `DROP TABLE` "is far faster than a bulk operation" (bien plus rapide qu’une suppression en masse) et évite le travail de VACUUM d’un gros DELETE. À 100 fois ce volume, des partitions par jour remplaceraient le DELETE horaire.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse, qu’est-ce qui empêche de servir un paste une minute après son expiration, alors que sa ligne est encore sur le disque ?',
		a: 'La requête de lecture elle-même : `WHERE code = $1 AND expires_at > now()`. Le DELETE horaire ne libère la place que plus tard.'
	},
	sources: [
		{ title: 'Documentation PostgreSQL, TOAST', url: 'https://www.postgresql.org/docs/current/storage-toast.html' },
		{ title: 'Documentation PostgreSQL, Routine Vacuuming', url: 'https://www.postgresql.org/docs/current/routine-vacuuming.html' },
		{ title: 'Documentation PostgreSQL, Table Partitioning', url: 'https://www.postgresql.org/docs/current/ddl-partitioning.html' }
	]
};
