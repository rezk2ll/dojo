/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'multi-tenant',
	part: 'Les données',
	title: 'Les données d’un SaaS multi-clients',
	minutes: 10,
	hook: [
		'Un logiciel de facturation sert 3 000 entreprises depuis une seule base PostgreSQL. La plupart sont des boulangeries et de petites agences avec quelques centaines de factures par mois. L’une est une chaîne de magasins avec 300 Go de données.',
		'Le dernier jour de chaque mois, la chaîne lance ses rapports, et les pages de factures des boulangeries mettent 4 secondes à s’ouvrir.',
		'La semaine dernière, un développeur a livré une requête sans `WHERE tenant_id = ...`. Un client a vu la liste de factures d’une autre entreprise pendant 20 minutes.'
	],
	terms: [
		{ term: 'Tenant', def: 'Une entreprise cliente. Chaque ligne de données appartient à un seul tenant, indiqué par une colonne `tenant_id`.' },
		{ term: 'Sécurité au niveau ligne', def: 'Une fonction de PostgreSQL (row-level security) : une politique sur une table décide quelles lignes chaque requête voit ou modifie, quel que soit son propre `WHERE`.' },
		{ term: 'Pool et silo', def: 'Pool : plusieurs tenants partagent les mêmes tables. Silo : un tenant a sa propre base.' }
	],
	kata: {
		brief: [
			'3 000 entreprises clientes, 40 tables, un seul schéma. 2 995 entreprises totalisent 900 Go, environ 300 Mo chacune. Les 5 plus grosses totalisent 800 Go, la plus grosse 300 Go.',
			'Une requête d’une entreprise ne doit jamais renvoyer les lignes d’une autre, même quand le développeur a oublié le filtre `tenant_id`.',
			'Les gros rapports d’une entreprise ne doivent pas ralentir les autres : les pages de factures restent sous 500 ms pour tout le monde.',
			'Chaque entreprise peut demander un export de toutes ses données en fichiers CSV, livré sous 24 heures.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit où vivent les données d’une entreprise de 300 Mo, et celles de l’entreprise de 300 Go.',
			'Ton design dit ce qui empêche une requête sans filtre `tenant_id` de renvoyer les lignes d’autres entreprises.',
			'Ton design dit comment le tenant courant arrive jusqu’à la base sur une connexion partagée d’un pool, et comment il est effacé avant la requête suivante.',
			'Ton design dit comment une requête trouve la bonne base pour son tenant.',
			'Ton design dit comment est produit l’export d’une entreprise, et sur quel serveur il tourne.',
			'Ton design dit comment tu restaures les données d’une entreprise qui a supprimé 1 000 factures par erreur.'
		],
		sample: [
			'Les 2 995 petites entreprises partagent un cluster PostgreSQL (le pool, 900 Go). Chacune des 5 plus grosses a son propre cluster avec le même schéma (un silo). Une table de routage `tenant_id → cluster` est lue à la connexion de l’utilisateur et gardée en cache par l’appli.',
			'Dans le pool, chaque table a `tenant_id`, et chaque clé primaire et chaque index commence par cette colonne. Chaque table a `ENABLE ROW LEVEL SECURITY` et une politique `USING (tenant_id = current_setting(\'app.tenant_id\', true)::bigint)`. La doc PostgreSQL : si une table a la sécurité au niveau ligne sans politique, "a default-deny policy is used" (aucune ligne n’est visible).',
			'La doc précise aussi que "Superusers and roles with the BYPASSRLS attribute always bypass" cette sécurité, et que les propriétaires des tables y échappent en général. L’appli se connecte donc avec un rôle qui ne possède aucune table et n’a pas `BYPASSRLS`. Les migrations tournent avec un autre rôle, propriétaire.',
			'Chaque transaction commence par `SET LOCAL app.tenant_id = \'123\'`. La doc : "The effects of SET LOCAL last only till the end of the current transaction, whether committed or not". Une connexion du pool ne passe donc jamais le tenant 123 à la requête suivante. Sur une connexion où le réglage n’a jamais été posé, `current_setting(\'app.tenant_id\', true)` renvoie NULL et la politique ne laisse passer aucune ligne.',
			'Les silos règlent le ralentissement de fin de mois : les rapports de la chaîne tournent sur son cluster et ses disques. Le prix, ce sont 6 clusters : chaque migration de schéma tourne 6 fois, et une petite entreprise qui dépasse 100 Go demande une copie et un court gel des écritures pour passer en silo.',
			'Les exports tournent sur un réplica du cluster du tenant, et le primaire continue de servir les pages. Pour chacune des 40 tables, une tâche lance `COPY (SELECT * FROM invoices WHERE tenant_id = 123) TO STDOUT WITH (FORMAT csv)` et écrit le résultat dans un zip en stockage objet. En supposant 50 Mo/s, 300 Mo prennent 6 secondes et 300 Go environ 100 minutes, bien sous les 24 heures.',
			'Dans le pool, restaurer une seule entreprise demande un détour. Une sauvegarde restaure tout le cluster de 900 Go : tu le restaures sur un serveur à part, puis tu recopies les lignes de cette entreprise avec les mêmes requêtes `COPY`. Une entreprise en silo se restaure seule.',
			'Dans le pool, seule la politique sépare les tenants. Un `SET` simple au lieu de `SET LOCAL` laisse le tenant sur la connexion jusqu’à la fin de la session : la doc dit qu’un `SET` simple dure "until the end of the session". Une règle de revue de code et un test qui cherche `SET app.tenant_id` dans le code couvrent ce risque.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse proposée, qu’est-ce qui empêche une requête qui a oublié `WHERE tenant_id = ...` de renvoyer les lignes d’une autre entreprise ?',
		a: 'Une politique de sécurité au niveau ligne `tenant_id = current_setting(\'app.tenant_id\', true)::bigint` sur chaque table du pool, avec `SET LOCAL app.tenant_id` au début de chaque transaction et un rôle d’appli qui ne possède aucune table et n’a pas `BYPASSRLS`.'
	},
	sources: [
		{ title: 'Doc PostgreSQL, Row Security Policies', url: 'https://www.postgresql.org/docs/current/ddl-rowsecurity.html' },
		{ title: 'Doc PostgreSQL, SET (SET LOCAL dure jusqu’à la fin de la transaction)', url: 'https://www.postgresql.org/docs/current/sql-set.html' },
		{ title: 'Doc PostgreSQL, COPY (copier le résultat d’un SELECT)', url: 'https://www.postgresql.org/docs/current/sql-copy.html' }
	]
};
