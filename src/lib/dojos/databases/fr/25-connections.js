const PGB = 'https://github.com/pgbouncer/pgbouncer/blob/7df84b712d836201994b561adf12372226423f2b/src/server.c?plain=1';
const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04/activerecord/lib/active_record/connection_adapters';
const CONFIG = 'https://www.pgbouncer.org/config.html';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'connections',
	part: 'La garder en marche',
	title: 'Connexions et pooling',
	minutes: 10,
	hook: [
		'Les soldes commencent et tu passes la couche web de 10 pods à 40. Deux minutes plus tard, les logs se remplissent de `FATAL: sorry, too many clients already`. **La base n’est pas occupée. Elle n’a plus de connexions.**',
		'Chaque pod fait tourner 4 processus, et chaque processus garde un pool de 5 connexions. Ça faisait 200 connexions à 10 pods. À 40, ça fait 800, et le serveur en accepte 100. **La plupart de ces connexions dorment**, en attendant une requête qui pourrait s’en servir.',
		'Dans PostgreSQL, chaque connexion est un processus complet du système. **Tu ne peux pas juste multiplier la limite par dix.** La réponse habituelle est un pooler comme PgBouncer : des centaines de clients lui parlent, et il partage quelques vraies connexions entre eux. Sa façon de les partager décide de ce qui marche encore.'
	],
	terms: [
		{ term: 'Processus backend', def: 'Le processus serveur que PostgreSQL démarre pour une connexion. Il vit aussi longtemps que la connexion et garde l’état de cette session.' },
		{ term: 'max_connections', def: 'Le nombre maximum de connexions que le serveur accepte en même temps. La valeur par défaut est en général 100, et elle ne change qu’avec un redémarrage.' },
		{ term: 'Pool côté client', def: 'Des connexions qu’un processus de l’appli ouvre une fois et réutilise (ActiveRecord, HikariCP, SQLAlchemy). Ça économise le temps de connexion, mais ça se multiplie avec chaque processus.' },
		{ term: 'Pooling de session', def: 'PgBouncer donne à un client une connexion serveur jusqu’à ce que le client se déconnecte. Tout marche, mais un client inactif garde quand même une connexion.' },
		{ term: 'Pooling de transaction', def: 'PgBouncer donne à un client une connexion serveur seulement le temps d’une transaction, puis la passe à quelqu’un d’autre.' },
		{ term: 'État de session', def: 'Tout ce qui vit sur une connexion entre deux transactions : les valeurs de `SET`, `LISTEN`, les verrous consultatifs de session, les `PREPARE` SQL, les tables temporaires.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["40 pods x 4 processus x 5 connexions"] -->|"800 connexions"| pm["postmaster"]', 'pm -->|"un processus chacune, 100 max"| be[("processus backend")]'],
				highlight: ['app', 'pm'],
				note: '**Sans pooler.** Pour chaque nouvelle connexion, le postmaster démarre un nouveau processus backend. Une fois les places épuisées, la connexion suivante est refusée dès la connexion avec « too many clients already ». La plupart de celles qui sont entrées dorment.'
			},
			{
				add: ['app -->|"800 connexions clientes"| pgb["PgBouncer"]', 'pgb -->|"20 connexions serveur"| be'],
				highlight: ['pgb'],
				note: '**Un pooler devant.** Les clients se connectent à PgBouncer à la place. Il est léger (sa doc parle de 2 kB par connexion par défaut), tient des centaines de connexions clientes, et garde un petit pool de vraies connexions : `default_pool_size` vaut 20 par couple utilisateur et base.'
			},
			{
				add: ['sess["Mode session : une connexion serveur par client, jusqu’à sa déconnexion"] -.-> pgb'],
				highlight: ['sess'],
				note: '**Le mode session n’aide pas ici.** C’est le mode par défaut, et il supporte toutes les fonctionnalités. Mais les pools de l’appli gardent leurs connexions ouvertes toute la journée, donc chacune bloque toujours une connexion serveur. 800 clients demanderaient 800 connexions serveur.'
			},
			{
				add: ['tx["Mode transaction : connexion serveur rendue au pool au COMMIT"] --> pgb'],
				highlight: ['tx'],
				note: '**Le mode transaction partage pour de vrai.** Un client ne tient une connexion serveur que pendant qu’une transaction tourne. Les requêtes qui passent l’essentiel de leur temps hors de la base la laissent libre. 800 clients peuvent partager 20 connexions si, à tout moment, au plus 20 sont dans une transaction.'
			},
			{
				add: ['tx -->|"SET, LISTEN, verrous consultatifs, PREPARE"| lost["L’état de session reste sur la connexion qui l’a lancé"]'],
				highlight: ['lost'],
				note: '**Le prix, c’est l’état de session.** La transaction suivante peut tourner sur une autre connexion serveur. Un `SET statement_timeout` d’une transaction précédente peut ne pas s’appliquer, un `LISTEN` n’entend rien, et un verrou consultatif de session peut être libéré depuis la mauvaise connexion, ou jamais.'
			}
		]
	},
	example: {
		title: 'src/server.c dans PgBouncer : le paquet qui décide quand une connexion est rendue',
		repo: 'pgbouncer/pgbouncer',
		url: `${PGB}#L432-L914`,
		lang: 'c',
		code: `	/* pooling decisions will be based on this packet */
	case PqMsg_ReadyForQuery:

		/* if partial pkt, wait */
		if (!mbuf_get_char(&pkt->data, &state))
			return false;
…
		/* set ready only if no tx */
		if (state == 'I') {
			ready = true;
		} else if (connection_pool_mode(server) == POOL_STMT) {
			disconnect_server(server, true, "transaction blocks not allowed in statement pooling mode");
			return false;
		} else if (state == 'T' || state == 'E') {
			idle_tx = true;
		}
		break;
…
	server->idle_tx = idle_tx;
	server->ready = ready;
…
	case SBUF_EV_FLUSH:
		res = true;
		if (!server->ready)
			break;
…
		if (connection_pool_mode(server) != POOL_SESSION || server->state == SV_TESTED || server->resetting) {
			server->resetting = false;
			switch (server->state) {
			case SV_ACTIVE:
			case SV_ACTIVE_CANCEL:
			case SV_TESTED:
…
				/* retval does not matter here */
				release_server(server);
				break;`,
		notes: [
			'**PostgreSQL dit au pooler quand une transaction se termine.** Après chaque requête, le serveur envoie ReadyForQuery avec un octet d’état. La [doc du protocole](https://www.postgresql.org/docs/current/protocol-message-formats.html) le définit : « \'I\' if idle (not in a transaction block); \'T\' if in a transaction block; or \'E\' if in a failed transaction block » (I hors transaction, T dans une transaction, E dans une transaction en échec). Seul `I` marque la connexion serveur `ready`.',
			'**Le mode statement est encore plus strict.** Si l’état n’est pas idle et que le pool tourne en mode statement, PgBouncer [coupe la connexion](' + PGB + '#L449-L451) avec « transaction blocks not allowed in statement pooling mode ». La [doc de configuration](' + CONFIG + '#pool_mode) résume les trois modes : rendue « after client disconnects », « after transaction finishes » ou « after query finishes » (après la déconnexion du client, la fin de la transaction, ou la fin de la requête).',
			'**La libération se fait au flush.** Une fois la réponse envoyée, un serveur prêt est [libéré](' + PGB + '#L888-L914) sauf si le pool est en mode session. En mode session, il reste lié à son client jusqu’à la déconnexion, et `server_reset_query` (par défaut `DISCARD ALL`) le nettoie avant le client suivant.',
			'**Pas de nettoyage en mode transaction, exprès.** La doc dit que la requête de reset « is not used, because in that mode, clients must not use any session-based features, since each transaction ends up in a different connection and thus gets a different session state. » (n’est pas utilisée, car chaque transaction atterrit sur une autre connexion). Les prepared statements du protocole marchent si [`max_prepared_statements`](' + CONFIG + '#max_prepared_statements) n’est pas nul, mais les `PREPARE`, `EXECUTE` et `DEALLOCATE` SQL « are forwarded straight to Postgres » (sont transmis tels quels à Postgres).',
			'**Un exemple Rails de ce qui casse.** Les migrations Rails prennent un verrou de session avec [`pg_try_advisory_lock`](' + RAILS + '/postgresql_adapter.rb#L559-L571) et le libèrent avec `pg_advisory_unlock`. À travers un pooler en mode transaction, les deux appels peuvent arriver sur des connexions serveur différentes. C’est pour ça que Rails a un réglage [`advisory_locks`](' + RAILS + '/abstract_adapter.rb#L253-L254) que tu peux désactiver.'
		]
	},
	tradeoff: {
		gain: [
			'Des centaines ou des milliers de processus d’appli peuvent partager quelques dizaines de connexions serveur, donc le serveur dépense sa mémoire en requêtes plutôt qu’en processus inactifs.',
			'Faire grossir la couche web ne demande plus de redémarrer la base pour monter `max_connections`.',
			'Les clients obtiennent vite une connexion auprès de PgBouncer, et le pooler les met en file quand toutes les connexions serveur sont occupées, au lieu que la base les refuse.'
		],
		cost: [
			'Le mode transaction casse les fonctionnalités de session : `SET`, `LISTEN`, verrous consultatifs de session, `PREPARE` SQL, curseurs `WITH HOLD` et tables temporaires qui survivent à une transaction. Le tableau des fonctionnalités de PgBouncer les marque « Never ».',
			'Un saut de plus et une chose de plus à faire tourner, surveiller et basculer. Si PgBouncer tombe, chaque client perd la base.',
			'Une transaction lente tient maintenant une connexion partagée. Vingt requêtes lentes peuvent bloquer tout le monde dans la file du pool, donc `pool_size` et les timeouts demandent du réglage.',
			'Les pools s’empilent : un pool d’appli, puis PgBouncer, puis `max_connections`. Les limites de chaque couche doivent avoir du sens par rapport à la suivante.'
		]
	},
	task: {
		prompt: 'Ton appli fait tourner 8 pods web avec 4 processus chacun et un pool client de 5, plus 3 pods de workers avec un pool de 10. PostgreSQL a `max_connections = 100` et le `superuser_reserved_connections` par défaut. Compte les connexions clientes et dis si elles tiennent. Puis tu mets PgBouncer en mode transaction avec `default_pool_size = 20`. Liste trois choses à vérifier dans une appli Rails typique avant de basculer.',
		hint: 'Multiplie pods, processus et taille de pool. La doc dit que trois places sont réservées aux superutilisateurs par défaut. Pour la liste, cherche tout ce qui s’attend à ce que la transaction suivante tourne sur la même connexion.',
		answer: [
			'Web : 8 x 4 x 5 = 160. Workers : 3 x 10 = 30. Total : 190 connexions clientes possibles, pour 97 places pour les utilisateurs ordinaires (100 moins 3 réservées). Ça ne tient pas une fois les pools remplis.',
			'Derrière PgBouncer : 190 connexions clientes partagent 20 connexions serveur pour l’utilisateur et la base de l’appli. Ça marche tant qu’au plus 20 transactions tournent au même moment ; les autres attendent dans la file de PgBouncer.',
			'Vérification 1 : les migrations. Mets `advisory_locks: false`, ou lance les migrations par une connexion directe, puisqu’elles prennent un verrou consultatif de session.',
			'Vérification 2 : les prepared statements. Rails utilise ceux du protocole par défaut, donc mets `max_prepared_statements` de PgBouncer au-dessus de zéro, ou `prepared_statements: false` dans Rails. Vérification 3 : tout `SET` hors transaction (un `statement_timeout` par requête, un `search_path` par tenant) et tout `LISTEN`. Utilise `SET LOCAL` dans la transaction, et donne aux listeners une connexion directe.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi monter `max_connections` de 100 à 2000 est-il une mauvaise réponse à « too many clients already » ?',
			options: [
				'Chaque connexion est un processus serveur, donc l’essentiel de la mémoire part dans des inactifs',
				'PostgreSQL refuse au démarrage toute valeur de `max_connections` au-dessus de 1024',
				'Les clients doivent alors se reconnecter à chaque fois, ce qui ralentit chaque requête',
				'Le réglage ne s’applique qu’aux superutilisateurs, pas à l’utilisateur de l’appli'
			],
			answer: 0,
			why: 'Chaque connexion a son propre processus backend, et la doc précise que PostgreSQL dimensionne des ressources partagées à partir de `max_connections`. Des milliers de processus presque tous inactifs coûtent de la mémoire pour rien. Un pooler partage quelques connexions à la place.'
		},
		{
			q: 'Derrière PgBouncer en mode transaction, une requête lance `SET statement_timeout = \'2s\'` puis, dans une nouvelle transaction, une requête lente. Que se passe-t-il ?',
			options: [
				'La requête est arrêtée au bout de 2 secondes, puisque SET dure toute la session',
				'PgBouncer transforme le SET en SET LOCAL pour qu’il couvre la transaction suivante',
				'La requête peut tourner sur une autre connexion serveur qui n’a jamais vu le SET',
				'PgBouncer rejette le SET parce que c’est une commande de niveau session'
			],
			answer: 2,
			why: 'SET modifie la connexion serveur, pas le client. La transaction suivante peut avoir une autre connexion serveur, donc le timeout peut y manquer, et le SET peut surprendre le client qui récupère ensuite la première connexion. Utilise `SET LOCAL` dans la transaction.'
		},
		{
			q: 'Ton appli garde 300 connexions ouvertes toute la journée dans ses pools. Tu mets PgBouncer devant en mode session avec `pool_size = 300`. Combien de connexions serveur finit-il par tenir ?',
			options: [
				'Environ 20, parce que le mode session partage les connexions entre transactions',
				'Près de 300, puisque chaque client garde sa connexion serveur jusqu’à son départ',
				'Une seule, parce que le mode session fait passer chaque client par un seul lien',
				'Aucune au repos, parce que PgBouncer ferme les connexions serveur entre requêtes'
			],
			answer: 1,
			why: 'En mode session, une connexion serveur est « released back to pool after client disconnects » (rendue au pool quand le client se déconnecte). Les pools d’appli se déconnectent rarement, donc PgBouncer n’économise presque rien. Avec un `pool_size` plus petit, les clients en trop attendraient qu’un autre client se déconnecte.'
		}
	],
	takeaway: 'Chaque connexion PostgreSQL est un processus, alors partage-en quelques-unes via un pooler en mode transaction, et garde l’état de session (`SET`, `LISTEN`, verrous consultatifs, `PREPARE` SQL) hors du code qui passe par lui.',
	sources: [
		{ title: 'PostgreSQL docs, How Connections Are Established', url: 'https://www.postgresql.org/docs/current/connect-estab.html' },
		{ title: 'PostgreSQL docs, Connections and Authentication settings', url: 'https://www.postgresql.org/docs/current/runtime-config-connection.html' },
		{ title: 'PgBouncer, Features and SQL feature map for pooling modes', url: 'https://www.pgbouncer.org/features.html' },
		{ title: 'PgBouncer, Configuration', url: CONFIG }
	]
};
