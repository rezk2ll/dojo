const REPO = 'https://github.com/gitlabhq/gitlabhq/blob/beea9497b60c127a5219ef142d0320918c6b20d5';
const RAILS = 'https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146';
const HELPERS = `${REPO}/lib/gitlab/database/migration_helpers.rb`;
const DOWNTIME = `${REPO}/doc/development/database/avoiding_downtime_in_migrations.md?plain=1`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'schema-migrations',
	part: 'Fait pour durer',
	title: 'Migrations de schéma et de données',
	minutes: 10,
	hook: [
		'Ta boutique veut renommer la colonne `orders.amount` en `orders.total`. En Rails, c’est un seul `rename_column`, dans une seule migration, lancée par le pipeline de déploiement.',
		'Pendant un déploiement progressif, les anciens et les nouveaux pods servent en même temps. Lance le renommage en premier, et **les anciens pods interrogent une colonne qui n’existe plus**. Lance-le en dernier, et les nouveaux pods interrogent une colonne qui n’existe pas encore. Aucun ordre entre déploiement et migration ne marche pour les deux versions du code.',
		'Le guide des migrations de GitLab découpe le changement en trois étapes, **expand, migrate, contract**, pour que GitLab.com et les serveurs auto-hébergés se mettent à jour sans interruption. D’abord, tu ajoutes la nouvelle colonne à côté de l’ancienne, et les deux versions marchent. Ensuite, tu bascules les données et le code. Enfin, tu supprimes ce que plus aucun code ne lit.'
	],
	terms: [
		{ term: 'Expand / contract', def: 'Aussi appelé parallel change. Ajoute la nouvelle forme à côté de l’ancienne, fais basculer les lecteurs et les écrivains, supprime l’ancienne forme en dernier. Les trois étapes sortent souvent dans trois releases.' },
		{ term: 'Versions mélangées', def: 'Pendant un déploiement progressif, l’ancien et le nouveau code tournent en même temps sur une même base. Chaque état du schéma doit marcher pour les deux.' },
		{ term: 'Backfill', def: 'Remplir la nouvelle forme pour les lignes écrites avant qu’elle existe. Dans la migration, en tâche de fond par lots, ou pas du tout si le code lit « vide » sans danger.' },
		{ term: 'Migration post-déploiement', def: 'Une migration qui ne tourne qu’une fois que chaque serveur fait tourner le nouveau code. L’étape contract va dans une migration de ce type.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['mig["Migration normale, avant le nouveau code"] -->|"ajoute updated_at_timestamp, copie par lots"| users[("table users")]'],
				highlight: ['mig', 'users'],
				note: 'L’exemple de la doc GitLab renomme `users.updated_at` en `updated_at_timestamp`. À l’étape expand, `rename_column_concurrently` ajoute la nouvelle colonne avec le même type. Ensuite vient le backfill : il copie chaque ligne existante dans la nouvelle colonne, par lots. `updated_at` garde son nom et ses données.'
			},
			{
				add: ['users --> trig["Trigger : à chaque insert ou update, copie l’ancienne dans la nouvelle"]', 'oldp["Anciens pods : écrivent updated_at"] --> users'],
				highlight: ['trig', 'oldp'],
				note: 'Le même helper installe un trigger en base, qui garde la copie à jour. Chaque insert ou update copie l’ancienne colonne dans la nouvelle. Une ligne qu’un ancien pod écrit **pendant le déploiement** arrive quand même dans la nouvelle colonne, donc le backfill ne peut pas la rater.'
			},
			{
				add: ['newp["Nouveaux pods : ignore_column updated_at"] --> users'],
				highlight: ['newp'],
				note: 'Anciens et nouveaux pods tournent maintenant ensemble, et le nouveau code marque l’ancienne colonne comme ignorée. Le guide de GitLab donne la raison : ActiveRecord met en cache les colonnes de la table au démarrage. Une colonne qui disparaît sous un processus en cours peut alors le casser, même si aucun code ne la nomme. Une colonne ignorée n’apparaît jamais dans les requêtes SQL.'
			},
			{
				add: ['post["Migration post-déploiement, après la mise à jour de chaque serveur"] -->|"supprime le trigger, supprime updated_at"| users'],
				highlight: ['post'],
				note: 'À l’étape contract, `cleanup_concurrent_column_rename` supprime le trigger et l’ancienne colonne. Elle vit dans `db/post_migrate`, qu’une mise à jour sans interruption ne lance **qu’une fois que tous les serveurs font tourner le nouveau code**. Une release plus tard, le code retire aussi la règle `ignore_column`.'
			},
			{
				add: ['bbm["Batched background migration, sur plusieurs releases"] -.->|"pour les grosses tables"| users'],
				highlight: ['bbm'],
				note: 'La doc prévient que cette procédure n’est « only appropriate for small tables » (adaptée qu’aux petites tables), parce que la copie tourne dans la migration. Pour les grosses, une tâche de fond copie les données par lots, et le renommage s’étale sur plusieurs releases.'
			}
		]
	},
	example: {
		title: 'lib/gitlab/database/migration_helpers.rb : un renommage découpé en expand et contract',
		repo: 'gitlabhq/gitlabhq',
		url: `${HELPERS}#L226-L390`,
		lang: 'ruby',
		code: `      # Renames a column without requiring downtime.
      #
      # Concurrent renames work by using database triggers to ensure both the
      # old and new column are in sync. However, this method will _not_ remove
      # the triggers or the old column automatically; this needs to be done
      # manually in a post-deployment migration. This can be done using the
      # method \`cleanup_concurrent_column_rename\`.
…
      def rename_column_concurrently(table, old, new, type: nil, type_cast_function: nil, batch_column_name: :id)
        unless column_exists?(table, batch_column_name)
          raise "Column #{batch_column_name} does not exist on #{table}"
        end

        if transaction_open?
          raise 'rename_column_concurrently can not be run inside a transaction'
        end

        check_trigger_permissions!(table)

        create_column_from(table, old, new, type: type, batch_column_name: batch_column_name, type_cast_function: type_cast_function)

        install_rename_triggers(table, old, new)
      end
…
      def cleanup_concurrent_column_rename(table, old, new)
        trigger_name = rename_trigger_name(table, old, new)

        check_trigger_permissions!(table)

        remove_rename_triggers(table, trigger_name)

        remove_column(table, old)
      end`,
		notes: [
			'La ligne 20 appelle [`create_column_from`](' + HELPERS + '#L757-L792). Il ajoute la nouvelle colonne avec le type, la limite et l’échelle de l’ancienne, définit la valeur par défaut **après** l’avoir ajoutée, puis copie les données avec `update_column_in_batches`. Seulement ensuite, il ajoute la contrainte NOT NULL et copie les index, les clés étrangères et les contraintes de vérification. Les lignes 14 à 16 refusent de tourner dans une transaction ouverte.',
			'La ligne 22 installe le trigger. [`UnidirectionalCopyTrigger`](' + REPO + '/lib/gitlab/database/unidirectional_copy_trigger.rb#L38-L49) tourne en `BEFORE INSERT OR UPDATE ... FOR EACH ROW` et fait `NEW.new := NEW.old`. Comme son nom l’indique, il copie dans un seul sens : de l’ancienne colonne vers la nouvelle.',
			'Le [`ignore_columns`](' + REPO + '/app/models/concerns/ignorable_columns.rb#L18-L30) de GitLab met une date sur l’étape contract. Il lève une erreur si tu ne donnes pas `remove_after` (une date) et `remove_with` (une release), sauf si tu t’en dispenses avec `remove_never: true`, puis ajoute la colonne aux `ignored_columns` de Rails. Le commentaire de Rails donne la raison : aucun code ne « raises errors due to having a cached schema in memory at the time the schema migration is run » (lève d’erreur parce qu’un schéma est en cache en mémoire au moment où la migration tourne).',
			'Les lignes 25 à 32 sont l’étape contract, et elles vont dans une [migration post-déploiement](' + REPO + '/doc/development/database/post_deployment_migrations.md?plain=1#L8-L12). Par défaut, ces migrations tournent avec les autres. Définis `SKIP_POST_DEPLOYMENT_MIGRATIONS` pendant le déploiement, puis relance-les une fois que tous les serveurs ont été mis à jour.',
			'Pour une simple suppression, la [doc](' + DOWNTIME + '#L14-L33) étale ignore, suppression et retrait de l’ignore sur les releases M, M+1 et M+2, parce que « dropping a column is a destructive operation that can’t be rolled back easily » (supprimer une colonne est une opération destructive qu’on ne peut pas annuler facilement). Pour un renommage, elle prévient à propos de l’état entre les deux migrations : « With Canary it is possible that the system runs in this state for a significant amount of time. » (avec Canary, le système peut rester dans cet état pendant longtemps).'
		]
	},
	tradeoff: {
		gain: [
			'Pas d’interruption : chaque état du schéma marche pour la release d’avant et celle d’après, donc un déploiement progressif ne casse jamais.',
			'Le rollback reste possible : jusqu’à l’étape contract, la release précédente tourne toujours sur le schéma actuel.',
			'Chaque étape est petite et se vérifie toute seule : la colonne existe, la copie a compté ses lignes, plus rien ne lit l’ancienne colonne.'
		],
		cost: [
			'Un renommage prend deux ou trois releases au lieu d’une, et pendant un moment la base garde les mêmes données en double.',
			'L’étape contract est une release à part, que quelqu’un doit penser à livrer. L’article du bliki prévient : « If the contract phase is not executed you might end up in a worse state than you started » (si la phase contract n’est pas exécutée, tu peux finir dans un état pire qu’au départ).',
			'Une copie sur une grosse table prend du temps et de la charge. GitLab déplace ces copies dans des batched background migrations, qui doivent finir avant l’étape suivante.',
			'Tant que le nettoyage n’a pas tourné, le trigger écrit la nouvelle colonne à chaque insert ou update, et cette écriture n’apparaît nulle part dans le code de l’application.'
		]
	},
	task: {
		prompt: 'Tu dois renommer `orders.amount` en `total` dans ta boutique, sans aucune requête en échec pendant un déploiement progressif, et en gardant la possibilité de revenir une release en arrière. Tu n’as pas de helper de trigger. Écris les releases, et pour chacune la migration et le changement de code.',
		hint: 'Chaque état du schéma doit marcher pour le code juste avant et le code juste après. Pour chaque release, écris quelle colonne le code lit et lesquelles il écrit.',
		answer: [
			'Release 1 (expand) : ajoute `total`, nullable. Le code écrit les deux colonnes et lit toujours `amount`. Les anciens pods ignorent la nouvelle colonne.',
			'Backfill : une fois la release 1 entièrement déployée, copie `amount` dans `total` là où il est null, par lots. Lance-le après le déploiement, pour qu’aucun ancien pod n’écrive encore `amount` tout seul.',
			'Release 2 (migrate) : le code lit `total` et écrit toujours les deux. Revenir à la release 1 est sans danger, parce que `amount` est toujours à jour.',
			'Release 3 (contract) : le code arrête d’écrire `amount` et la marque dans `ignored_columns`. Supprime la colonne dans une migration post-déploiement d’une release suivante, une fois qu’aucune version vers laquelle tu pourrais revenir ne la lit.',
			'Ou demande-toi si le renommage en vaut la peine. Le `alias_attribute :total, :amount` de Rails laisse le code dire `total` pendant que la colonne garde son nom : le code se lit bien et le schéma ne bouge jamais.'
		],
		steps: [
			{
				title: 'Étends le schéma',
				questions: [
					{ q: 'Pourquoi ne peux-tu pas livrer un seul `rename_column` avec le déploiement ?', options: ['Rails n’a pas de `rename_column` pour PostgreSQL', 'Anciens et nouveaux pods tournent ensemble, et l’un d’eux rate sa colonne', 'Un renommage verrouille toujours la table pendant des heures', 'Le renommage perdrait toutes les valeurs de `amount`'], answer: 1, why: 'Lance le renommage en premier et les anciens pods interrogent une colonne qui n’existe plus. Lance-le en dernier et les nouveaux pods en interrogent une qui n’existe pas encore.' },
					{ q: 'Que fait la migration de la release 1 ?', options: ['Renommer `amount` en `total`', 'Ajouter `total` en NOT NULL avec 0 par défaut', 'Supprimer `amount` et ajouter `total`', 'Ajouter `total` comme colonne nullable'], answer: 3, why: 'Une nouvelle colonne nullable est invisible pour le code qui ne la nomme pas, donc la release en cours continue de marcher.' },
					{ q: 'Dans la release 1, quelle colonne le code lit-il ?', options: ['`amount`', '`total`', 'Celle qui n’est pas nulle', 'Les deux, et il les compare'], answer: 0, why: '`total` est encore vide pour les anciennes lignes, donc le code lit `amount` jusqu’à la fin du backfill.' },
					{ q: 'Dans la release 1, quelles colonnes le code écrit-il ?', options: ['Seulement `amount`, comme avant', 'Seulement `total`, le nouveau nom', '`amount` et `total`', 'Aucune : le backfill remplit `total`'], answer: 2, why: 'Écrire les deux garde `total` à jour pour les nouvelles lignes. Sans helper de trigger, c’est le code qui fait la copie que ferait le trigger de GitLab.' }
				]
			},
			{
				title: 'Remplis les anciennes lignes',
				questions: [
					{ q: 'Quand lances-tu le backfill ?', options: ['Avant la release 1, pour que `total` soit plein dès le début', 'Une fois la release 1 entièrement déployée', 'Dans la migration qui ajoute `total`', 'Après que la release 3 a supprimé `amount`'], answer: 1, why: 'Tant que chaque pod ne tourne pas en release 1, un ancien pod peut encore écrire `amount` tout seul. Lance la copie après le déploiement et elle ne rate rien.' },
					{ q: 'Quelles lignes le backfill touche-t-il ?', options: ['Toutes les lignes, en écrasant `total`', 'Seulement les lignes créées aujourd’hui', 'Seulement les lignes où `amount` est null', 'Les lignes où `total` est null'], answer: 3, why: 'Les lignes écrites par la release 1 ont déjà `total`. Seules les plus anciennes ont besoin de la copie.' },
					{ q: 'Comment copie-t-il sur une grosse table `orders` ?', options: ['Par lots', 'En un seul `UPDATE` dans une transaction', 'En exportant puis réimportant la table', 'Ligne par ligne depuis l’application, à la lecture'], answer: 0, why: 'GitLab copie par lots, et pour les grosses tables déplace la copie dans une batched background migration. Un gros update, c’est une longue charge et des verrous.' },
					{ q: '`rename_column_concurrently` de GitLab copie dans la migration. Que dit sa doc à ce sujet ?', options: ['C’est le bon choix pour toutes les tables', 'Ce n’est adapté qu’aux petites tables', 'Ça doit tourner dans une transaction', 'Ça n’a pas besoin de trigger sous PostgreSQL'], answer: 1, why: 'La doc prévient que la procédure n’est « only appropriate for small tables » (adaptée qu’aux petites tables). Les grosses passent par un job en arrière-plan sur plusieurs releases.' }
				]
			},
			{
				title: 'Bascule les lectures',
				questions: [
					{ q: 'Dans la release 2, quelle colonne le code lit-il ?', options: ['`amount`, comme en release 1', '`total`', 'Les deux, en préférant `amount`', 'Aucune : il lit une vue'], answer: 1, why: 'Après le backfill, chaque ligne a `total`, donc le code peut lire le nouveau nom.' },
					{ q: 'Dans la release 2, quelles colonnes le code écrit-il encore ?', options: ['Seulement `total`', 'Seulement `amount`', 'Aucune : un trigger s’en charge', '`amount` et `total`'], answer: 3, why: 'Écrire les deux garde `amount` à jour, et c’est ce qui rend sûr un retour à la release 1.' },
					{ q: 'Tu reviens de la release 2 à la release 1. Pourquoi ça marche ?', options: ['La release 1 lit `amount`, et `amount` est toujours à jour', 'Rails reconstruit `amount` depuis `total` au démarrage', 'La migration est inversée pendant le retour arrière', 'La release 1 lit aussi `total` quand elle existe'], answer: 0, why: 'Jusqu’à l’étape contract, la release précédente tourne encore sur le schéma actuel.' },
					{ q: 'Quelle règle chaque état du schéma doit-il suivre ?', options: ['Il doit correspondre exactement à la dernière release', 'Il ne doit avoir aucune donnée en double', 'Il doit marcher pour le code juste avant et juste après', 'Il doit être atteint en une seule migration'], answer: 2, why: 'Pendant un déploiement progressif, les deux versions du code tournent en même temps contre une seule base.' }
				]
			},
			{
				title: 'Contracte en dernier',
				questions: [
					{ q: 'Dans la release 3, que fait le code avec `amount` ?', options: ['Il la supprime dans une migration normale', 'Il la renomme en `amount_old`', 'Il arrête de l’écrire et la marque dans `ignored_columns`', 'Il continue de l’écrire jusqu’à sa suppression'], answer: 2, why: 'Une colonne ignorée n’apparaît jamais dans les requêtes SQL, donc un processus en cours ne casse pas quand elle disparaît.' },
					{ q: 'Pourquoi marquer la colonne ignorée avant de la supprimer ?', options: ['ActiveRecord met les colonnes en cache au démarrage, et une colonne disparue peut casser un processus en cours', 'Rails refuse de supprimer une colonne qui n’est pas ignorée', 'Ça accélère la migration de suppression', 'Ça copie les données dans `total` une dernière fois'], answer: 0, why: 'Le guide de GitLab donne la raison : aucun code ne doit lever d’erreur à cause d’un schéma en cache quand la migration tourne.' },
					{ q: 'Tu supprimes `amount` dès la release 3. La release 3 se comporte mal et tu reviens à la release 2. Que se passe-t-il ?', options: ['Rien : la release 2 lit `total`', 'La release 2 écrit encore `amount`, donc ses écritures dans `orders` échouent', 'Rails recrée `amount` au démarrage', 'La suppression est annulée avec le retour arrière'], answer: 1, why: 'La release 2 écrit les deux colonnes. Une fois `amount` disparue, la release vers laquelle tu es revenu ne colle plus au schéma.' },
					{ q: 'Le `ignore_columns` de GitLab lève une erreur sauf si tu lui donnes deux choses, ou si tu t’en dispenses. Lesquelles ?', options: ['Un numéro de ticket et un responsable', 'Un nom de table et un type de colonne', 'Un fichier de migration et un test', '`remove_after`, une date, et `remove_with`, une release'], answer: 3, why: 'Il met une date sur l’étape de contraction, pour qu’une colonne ignorée ne reste pas dans la table pour toujours.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Pourquoi peut-on ajouter une nouvelle colonne nullable avant de déployer le code qui l’utilise ?',
			options: [
				'Le code qui ne la sélectionne pas ne la voit pas, donc la release en cours marche comme avant',
				'La base garde un verrou sur la table jusqu’à ce que le nouveau code commence à utiliser la colonne',
				'Le nouveau code créerait la colonne au démarrage, donc l’ajouter tôt fait juste gagner du temps',
				'L’ancien code copie ses valeurs dans toute nouvelle colonne dès qu’elle existe'
			],
			answer: 0,
			why: 'Une colonne additive et nullable est invisible pour le code qui ne la nomme pas. L’étape expand peut donc sortir avant le code, et un retour à l’ancien code marche toujours.'
		},
		{
			q: 'GitLab a lancé `rename_column_concurrently :users, :updated_at, :updated_at_timestamp`. Pendant le déploiement, un ancien pod insère un utilisateur et ne remplit que `updated_at`. Que contient `updated_at_timestamp` ?',
			options: [
				'Null, jusqu’à ce que la prochaine copie par lots atteigne la nouvelle ligne',
				'Null pour toujours, parce que la copie ne couvrait que les lignes qui existaient quand elle a tourné',
				'La valeur par défaut de la base, puisque l’ancien pod ne connaît pas la colonne',
				'La même valeur : le trigger copie l’ancienne colonne dans la nouvelle'
			],
			answer: 3,
			why: 'Le trigger tourne avant chaque insert et chaque update, et remplit la nouvelle colonne depuis l’ancienne. Comme l’étape expand l’installe, les lignes écrites par l’ancien code pendant le déploiement arrivent dans la nouvelle colonne.'
		},
		{
			q: 'Dans un changement expand/contract, quand peut-on supprimer l’ancienne colonne sans danger ?',
			options: [
				'Dès que le backfill a copié chaque ligne existante dans la nouvelle',
				'Quand plus aucune version en cours ou de rollback ne l’utilise',
				'Dès que la nouvelle release tourne sur au moins un pod en production',
				'Dans la même migration que l’étape expand, pour garder un schéma propre'
			],
			answer: 1,
			why: 'L’étape contract est une porte à sens unique (jour 5). Revenir en arrière après, c’est faire tourner du code qui lit une colonne disparue. Elle vient donc en dernier, dans une migration post-déploiement, souvent une release après que le code a cessé d’utiliser la colonne.'
		}
	],
	recall: {
		q: 'Dans le renommage de colonne de GitLab, que fait chacune des deux migrations, et quand tourne-t-elle ?',
		a: '`rename_column_concurrently` ajoute la nouvelle colonne, copie les lignes par lots et installe un trigger de copie, avant la sortie du nouveau code. `cleanup_concurrent_column_rename` supprime le trigger et l’ancienne colonne dans une migration post-déploiement, une fois que chaque serveur fait tourner le nouveau code.'
	},
	sources: [
		{ title: 'GitLab, unidirectional_copy_trigger.rb (trigger assignment)', url: `${REPO}/lib/gitlab/database/unidirectional_copy_trigger.rb#L86-L103` },
		{ title: 'Rails, active_record/model_schema.rb (ignored_columns)', url: `${RAILS}/activerecord/lib/active_record/model_schema.rb#L372-L379` },
		{ title: 'GitLab docs source, post deployment migrations (after all servers are updated)', url: `${REPO}/doc/development/database/post_deployment_migrations.md?plain=1#L44-L45` },
		{ title: 'GitLab docs source, avoiding downtime (state between the two migrations)', url: `${DOWNTIME}#L339-L340` },
		{ title: 'Danilo Sato, martinfowler.com: ParallelChange', url: 'https://martinfowler.com/bliki/ParallelChange.html' },
		{ title: 'Pramod Sadalage and Martin Fowler, Evolutionary Database Design', url: 'https://martinfowler.com/articles/evodb.html' },
		{ title: 'GitLab docs, Avoiding downtime in migrations', url: 'https://docs.gitlab.com/development/database/avoiding_downtime_in_migrations/' },
		{ title: 'GitLab docs, Post Deployment Migrations', url: 'https://docs.gitlab.com/development/database/post_deployment_migrations/' },
		{ title: 'Rails API, ActiveRecord::ModelSchema ignored_columns=', url: 'https://api.rubyonrails.org/classes/ActiveRecord/ModelSchema/ClassMethods.html#method-i-ignored_columns-3D' }
	]
};
