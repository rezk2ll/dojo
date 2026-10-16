/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'leaderboard',
	part: 'Les données',
	title: 'Un classement de jeu',
	minutes: 10,
	hook: [
		'Lina termine une partie d’un jeu de puzzle sur son téléphone. L’écran de fin montre les 100 meilleurs joueurs de la saison, et en dessous : « Tu es n° 1 204 387 ». Elle relance une partie pour grimper.',
		'La première version calculait cette ligne avec `SELECT count(*) FROM scores WHERE best > $1`. Avec 5 millions de lignes, chaque écran de fin comptait jusqu’à 5 millions de lignes, et l’écran mettait 4 secondes à s’afficher au pic.',
		'Tu conçois le classement pour que les deux réponses arrivent en moins de 100 ms.'
	],
	terms: [
		{ term: 'Sorted set', def: 'Un type Redis qui garde des membres uniques triés par un score numérique, avec chaque recherche en O(log N).' },
		{ term: 'Rang', def: 'La position d’un joueur dans le classement, comptée à partir de 1 pour le meilleur score.' },
		{ term: 'Départage', def: 'La règle qui ordonne deux joueurs à égalité de points, ici celui qui les a atteints en premier.' }
	],
	kata: {
		brief: [
			'Un jeu mobile compte 5 millions de joueurs dans la saison en cours. Une saison dure 30 jours. Les scores vont de 0 à 10 millions de points, et le classement range chaque joueur selon son meilleur score de la saison.',
			'Les joueurs terminent 20 millions de parties par jour, avec un pic à 3 fois la moyenne. Chaque partie terminée envoie un score. L’écran de fin s’ouvre 10 millions de fois par jour et montre le top 100 plus le rang du joueur.',
			'Les deux réponses doivent arriver en moins de 100 ms. Quand deux joueurs ont le même meilleur score, celui qui l’a atteint en premier est classé devant.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit quelle structure donne un rang sans compter des millions de lignes.',
			'Ton design donne la commande ou la requête du top 100, et son coût pour 5 millions de joueurs.',
			'Ton design donne la commande ou la requête du rang d’un joueur en position 3 000 000.',
			'Ton design dit comment deux joueurs à égalité de points sont ordonnés.',
			'Ton design dit ce qui se passe quand un nouveau score est plus bas que le meilleur du joueur.',
			'Ton design estime la mémoire pour 5 millions de joueurs.',
			'Ton design dit comment le classement revient si la machine qui le porte est perdue.'
		],
		sample: [
			'20 millions de parties par jour font environ 230 scores par seconde en moyenne, et environ 700 au pic. 10 millions d’écrans de fin par jour font environ 350 par seconde au pic, avec deux lectures chacun.',
			'Le classement est un seul sorted set Redis, `lb:season-12`, avec l’identifiant du joueur comme membre et son meilleur score comme score. Une partie terminée lance `ZADD lb:season-12 GT <score> player:<id>`. La doc Redis dit de GT : "Only update an existing member if the new score is greater than the current score". Un score plus bas ne change donc rien.',
			'Le top 100 s’obtient avec `ZRANGE lb:season-12 0 99 REV WITHSCORES`, que la doc donne en O(log(N)+M), M étant les 100 membres renvoyés. Le rang du joueur vaut `ZREVRANK lb:season-12 player:<id>` plus 1, en O(log(N)). Le log2 de 5 millions vaut environ 22 : les deux lectures coûtent pareil pour le joueur n° 3 et pour le n° 3 000 000.',
			'Redis range les membres à score égal selon leurs octets, ce qui ne dit rien de qui est arrivé en premier. Le score embarque donc le départage : points × 100 000 000 + (99 999 999 − secondes depuis le début de la saison). À points égaux, une heure plus ancienne donne un score plus haut. La plus grande valeur vaut environ 10^15, sous la limite de 2^53 jusqu’à laquelle, selon la doc, un score Redis "precisely represents integers".',
			'Un test avec Redis 7.4 a mesuré `MEMORY USAGE` à environ 111 octets par membre, pour 1 million de membres aux identifiants de 14 octets. 5 millions de joueurs prennent alors environ 560 Mo, ce qui tient sur une instance Redis avec un réplica.',
			'Redis n’en garde qu’une copie : chaque score est aussi écrit dans une table PostgreSQL `scores`, qui reste la source de vérité. Si les deux machines Redis sont perdues, une tâche relit les 5 millions de meilleurs scores et les renvoie par lots avec `ZADD`. Le classement affiche des rangs périmés jusqu’à la fin de cette tâche.',
			'Le prix de ce design : tout le classement doit tenir dans la mémoire d’une machine, et chaque nouveau classement (par semaine, par pays, entre amis) ajoute un sorted set à écrire à chaque partie. Le rang d’un joueur bouge aussi avec chaque score envoyé par les autres, donc deux écrans de fin à une seconde d’écart peuvent montrer deux rangs différents.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse proposée, quelles commandes Redis donnent le top 100 et le rang d’un joueur, et comment leur coût grandit-il avec 5 millions de joueurs ?',
		a: '`ZRANGE lb:season-12 0 99 REV WITHSCORES` et `ZREVRANK lb:season-12 player:<id>`. Les deux sont en O(log N), environ 22 pour 5 millions de membres : le rang 3 000 000 coûte autant que le rang 3.'
	},
	sources: [
		{ title: 'Doc Redis : ZADD', url: 'https://redis.io/docs/latest/commands/zadd/' },
		{ title: 'Doc Redis : ZRANGE', url: 'https://redis.io/docs/latest/commands/zrange/' },
		{ title: 'Doc Redis : ZREVRANK', url: 'https://redis.io/docs/latest/commands/zrevrank/' }
	]
};
