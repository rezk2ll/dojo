/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'backups',
	part: 'Fiabilité',
	title: 'Un plan de sauvegarde',
	minutes: 10,
	hook: [
		'Mardi, 14 h 20. Une développeuse lance un script de nettoyage sur la mauvaise base et supprime 3 millions de factures d’un PostgreSQL de 2 To. Les réplicas les suppriment aussi, quelques millisecondes plus tard.',
		'L’équipe a un `pg_dump` chaque nuit. Personne ne l’a restauré depuis un an. Le premier essai dure 9 heures et s’arrête à 80 % sur un disque plein. Le deuxième marche, et les factures créées depuis 2 h du matin ont disparu.',
		'La direction veut maintenant des chiffres : combien de données l’entreprise peut perdre, combien de temps prend une restauration, et la preuve que ça marche.'
	],
	terms: [
		{ term: 'RPO', def: 'Recovery point objective : la perte de données maximale, comptée en temps, que le métier accepte. Ici, 5 minutes.' },
		{ term: 'RTO', def: 'Recovery time objective : le temps maximal que le métier accepte entre la décision de restaurer et le retour de la base. Ici, 2 heures.' },
		{ term: 'Archivage du WAL', def: 'PostgreSQL confie chaque segment terminé du journal d’écriture anticipée (16 Mo par défaut) à une commande qui le copie hors du serveur. Une sauvegarde de base plus ces segments permet de reconstruire la base à n’importe quel moment entre les deux.' }
	],
	kata: {
		brief: [
			'Une entreprise de facturation fait tourner une seule base PostgreSQL de **2 To**. Elle écrit environ 20 Go de WAL par jour, avec une nuit calme de 1 h à 6 h. Environ 25 Go de fichiers de tables et d’index changent chaque jour. Les sauvegardes doivent être gardées 30 jours.',
			'L’entreprise accepte de perdre 5 minutes de données au plus, et la base doit revenir en **moins de 2 heures** après la décision de restaurer. Ça inclut une restauration à un moment précis avant un mauvais script, comme 14 h 19 un mardi.',
			'Dans cet énoncé, un serveur de restauration lit depuis le serveur de sauvegarde à 400 Mo/s avec 8 processus en parallèle, et rejoue un jour de WAL en 15 minutes. Le plan doit aussi prouver, chaque mois, qu’une restauration marche et tient en 2 heures.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit combien de temps, au plus, un commit reste sur le primaire avant qu’une copie existe ailleurs, et c’est moins de 5 minutes.',
			'Ton design additionne le temps de restauration (téléchargement, puis rejeu du WAL) avec les chiffres de l’énoncé, et le total reste sous 2 heures.',
			'Ton design dit comment restaurer à 14 h 19, et pas au dernier état.',
			'Ton design garde une copie qui survit à la perte du datacenter entier.',
			'Ton design donne l’espace de stockage nécessaire pour 30 jours.',
			'Ton design dit qui ou quoi lance le test de restauration mensuel, et ce qui compte comme une réussite.'
		],
		sample: [
			'La réponse utilise pgBackRest avec deux dépôts : repo1 sur un serveur de sauvegarde du même datacenter pour restaurer vite, et repo2 dans un stockage objet d’une autre région. Une sauvegarde complète tourne chaque dimanche à 6 h 30, et une différentielle du lundi au samedi à 6 h 30. Une différentielle ne copie que les fichiers changés depuis la dernière complète.',
			'Le WAL. PostgreSQL lance `archive_command = \'pgbackrest --stanza=main archive-push %p\'` pour chaque segment de 16 Mo terminé. Pendant la nuit calme, un segment peut mettre des heures à se remplir, et un commit attendrait autant avant d’être copié. La réponse règle `archive_timeout = 60` : PostgreSQL passe alors à un nouveau segment au bout de 60 secondes s’il y a eu de l’activité. La perte maximale tombe à environ **1 minute**, plus le temps de copie.',
			'Le prix de `archive_timeout` : un segment fermé en avance occupe quand même 16 Mo. Au pire, ça fait 1 440 segments par jour, environ 23 Go, proche des 20 Go de WAL normaux, donc l’archive double au plus.',
			'Le temps de restauration, au pire un samedi après-midi. La complète fait 2 To à 400 Mo/s : 5 000 secondes, environ 83 minutes. La différentielle contient 6 jours de changements, 150 Go, environ 6 minutes. Ensuite PostgreSQL rejoue le WAL depuis 6 h 30 le matin même, moins de 15 minutes. Total : environ **104 minutes**, 16 minutes sous l’objectif.',
			'Le moment précis. La restauration lance `pgbackrest --stanza=main --type=time "--target=2026-10-13 14:19:00+00" --target-action=promote restore`. PostgreSQL rejoue le WAL jusqu’à 14 h 19 et s’arrête là, donc la suppression de 14 h 20 n’est jamais rejouée.',
			'Le stockage par dépôt, avant compression. `repo1-retention-full=6` garde 6 complètes : juste après une complète du dimanche, la plus ancienne a 35 jours, soit 12 To. `repo1-retention-diff=6` garde les 6 dernières différentielles, 25 + 50 + ... + 150 Go, environ 0,5 To. Le WAL de 42 jours à 20 Go par jour ajoute moins de 1 To.',
			'La preuve. Le premier lundi de chaque mois, une tâche planifiée restaure repo1 sur un serveur de rechange à « il y a 1 heure ». Le test réussit si PostgreSQL accepte des connexions en moins de 2 heures et si le nombre de factures créées avant ce moment est le même qu’en production. Un test raté ou trop lent alerte l’équipe base de données.',
			'Le choix principal : une différentielle chaque jour. Avec une seule complète par semaine, une restauration le samedi rejouerait 6 jours de WAL, environ 90 minutes, et le total dépasserait 2 heures. La réponse renonce à cette vitesse pour les cibles anciennes : restaurer à il y a 3 semaines part d’une vieille complète et rejoue jusqu’à 6 jours de WAL, donc plus de 2 heures.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse, qu’est-ce qui garde la perte sous 5 minutes, et combien dure la pire restauration ?',
		a: '`archive_timeout = 60` ferme un segment de WAL au moins chaque minute. La pire restauration, un samedi, dure environ 104 minutes : 83 pour la complète, 6 pour la différentielle, 15 pour le WAL.'
	},
	sources: [
		{ title: 'Documentation PostgreSQL, Continuous Archiving and Point-in-Time Recovery', url: 'https://www.postgresql.org/docs/current/continuous-archiving.html' },
		{ title: 'Documentation PostgreSQL, Write Ahead Log (archive_timeout)', url: 'https://www.postgresql.org/docs/current/runtime-config-wal.html' },
		{ title: 'pgBackRest User Guide', url: 'https://pgbackrest.org/user-guide.html' }
	]
};
