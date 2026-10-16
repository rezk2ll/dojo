const GITLAB = 'https://github.com/gitlabhq/gitlabhq/blob/beea9497b60c127a5219ef142d0320918c6b20d5';
const HELPERS = `${GITLAB}/lib/gitlab/database/migration_helpers.rb`;
const TRIGGER = `${GITLAB}/lib/gitlab/database/unidirectional_copy_trigger.rb`;
const DOWNTIME = `${GITLAB}/doc/development/database/avoiding_downtime_in_migrations.md`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'evolving',
	part: 'Le métier d’architecte',
	title: 'Faire évoluer un système en marche sans l’arrêter',
	minutes: 10,
	hook: [
		'Ta boutique en ligne tourne sur un monolithe vieux de dix ans. Tu veux un nouveau service de paiement, et au passage un nom plus propre pour une colonne de la base. Des clients achètent à chaque minute. **Tu ne peux pas arrêter le système pour le reconstruire.**',
		'Le plan tentant, c’est une grande réécriture, puis un jour de bascule. Martin Fowler sur ce plan : « on a vu ce plan simple en apparence partir en fumée la plupart du temps. »',
		'L’alternative, c’est le **strangler fig** (le figuier étrangleur). Fais pousser le nouveau à côté de l’ancien et déplace le comportement **un petit morceau à la fois**. Supprime l’ancienne partie quand plus rien ne l’atteint. Aujourd’hui, un morceau, c’est une route de ta boutique, et une colonne de la base de GitLab.'
	],
	terms: [
		{ term: 'Strangler fig', def: 'Remplacer un système progressivement : le nouveau code pousse autour de l’ancien, prend le relais morceau par morceau, et l’ancienne partie meurt quand plus personne ne l’utilise (Fowler).' },
		{ term: 'Seam (point de jonction)', def: 'L’endroit unique qui décide « ancien ou nouveau » pour une requête ou une donnée. Il te le faut avant de pouvoir déplacer quoi que ce soit.' },
		{ term: 'Architecture transitoire', def: 'Du code qui fait tourner l’ancien et le nouveau côte à côte, et que tu prévois de supprimer. Fowler : « du code qui disparaîtra une fois la modernisation terminée ».' },
		{ term: 'Migration post-déploiement', def: 'Chez GitLab, une migration de base de données rangée dans `db/post_migrate` pour qu’elle tourne après le déploiement du nouveau code, pas avant.' },
		{ term: 'Point de non-retour', def: 'L’étape après laquelle tu avances, tu ne reviens plus en arrière. Une bonne migration en fait une seule petite étape, le plus tard possible.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['req(["Requête de la boutique"]) --> proxy["Seam de routage : reverse proxy"]', 'proxy -->|/checkout| newc["Nouveau service de paiement"]', 'proxy -->|tout le reste| legacy["Ancien monolithe"]'],
				highlight: ['req', 'proxy', 'newc', 'legacy'],
				note: 'Le seam du comportement : une règle de proxy envoie `/checkout` au nouveau service, tout le reste au monolithe. Les clients voient une seule boutique. Déplacer la route suivante, c’est **une règle de plus**.'
			},
			{
				add: ['oldcol["Colonne updated_at"] -->|un trigger copie à chaque écriture| newcol["Colonne updated_at_timestamp"]'],
				highlight: ['oldcol', 'newcol'],
				note: 'Les données ont besoin d’un seam aussi. GitLab renomme une colonne sans interruption en ajoutant la nouvelle colonne à côté de l’ancienne. Un **trigger de base de données** copie l’ancienne valeur dans la nouvelle colonne à chaque insertion et mise à jour.'
			},
			{
				add: ['code["Nouvelle release : utilise le nouveau nom"] --> newcol'],
				highlight: ['code'],
				note: 'La nouvelle release lit le nouveau nom et dit à Rails d’ignorer l’ancienne colonne. Les deux colonnes existent encore, donc jusqu’ici le changement coûte peu à annuler.'
			},
			{
				add: ['cleanup["Post-déploiement : supprimer le trigger et l’ancienne colonne"] -.->|supprime| oldcol'],
				highlight: ['cleanup'],
				note: 'C’est seulement une fois le nouveau code en ligne qu’une **migration post-déploiement** retire le trigger et l’ancienne colonne. Le code transitoire est supprimé avec eux.'
			},
			{
				add: [],
				highlight: ['cleanup'],
				note: 'La suppression est le **point de non-retour**. Le guide de GitLab décrit la suppression d’une colonne comme « a destructive operation that can’t be rolled back easily » (une opération destructive qu’on ne peut pas annuler facilement). C’est donc une seule étape, et elle vient en dernier.'
			}
		]
	},
	example: {
		title: 'lib/gitlab/database/migration_helpers.rb',
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
…
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
			`\`create_column_from\` [ajoute la nouvelle colonne](${HELPERS}#L757-L792), copie les valeurs existantes par lots, puis copie les index, les clés étrangères et les contraintes de vérification. La nouvelle colonne est une copie complète avant que le moindre code l’utilise.`,
			`Le trigger est [à sens unique](${TRIGGER}#L43-L49) : en \`BEFORE INSERT OR UPDATE\`, il [remplit la nouvelle colonne à partir de l’ancienne](${TRIGGER}#L94-L98). C’est de l’**architecture transitoire** : elle n’existe que le temps de la migration.`,
			'Les deux méthodes sont séparées exprès. La première tourne avant le déploiement, le nettoyage tourne après. Tant que le nettoyage n’a pas eu lieu, `undo_rename_column_concurrently` retire simplement le trigger et la nouvelle colonne.',
			`Le nettoyage retire le trigger, puis **supprime l’ancienne colonne**. Cette dernière ligne est le point de non-retour. Le [guide](${DOWNTIME}#L216-L345) te demande de bien réfléchir au délai entre les deux migrations sur les grosses tables.`
		]
	},
	tradeoff: {
		gain: [
			'Le système reste livrable chaque jour. Chaque déplacement est petit, et son risque aussi.',
			'Le rollback se fait par route ou par colonne, pas en « restaurant le système du mois dernier ».',
			'Les nouvelles fonctionnalités arrivent dans le nouveau code dès le premier jour, donc l’ancien code arrête de grossir.'
		],
		cost: [
			'Deux générations tournent côte à côte pendant longtemps. Il faut corriger les deux, et comprendre les deux.',
			'Le seam est un couplage caché : une règle de proxy ou un trigger change discrètement qui répond.',
			'Le code transitoire est du travail en plus, et l’état à moitié fini peut discrètement devenir permanent.'
		]
	},
	task: {
		prompt: 'Tu renommes `users.updated_at` en `updated_at_timestamp` avec les helpers de GitLab. Le nettoyage post-déploiement a tourné. Puis la nouvelle release révèle un vilain bug, et quelqu’un veut redéployer la release précédente, qui lit encore `updated_at`. Qu’est-ce qui casse ? Comment reviendrais-tu en arrière ?',
		hint: `Lis \`cleanup_concurrent_column_rename\` et la méthode juste après, \`undo_cleanup_concurrent_column_rename\` ([lignes 382-420](${HELPERS}#L382-L420)).`,
		answer: [
			'**L’ancienne release casse.** Son code demande `updated_at`, et le nettoyage a supprimé cette colonne.',
			'Revenir en arrière **n’est pas une simple annulation**. `undo_cleanup_concurrent_column_rename` recrée `updated_at`, copie les valeurs depuis `updated_at_timestamp` et réinstalle le trigger. C’est une nouvelle copie, et sur une grosse table ça prend du temps.',
			'L’ordre est donc : lance d’abord cette migration d’annulation, puis redéploie l’ancien code. Jamais l’inverse.',
			'Souvent, le meilleur choix est de **corriger en avançant** : corrige le bug dans la nouvelle release, et ne touche pas au schéma.',
			'La leçon de conception : garde le point de non-retour en **une seule petite étape, le plus tard possible**. GitLab place la suppression après le déploiement exactement pour cette raison.'
		]
	},
	quiz: [
		{
			q: 'Dans une migration en strangler fig, qu’est-ce que le **seam** ?',
			options: ['Le jour où tu bascules tous les utilisateurs de l’ancien système vers le nouveau', 'La suite de tests qui compare l’ancien et le nouveau système', 'L’endroit unique qui décide, par requête ou par donnée, si c’est l’ancien ou le nouveau code qui s’en occupe', 'La base de données que les deux systèmes partagent'],
			answer: 2,
			why: 'Sans seam, tu ne peux pas déplacer un morceau à la fois. Avec un seam, déplacer une route ou une colonne est un changement petit et réversible.'
		},
		{
			q: 'GitLab renomme une colonne sans interruption. Quelle étape est le **point de non-retour** ?',
			options: ['Ajouter la nouvelle colonne et copier les données', 'Le nettoyage post-déploiement qui supprime l’ancienne colonne', 'Installer le trigger qui copie l’ancienne dans la nouvelle', 'Déployer le code qui lit le nouveau nom'],
			answer: 1,
			why: 'Jusqu’à la suppression, les deux colonnes existent et l’annulation retire simplement la nouvelle. Après, revenir en arrière veut dire recréer l’ancienne colonne et tout recopier.'
		},
		{
			q: 'Qu’est-ce que le trigger de `rename_column_concurrently`, du point de vue de l’architecture ?',
			options: ['De l’architecture transitoire : du code qui fait marcher l’ancien et le nouveau côte à côte, supprimé une fois le déplacement terminé', 'Une partie permanente du schéma', 'Un contrôle de sécurité sur les écritures', 'Un cache pour la nouvelle colonne'],
			answer: 0,
			why: 'Il ne vit qu’entre les deux migrations. `cleanup_concurrent_column_rename` le retire en même temps que l’ancienne colonne.'
		}
	],
	takeaway: 'Ne bascule jamais tout d’un coup. Trouve le seam, déplace un morceau à la fois, et garde le point de non-retour petit et tardif.',
	sources: [
		{ title: 'Martin Fowler, Strangler Fig (2024)', url: 'https://martinfowler.com/bliki/StranglerFigApplication.html' },
		{ title: 'Cartwright, Horn, Lewis, Patterns of Legacy Displacement', url: 'https://martinfowler.com/articles/patterns-legacy-displacement/' },
		{ title: 'GitLab docs, Avoiding downtime in migrations: renaming columns', url: `${DOWNTIME}#L216-L345` },
		{ title: 'GitLab, rename_column_concurrently and cleanup_concurrent_column_rename', url: `${HELPERS}#L226-L420` },
		{ title: 'GitLab, UnidirectionalCopyTrigger', url: `${TRIGGER}#L16-L50` }
	]
};
