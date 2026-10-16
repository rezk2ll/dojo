/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'collab-editing',
	part: 'Temps réel',
	title: 'Éditer un document à plusieurs',
	minutes: 10,
	hook: [
		'Cinq personnes rédigent le compte rendu d’une réunion de planning dans un même document. Léa tape les décisions de la section 2 pendant qu’Omar corrige une date dans le paragraphe juste au-dessus. Deux autres ajoutent des actions en bas.',
		'À 14 h 32, le Wi-Fi d’Omar coupe pendant 20 secondes. Il continue à taper. Au retour du réseau, sa correction de date et les décisions de Léa doivent toutes deux figurer dans le document, au bon endroit, sur les cinq écrans.',
		'Tu conçois le côté serveur de cet éditeur, et la règle qui décide quel changement passe en premier.'
	],
	terms: [
		{ term: 'Step', def: 'Un petit changement du document, comme « insérer 2026-11-03 à la position 412 ». Un client envoie ses steps par lots.' },
		{ term: 'Version', def: 'Un entier : le nombre de steps que le serveur a acceptés pour un document. Chaque step accepté ajoute 1.' },
		{ term: 'Autorité centrale', def: 'Le seul processus qui décide, pour un document, dans quel ordre les steps s’appliquent.' },
		{ term: 'Rebase', def: 'Réécrire tes steps pas encore envoyés pour qu’ils s’appliquent après les steps que d’autres ont fait accepter avant toi.' }
	],
	kata: {
		brief: [
			'Une entreprise de 6 000 personnes utilise l’éditeur. Au pic de l’après-midi, 3 000 documents sont ouverts en édition, chacun par 2 à 10 personnes, et 2 500 personnes tapent au même instant.',
			'Un client qui tape envoie un lot de steps toutes les 500 ms. Un lot pèse environ 200 octets. Un jour ouvré, le service reçoit 40 millions de lots, et les steps sont gardés 30 jours.',
			'Un caractère tapé doit apparaître sur les autres écrans en moins d’1 seconde. Aucun texte accepté ne doit se perdre, même si un serveur plante. Un client resté une minute hors ligne doit pouvoir envoyer ce qu’il a tapé à son retour.',
			'Tu as 4 serveurs de collaboration et un primaire PostgreSQL. Tes tests de charge montrent que le primaire encaisse 10 000 insertions d’une ligne par seconde.'
		],
		minutes: 10,
		checklist: [
			'Ton schéma dit quel processus unique décide de l’ordre des steps du document 7781.',
			'Ton schéma dit ce qui se passe quand Léa et Omar envoient tous les deux un lot basé sur la version 120.',
			'Ton schéma dit où un lot accepté est stocké avant que les autres clients en soient prévenus.',
			'Ton schéma dit ce que fait le client d’Omar de ses 20 secondes de frappe hors ligne au retour du Wi-Fi.',
			'Ton schéma dit ce que reçoit un client qui se reconnecte en version 120 alors que le document est en version 160.',
			'Ton schéma donne le nombre de lots par seconde au pic et le compare aux 10 000 insertions par seconde.',
			'Ton schéma dit comment le nouveau propriétaire du document 7781 le reconstruit après le plantage de son serveur.'
		],
		sample: [
			'Chaque document a une seule autorité centrale. Les requêtes du document 7781 vont au serveur de collaboration choisi par un hash de `7781` sur les 4 serveurs. Ce serveur garde en mémoire le document, sa version et ses steps récents. Le guide collab de ProseMirror décrit ce modèle : l’autorité accepte les changements d’un éditeur, les diffuse, et les autres font un rebase.',
			'Un client envoie `(version, steps, client_id)`. L’autorité n’accepte le lot que si `version` est égale à sa version courante. Léa et Omar envoient tous deux la version 120 : le lot de Léa arrive en premier et fait passer le document à 123. Celui d’Omar indique 120, l’autorité le refuse. Le client d’Omar récupère les steps 121 à 123, rebase ses propres steps dessus et renvoie avec la version 123.',
			'Avant de diffuser un lot, l’autorité l’insère dans PostgreSQL en une ligne : `batches(doc_id, base_version, client_id, steps)` avec la clé primaire `(doc_id, base_version)`. Elle ne prévient les clients qu’ensuite. Si deux serveurs se croient tous deux propriétaires de 7781 après une coupure réseau, la seconde insertion en version de base 123 se heurte à la clé primaire et échoue : un seul ordre de steps peut exister.',
			'Les 20 secondes hors ligne d’Omar sont des steps non confirmés que son client garde. Au retour du Wi-Fi, le client demande tous les steps après sa version et les reçoit de la mémoire de l’autorité ou de PostgreSQL. Il rebase ses steps locaux et les envoie. Rien ne se perd : un step ne quitte la liste des non confirmés que quand le client le voit revenir de l’autorité.',
			'Les chiffres au pic : 2 500 clients qui tapent, à 2 lots par seconde, font 5 000 insertions par seconde, la moitié des 10 000 du primaire, et 1 250 lots par serveur. Stockage : 40 millions de lots de 200 octets font 8 Go par jour, 240 Go pour 30 jours. Tous les 1 000 steps, l’autorité écrit une copie complète du document : après un plantage, le nouveau propriétaire charge la dernière copie et rejoue 999 steps au plus.',
			'Le prix d’une autorité par document : chaque lot fait l’aller-retour vers un seul serveur avant que les autres clients le voient. Avec 10 personnes qui tapent en même temps, beaucoup de lots arrivent sur une version périmée et sont refusés, et un client peut devoir rebaser et renvoyer plusieurs fois. L’auteur de ProseMirror a choisi ce modèle central parce qu’il est « relatively easy to implement and to reason about » (plutôt simple à coder et à comprendre), et il note qu’appliquer les changements dans un autre ordre ne donne pas forcément le même document.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse type, que fait l’autorité du lot d’Omar basé sur la version 120 quand le document est déjà en 123 ?',
		a: 'Elle le refuse. Le client d’Omar récupère les steps 121 à 123, rebase ses propres steps dessus et renvoie avec la version 123.'
	},
	sources: [
		{ title: 'Guide ProseMirror : Collaborative editing', url: 'https://github.com/ProseMirror/website/blob/a16b4ece45f135e5f001ab59d25f2d43c25974e1/markdown/guide/collab.md' },
		{ title: 'Marijn Haverbeke : Collaborative Editing in ProseMirror', url: 'https://marijnhaverbeke.nl/blog/collaborative-editing.html' }
	]
};
