/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'offline-mobile',
	part: 'Architecture',
	title: 'Une application mobile offline-first',
	minutes: 10,
	hook: [
		'Karim inspecte des vannes pour une compagnie des eaux. La plupart des vannes sont dans des regards au bord de routes de campagne, et la moitié n’ont pas de réseau. Il ne repasse au dépôt que le vendredi.',
		'Mardi, dans un regard sans réseau, il note la vanne V-2291 « bloquée fermée » et prend 5 photos. Le même matin, au bureau, une planificatrice change la date de la prochaine inspection de cette même vanne.',
		'L’application doit laisser Karim travailler toute la semaine sans réseau, garder ses photos en sécurité, et fusionner les deux modifications de V-2291 quand la tablette retrouve le réseau.'
	],
	terms: [
		{ term: 'Offline-first', def: 'L’application lit et écrit dans une base locale sur l’appareil, et se synchronise avec le serveur dès qu’il y a du réseau.' },
		{ term: 'Révision', def: 'Dans CouchDB et PouchDB, une version enregistrée d’un document, nommée comme `2-c1592ce7...`, où le nombre compte les modifications depuis la première.' },
		{ term: 'Conflit', def: 'Deux révisions faites à partir de la même révision parente sur deux appareils, que la synchronisation range côte à côte sous un même id de document.' }
	],
	kata: {
		brief: [
			'300 inspecteurs ont chacun une tablette. Chacun couvre une région d’environ 2 000 vannes. Une fiche de vanne pèse environ 4 Ko. Un inspecteur peut rester jusqu’à 5 jours sans réseau.',
			'Chaque inspecteur fait environ 8 inspections par jour. Une inspection, c’est un formulaire d’environ 4 Ko et 5 photos de 2 Mo chacune.',
			'Au même moment, les planificateurs du bureau modifient les fiches de vannes : date de la prochaine inspection, priorité, notes. Les inspecteurs modifient l’état et les notes.',
			'Conçois où vivent les données sur la tablette, comment elles se synchronisent, le chemin des photos, et comment deux modifications de la même vanne sont fusionnées.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit ce que stocke la tablette, avec une taille en Mo pour 5 jours sans réseau.',
			'Ton design dit quels enregistrements ne peuvent jamais entrer en conflit, et pourquoi.',
			'Ton design dit ce que fait l’application quand le réseau tombe au milieu d’une synchronisation.',
			'Ton design dit comment une photo est envoyée, et ce qui empêche le serveur de la stocker deux fois après une nouvelle tentative.',
			'Ton design dit qui fusionne deux modifications de la même vanne, et à quel moment.',
			'Ton design dit ce qui se passe quand Karim et une planificatrice ont tous les deux modifié les notes de V-2291.'
		],
		sample: [
			'Fais tourner l’application dans le navigateur de la tablette avec PouchDB, qui stocke les données sur l’appareil, et synchronise avec CouchDB côté serveur. Donne à chaque région sa propre base CouchDB : une tablette garde alors 2 000 × 4 Ko = 8 Mo de vannes. Lance la synchronisation avec `localDB.sync(remoteDB, { live: true, retry: true })` : d’après le guide PouchDB, `retry` réessaie jusqu’au retour de la connexion.',
			'Chaque inspection est un nouveau document, avec un id créé sur la tablette, que personne ne modifie après l’enregistrement. Deux tablettes n’écrivent jamais le même id, donc les inspections n’entrent jamais en conflit : le guide PouchDB appelle ça "every doc is a delta". Cinq jours font 40 inspections, soit 160 Ko de formulaires.',
			'Les photos restent hors de la base : 40 × 5 × 2 Mo = 400 Mo, trop pour passer dans chaque synchronisation. La tablette enregistre chaque photo comme un fichier avec un id créé sur l’appareil, et l’inspection liste ces ids. Une file d’envoi pousse les photos quand la tablette est sur le Wi-Fi du dépôt, et le serveur garde un fichier par id de photo : un envoi répété remplace le précédent.',
			'Les fiches de vannes, elles, entrent en conflit. Quand la tablette de Karim se synchronise, CouchDB garde les deux révisions de V-2291. Il choisit une gagnante avec un algorithme déterministe, pour que chaque appareil voie la même, et liste l’autre dans `_conflicts`.',
			'Un job serveur cherche les documents avec `_conflicts` chaque minute, avec la requête Mango montrée dans la doc CouchDB. Pour chacun, il fusionne champ par champ : l’état vient de Karim, la date d’inspection vient de la planificatrice. Puis il écrit la révision fusionnée et supprime la perdante en un seul appel `_bulk_docs`, l’algorithme que propose la doc CouchDB.',
			'Quand les deux côtés ont changé le même champ, comme les notes, le job garde les deux textes l’un après l’autre et signale la vanne à un planificateur. Il ne tranche pas avec l’horloge de l’appareil, car celle de la tablette de Karim peut être fausse.',
			'Le prix à payer : tant que le job n’est pas passé, chaque appareil affiche la gagnante arbitraire, qui peut cacher le « bloquée fermée » de Karim jusqu’à une minute. Une base par région oblige aussi un inspecteur qui change de région à télécharger une base entière.'
		]
	},
	quiz: [],
	recall: {
		q: 'Pourquoi les inspections n’entrent-elles jamais en conflit dans ce design, et que fait CouchDB de deux modifications de la même vanne ?',
		a: 'Chaque inspection est un nouveau document avec un id créé sur la tablette, jamais modifié. Pour une vanne, CouchDB garde les deux révisions, choisit la même gagnante sur chaque appareil et liste l’autre dans `_conflicts` jusqu’à ce qu’un job les fusionne.'
	},
	sources: [
		{ title: 'CouchDB, modèle de réplication et de conflits', url: 'https://docs.couchdb.org/en/stable/replication/conflicts.html' },
		{ title: 'PouchDB, guide de la réplication', url: 'https://pouchdb.com/guides/replication.html' },
		{ title: 'PouchDB, guide des conflits', url: 'https://pouchdb.com/guides/conflicts.html' }
	]
};
