/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'api-versioning',
	part: 'Architecture',
	title: 'Changer une API publique',
	minutes: 10,
	hook: [
		'L’API publique d’un transporteur renvoie `"weight": "12.5 kg"`. Les nouvelles balances de l’entrepôt pèsent au gramme près, et certains clients expédient en livres. L’équipe veut `"weight": { "value": 12.5, "unit": "kg" }`.',
		'2 000 intégrations clientes lisent ce champ aujourd’hui. L’une d’elles est le script Node.js d’une petite boutique, qui appelle `parseFloat(shipment.weight)`. Sur `"12.5 kg"`, il obtient 12.5. Sur un objet, `parseFloat` le convertit d’abord en chaîne `[object Object]` et renvoie `NaN`, et l’imprimante d’étiquettes s’arrête.',
		'Personne chez le transporteur ne peut corriger ce script. Le changement doit sortir quand même, sans casser une seule intégration.'
	],
	terms: [
		{ term: 'Changement cassant', def: 'Un changement après lequel du code qui marchait contre l’API ne marche plus : un champ supprimé, un champ renommé, un champ qui change de type.' },
		{ term: 'Version épinglée', def: 'L’API note quelle version utilise chaque clé d’API, et répond à cette clé dans cette version jusqu’à ce que son propriétaire la change.' },
		{ term: 'Module de changement de version', def: 'Un bout de code qui transforme une réponse de la forme actuelle vers la forme d’une version plus ancienne.' }
	],
	kata: {
		brief: [
			'L’API sert `GET /v1/shipments/{id}` et 3 autres endpoints qui renvoient des envois. 2 000 intégrations, chacune avec sa clé d’API, envoient 40 millions de requêtes par jour, environ 460 par seconde.',
			'L’API envoie aussi 1,2 million de webhooks par jour, et chacun contient un envoi avec son `weight`. Certaines intégrations n’appellent jamais l’API : elles lisent seulement les webhooks.',
			'Environ 600 intégrations n’ont pas changé de code depuis plus d’un an, d’après leur user agent qui ne bouge pas. Leurs propriétaires répondent rarement aux emails.',
			'Conçois le passage de `weight` d’une chaîne à un objet, pour que les nouvelles intégrations reçoivent l’objet et qu’aucune des 2 000 existantes ne casse.'
		],
		minutes: 10,
		checklist: [
			'Ton schéma dit comment l’API sait quelle forme de `weight` envoyer à une clé d’API donnée.',
			'Ton schéma dit ce que reçoit une intégration existante le jour de la sortie, sans que son propriétaire fasse quoi que ce soit.',
			'Ton schéma couvre les webhooks, pas seulement les réponses aux requêtes `GET`.',
			'Ton schéma dit comment une intégration essaie la nouvelle forme sur une seule requête avant de basculer.',
			'Ton schéma dit où vit le code de l’ancienne forme, et si les endpoints doivent le connaître.',
			'Ton schéma dit comment l’équipe compte les clés encore sur l’ancienne forme.',
			'Ton schéma dit si l’ancienne forme disparaît un jour, et ce qui arrive alors aux 600 intégrations silencieuses.'
		],
		sample: [
			'L’API reçoit des versions datées, comme Stripe le décrit pour sa propre API. Le comportement actuel est la version `2026-10-01`, et le nouveau `weight` arrive dans la version `2026-11-01`. L’article de Stripe : « The first time a user makes an API request, their account is automatically pinned to the most recent version available. »',
			'Le jour de la sortie, les 2 000 clés sont épinglées sur `2026-10-01`. Une clé créée après la sortie est épinglée sur `2026-11-01` à sa première requête. Le script Node.js de la boutique reçoit toujours `"12.5 kg"`, sans que son propriétaire fasse rien.',
			'Le code des envois ne construit que le nouvel objet. Un seul module de changement de version, `WeightAsString`, retransforme `{ "value": 12.5, "unit": "kg" }` en `"12.5 kg"` quand la version visée est antérieure à `2026-11-01`. Comme chez Stripe, la couche de réponse « walks back through time » (remonte le temps) et applique chaque module jusqu’à la version de la clé. Les 4 endpoints ne testent jamais une version eux-mêmes.',
			'Les webhooks passent par la même couche de réponse, avec la version épinglée de la clé qui les reçoit. Sans ça, les intégrations qui lisent seulement les 1,2 million de webhooks par jour casseraient le jour de la sortie.',
			'Un en-tête `Api-Version: 2026-11-01` remplace la version épinglée pour une seule requête, comme l’en-tête `Stripe-Version` chez Stripe. Un développeur essaie la nouvelle forme sur un appel, corrige son parseur, puis change la version de sa clé dans le tableau de bord. Chaque requête journalise sa clé et sa version : une courbe montre combien des 2 000 clés restent sur `2026-10-01`.',
			'L’autre option : ajouter un nouveau champ, `weight_grams`, à côté de l’ancienne chaîne. L’article de Stripe dit qu’ajouter un champ est « safe to add », et aucun système de versions n’est nécessaire. Le prix : deux champs pour une seule information dans chaque réponse, pour toujours, et encore un nouveau nom au prochain changement.',
			'Ce que coûte le schéma choisi : la couche de versions se construit une fois, et `WeightAsString` reste tant qu’une clé est épinglée avant `2026-11-01`. La RFC 8594 définit un en-tête `Sunset` qui pourrait annoncer une date de retrait. Retirer l’ancienne forme casserait les 600 intégrations silencieuses, donc ce plan ne fixe aucune date `Sunset`.'
		]
	},
	quiz: [],
	recall: {
		q: 'Le jour de la sortie, que reçoit une intégration existante dont le propriétaire ne fait rien, et pourquoi ?',
		a: 'L’ancienne chaîne `"12.5 kg"`. Sa clé est épinglée sur `2026-10-01`, et le module `WeightAsString` retransforme le nouvel objet en ancienne chaîne pour cette version, dans chaque réponse et chaque webhook.'
	},
	sources: [
		{ title: 'Blog Stripe : APIs as infrastructure: future-proofing Stripe with versioning', url: 'https://stripe.com/blog/api-versioning' },
		{ title: 'RFC 8594 : The Sunset HTTP Header Field', url: 'https://www.rfc-editor.org/rfc/rfc8594' },
		{ title: 'MDN : parseFloat()', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/parseFloat' }
	]
};
