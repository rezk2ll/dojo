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
		'Alors tu ajoutes `FOR UPDATE`. Les doublons s’arrêtent, mais **le second worker attend maintenant le verrou du premier** au lieu de prendre le job suivant. Dix workers deviennent un worker et neuf personnes qui font la queue.',
		'PostgreSQL a une clause faite pour ça : `FOR UPDATE SKIP LOCKED`. **Chaque worker verrouille les jobs qu’il peut prendre tout de suite et passe à côté de ceux qu’un autre worker tient.** C’est grâce à cette seule clause que des bibliothèques comme Oban, River et solid_queue font tourner une vraie file de jobs dans la base que tu as déjà.'
	],
	terms: [
		{ term: 'Ligne de job', def: 'Une unité de travail stockée comme une ligne : quoi lancer, ses arguments, un état (`available`, `executing`, `completed`), les essais et des horodatages.' },
		{ term: 'SKIP LOCKED', def: 'Une option de verrouillage pour SELECT : les lignes qu’une autre transaction a verrouillées sont laissées hors du résultat au lieu d’être attendues.' },
		{ term: 'Prise en charge', def: 'Faire passer un job de `available` à `executing` et noter qui l’a pris, dans une transaction courte, pour qu’aucun autre worker ne le prenne.' },
		{ term: 'Sauvetage', def: 'Remettre un job en `available` quand son worker est mort pendant qu’il était `executing`. On le trouve à son âge : il tourne depuis bien trop longtemps.' },
		{ term: 'LISTEN / NOTIFY', def: 'La messagerie intégrée de PostgreSQL. Une session qui a lancé `LISTEN chan` reçoit un message quand quelqu’un valide un `NOTIFY chan`.' },
		{ term: 'Mise en file transactionnelle', def: 'Insérer le job dans la même transaction que les données qu’il concerne. Si la transaction est annulée, le job n’a jamais existé.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['jobs[("oban_jobs : 1, 2, 3, 4 disponibles")]', 'w1["Worker A : SELECT ... LIMIT 2 FOR UPDATE SKIP LOCKED"] -->|"verrouille 1, 2"| jobs'],
				highlight: ['w1', 'jobs'],
				note: '**Le worker A prend ce dont il a besoin.** Il demande deux jobs disponibles par ordre de priorité et les verrouille. Dans la même transaction, il les passe en `executing`, ajoute un à `attempt`, et valide. Le verrou dure quelques millisecondes, pas la durée du job.'
			},
			{
				add: ['w2["Worker B : même requête, au même moment"] -->|"saute 1, 2, verrouille 3, 4"| jobs'],
				highlight: ['w2'],
				note: '**Le worker B n’attend pas.** Les lignes 1 et 2 sont verrouillées par A, donc SKIP LOCKED les laisse de côté et B obtient 3 et 4. Sans SKIP LOCKED, B bloquerait sur la ligne 1 jusqu’au commit de A, puis la trouverait plus `available`.'
			},
			{
				add: ['w1 -->|"UPDATE state = completed"| done["Job terminé"]', 'w2 -.->|"plante en pleine exécution"| stuck["Job 3 coincé en executing"]'],
				highlight: ['done', 'stuck'],
				note: '**Terminer, c’est un UPDATE de plus.** A marque ses jobs `completed`. Le processus de B meurt en plein job. Le job 3 n’est plus verrouillé (la prise en charge est déjà validée), mais il dit toujours `executing`, donc personne ne le prendra.'
			},
			{
				add: ['res["Sauvetage : executing et attempted_at plus vieux que la limite"] --> stuck', 'stuck -->|"retour en available"| jobs'],
				highlight: ['res'],
				note: '**Un balayeur le remet en place.** Une requête périodique trouve les jobs `executing` depuis trop longtemps et les remet en `available`, ou en `discarded` s’ils ont épuisé leurs essais. C’est pour ça qu’un job doit supporter de tourner deux fois (jour 23).'
			},
			{
				add: ['ins["Appli : INSERT du job + NOTIFY, puis COMMIT"] -->|"réveil"| w1'],
				highlight: ['ins'],
				note: '**Pas besoin d’interroger chaque seconde.** L’appli peut lancer `NOTIFY` quand elle insère un job, et les workers inactifs qui font `LISTEN` se réveillent tout de suite. PostgreSQL ne livre le message qu’au commit de la transaction qui insère, donc un worker ne se réveille jamais pour un job annulé.'
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
			'**Autant de jobs que de places libres.** `demand` est la limite de la file moins les jobs qui tournent déjà sur ce nœud. La sous-requête en demande exactement autant, par ordre de priorité, et les verrouille avec `FOR UPDATE SKIP LOCKED`. La [doc de SELECT](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE) cite cet usage : SKIP LOCKED « can be used to avoid lock contention with multiple consumers accessing a queue-like table. » (évite la contention entre plusieurs consommateurs d’une table en forme de file).',
			'**Prendre et verrouiller en une instruction.** L’UPDATE extérieur remplit `state`, `attempted_at` et `attempted_by`, et ajoute un à `attempt`, pour les ids que renvoie le CTE. La transaction se termine juste après. Le verrou de ligne ne servait qu’à empêcher deux workers de prendre le même job. Ensuite, c’est l’état `executing` qui dit à qui il appartient.',
			'**Pourquoi un CTE et pas une sous-requête.** Le commentaire explique qu’une boucle imbriquée pourrait lancer la sous-requête LIMIT plus d’une fois et mettre à jour plus de lignes que demandé. PostgreSQL n’intègre jamais un CTE qui verrouille des lignes : [`contain_dml`](' + PGSRC + '#L1070-L1097) considère qu’un SELECT avec `FOR UPDATE` a des effets de bord, et la [vérification d’intégration](' + PGSRC + '#L960-L968) les refuse. Le sous-ensemble est donc calculé une seule fois.',
			'**Les workers plantés se trouvent à leur âge.** [`rescue_jobs`](' + BASIC + '#L194-L214) cherche `state == "executing" and attempted_at < cut`. Les jobs qui ont encore des essais repassent en `available` ; les autres deviennent `discarded`. Un job peut donc tourner deux fois : une fois dans le worker planté, une fois après le sauvetage.',
			'**NOTIFY a ses limites.** Le [notifier Postgres](' + OBAN + '/notifiers/postgres.ex#L6-L11) d’Oban prévient qu’il « doesn\'t work with connection poolers like [PgBouncer][pgb] when configured in _transaction_ or _statement_ mode » (ne marche pas derrière PgBouncer en mode transaction ou statement) (jour 25). La [doc de NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html) ajoute qu’un payload « must be shorter than 8000 bytes » (doit faire moins de 8000 octets) par défaut.'
		]
	},
	tradeoff: {
		gain: [
			'Un système de moins à faire tourner, sauvegarder et surveiller. La file est dans la base que tu as déjà, avec ses sauvegardes et son failover.',
			'Mise en file transactionnelle : insère la commande et son job « envoyer le reçu » dans une seule transaction. Soit les deux existent, soit aucun, donc pas d’email pour une commande annulée.',
			'Les jobs sont des lignes. Tu peux les interroger, les compter par état, les relancer avec un UPDATE, et les joindre à tes propres tables pour déboguer.'
		],
		cost: [
			'Chaque job, c’est au moins un insert et deux updates, et chaque update laisse une ligne morte (jour 16). Une table de file chargée a besoin qu’autovacuum suive, sinon les parcours ralentissent.',
			'Le débit est plafonné par un seul primaire. Un broker conçu pour les flux passe à l’échelle autrement dès qu’il te faut des débits très élevés ou beaucoup de consommateurs par message.',
			'Une transaction longue n’importe où dans la base retient vacuum, donc la table de file gonfle même si la file elle-même va bien.',
			'Au moins une fois, pas exactement une fois : un job sauvé peut avoir déjà fait une partie de son travail. Les jobs doivent être idempotents (jour 23).'
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
	takeaway: 'Une file de jobs dans Postgres, c’est une table, une prise en charge courte avec `FOR UPDATE SKIP LOCKED`, une colonne d’état, et un sauvetage pour les workers plantés ; ça suffit tant qu’un seul primaire tient la charge.',
	sources: [
		{ title: 'PostgreSQL docs, SELECT: the locking clause', url: 'https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE' },
		{ title: 'PostgreSQL docs, NOTIFY', url: 'https://www.postgresql.org/docs/current/sql-notify.html' },
		{ title: 'Oban docs, Oban.Notifiers.Postgres', url: 'https://oban.hexdocs.pm/Oban.Notifiers.Postgres.html' }
	]
};
