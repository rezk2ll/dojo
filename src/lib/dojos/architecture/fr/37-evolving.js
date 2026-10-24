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
		'Fowler appelle l’alternative le **strangler fig** (le figuier étrangleur) : tu écris le nouveau code à côté de l’ancien et tu déplaces le comportement un petit morceau à la fois. Tu supprimes une ancienne partie quand plus aucune requête ne l’atteint. Ici, un morceau est une route de ta boutique, et une colonne de la base de GitLab.'
	],
	terms: [
		{ term: 'Strangler fig', def: 'Remplacer un système progressivement : le nouveau code pousse autour de l’ancien, prend le relais morceau par morceau, et tu supprimes chaque ancienne partie quand plus rien ne l’utilise (Fowler).' },
		{ term: 'Seam (point de jonction)', def: 'L’endroit unique qui décide « ancien ou nouveau » pour une requête ou une donnée. Il te le faut avant de pouvoir déplacer quoi que ce soit.' },
		{ term: 'Architecture transitoire', def: 'Du code qui fait tourner l’ancien et le nouveau côte à côte, et que tu prévois de supprimer. Fowler : « du code qui disparaîtra une fois la modernisation terminée ».' },
		{ term: 'Point de non-retour', def: 'L’étape après laquelle tu ne peux plus que corriger en avançant, car revenir en arrière demande une nouvelle migration. Une bonne migration en fait une seule petite étape, le plus tard possible.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['req(["Requête de la boutique"]) --> proxy["Seam de routage : reverse proxy"]', 'proxy -->|/checkout| newc["Nouveau service de paiement"]', 'proxy -->|tout le reste| legacy["Ancien monolithe"]'],
				highlight: ['req', 'proxy', 'newc', 'legacy'],
				note: 'Le seam du comportement : une règle de proxy envoie `/checkout` au nouveau service, tout le reste au monolithe. Les clients voient une seule boutique. Pour déplacer la route suivante, tu ajoutes **une règle de plus** au proxy.'
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
				note: 'GitLab range certaines migrations dans `db/post_migrate`, et elles tournent après le déploiement du nouveau code. Une fois le nouveau code en ligne, une de ces **migrations post-déploiement** retire le trigger et l’ancienne colonne.'
			},
			{
				add: [],
				highlight: ['cleanup'],
				note: 'Quand GitLab supprime l’ancienne colonne, la migration passe son **point de non-retour**. Le guide de GitLab décrit la suppression d’une colonne comme « une opération destructive qu’on ne peut pas annuler facilement ». GitLab en fait donc une seule étape, qui tourne en dernier.'
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
			`Ligne 13 : \`create_column_from\` [ajoute la nouvelle colonne](${HELPERS}#L757-L792), copie les valeurs existantes par lots, puis copie les index, les clés étrangères et les contraintes de vérification. La nouvelle colonne est une copie complète avant que le moindre code l’utilise.`,
			`La ligne 15 installe un trigger [à sens unique](${TRIGGER}#L43-L49), en \`BEFORE INSERT OR UPDATE\`, qui remplit la nouvelle colonne à partir de l’ancienne. Ce trigger relève de l’**architecture transitoire** : il n’existe que le temps de la migration.`,
			'Les lignes 9 et 18 ouvrent deux méthodes séparées : `rename_column_concurrently` tourne avant le déploiement, et `cleanup_concurrent_column_rename` tourne après. Tant que le nettoyage n’a pas eu lieu, `undo_rename_column_concurrently` retire simplement le trigger et la nouvelle colonne.',
			`La ligne 23 retire le trigger, puis la ligne 25 **supprime l’ancienne colonne**. La ligne 25 est le point de non-retour. Le [guide](${DOWNTIME}#L216-L345) te demande de bien réfléchir au délai entre les deux migrations sur les grosses tables.`
		]
	},
	tradeoff: {
		gain: [
			'La boutique continue de prendre des commandes à chaque étape. Une étape ratée ne touche qu’une route ou qu’une colonne.',
			'Le rollback se fait par route ou par colonne, pas en « restaurant le système du mois dernier ».',
			'Les nouvelles fonctionnalités arrivent dans le nouveau code dès le premier jour, donc l’ancien code arrête de grossir.'
		],
		cost: [
			'Le monolithe et le nouveau service tournent côte à côte pendant longtemps, et l’équipe corrige des bugs dans les deux.',
			'Une règle de proxy ou un trigger change le code qui répond, et rien dans le code applicatif ne le montre.',
			'Tu écris le trigger et les règles de proxy pour les supprimer plus tard. Si personne ne lance le nettoyage, ils restent en production pour de bon.'
		]
	},
	task: {
		prompt: 'Tu renommes `users.updated_at` en `updated_at_timestamp` avec les helpers de GitLab. Le nettoyage post-déploiement a tourné. Puis la nouvelle release révèle un vilain bug, et quelqu’un veut redéployer la release précédente, qui lit encore `updated_at`. Qu’est-ce qui casse ? Comment reviendrais-tu en arrière ?',
		hint: `Lis \`cleanup_concurrent_column_rename\` et la méthode juste après, \`undo_cleanup_concurrent_column_rename\` ([lignes 382-420](${HELPERS}#L382-L420)).`,
		answer: [
			'L’ancienne release casse : son code demande `updated_at`, et le nettoyage a supprimé cette colonne.',
			'Pour revenir en arrière, il faut une nouvelle migration. `undo_cleanup_concurrent_column_rename` recrée `updated_at`, copie les valeurs depuis `updated_at_timestamp` et réinstalle le trigger. C’est une nouvelle copie, et sur une grosse table ça prend du temps.',
			'L’ordre est donc : lance d’abord cette migration d’annulation, puis redéploie l’ancien code. Jamais dans l’autre sens.',
			'Souvent, le meilleur choix est de **corriger en avançant** : corrige le bug dans la nouvelle release, et ne touche pas au schéma.',
			'Pour la conception : garde le point de non-retour en **une seule petite étape, le plus tard possible**. GitLab place la suppression après le déploiement pour cette raison.'
		],
		steps: [
			{
				title: 'Vois ce que le nettoyage a laissé',
				questions: [
					{ q: 'Qu’a supprimé `cleanup_concurrent_column_rename` ?', options: ['Seulement le trigger', 'La nouvelle colonne `updated_at_timestamp`', 'Le trigger et l’ancienne colonne `updated_at`', 'Rien encore : il marque seulement la colonne'], answer: 2, why: 'Il retire les triggers de renommage, puis appelle `remove_column(table, old)`.' },
					{ q: 'Quelles colonnes existent maintenant sur `users` ?', options: ['Seulement `updated_at_timestamp`', '`updated_at` et `updated_at_timestamp`', 'Seulement `updated_at`', 'Aucune, jusqu’à la prochaine migration'], answer: 0, why: 'L’ancienne colonne a été supprimée. Il ne reste que le nouveau nom.' },
					{ q: 'Avant le nettoyage, dans quel sens le trigger copiait-il ?', options: ['De la nouvelle colonne vers l’ancienne', 'Dans les deux sens', 'Seulement sur les suppressions', 'De l’ancienne colonne vers la nouvelle, à chaque insertion et mise à jour'], answer: 3, why: 'C’était un trigger `BEFORE INSERT OR UPDATE` à sens unique, qui remplissait la nouvelle colonne à partir de l’ancienne.' },
					{ q: 'La nouvelle release a dit à Rails d’ignorer une colonne. Laquelle ?', options: ['`updated_at_timestamp`', '`updated_at`', 'Les deux', 'Aucune : Rails lit toutes les colonnes'], answer: 1, why: 'Le nouveau code lit le nouveau nom et ignore l’ancienne colonne, donc la suppression ne pouvait pas surprendre un processus en cours.' }
				]
			},
			{
				title: 'Dis ce qui casse',
				questions: [
					{ q: 'Tu redéploies la release précédente telle quelle. Que se passe-t-il ?', options: ['Ça marche : Rails fait correspondre l’ancien nom au nouveau', 'Ça marche : le trigger recopie la valeur', 'Ça casse : son code demande `updated_at`, qui n’existe plus', 'Ça marche, mais plus lentement'], answer: 2, why: 'L’ancien code lit `updated_at`, et le nettoyage a supprimé cette colonne.' },
					{ q: 'Pourquoi le trigger ne peut-il pas te sauver ici ?', options: ['Il a été retiré au nettoyage, avec l’ancienne colonne', 'Il ne tourne que sur les inserts, pas sur les lectures', 'Il copie le nouveau dans l’ancien, pas l’inverse', 'Il est désactivé pendant un redéploiement'], answer: 0, why: 'Le trigger relevait de l’architecture transitoire. Il ne vivait qu’entre les deux migrations.' },
					{ q: 'Avant le nettoyage, revenir en arrière coûtait combien ?', options: ['C’était impossible sans sauvegarde', 'Il fallait copier toute la table', 'Il fallait une interruption', 'Peu : `undo_rename_column_concurrently` retire juste le trigger et la nouvelle colonne'], answer: 3, why: 'Jusqu’au nettoyage, l’ancienne colonne gardait chaque valeur, donc annuler retirait seulement ce qui avait été ajouté.' },
					{ q: 'Quel genre de retour arrière est-ce maintenant ?', options: ['Un simple redéploiement de l’ancienne image', 'Un retour arrière qui demande d’abord une nouvelle migration', 'Un changement de config dans Rails', 'Un revert du dernier commit'], answer: 1, why: 'Passé le point de non-retour, tu ne peux revenir qu’en reconstruisant l’ancienne forme.' }
				]
			},
			{
				title: 'Prépare le retour',
				questions: [
					{ q: 'Quel helper reconstruit l’ancienne colonne ?', options: ['`undo_rename_column_concurrently`', '`rename_column_concurrently` avec les noms inversés', '`undo_cleanup_concurrent_column_rename`', '`cleanup_concurrent_column_rename`'], answer: 2, why: 'C’est la méthode juste après le nettoyage, et elle défait ce que le nettoyage a fait.' },
					{ q: 'Que fait ce helper ?', options: ['Il recrée `updated_at`, copie les valeurs depuis `updated_at_timestamp` et réinstalle le trigger', 'Il renomme `updated_at_timestamp` en `updated_at` sur place', 'Il restaure `updated_at` depuis la sauvegarde de la nuit', 'Il ajoute une vue appelée `updated_at`'], answer: 0, why: 'C’est une nouvelle copie des données, donc sur une grosse table ça prend du temps.' },
					{ q: 'Dans quel ordre reviens-tu en arrière ?', options: ['Redéployer l’ancien code, puis lancer la migration d’annulation', 'Les deux à la fois, en un seul déploiement', 'Lancer seulement la migration d’annulation, et garder le nouveau code', 'Lancer d’abord la migration d’annulation, puis redéployer l’ancien code'], answer: 3, why: 'L’ancien code a besoin de `updated_at` dès sa première requête. Déploie-le d’abord et il casse jusqu’à la fin de la copie.' },
					{ q: 'Pourquoi l’annulation prend-elle du temps sur une grosse table ?', options: ['Elle bloque tous les utilisateurs', 'Elle recopie chaque ligne dans la colonne recréée', 'Elle doit reconstruire le trigger pour chaque ligne', 'Elle attend la prochaine release'], answer: 1, why: 'Recréer la colonne, c’est recopier toutes les valeurs, pas juste changer un nom.' }
				]
			},
			{
				title: 'Choisis, et conçois pour la prochaine fois',
				questions: [
					{ q: 'Quel est souvent un meilleur choix que revenir en arrière ?', options: ['Corriger en avançant : corriger le bug dans la nouvelle release', 'Restaurer toute la base', 'Faire tourner les deux releases côte à côte', 'Supprimer aussi `updated_at_timestamp`'], answer: 0, why: 'Corriger en avançant laisse le schéma tranquille et évite une seconde copie d’une grosse table.' },
					{ q: 'Où une migration doit-elle placer son point de non-retour ?', options: ['Le plus tôt possible, pour s’en débarrasser', 'Réparti sur plusieurs étapes', 'En une seule petite étape, le plus tard possible', 'Dans la même étape que le déploiement'], answer: 2, why: 'Plus il est tardif et petit, plus longtemps chaque autre étape reste facile à annuler.' },
					{ q: 'La prochaine fois, personne ne lance le nettoyage pendant des mois. Qu’est-ce qui reste en production ?', options: ['Rien : Rails les retire au démarrage', 'Seulement la nouvelle colonne', 'Une sauvegarde de la table', 'Le trigger et l’ancienne colonne, qui copient à chaque écriture'], answer: 3, why: 'Le code transitoire que tu prévois de supprimer reste pour de bon si personne ne le supprime. Mets le nettoyage dans le plan, avec une date.' },
					{ q: 'Dans la logique du strangler fig, quand supprimes-tu une ancienne partie ?', options: ['À une date fixée', 'Quand plus aucune requête ne l’atteint', 'Dès que la nouvelle partie est déployée', 'Jamais : les anciennes parties restent en secours'], answer: 1, why: 'Fowler : déplace le comportement un morceau à la fois, et supprime chaque ancienne partie quand plus rien ne l’utilise.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Dans une migration en strangler fig, qu’est-ce que le **seam** ?',
			options: ['Le jour où tu bascules tous les utilisateurs de l’ancien système vers le nouveau, d’un coup', 'La suite de tests qui compare l’ancien et le nouveau système sur les mêmes requêtes', 'L’endroit unique qui décide, par requête ou par donnée, si l’ancien ou le nouveau code s’en occupe', 'La base de données que les deux systèmes partagent, pour voir toujours les mêmes données'],
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
			options: ['De l’architecture transitoire : elle fait marcher l’ancien et le nouveau côte à côte jusqu’à la fin du déplacement', 'Une partie permanente du schéma, qui garde les deux noms de colonne valides pour toujours', 'Un contrôle de sécurité qui bloque les écritures sur l’ancienne colonne pendant le renommage', 'Un cache qui sert les valeurs de la nouvelle colonne pendant que la copie par lots tourne'],
			answer: 0,
			why: 'Il ne vit qu’entre les deux migrations. `cleanup_concurrent_column_rename` le retire en même temps que l’ancienne colonne.'
		}
	],
	recall: {
		q: 'GitLab renomme une colonne sans interruption. Quelle étape ne s’annule pas facilement, et quand tourne-t-elle ?',
		a: 'La suppression de l’ancienne colonne dans `cleanup_concurrent_column_rename`. Elle tourne en dernier, dans une migration post-déploiement, une fois le nouveau code en ligne.'
	},
	sources: [
		{ title: 'Martin Fowler, Strangler Fig (2024)', url: 'https://martinfowler.com/bliki/StranglerFigApplication.html' },
		{ title: 'Cartwright, Horn, Lewis, Patterns of Legacy Displacement', url: 'https://martinfowler.com/articles/patterns-legacy-displacement/' },
		{ title: 'GitLab docs, Avoiding downtime in migrations: renaming columns', url: `${DOWNTIME}#L216-L345` },
		{ title: 'GitLab, rename_column_concurrently and cleanup_concurrent_column_rename', url: `${HELPERS}#L226-L420` },
		{ title: 'GitLab, UnidirectionalCopyTrigger', url: `${TRIGGER}#L16-L50` },
		{ title: 'GitLab, UnidirectionalCopyTrigger, the copy function', url: `${TRIGGER}#L94-L98` }
	]
};
