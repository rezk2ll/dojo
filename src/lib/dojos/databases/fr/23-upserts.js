const RIVER = 'https://github.com/riverqueue/river/blob/f043d9813073c103d447739510745c14a4070f3c';
const PGX = `${RIVER}/riverdriver/riverpgxv5`;
const INSERT = 'https://www.postgresql.org/docs/current/sql-insert.html';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'upserts',
	part: 'Plusieurs à la fois',
	title: 'Upserts et nouvelles tentatives sans risque',
	minutes: 10,
	hook: [
		'Une cliente appuie sur « Payer » dans le train. La requête arrive sur ton serveur et le paiement passe, mais **la réponse se perd dans un tunnel**. L’appli expire et renvoie la requête. La cliente est débitée deux fois.',
		'Renvoyer était le bon réflexe : le client ne pouvait pas savoir si le premier essai avait marché. **Le bug, c’est que le serveur a traité la seconde requête comme une nouvelle.** Un client qui réessaie après une expiration peut envoyer n’importe quelle requête deux fois.',
		'La solution : rendre l’écriture idempotente, c’est-à-dire que la faire deux fois a le même effet que la faire une fois. **Donne une clé à chaque opération, et laisse un index unique décider quelle tentative est la vraie.** `INSERT ... ON CONFLICT` vérifie l’index et écrit dans une seule instruction atomique.'
	],
	terms: [
		{ term: 'Idempotent', def: 'Lancer l’opération deux fois laisse le système dans le même état que la lancer une fois.' },
		{ term: 'Clé d’idempotence', def: 'Une valeur unique que le client envoie avec une requête (souvent un UUID) pour que le serveur reconnaisse une nouvelle tentative de la même requête.' },
		{ term: 'Upsert', def: 'Insérer une ligne, ou la mettre à jour si une ligne avec la même clé existe. En PostgreSQL : `INSERT ... ON CONFLICT ... DO UPDATE`.' },
		{ term: 'Cible du conflit', def: 'Les colonnes (et le WHERE optionnel) dans `ON CONFLICT (...)` qui disent à PostgreSQL quel index unique décide de ce qu’est un doublon.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['c["Client : POST /charges, clé k-42"] --> s["Serveur"]', 's -->|"INSERT ... ON CONFLICT (idempotency_key) DO NOTHING"| t[("charges")]'],
				highlight: ['c', 't'],
				note: 'Au premier essai, le serveur insère une ligne avec la clé `k-42` avant d’appeler le prestataire de paiement. Aucune ligne n’a cette clé, donc l’insert passe. La requête qui a inséré la ligne est celle qui lance le paiement.'
			},
			{
				add: ['t -->|"1 ligne insérée"| pay["Débiter la carte, stocker le résultat sur la ligne"]'],
				highlight: ['pay'],
				note: 'Le serveur débite la carte et enregistre le résultat à côté de la clé. Puis la réponse se perd au retour. Le client ne voit qu’une expiration.'
			},
			{
				add: ['c2["Le client réessaie : même clé k-42"] --> s', 't -->|"0 ligne, la clé existe"| saved["Renvoyer le résultat enregistré"]'],
				highlight: ['c2', 'saved'],
				note: 'La nouvelle tentative envoie la même clé. Le même INSERT entre maintenant en conflit avec l’index unique et n’insère rien. Le serveur lit le résultat stocké et le renvoie. La carte a été débitée une seule fois.'
			},
			{
				add: ['c3["Deux tentatives au même moment"] --> t', 't -->|"la seconde attend, puis entre en conflit"| saved'],
				highlight: ['c3'],
				note: 'Si deux copies arrivent ensemble, PostgreSQL fait attendre le second INSERT sur la clé du premier dans l’index. Quand le premier valide, le second voit le conflit. Aucun SELECT avant l’INSERT ne pourrait donner cette garantie (jour 22).'
			}
		]
	},
	example: {
		title: 'riverdriver/riverpgxv5/internal/dbsqlc/river_job.sql : River n’insère un job qu’une fois',
		repo: 'riverqueue/river',
		url: `${PGX}/internal/dbsqlc/river_job.sql#L278-L336`,
		lang: 'sql',
		code: `-- name: JobInsertFastMany :many
WITH raw_job_data AS (
    SELECT
        unnest(@id::bigint[]) AS id,
        unnest(@args::jsonb[]) AS args,
…
        unnest(@unique_key::bytea[]) AS unique_key,
        unnest(@unique_states::integer[]) AS unique_states
)
INSERT INTO /* TEMPLATE: schema */river_job(
    id,
    args,
…
    unique_key,
    unique_states
) SELECT
    coalesce(nullif(id, 0), nextval('/* TEMPLATE: schema */river_job_id_seq'::regclass)),
    args,
…
    nullif(unique_key, '')::bytea,
    nullif(unique_states::integer, 0)::bit(8)
FROM raw_job_data
ON CONFLICT (unique_key)
    WHERE unique_key IS NOT NULL
        AND unique_states IS NOT NULL
        AND /* TEMPLATE: schema */river_job_state_in_bitmask(unique_states, state)
…
    DO UPDATE SET kind = river_job.kind
RETURNING
    sqlc.embed(river_job),
    /* TEMPLATE_BEGIN: unique_skipped_as_duplicate */ (xmax != 0) /* TEMPLATE_END */ AS unique_skipped_as_duplicate;`,
		notes: [
			'La ligne 7 porte la clé, un hash de ce qui rend un job « le même ». [`UniqueKey`](' + RIVER + '/internal/dbunique/db_unique.go#L48-L55) calcule un SHA-256 d’une chaîne que `buildUniqueKeyString` assemble à partir du type de job, et en option des arguments, d’une période et de la file. Mets deux fois en file « envoyer l’email de bienvenue à l’utilisateur 7 », et les deux essais ont la même `unique_key`.',
			'Les lignes 24 à 26 choisissent un index partiel. L’[index unique](' + PGX + '/migration/main/006_bulk_unique.up.sql#L30-L33) de River ne couvre que les lignes dont l’état est dans les `unique_states` du job. La cible du conflit répète ce prédicat : d’après la doc d’INSERT, c’est ainsi que PostgreSQL retrouve un index unique partiel. Un job terminé peut sortir de l’index, donc le même travail peut être remis en file plus tard.',
			'La ligne 28 met `kind` à jour avec sa propre valeur. Avec `DO NOTHING`, un doublon ne renvoie aucune ligne : d’après la doc, RETURNING ne porte que sur les lignes réellement insérées, ou mises à jour par un `ON CONFLICT DO UPDATE`. River veut récupérer le job existant, donc il fait un `DO UPDATE` qui ne change rien. Chaque doublon coûte alors une vraie écriture de ligne, qui laisse une version morte pour VACUUM (jour 16).',
			'La ligne 31 distingue un insert d’un doublon avec `xmax`, que la doc définit comme l’id de la transaction qui a supprimé la ligne, ou zéro pour une ligne non supprimée. Un insert neuf a zéro. River compte sur le fait que le chemin du conflit le laisse non nul, un détail interne. Sur PostgreSQL 18, `RETURNING old.id` est la voie documentée : d’après la doc, les anciennes valeurs valent NULL pour les lignes sans conflit.',
			'Les lignes 10 à 31 forment une seule instruction, sûre sous n’importe quelle concurrence. D’après la doc, `ON CONFLICT DO UPDATE` garantit un INSERT ou un UPDATE atomique, même sous forte concurrence, tant qu’aucune autre erreur ne survient. À l’intérieur, PostgreSQL utilise l’[insertion spéculative](https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/src/backend/executor/execIndexing.c?plain=1#L53-L67) : il peut retirer sa propre ligne en cas de conflit « without aborting the whole transaction » (sans annuler toute la transaction).'
		]
	},
	tradeoff: {
		gain: [
			'Les clients, les load balancers et les exécuteurs de jobs peuvent renvoyer après n’importe quelle expiration sans créer un second paiement, une seconde commande ou un second job.',
			'Un seul aller-retour et pas de course : l’index unique décide, dans l’INSERT, quelle tentative gagne. Le handler n’a besoin ni d’un SELECT avant, ni d’une exception à attraper, ni d’un savepoint.',
			'Un import en lot peut lancer `ON CONFLICT (sku) DO UPDATE SET price = EXCLUDED.price` (`EXCLUDED` est la ligne que tu as essayé d’insérer) et recharger le même flux encore et encore sans doublons.'
		],
		cost: [
			'Il faut un index unique dont les colonnes, et le prédicat partiel s’il y en a un, correspondent à la cible du conflit. Sans lui, PostgreSQL s’arrête sur « there is no unique or exclusion constraint matching the ON CONFLICT specification ».',
			'Une instruction ne peut pas toucher deux fois la même ligne : la doc prévient qu’« a cardinality violation error will be raised » (une erreur de cardinalité est levée) si deux lignes proposées partagent une clé. Dédoublonne un lot avant de l’envoyer.',
			'Chaque requête laisse une ligne de clé derrière elle. La doc de Stripe permet de purger les clés une fois qu’elles ont 24 heures. Il te faut ta propre tâche d’expiration, et une tentative après expiration est traitée comme nouvelle.',
			'L’index unique ne protège que les lignes de ta base. Si le serveur plante après le débit mais avant d’enregistrer le résultat, la ligne reste `pending`. La terminer n’est sans risque que si l’appel au prestataire portait la même clé, ce que Stripe accepte.'
		]
	},
	task: {
		prompt: 'Conçois `charges(idempotency_key text, amount_cents int, status text, response jsonb, created_at timestamptz)` pour un endpoint de paiement. Écris le SQL que le handler lance en premier, ce qu’il fait quand ce SQL ne renvoie aucune ligne, et quand il appelle le prestataire de paiement. Puis dis ce qui se passe si deux requêtes identiques lancent ce SQL en même temps.',
		hint: 'Enregistre la clé avant l’effet de bord, pas après. `RETURNING` avec `DO NOTHING` ne renvoie une ligne que si une ligne a été insérée.',
		answer: [
			'Schéma : `idempotency_key text PRIMARY KEY` (ou un index UNIQUE). Première instruction : `INSERT INTO charges (idempotency_key, amount_cents, status) VALUES ($1, $2, \'pending\') ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key;`',
			'Une ligne en retour : cette requête possède le paiement. Appelle le prestataire en passant la même clé, pour que son côté soit idempotent aussi, puis `UPDATE charges SET status = \'done\', response = $3 WHERE idempotency_key = $1`.',
			'Aucune ligne en retour : c’est une nouvelle tentative. `SELECT status, response FROM charges WHERE idempotency_key = $1`. Si `done`, renvoie la réponse enregistrée. Si encore `pending`, réponds 409 ou « réessaie dans un instant », parce que le premier essai tourne encore. Vérifie aussi que le montant correspond, comme le fait Stripe, et refuse une clé réutilisée avec d’autres paramètres.',
			'Deux en même temps : le second INSERT attend sur la clé pas encore validée du premier. Quand le premier valide, le second reçoit le conflit et ne renvoie aucune ligne. Exactement une requête appelle le prestataire.'
		],
		steps: [
			{
				title: 'Conçois la table',
				questions: [
					{ q: 'Que doit avoir `idempotency_key` pour que le handler marche ?', options: ['Un défaut à `gen_random_uuid()`', 'Un index simple, pour des lectures rapides', 'Une PRIMARY KEY ou un index UNIQUE', 'Un CHECK qui interdit la valeur vide'], answer: 2, why: 'L’index unique décide quelle tentative est la vraie. Sans lui, PostgreSQL s’arrête sur « there is no unique or exclusion constraint matching the ON CONFLICT specification ».' },
					{ q: 'Qui choisit la clé ?', options: ['Le client, une fois par opération, et il renvoie la même clé en cas de nouvelle tentative', 'Le serveur, avec un nouvel UUID à chaque requête', 'La base, avec une séquence', 'Le prestataire de paiement, dans sa réponse'], answer: 0, why: 'La clé doit être la même au premier essai et à la nouvelle tentative. Seul le client sait que les deux sont la même requête.' },
					{ q: 'Pourquoi la ligne reçoit-elle un `status` comme `pending` ?', options: ['PostgreSQL en a besoin pour détecter le conflit', 'Stripe refuse une clé sans statut', 'Ça rend l’index unique plus petit', 'Une nouvelle tentative doit distinguer un paiement fini d’un paiement en cours'], answer: 3, why: 'La ligne est écrite avant le débit. `pending` veut dire que le premier essai n’a pas encore enregistré son résultat.' },
					{ q: 'Quand le handler écrit-il la ligne de clé ?', options: ['Après la confirmation du prestataire', 'Avant d’appeler le prestataire', 'Seulement quand une nouvelle tentative arrive', 'Dans un lot nocturne'], answer: 1, why: 'Enregistre la clé avant l’effet de bord. Écrite après, deux tentatives pourraient débiter toutes les deux avant qu’aucune ligne n’existe.' }
				]
			},
			{
				title: 'Écris la première instruction',
				questions: [
					{ q: 'Quel SQL le handler lance-t-il en premier ?', options: ['`SELECT 1 FROM charges WHERE idempotency_key = $1;`', '`INSERT INTO charges (...) VALUES ($1, $2, \'pending\') ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key;`', '`INSERT INTO charges (...) VALUES ($1, $2, \'pending\');`', '`UPDATE charges SET status = \'pending\' WHERE idempotency_key = $1;`'], answer: 1, why: 'Une seule instruction atomique vérifie l’index et écrit. Un SELECT avant laisse la course vérifier-puis-agir du jour 22.' },
					{ q: 'La clé existe déjà. Que renvoie cet INSERT ?', options: ['Aucune ligne', 'La ligne existante', 'Une erreur avec le SQLSTATE `23505`', 'Une ligne de NULL'], answer: 0, why: 'RETURNING couvre les lignes vraiment insérées ou mises à jour. DO NOTHING n’écrit rien, donc rien ne revient.' },
					{ q: 'L’INSERT renvoie une ligne. Qu’est-ce que ça veut dire ?', options: ['Une nouvelle tentative : la clé était déjà là', 'Le prestataire a débité la carte', 'Cette requête possède le paiement', 'Une autre requête tourne encore'], answer: 2, why: 'Seule la tentative qui a inséré la ligne la reçoit en retour. C’est elle qui lance le débit.' },
					{ q: 'Pourquoi `DO NOTHING` ici et pas le `DO UPDATE` sans effet de River ?', options: ['`DO UPDATE` ne peut pas utiliser une clé primaire', '`DO NOTHING` prend un verrou de table', '`DO UPDATE` échoue quand la clé existe', 'Un résultat vide est le signal de nouvelle tentative, et aucune ligne morte ne reste'], answer: 3, why: 'Le handler a seulement besoin de savoir s’il a inséré. Un `DO UPDATE` sans effet renvoie la ligne mais écrit une nouvelle version de ligne à chaque fois.' }
				]
			},
			{
				title: 'Appelle le prestataire, ou réponds à la nouvelle tentative',
				questions: [
					{ q: 'L’INSERT a renvoyé une ligne. Et ensuite ?', options: ['Appeler le prestataire avec la même clé, puis passer la ligne à `done` avec la réponse par un `UPDATE`', 'Renvoyer la réponse enregistrée', 'Répondre 409 et attendre une nouvelle tentative', 'Appeler le prestataire avec une nouvelle clé, pour ne pas passer pour un doublon'], answer: 0, why: 'Passer la même clé rend le côté du prestataire idempotent aussi. Ensuite, la ligne garde le résultat pour toute nouvelle tentative.' },
					{ q: 'L’INSERT n’a renvoyé aucune ligne. Que lance le handler ?', options: ['Le même INSERT encore', '`SELECT status, response FROM charges WHERE idempotency_key = $1`', 'Un `DELETE` de la ligne pour recommencer', 'Un appel au prestataire, pour être sûr'], answer: 1, why: 'C’est une nouvelle tentative. La ligne enregistrée dit ce qui est arrivé au premier essai.' },
					{ q: 'La ligne dit `pending`. Que répond le handler ?', options: ['La réponse enregistrée', 'Un nouveau débit avec une clé neuve', '409 ou « réessaie dans un instant »', '200 avec un corps vide'], answer: 2, why: 'Le premier essai tourne encore. Débiter à nouveau, c’est justement le bug que la clé empêche.' },
					{ q: 'Une nouvelle tentative réutilise la clé `k-42` avec un autre montant. Que doit-il se passer ?', options: ['Débiter le nouveau montant', 'Mettre la ligne à jour avec le nouveau montant', 'Renvoyer la réponse enregistrée pour l’ancien montant', 'Refuser la requête : la clé a servi avec d’autres paramètres'], answer: 3, why: 'Stripe vérifie que les paramètres correspondent. Une clé réutilisée avec de nouvelles valeurs est un bug du client, pas une nouvelle tentative.' }
				]
			},
			{
				title: 'Fais courir deux requêtes identiques',
				questions: [
					{ q: 'Deux requêtes avec la même clé lancent l’INSERT au même moment. Que fait la seconde d’abord ?', options: ['Elle insère une seconde ligne', 'Elle échoue tout de suite avec `23505`', 'Elle attend sur la clé pas encore validée de la première', 'Elle lit la première ligne en `pending`'], answer: 2, why: 'PostgreSQL fait attendre le second INSERT sur la clé dans l’index jusqu’à la fin de la première transaction.' },
					{ q: 'La première valide. Qu’obtient le second INSERT ?', options: ['Le conflit, et aucune ligne en retour', 'Une ligne, puisqu’il a démarré en second', 'Une erreur de deadlock', 'La réponse de la première ligne'], answer: 0, why: 'Après l’attente, il voit la clé validée. `DO NOTHING` ne renvoie rien, donc il prend le chemin de la nouvelle tentative.' },
					{ q: 'Combien de requêtes appellent le prestataire ?', options: ['Deux, une par requête', 'Exactement une', 'Aucune avant une troisième tentative', 'Ça dépend de celle qui valide en premier'], answer: 1, why: 'Seule la requête qui a reçu une ligne en retour possède le paiement.' },
					{ q: 'Le serveur plante après le débit mais avant d’enregistrer le résultat. Que reste-t-il ?', options: ['Rien : la ligne est annulée avec le débit', 'Une ligne `done` sans réponse', 'Deux lignes avec la même clé', 'Une ligne `pending` ; la terminer n’est sans risque que si l’appel au prestataire portait la même clé'], answer: 3, why: 'L’index unique ne protège que ta base. L’idempotence du prestataire couvre le débit lui-même.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Ton handler fait `SELECT ... WHERE key = $1`, et s’il ne trouve rien, lance un INSERT. Deux nouvelles tentatives arrivent ensemble. Que peut-il se passer ?',
			options: [
				'Le second SELECT attend le premier, donc un seul insert est fait',
				'Les deux SELECT ne trouvent rien et les deux INSERT passent, le travail est fait deux fois',
				'PostgreSQL fusionne les deux transactions parce qu’elles lisent la même clé',
				'Le second INSERT est transformé en silence en UPDATE de la première ligne'
			],
			answer: 1,
			why: 'Un SELECT simple ne prend aucun verrou et ne voit que les lignes validées, donc les deux peuvent ne rien voir. Le jour 22 l’a appelée la course vérifier-puis-agir. `INSERT ... ON CONFLICT` avec un index unique en est la version atomique.'
		},
		{
			q: 'Tu lances `INSERT ... ON CONFLICT (key) DO NOTHING RETURNING id` et la clé existe déjà. Qu’est-ce qui revient ?',
			options: [
				'L’id de la ligne existante, marqué comme doublon par la base',
				'Une erreur avec le SQLSTATE 23505, que le client doit attraper',
				'Aucune ligne, puisque RETURNING ne couvre que les lignes écrites',
				'Une ligne de NULL, un pour chaque colonne listée après RETURNING'
			],
			answer: 2,
			why: 'RETURNING est calculé sur les lignes insérées ou mises à jour. DO NOTHING n’écrit rien, donc rien ne revient. Pour récupérer la ligne existante, River utilise plutôt un `DO UPDATE` qui ne change rien.'
		},
		{
			q: 'Un import nocturne envoie un seul `INSERT ... ON CONFLICT (sku) DO UPDATE` avec 10 000 lignes, et deux d’entre elles partagent un SKU. Que se passe-t-il ?',
			options: [
				'Toute l’instruction échoue, puisqu’elle mettrait à jour deux fois la même ligne',
				'La plus tardive des deux gagne et écrase la première sans rien dire',
				'La première des deux gagne et la plus tardive est ignorée sans bruit',
				'Les deux lignes sont insérées, le conflit n’étant vérifié que sur les anciennes'
			],
			answer: 0,
			why: 'La doc dit qu’ON CONFLICT DO UPDATE est « deterministic » : une instruction ne peut pas toucher une ligne plus d’une fois, et lève une erreur de cardinalité si elle le ferait. Dédoublonne le lot avant, par exemple avec `DISTINCT ON (sku)`.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Envoyer le même paiement deux fois, une fois à la suite et une fois au même moment, et voir l’index unique choisir un seul gagnant.',
		steps: [
			'Lance PostgreSQL : `docker run -d --name dojo-pg -e POSTGRES_PASSWORD=dojo postgres:17`. Attends que `docker exec dojo-pg pg_isready` affiche `accepting connections`, puis ouvre `docker exec -it dojo-pg psql -U postgres`.',
			'Crée la table : `CREATE TABLE charges (idempotency_key text PRIMARY KEY, amount_cents int NOT NULL, status text NOT NULL, response jsonb, created_at timestamptz NOT NULL DEFAULT now());`',
			'Lance deux fois la première instruction du handler : `INSERT INTO charges (idempotency_key, amount_cents, status) VALUES (\'k-42\', 1999, \'pending\') ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key;`',
			'Termine le premier essai : `UPDATE charges SET status = \'done\', response = \'{"charge":"ch_1"}\' WHERE idempotency_key = \'k-42\';` puis lis-le comme le ferait une nouvelle tentative : `SELECT status, response FROM charges WHERE idempotency_key = \'k-42\';`',
			'Vise une colonne sans index unique : le même INSERT avec la clé `k-43` et `ON CONFLICT (status) DO NOTHING`.',
			'Fais la course : ouvre un second terminal avec la même commande `psql`. Dans le premier, `BEGIN;` et lance l’INSERT avec la clé `k-77`. Dans le second, lance le même INSERT. Puis `COMMIT;` dans le premier.'
		],
		done: [
			'À l’étape 3, le premier lancement renvoie `k-42` et `INSERT 0 1`. Le second renvoie `(0 rows)` et `INSERT 0 0`.',
			'L’étape 4 montre `done` et la réponse enregistrée.',
			'L’étape 5 échoue avec `there is no unique or exclusion constraint matching the ON CONFLICT specification`.',
			'À l’étape 6, le second terminal reste bloqué jusqu’au commit, puis affiche `(0 rows)` et `INSERT 0 0`.'
		],
		solution: [
			'Seule la tentative qui a inséré la ligne la reçoit par RETURNING. C’est elle qui appelle le prestataire. Toutes les autres lisent la ligne enregistrée.',
			'La seconde session attend sur la clé pas encore validée de la première dans l’index. Aucun SELECT avant l’INSERT ne pourrait la faire attendre ainsi.',
			'Bonus : `INSERT INTO charges (idempotency_key, amount_cents, status) VALUES (\'k-50\', 1, \'pending\'), (\'k-50\', 2, \'pending\') ON CONFLICT (idempotency_key) DO UPDATE SET amount_cents = EXCLUDED.amount_cents;` échoue avec `ON CONFLICT DO UPDATE command cannot affect row a second time`. Dédoublonne un lot avant.',
			'Nettoie avec `docker rm -f dojo-pg`.'
		]
	},
	recall: {
		q: 'Une requête de paiement avec la clé `k-42` revient après une expiration. Quelle instruction le handler lance-t-il avant de débiter la carte, et comment repère-t-il la nouvelle tentative ?',
		a: '`INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key`. Aucune ligne en retour veut dire que la clé existe déjà, donc le handler renvoie le résultat enregistré au lieu de débiter une seconde fois.'
	},
	sources: [
		{ title: 'River, internal/dbunique/db_unique.go: buildUniqueKeyString', url: `${RIVER}/internal/dbunique/db_unique.go#L59-L122` },
		{ title: 'PostgreSQL docs, INSERT: ON CONFLICT clause', url: 'https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT' },
		{ title: 'Stripe API reference, Idempotent requests', url: 'https://docs.stripe.com/api/idempotent_requests' },
		{ title: 'River docs, Unique jobs', url: 'https://riverqueue.com/docs/unique-jobs' }
	]
};
