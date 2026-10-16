/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'slos',
	part: 'Fiabilité',
	title: 'Mesurer un service',
	minutes: 10,
	hook: [
		'Mia est d’astreinte sur l’API de paiement d’une boutique en ligne. La semaine dernière, son téléphone l’a réveillée trois fois pour « CPU au-dessus de 80 % ». Chaque fois, les clients payaient sans problème et elle s’est recouchée.',
		'Jeudi, le prestataire de paiement a changé un certificat TLS et 4 % des paiements ont échoué pendant deux heures. Aucune alerte n’a sonné, car le CPU allait bien. Le support l’a appris le premier, par les clients.',
		'L’équipe veut une alerte qui sonne quand les clients ne peuvent pas payer, et seulement là. Il faut donc choisir quoi mesurer, quel chiffre suffit, et à quel moment réveiller quelqu’un.'
	],
	terms: [
		{ term: 'SLI', def: 'Indicateur de niveau de service : un ratio mesuré, le nombre d’événements réussis divisé par le nombre total d’événements.' },
		{ term: 'SLO', def: 'Objectif de niveau de service : la cible d’un SLI sur une période, par exemple 99,9 % de paiements réussis sur 30 jours.' },
		{ term: 'Budget d’erreur', def: 'Les échecs que le SLO autorise sur sa période. À 99,9 %, c’est 0,1 % des requêtes.' },
		{ term: 'Burn rate', def: 'La vitesse à laquelle le service consomme son budget d’erreur. Un burn rate de 1 consomme tout le budget en exactement 30 jours.' }
	],
	kata: {
		brief: [
			'L’API sert `POST /checkout`, qui débite la carte via un prestataire de paiement. Elle traite en moyenne 5 paiements par seconde, environ 13 millions sur 30 jours. La nuit, elle descend à 1 par seconde.',
			'Le load balancer devant l’API journalise chaque requête avec son code de statut et sa durée. Une carte refusée renvoie `402`. Un bug ou un timeout du prestataire renvoie `500` ou `504`.',
			'La plupart des paiements prennent 600 ms. Le produit dit qu’un paiement de plus de 2 secondes fait fuir le client à peu près aussi souvent qu’une erreur.',
			'Choisis les SLI et les SLO de cette API, puis conçois les alertes : lesquelles réveillent Mia, et lesquelles attendent le matin.'
		],
		minutes: 10,
		checklist: [
			'Ton schéma dit où chaque SLI est mesuré : dans l’application, au load balancer ou dans le navigateur.',
			'Ton schéma dit quels codes de statut comptent comme échecs, et comment compte une carte refusée.',
			'Ton schéma a un SLI de latence avec un seuil en millisecondes, et pas seulement une moyenne.',
			'Ton schéma donne à chaque SLO un pourcentage et une période.',
			'Ton schéma dit combien de paiements ratés le budget d’erreur autorise sur cette période.',
			'Ton schéma dit combien d’échecs en une heure réveillent quelqu’un, et au bout de combien de temps une panne totale déclenche l’alerte.',
			'Ton schéma dit ce qui remplace l’alerte CPU, ou pourquoi elle reste.'
		],
		sample: [
			'Les deux SLI viennent des journaux du load balancer. Le SRE Workbook prend aussi le load balancer pour son exemple, car ses métriques « provide SLIs that are closer to the user’s experience than those from the application server’s logs » (plus proches de ce que vit l’utilisateur). Quand un processus de l’application plante, le load balancer journalise quand même une 5xx, alors que l’application n’écrit rien.',
			'Le SLI de disponibilité est la part des requêtes `POST /checkout` qui ne finissent pas en 5xx. Un `402` pour une carte refusée compte comme réussi : l’API a fait son travail. Le SLO est de 99,9 % sur 30 jours. Sur 13 millions de paiements, le budget d’erreur est de 13 000 paiements ratés.',
			'Le SLI de latence est la part des `POST /checkout` qui répondent en moins de 2 000 ms. Le SLO est de 99 % sur 30 jours : 130 000 paiements peuvent être lents. Une moyenne cacherait le 1 % de paiements lents, alors que ce ratio les compte un par un.',
			'Les alertes suivent les règles multi-fenêtres du Workbook. La première réveille Mia quand le taux d’erreur dépasse 14,4 × 0,1 % = 1,44 % sur la dernière heure et sur les 5 dernières minutes. À 5 par seconde, une heure compte 18 000 paiements : il faut environ 260 échecs, soit 2 % du budget.',
			'La deuxième alerte sonne au-dessus de 6 × 0,1 % = 0,6 % sur 6 heures et sur 30 minutes, soit 5 % du budget. Un ticket, lu le matin, s’ouvre au-dessus de 0,1 % sur 3 jours et sur 6 heures. Le SLO de latence reçoit les trois mêmes règles, sur son budget de 1 %.',
			'Le Workbook donne le délai de déclenchement : (1 − SLO) / taux d’erreur × fenêtre × burn rate. Une panne totale sonne après 0,001 / 1 × 60 min × 14,4 ≈ 52 secondes. Les 4 % d’échecs de jeudi sonnent après 0,001 / 0,04 × 60 × 14,4 ≈ 22 minutes, soit environ 260 paiements ratés.',
			'L’alerte CPU disparaît et reste comme courbe sur un tableau de bord. Ce que ça coûte : une fuite mémoire lente ou un disque qui se remplit ne réveille plus personne tant qu’aucun paiement n’échoue. La nuit, à 1 paiement par seconde, 52 échecs en une heure suffisent pour 1,44 %, donc un court incident chez le prestataire peut encore réveiller Mia.'
		]
	},
	quiz: [],
	recall: {
		q: 'Avec un SLO de 99,9 % sur 30 jours, quel taux d’erreur sur la dernière heure déclenche la première alerte, et quelle part du budget est déjà consommée ?',
		a: '14,4 × 0,1 % = 1,44 % sur 1 heure (et sur 5 minutes). L’alerte sonne quand 2 % du budget de 30 jours est consommé, environ 260 paiements à 5 par seconde.'
	},
	sources: [
		{ title: 'Google SRE Workbook : Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
		{ title: 'Google SRE Workbook : Implementing SLOs', url: 'https://sre.google/workbook/implementing-slos/' }
	]
};
