const SUPA = 'https://github.com/supabase/supabase/blob/5281766182090278491a5b0eeb4bf3fa1b49c408/examples/slack-clone/nextjs-slack-clone/supabase/migrations';
const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/doc/src/sgml';
const PGRST = 'https://github.com/PostgREST/postgrest/blob/c042567494b1cbb5009005b82c78d9e5da8b4a2a/docs';
const AUTH = 'https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/migrations';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'access-control',
	part: 'La garder en marche',
	title: 'Rôles, droits et sécurité au niveau des lignes',
	minutes: 10,
	hook: [
		'Un ticket au support : un client a ouvert une page de facture et a vu **la facture d’une autre entreprise**. Une nouvelle requête, dans un seul contrôleur, a oublié `WHERE tenant_id = ?`. Toutes les autres l’avaient. La revue de code ne l’a pas vu.',
		'Puis l’audit : l’application se connecte en `postgres`, le superutilisateur. Une seule injection SQL, dans n’importe quelle requête, pourrait lire toutes les tables, ou les supprimer.',
		'PostgreSQL contrôle l’accès à deux niveaux. Les rôles et `GRANT` décident quelles tables une connexion a le droit de toucher. **La sécurité au niveau des lignes** (RLS) décide quelles lignes de ces tables elle voit : la base ajoute le filtre à chaque requête, y compris celle qui l’a oublié.'
	],
	terms: [
		{ term: 'Rôle', def: 'Une identité dans la base. Il peut se connecter (un utilisateur), ou porter des droits pour d’autres (un groupe). Un rôle peut être membre d’autres rôles.' },
		{ term: 'Row-level security (RLS)', def: 'Des policies par table qui filtrent les lignes qu’une requête peut lire ou écrire. S’active avec `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.' },
		{ term: 'USING / WITH CHECK', def: '`USING` filtre les lignes existantes qu’une commande voit. `WITH CHECK` teste les nouvelles lignes qu’elle essaie d’écrire. Un check raté annule la commande.' },
		{ term: 'Contournement', def: 'Les superutilisateurs et les rôles avec `BYPASSRLS` ignorent toutes les policies. Le propriétaire de la table aussi, sauf si la table a `FORCE ROW LEVEL SECURITY`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['req["Requête HTTP avec un JWT"] --> api["PostgREST, connecté en authenticator"]'],
				highlight: ['req', 'api'],
				note: 'PostgREST, la couche d’API sous Supabase, garde un pool de connexions sous un seul rôle, `authenticator`, qui n’a presque aucun droit. Sa doc l’appelle "a chameleon" (un caméléon), parce qu’il passe à un autre rôle pour chaque requête.'
			},
			{
				add: ['api -->|"SET LOCAL ROLE authenticated"| role["Rôle authenticated"]'],
				highlight: ['role'],
				note: 'Pour chaque requête, PostgREST vérifie le JWT et lance `SET LOCAL ROLE` avec le rôle nommé dans le token, pour cette transaction seulement. Il range aussi les claims dans un paramètre, `request.jwt.claims`, que le SQL peut lire.'
			},
			{
				add: ['role -->|"GRANT SELECT, INSERT, DELETE"| msgs[("messages")]'],
				highlight: ['msgs'],
				note: 'Sans GRANT sur la table, la requête échoue avec `permission denied` avant de lire la moindre ligne. Donne à chaque rôle seulement les commandes dont il a besoin, jusqu’à une seule colonne pour `UPDATE`.'
			},
			{
				add: ['pol["Policy : auth.uid() = user_id"] -.->|"filtre chaque ligne"| msgs'],
				highlight: ['pol'],
				note: 'Avec la RLS active, chaque ligne doit passer l’expression d’une policy, évaluée "prior to any conditions or functions coming from the user\'s query" (avant toute condition de la requête). Une requête sans aucun `WHERE` ne renvoie quand même que les lignes de l’appelant. RLS active et aucune policy : aucune ligne.'
			},
			{
				add: ['owner["Propriétaire, superutilisateur, BYPASSRLS"] -->|"ignore les policies"| msgs'],
				highlight: ['owner'],
				note: 'Le superutilisateur et les rôles avec `BYPASSRLS` ignorent les policies, et le propriétaire de la table aussi, par défaut. Si l’application se connecte avec le rôle qui a lancé les migrations, ses requêtes passent outre toutes les policies. Utilise un rôle séparé, ou `FORCE ROW LEVEL SECURITY`.'
			}
		]
	},
	example: {
		title: 'Clone de Slack de Supabase, supabase/migrations/20240214102356_init.sql : des policies par commande et par rôle',
		repo: 'supabase/supabase',
		url: `${SUPA}/20240214102356_init.sql#L57-L92`,
		lang: 'sql',
		code: `create function public.authorize(
  requested_permission app_permission
)
returns boolean as $$
declare
  bind_permissions int;
begin
  select count(*)
  from public.role_permissions
  where role_permissions.permission = authorize.requested_permission
    and role_permissions.role = (auth.jwt() ->> 'user_role')::public.app_role
  into bind_permissions;
  
  return bind_permissions > 0;
end;
$$ language plpgsql security definer set search_path = public;
…
alter table public.users enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
…
create policy "Allow logged-in read access" on public.messages for select using ( auth.role() = 'authenticated' );
create policy "Allow individual insert access" on public.messages for insert with check ( auth.uid() = user_id );
create policy "Allow individual update access" on public.messages for update using ( auth.uid() = user_id );
create policy "Allow individual delete access" on public.messages for delete using ( auth.uid() = user_id );
create policy "Allow authorized delete access" on public.messages for delete using ( authorize('messages.delete') );
create policy "Allow individual read access" on public.user_roles for select using ( auth.uid() = user_id );`,
		notes: [
			'Les lignes 24 à 29 appellent `auth.uid()`, du simple SQL écrit dans [la migration de Supabase Auth](' + AUTH + '/20220224000811_update_auth_functions.up.sql#L3-L12) : elle lit `sub` dans `current_setting(\'request.jwt.claims\', true)`. PostgREST remplit ce paramètre et lance `SET LOCAL ROLE` à chaque requête. La policy fait confiance au token que PostgREST a vérifié, et ignore ce que le client met dans sa requête.',
			'Les lignes 27 et 28 sont deux policies `for delete` sur `messages` : l’auteur, ou un rôle qui a `messages.delete`. Les policies permissives, celles par défaut, sont [combinées avec `OR`](' + PG + '/ddl.sgml#L2996-L3004), donc l’une ou l’autre suffit. Une policy restrictive (`AS RESTRICTIVE`) serait combinée avec `AND`.',
			'La ligne 25 vérifie les inserts avec `with check ( auth.uid() = user_id )`, donc personne ne peut poster au nom d’un autre. La policy d’update, ligne 26, n’a que `using`, et [CREATE POLICY](' + PG + '/ref/create_policy.sgml#L372-L378) dit que cette clause sert alors "for both USING and WITH CHECK cases" (pour les deux). Tu ne peux modifier que ton message, et tu ne peux pas le donner à un autre utilisateur.',
			'La ligne 22 active la RLS sur `role_permissions`, qui n’a aucune policy, et sans policy "a default-deny policy is used" (tout est refusé). `authorize()`, lignes 1 à 16, la lit quand même parce qu’elle est `security definer` : elle tourne avec les droits de son propriétaire. La [doc de CREATE FUNCTION](' + PG + '/ref/create_function.sgml#L788-L800) demande à ces fonctions de fixer `search_path` et de mettre `pg_temp` en dernier ; celle-ci le fixe à `public` seulement.',
			'Par défaut, PostgreSQL donne `EXECUTE` sur chaque nouvelle fonction au pseudo-rôle PUBLIC, c’est-à-dire à tous les rôles. Alors la [migration du hook d’auth](' + SUPA + '/20240214114147_auth-hook.sql#L37-L58) du projet donne le hook à `supabase_auth_admin`, puis retire `execute` et tous les droits sur `user_roles` à `authenticated, anon`.'
		]
	},
	tradeoff: {
		gain: [
			'Le filtre par tenant vit à un seul endroit, la base. Une requête qui oublie `WHERE tenant_id = ?` ne voit quand même que les lignes du tenant.',
			'Un rôle avec peu de droits limite les dégâts d’une injection SQL : pas de `DROP`, pas de lecture des tables jamais accordées au rôle.',
			'Les mêmes règles valent pour tous les clients : l’application web, un script cron, un outil de BI, ou un développeur dans `psql` avec ce rôle.'
		],
		cost: [
			'Les policies tournent sur chaque ligne que la requête touche. Une policy qui appelle une fonction ou une sous-requête par ligne peut ralentir une requête rapide. Indexe les colonnes sur lesquelles les policies filtrent.',
			'Une policy manquante renvoie zéro ligne sans lever d’erreur : le seul symptôme est une liste vide.',
			'Les propriétaires, les superutilisateurs et les rôles `BYPASSRLS` passent outre toutes les policies. Les migrations, les sauvegardes et les outils d’admin ont besoin de ces rôles, donc l’application doit se connecter avec un autre.',
			'Un pool de connexions ne doit pas faire fuir un rôle ou un tenant d’une requête à la suivante. `SET LOCAL` dans une transaction est sûr ; un simple `SET` sur une session partagée ne l’est pas (jour 25).'
		]
	},
	task: {
		prompt: 'Ton application stocke `invoices(id, tenant_id, amount)`. Elle se connecte en `app_user`, qui ne possède pas la table. Chaque requête ouvre une transaction et lance `SET LOCAL app.tenant_id = \'42\'`. Dans `psql`, écris les droits et la policy pour que `app_user` puisse lire et insérer seulement les factures de son tenant, ne puisse jamais supprimer, et ne puisse pas insérer une ligne pour un autre tenant.',
		hint: 'Deux couches : GRANT pour les commandes, une policy pour les lignes. `current_setting(\'app.tenant_id\', true)` renvoie NULL quand le paramètre manque.',
		answer: [
			'Droits : `GRANT SELECT, INSERT ON invoices TO app_user;`. Les tables ne donnent rien à PUBLIC par défaut, donc `app_user` n’a que ça. Pas de droit `DELETE`, donc une suppression échoue avec `permission denied`, quoi que dise la policy.',
			'RLS : `ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;`. À partir de là, `app_user` ne voit aucune ligne tant qu’une policy ne les laisse pas passer.',
			'Policy : `CREATE POLICY tenant_isolation ON invoices TO app_user USING (tenant_id = current_setting(\'app.tenant_id\', true)::bigint);`. Sans `WITH CHECK`, l’expression `USING` teste aussi les lignes insérées, donc un insert avec `tenant_id = 7` échoue.',
			'Si le paramètre manque, `current_setting` renvoie NULL, la comparaison vaut NULL, pas vrai (jour 6), et aucune ligne ne passe. Une requête qui a sauté le `SET LOCAL` ne voit aucune facture.',
			'Teste-le : `SET ROLE app_user; BEGIN; SET LOCAL app.tenant_id = \'42\'; SELECT count(*) FROM invoices;` ne doit compter que le tenant 42. Puis lance le même `SELECT` en tant que propriétaire de la table et vois qu’il compte tout : c’est pour ça que l’application ne doit pas être propriétaire.'
		],
		steps: [
			{
				title: 'Donne les droits sur les commandes',
				questions: [
					{ q: 'Quel droit correspond à « lire et insérer, jamais supprimer » ?', options: ['`GRANT SELECT, INSERT ON invoices TO app_user;`', '`GRANT ALL ON invoices TO app_user;`', '`GRANT SELECT, INSERT, DELETE ON invoices TO app_user;`', '`GRANT USAGE ON invoices TO app_user;`'], answer: 0, why: 'Donne à chaque rôle seulement les commandes dont il a besoin. Ici, `SELECT` et `INSERT`, rien de plus.' },
					{ q: '`app_user` reçoit-il un autre droit sur `invoices` sans rien demander ?', options: ['Oui : PUBLIC reçoit `SELECT` sur chaque nouvelle table', 'Non : les tables ne donnent rien à PUBLIC par défaut', 'Oui : tout rôle peut lire les tables de `public`', 'Seulement `DELETE`, qu’il faut retirer'], answer: 1, why: 'Les tables ne donnent rien à PUBLIC par défaut, donc le droit ci-dessus est tout ce qu’a `app_user`. Les fonctions, elles, donnent `EXECUTE` à PUBLIC.' },
					{ q: '`app_user` lance `DELETE FROM invoices`. Que se passe-t-il ?', options: ['Il supprime seulement les lignes de son tenant', 'Il renvoie `DELETE 0` et ne change rien', 'Il échoue avec `permission denied`', 'Il supprime toutes les lignes de la table'], answer: 2, why: 'Sans droit `DELETE`, la commande échoue avant de lire la moindre ligne, quoi que dise la policy.' },
					{ q: 'La policy va filtrer les lignes. Pourquoi garder quand même des droits serrés ?', options: ['Les policies ne s’appliquent pas à `DELETE`', 'Les droits décident des commandes, la policy décide des lignes', 'Les droits accélèrent la policy', 'La RLS ne s’active pas sans un droit'], answer: 1, why: 'Ce sont deux niveaux. Un rôle aux droits réduits limite aussi ce que peut faire une injection SQL : pas de `DROP`, pas de tables jamais accordées.' }
				]
			},
			{
				title: 'Active la sécurité des lignes',
				questions: [
					{ q: 'Quelle instruction l’active sur la table ?', options: ['`ALTER ROLE app_user ENABLE ROW LEVEL SECURITY;`', '`GRANT ROW LEVEL SECURITY ON invoices TO app_user;`', '`ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;`', '`CREATE POLICY ON invoices ENABLE;`'], answer: 2, why: 'La RLS est un interrupteur par table, posé avec `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.' },
					{ q: 'La RLS est maintenant active sur `invoices`. `app_user` a-t-il encore besoin de son `GRANT SELECT` ?', options: ['Non : la policy remplace le grant', 'Oui : sans lui, la requête échoue avec `permission denied` avant qu’aucune ligne ne soit vérifiée', 'Non : activer la RLS donne `SELECT` à chaque rôle qu’elle filtre', 'Seulement pour `INSERT`, pas pour `SELECT`'], answer: 1, why: 'Le grant est vérifié d’abord, pour toute la table. Seule une requête qui le passe atteint la policy, qui filtre ensuite les lignes.' },
					{ q: 'La policy va comparer `tenant_id` sur chaque ligne que touche une requête. Quel index garde les requêtes de `app_user` rapides ?', options: ['Un sur `invoices (tenant_id)`', 'Un sur `invoices (amount)`', 'Aucun : une policy ne coûte rien par ligne', 'Un sur le réglage `app.tenant_id`'], answer: 0, why: 'Les policies tournent sur chaque ligne que touche une requête. Indexe la colonne sur laquelle filtre la policy, pour que la condition ajoutée puisse utiliser un index.' },
					{ q: 'Dans une autre application, le rôle qui a lancé les migrations possède la table, et l’application se connecte avec lui. Qu’est-ce qui lui applique les policies ?', options: ['Ajouter une clause `WITH CHECK`', 'Lui donner `BYPASSRLS`', 'Utiliser `SET` au lieu de `SET LOCAL`', '`ALTER TABLE invoices FORCE ROW LEVEL SECURITY;`'], answer: 3, why: '`FORCE ROW LEVEL SECURITY` fait passer le propriétaire par les policies lui aussi. Un rôle séparé pour l’application est l’autre correction.' }
				]
			},
			{
				title: 'Écris la policy',
				questions: [
					{ q: 'Quelle expression `USING` ne garde que le tenant de la requête ?', options: ['`tenant_id = current_user`', '`tenant_id = 42`', '`tenant_id = current_setting(\'app.tenant_id\', true)::bigint`', '`tenant_id IS NOT NULL`'], answer: 2, why: 'Chaque requête pose `app.tenant_id` avec `SET LOCAL`. La policy le lit et le convertit au type de la colonne.' },
					{ q: 'La policy a un `USING` et pas de `WITH CHECK`. Que se passe-t-il sur un `INSERT` ?', options: ['Les inserts ne sont jamais testés', 'L’expression `USING` teste aussi la nouvelle ligne', 'La ligne est insérée, puis cachée', 'L’insert a besoin d’une deuxième policy pour tourner'], answer: 1, why: 'Sans `WITH CHECK`, l’expression `USING` sert aux deux cas, donc les nouvelles lignes doivent aussi correspondre au tenant.' },
					{ q: 'Avec le tenant à 42, `app_user` insère une ligne avec `tenant_id = 7`. Que se passe-t-il ?', options: ['La ligne est stockée avec `tenant_id = 42` à la place', 'La ligne est stockée mais personne ne la voit', 'Un avertissement part dans le log et la ligne passe', 'Le test échoue et la commande est annulée'], answer: 3, why: 'Un test qui échoue annule la commande. Personne ne peut écrire une ligne pour un autre tenant.' },
					{ q: 'Que fait `TO app_user` dans `CREATE POLICY tenant_isolation ON invoices TO app_user ...` ?', options: ['Il applique la policy à ce rôle', 'Il donne la table à `app_user`', 'Il rend `app_user` propriétaire', 'Il rend la policy restrictive'], answer: 0, why: 'Une policy peut viser des rôles. Ici, seul `app_user` passe par elle. Les droits viennent toujours de `GRANT`.' }
				]
			},
			{
				title: 'Teste-la',
				questions: [
					{ q: 'En `app_user`, dans `BEGIN; SET LOCAL app.tenant_id = \'42\';`, que compte `SELECT count(*) FROM invoices` ?', options: ['Toutes les factures', 'Seulement les factures du tenant 42', 'Zéro, tant que tu n’as pas fait de commit', 'Une erreur, puisqu’il n’y a pas de `WHERE`'], answer: 1, why: 'La policy s’ajoute à chaque requête, donc une requête sans `WHERE` ne voit quand même que les lignes du tenant.' },
					{ q: 'Sur une connexion neuve qui n’a jamais posé `app.tenant_id`, une requête oublie le `SET LOCAL`. Que renvoie la même requête ?', options: ['Une erreur sur un paramètre inconnu', 'Toutes les factures', 'Zéro ligne', 'Les lignes du dernier tenant sur cette connexion'], answer: 2, why: 'Avec `true` en deuxième argument, `current_setting` renvoie NULL. `tenant_id = NULL` n’est pas vrai, donc aucune ligne ne passe.' },
					{ q: 'Pourquoi `SET LOCAL` et pas un simple `SET` ?', options: ['`SET` ne sait pas garder un paramètre maison', '`SET LOCAL` se lit plus vite dans une policy', '`SET` ne marche que pour les superutilisateurs', '`SET LOCAL` s’arrête avec la transaction, donc une connexion du pool ne fait pas fuir le tenant'], answer: 3, why: 'Un simple `SET` reste sur la session, et la requête suivante sur cette connexion partagée hériterait du tenant 42.' },
					{ q: 'Dans la même transaction, tu lances `SET LOCAL app.tenant_id = \'7\'` et tu recomptes. Qu’obtiens-tu ?', options: ['Seulement les factures du tenant 7', 'Toujours seulement celles du tenant 42', 'Celles du tenant 42 et du tenant 7', 'Une erreur : le réglage est figé pour la transaction'], answer: 0, why: 'La policy appelle `current_setting` à chaque requête, donc elle filtre sur ce que contient le réglage à ce moment-là.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu lances `ALTER TABLE orders ENABLE ROW LEVEL SECURITY` sans créer de policy. Le rôle de l’application a `SELECT` sur `orders`. Que renvoie `SELECT * FROM orders` pour lui ?',
			options: [
				'Toutes les lignes, parce qu’une table sans policy n’est pas filtrée du tout',
				'Une erreur, parce qu’une table avec la RLS active exige au moins une policy',
				'Aucune ligne, parce que sans policy une policy de refus par défaut s’applique',
				'Seulement les lignes que le rôle de l’application a lui-même insérées'
			],
			answer: 2,
			why: 'Avec la RLS active, chaque ligne doit être autorisée par une policy. Sans aucune, PostgreSQL applique un refus par défaut : aucune ligne n’est visible, et aucune erreur ne te dit pourquoi.'
		},
		{
			q: 'Une table a deux policies permissives `FOR DELETE` : l’une autorise l’auteur, l’autre les modérateurs. Qui peut supprimer une ligne ?',
			options: [
				'Seulement quelqu’un qui est à la fois l’auteur et modérateur du canal',
				'L’auteur ou un modérateur, car les policies permissives se combinent en OR',
				'Personne, car deux policies pour une même commande entrent en conflit',
				'Seulement les modérateurs, car la dernière policy créée l’emporte'
			],
			answer: 1,
			why: 'Les policies permissives, celles par défaut, sont combinées avec OR : en passer une suffit. Les policies restrictives se combinent avec AND, et c’est avec elles que tu ajoutes une condition que chaque ligne doit remplir.'
		},
		{
			q: 'La RLS est active sur `invoices` avec une policy par tenant, et l’application voit encore les lignes de tous les tenants. Quelle est la cause la plus probable ?',
			options: [
				'La policy a une clause USING mais il lui manque une clause WITH CHECK',
				'L’application lit via un pool de connexions, qui passe outre les policies',
				'L’application a un GRANT SELECT sur la table au lieu d’un droit de policy',
				'L’application se connecte en propriétaire de la table, qui ignore ses policies'
			],
			answer: 3,
			why: 'Les propriétaires de table, les superutilisateurs et les rôles BYPASSRLS ignorent la sécurité des lignes. Les applications se connectent souvent avec le rôle qui a lancé les migrations, et qui possède donc les tables. Utilise un rôle séparé, ou FORCE ROW LEVEL SECURITY.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Verrouiller une table `invoices` locale pour que `app_user` ne voie et n’écrive que les lignes de son tenant, et voir le propriétaire passer outre la policy.',
		steps: [
			'Lance PostgreSQL et ouvre `psql` en superutilisateur : `docker run -d --name rls-lab -e POSTGRES_PASSWORD=lab postgres:16`, attends quelques secondes, puis `docker exec -it rls-lab psql -U postgres`.',
			'Crée la table et deux tenants : `CREATE TABLE invoices (id bigserial PRIMARY KEY, tenant_id bigint NOT NULL, amount numeric NOT NULL); INSERT INTO invoices (tenant_id, amount) VALUES (42, 100), (42, 250), (7, 999); CREATE ROLE app_user;`.',
			'Écris les droits. La colonne `bigserial` demande aussi `GRANT USAGE ON SEQUENCE invoices_id_seq TO app_user;` pour les inserts. Vérifie avec `SET ROLE app_user; SELECT count(*) FROM invoices; RESET ROLE;`.',
			'Active la RLS, refais la même vérification, puis écris la policy par tenant et refais-la encore, avant tout `SET LOCAL`.',
			'Teste en `app_user` dans une transaction : `SET ROLE app_user; BEGIN; SET LOCAL app.tenant_id = \'42\';`, puis un `SELECT count(*)`, un insert pour le tenant 7, un insert pour le tenant 42, et un `DELETE FROM invoices`. Après chaque erreur, lance `ROLLBACK;`, puis de nouveau `BEGIN; SET LOCAL app.tenant_id = \'42\';` avant l’instruction suivante.',
			'`RESET ROLE;` et recompte en `postgres`. Quand tu as fini : `docker rm -f rls-lab`.'
		],
		done: [
			'Avant la RLS, `app_user` compte 3. Avec la RLS active et sans policy, il compte 0.',
			'Juste après la policy, avant tout `SET LOCAL`, `app_user` compte 0. Avec `SET LOCAL app.tenant_id = \'42\'`, il compte 2, les lignes du tenant 42.',
			'L’insert pour le tenant 7 échoue avec `new row violates row-level security policy for table "invoices"`, et l’insert pour le tenant 42 passe.',
			'`DELETE FROM invoices` échoue avec `permission denied for table invoices`.',
			'En `postgres`, `SELECT count(*) FROM invoices` compte tous les tenants.'
		],
		solution: [
			'`GRANT SELECT, INSERT ON invoices TO app_user; GRANT USAGE ON SEQUENCE invoices_id_seq TO app_user;`',
			'`ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;`',
			'`CREATE POLICY tenant_isolation ON invoices TO app_user USING (tenant_id = current_setting(\'app.tenant_id\', true)::bigint);`',
			'Une fois que la session a posé `app.tenant_id`, le paramètre revient en chaîne vide après la transaction, pas en NULL, donc une requête suivante sans `SET LOCAL` échoue avec `invalid input syntax for type bigint: ""`. Dans les deux cas, aucune ligne ne fuit.',
			'`postgres` est superutilisateur, donc il ignore toutes les policies. L’application doit se connecter avec un rôle comme `app_user`, jamais en propriétaire ni en superutilisateur.'
		]
	},
	recall: {
		q: 'Qu’est-ce qui empêche une requête qui a oublié `WHERE tenant_id = ?` de lire les lignes des autres tenants, et quels rôles y échappent ?',
		a: 'Une policy de sécurité des lignes, comme `USING (tenant_id = current_setting(\'app.tenant_id\', true)::bigint)`, filtre chaque requête. Le propriétaire de la table, les superutilisateurs et les rôles `BYPASSRLS` y échappent, donc l’application se connecte avec un rôle séparé.'
	},
	sources: [
		{ title: 'Doc PostgreSQL, Row Security Policies', url: 'https://www.postgresql.org/docs/current/ddl-rowsecurity.html' },
		{ title: 'Doc PostgreSQL, Privileges', url: 'https://www.postgresql.org/docs/current/ddl-priv.html' },
		{ title: 'Doc PostgREST, Database Authorization', url: `${PGRST}/explanations/db_authz.rst` },
		{ title: 'Doc PostgREST, Authentication : SET LOCAL ROLE à chaque requête', url: `${PGRST}/references/auth.rst#L60-L64` },
		{ title: 'Source de la doc PostgreSQL, ddl.sgml : policy de refus par défaut', url: `${PG}/ddl.sgml#L2932-L2942` },
		{ title: 'Source de la doc PostgreSQL, ddl.sgml : droits par défaut de PUBLIC', url: `${PG}/ddl.sgml#L2559-L2577` },
		{ title: 'Doc Supabase, Row Level Security', url: 'https://supabase.com/docs/guides/database/postgres/row-level-security' }
	]
};
