/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'activity-feed',
	part: 'Les données',
	title: 'Un fil d’activité',
	minutes: 10,
	hook: [
		'Une appli de course à pied compte 5 millions d’utilisateurs. Léa termine un 10 km, et ses 80 abonnés voient « Léa a couru 10 km » en haut de leur fil.',
		'Sur la même appli, une championne de marathon a 1 million d’abonnés. Quand elle publie sa course, tous ouvrent l’appli dans l’heure pour la voir.',
		'Les deux publications passent par le même code de fil. Les 80 abonnés de Léa comme le million de la championne attendent un fil ouvert en moins de 200 ms.'
	],
	terms: [
		{ term: 'Fan-out à l’écriture', def: 'Quand un compte publie, le système copie l’id de l’événement dans le fil de chaque abonné : une lecture ne lit alors qu’une liste.' },
		{ term: 'Fan-out à la lecture', def: 'L’événement est stocké une fois, chez son auteur, et chaque lecteur va chercher les événements des comptes qu’il suit à l’ouverture du fil.' },
		{ term: 'Liste plafonnée', def: 'Une liste coupée à une longueur fixe après chaque ajout, qui ne garde que les entrées les plus récentes.' }
	],
	kata: {
		brief: [
			'Les utilisateurs suivent d’autres utilisateurs. Le fil montre les 50 derniers événements des comptes suivis, du plus récent au plus ancien. Un événement est un court message : « Léa a couru 10 km », « Sam a aimé ta course ».',
			'5 millions de comptes, dont 2 millions ont ouvert l’appli dans les 7 derniers jours. Les utilisateurs publient 3 millions d’événements par jour. Un compte a en moyenne 100 abonnés.',
			'2 000 comptes ont plus de 10 000 abonnés. Le plus gros en a 1 million.',
			'Au pic, 20 000 fils sont ouverts par seconde. Un fil se charge en moins de 200 ms, et un nouvel événement apparaît chez les abonnés en moins d’1 minute.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit, étape par étape, ce qui se passe quand le compte à 1 million d’abonnés publie.',
			'Ton design dit où sont rangés les 50 derniers ids d’événements de chaque utilisateur, et combien de mémoire ou de disque ça prend.',
			'Ton design donne le nombre d’écritures de fil par seconde un jour normal.',
			'Ton design dit comment une lecture du fil récupère les événements des comptes dont les publications ne sont pas copiées chez les abonnés.',
			'Ton design dit ce que voit un utilisateur absent depuis un mois à sa première ouverture, et combien de temps ça prend.',
			'Ton design dit comment les événements d’un compte que l’utilisateur vient de ne plus suivre quittent son fil.'
		],
		sample: [
			'Ce design fait du fan-out à l’écriture pour les comptes de moins de 10 000 abonnés, et du fan-out à la lecture pour les 2 000 comptes au-dessus. Chaque utilisateur a une liste Redis `feed:<user id>` avec les 50 derniers ids d’événements. Une publication lance `LPUSH feed:<id> <event id>` puis `LTRIM feed:<id> 0 49` pour chaque abonné. La doc Redis précise que `LTRIM` utilisé ainsi "is an O(1) operation" en moyenne (coût constant).',
			'Les copies ne vont qu’aux abonnés qui ont ouvert l’appli dans les 7 derniers jours. Mastodon fait pareil : "status fan-out to followers will include only people active within this time frame", avec 7 jours par défaut. 3 millions d’événements fois 100 abonnés font 300 millions d’ajouts par jour. Avec 2 utilisateurs actifs sur 5, il en reste environ 120 millions, soit à peu près 1 400 ajouts par seconde.',
			'Un compte de plus de 10 000 abonnés écrit son événement une seule fois, dans sa propre liste plafonnée `posts:<account id>`. Copier une publication du compte à 1 million demanderait 1 million d’ajouts. À 20 000 ajouts par seconde, ça prend 50 secondes, et toutes les petites publications attendent derrière dans la file.',
			'Une lecture du fil lance `LRANGE feed:<id> 0 49`, plus `LRANGE posts:<x> 0 49` pour chaque gros compte suivi. Les ids d’événements se trient par date (kata 04) : l’appli fusionne les listes par id et garde les 50 premiers. Elle lit ensuite les 50 événements par id dans la table des événements.',
			'Les listes `posts:` des 2 000 gros comptes sont lues par presque tout le monde. Chaque serveur d’appli les garde 5 secondes en mémoire : Redis reçoit une lecture par liste et par serveur toutes les 5 secondes.',
			'Mémoire : 2 millions de fils actifs fois 50 ids de 8 octets font 800 Mo d’ids, sans compter le surcoût de Redis par clé. Un utilisateur inactif n’a pas de liste. À sa première ouverture, l’appli reconstruit la liste depuis la table des événements et celle des abonnements, et ce chargement dépasse les 200 ms.',
			'Les comptes plus suivis sont filtrés à la lecture : l’appli retire les ids dont l’auteur n’est plus suivi. Les publications suivantes des comptes suivis poussent ensuite ces vieux ids hors des 50.',
			'Les deux chemins coûtent du code : un pour publier, un pour lire. Le seuil de 10 000 est un réglage, et un compte qui le franchit doit passer d’un chemin à l’autre. Un utilisateur qui suit 300 gros comptes paie 301 lectures de liste à chaque ouverture.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse proposée, quels comptes échappent au fan-out à l’écriture, et où leurs abonnés trouvent-ils leurs événements ?',
		a: 'Les comptes de plus de 10 000 abonnés. Leurs événements vont seulement dans leur liste `posts:<account id>`, que chaque abonné lit et fusionne avec `feed:<user id>` à l’ouverture du fil.'
	},
	sources: [
		{ title: 'Doc Redis, LTRIM (le duo LPUSH et LTRIM)', url: 'https://redis.io/docs/latest/commands/ltrim/' },
		{ title: 'Mastodon, fan-out limité aux utilisateurs actifs depuis 7 jours (app/models/concerns/user/activity.rb)', url: 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/models/concerns/user/activity.rb#L6-L12' },
		{ title: 'Mastodon, fil d’accueil coupé à MAX_ITEMS dans Redis (app/lib/feed_manager.rb)', url: 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/feed_manager.rb#L454-L459' }
	]
};
