/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'unique-ids',
	part: 'Petits services',
	title: 'Des identifiants uniques sur plusieurs serveurs',
	minutes: 10,
	hook: [
		'Un service de commandes écrit dans une seule base, et chaque commande reçoit son id d’une colonne auto-incrémentée. Les ventes montent. L’équipe répartit les commandes sur 4 bases, et chacune garde son propre compteur.',
		'Deux semaines plus tard, le support trouve deux commandes différentes avec l’id 1 000 017, une dans chacune de deux bases. Le remboursement d’un client part chez l’autre.',
		'Ce que l’équipe veut : chaque serveur fabrique ses propres ids, sans compteur partagé, et deux ids ne tombent jamais pareil.'
	],
	terms: [
		{ term: 'Époque', def: 'Le moment à partir duquel compte la partie horodatage d’un id. Snowflake comptait depuis novembre 2010 au lieu de 1970, pour que les 41 bits durent plus longtemps.' },
		{ term: 'Id de machine', def: 'Un numéro donné à chaque serveur, unique parmi tous les serveurs. Il entre dans chaque id que ce serveur fabrique.' },
		{ term: 'Séquence', def: 'Un compteur interne à un serveur, qui numérote les ids fabriqués dans la même milliseconde.' }
	],
	kata: {
		brief: [
			'Un service de commandes tourne sur **20 serveurs**. Au pic, il crée 30 000 ids par seconde au total, et jusqu’à 3 000 par seconde sur un seul serveur.',
			'Chaque id doit tenir dans un entier signé de 64 bits (une colonne `BIGINT`). Trier les ids doit trier les commandes par date de création, à une seconde près. Le schéma doit tenir 50 ans.',
			'Aucun serveur ne peut appeler une base ou un autre serveur pour obtenir un id. Un serveur qui ne peut pas fabriquer un id correct doit refuser, et ne jamais rendre un doublon.'
		],
		minutes: 10,
		checklist: [
			'Ton design découpe les 64 bits en parties et donne le nombre de bits de chacune.',
			'Ton design dit combien d’années dure la partie horodatage, et à partir de quelle date elle compte.',
			'Ton design dit comment chacun des 20 serveurs reçoit son id de machine, et ce qui empêche deux serveurs d’avoir le même.',
			'Ton design dit combien d’ids un serveur peut fabriquer en une milliseconde, et ce qu’il fait de la demande suivante.',
			'Ton design dit ce que fait un serveur quand son horloge recule de 5 millisecondes.',
			'Ton design explique pourquoi deux ids fabriqués à 1 ms d’écart sur deux serveurs peuvent se trier dans le mauvais ordre.'
		],
		sample: [
			'La réponse reprend le découpage de Snowflake, chez Twitter. Son README de 2010 donne : "time - 41 bits", "configured machine id - 10 bits" et "sequence number - 12 bits". Le bit du haut reste à 0 : 1 + 41 + 10 + 12 = 64, et l’id est toujours un `BIGINT` positif.',
			'Le temps : 41 bits de millisecondes font 2 199 milliards de ms, environ 69 ans. Le compte part d’une époque choisie, par exemple le 1er janvier 2026 : les ids tiennent jusque vers 2095, ce qui couvre les 50 ans de l’énoncé. Comme le temps occupe les bits du haut, trier les ids trie d’abord par milliseconde.',
			'L’id de machine : 10 bits donnent 1 024 valeurs pour 20 serveurs. Chaque serveur lit son id, de 0 à 19, dans son fichier de config au déploiement. Si deux serveurs sont déployés avec le même id de machine, ils peuvent fabriquer le même id dans la même milliseconde, et rien ne le voit à l’exécution. Le script de déploiement vérifie donc que les 20 valeurs sont toutes différentes.',
			'La séquence : 12 bits font 4 096 ids par milliseconde et par serveur, environ 4 millions par seconde. L’énoncé en demande 3 000 par seconde, soit 3 par milliseconde. Dans `IdWorker.scala`, quand la séquence repasse à 0 dans la même milliseconde, `tilNextMillis` boucle jusqu’à ce que l’horloge affiche la milliseconde suivante.',
			'L’horloge qui recule : le même code compare l’horloge au dernier horodatage utilisé. Quand l’horloge affiche une heure plus ancienne, il lève "Clock moved backwards.  Refusing to generate id for %d milliseconds". Un recul de 5 ms coûte 5 ms d’ids refusés sur ce serveur, et aucun doublon.',
			'Deux ids fabriqués dans la même milliseconde sur les serveurs 3 et 12 se trient par id de machine. Les horloges des serveurs diffèrent aussi de l’écart que NTP leur laisse. Le README promettait un ordre "within a reasonable bound (we\'re promising 1s, but shooting for 10\'s of ms)", ce qui correspond à la seconde de l’énoncé.'
		]
	},
	quiz: [],
	recall: {
		q: 'Comment la réponse découpe-t-elle les 64 bits, et combien de temps dure la partie horodatage ?',
		a: '1 bit de signe inutilisé, 41 bits de millisecondes (environ 69 ans depuis une époque choisie), 10 bits d’id de machine et 12 bits de séquence.'
	},
	sources: [
		{ title: 'README de Twitter Snowflake, tag snowflake-2010', url: 'https://github.com/twitter-archive/snowflake/blob/b3f6a3c6ca8e1b6847baa6ff42bf72201e2c2231/README.mkd' },
		{ title: 'Twitter Snowflake, IdWorker.scala, nextId', url: 'https://github.com/twitter-archive/snowflake/blob/b3f6a3c6ca8e1b6847baa6ff42bf72201e2c2231/src/main/scala/com/twitter/service/snowflake/IdWorker.scala#L71-L103' }
	]
};
