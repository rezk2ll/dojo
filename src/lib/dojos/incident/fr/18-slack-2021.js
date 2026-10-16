const PM = 'https://slack.engineering/slacks-outage-on-january-4th-2021/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'slack-2021',
	part: 'Réseau et DNS',
	title: 'Slack 2021 : un Transit Gateway saturé le premier jour ouvré de l’année',
	minutes: 10,
	hook: [
		'Lundi 4 janvier 2021, premier jour ouvré de l’année pour beaucoup de monde. La journée en Asie Pacifique et la matinée en Europe se passent sans histoire.',
		'Pendant la matinée sur le continent américain, un service de supervision externe t’appelle : le taux d’erreurs grimpe. Les erreurs s’aggravent, et l’équipe lance sa procédure d’incident.'
	],
	terms: [
		{ term: 'VPC', def: 'Virtual Private Cloud : un réseau isolé dans AWS. Slack fait tourner ses services dans des comptes AWS séparés et des VPC dédiés.' },
		{ term: 'Transit Gateway (TGW)', def: 'Un hub réseau AWS qui interconnecte des VPC. AWS le gère et le dimensionne, et Slack s’en sert pour relier ses VPC.' },
		{ term: 'Tier web', def: 'La flotte de serveurs web de Slack. L’autoscaling ajoute ou retire des instances selon le CPU et l’occupation des threads Apache.' },
		{ term: 'provision-service', def: 'Le service de Slack qui configure et teste chaque nouvelle instance avant qu’elle serve du trafic.' }
	],
	incident: {
		org: 'Slack',
		title: 'Slack’s Outage on January 4th 2021',
		date: '2021-01-04',
		url: PM,
		steps: [
			{
				situation: [
					'Au début de l’enquête, le service de tableaux de bord et d’alertes de Slack tombe.',
					'Il te reste des consoles internes, des pages de statut, quelques outils en ligne de commande et les logs. Les backends de métriques répondent toujours.'
				],
				q: 'Comment continues-tu l’enquête ?',
				options: [
					'Attendre le retour des tableaux de bord avant de toucher à quoi que ce soit',
					'Appeler l’équipe supervision, et interroger directement les métriques',
					'Remettre chaque service dans sa version de la semaine dernière',
					'Te fier aux signalements des utilisateurs sur la page de statut'
				],
				answer: 1,
				why: 'Les données existaient encore, seuls les tableaux de bord au dessus avaient disparu. Slack a "immediately paged in our monitoring team" et interrogé les backends de métriques à la main, ce qui "is nowhere near as efficient as using our dashboards with their pre-built queries".'
			},
			{
				situation: [
					'L’équipe annule quelques changements poussés dans la journée, et les erreurs continuent. L’infrastructure semble tourner, mais tu vois des signes d’une dégradation réseau étendue.',
					'À 6 h 57 PST, 99 % des messages Slack partent correctement. D’habitude, le taux dépasse 99,999 %.'
				],
				q: 'Que fais-tu ensuite ?',
				options: [
					'Annuler aussi les changements de la semaine précédente',
					'Remonter la dégradation réseau à AWS, le fournisseur cloud',
					'Redémarrer tout le tier web pour purger les connexions',
					'Annoncer sur la page de statut que Slack est totalement coupé'
				],
				answer: 1,
				why: 'Annuler les changements du jour n’a rien changé, et la dégradation venait du réseau, qu’AWS opère pour Slack. Slack a "escalated to AWS, our main cloud provider". Les ingénieurs d’AWS ont ensuite trouvé le déclencheur dans le réseau AWS de Slack.'
			},
			{
				situation: [
					'À 7 h 00 PST arrive le petit pic habituel du début d’heure. Avec la perte de paquets, les appels du tier web vers ses backends ralentissent, le tier web sature, et Slack tombe.',
					'L’autoscaling retire des instances web et remplace celles marquées en mauvaise santé. Plusieurs intervenants étaient connectés en SSH sur ces instances, et leurs sessions coupent d’un coup.'
				],
				q: 'Que fais-tu de l’autoscaling ?',
				options: [
					'Le laisser faire, il réagit plus vite qu’un humain',
					'Couper tout l’autoscaling, à la hausse comme à la baisse',
					'Réduire encore le tier web pour soulager les backends',
					'Couper la réduction, et garder la montée en charge'
				],
				answer: 3,
				why: 'La réduction retirait de la capacité de service et les instances sur lesquelles travaillaient les intervenants. Slack a "disabled the downscaling to facilitate investigation and to preserve our serving capacity." La montée en charge restait utile, car le tier web saturé manquait de capacité.'
			},
			{
				situation: [
					'Entre 7 h 01 et 7 h 15 PST, l’autoscaling tente d’ajouter 1 200 serveurs. provision-service, qui passe par le même réseau lent, atteint la limite Linux de fichiers ouverts et un quota AWS.',
					'La plupart des nouvelles instances ne sont jamais finies et ne servent rien. Ces instances cassées remplissent le tier web jusqu’aux tailles maximales de ses groupes d’autoscaling.'
				],
				q: 'Que répares-tu en premier ?',
				options: [
					'Relever la taille maximale des groupes pour loger plus d’instances',
					'Réparer provision-service et supprimer les instances cassées',
					'Redemander 1 200 serveurs quand le quota se libère',
					'Baisser la limite de fichiers ouverts pour échouer plus vite'
				],
				answer: 1,
				why: 'Relever les limites ajouterait seulement d’autres instances que provision-service ne pourrait pas finir. Slack a réparé provision-service pendant que "some responders cleared these broken instances up". Des instances saines sont entrées en service une fois provision-service revenu, vers 8 h 15 PST.'
			},
			{
				situation: [
					'À 10 h 40 PST, le réseau est revenu à la normale. Les tableaux de bord et les alertes de Slack étaient tombés parce qu’ils tournaient dans un autre VPC que leurs bases de données, donc dépendaient du chemin réseau AWS en panne.'
				],
				q: 'Comment protèges-tu les tableaux de bord la prochaine fois ?',
				options: [
					'Faire tourner le service dans le même VPC que sa base',
					'Ajouter un second service de tableaux de bord dans un autre VPC',
					'Garder les tableaux de bord 24 heures en cache dans le navigateur',
					'Placer les tableaux de bord derrière le même load balancer que Slack'
				],
				answer: 0,
				why: 'Chaque passage d’un VPC à l’autre ajoute une dépendance au réseau entre les deux. Slack écrit : "Running the dashboard service instances in the same VPC as their database will remove this dependency."'
			}
		],
		outcome: [
			'AWS a trouvé le déclencheur : un des Transit Gateways de Slack était saturé et perdait des paquets. Slack passe "from our quietest time of the whole year to one of our biggest days quite literally overnight", avec des caches clients froids après les fêtes. Les TGW "did not scale fast enough."',
			'Slack était indisponible à partir du petit pic de 7 h 00 PST. À 9 h 15, le service était dégradé mais répondait, grâce au "panic mode" des load balancers, aux nouvelles tentatives et aux disjoncteurs. Les ingénieurs d’AWS ont augmenté la capacité du TGW à la main, et à 10 h 40 PST réseau, taux d’erreurs et latence étaient revenus à la normale.',
			'AWS revoit les algorithmes de dimensionnement des TGW "for large packet-per-second increases". Slack s’est programmé un rappel pour demander un agrandissement préventif de ses TGW à la fin des prochaines fêtes.',
			'Slack a aussi listé ses propres corrections : mettre le service de tableaux de bord dans le même VPC que sa base, tester régulièrement provision-service en charge, et revoir les health checks et l’autoscaling pour ne plus surcharger provision-service.'
		]
	},
	quiz: [
		{
			q: 'Avant 7 h 00, l’autoscaling a d’abord retiré des serveurs web alors que le réseau se dégradait. Pourquoi ?',
			options: [
				'Le trafic était faible après les fêtes, il fallait moins de serveurs',
				'Les threads attendaient le réseau, donc l’usage CPU a baissé',
				'Les health checks ont marqué chaque serveur web comme inactif',
				'Une tâche planifiée réduit toujours le parc au début de l’heure'
			],
			answer: 1,
			why: 'Slack dimensionne son tier web selon le CPU et l’occupation des threads Apache. Un thread bloqué sur un appel lent consomme peu de CPU : le signal CPU demandait moins de serveurs, puis celui des threads en a vite demandé plus.'
		},
		{
			q: 'Pourquoi Slack a-t-il perdu ses tableaux de bord pendant la panne réseau qu’il essayait de comprendre ?',
			options: [
				'Les serveurs de tableaux de bord n’avaient plus d’espace disque',
				'Les tableaux de bord passaient par des messages Slack',
				'Ils joignaient leurs bases dans un autre VPC, via les TGW',
				'L’équipe supervision les avait coupés pour maintenance'
			],
			answer: 2,
			why: 'Le trafic entre deux VPC passe par un Transit Gateway. Le TGW saturé a coupé les tableaux de bord de leurs bases, au moment où les intervenants en avaient le plus besoin.'
		},
		{
			q: 'Pourquoi le Transit Gateway a-t-il saturé le 4 janvier et pas un lundi ordinaire ?',
			options: [
				'AWS faisait une maintenance sur les TGW ce matin-là',
				'Un déploiement Slack du jour doublait la taille des messages',
				'Le trafic a bondi en une nuit depuis le creux de l’année, caches froids',
				'Slack avait regroupé tous ses services dans un seul VPC pendant les fêtes'
			],
			answer: 2,
			why: 'Le trafic était bas pendant les fêtes, et le premier lundi les clients ont téléchargé plus de données que d’habitude à leur première connexion. Les TGW s’agrandissent tout seuls, mais pas aussi vite que ce bond.'
		}
	],
	recall: {
		q: 'Quel composant AWS perdait les paquets de Slack le 4 janvier 2021, et comment l’a-t-on réparé ?',
		a: 'Un des Transit Gateways AWS de Slack était saturé. Les ingénieurs d’AWS ont augmenté sa capacité à la main, et le réseau était normal à 10 h 40 PST.'
	},
	sources: [
		{ title: 'Slack Engineering : Slack’s Outage on January 4th 2021', url: PM },
		{ title: 'AWS : What is AWS Transit Gateway for Amazon VPC?', url: 'https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html' }
	]
};
