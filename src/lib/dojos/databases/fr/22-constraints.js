const OP = 'https://github.com/opf/openproject/blob/e7ec68bf4763a0f538988fb51194b563a77b825d';
const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04/activerecord/lib/active_record';
const PGDOC = 'https://www.postgresql.org/docs/current/ddl-constraints.html';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'constraints',
	part: 'Plusieurs à la fois',
	title: 'Les contraintes : UNIQUE, CHECK et exclusion',
	minutes: 10,
	hook: [
		'Ton modèle `User` dit `validates :email, uniqueness: true`. Les tests passent. Puis le support trouve **deux comptes avec le même email**, créés à 40 millisecondes d’écart par un double clic sur « S’inscrire ».',
		'La validation lance un SELECT, ne trouve rien, et laisse passer l’INSERT. **La seconde requête a lancé le même SELECT avant que le premier INSERT soit validé**, donc elle n’a rien trouvé non plus. Le SELECT dans l’appli et l’INSERT qui suit font deux étapes, et une autre requête se glisse entre les deux.',
		'PostgreSQL vérifie une contrainte pendant l’écriture elle-même, sous ses propres verrous, donc aucune requête ne peut s’intercaler. Garde la validation pour afficher un message lisible, et laisse un index unique refuser le doublon.'
	],
	terms: [
		{ term: 'Course vérifier-puis-agir', def: 'Le code lit pour décider (« cet email est-il libre ? »), puis écrit. Un autre écrivain peut changer la réponse entre la lecture et l’écriture.' },
		{ term: 'UNIQUE', def: 'Deux lignes ne partagent jamais la même valeur dans ces colonnes. PostgreSQL l’impose avec un index B-tree unique.' },
		{ term: 'CHECK', def: 'Une expression booléenne sur une ligne, testée à chaque insert et update : `price > 0`, `ends_at > starts_at`.' },
		{ term: 'Contrainte d’exclusion', def: 'Un UNIQUE généralisé : deux lignes ne peuvent pas correspondre sur tous les opérateurs listés. Avec `&&` sur un intervalle, ça veut dire « deux réservations ne se chevauchent jamais ».' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['r1["Requête 1 : SELECT 1 FROM users WHERE email = ?"] --> none["Aucune ligne trouvée"]', 'r2["Requête 2 : même SELECT, quelques ms plus tard"] --> none'],
				highlight: ['r1', 'r2', 'none'],
				note: 'Les deux vérifications passent. Aucune requête n’a encore écrit, donc les deux SELECT ne trouvent rien. En Read Committed (jour 19), chacune ne voit que ce qui était validé quand elle a tourné, donc aucune ne voit la ligne de l’autre.'
			},
			{
				add: ['none --> ins1["Requête 1 : INSERT, valide"]', 'none --> ins2["Requête 2 : INSERT"]', 'ins1 --> users[("users")]'],
				highlight: ['ins1', 'ins2'],
				note: 'Les deux requêtes lancent leur INSERT. Sans contrainte, les deux lignes arrivent et tu as un doublon. Rien n’a échoué, donc rien n’a été loggé. Tu l’apprends des semaines plus tard par un client perdu.'
			},
			{
				add: ['users --> idx["Index unique sur email"]', 'ins2 --> idx', 'idx -->|"SQLSTATE 23505"| err["ActiveRecord::RecordNotUnique"]'],
				highlight: ['idx', 'err'],
				note: 'Avec un index unique, le second INSERT échoue. Il doit placer sa clé dans l’index, trouve la même clé (en attendant d’abord si l’autre insert n’est pas encore validé), et reçoit une erreur `duplicate key`. Rails transforme le code `23505` en `RecordNotUnique`.'
			},
			{
				add: ['err --> msg["L’attraper : afficher « email déjà pris »"]'],
				highlight: ['msg'],
				note: 'L’appli attrape l’exception et affiche le même message « email déjà pris » que la validation aurait affiché. La validation attrape toujours le cas courant avant l’INSERT, et l’index attrape la course.'
			}
		]
	},
	example: {
		title: 'db/migrate/tables/journals.rb dans OpenProject : unique, check et exclusion sur une même table',
		repo: 'opf/openproject',
		url: `${OP}/db/migrate/tables/journals.rb#L34-L63`,
		lang: 'ruby',
		code: `    create_table migration do |t|
      t.references :journable, polymorphic: true, index: false
      t.bigint :user_id, null: false, index: true
      t.text :notes, null: true
      t.datetime :created_at, precision: nil, null: false, index: true
      t.integer :version, default: 0, null: false
      t.datetime :updated_at, precision: nil, default: -> { "CURRENT_TIMESTAMP" }
      t.references :data, polymorphic: true, index: false, null: false
      t.jsonb :cause, default: {}
      t.tstzrange :validity_period
      t.boolean :restricted, default: false, null: false

      t.index :journable_id
      t.index :journable_type
      t.index %i[journable_type journable_id version],
              unique: true
      t.index %i[data_id data_type],
              unique: true
      t.index :notes,
              using: "gin",
              opclass: :gin_trgm_ops

      t.check_constraint "NOT isempty(validity_period) AND validity_period IS NOT NULL",
                         name: "journals_validity_period_not_empty"

      t.exclusion_constraint "journable_id WITH =, journable_type WITH =, validity_period WITH &&",
                             name: "non_overlapping_journals_validity_periods",
                             using: :gist,
                             deferrable: :immediate
    end`,
		notes: [
			'Les lignes 15 et 16 donnent à chaque objet une seule ligne par numéro de version. Un journal est une entrée dans l’historique d’un work package. Avec l’[index unique](' + OP + '/db/migrate/tables/journals.rb#L48-L49) sur `(journable_type, journable_id, version)`, deux enregistrements en course sur le même work package ne peuvent pas écrire tous les deux la version 7. L’un d’eux reçoit `23505`.',
			'La ligne 23 écrit `IS NOT NULL` en toutes lettres parce que `isempty(NULL)` vaut NULL. D’après la [doc](' + PGDOC + '#DDL-CONSTRAINTS-CHECK-CONSTRAINTS), une contrainte CHECK est satisfaite si l’expression vaut vrai ou NULL. Sans la seconde moitié, une ligne sans aucune période passerait.',
			'Les lignes 26 à 29 interdisent à deux journaux du même objet d’avoir des `validity_period`s qui se chevauchent. D’après la doc, si on compare deux lignes avec les opérateurs donnés, au moins une comparaison doit renvoyer faux ou NULL. Comparer de simples ids avec `=` dans un index GiST demande l’extension [`btree_gist`](' + OP + '/db/migrate/extensions/btree_gist.rb#L32-L34), qu’OpenProject installe.',
			'Quand un nouveau journal est écrit, [`update_predecessor_sql`](' + OP + '/app/services/journals/create_service.rb#L405-L417) termine d’abord le précédent avec `tstzrange(lower(validity_period), ..., \'[)\')`. La borne haute est exclue, donc l’ancienne et la nouvelle période se touchent sans se chevaucher. Ligne 29, `deferrable: :immediate` fait émettre `DEFERRABLE INITIALLY IMMEDIATE` à Rails : PostgreSQL vérifie après chaque instruction, sauf si une transaction lance `SET CONSTRAINTS ... DEFERRED`.',
			'L’adaptateur PostgreSQL de Rails associe chaque SQLSTATE (`23505` unique, `23514` check, `23503` clé étrangère, `23P01` exclusion) à sa propre exception : [`RecordNotUnique`, `InvalidForeignKey`, `CheckViolation`, `ExclusionViolation`](' + RAILS + '/connection_adapters/postgresql_adapter.rb#L991-L1004) et d’autres. Tu peux attraper exactement celle que tu attends et laisser les autres planter avec une stack trace.'
		]
	},
	tradeoff: {
		gain: [
			'La règle tient pour chaque écrivain : deux serveurs d’appli, un job en arrière-plan, une session console, un script que quelqu’un lance à 2 h du matin.',
			'Dans une course, le second écrivain reçoit une erreur au lieu d’écrire un doublon. Un insert raté se voit dans les logs ; une ligne en double, non.',
			'La doc Rails de `validates_uniqueness_of` conseille d’ajouter un index unique à la table : « The best way to work around this problem is to add a unique index to the database table ».'
		],
		cost: [
			'Chaque contrainte coûte du travail à chaque écriture, et UNIQUE comme EXCLUDE entretiennent chacune un index. Une clé étrangère demande aussi un index côté référençant, que PostgreSQL ne crée pas pour toi.',
			'Un CHECK ne voit que la ligne en cours d’écriture. D’après la doc, PostgreSQL ne supporte pas de CHECK qui regarde d’autres données de la table que la ligne insérée ou modifiée.',
			'Ajouter une contrainte sur une grosse table en production la parcourt sous un verrou. Ça demande les étapes prudentes du jour 26.',
			'L’appli doit attraper l’erreur de la base et en faire un message. Sinon les utilisateurs voient une page 500 au lieu de « déjà pris ».'
		]
	},
	task: {
		prompt: 'Dans `psql`, conçois `bookings(id bigint primary key, room_id bigint not null, during tstzrange not null, price_cents int not null)`. Ajoute des contraintes pour que : une salle ne soit jamais réservée deux fois en même temps, le prix soit positif, et chaque réservation ait une vraie salle. Puis prédis lequel de ces inserts pour la salle 1 échoue : 10 h à 11 h, 11 h à 12 h, 10 h 30 à 11 h 30.',
		hint: '`tstzrange(a, b)` utilise des bornes `[)` par défaut : le début est inclus, la fin exclue. Mélanger `=` sur un bigint et `&&` sur un intervalle dans une même contrainte GiST demande une extension.',
		answer: [
			'`CREATE EXTENSION btree_gist;` puis `ALTER TABLE bookings ADD CONSTRAINT no_double_booking EXCLUDE USING gist (room_id WITH =, during WITH &&);`',
			'`ALTER TABLE bookings ADD CONSTRAINT price_positive CHECK (price_cents > 0);` et `ALTER TABLE bookings ADD FOREIGN KEY (room_id) REFERENCES rooms (id);` plus `CREATE INDEX ON bookings (room_id);`, puisque la clé étrangère ne l’indexe pas.',
			'10 h à 11 h réussit. 11 h à 12 h réussit aussi : avec des bornes `[)`, le premier intervalle s’arrête juste avant 11 h, donc les deux ne font que se toucher.',
			'10 h 30 à 11 h 30 chevauche les deux et échoue avec `conflicting key value violates exclusion constraint "no_double_booking"`, SQLSTATE `23P01`. Deux sessions qui l’insèrent en même temps ne peuvent pas gagner toutes les deux. La plus tardive attend que la première finisse, puis échoue. Si les deux insèrent avant que l’une ou l’autre vérifie, le détecteur de deadlocks annule l’une d’elles, donc l’erreur que tu vois peut être un deadlock.'
		],
		steps: [
			{
				title: 'Associe chaque règle à une contrainte',
				questions: [
					{ q: '« Une salle n’est jamais réservée deux fois en même temps. » Quelle contrainte convient ?', options: ['Un CHECK sur `during`', 'Un index UNIQUE sur `(room_id, during)`', 'Une contrainte d’exclusion avec `=` sur `room_id` et `&&` sur `during`', 'Une clé étrangère de `during` vers `rooms`'], answer: 2, why: 'La règle compare une ligne aux autres par chevauchement. UNIQUE n’attrape que les valeurs égales, et deux intervalles qui se chevauchent ne sont pas égaux.' },
					{ q: '« Le prix est positif. » Quelle contrainte convient ?', options: ['`CHECK (price_cents > 0)`', 'Une contrainte d’exclusion sur `price_cents`', 'Un index UNIQUE sur `price_cents`', 'Une clé étrangère vers une table `prices`'], answer: 0, why: 'La règle ne regarde qu’une ligne, exactement ce que voit un CHECK.' },
					{ q: '« Chaque réservation a une vraie salle. » Quelle contrainte convient ?', options: ['`CHECK (room_id > 0)`', 'Un index UNIQUE sur `room_id`', '`NOT NULL` sur `room_id`, seul', 'Une clé étrangère de `room_id` vers `rooms (id)`'], answer: 3, why: 'Seule une clé étrangère vérifie que la valeur existe dans une autre table. `NOT NULL` dit seulement qu’une valeur est présente.' },
					{ q: 'Pourquoi ne pas chercher un chevauchement dans l’appli avec un SELECT avant l’INSERT ?', options: ['Un SELECT ne sait pas comparer des intervalles', 'Une autre requête peut insérer entre le SELECT et l’INSERT', 'PostgreSQL interdit un SELECT sur une table avec contraintes', 'Le SELECT verrouillerait toute la table `bookings`'], answer: 1, why: 'C’est la course vérifier-puis-agir. La contrainte vérifie dans l’écriture elle-même, sous ses propres verrous.' }
				]
			},
			{
				title: 'Écris la règle anti-chevauchement',
				questions: [
					{ q: 'Que faut-il lancer avant de pouvoir créer la contrainte d’exclusion ?', options: ['`CREATE EXTENSION btree_gist;`', '`CREATE INDEX ON bookings (during);`', '`SET CONSTRAINTS ALL DEFERRED;`', '`CREATE EXTENSION pg_trgm;`'], answer: 0, why: 'Comparer un simple bigint avec `=` dans un index GiST demande `btree_gist`. OpenProject l’installe pour la même raison.' },
					{ q: 'Quelle instruction ajoute la règle ?', options: ['`ALTER TABLE bookings ADD CONSTRAINT no_double_booking UNIQUE (room_id, during);`', '`ALTER TABLE bookings ADD CONSTRAINT no_double_booking CHECK (NOT during && during);`', '`ALTER TABLE bookings ADD CONSTRAINT no_double_booking EXCLUDE USING btree (room_id WITH =, during WITH &&);`', '`ALTER TABLE bookings ADD CONSTRAINT no_double_booking EXCLUDE USING gist (room_id WITH =, during WITH &&);`'], answer: 3, why: 'Deux lignes sont en conflit quand la salle est la même et que les intervalles se chevauchent. GiST est l’index qui sait répondre à `&&`.' },
					{ q: 'Comment PostgreSQL lit-il `room_id WITH =, during WITH &&` ?', options: ['Deux lignes sont en conflit si une seule des comparaisons est vraie', 'Deux lignes sont en conflit seulement si toutes les comparaisons sont vraies', 'Chaque ligne est comparée à elle-même', 'La seconde comparaison ne tourne que si la première est fausse'], answer: 1, why: 'La doc : au moins une comparaison doit renvoyer faux ou null. Un conflit demande donc la même salle et un chevauchement.' },
					{ q: 'Pourquoi un CHECK ne peut-il pas imposer cette règle ?', options: ['Un CHECK ne voit que la ligne en cours d’écriture', 'Un CHECK ne peut pas utiliser l’opérateur `&&`', 'Un CHECK est ignoré dans les transactions', 'Un CHECK tourne avant que la ligne ait un id'], answer: 0, why: 'La règle compare les lignes entre elles. Un CHECK voit une seule ligne, et une sous-requête dedans n’est pas supportée.' }
				]
			},
			{
				title: 'Ajoute les deux autres règles',
				questions: [
					{ q: 'Quelle instruction ajoute la règle du prix ?', options: ['`ALTER TABLE bookings ADD CONSTRAINT price_positive CHECK (price_cents >= 0);`', '`ALTER TABLE bookings ADD CONSTRAINT price_positive CHECK (price_cents > 0);`', '`ALTER TABLE bookings ALTER price_cents SET DEFAULT 1;`', '`ALTER TABLE bookings ADD CONSTRAINT price_positive UNIQUE (price_cents);`'], answer: 1, why: 'Positif veut dire strictement au-dessus de zéro. `>= 0` laisserait encore passer une réservation gratuite.' },
					{ q: 'Tu ajoutes `FOREIGN KEY (room_id) REFERENCES rooms (id)`. Qu’ajoutes-tu d’autre ?', options: ['Rien : la clé étrangère indexe `room_id` pour toi', 'Un index UNIQUE sur `rooms (id)`, dont la clé a besoin', '`CREATE INDEX ON bookings (room_id);`', 'Un CHECK qui impose un `room_id` positif'], answer: 2, why: 'PostgreSQL n’indexe pas le côté qui référence d’une clé étrangère. Tu crées cet index toi-même.' },
					{ q: '`CHECK (price_cents > 0)` laisserait-il passer une ligne dont le prix est NULL ?', options: ['Oui : un CHECK qui vaut NULL passe, c’est pourquoi la colonne est aussi `not null`', 'Non : NULL n’est jamais plus grand que zéro', 'Non : un CHECK implique NOT NULL', 'Seulement si la ligne est écrite dans une transaction'], answer: 0, why: 'Un CHECK ne rejette que faux. Ici, `price_cents int not null` bouche ce trou.' },
					{ q: 'Une réservation arrive pour la salle 2, et `rooms` n’a pas de ligne 2. Que se passe-t-il ?', options: ['L’insert réussit, et la salle sera créée plus tard', 'L’insert échoue sur le CHECK', 'L’insert échoue sur la contrainte d’exclusion', 'L’insert échoue sur la clé étrangère'], answer: 3, why: 'La clé étrangère vérifie que `rooms` contient l’id. Rails traduit cette erreur en `InvalidForeignKey`.' }
				]
			},
			{
				title: 'Prédis les trois inserts',
				questions: [
					{ q: 'Premier insert pour la salle 1 : 10 h à 11 h. Que se passe-t-il ?', options: ['Il échoue : la salle n’a encore aucune réservation', 'Il attend que l’index d’exclusion soit construit', 'Il réussit', 'Il échoue sur le CHECK'], answer: 2, why: 'Rien d’autre n’est réservé, donc rien ne chevauche.' },
					{ q: 'Deuxième insert : 11 h à 12 h. Que se passe-t-il ?', options: ['Il réussit : avec des bornes `[)`, le premier intervalle s’arrête juste avant 11 h', 'Il échoue : les deux intervalles contiennent 11 h', 'Il échoue : deux réservations ne peuvent pas partager une borne', 'Il réussit seulement si tu écris des bornes `[]`'], answer: 0, why: '`tstzrange(a, b)` inclut le début et exclut la fin. Les deux intervalles se touchent sans se chevaucher.' },
					{ q: 'Troisième insert : 10 h 30 à 11 h 30. Qu’obtient-il ?', options: ['`23505`, une erreur de clé dupliquée', '`23514`, une violation de CHECK', 'Un succès, puisqu’il ne correspond exactement à aucun intervalle', '`23P01`, un conflit sur `no_double_booking`'], answer: 3, why: 'Il chevauche les deux réservations. `23P01` est le SQLSTATE d’une violation d’exclusion.' },
					{ q: 'Deux sessions insèrent 10 h 30 à 11 h 30 pour la salle 1 au même moment, dans une table vide. Que se passe-t-il ?', options: ['Les deux réussissent, puisqu’aucune ne voit l’autre', 'La plus tardive attend que la première finisse, puis échoue', 'PostgreSQL garde la réservation la plus courte', 'Les deux échouent avec `23P01`'], answer: 1, why: 'Le second insert attend sur l’entrée d’index du premier. Si les deux insèrent avant que l’une vérifie, le détecteur de deadlocks annule l’une d’elles.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un modèle a `validates :slug, uniqueness: true` et aucun index. Deux requêtes enregistrent le même slug au même moment. Que se passe-t-il en général ?',
			options: [
				'Le second enregistrement échoue à la validation, car Rails verrouille la table pendant la vérification',
				'Les deux passent la validation et les deux lignes sont écrites, ce qui laisse un doublon',
				'PostgreSQL détecte deux valeurs égales et supprime la seconde ligne sans rien dire',
				'Le second enregistrement attend le commit du premier, puis échoue à la validation'
			],
			answer: 1,
			why: 'La validation est un SELECT suivi d’un INSERT, sans verrou entre les deux. Les deux SELECT peuvent tourner avant qu’aucun INSERT soit validé. Seul un index unique fait échouer le second INSERT.'
		},
		{
			q: 'Tu ajoutes `CHECK (ends_at > starts_at)`. Une ligne est insérée avec `ends_at` à NULL. Que se passe-t-il ?',
			options: [
				'L’insert échoue, parce que NULL n’est plus grand qu’aucune valeur de date',
				'L’insert échoue, parce qu’un CHECK implique que les deux colonnes sont NOT NULL',
				'L’insert réussit, et le CHECK tournera plus tard quand la valeur sera remplie',
				'L’insert réussit, parce qu’un CHECK qui vaut NULL est considéré comme satisfait'
			],
			answer: 3,
			why: '`NULL > starts_at` vaut NULL, pas faux, et un CHECK ne rejette que faux (jour 6). Ajoute `NOT NULL` sur la colonne, ou `IS NOT NULL` dans l’expression, comme le fait OpenProject.'
		},
		{
			q: 'Pourquoi un CHECK ne peut-il pas imposer « une salle a au plus une réservation à la fois » ?',
			options: [
				'Un CHECK ne voit que la ligne en cours d’écriture, pas les autres lignes de la table',
				'Un CHECK ne peut pas utiliser d’opérateurs d’intervalle comme `&&` dans son expression',
				'Un CHECK est ignoré pour les lignes écrites dans une transaction explicite ouverte',
				'Un CHECK tourne avant que la ligne ait son id, donc il ne distingue pas les lignes'
			],
			answer: 0,
			why: 'La règle compare une ligne aux autres. Un CHECK voit une seule ligne, et une sous-requête dedans n’est pas supportée. Une contrainte d’exclusion compare la nouvelle ligne aux lignes existantes grâce à son index.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Laisser PostgreSQL refuser une double réservation, une réservation gratuite et une réservation pour une salle qui n’existe pas.',
		steps: [
			'Lance PostgreSQL : `docker run -d --name dojo-pg -e POSTGRES_PASSWORD=dojo postgres:17`. Attends que `docker exec dojo-pg pg_isready` affiche `accepting connections`, puis ouvre `docker exec -it dojo-pg psql -U postgres`.',
			'Crée les tables : `CREATE TABLE rooms (id bigint PRIMARY KEY); INSERT INTO rooms VALUES (1);` puis `CREATE TABLE bookings (id bigint PRIMARY KEY, room_id bigint NOT NULL, during tstzrange NOT NULL, price_cents int NOT NULL);`',
			'Essaie d’abord la règle anti-chevauchement sans l’extension : `ALTER TABLE bookings ADD CONSTRAINT no_double_booking EXCLUDE USING gist (room_id WITH =, during WITH &&);`. Lis l’erreur, lance `CREATE EXTENSION btree_gist;` et renvoie le même ALTER.',
			'Ajoute les autres règles : `ALTER TABLE bookings ADD CONSTRAINT price_positive CHECK (price_cents > 0);`, `ALTER TABLE bookings ADD FOREIGN KEY (room_id) REFERENCES rooms (id);` et `CREATE INDEX ON bookings (room_id);`',
			'Lance `\\set VERBOSITY verbose` pour que les erreurs montrent leur SQLSTATE. Puis insère les trois réservations : `INSERT INTO bookings VALUES (1, 1, tstzrange(\'2026-11-02 10:00+00\', \'2026-11-02 11:00+00\'), 9000);`, la même avec l’id 2 et 11 h à 12 h, et avec l’id 3 et 10 h 30 à 11 h 30.',
			'Casse les deux autres règles : un insert avec `price_cents` à 0, et un pour la `room_id` 2.',
			'Fais la course : ouvre un second terminal avec la même commande `psql`. Dans le premier, `BEGIN;` et insère la salle 1 un autre jour, de 10 h à 11 h. Dans le second, insère le même créneau avec un nouvel id. Puis `COMMIT;` dans le premier.'
		],
		done: [
			'Sans `btree_gist`, l’ALTER échoue avec `data type bigint has no default operator class for access method "gist"`.',
			'Les réservations 1 et 2 affichent `INSERT 0 1`. La réservation 3 échoue avec `23P01` et `conflicting key value violates exclusion constraint "no_double_booking"`.',
			'La réservation gratuite échoue sur `price_positive`, et la salle 2 échoue sur `bookings_room_id_fkey`.',
			'Pendant la course, le second insert reste bloqué jusqu’au commit du premier, puis échoue sur `no_double_booking`.'
		],
		solution: [
			'11 h à 12 h passe parce que `tstzrange` utilise des bornes `[)` : 10 h à 11 h s’arrête juste avant 11 h.',
			'La ligne DETAIL de l’erreur `23P01` nomme les deux clés : la nouvelle réservation et celle avec qui elle entre en conflit.',
			'La seconde session attend sur l’entrée d’index de la première, donc un SELECT puis INSERT dans l’appli ne pourrait jamais donner la même garantie.',
			'Nettoie avec `docker rm -f dojo-pg`.'
		]
	},
	recall: {
		q: 'Deux inscriptions avec le même email arrivent à 40 ms d’écart, et le modèle a `validates :email, uniqueness: true`. Qu’est-ce qui empêche le doublon, et que reçoit la seconde requête ?',
		a: 'Un index unique sur `email`. Le second INSERT échoue avec le SQLSTATE `23505`, Rails lève `ActiveRecord::RecordNotUnique`, et l’appli l’attrape pour afficher « email déjà pris ».'
	},
	sources: [
		{ title: 'PostgreSQL docs, Constraints', url: PGDOC },
		{ title: 'PostgreSQL docs, Range Types: constraints on ranges', url: 'https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT' },
		{ title: 'PostgreSQL docs, btree_gist', url: 'https://www.postgresql.org/docs/current/btree-gist.html' },
		{ title: 'Rails API, validates_uniqueness_of', url: 'https://api.rubyonrails.org/classes/ActiveRecord/Validations/ClassMethods.html#method-i-validates_uniqueness_of' }
	]
};
