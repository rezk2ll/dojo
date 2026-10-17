/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sql-ddl',
	part: 'SQL',
	title: 'Tables et index',
	minutes: 10,
	hook: [
		'Ton équipe ajoute les tickets de support à l’appli. Tu écris la migration : deux nouvelles tables, puis des colonnes et des index ajoutés plus tard, pendant que l’appli continue d’écrire des tickets. Un `CREATE INDEX` simple bloque les insertions, les mises à jour et les suppressions sur la table jusqu’à la fin de la construction.',
		'La base est PostgreSQL. Au départ, elle a la table `users (id bigint PRIMARY KEY, email text NOT NULL)` et quelques utilisateurs. Chaque exercice tourne sur la base que les exercices précédents ont laissée. L’exercice 2 crée `tickets`, et l’appli y ajoute quelques tickets avant l’exercice 3.'
	],
	terms: [
		{ term: 'contrainte', def: 'Une règle sur une colonne ou une table que PostgreSQL vérifie à chaque insertion et mise à jour, comme NOT NULL, UNIQUE, CHECK ou une clé étrangère.' },
		{ term: 'clé étrangère', def: 'Une contrainte qui n’accepte dans une colonne que des valeurs présentes dans une colonne d’une autre table, ici `tickets.user_id` et `users.id`.' },
		{ term: 'bloc de transaction', def: 'Les requêtes entre `BEGIN` et `COMMIT`. Certaines commandes, comme `CREATE INDEX CONCURRENTLY`, refusent de s’y exécuter.' }
	],
	reps: [
		{
			prompt: 'Crée la table `tags` avec une clé primaire `id int` et un `name text` obligatoire et unique.',
			accept: [
				'CREATE TABLE tags (id int PRIMARY KEY, name text NOT NULL UNIQUE)',
				'create table tags (id int primary key, name text not null unique)',
				'CREATE TABLE tags (id int PRIMARY KEY, name text UNIQUE NOT NULL)',
				'create table tags (id int primary key, name text unique not null)',
				'CREATE TABLE tags(id int PRIMARY KEY, name text NOT NULL UNIQUE)',
				'create table tags(id int primary key, name text not null unique)',
				'CREATE TABLE tags (id integer PRIMARY KEY, name text NOT NULL UNIQUE)',
				'create table tags (id integer primary key, name text not null unique)'
			],
			why: '`PRIMARY KEY` rend `id` unique et non nul. `NOT NULL UNIQUE` sur `name` refuse un nom absent et un deuxième tag du même nom. PostgreSQL construit un index unique pour chacun : `tags_pkey` et `tags_name_key`.'
		},
		{
			prompt: 'Crée `tickets` avec une clé primaire `id bigint`, un `user_id bigint` obligatoire qui doit correspondre à un `users.id`, et un `title text` obligatoire.',
			accept: [
				'CREATE TABLE tickets (id bigint PRIMARY KEY, user_id bigint NOT NULL REFERENCES users (id), title text NOT NULL)',
				'create table tickets (id bigint primary key, user_id bigint not null references users (id), title text not null)',
				'CREATE TABLE tickets (id bigint PRIMARY KEY, user_id bigint NOT NULL REFERENCES users(id), title text NOT NULL)',
				'create table tickets (id bigint primary key, user_id bigint not null references users(id), title text not null)',
				'CREATE TABLE tickets (id bigint PRIMARY KEY, user_id bigint NOT NULL REFERENCES users, title text NOT NULL)',
				'create table tickets (id bigint primary key, user_id bigint not null references users, title text not null)',
				'CREATE TABLE tickets(id bigint PRIMARY KEY, user_id bigint NOT NULL REFERENCES users (id), title text NOT NULL)'
			],
			why: '`REFERENCES users (id)` déclare une clé étrangère : une insertion avec un `user_id` qu’aucun utilisateur n’a échoue. Écrit `REFERENCES users`, il vise la clé primaire de `users`. Le `NOT NULL` compte aussi, car un `user_id` NULL passe la clé étrangère.'
		},
		{
			prompt: 'Ajoute une colonne `status text` à `tickets`. Elle est obligatoire, et les tickets existants reçoivent `\'open\'`.',
			accept: [
				"ALTER TABLE tickets ADD COLUMN status text NOT NULL DEFAULT 'open'",
				"alter table tickets add column status text not null default 'open'",
				"ALTER TABLE tickets ADD COLUMN status text DEFAULT 'open' NOT NULL",
				"alter table tickets add column status text default 'open' not null",
				"ALTER TABLE tickets ADD status text NOT NULL DEFAULT 'open'",
				"alter table tickets add status text not null default 'open'",
				"ALTER TABLE tickets ADD status text DEFAULT 'open' NOT NULL"
			],
			why: '`DEFAULT \'open\'` remplit les lignes existantes, donc le `NOT NULL` tient dès le départ. Sans valeur par défaut, le `NOT NULL` échoue sur une table qui contient déjà des tickets. Le mot `COLUMN` est facultatif.'
		},
		{
			prompt: 'Ajoute à `tickets` une colonne `priority int` qui n’accepte que les valeurs de 1 à 4. Mets la vérification sur la colonne.',
			accept: [
				'ALTER TABLE tickets ADD COLUMN priority int CHECK (priority BETWEEN 1 AND 4)',
				'alter table tickets add column priority int check (priority between 1 and 4)',
				'ALTER TABLE tickets ADD priority int CHECK (priority BETWEEN 1 AND 4)',
				'alter table tickets add priority int check (priority between 1 and 4)',
				'ALTER TABLE tickets ADD COLUMN priority int CHECK (priority >= 1 AND priority <= 4)',
				'alter table tickets add column priority int check (priority >= 1 and priority <= 4)',
				'ALTER TABLE tickets ADD COLUMN priority int CHECK(priority BETWEEN 1 AND 4)'
			],
			why: 'Une insertion avec `priority` à 5 échoue, car la vérification donne faux. Une priorité NULL passe. La doc : "a check constraint is satisfied if the check expression evaluates to true or the null value." (vrai ou NULL suffit).'
		},
		{
			prompt: 'Ajoute un index nommé `tickets_user_id_idx` sur `tickets.user_id`.',
			accept: [
				'CREATE INDEX tickets_user_id_idx ON tickets (user_id)',
				'create index tickets_user_id_idx on tickets (user_id)',
				'CREATE INDEX tickets_user_id_idx ON tickets(user_id)',
				'create index tickets_user_id_idx on tickets(user_id)',
				'CREATE INDEX tickets_user_id_idx ON tickets USING btree (user_id)',
				'create index tickets_user_id_idx on tickets using btree (user_id)'
			],
			why: 'Le nom vient après `CREATE INDEX`, la table et les colonnes après `ON`. Une clé étrangère ne crée pas d’index sur `tickets.user_id` : tu l’ajoutes toi-même. La méthode d’index par défaut est `btree`.'
		},
		{
			prompt: '`tickets` a maintenant des millions de lignes et reçoit des écritures toute la journée. Ajoute un index nommé `tickets_status_idx` sur `status` sans bloquer les insertions et les mises à jour pendant sa construction.',
			accept: [
				'CREATE INDEX CONCURRENTLY tickets_status_idx ON tickets (status)',
				'create index concurrently tickets_status_idx on tickets (status)',
				'CREATE INDEX CONCURRENTLY tickets_status_idx ON tickets(status)',
				'create index concurrently tickets_status_idx on tickets(status)'
			],
			why: 'Un `CREATE INDEX` simple "locks out writes (but not reads) on the table until it\'s done" (bloque les écritures jusqu’à la fin). `CONCURRENTLY` parcourt la table deux fois et laisse passer les écritures, donc il prend plus de temps. Il refuse de tourner dans un bloc de transaction, et s’il échoue il laisse un index marqué `INVALID` à supprimer puis reconstruire.'
		},
		{
			prompt: 'Supprime l’index `tickets_status_idx` sans bloquer les écritures sur `tickets`.',
			accept: [
				'DROP INDEX CONCURRENTLY tickets_status_idx',
				'drop index concurrently tickets_status_idx',
				'DROP INDEX CONCURRENTLY IF EXISTS tickets_status_idx',
				'drop index concurrently if exists tickets_status_idx'
			],
			why: '`DROP INDEX` prend un nom d’index, sans `ON table`. Un `DROP INDEX` simple bloque toute lecture et toute écriture sur `tickets` jusqu’à la fin. `CONCURRENTLY` attend plutôt la fin des transactions en conflit. Comme la construction, il refuse de tourner dans un bloc de transaction et ne prend qu’un seul nom d’index.'
		},
		{
			prompt: 'Supprime la table `tags`, sans erreur si elle n’existe déjà plus.',
			accept: ['DROP TABLE IF EXISTS tags', 'drop table if exists tags'],
			why: 'Avec `IF EXISTS`, la table absente donne seulement un avis : `table "tags" does not exist, skipping`. Une migration lancée deux fois ne s’arrête donc pas au deuxième passage.'
		},
		{
			prompt: 'Supprime la table `users`, alors que la clé étrangère de `tickets.user_id` pointe vers elle.',
			accept: ['DROP TABLE users CASCADE', 'drop table users cascade'],
			why: 'Sans `CASCADE`, PostgreSQL refuse, car `tickets` dépend de `users`. Avec, PostgreSQL supprime `users` et la contrainte de clé étrangère de `tickets`. La table `tickets` et ses lignes restent.'
		}
	],
	quiz: [],
	recall: {
		q: 'Quelle option construit un index sur une table chargée sans bloquer les insertions et les mises à jour, et où ne peut-elle pas tourner ?',
		a: '`CREATE INDEX CONCURRENTLY`. Elle ne peut pas tourner dans un bloc de transaction, entre `BEGIN` et `COMMIT`.'
	},
	sources: [
		{ title: 'PostgreSQL : CREATE TABLE', url: 'https://www.postgresql.org/docs/current/sql-createtable.html' },
		{ title: 'PostgreSQL : contraintes', url: 'https://www.postgresql.org/docs/current/ddl-constraints.html' },
		{ title: 'PostgreSQL : ALTER TABLE', url: 'https://www.postgresql.org/docs/current/sql-altertable.html' },
		{ title: 'PostgreSQL : CREATE INDEX', url: 'https://www.postgresql.org/docs/current/sql-createindex.html' },
		{ title: 'PostgreSQL : DROP INDEX', url: 'https://www.postgresql.org/docs/current/sql-dropindex.html' },
		{ title: 'PostgreSQL : DROP TABLE', url: 'https://www.postgresql.org/docs/current/sql-droptable.html' }
	]
};
