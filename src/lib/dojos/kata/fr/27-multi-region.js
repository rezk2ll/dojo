/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'multi-region',
	part: 'Fiabilité',
	title: 'Servir deux régions',
	minutes: 10,
	hook: [
		'Un site de recettes tourne à Francfort. À Singapour, une utilisatrice ouvre une recette, et l’application lance 6 requêtes SQL pour construire la page. Chaque requête fait l’aller-retour jusqu’à Francfort en 160 ms, donc les requêtes seules prennent 960 ms.',
		'En Europe, la même page s’affiche en 80 ms. L’Asie pèse maintenant 40 % du trafic, et les utilisateurs asiatiques s’arrêtent à la deuxième page.',
		'L’équipe veut des pages aussi rapides en Asie qu’en Europe. Enregistrer une recette ou un commentaire peut rester plus lent.'
	],
	terms: [
		{ term: 'Hot standby', def: 'Un réplica PostgreSQL qui accepte des requêtes en lecture seule pendant qu’il rejoue les changements reçus du primaire.' },
		{ term: 'Retard de réplication', def: 'Le temps entre un commit sur le primaire et le moment où ce changement est visible sur un réplica.' },
		{ term: 'LSN', def: 'Log sequence number : une position dans le journal d’écriture anticipée (WAL) de PostgreSQL, comme `16/B374D848`. Un réplica qui a rejoué jusqu’à un LSN a tous les changements écrits avant.' }
	],
	kata: {
		brief: [
			'Un site de recettes compte 4 millions d’utilisateurs : 2,4 millions en Europe et 1,6 million en Asie. En pointe, il sert 6 000 lectures et 150 écritures par seconde (recettes, commentaires, notes). La base est un seul PostgreSQL de 300 Go.',
			'Chaque page doit répondre en **moins de 100 ms** dans les deux régions. Une écriture a droit à 1 seconde. L’équipe dispose d’un datacenter à Francfort et d’un autre à Singapour. Dans cet énoncé, un aller-retour réseau entre les deux prend 160 ms.',
			'Quelqu’un qui poste un commentaire puis recharge la page doit voir son commentaire. Les autres peuvent le voir quelques secondes plus tard.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit où une lecture de page depuis Singapour obtient sa réponse, sans passer par le lien de 160 ms.',
			'Ton design dit où les écritures sont validées, et combien de millisecondes prend une écriture depuis l’Asie.',
			'Ton design compte tous les allers-retours d’une écriture asiatique, pas seulement le premier.',
			'Ton design dit comment quelqu’un voit son propre commentaire juste après l’avoir posté.',
			'Ton design dit comment l’équipe mesure le retard de réplication, et à partir de quelle valeur quelqu’un est prévenu.',
			'Ton design dit ce que les utilisateurs asiatiques peuvent encore faire quand le lien vers Francfort est coupé.'
		],
		sample: [
			'Francfort fait tourner le primaire PostgreSQL et un réplica. Singapour fait tourner deux réplicas en hot standby, alimentés par la réplication en streaming. Chaque région a ses serveurs applicatifs, et un DNS géographique envoie chaque utilisateur vers la région la plus proche. Les connexions à un hot standby sont en lecture seule, donc les 150 écritures par seconde partent toutes à Francfort.',
			'Les lectures. Un serveur applicatif de Singapour interroge un réplica du même datacenter, donc les 6 requêtes d’une page ne traversent jamais le lien. La page reste sous 100 ms dans les deux régions. Singapour prend sa part des 6 000 lectures par seconde, partagée entre ses deux réplicas.',
			'Les écritures. Si un serveur de Singapour ouvrait une connexion SQL vers Francfort, une transaction avec `BEGIN`, deux requêtes et `COMMIT` coûterait 4 allers-retours, soit 640 ms. À la place, il transmet toute la requête HTTP à un serveur applicatif de Francfort. Ça coûte **un seul aller-retour, 160 ms**, plus la transaction locale, dans le budget de 1 seconde.',
			'Le retard. La réplication en streaming est asynchrone par défaut. La doc de PostgreSQL parle d’un délai « typically under one second assuming the standby is powerful enough to keep up with the load » (en général moins d’une seconde si le réplica suit la charge). L’équipe trace `replay_lag` depuis `pg_stat_replication` sur le primaire et alerte quelqu’un s’il reste au-dessus de 5 secondes.',
			'Voir son propre commentaire. Après le commit, l’application de Francfort lance `SELECT pg_current_wal_lsn()` et renvoie ce LSN, que Singapour garde 30 secondes dans la session de l’utilisateur. À la page suivante, l’application le compare à `pg_last_wal_replay_lsn()` sur le réplica local. Si le réplica est en retard, cette page-là lit à Francfort et prend environ 160 ms de plus.',
			'Le choix principal : un seul primaire, à Francfort. Deux utilisateurs ne peuvent pas écrire deux versions concurrentes d’une même ligne, car un seul serveur accepte les écritures. En échange, chaque écriture asiatique paie 160 ms, et l’Asie ne peut que lire tant que le lien est coupé.',
			'Promouvoir un réplica de Singapour pendant une panne de Francfort reste possible, mais la doc de PostgreSQL dit que la perte « is proportional to the replication delay at the time of failover » (dépend du retard au moment de la bascule). La réponse garde cette étape manuelle, décidée par une personne qui regarde d’abord le retard.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse, combien de temps prend une écriture depuis Singapour, et pourquoi pas plus ?',
		a: 'Environ 160 ms plus la transaction locale : Singapour transmet la requête HTTP à Francfort en un aller-retour, au lieu de 4 allers-retours SQL (640 ms).'
	},
	sources: [
		{ title: 'Documentation PostgreSQL, Log-Shipping Standby Servers (réplication en streaming)', url: 'https://www.postgresql.org/docs/current/warm-standby.html' },
		{ title: 'Documentation PostgreSQL, Hot Standby', url: 'https://www.postgresql.org/docs/current/hot-standby.html' },
		{ title: 'Documentation PostgreSQL, System Administration Functions (positions dans le WAL)', url: 'https://www.postgresql.org/docs/current/functions-admin.html' }
	]
};
