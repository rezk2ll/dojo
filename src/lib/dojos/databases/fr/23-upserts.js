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
		'Renvoyer était le bon réflexe : le client ne pouvait pas savoir si le premier essai avait marché. **Le bug, c’est que le serveur a traité la seconde requête comme une nouvelle.** Chaque appel réseau qui peut expirer finira, un jour, par arriver deux fois.',
		'La solution : rendre l’écriture idempotente, c’est-à-dire que la faire deux fois a le même effet que la faire une fois. **Donne une clé à chaque opération, et laisse un index unique décider quelle tentative est la vraie.** `INSERT ... ON CONFLICT` fait de cette décision une seule instruction atomique.'
	],
	terms: [
		{ term: 'Idempotent', def: 'Sans risque à répéter. Lancer l’opération deux fois laisse le système dans le même état que la lancer une fois.' },
		{ term: 'Clé d’idempotence', def: 'Une valeur unique que le client envoie avec une requête (souvent un UUID) pour que le serveur reconnaisse une nouvelle tentative de la même requête.' },
		{ term: 'Upsert', def: 'Insérer une ligne, ou la mettre à jour si une ligne avec la même clé existe. En PostgreSQL : `INSERT ... ON CONFLICT ... DO UPDATE`.' },
		{ term: 'Cible du conflit', def: 'Les colonnes (et le WHERE optionnel) dans `ON CONFLICT (...)` qui disent à PostgreSQL quel index unique décide de ce qu’est un doublon.' },
		{ term: 'EXCLUDED', def: 'La ligne que tu as essayé d’insérer, disponible dans `DO UPDATE SET` sous la forme `EXCLUDED.column`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['c["Client : POST /charges, clé k-42"] --> s["Serveur"]', 's -->|"INSERT ... ON CONFLICT (idempotency_key) DO NOTHING"| t[("charges")]'],
				highlight: ['c', 't'],
				note: '**Premier essai.** Le serveur insère une ligne avec la clé `k-42` avant d’appeler le prestataire de paiement. Aucune ligne n’a cette clé, donc l’insert passe. Cette ligne est la revendication : « ce paiement, c’est moi qui le fais ».'
			},
			{
				add: ['t -->|"1 ligne insérée"| pay["Débiter la carte, stocker le résultat sur la ligne"]'],
				highlight: ['pay'],
				note: '**Faire le travail, garder la réponse.** Le serveur débite la carte et enregistre le résultat à côté de la clé. Puis la réponse se perd au retour. Le client ne voit qu’une expiration.'
			},
			{
				add: ['c2["Le client réessaie : même clé k-42"] --> s', 't -->|"0 ligne, la clé existe"| saved["Renvoyer le résultat enregistré"]'],
				highlight: ['c2', 'saved'],
				note: '**La nouvelle tentative trouve la clé.** Le même INSERT entre maintenant en conflit avec l’index unique et n’insère rien. Le serveur lit le résultat stocké et le renvoie. La carte a été débitée une seule fois.'
			},
			{
				add: ['c3["Deux tentatives au même moment"] --> t', 't -->|"la seconde attend, puis entre en conflit"| saved'],
				highlight: ['c3'],
				note: '**Les courses sont couvertes aussi.** Si deux copies arrivent ensemble, PostgreSQL fait attendre le second INSERT sur la clé du premier dans l’index. Quand le premier valide, le second voit le conflit. Aucun SELECT avant l’INSERT ne pourrait donner cette garantie (jour 22).'
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
			'**La clé est un hash de ce qui rend un job « le même ».** [`UniqueKey`](' + RIVER + '/internal/dbunique/db_unique.go#L48-L55) calcule un SHA-256 d’une chaîne que [`buildUniqueKeyString`](' + RIVER + '/internal/dbunique/db_unique.go#L59-L122) assemble à partir du type de job, et en option des arguments, d’une période et de la file. Mets deux fois en file « envoyer l’email de bienvenue à l’utilisateur 7 », et les deux essais ont la même `unique_key`.',
			'**Le WHERE après ON CONFLICT choisit un index partiel.** L’[index unique](' + PGX + '/migration/main/006_bulk_unique.up.sql#L30-L33) de River ne couvre que les lignes dont l’état est dans les `unique_states` du job. La cible du conflit répète ce prédicat, ce que la [doc d’INSERT](' + INSERT + '#SQL-ON-CONFLICT) décrit ainsi : « Used to allow inference of partial unique indexes. » (sert à retrouver les index uniques partiels). Un job terminé peut sortir de l’index, donc le même travail peut être remis en file plus tard.',
			'**Pourquoi mettre une colonne à jour avec elle-même.** Avec `DO NOTHING`, un doublon ne renvoie aucune ligne : RETURNING est calculé « based on each row actually inserted (or updated, if an ON CONFLICT DO UPDATE clause was used) » (sur chaque ligne réellement insérée, ou mise à jour). River veut récupérer le job existant, donc il fait un `DO UPDATE` qui ne change rien. Le prix : une vraie écriture de ligne à chaque doublon, qui laisse une version morte pour VACUUM (jour 16).',
			'**Distinguer un insert d’un doublon.** `xmax` est documenté comme « The identity (transaction ID) of the deleting transaction, or zero for an undeleted row version. » (l’id de la transaction qui supprime, ou zéro). Un insert neuf a zéro. River compte sur le fait que le chemin du conflit le laisse non nul, un détail interne. Sur PostgreSQL 18, `RETURNING old.id` est la voie documentée : la doc dit que les anciennes valeurs « will be NULL for non-conflicting rows » (sont NULL pour les lignes sans conflit).',
			'**Une instruction, n’importe quelle concurrence.** La doc promet que « ON CONFLICT DO UPDATE guarantees an atomic INSERT or UPDATE outcome; provided there is no independent error, one of those two outcomes is guaranteed, even under high concurrency. » (l’un des deux résultats est garanti, même sous forte concurrence). À l’intérieur, PostgreSQL utilise l’[insertion spéculative](https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/src/backend/executor/execIndexing.c?plain=1#L53-L67) : il peut retirer sa propre ligne en cas de conflit « without aborting the whole transaction » (sans annuler toute la transaction).'
		]
	},
	tradeoff: {
		gain: [
			'Réessayer devient sans risque. Les clients, les load balancers et les exécuteurs de jobs peuvent renvoyer après n’importe quelle expiration sans créer un second paiement, une seconde commande ou un second job.',
			'Un seul aller-retour et pas de course : l’index unique décide, dans l’INSERT, quelle tentative gagne. Pas de SELECT avant, pas d’exception à attraper, pas de savepoint.',
			'Les imports en lot deviennent plus simples : `ON CONFLICT (sku) DO UPDATE SET price = EXCLUDED.price` recharge un flux encore et encore sans doublons.'
		],
		cost: [
			'Il faut un index unique dont les colonnes, et le prédicat partiel s’il y en a un, correspondent à la cible du conflit. Sans lui, PostgreSQL s’arrête sur « there is no unique or exclusion constraint matching the ON CONFLICT specification ».',
			'Une instruction ne peut pas toucher deux fois la même ligne : la doc prévient qu’« a cardinality violation error will be raised » (une erreur de cardinalité est levée) si deux lignes proposées partagent une clé. Dédoublonne un lot avant de l’envoyer.',
			'Les clés s’accumulent. La doc de Stripe permet de purger les clés une fois qu’elles ont 24 heures. Il te faut ta propre tâche d’expiration, et une tentative après expiration est traitée comme nouvelle.',
			'La clé ne couvre que ta base. Si le serveur plante après le débit mais avant d’enregistrer le résultat, la ligne reste `pending`. La terminer n’est sans risque que si l’appel au prestataire portait la même clé, ce que Stripe accepte.'
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
			why: 'Un SELECT simple ne prend aucun verrou et ne voit que les lignes validées, donc les deux peuvent ne rien voir. C’est la course vérifier-puis-agir du jour 22. `INSERT ... ON CONFLICT` avec un index unique en est la version atomique.'
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
			why: 'RETURNING est calculé sur les lignes insérées ou mises à jour. DO NOTHING n’écrit rien, donc rien ne revient. C’est pour ça que River utilise un `DO UPDATE` qui ne change rien quand il a besoin de récupérer la ligne existante.'
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
	takeaway: 'Donne une clé à chaque écriture qu’on peut réessayer, revendique-la avec `INSERT ... ON CONFLICT` avant l’effet de bord, et renvoie le résultat enregistré quand la même clé revient.',
	sources: [
		{ title: 'PostgreSQL docs, INSERT: ON CONFLICT clause', url: 'https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT' },
		{ title: 'Stripe API reference, Idempotent requests', url: 'https://docs.stripe.com/api/idempotent_requests' },
		{ title: 'River docs, Unique jobs', url: 'https://riverqueue.com/docs/unique-jobs' }
	]
};
