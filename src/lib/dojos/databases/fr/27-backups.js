const BR = 'https://github.com/pgbackrest/pgbackrest/blob/4c65010e7d28ea68571732fb275d91266a97ad80';
const CONF = `${BR}/src/command/restore/config.c.inc`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'backups',
	part: 'La garder en marche',
	title: 'Des sauvegardes qu’on sait restaurer',
	minutes: 10,
	hook: [
		'Mercredi, 14 h 03. Quelqu’un lance `DELETE FROM orders` dans le mauvais terminal, sans `WHERE`. Ta sauvegarde, c’est un `pg_dump` nocturne de 2 h. **Douze heures de commandes ont disparu**, quoi que tu fasses ensuite.',
		'Et ce dump : quelqu’un l’a-t-il déjà chargé dans un serveur neuf ? Si personne ne l’a fait, tu testes la restauration pour la première fois aujourd’hui, avec douze heures de commandes déjà perdues.',
		'PostgreSQL connaît deux sortes de sauvegarde : le dump logique et la base backup. Une base backup plus le WAL archivé te ramène à **14:02:59**. pgBackRest, un outil de sauvegarde très utilisé, montre ce qu’une restauration écrit vraiment.'
	],
	terms: [
		{ term: 'Dump logique', def: 'Ce que produit `pg_dump` : du SQL ou une archive qui reconstruit les tables. Un instantané cohérent d’un moment, portable d’une version à l’autre, mais impossible de rejouer du WAL par-dessus.' },
		{ term: 'Base backup', def: 'Une copie de tout le répertoire de données, prise pendant que le serveur tourne (`pg_basebackup`, ou un outil comme pgBackRest). Le point de départ pour rejouer le WAL.' },
		{ term: 'Archive WAL', def: 'Chaque segment de WAL terminé, copié en lieu sûr par `archive_command`. Avec une base backup, elle contient chaque changement depuis cette sauvegarde.' },
		{ term: 'Récupération à un instant donné', def: 'PITR en anglais : tu restaures une base backup, tu rejoues le WAL, et tu t’arrêtes à un moment choisi, la cible de récupération, comme `recovery_target_time`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['db[("Primaire : fichiers de données et pg_wal")] -->|"pgbackrest backup, dimanche 01:00"| base["Base backup"]'],
				highlight: ['db', 'base'],
				note: 'La base backup copie le répertoire de données pendant que le serveur continue de tourner. La doc : « We do not need a perfectly consistent file system backup as the starting point. » (pas besoin d’une copie parfaitement cohérente au départ). Le rejeu du WAL corrige ce qui a bougé pendant la copie.'
			},
			{
				add: ['db -->|"archive_command, chaque segment terminé"| arch[("Archive WAL")]'],
				highlight: ['arch'],
				note: 'Chaque segment de WAL, une fois plein, part dans l’archive. La commande doit renvoyer 0 seulement si la copie a vraiment marché, car sur un zéro PostgreSQL supprime ou recycle le segment. À elles deux, la base backup et l’archive contiennent chaque changement depuis dimanche.'
			},
			{
				add: ['oops["Mercredi 14:03 : DELETE sans WHERE"] -.-> db'],
				highlight: ['oops'],
				note: 'Le `DELETE` est dans le WAL lui aussi, comme tout autre changement. Un dump de 2 h ne peut rien pour toi après 2 h. L’archive peut te ramener à n’importe quel moment avant 14:03, parce qu’elle contient les minutes entre les deux.'
			},
			{
				add: ['base -->|"restaure les fichiers"| new[("Nouveau serveur")]', 'arch -->|"restore_command, rejoue jusqu’à 14:02:59"| new'],
				highlight: ['new'],
				note: 'Restaure la base backup sur un nouveau serveur, règle `restore_command` et `recovery_target_time`, crée `recovery.signal`, démarre. Le serveur va chercher et rejoue le WAL depuis dimanche, puis s’arrête à la cible. La cible doit être après la fin de la base backup : le rejeu ne va que vers l’avant.'
			},
			{
				add: ['new -->|"en pause : vérifie les lignes"| check["Compte les commandes, puis reprends"]'],
				highlight: ['check'],
				note: 'Par défaut, `recovery_target_action` vaut `pause` : tu peux d’abord interroger les lignes. Si la cible était trop tôt, mets-en une plus tardive et redémarre ; le rejeu continue. Si les lignes sont bonnes, `pg_wal_replay_resume()` termine la récupération et une nouvelle timeline commence. L’ID de timeline figure dans le nom des fichiers WAL : le WAL écrit après la restauration n’écrase jamais l’ancien historique.'
			}
		]
	},
	example: {
		title: 'src/command/restore/config.c.inc : ce que pgBackRest écrit pour que le serveur récupère',
		repo: 'pgbackrest/pgbackrest',
		url: `${CONF}#L81-L131`,
		lang: 'c',
		code: `        // Write restore_command
        if (!strLstExists(recoveryOptionKey, RESTORE_COMMAND_STR))
        {
…
            KeyValue *const optionReplace = kvNew();
…
            kvPut(
                result, VARSTRDEF(RESTORE_COMMAND),
                VARSTR(
                    strNewFmt(
                        "%s %s %%f \\"%%p\\"", strZ(cfgOptionStr(cfgOptCmd)),
                        strZ(strLstJoin(cfgExecParam(cfgCmdArchiveGet, cfgCmdRoleMain, optionReplace, true, true), " ")))));
        }

        // If recovery type is immediate
        if (cfgOptionSeq(cfgOptType) == CFGOPTVAL_RESTORE_TYPE_IMMEDIATE)
        {
            kvPut(result, VARSTRDEF(RECOVERY_TARGET), VARSTRDEF(CFGOPTVAL_RESTORE_TYPE_IMMEDIATE_Z));
        }
        // Else recovery type is standby
        else if (cfgOptionSeq(cfgOptType) == CFGOPTVAL_RESTORE_TYPE_STANDBY)
        {
            // Write standby_mode for PostgreSQL versions that support it
            if (pgVersion < PG_VERSION_RECOVERY_GUC)
                kvPut(result, VARSTR(STANDBY_MODE_STR), VARSTRDEF("on"));
        }
        // Else recovery type is not default so write target options
        else if (cfgOptionSeq(cfgOptType) != CFGOPTVAL_RESTORE_TYPE_DEFAULT)
        {
            // Write the recovery target
            kvPut(
                result, VARSTR(strNewFmt(RECOVERY_TARGET "_%s", strZ(cfgOptionDisplay(cfgOptType)))),
                VARSTR(cfgOptionStr(cfgOptTarget)));

            // Write recovery_target_inclusive
            if (cfgOptionTest(cfgOptTargetExclusive) && cfgOptionBool(cfgOptTargetExclusive))
                kvPut(result, VARSTRDEF(RECOVERY_TARGET_INCLUSIVE), VARSTR(FALSE_STR));
        }`,
		notes: [
			'Lignes 1 à 13 : sauf si tu mets la tienne, pgBackRest écrit une `restore_command` qui lance son propre `archive-get` avec `%f "%p"`. La récupération lance cette commande shell pour chaque segment de WAL archivé, avec dans `%f` le nom du fichier voulu et dans `%p` le chemin où le copier. Il retire les options qui n’avaient de sens que pour la restauration ; le [commentaire](' + CONF + '#L84-L86) trouve ça « seems better than, for example, passing --process-max=32 to archive-get because it was specified for restore. » (mieux que de passer à archive-get un --process-max=32 donné pour la restauration).',
			'Lignes 27 à 37 : pgBackRest écrit `--type=time --target=...` sous la forme `recovery_target_` suivi du nom du type, donc `recovery_target_time`. `--target-exclusive` ajoute `recovery_target_inclusive = false`, qui s’arrête juste avant la cible au lieu de juste après. Chaque option est ensuite [écrite sous la forme](' + CONF + '#L184-L194) `key = \'value\'`.',
			'Avant d’ajouter les siennes, la restauration [réécrit postgresql.auto.conf](' + CONF + '#L262-L283) et préfixe chaque ancienne ligne `recovery_target*` par « # Removed by pgBackRest restore on ». Une deuxième restauration n’hérite jamais du point d’arrêt de la première. Puis elle crée `recovery.signal` (dans les sources), qui dit à PostgreSQL de récupérer.',
			'Le [guide utilisateur](https://pgbackrest.org/user-guide.html#pitr) restaure un cluster avec `--type=time` et affiche le résultat : `restore_command = \'pgbackrest --stanza=demo archive-get %f "%p"\'` et une ligne `recovery_target_time`. Ses mots : « pgBackRest has generated the recovery settings in postgresql.auto.conf so PostgreSQL can be started immediately. » (les réglages sont prêts, PostgreSQL peut démarrer tout de suite).',
			'Choisis une sauvegarde terminée avant la cible. Le même guide essaie ensuite une sauvegarde prise après la suppression de la table, et prévient : « PostgreSQL can only play forward, not backward. » (PostgreSQL ne rejoue que vers l’avant). La doc PostgreSQL le dit aussi : « The stop point must be after the ending time of the base backup ».'
		]
	},
	tradeoff: {
		gain: [
			'Récupération à n’importe quel moment depuis la base backup : un mauvais `DELETE` te coûte quelques secondes de données, pas une journée.',
			'Tu n’as pas besoin d’une copie complète chaque jour. La doc : « continuous backup can be achieved simply by continuing to archive the WAL files. » (il suffit de continuer à archiver le WAL).',
			'La base backup n’a pas besoin d’un système de fichiers figé ni de snapshots ; le rejeu du WAL répare ce qui a changé pendant la copie.'
		],
		cost: [
			'Tu restaures tout le cluster ou rien : la méthode « can only support restoration of an entire database cluster, not a subset ». Pour une table perdue, tu restaures ailleurs puis tu recopies la table.',
			'Une base backup ne se restaure que sur la version de serveur qui l’a produite. Un `pg_dump` peut « generally be re-loaded into newer versions of PostgreSQL » (se recharger dans une version plus récente) : garde des dumps pour changer de version.',
			'Le stockage : la base backup est volumineuse, et un serveur chargé envoie beaucoup de mégaoctets de WAL vers l’archive.',
			'Le rejeu ne peut pas dépasser un segment de WAL manquant. La récupération exige « a continuous sequence of archived WAL files » (une suite continue de fichiers WAL archivés), et seule une restauration de test prouve que tu l’as.'
		]
	},
	task: {
		prompt: 'Les base backups tournent le dimanche à 01:00 et le WAL est archivé en continu. Mercredi à 14:03:10, quelqu’un lance `DROP TABLE orders`. Écris la récupération : quelle sauvegarde, quels réglages, ce que tu vérifies, et comment `orders` revient en production. Puis dis ce qu’un `pg_dump` nocturne à 02:00 t’aurait coûté.',
		hint: 'Tu ne veux pas ramener tout le cluster en arrière : d’autres tables ont reçu des écritures après 14:03. Récupère d’abord ailleurs.',
		answer: [
			'Prends la base backup de dimanche : la plus récente qui s’est terminée avant 14:03:10. Restaure-la sur un **nouveau** serveur ou un nouveau répertoire de données, jamais par-dessus le primaire, qui continue de tourner.',
			'Règle `restore_command` pour lire l’archive, `recovery_target_time = \'2026-10-14 14:03:00+00\'` (la date de mercredi, avec le fuseau), laisse `recovery_target_action` à sa valeur par défaut `pause`, et crée un fichier `recovery.signal` vide dans le répertoire de données. Démarre le serveur.',
			'Il rejoue de dimanche à mercredi 14:03:00 et se met en pause. Vérifie : `SELECT count(*), max(created_at) FROM orders;`. Si la dernière commande est trop ancienne, mets une cible plus tardive et redémarre ; le rejeu continue. Si tu as dépassé la suppression, recommence depuis la base backup.',
			'Recopie la table : `pg_dump -t orders` depuis le serveur récupéré, chargé dans le primaire. Seules les lignes écrites entre 14:03:00 et la suppression sont perdues.',
			'Avec le seul dump de 02:00 : la même recopie, mais toutes les commandes de 02:00 à 14:03 sont perdues, environ douze heures.'
		]
	},
	quiz: [
		{
			q: 'Ta seule sauvegarde est un `pg_dump` nocturne. Pourquoi ne peux-tu pas rejouer le WAL archivé par-dessus pour atteindre 14:02 ?',
			options: [
				'Un dump est une copie logique, et le rejeu du WAL exige une base backup des fichiers',
				'Le WAL est effacé à chaque checkpoint, il n’y a donc rien à rejouer depuis 02:00',
				'pg_dump empêche l’écriture du WAL pendant qu’il tourne, ce qui laisse un trou',
				'Le rejeu marche sur un dump, mais seulement pour les tables avec une clé primaire'
			],
			answer: 0,
			why: 'La doc : les dumps « do not produce file-system-level backups and cannot be used as part of a continuous-archiving solution. Such dumps are logical and do not contain enough information to be used by WAL replay. » Le WAL décrit des changements de pages (jour 15), il lui faut donc les pages.'
		},
		{
			q: 'Une base backup s’est terminée dimanche à 01:20. Une table a été supprimée dimanche à 01:10. Cette sauvegarde peut-elle ramener la table ?',
			options: [
				'Oui : mets `recovery_target_time` à 01:09 et rejoue depuis cette sauvegarde',
				'Oui, mais seulement avec `recovery_target_inclusive` réglé sur `false`',
				'Non : une base backup ignore toute table supprimée pendant la copie',
				'Non : la cible doit être après la fin de la sauvegarde, prends la précédente'
			],
			answer: 3,
			why: '« The stop point must be after the ending time of the base backup. » Le rejeu part de la sauvegarde et ne va que vers l’avant : un moment antérieur à sa fin est hors d’atteinte. Prends la base backup précédente et rejoue l’archive depuis là.'
		},
		{
			q: 'Ton `archive_command` est un script qui renvoie toujours 0, même quand la copie échoue. Qu’est-ce qui se passe mal ?',
			options: [
				'PostgreSQL réessaie sans fin et `pg_wal` grossit jusqu’à remplir le disque',
				'PostgreSQL recycle des segments de WAL qui n’ont jamais atteint l’archive',
				'Rien : PostgreSQL vérifie dans l’archive chaque fichier après la copie',
				'Le primaire refuse les nouveaux commits tant que l’archive ne confirme pas'
			],
			answer: 1,
			why: 'La doc : « Upon getting a zero result, PostgreSQL will assume that the file has been successfully archived, and will remove or recycle it. » La chaîne a maintenant un trou, et tu l’apprends pendant la restauration. Un code de sortie non nul est l’échec sans danger : PostgreSQL réessaie.'
		}
	],
	recall: {
		q: 'Un `DELETE` a frappé `orders` à 14:03. De quoi as-tu besoin pour retrouver les lignes telles qu’à 14:02:59, et pourquoi un `pg_dump` nocturne ne t’y amène-t-il pas ?',
		a: 'D’une base backup terminée avant 14:03, plus chaque segment de WAL archivé depuis, rejoués avec `recovery_target_time`. Le rejeu du WAL a besoin des fichiers de données : il ne peut pas tourner par-dessus un dump logique.'
	},
	sources: [
		{ title: 'Doc PostgreSQL, Continuous Archiving and Point-in-Time Recovery', url: 'https://www.postgresql.org/docs/current/continuous-archiving.html' },
		{ title: 'Doc PostgreSQL, SQL Dump', url: 'https://www.postgresql.org/docs/current/backup-dump.html' },
		{ title: 'Doc PostgreSQL, réglages Recovery Target', url: 'https://www.postgresql.org/docs/current/runtime-config-wal.html#RUNTIME-CONFIG-WAL-RECOVERY-TARGET' },
		{ title: 'Guide utilisateur de pgBackRest', url: 'https://pgbackrest.org/user-guide.html' },
		{ title: 'Source pgBackRest, src/command/restore/config.c.inc', url: CONF },
		{ title: 'Source pgBackRest, création de recovery.signal', url: `${CONF}#L346-L355` }
	]
};
