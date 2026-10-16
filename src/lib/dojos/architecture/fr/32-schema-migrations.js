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
		'Ta boutique veut renommer une colonne : `orders.amount` devient `orders.total`. En Rails, c’est un seul `rename_column`, dans une seule migration, lancée par le pipeline de déploiement.',
		'Pendant un déploiement progressif, les anciens et les nouveaux pods servent en même temps. Lance le renommage en premier, et **les anciens pods interrogent une colonne qui n’existe plus**. Lance-le en dernier, et **les nouveaux pods interrogent une colonne qui n’existe pas encore**. Une seule étape ne peut pas convenir à deux versions du code.',
		'La solution : faire pousser la nouvelle forme à côté de l’ancienne et basculer par petites étapes. **Expand** (étendre) pour que les deux versions marchent, **migrate** (migrer) les données et le code, puis **contract** (contracter) ce que plus personne ne lit. Le guide des migrations de GitLab détaille chaque étape, pour que GitLab.com et les serveurs auto-hébergés puissent se mettre à jour sans interruption.'
	],
	terms: [
		{ term: 'Expand / contract', def: 'Aussi appelé parallel change. Ajoute la nouvelle forme à côté de l’ancienne, fais basculer les lecteurs et les écrivains, supprime l’ancienne forme en dernier. Trois étapes, souvent trois releases.' },
		{ term: 'Versions mélangées', def: 'Pendant un déploiement progressif, l’ancien et le nouveau code tournent en même temps sur une même base. Chaque état du schéma doit marcher pour les deux.' },
		{ term: 'Changement additif', def: 'Une nouvelle colonne nullable ou une nouvelle table. L’ancien code l’ignore, donc elle peut sortir avant le code qui l’utilise.' },
		{ term: 'Backfill', def: 'Remplir la nouvelle forme pour les lignes écrites avant qu’elle existe. Dans la migration, en tâche de fond par lots, ou pas du tout si le code lit « vide » sans danger.' },
		{ term: 'Contract', def: 'Supprimer l’ancienne colonne ou l’ancienne table. Sans danger seulement quand aucune version en cours, ni aucune version vers laquelle tu pourrais revenir, ne la lit encore.' },
		{ term: 'Migration post-déploiement', def: 'Une migration qui ne tourne qu’une fois que chaque serveur fait tourner le nouveau code. C’est là que va l’étape contract.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['mig["Migration normale, avant le nouveau code"] -->|"ajoute updated_at_timestamp, copie par lots"| users[("table users")]'],
				highlight: ['mig', 'users'],
				note: '**Expand et backfill.** L’exemple de la doc GitLab renomme `users.updated_at` en `updated_at_timestamp`. `rename_column_concurrently` ajoute la nouvelle colonne avec le même type, puis y copie chaque ligne existante par lots. L’ancienne colonne n’est pas touchée.'
			},
			{
				add: ['users --> trig["Trigger : à chaque insert ou update, copie l’ancienne dans la nouvelle"]', 'oldp["Anciens pods : écrivent updated_at"] --> users'],
				highlight: ['trig', 'oldp'],
				note: '**Garder la copie à jour.** Le même helper installe un trigger en base. Chaque insert ou update copie l’ancienne colonne dans la nouvelle. Une ligne qu’un ancien pod écrit **pendant le déploiement** arrive quand même dans la nouvelle colonne. Le backfill ne peut pas la rater.'
			},
			{
				add: ['newp["Nouveaux pods : ignore_column updated_at"] --> users'],
				highlight: ['newp'],
				note: '**Versions mélangées.** Le nouveau code marque l’ancienne colonne comme ignorée. Le guide de GitLab explique pourquoi : ActiveRecord met en cache les colonnes de la table au démarrage, donc une colonne qui disparaît sous un processus en cours peut le casser même si aucun code ne la nomme. Une colonne ignorée n’est jamais référencée dans les requêtes SQL.'
			},
			{
				add: ['post["Migration post-déploiement, après la mise à jour de chaque serveur"] -->|"supprime le trigger, supprime updated_at"| users'],
				highlight: ['post'],
				note: '**Contract.** `cleanup_concurrent_column_rename` supprime le trigger et l’ancienne colonne. Elle vit dans `db/post_migrate`, qu’une mise à jour sans interruption ne lance **qu’une fois que tous les serveurs font tourner le nouveau code**. Une release plus tard, la règle d’ignore est retirée aussi.'
			},
			{
				add: ['bbm["Batched background migration, sur plusieurs releases"] -.->|"pour les grosses tables"| users'],
				highlight: ['bbm'],
				note: '**Quand la table est grosse.** La doc prévient que cette procédure n’est « only appropriate for small tables » (adaptée qu’aux petites tables), parce que la copie tourne dans la migration. Pour les grosses, une tâche de fond copie les données par lots, et le renommage s’étale sur plusieurs releases.'
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
			'**Expand, puis backfill.** [`create_column_from`](' + HELPERS + '#L757-L792) ajoute la nouvelle colonne avec le type, la limite et l’échelle de l’ancienne, définit la valeur par défaut **après** l’avoir ajoutée, puis copie les données avec `update_column_in_batches`. Seulement ensuite, il ajoute la contrainte NOT NULL et copie les index, les clés étrangères et les contraintes de vérification. Le helper refuse de tourner dans une transaction ouverte.',
			'**Le trigger couvre le trou.** [`UnidirectionalCopyTrigger`](' + REPO + '/lib/gitlab/database/unidirectional_copy_trigger.rb#L38-L49) tourne en `BEFORE INSERT OR UPDATE ... FOR EACH ROW`, et son [affectation](' + REPO + '/lib/gitlab/database/unidirectional_copy_trigger.rb#L86-L103) fait `NEW.new := NEW.old`. Comme son nom l’indique, il copie dans un seul sens : de l’ancienne colonne vers la nouvelle.',
			'**Contract a une échéance.** Le [`ignore_columns`](' + REPO + '/app/models/concerns/ignorable_columns.rb#L18-L30) de GitLab lève une erreur si tu ne donnes pas `remove_after` (une date) et `remove_with` (une release), sauf si tu t’en dispenses avec `remove_never: true`, puis ajoute la colonne aux [`ignored_columns`](' + RAILS + '/activerecord/lib/active_record/model_schema.rb#L372-L379) de Rails. Le commentaire de Rails donne la raison : aucun code ne « raises errors due to having a cached schema in memory at the time the schema migration is run » (lève d’erreur parce qu’un schéma est en cache en mémoire au moment où la migration tourne).',
			'**Contract tourne en dernier.** Les [migrations post-déploiement](' + REPO + '/doc/development/database/post_deployment_migrations.md?plain=1#L8-L12) tournent avec les autres par défaut. Définis `SKIP_POST_DEPLOYMENT_MIGRATIONS` pendant le déploiement, puis relance-les une fois que [tous les serveurs ont été mis à jour](' + REPO + '/doc/development/database/post_deployment_migrations.md?plain=1#L44-L45).',
			'**Supprimer prend trois releases.** Pour une simple suppression, la [doc](' + DOWNTIME + '#L14-L33) étale ignore, suppression et retrait de l’ignore sur les releases M, M+1 et M+2, parce que « dropping a column is a destructive operation that can’t be rolled back easily » (supprimer une colonne est une opération destructive qu’on ne peut pas annuler facilement). Et pour un renommage, elle prévient à propos de [l’état entre les deux migrations](' + DOWNTIME + '#L339-L340) : « With Canary it is possible that the system runs in this state for a significant amount of time. » (avec Canary, le système peut rester dans cet état pendant longtemps).'
		]
	},
	tradeoff: {
		gain: [
			'Pas d’interruption : chaque état du schéma marche pour la release d’avant et celle d’après, donc un déploiement progressif ne casse jamais.',
			'Le rollback reste possible : jusqu’à l’étape contract, la release précédente tourne toujours sur le schéma actuel.',
			'Chaque étape est petite et se vérifie toute seule : la colonne existe, la copie a compté ses lignes, plus rien ne lit l’ancienne colonne.'
		],
		cost: [
			'Un changement devient deux ou trois releases, et pendant un moment la base garde les mêmes données en double.',
			'L’étape contract s’oublie facilement. L’article du bliki prévient : « If the contract phase is not executed you might end up in a worse state than you started » (si la phase contract n’est pas exécutée, tu peux finir dans un état pire qu’au départ).',
			'Une copie sur une grosse table prend du temps et de la charge. GitLab les déplace dans des batched background migrations : une pièce mobile de plus, qui doit finir avant l’étape suivante.',
			'Les triggers sont du comportement caché. Une écriture que tu vois dans le code n’est pas la seule que fait la base, tant que le nettoyage n’a pas tourné.'
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
			why: 'Une colonne additive et nullable est invisible pour le code qui ne la nomme pas. C’est ce qui permet à l’étape expand de sortir avant le code, et ce qui garde un rollback possible.'
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
			why: 'Le trigger tourne avant chaque insert et chaque update, et remplit la nouvelle colonne depuis l’ancienne. C’est tout l’intérêt de l’installer à l’étape expand : les lignes écrites par l’ancien code pendant le déploiement ne sont pas perdues.'
		},
		{
			q: 'Dans un changement expand/contract, quand peut-on supprimer l’ancienne colonne sans danger ?',
			options: [
				'Dès que le backfill a copié chaque ligne existante dans la nouvelle',
				'Quand aucune version en cours, ni aucune version vers laquelle tu pourrais revenir, ne l’utilise',
				'Dès que la nouvelle release tourne sur au moins un pod en production',
				'Dans la même migration que l’étape expand, pour garder un schéma propre'
			],
			answer: 1,
			why: 'L’étape contract est une porte à sens unique (jour 5). Revenir en arrière après, c’est faire tourner du code qui lit une colonne disparue. Elle vient donc en dernier, dans une migration post-déploiement, souvent une release après que le code a cessé d’utiliser la colonne.'
		}
	],
	takeaway: 'Change un schéma par étapes qui marchent chacune pour le code d’avant et d’après : expand, backfill, bascule, et contract seulement quand plus rien ne lit l’ancienne forme.',
	sources: [
		{ title: 'Danilo Sato, martinfowler.com: ParallelChange', url: 'https://martinfowler.com/bliki/ParallelChange.html' },
		{ title: 'Pramod Sadalage and Martin Fowler, Evolutionary Database Design', url: 'https://martinfowler.com/articles/evodb.html' },
		{ title: 'GitLab docs, Avoiding downtime in migrations', url: 'https://docs.gitlab.com/development/database/avoiding_downtime_in_migrations/' },
		{ title: 'GitLab docs, Post Deployment Migrations', url: 'https://docs.gitlab.com/development/database/post_deployment_migrations/' },
		{ title: 'Rails API, ActiveRecord::ModelSchema ignored_columns=', url: 'https://api.rubyonrails.org/classes/ActiveRecord/ModelSchema/ClassMethods.html#method-i-ignored_columns-3D' }
	]
};
