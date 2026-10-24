const OBAN = 'https://github.com/oban-bg/oban/blob/0704bf0018bfc915560998fbdfb899dd508f5aff/lib/oban';
const BASIC = `${OBAN}/engines/basic.ex`;
const PGSRC = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/src/backend/optimizer/plan/subselect.c?plain=1';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'job-queue',
	part: 'Plusieurs à la fois',
	title: 'Une file de jobs dans la base',
	minutes: 10,
	hook: [
		'Tu envoies les emails de bienvenue depuis un job en arrière-plan. Tu lances un second worker pour aller plus vite, et **chaque nouvel utilisateur reçoit maintenant deux emails**. Les deux workers ont lancé `SELECT ... WHERE state = \'available\' LIMIT 1` et ont eu la même ligne.',
		'Alors tu ajoutes `FOR UPDATE`. Les doublons s’arrêtent, mais **le second worker attend maintenant le verrou du premier** au lieu de prendre le job suivant. Avec dix workers, un seul travaille et les neuf autres attendent son verrou.',
		'PostgreSQL a une clause faite pour ça : `FOR UPDATE SKIP LOCKED`. **Chaque worker verrouille les jobs qu’il peut prendre tout de suite et passe à côté de ceux qu’un autre worker tient.** Oban, River et solid_queue s’en servent pour faire tourner une file de jobs dans la base que tu as déjà.'
	],
	terms: [
		{ term: 'SKIP LOCKED', def: 'Une option de verrouillage pour SELECT : les lignes qu’une autre transaction a verrouillées sont laissées hors du résultat au lieu d’être attendues.' },
		{ term: 'Prise en charge', def: 'Faire passer un job de `available` à `executing` et noter qui l’a pris, dans une transaction courte, pour qu’aucun autre worker ne le prenne.' },
		{ term: 'Sauvetage', def: 'Remettre un job en `available` quand son worker est mort pendant qu’il était `executing`. On le trouve à son âge : il tourne depuis bien trop longtemps.' },
		{ term: 'Mise en file transactionnelle', def: 'Insérer le job dans la même transaction que les données qu’il concerne. Si la transaction est annulée, le job n’a jamais existé.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['jobs[("oban_jobs : 1, 2, 3, 4 disponibles")]', 'w1["Worker A : SELECT ... LIMIT 2 FOR UPDATE SKIP LOCKED"] -->|"verrouille 1, 2"| jobs'],
				highlight: ['w1', 'jobs'],
				note: 'Le worker A demande deux jobs disponibles par ordre de priorité et les verrouille. Dans la même transaction, il les passe en `executing`, ajoute un à `attempt`, et valide. Le verrou dure quelques millisecondes, pas la durée du job.'
			},
			{
				add: ['w2["Worker B : même requête, au même moment"] -->|"saute 1, 2, verrouille 3, 4"| jobs'],
				highlight: ['w2'],
				note: 'Le worker B n’attend pas. Les lignes 1 et 2 sont verrouillées par A, donc SKIP LOCKED les laisse de côté et B obtient 3 et 4. Sans SKIP LOCKED, B bloquerait sur la ligne 1 jusqu’au commit de A, puis la trouverait plus `available`.'
			},
			{
				add: ['w1 -->|"UPDATE state = completed"| done["Job terminé"]', 'w2 -.->|"plante en pleine exécution"| stuck["Job 3 coincé en executing"]'],
				highlight: ['done', 'stuck'],
				note: 'A marque ses jobs `completed` avec un UPDATE de plus. Le processus de B meurt en plein job. Le job 3 n’est plus verrouillé (la prise en charge est déjà validée), mais il dit toujours `executing`, donc personne ne le prendra.'
			},
			{
				add: ['res["Sauvetage : executing et attempted_at plus vieux que la limite"] --> stuck', 'stuck -->|"retour en available"| jobs'],
				highlight: ['res'],
				note: 'Une requête de sauvetage périodique trouve les jobs `executing` depuis trop longtemps et les remet en `available`, ou en `discarded` s’ils ont épuisé leurs essais. Le job 3 peut alors tourner une seconde fois, donc un job doit être idempotent (jour 23).'
			},
			{
				add: ['ins["Appli : INSERT du job + NOTIFY, puis COMMIT"] -->|"réveil"| w1'],
				highlight: ['ins'],
				note: 'Les workers n’ont pas besoin d’interroger la table chaque seconde. L’appli peut lancer `NOTIFY` quand elle insère un job, et les workers inactifs qui ont lancé `LISTEN` se réveillent tout de suite. PostgreSQL ne livre le message qu’au commit de la transaction qui insère, donc un worker ne se réveille jamais pour un job annulé.'
			}
		]
	},
	example: {
		title: 'lib/oban/engines/basic.ex : comment un worker Oban prend des jobs',
		repo: 'oban-bg/oban',
		url: `${BASIC}#L107-L144`,
		lang: 'elixir',
		code: `  def fetch_jobs(%Config{} = conf, %{} = meta, running) do
    demand = meta.limit - map_size(running)

    subset_query =
      Job
      |> select([:id])
      |> where([j], j.state == "available")
      |> where([j], j.queue == ^meta.queue)
      |> order_by(asc: :priority, asc: :scheduled_at, asc: :id)
      |> limit(^demand)
      |> lock("FOR UPDATE SKIP LOCKED")

    # The Postgres planner may choose to generate a plan that executes a nested loop over the
    # LIMITing subquery, causing more UPDATEs than LIMIT. That could cause unexpected updates,
    # including attempts > max_attempts in some cases. The solution is to use a CTE as an
    # "optimization fence" that forces Postgres _not_ to optimize the query.
    #
    # The odd "subset" fragment is required to prevent Ecto from applying the prefix to the name
    # of the CTE, e.g. "public"."subset".
    query =
      Job
      |> with_cte("subset", as: ^subset_query)
      |> join(:inner, [j], x in fragment(~s("subset")), on: true)
      |> where([j, x], j.id == x.id)
      |> where([j, _], j.attempt < j.max_attempts)
      |> select([j, _], j)

    updates = [
      set: [state: "executing", attempted_at: utc_now(), attempted_by: [meta.node, meta.uuid]],
      inc: [attempt: 1]
    ]

    Repo.transaction(conf, fn ->
      {_count, jobs} = Repo.update_all(conf, query, updates)

      {meta, jobs}
    end)
  end`,
		notes: [
			'La ligne 2 calcule `demand` : la limite de la file moins les jobs qui tournent déjà sur ce nœud. Les lignes 4 à 11 en demandent exactement autant, par ordre de priorité, et les verrouillent avec `FOR UPDATE SKIP LOCKED`. La [doc de SELECT](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE) cite cet usage : SKIP LOCKED évite la contention entre plusieurs consommateurs d’une table en forme de file.',
			'Les lignes 28 à 34 prennent les jobs en un seul UPDATE : il remplit `state`, `attempted_at` et `attempted_by`, et ajoute un à `attempt`, pour les ids que renvoie le CTE. La transaction se termine juste après, ligne 37. Le verrou de ligne ne servait qu’à empêcher deux workers de prendre le même job. Ensuite, l’état `executing` dit à qui il appartient.',
			'Les lignes 13 à 16 expliquent le CTE : une boucle imbriquée pourrait lancer la sous-requête LIMIT plus d’une fois et mettre à jour plus de lignes que demandé. PostgreSQL n’intègre jamais un CTE qui verrouille des lignes : [`contain_dml`](' + PGSRC + '#L1070-L1097) considère qu’un SELECT avec `FOR UPDATE` a des effets de bord, et la vérification d’intégration les refuse. PostgreSQL calcule alors le sous-ensemble une seule fois.',
			'[`rescue_jobs`](' + BASIC + '#L194-L214) repère les workers plantés à l’âge de leurs jobs : il cherche `state == "executing" and attempted_at < cut`. Les jobs qui ont encore des essais repassent en `available` ; il met les autres en `discarded`. Un job peut donc tourner deux fois : une fois dans le worker planté, une fois après le sauvetage.',
			'Le [notifier Postgres](' + OBAN + '/notifiers/postgres.ex#L6-L11) d’Oban prévient qu’il ne marche pas derrière un pooler comme PgBouncer en mode transaction ou statement (jour 25). La doc de NOTIFY ajoute qu’un payload doit faire moins de 8000 octets par défaut.'
		]
	},
	tradeoff: {
		gain: [
			'Tu ne fais tourner aucun broker à part : la file est dans la base que tu as déjà, avec ses sauvegardes et son failover.',
			'Mise en file transactionnelle : insère la commande et son job « envoyer le reçu » dans une seule transaction. Soit les deux existent, soit aucun, donc pas d’email pour une commande annulée.',
			'Chaque job est une ligne, donc tu peux interroger les jobs, les compter par état, les relancer avec un UPDATE, et les joindre à tes propres tables pour déboguer.'
		],
		cost: [
			'Chaque job, c’est au moins un insert et deux updates, et chaque update laisse une ligne morte (jour 16). Une table de file chargée a besoin qu’autovacuum suive, sinon les parcours ralentissent.',
			'Chaque prise en charge et chaque update passent par un seul primaire, qui plafonne le débit. Un broker conçu pour les flux passe à l’échelle autrement dès qu’il te faut des débits très élevés ou beaucoup de consommateurs par message.',
			'Une transaction longue n’importe où dans la base retient vacuum, donc la table de file gonfle même si la file elle-même va bien.',
			'Un job tourne au moins une fois, et parfois deux : un job sauvé peut avoir déjà fait une partie de son travail. Les jobs doivent être idempotents (jour 23).'
		]
	},
	task: {
		prompt: 'Dans `psql`, crée `jobs(id bigserial primary key, state text not null default \'available\', attempted_at timestamptz, attempt int not null default 0)` et insère 4 lignes. Ouvre deux sessions. Dans chacune, lance `BEGIN;` puis une requête qui prend jusqu’à 2 jobs disponibles sans attendre l’autre session. Écris la requête, dis quels ids chaque session obtient, et ce qui change si tu enlèves `SKIP LOCKED`.',
		hint: 'Verrouille les lignes dans un CTE avec `ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED`, puis fais un UPDATE des jobs dont l’id y figure, avec `RETURNING id`.',
		answer: [
			'`WITH next AS (SELECT id FROM jobs WHERE state = \'available\' ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED) UPDATE jobs SET state = \'executing\', attempted_at = now(), attempt = attempt + 1 FROM next WHERE jobs.id = next.id RETURNING jobs.id;`',
			'La session A (toujours dans sa transaction) obtient les ids 1 et 2. La session B obtient 3 et 4 tout de suite : les lignes 1 et 2 sont verrouillées par A, donc elles sont sautées.',
			'Sans `SKIP LOCKED`, la session B bloque sur la ligne 1 jusqu’au commit ou au rollback de A. Si A valide, B revérifie sa clause WHERE sur les nouvelles versions des lignes (jour 21), trouve `executing`, et écarte les lignes 1 et 2. Le LIMIT est au-dessus de l’étape de verrouillage dans le plan, donc il continue à tirer des lignes et B finit avec 3 et 4, seulement plus tard.',
			'Dans un vrai worker, fais `COMMIT` juste après la prise en charge. Le job tourne hors de la transaction, et c’est l’état `executing` plus `attempted_at` que regarde une requête de sauvetage.'
		],
		steps: [
			{
				title: 'Écris la requête de prise en charge',
				questions: [
					{ q: 'Comment chaque session sait-elle quels ids elle a pris ?', options: ['Un second `SELECT id FROM jobs WHERE state = \'executing\'`', '`SELECT lastval();` après l’UPDATE', 'Elle les lit dans le CTE après le COMMIT', '`RETURNING jobs.id` à la fin de l’UPDATE'], answer: 3, why: 'RETURNING renvoie exactement les lignes que cet UPDATE a prises. Un SELECT ultérieur sur `executing` listerait aussi les jobs de l’autre session.' },
					{ q: 'Où va le SELECT qui verrouille ?', options: ['Dans un CTE, `WITH next AS (SELECT id ... LIMIT 2 FOR UPDATE SKIP LOCKED)`, joint par l’UPDATE', 'Après l’UPDATE, pour vérifier ce qu’il a changé', 'Dans une transaction à part, avant l’UPDATE', 'Nulle part : un UPDATE avec `LIMIT 2` suffit'], answer: 0, why: 'Le CTE choisit et verrouille les ids, et l’UPDATE prend exactement ces lignes dans la même instruction.' },
					{ q: 'Pourquoi Oban met-il la sous-requête qui verrouille dans un CTE ?', options: ['Un CTE tourne plus vite qu’une sous-requête', 'Ecto ne sait pas construire une sous-requête avec un verrou', 'PostgreSQL n’intègre jamais un CTE qui verrouille des lignes, donc le LIMIT tourne une seule fois', 'Un CTE garde ses verrous après le COMMIT'], answer: 2, why: 'Une boucle imbriquée pourrait lancer la sous-requête avec LIMIT plusieurs fois et mettre à jour plus de lignes que demandé. Un CTE qui verrouille est calculé une seule fois.' },
					{ q: 'Que met l’UPDATE sur chaque job pris ?', options: ['`state = \'completed\'`', '`state = \'executing\'`, `attempted_at = now()`, `attempt = attempt + 1`', '`state = \'available\'` et `attempt = 0`', 'Seulement `attempted_at = now()`'], answer: 1, why: 'L’état dit à qui est le job une fois le verrou parti, et `attempted_at` est ce que lit la requête de sauvetage.' }
				]
			},
			{
				title: 'Dis quels ids chaque session obtient',
				questions: [
					{ q: 'La session A lance `BEGIN;` et la prise en charge, et reste dans sa transaction. Quels ids obtient-elle ?', options: ['1 et 2', '1 seulement', 'Les quatre', '3 et 4'], answer: 0, why: '`ORDER BY id LIMIT 2` prend les deux plus petits ids disponibles.' },
					{ q: 'La session B lance la même prise en charge pendant que A est ouverte. Que se passe-t-il ?', options: ['B attend le commit de A', 'B obtient aussi 1 et 2', 'B reçoit une erreur disant que les lignes sont verrouillées', 'B obtient 3 et 4 tout de suite'], answer: 3, why: 'Les lignes 1 et 2 sont verrouillées par A, donc SKIP LOCKED passe à côté et prend les lignes disponibles suivantes.' },
					{ q: 'Une troisième session lance la prise en charge pendant que A et B sont ouvertes. Qu’obtient-elle ?', options: ['Les ids 1 et 2 encore', 'Aucune ligne', 'Une erreur', 'Elle attend A'], answer: 1, why: 'Chaque ligne disponible est verrouillée par A ou B, donc les quatre sont sautées. Le worker repassera plus tard.' },
					{ q: 'B avait utilisé `FOR UPDATE NOWAIT` à la place. Qu’obtiendrait-elle ?', options: ['Les ids 3 et 4', 'Une attente sur la ligne 1', 'Une erreur, parce que la ligne 1 est verrouillée', 'Aucune ligne et aucune erreur'], answer: 2, why: 'NOWAIT lève une erreur dès qu’une ligne dont il a besoin est verrouillée. Seul SKIP LOCKED passe à la suite.' }
				]
			},
			{
				title: 'Enlève SKIP LOCKED',
				questions: [
					{ q: 'B lance la prise en charge avec `FOR UPDATE` tout court pendant que A est ouverte. Que se passe-t-il d’abord ?', options: ['B obtient 3 et 4 tout de suite', 'B obtient aussi 1 et 2', 'B reçoit une erreur', 'B bloque sur la ligne 1 jusqu’au commit ou au rollback de A'], answer: 3, why: 'FOR UPDATE tout court attend que le détenteur du verrou finisse.' },
					{ q: 'A valide. Que fait B des lignes 1 et 2 ?', options: ['Elle revérifie le WHERE sur les nouvelles versions des lignes, trouve `executing`, et les écarte', 'Elle les prend une seconde fois', 'Elle lève une erreur de sérialisation', 'Elle les renvoie avec leur ancien état'], answer: 0, why: 'En Read Committed, une instruction qui attendait réévalue son WHERE sur la ligne mise à jour (jour 21).' },
					{ q: 'Avec quels ids B finit-elle ?', options: ['Aucun', '1 et 2', '3 et 4, seulement plus tard', '3 seulement'], answer: 2, why: 'Le LIMIT est au-dessus de l’étape de verrouillage dans le plan, donc il continue à tirer des lignes jusqu’à en avoir deux.' },
					{ q: 'Avec dix workers et `FOR UPDATE` tout court, à quoi ressemble la file ?', options: ['Dix workers font chacun un job', 'Un worker travaille et neuf attendent son verrou', 'Chaque worker fait le même job', 'PostgreSQL répartit les jobs également'], answer: 1, why: 'Chaque worker bloque sur la première ligne que les autres tiennent. SKIP LOCKED est ce qui les laisse tourner côte à côte.' }
				]
			},
			{
				title: 'Termine comme un vrai worker',
				questions: [
					{ q: 'Le worker de la session A a validé la prise en charge et fini le job 1. Qu’est-ce qui marque le job comme fait ?', options: ['Rien : le COMMIT de la prise en charge l’a déjà fait', 'Un nouvel `UPDATE jobs SET state = \'completed\' WHERE id = 1`, court', 'Un `ROLLBACK`, qui lâche la ligne', 'Un autre `FOR UPDATE SKIP LOCKED` sur la ligne 1'], answer: 1, why: 'La prise en charge a seulement passé le job en `executing`. Le terminer, c’est un UPDATE de plus, dans sa propre transaction.' },
					{ q: 'Chaque job coûte un insert, un UPDATE de prise en charge et un UPDATE de fin. Qu’est-ce que ça fait à la table `jobs` avec le temps ?', options: ['Rien : les UPDATE réécrivent les lignes sur place', 'La table rétrécit à mesure que les jobs finissent', 'Chaque UPDATE laisse une ligne morte, donc autovacuum doit suivre', 'PostgreSQL déplace les jobs finis dans une table d’historique'], answer: 2, why: 'Un UPDATE écrit une nouvelle version de la ligne (jour 16). Une table de file chargée gonfle et ses parcours ralentissent si vacuum prend du retard.' },
					{ q: 'Un worker meurt pendant que le job 3 dit `executing`. Comment retrouve-t-on le job ?', options: ['Une requête de sauvetage cherche les jobs `executing` dont `attempted_at` est plus vieux qu’une limite', 'PostgreSQL lâche le verrou de ligne et le job repasse en `available`', 'La prochaine prise en charge le récupère toute seule', 'Le redémarrage du worker rejoue sa transaction'], answer: 0, why: 'La prise en charge est déjà validée, donc il ne reste aucun verrou. Seul l’âge de `attempted_at` montre que le worker a disparu.' },
					{ q: 'Pourquoi un job sauvé doit-il être idempotent ?', options: ['La requête de sauvetage le lance deux fois exprès', 'Il a peut-être déjà fait une partie de son travail avant le plantage', 'PostgreSQL rejoue la dernière transaction du job', 'Le compteur `attempt` revient à zéro'], answer: 1, why: 'Un job tourne au moins une fois, et parfois deux. Le relancer doit être sans risque (jour 23).' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Deux workers lancent `SELECT id FROM jobs WHERE state = \'available\' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED` au même moment. Qu’obtiennent-ils ?',
			options: [
				'Le même job, parce que les deux instructions ont démarré avant tout commit',
				'Des jobs différents : le second saute la ligne que le premier a verrouillée',
				'L’un obtient un job et l’autre une erreur disant que la ligne est verrouillée',
				'L’un obtient un job et l’autre attend la fin de cette première transaction'
			],
			answer: 1,
			why: 'SKIP LOCKED laisse de côté les lignes qu’une autre transaction tient, donc le second worker obtient le job disponible suivant. L’erreur, c’est NOWAIT ; l’attente, c’est FOR UPDATE tout court.'
		},
		{
			q: 'Pourquoi les bibliothèques de files valident-elles la prise en charge tout de suite au lieu de garder le verrou de ligne jusqu’à la fin du job ?',
			options: [
				'PostgreSQL annule tout verrou de ligne tenu plus de quelques secondes',
				'Un verrou de ligne tenu ferait attendre chaque autre worker sur ce job',
				'Une longue transaction ouverte bloque une connexion et retient vacuum',
				'Les messages NOTIFY sont perdus tant que l’émetteur tient un verrou'
			],
			answer: 2,
			why: 'Avec SKIP LOCKED, les autres workers n’attendraient pas, donc ce n’est pas la raison. Un job peut tourner des minutes : une transaction ouverte pour chacun épuiserait les connexions et empêcherait vacuum de nettoyer les lignes mortes dans toute la base (jour 16).'
		},
		{
			q: 'Ton appli insère une commande et lance `NOTIFY jobs` dans une transaction, qui est ensuite annulée. Que voient les workers qui écoutent ?',
			options: [
				'La notification tout de suite, puis une ligne de job qui n’existe plus',
				'La notification seulement après un délai fixé par `max_notify_delay`',
				'La notification, mais avec un payload vide puisque les données ont disparu',
				'Rien, puisqu’un NOTIFY n’est livré que si sa transaction est validée'
			],
			answer: 3,
			why: 'La doc de NOTIFY dit que les événements « are not delivered until and unless the transaction is committed » (ne sont livrés que si la transaction est validée). Ça colle à la mise en file transactionnelle : un job annulé n’a jamais existé, et personne n’est réveillé pour lui.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Faire tourner deux workers sur une même table de jobs, voir SKIP LOCKED leur donner des jobs différents, puis sauver un job dont le worker est mort.',
		steps: [
			'Lance PostgreSQL : `docker run -d --name dojo-pg -e POSTGRES_PASSWORD=dojo postgres:17`. Attends que `docker exec dojo-pg pg_isready` affiche `accepting connections`. Ouvre deux terminaux, A et B, chacun avec `docker exec -it dojo-pg psql -U postgres`.',
			'Dans A : `CREATE TABLE jobs (id bigserial PRIMARY KEY, state text NOT NULL DEFAULT \'available\', attempted_at timestamptz, attempt int NOT NULL DEFAULT 0);` puis `INSERT INTO jobs (state) SELECT \'available\' FROM generate_series(1, 4);`',
			'Dans A, `BEGIN;` puis la prise en charge : `WITH next AS (SELECT id FROM jobs WHERE state = \'available\' ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED) UPDATE jobs SET state = \'executing\', attempted_at = now(), attempt = attempt + 1 FROM next WHERE jobs.id = next.id RETURNING jobs.id;`. Ne valide pas.',
			'Dans B, `BEGIN;` et la même prise en charge. Puis `ROLLBACK;` dans les deux.',
			'Refais l’étape 3 dans A. Dans B, envoie la même prise en charge sans `SKIP LOCKED` et sans BEGIN. Attends quelques secondes, puis `COMMIT;` dans A.',
			'Fais comme si tous les workers étaient morts. Attends 5 secondes, puis sauve : `UPDATE jobs SET state = \'available\' WHERE state = \'executing\' AND attempted_at < now() - interval \'5 seconds\' RETURNING id, attempt;`',
			'Réveille un worker : dans B, `LISTEN jobs;`. Dans A, `BEGIN; NOTIFY jobs, \'job 5\'; ROLLBACK;` puis `NOTIFY jobs, \'job 6\';`. Dans B, lance `SELECT 1;` après chacun.'
		],
		done: [
			'À l’étape 4, A a renvoyé les ids 1 et 2, et B a renvoyé 3 et 4 tout de suite.',
			'À l’étape 5, B reste bloquée jusqu’au commit de A, puis renvoie 3 et 4.',
			'À l’étape 6, le sauvetage renvoie les quatre ids avec `attempt` à 1.',
			'À l’étape 7, B affiche `Asynchronous notification "jobs" with payload "job 6"` et ne montre jamais `job 5`.'
		],
		solution: [
			'SKIP LOCKED laisse hors du résultat de B les lignes que A tient, donc B passe aux suivantes.',
			'Sans lui, B attend sur la ligne 1. Quand A valide, B revérifie son WHERE sur les nouvelles versions des lignes, trouve `executing`, écarte les lignes 1 et 2, et le LIMIT continue à tirer jusqu’à avoir 3 et 4.',
			'Le sauvetage trouve les workers morts à l’âge seulement : les prises en charge sont validées, donc il ne reste aucun verrou. Chaque job sauvé tournera une seconde fois, d’où le besoin de jobs idempotents.',
			'Un NOTIFY n’est livré que si sa transaction est validée, donc `job 5`, annulé, ne réveille personne. Nettoie avec `docker rm -f dojo-pg`.'
		]
	},
	recall: {
		q: 'Dix workers prennent des jobs dans la même table. Quelle clause laisse chacun prendre des jobs différents sans attendre, et combien de temps tient-il le verrou de ligne ?',
		a: '`FOR UPDATE SKIP LOCKED`. Le verrou ne dure que la courte transaction de prise en charge qui met `state = \'executing\'` ; le job tourne ensuite hors de toute transaction.'
	},
	sources: [
		{ title: 'PostgreSQL source, subselect.c: the CTE inlining check', url: `${PGSRC}#L960-L968` },
		{ title: 'PostgreSQL docs, SELECT: the locking clause', url: 'https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE' },
		{ title: 'PostgreSQL docs, NOTIFY', url: 'https://www.postgresql.org/docs/current/sql-notify.html' },
		{ title: 'Oban docs, Oban.Notifiers.Postgres', url: 'https://oban.hexdocs.pm/Oban.Notifiers.Postgres.html' }
	]
};
