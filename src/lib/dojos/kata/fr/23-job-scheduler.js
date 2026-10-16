/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'job-scheduler',
	part: 'Temps réel',
	title: 'Un planificateur de tâches',
	minutes: 10,
	hook: [
		'Une appli de facturation envoie 20 000 relances de paiement chaque matin à 9 h. Une ligne cron sur un seul serveur lance le script qui les envoie.',
		'Mardi dernier, ce serveur a redémarré à 8 h 59 pour une mise à jour du noyau, et aucun client n’a reçu de relance ce jour-là. La semaine d’avant, quelqu’un a relancé le script après un timeout, et 3 000 clients ont reçu deux fois la même relance.',
		'L’équipe veut un seul planificateur pour tout son travail à heure fixe : il lance chaque tâche à son heure, une fois, et un serveur mort retarde les tâches sans en perdre.'
	],
	terms: [
		{ term: 'Bail (lease)', def: 'Une réservation de tâche qui prend fin à une heure fixée, stockée dans la ligne de la tâche en `locked_until`. Si le worker n’a pas fini avant, un autre worker peut prendre la tâche.' },
		{ term: 'SKIP LOCKED', def: 'Une option PostgreSQL de `SELECT ... FOR UPDATE` : les lignes verrouillées par une autre transaction sont sautées au lieu de faire attendre la requête.' },
		{ term: 'Au moins une fois (at-least-once)', def: 'Chaque tâche s’exécute une fois ou plus. Un crash peut la faire tourner de nouveau, mais elle ne tourne jamais zéro fois.' },
		{ term: 'Clé d’idempotence', def: 'Une valeur envoyée avec une requête pour que le destinataire reconnaisse une répétition et ne fasse le travail qu’une fois. Ici, l’id de la tâche.' }
	],
	kata: {
		brief: [
			'L’appli crée 200 000 tâches par jour via une API interne : relances, facturations, e-mails de fin d’essai. Chaque tâche a un type, un payload JSON d’environ 1 Ko et l’heure où elle doit tourner. Une tâche dure 2 secondes en moyenne et 30 secondes au maximum.',
			'Les tâches ne sont pas réparties de façon égale : 20 000 relances tombent pile à 9 h. Chaque tâche doit démarrer moins d’une minute après son heure. Un processus worker exécute 50 tâches en même temps.',
			'Un worker peut planter au milieu d’une tâche, et un serveur entier peut tomber. Une tâche prise par un worker mort doit tourner dans les 5 minutes. L’équipe veut surtout ne plus envoyer deux fois le même e-mail.',
			'L’équipe a déjà PostgreSQL avec un réplica. Conçois l’endroit où les tâches sont stockées, la façon dont les workers les prennent, et ce qui se passe quand un worker meurt avec une tâche en main.'
		],
		minutes: 10,
		checklist: [
			'Ton design donne le nombre de processus workers nécessaires pour démarrer 20 000 tâches dans la minute qui suit 9 h.',
			'Ton design dit où vit une tâche entre sa création et son exécution, et qu’un redémarrage de serveur ne l’efface pas.',
			'Ton design dit ce qui empêche deux workers de prendre la même tâche au même instant.',
			'Ton design dit comment une tâche tenue par un worker planté finit par tourner, et au bout de combien de temps.',
			'Ton design dit ce qui se passe quand une tâche a envoyé son e-mail et que le worker est mort avant de la marquer terminée.',
			'Ton design dit ce que contient la table des tâches au bout d’un an, et quand les lignes terminées sont supprimées.'
		],
		sample: [
			'Les tâches vivent dans une table PostgreSQL `jobs` : `id`, `type`, `payload`, `run_at`, `state`, `locked_until`, `attempts`. Un index partiel sur `run_at WHERE state = \'pending\'` ne contient que les tâches encore à lancer. La doc PostgreSQL : un tel index "contains entries only for those table rows that satisfy the predicate". Aucun minuteur ne vit dans la mémoire d’un worker, donc un redémarrage ne perd rien.',
			'200 000 tâches par jour, cela fait environ 2,3 par seconde en moyenne. C’est le pic de 9 h qui dimensionne : 20 000 tâches de 2 secondes font 40 000 secondes de travail. Pour toutes les démarrer en 60 secondes, il en faut environ 670 en parallèle, soit 14 processus de 50.',
			'Chaque worker interroge la table une fois par seconde avec une seule requête : `UPDATE jobs SET state = \'running\', locked_until = now() + interval \'3 minutes\', attempts = attempts + 1 WHERE id IN (SELECT id FROM jobs WHERE state = \'pending\' AND run_at <= now() ORDER BY run_at LIMIT 50 FOR UPDATE SKIP LOCKED) RETURNING *`. La doc : avec `SKIP LOCKED`, "any selected rows that cannot be immediately locked are skipped". Deux workers qui interrogent à la même milliseconde reçoivent deux lots différents de 50 tâches.',
			'La transaction se termine dès que l’`UPDATE` est validé, et la doc précise : "Row-level locks are released at transaction end". Ensuite, seuls `state` et `locked_until` indiquent que la tâche est prise. Un worker qui a fini passe `state = \'done\'`. 14 workers qui interrogent une fois par seconde, cela fait 14 petites requêtes par seconde.',
			'Un récupérateur tourne chaque minute : `UPDATE jobs SET state = \'pending\' WHERE state = \'running\' AND locked_until < now()`. Une tâche tenue par un worker planté revient dans la file au plus 4 minutes après sa prise, et l’interrogation suivante la reprend. Le bail de 3 minutes vaut six fois la tâche la plus longue (30 secondes) : une tâche lente n’est pas reprise pendant qu’elle tourne encore.',
			'Tu obtiens donc « au moins une fois » : un worker qui a envoyé l’e-mail puis est mort avant `done` fait tourner la tâche une seconde fois. Un handler qui écrit dans PostgreSQL insère dans une table à colonne `job_id` unique, dans la même transaction qui passe la tâche à `done`. Une seconde exécution bute sur cette clé unique et ne change rien. Un handler qui appelle un service extérieur lui passe l’id de la tâche comme clé d’idempotence, quand le service en accepte une.',
			'Le prix de ce design : une tâche dont le service extérieur ne prend pas de clé d’idempotence peut encore tourner deux fois après un crash. Les tâches d’un worker planté attendent jusqu’à 4 minutes, donc une relance de 9 h peut partir à 9 h 04. Une tâche pèse environ 1 Ko, donc 200 000 par jour font 200 Mo par jour ; une tâche de nuit supprime les lignes `done` de plus de 30 jours, ce qui garde la table vers 6 Go.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse, qu’est-ce qui permet à une tâche tenue par un worker planté de tourner à nouveau, et en combien de temps ?',
		a: 'Le bail `locked_until` de 3 minutes. Un récupérateur qui tourne chaque minute remet en `pending` les tâches au bail expiré, donc la tâche est reprise au plus environ 4 minutes après sa prise.'
	},
	sources: [
		{ title: 'Doc PostgreSQL : SELECT, la clause de verrouillage et SKIP LOCKED', url: 'https://www.postgresql.org/docs/current/sql-select.html' },
		{ title: 'Doc PostgreSQL : verrouillage explicite, verrous de ligne', url: 'https://www.postgresql.org/docs/current/explicit-locking.html' },
		{ title: 'Doc PostgreSQL : index partiels', url: 'https://www.postgresql.org/docs/current/indexes-partial.html' }
	]
};
