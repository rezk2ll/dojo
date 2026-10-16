/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ticket-booking',
	part: 'Les données',
	title: 'Réserver des places de concert',
	minutes: 10,
	hook: [
		'Un groupe annonce une seule date dans un stade de 50 000 places. La vente ouvre samedi à 10 h. À 9 h 58, 400 000 fans ont la page ouverte et le pouce sur le bouton « actualiser ».',
		'Chaque fan choisit ses places sur un plan, puis dispose de 10 minutes pour payer. Si deux fans paient la place F12 du bloc 104, l’un des deux reste debout dans l’allée le soir du concert, et le support le rembourse à la main.',
		'Toi, tu conçois ce qui se passe entre le clic sur une place et le billet payé.'
	],
	terms: [
		{ term: 'Blocage (hold)', def: 'Une place réservée à un fan pendant 10 minutes, le temps qu’il paie. Personne d’autre ne peut la bloquer ni l’acheter avant la fin du blocage.' },
		{ term: 'Mise à jour conditionnelle', def: 'Un `UPDATE` dont la clause `WHERE` exige que la ligne soit encore libre. Le nombre de lignes renvoyé te dit si tu as eu la place.' },
		{ term: 'Salle d’attente', def: 'Une file devant le plan des places, qui laisse entrer les fans à un débit fixe et montre aux autres leur rang.' },
		{ term: 'Interblocage (deadlock)', def: 'Deux transactions tiennent chacune un verrou que l’autre attend, et aucune ne peut se terminer.' }
	],
	kata: {
		brief: [
			'Le stade compte 50 000 places numérotées. À 10 h, 400 000 fans essaient d’entrer dans la vente en moins de 5 minutes. Un fan peut bloquer jusqu’à 4 places ; une commande compte 2,5 places en moyenne.',
			'Un blocage dure 10 minutes. Si le fan n’a pas payé avant, les places reviennent en vente. Le paiement chez le prestataire de carte prend environ 1 minute au fan.',
			'Aucune place ne doit être vendue deux fois. Le plan affiché aux fans doit dater de 5 secondes au plus.',
			'Tu as un primaire PostgreSQL et un réplica. Tes tests de charge montrent que le primaire encaisse 2 000 petites mises à jour d’une ligne par seconde sur ce matériel.'
		],
		minutes: 10,
		checklist: [
			'Ton schéma dit quelle requête ou quel verrou décide qu’une place appartient à un seul fan.',
			'Ton schéma dit ce que voit un second fan qui clique sur une place bloquée une milliseconde plus tôt.',
			'Ton schéma dit comment une place bloquée revient en vente 10 minutes plus tard, même si aucune tâche de fond ne tourne.',
			'Ton schéma dit ce qui arrive au fan dont le blocage expire pendant que le prestataire de carte le débite encore.',
			'Ton schéma dit ce que font les 400 000 fans quand seule une partie d’entre eux peut être sur le plan.',
			'Ton schéma donne le nombre d’écritures par seconde en pointe et le compare à 2 000.',
			'Ton schéma dit comment deux fans qui bloquent des groupes de places qui se chevauchent évitent de s’attendre l’un l’autre sans fin.'
		],
		sample: [
			'Une table `seats` dans PostgreSQL contient une ligne par place : `seat_id`, `held_by`, `held_until` et `order_id`. 50 000 lignes d’environ 100 octets font 5 Mo, donc toute la table tient en mémoire. Seul le primaire décide à qui appartient une place.',
			'Un blocage est une mise à jour conditionnelle : `UPDATE seats SET held_by = $fan, held_until = now() + interval \'10 minutes\' WHERE seat_id = $1 AND order_id IS NULL AND (held_until IS NULL OR held_until < now())`. PostgreSQL renvoie `UPDATE count`. Avec 1, le fan a la place ; avec 0, quelqu’un d’autre l’a. Pour 3 places, l’appli lance 3 mises à jour dans une transaction et annule tout si l’une renvoie 0.',
			'Deux fans qui cliquent sur F12 au même instant ne posent pas de problème au niveau Read Committed, celui de PostgreSQL par défaut. Le second `UPDATE` attend que le premier valide, puis PostgreSQL réévalue la clause `WHERE` sur la nouvelle version de la ligne. `held_until` est maintenant dans le futur, le second fan obtient 0 ligne et l’appli affiche « déjà prise, choisis une autre place ».',
			'Deux fans qui bloquent {F12, F13} et {F13, F12} pourraient s’interbloquer. L’appli trie les `seat_id` avant ses mises à jour, donc chaque transaction verrouille les places dans le même ordre. La doc de PostgreSQL présente cet ordre constant comme la meilleure défense contre les interblocages.',
			'L’expiration ne demande aucune tâche. Le test `held_until < now()` de la requête de blocage traite un vieux blocage comme une place libre, et le plan dessine la place libre avec le même test. Le paiement se termine par `UPDATE seats SET order_id = $order WHERE seat_id = $1 AND held_by = $fan AND held_until > now()`. Si cette requête renvoie 0, le blocage a expiré pendant le paiement : l’appli rembourse et prévient le fan. Ce remboursement est le prix d’une limite stricte de 10 minutes.',
			'Une salle d’attente devant le plan fait entrer 2 000 fans par minute. 50 000 places à 2,5 places par commande donnent 20 000 commandes : si la plupart des fans admis achètent, la vente dure environ 10 minutes. Les 380 000 autres suivent leur rang dans la file puis lisent « complet », sans jamais toucher la base.',
			'Écritures en pointe : 2 000 fans par minute, environ 3 essais chacun à 2,5 places, font 15 000 mises à jour par minute, soit 250 par seconde : un huitième des 2 000 que tient le primaire. Le plan lit une copie de la table refaite toutes les 2 secondes, donc ses affichages ne chargent pas le primaire. En échange, un fan peut cliquer sur une place prise jusqu’à 2 secondes plus tôt et recevoir « déjà prise ».',
			'Si le primaire tombe, la vente s’arrête jusqu’à la promotion du réplica, car seul le primaire décide à qui va une place. La salle d’attente fait aussi patienter la plupart des fans environ 10 minutes pour apprendre qu’ils n’auront rien.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse type, qu’est-ce qui dit à l’appli qu’un fan a eu la place, et qu’est-ce qui libère un blocage expiré sans tâche de fond ?',
		a: 'L’`UPDATE` renvoie 1 ligne modifiée. Le test `held_until < now()` dans la même clause `WHERE` traite un blocage de plus de 10 minutes comme libre.'
	},
	sources: [
		{ title: 'Doc PostgreSQL : Transaction Isolation (Read Committed)', url: 'https://www.postgresql.org/docs/current/transaction-iso.html' },
		{ title: 'Doc PostgreSQL : Explicit Locking (Deadlocks)', url: 'https://www.postgresql.org/docs/current/explicit-locking.html' },
		{ title: 'Doc PostgreSQL : UPDATE', url: 'https://www.postgresql.org/docs/current/sql-update.html' }
	]
};
