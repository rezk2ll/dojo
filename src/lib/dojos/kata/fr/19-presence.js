/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'presence',
	part: 'Temps réel',
	title: 'Le statut en ligne',
	minutes: 10,
	hook: [
		'Dans le train, Sofia ouvre sa messagerie pour poser une question à un collègue sur la mise en production du soir. À côté de chacun de ses 300 contacts, un point vert ou gris. Elle écrit à Karim, parce que son point est vert.',
		'Karim a fermé son portable il y a 40 minutes, et son point est resté vert parce que son appli n’a jamais dit au revoir. Sofia attend une réponse qui ne vient pas.',
		'Tu conçois le service qui garde ces points justes, à 30 secondes près, pour chaque utilisateur.'
	],
	terms: [
		{ term: 'Heartbeat', def: 'Un petit message qu’une connexion envoie à intervalle fixe pour dire « cet utilisateur est toujours là ».' },
		{ term: 'TTL', def: 'Time to live, durée de vie : le nombre de secondes au bout duquel Redis supprime une clé tout seul.' },
		{ term: 'Changement de statut', def: 'Un utilisateur qui passe de hors ligne à en ligne, ou l’inverse. Un heartbeat d’un utilisateur déjà en ligne ne compte pas comme un changement.' },
		{ term: 'Événement expired', def: 'Une notification d’espace de clés Redis publiée quand Redis supprime une clé dont le TTL est écoulé.' }
	],
	kata: {
		brief: [
			'L’appli compte 4 millions d’utilisateurs. Au pic du soir, 800 000 sont connectés, chacun par un WebSocket vers l’une des 16 passerelles. Chaque utilisateur a environ 300 contacts.',
			'Un utilisateur change de statut environ 10 fois par jour, et l’heure de pointe a 3 fois le débit moyen. Quand un contact change de statut, un utilisateur connecté doit voir le nouveau point en moins de 30 secondes. Un téléphone qui perd le réseau 10 secondes dans un tunnel ne doit pas clignoter en gris.',
			'La présence vit dans Redis. Tes tests de charge montrent qu’un shard Redis tient 150 000 opérations sur des clés par seconde.',
			'Une passerelle peut planter. Dans ce cas, plus personne n’est là pour signaler que ses utilisateurs sont partis.'
		],
		minutes: 10,
		checklist: [
			'Ton schéma dit ce qu’écrit une passerelle, et à quelle fréquence, pour montrer qu’un utilisateur est toujours en ligne.',
			'Ton schéma dit comment le point d’un utilisateur passe au gris en moins de 30 secondes quand sa passerelle plante.',
			'Ton schéma dit pourquoi un tunnel de 10 secondes n’envoie pas de changement de statut à 300 contacts.',
			'Ton schéma dit qui reçoit un changement de statut : les 300 contacts, ceux qui sont en ligne, ou ceux qui regardent l’écran.',
			'Ton schéma donne les opérations Redis par seconde au pic et le nombre de shards nécessaires.',
			'Ton schéma dit ce que voit un utilisateur qui ouvre l’appli et charge 300 points d’un coup.'
		],
		sample: [
			'Chaque passerelle écrit `SET presence:<user_id> <gateway_id> EX 30` toutes les 15 secondes pour chacun de ses utilisateurs connectés. La clé existe tant que l’utilisateur est en ligne et indique quelle passerelle le tient. Si les heartbeats s’arrêtent, Redis supprime la clé au bout de 30 secondes au plus.',
			'Quand un socket se ferme, la passerelle arrête les heartbeats et lance `GET presence:<user_id>` 30 secondes plus tard. Quand `GET` ne trouve plus la clé, la passerelle déclare l’utilisateur hors ligne. Si l’utilisateur est sorti du tunnel entre-temps, une passerelle a rafraîchi la clé : rien n’est signalé, et aucun contact ne voit de point gris.',
			'Une passerelle plantée ne relit rien. En secours, le service de présence s’abonne aux événements expired de Redis et déclare hors ligne chaque clé `presence:` expirée. La doc Redis prévient que l’événement part quand Redis supprime la clé, avec parfois « a significant delay » (un retard important) après la fin du TTL. Pour les utilisateurs d’une passerelle plantée, l’objectif de 30 secondes peut donc glisser.',
			'À chaque changement de statut, le service de présence charge les 300 ids de contacts de l’utilisateur et lit leurs clés de présence, un lot par shard. Environ 60 sont en ligne. Il regroupe ces 60 par id de passerelle et envoie un message par passerelle, puis chaque passerelle pousse le nouveau point à ses propres utilisateurs. À la connexion, l’appli lit de la même façon les clés de ses 300 contacts pour dessiner le premier écran.',
			'Les chiffres au pic : les heartbeats font 800 000 écritures toutes les 15 secondes, soit 53 000 par seconde. Les changements de statut font 4 millions fois 10 par jour, 463 par seconde en moyenne et 1 400 au pic. Chaque changement lit 300 clés : 420 000 lectures par seconde. Les connexions représentent la moitié des changements, 700 par seconde à 300 clés chacune : 210 000 de plus. Au total, environ 683 000 opérations par seconde, donc 6 shards à 114 000 chacun, sous les 150 000.',
			'Le choix de cette réponse : pousser chaque changement à tous les contacts en ligne, environ 60 push par changement et 84 000 par seconde au pic. La plupart de ces utilisateurs ne regardent pas leur liste de contacts. L’API RTM de Slack a fait l’autre choix en janvier 2018 : une appli ne reçoit les événements `presence_change` que pour les utilisateurs nommés dans un message `presence_sub`, et Slack conseille 500 utilisateurs au plus. Les push diminuent, mais chaque client doit tenir sa liste à jour pendant que l’utilisateur fait défiler l’écran.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse type, pourquoi un tunnel de 10 secondes ne fait-il pas passer le point au gris chez les contacts ?',
		a: 'La passerelle attend 30 secondes après la fermeture du socket avant de relire `presence:<user_id>`. Le téléphone s’est reconnecté au bout de 10 secondes et une passerelle a rafraîchi la clé, donc aucun passage hors ligne n’est envoyé.'
	},
	sources: [
		{ title: 'Doc Redis : SET (option EX)', url: 'https://redis.io/docs/latest/commands/set/' },
		{ title: 'Doc Redis : Keyspace notifications (timing of expired events)', url: 'https://redis.io/docs/latest/develop/pubsub/keyspace-notifications/' },
		{ title: 'Doc Slack : User presence and status', url: 'https://docs.slack.dev/apis/web-api/user-presence-and-status' }
	]
};
