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
		'Les soldes commencent et tu passes la couche web de 10 pods à 40. Deux minutes plus tard, les logs se remplissent de `FATAL: sorry, too many clients already`. **Le serveur refuse les nouvelles connexions parce que toutes ses places sont prises.**',
		'Chaque pod fait tourner 4 processus, et chaque processus garde un pool de 5 connexions. Ça faisait 200 connexions à 10 pods. À 40, ça fait 800, et le serveur en accepte 100. **La plupart de ces connexions dorment**, en attendant une requête qui pourrait s’en servir.',
		'Dans PostgreSQL, chaque connexion est un processus complet du système, donc multiplier la limite par dix lancerait des centaines de processus de plus. La réponse habituelle est un pooler comme PgBouncer : des centaines de clients lui parlent, et il partage quelques vraies connexions entre eux. **Son mode de pooling décide quelles fonctionnalités de session marchent encore.**'
	],
	terms: [
		{ term: 'Processus backend', def: 'Le processus serveur que PostgreSQL démarre pour une connexion. Il vit aussi longtemps que la connexion et garde l’état de cette session.' },
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
				note: 'Sans pooler, le postmaster démarre un nouveau processus backend pour chaque nouvelle connexion. Une fois les 100 places épuisées, il refuse la connexion suivante dès l’authentification avec « too many clients already ». La plupart des connexions acceptées restent inactives.'
			},
			{
				add: ['app -->|"800 connexions clientes"| pgb["PgBouncer"]', 'pgb -->|"20 connexions serveur"| be'],
				highlight: ['pgb'],
				note: 'Avec un pooler devant, les clients se connectent à PgBouncer à la place. Il est léger (sa doc parle de 2 kB par connexion par défaut), tient des centaines de connexions clientes, et garde un petit pool de vraies connexions : `default_pool_size` vaut 20 par couple utilisateur et base.'
			},
			{
				add: ['sess["Mode session : une connexion serveur par client, jusqu’à sa déconnexion"] -.-> pgb'],
				highlight: ['sess'],
				note: 'Le mode session est le mode par défaut, et il supporte toutes les fonctionnalités. Mais les pools de l’appli gardent leurs connexions ouvertes toute la journée, donc chacune bloque toujours une connexion serveur. 800 clients demanderaient 800 connexions serveur.'
			},
			{
				add: ['tx["Mode transaction : connexion serveur rendue au pool au COMMIT"] --> pgb'],
				highlight: ['tx'],
				note: 'En mode transaction, un client ne tient une connexion serveur que pendant qu’une transaction tourne. Les requêtes qui passent l’essentiel de leur temps hors de la base la laissent libre. 800 clients peuvent partager 20 connexions si, à tout moment, au plus 20 sont dans une transaction.'
			},
			{
				add: ['tx -->|"SET, LISTEN, verrous consultatifs, PREPARE"| lost["L’état de session reste sur la connexion qui l’a lancé"]'],
				highlight: ['lost'],
				note: 'En mode transaction, la transaction suivante peut tourner sur une autre connexion serveur. Un `SET statement_timeout` d’une transaction précédente peut ne pas s’appliquer, un `LISTEN` n’entend rien, et un verrou consultatif de session peut être libéré depuis la mauvaise connexion, ou jamais.'
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
			'Les lignes 2 à 16 lisent le paquet ReadyForQuery, que PostgreSQL envoie après chaque requête avec un octet d’état. D’après la [doc du protocole](https://www.postgresql.org/docs/current/protocol-message-formats.html), cet octet vaut `I` hors transaction, `T` dans une transaction et `E` dans une transaction en échec. Seul `I`, ligne 9, marque la connexion serveur `ready`.',
			'Les lignes 11 à 13 gèrent le mode statement : si l’état n’est pas idle, PgBouncer coupe la connexion avec « transaction blocks not allowed in statement pooling mode ». La [doc de configuration](' + CONFIG + '#pool_mode) résume les trois modes : PgBouncer rend la connexion après la déconnexion du client, après la fin de la transaction, ou après la fin de la requête.',
			'Les lignes 22 à 35 tournent une fois la réponse envoyée. Un serveur prêt est [libéré](' + PGB + '#L888-L914) sauf si le pool est en mode session (ligne 27). En mode session, il reste lié à son client jusqu’à la déconnexion, et `server_reset_query` (par défaut `DISCARD ALL`) le nettoie avant le client suivant.',
			'En mode transaction, PgBouncer ne lance aucune requête de reset. D’après la doc, les clients ne doivent alors utiliser aucune fonctionnalité de session, car chaque transaction atterrit sur une autre connexion avec un autre état de session. Les prepared statements du protocole marchent si [`max_prepared_statements`](' + CONFIG + '#max_prepared_statements) n’est pas nul, mais PgBouncer transmet tels quels à Postgres les `PREPARE`, `EXECUTE` et `DEALLOCATE` SQL.',
			'Les migrations Rails prennent un verrou de session avec [`pg_try_advisory_lock`](' + RAILS + '/postgresql_adapter.rb#L559-L571) et le libèrent avec `pg_advisory_unlock`. À travers un pooler en mode transaction, les deux appels peuvent arriver sur des connexions serveur différentes. Rails a un réglage `advisory_locks` pour désactiver ce verrou dans ce cas.'
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
			'PgBouncer ajoute un saut réseau et un service que tu dois faire tourner, surveiller et basculer. Si PgBouncer tombe, chaque client perd la base.',
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
		],
		steps: [
			{
				title: 'Compte les connexions clientes',
				questions: [
					{ q: 'Combien de connexions les pods web peuvent-ils ouvrir ?', options: ['40', '160', '20', '32'], answer: 1, why: '8 pods × 4 processus × un pool de 5, ça fait 160.' },
					{ q: 'Et les pods de workers ?', options: ['13', '10', '30', '300'], answer: 2, why: '3 pods × un pool de 10, ça fait 30.' },
					{ q: 'Combien de places l’utilisateur ordinaire de l’appli peut-il avoir, avec `max_connections = 100` ?', options: ['97', '100', '103', '90'], answer: 0, why: 'Trois places sont réservées aux superutilisateurs par défaut, donc les utilisateurs ordinaires ont 100 moins 3.' },
					{ q: 'Les 190 connexions possibles tiennent-elles ?', options: ['Oui, puisque la plupart sont inactives', 'Oui, PostgreSQL met les connexions en trop en file', 'Seulement après un redémarrage', 'Non : une fois les pools remplis, les connexions sont refusées'], answer: 3, why: '190, c’est presque le double des 97 places. Le serveur refuse les connexions en trop au lieu de les mettre en file.' }
				]
			},
			{
				title: 'Dimensionne derrière PgBouncer',
				questions: [
					{ q: 'Avec le mode transaction et `default_pool_size = 20`, combien de connexions serveur servent l’utilisateur et la base de l’appli ?', options: ['20', '190', '97', '100'], answer: 0, why: 'La taille de pool est par paire utilisateur et base. Les 190 clients partagent ces 20.' },
					{ q: 'Quand est-ce que ça marche ?', options: ['Toujours : PgBouncer multiplexe les requêtes sur une connexion', 'Seulement si les clients se connectent un par un', 'Tant qu’au plus 20 transactions tournent au même moment', 'Seulement en mode session'], answer: 2, why: 'Un client ne tient une connexion serveur que pendant sa transaction. Les requêtes qui passent l’essentiel de leur temps hors de la base la laissent libre.' },
					{ q: 'Une 21e transaction démarre pendant que 20 tournent. Que lui arrive-t-il ?', options: ['PostgreSQL refuse la connexion', 'Elle attend dans la file de PgBouncer', 'PgBouncer ouvre une 21e connexion serveur', 'Elle tourne sur une connexion déjà en transaction'], answer: 1, why: 'Le pooler met les clients en file quand toutes les connexions serveur sont occupées, au lieu que la base les refuse.' },
					{ q: 'Pourquoi ne pas utiliser le mode session avec les mêmes 190 clients ?', options: ['Le mode session ne fait pas tourner Rails', 'Le mode session perd les valeurs de `SET`', 'Le mode session est plus lent par requête', 'Les pools d’appli restent connectés, donc chaque client bloque une connexion serveur'], answer: 3, why: 'En mode session, une connexion serveur ne revient au pool que quand le client se déconnecte. Les pools d’appli le font rarement.' }
				]
			},
			{
				title: 'Trouve ce qui casse en mode transaction',
				questions: [
					{ q: 'Pourquoi les migrations Rails sont-elles à risque derrière un pooler en mode transaction ?', options: ['Elles prennent un verrou consultatif de session, et le déverrouillage peut atteindre une autre connexion serveur', 'Elles lancent du DDL, que PgBouncer refuse', 'Elles ont besoin d’une place superutilisateur', 'Elles ouvrent plus de 20 connexions'], answer: 0, why: '`pg_try_advisory_lock` et `pg_advisory_unlock` sont deux appels séparés. En mode transaction, ils peuvent arriver sur des connexions serveur différentes.' },
					{ q: 'Rails utilise par défaut les prepared statements du protocole. Que vérifies-tu dans PgBouncer ?', options: ['Que `pool_mode` vaut `statement`', 'Que `server_reset_query` vaut `DISCARD ALL`', 'Que `default_pool_size` dépasse 100', 'Que `max_prepared_statements` est au-dessus de zéro'], answer: 3, why: 'PgBouncer ne suit les prepared statements du protocole que si ce réglage n’est pas nul. Sinon, coupe-les dans Rails.' },
					{ q: 'Une requête lance `SET search_path = tenant_42` hors transaction. Qu’est-ce qui peut mal tourner ?', options: ['PgBouncer rejette le SET', 'La transaction suivante peut tourner sur une connexion serveur qui ne l’a jamais vu, et un autre client peut en hériter', 'PostgreSQL le remet à zéro après chaque requête', 'Rien : SET dure toute la session du client'], answer: 1, why: 'SET modifie la connexion serveur, pas le client. Le mode transaction ne lance aucune requête de reset entre clients.' },
					{ q: 'Un worker lance `LISTEN jobs` à travers PgBouncer en mode transaction. Qu’entend-il ?', options: ['Chaque NOTIFY, comme une connexion directe', 'Seulement les NOTIFY de ses propres transactions', 'Peut-être rien : le LISTEN reste sur la connexion serveur qui l’a lancé', 'Une erreur au prochain COMMIT'], answer: 2, why: '`LISTEN` est un état de session. Le tableau des fonctionnalités de PgBouncer le marque « Never » en mode transaction.' }
				]
			},
			{
				title: 'Corrige chacune',
				questions: [
					{ q: 'Comment corriges-tu les migrations ?', options: ['Mettre `advisory_locks: false`, ou lancer les migrations par une connexion directe', 'Monter `default_pool_size` à 100', 'Lancer les migrations deux fois', 'Passer PgBouncer en mode statement'], answer: 0, why: 'Rails a un réglage `advisory_locks` pour exactement ce cas. Une connexion directe garde le verrou sur une seule session.' },
					{ q: 'Comment poser un `statement_timeout` par requête sans risque ?', options: ['`SET statement_timeout` une fois au démarrage', '`SET SESSION statement_timeout` avant chaque requête', '`ALTER SYSTEM SET statement_timeout`', '`SET LOCAL statement_timeout` dans la transaction'], answer: 3, why: '`SET LOCAL` se termine avec la transaction, donc il ne fuit jamais vers le client suivant sur cette connexion serveur.' },
					{ q: 'Où vont les listeners ?', options: ['À travers le même pool en mode transaction, avec un `default_pool_size` plus grand', 'À travers PgBouncer avec `max_prepared_statements` réglé', 'Sur une connexion directe à PostgreSQL', 'Sur un réplica en lecture'], answer: 2, why: 'Un listener a besoin d’une connexion qui reste la sienne. Le notifier Postgres d’Oban prévient qu’il ne marche pas à travers un pooler en mode transaction.' },
					{ q: 'Quelle partie de la pile doit maintenant avoir du sens par rapport à `max_connections` ?', options: ['Seulement les pools d’appli', 'Chaque couche : pools d’appli, puis pools de PgBouncer, puis `max_connections`', 'Seulement `max_client_conn` de PgBouncer', 'Aucune : PgBouncer s’en charge'], answer: 1, why: 'Les pools s’empilent. Les connexions serveur de PgBouncer, plus les connexions directes, doivent encore tenir dans les places du serveur.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Épuiser les places de connexion d’un tout petit serveur, puis laisser PgBouncer partager une connexion entre dix clients et voir un `SET` fuir de l’un à l’autre.',
		steps: [
			'Crée un réseau et un serveur avec seulement 10 places : `docker network create dojo-net` puis `docker run -d --name dojo-pg --network dojo-net -e POSTGRES_PASSWORD=dojo postgres:17 -c max_connections=10`. Attends que `docker exec dojo-pg pg_isready` affiche `accepting connections`.',
			'Crée un utilisateur d’appli ordinaire : `docker exec dojo-pg psql -U postgres -c "CREATE ROLE app LOGIN PASSWORD \'app\';"`',
			'Remplis les places : `for i in 1 2 3 4 5 6 7; do docker exec -d dojo-pg psql postgres://app:app@localhost/postgres -c "SELECT pg_sleep(60)"; done`. Puis essaie une de plus : `docker exec dojo-pg psql postgres://app:app@localhost/postgres -c "SELECT 1"`, et la même en superutilisateur : `docker exec dojo-pg psql -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE usename = \'app\'"`.',
			'Attends une minute que les sleeps finissent. Lance PgBouncer en mode transaction avec un pool d’une connexion : `docker run -d --name dojo-pgb --network dojo-net -e DATABASE_URL=postgres://app:app@dojo-pg:5432/postgres -e POOL_MODE=transaction -e DEFAULT_POOL_SIZE=1 -e AUTH_TYPE=scram-sha-256 edoburu/pgbouncer:v1.26.1-p0`',
			'Envoie dix clients à travers lui en même temps : `for i in 1 2 3 4 5 6 7 8 9 10; do docker exec dojo-pg psql postgres://app:app@dojo-pgb:5432/postgres -c "SELECT pg_sleep(1)" & done; wait`. Puis relance le comptage `pg_stat_activity` de l’étape 3.',
			'Fais fuir un réglage. Client un : `docker exec dojo-pg psql postgres://app:app@dojo-pgb:5432/postgres -c "SELECT pg_backend_pid()" -c "SET statement_timeout = \'2s\'"`. Client deux : `docker exec dojo-pg psql postgres://app:app@dojo-pgb:5432/postgres -c "SELECT pg_backend_pid()" -c "SHOW statement_timeout" -c "SELECT pg_sleep(3)"`.',
			'Corrige. Annule la fuite : `docker exec dojo-pg psql postgres://app:app@dojo-pgb:5432/postgres -c "RESET statement_timeout"`. Pose le timeout dans une seule transaction : `docker exec dojo-pg psql postgres://app:app@dojo-pgb:5432/postgres -c "BEGIN" -c "SET LOCAL statement_timeout = \'2s\'" -c "SELECT pg_sleep(3)" -c "COMMIT"`. Puis un nouveau client : `docker exec dojo-pg psql postgres://app:app@dojo-pgb:5432/postgres -c "SHOW statement_timeout"`.'
		],
		done: [
			'À l’étape 3, la huitième connexion `app` échoue avec `remaining connection slots are reserved for roles with the SUPERUSER attribute`, et le superutilisateur entre quand même et compte 7.',
			'À l’étape 5, les dix clients finissent, certains après `client being queued`, et le comptage montre 1 connexion `app`.',
			'À l’étape 6, les deux clients affichent le même pid de backend. Le client deux montre `2s` et son sleep échoue avec `canceling statement due to statement timeout`.',
			'À l’étape 7, le sleep sous `SET LOCAL` est annulé, et le client suivant montre `statement_timeout` à `0`.'
		],
		solution: [
			'Avec `max_connections = 10`, trois places sont gardées pour les superutilisateurs, donc les utilisateurs ordinaires en ont 7. Le serveur refuse la huitième connexion ; il ne la met jamais en file.',
			'PgBouncer met les clients en file et leur passe son unique connexion serveur une transaction à la fois. Dix clients coûtent un seul processus au serveur.',
			'Le client deux a tourné sur la connexion serveur que le client un avait modifiée. Le mode transaction ne lance aucune requête de reset entre clients, donc l’état de session voyage vers le suivant.',
			'`SET LOCAL` se termine avec sa transaction, donc il ne peut pas fuir. Nettoie avec `docker rm -f dojo-pgb dojo-pg` et `docker network rm dojo-net`.'
		]
	},
	recall: {
		q: '40 pods avec 4 processus et un pool de 5 chacun ouvrent 800 connexions face à `max_connections = 100`. Qu’est-ce qui règle le problème, et sur quoi le code ne doit-il plus compter ?',
		a: 'PgBouncer en mode transaction, qui partage environ 20 connexions serveur entre les 800 clients. Le code ne doit plus garder d’état de session d’une transaction à l’autre : `SET`, `LISTEN`, verrous consultatifs de session, `PREPARE` SQL.'
	},
	sources: [
		{ title: 'Rails, abstract_adapter.rb: the advisory_locks setting', url: `${RAILS}/abstract_adapter.rb#L253-L254` },
		{ title: 'PostgreSQL docs, How Connections Are Established', url: 'https://www.postgresql.org/docs/current/connect-estab.html' },
		{ title: 'PostgreSQL docs, Connections and Authentication settings', url: 'https://www.postgresql.org/docs/current/runtime-config-connection.html' },
		{ title: 'PgBouncer, Features and SQL feature map for pooling modes', url: 'https://www.pgbouncer.org/features.html' },
		{ title: 'PgBouncer, Configuration', url: CONFIG }
	]
};
