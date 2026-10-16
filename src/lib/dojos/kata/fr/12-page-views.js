/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'page-views',
	part: 'Les données',
	title: 'Compter les pages vues',
	minutes: 10,
	hook: [
		'Un site de recettes montre à chaque auteur un tableau de bord : combien de personnes ont ouvert chacune de ses recettes, heure par heure. Nadia publie une soupe à 9 h et recharge le tableau à 9 h 05 pour voir si quelqu’un est venu.',
		'Chaque chargement de page envoie une petite requête au site : « la page 48213 a été vue ». Un dimanche soir, ça fait 20 000 requêtes par seconde.',
		'La première version lançait `UPDATE pages SET views = views + 1` à chaque requête. Chaque vue d’une page populaire attendait le verrou de la même ligne.'
	],
	terms: [
		{ term: 'Upsert', def: 'Une seule requête qui insère une ligne, ou la met à jour si une ligne avec la même clé existe déjà.' },
		{ term: 'Pré-agrégation', def: 'Additionner les compteurs en mémoire sur le serveur d’appli et écrire les sommes, au lieu d’écrire chaque événement.' },
		{ term: 'Flush', def: 'Le moment où un serveur d’appli écrit en base les compteurs qu’il garde en mémoire, puis repart de zéro.' }
	],
	kata: {
		brief: [
			'20 000 pages vues par seconde au pic, reçues par 8 serveurs d’appli derrière un répartiteur de charge. Le site a 500 000 pages.',
			'Sur 30 secondes, au plus 15 000 pages différentes reçoivent une vue. Sur une heure, environ 40 000 pages différentes.',
			'Le tableau de bord affiche les vues par page et par heure, avec jusqu’à 1 minute de retard. Les compteurs horaires sont gardés 2 ans. Perdre quelques vues est acceptable ; un compteur doublé ou très faux ne l’est pas.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit combien d’écritures par seconde en base donnent les 20 000 vues.',
			'Ton design dit ce qui arrive aux compteurs d’un serveur d’appli qui plante.',
			'Ton design dit ce qui se passe si une écriture en base dépasse son délai et est relancée.',
			'Ton design donne la place prise par 2 ans de compteurs horaires.',
			'Ton design dit quelle requête lance le tableau de bord, et quel index la sert.',
			'Ton design dit comment une vue à 9 h 59 min 58 s finit dans l’heure de 9 h.'
		],
		sample: [
			'Chaque serveur d’appli garde une table en mémoire : la clé `(page_id, hour)`, la valeur un compteur. Une vue fait seulement `count += 1` dans cette table. L’heure vient de l’instant où le serveur a reçu la vue : une vue à 9 h 59 min 58 s va dans la clé de 9 h.',
			'Toutes les 30 secondes, le serveur met une table vide à la place et écrit l’ancienne dans PostgreSQL. Il envoie des lots de 1 000 lignes : `INSERT INTO page_views (page_id, hour, views) VALUES ... ON CONFLICT (page_id, hour) DO UPDATE SET views = page_views.views + EXCLUDED.views`. La doc PostgreSQL dit que cette forme "guarantees an atomic INSERT or UPDATE outcome", "even under high concurrency" (insertion ou mise à jour, sans état intermédiaire, même avec beaucoup d’accès en parallèle).',
			'La table en mémoire n’a qu’une ligne par clé, donc un lot ne cite jamais deux fois la même clé. PostgreSQL lève "a cardinality violation error" si une même requête met à jour deux fois la même ligne.',
			'Charge : un serveur voit au plus 15 000 pages différentes en 30 secondes. Les 8 serveurs envoient au plus 120 000 lignes par 30 secondes, soit 120 lots, donc 4 requêtes par seconde. La première version en envoyait 20 000 par seconde.',
			'Stockage : environ 40 000 lignes par heure, donc 350 millions de lignes par an. Selon la doc PostgreSQL, chaque ligne porte un en-tête de 23 octets et un pointeur de 4 octets, plus ici 24 octets de colonnes. Avec environ 51 octets par ligne, ça donne 18 Go par an et 36 Go sur 2 ans, sans compter l’index sur `(page_id, hour)`.',
			'Le tableau de bord lance `SELECT hour, views FROM page_views WHERE page_id = $1 AND hour >= $2 ORDER BY hour`. La clé primaire `(page_id, hour)` sert cette requête. Une vue arrive en base au plus 30 secondes après avoir eu lieu, sous la minute autorisée.',
			'Le prix se paie dans les pannes. Un serveur qui plante perd jusqu’à 30 secondes de vues : à 2 500 vues par seconde et par serveur, environ 75 000 vues. Un lot qui dépasse son délai alors que PostgreSQL l’a validé, puis qui est relancé, compte ces vues deux fois.',
			'Contre les doublons, chaque lot porte un id aléatoire. La même transaction insère cet id dans une table `flushed_batches` avec une clé unique : un lot relancé échoue sur cette clé et n’ajoute rien.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse proposée, combien de requêtes par seconde en base donnent les 20 000 vues par seconde, et pourquoi ?',
		a: 'Environ 4. Chacun des 8 serveurs additionne les vues par `(page_id, hour)` en mémoire et vide sa table toutes les 30 secondes : au plus 120 000 lignes par 30 secondes, envoyées par lots de 1 000.'
	},
	sources: [
		{ title: 'Doc PostgreSQL, INSERT et ON CONFLICT DO UPDATE', url: 'https://www.postgresql.org/docs/current/sql-insert.html' },
		{ title: 'Doc PostgreSQL, Database Page Layout (taille de l’en-tête de ligne)', url: 'https://www.postgresql.org/docs/current/storage-page-layout.html' }
	]
};
