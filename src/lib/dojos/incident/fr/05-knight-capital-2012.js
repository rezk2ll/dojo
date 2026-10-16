const ORDER = 'https://www.sec.gov/files/litigation/admin/2013/34-70694.pdf';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'knight-capital-2012',
	part: 'Changements et configuration',
	title: 'Knight Capital 2012 : le vieux code resté sur un serveur sur huit',
	minutes: 10,
	hook: [
		'Mercredi 1er août 2012, Jersey City. Tu travailles à la technique chez Knight Capital, un courtier qui traite environ 10 % des échanges d’actions cotées aux États-Unis. Aujourd’hui, le New York Stock Exchange lance son Retail Liquidity Program (RLP).',
		'Depuis le 27 juillet, Knight déploie un nouveau code RLP dans SMARS, son routeur d’ordres, quelques serveurs à la fois. SMARS tourne sur huit serveurs.',
		'Vers 8 h 01 (heure de New York), un système interne commence à envoyer des e-mails automatiques à un groupe d’employés. Ce sont des « BNET rejects » qui citent SMARS et affichent l’erreur "Power Peg disabled".'
	],
	terms: [
		{ term: 'SMARS', def: 'Le routeur d’ordres automatique et rapide de Knight. Il reçoit des ordres d’autres systèmes de Knight et envoie des ordres aux Bourses et autres lieux d’exécution.' },
		{ term: 'Ordres parent et enfant', def: 'SMARS reçoit un ordre « parent » d’un autre système de Knight. Il envoie un ou plusieurs ordres « enfant » aux lieux d’exécution, selon la liquidité disponible.' },
		{ term: 'Power Peg', def: 'Une ancienne fonction de SMARS que Knight n’utilisait plus depuis 2003. Son code était resté sur les serveurs et pouvait encore être appelé.' },
		{ term: 'PMON', def: 'Le principal outil de suivi des risques de Knight. Il montre les positions une fois les ordres exécutés, et quelqu’un doit le surveiller : il n’envoie aucune alerte automatique.' }
	],
	incident: {
		org: 'Knight Capital Americas LLC',
		title: 'In the Matter of Knight Capital Americas LLC',
		date: '2012-08-01',
		url: ORDER,
		steps: [
			{
				situation: [
					'Les e-mails BNET reject continuent d’arriver en temps réel pendant tout le pré-marché. Ils viennent d’ordres éligibles au RLP prévus pour le pré-marché.',
					'Knight n’a pas conçu ces e-mails comme des alertes, et les employés ne les lisent en général pas. Le marché ouvre à 9 h 30.'
				],
				q: 'Que fais-tu de ces e-mails avant 9 h 30 ?',
				options: [
					'Rien : ce ne sont pas des alertes, personne ne s’en occupe',
					'Chercher pourquoi SMARS parle de Power Peg le jour du lancement du RLP',
					'Demander à l’équipe messagerie de les filtrer de la boîte commune',
					'Les transférer au NYSE, puisque le RLP est leur programme'
				],
				answer: 1,
				why: 'Le système a envoyé 97 de ces e-mails avant l’ouverture. La SEC : ils "were caused by the code deployment failure, and provided Knight with a potential opportunity to identify and fix the coding issue prior to the market open." Personne n’a agi avant l’ouverture.'
			},
			{
				situation: [
					'9 h 30, le marché ouvre. Des cadres voient sur PMON un gros volume de positions qui s’accumule dans le 33 Account. Ce compte a une limite de position brute de 2 millions de dollars.',
					'Le 33 Account reçoit des positions de plusieurs sources : personne ne peut vite dire d’où viennent celles-ci. SMARS envoie toujours des ordres.'
				],
				q: 'Que fais-tu ?',
				options: [
					'Continuer à surveiller PMON jusqu’à connaître la source des positions',
					'Relever la limite du 33 Account pour que le trading continue',
					'Déconnecter SMARS du marché pendant que tu cherches la cause',
					'Demander aux Bourses d’annuler les transactions du 33 Account'
				],
				answer: 2,
				why: 'Knight "remained connected to the markets and continued to send orders" pendant que l’équipe technique cherchait la cause. La SEC conclut que Knight "needed clear guidance for its technology personnel as to when to disconnect a malfunctioning system from the market."'
			},
			{
				situation: [
					'L’équipe technique travaille sur SMARS en plein trading, et le routeur continue d’envoyer des ordres enfant. Depuis le 27 juillet, les serveurs de SMARS ont reçu le nouveau code RLP.',
					'L’équipe prévoit de retirer le nouveau code RLP de SMARS.'
				],
				q: 'Que vérifies-tu avant de le retirer ?',
				options: [
					'Rien : le retirer tout de suite des huit serveurs',
					'Quels serveurs l’ont, et quel vieux code lit le flag RLP',
					'Que le NYSE a mis le RLP en pause pour la journée',
					'Que PMON montre le 33 Account en baisse'
				],
				answer: 1,
				why: 'Knight "uninstalled the new RLP code from the seven servers where it had been deployed correctly." Les ordres portant le flag RLP ont alors lancé le code Power Peg, toujours présent sur ces sept serveurs. Le huitième n’avait jamais reçu le nouveau code.'
			},
			{
				situation: [
					'Au bout d’environ 45 minutes, Knight arrête l’envoi des ordres. 212 ordres parent ont produit plus de 4 millions d’exécutions sur 154 actions.',
					'SMARS avait un contrôle de prix : il plafonnait les ordres enfant à 9,5 % au-delà du meilleur prix national (National Best Bid ou Offer). Il ne s’appliquait pas aux ordres reçus avant l’ouverture pour l’enchère d’ouverture, comme ces 212.'
				],
				q: 'Quel contrôle aurait arrêté les ordres, quel que soit le bug ?',
				options: [
					'Un plafond de prix plus serré dans SMARS, 5 % au lieu de 9,5 %',
					'Plus d’employés devant PMON à l’ouverture du marché',
					'Un second technicien qui vérifie chaque déploiement',
					'Une limite de capital globale qui bloque les ordres toute seule'
				],
				answer: 3,
				why: 'Selon la SEC, Knight n’avait pas de "pre-set capital thresholds in the aggregate for the firm that were linked to automated controls that would prevent the entry of orders". Un second technicien aurait pu repérer le serveur oublié, mais pas un autre bug. PMON dépendait d’humains et ne pouvait bloquer aucun ordre.'
			}
		],
		outcome: [
			'Un technicien n’a pas copié le nouveau code RLP sur l’un des huit serveurs de SMARS, et personne n’a relu le déploiement. Le nouveau code réutilisait un flag qui activait autrefois Power Peg. Sur le huitième serveur, les ordres portant ce flag lançaient le vieux code Power Peg au lieu du code RLP.',
			'En 2005, Knight avait déplacé la fonction qui compte les actions exécutées plus tôt dans le code de SMARS, sans jamais retester Power Peg. Power Peg envoyait donc des ordres enfant sans tenir compte des actions déjà exécutées. Un autre système de Knight voyait que les ordres parent étaient remplis, mais SMARS n’a jamais reçu cette information.',
			'En 45 minutes environ, SMARS a envoyé des millions d’ordres enfant pour 212 ordres parent : plus de 4 millions d’exécutions et plus de 397 millions d’actions. Knight s’est retrouvé avec une position nette acheteuse d’environ 3,5 milliards de dollars et une position nette vendeuse d’environ 3,15 milliards, et a perdu plus de 460 millions de dollars.',
			'La SEC a constaté que Knight n’avait pour SMARS ni procédure de déploiement écrite, ni seconde relecture, ni contrôle comparant les ordres sortant de SMARS à ceux qui y entraient, ni procédure de réponse aux incidents. Knight a payé une amende de 12 millions de dollars et s’est engagé à faire auditer par un consultant indépendant sa conformité à la règle d’accès au marché.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi Power Peg continuait-il d’envoyer des ordres enfant une fois les ordres parent remplis ?',
			options: [
				'Le code RLP lui disait que chaque ordre restait ouvert',
				'Sa fonction de comptage avait été déplacée en 2005',
				'Les Bourses ne confirmaient pas les exécutions à Knight',
				'Le 33 Account remettait le compteur à zéro chaque seconde'
			],
			answer: 1,
			why: 'Power Peg comptait les actions exécutées pour arrêter d’envoyer des ordres une fois le parent rempli. Knight a déplacé cette fonction plus tôt dans le code de SMARS en 2005 et "did not retest the Power Peg code" ensuite.'
		},
		{
			q: 'Knight a désinstallé le nouveau code RLP des sept bons serveurs. Pourquoi cela a-t-il aggravé la situation ?',
			options: [
				'Les serveurs ont perdu leur connexion aux Bourses',
				'L’ancien code RLP de ces serveurs a doublé les ordres',
				'Les ordres avec le flag réutilisé y ont lancé Power Peg',
				'La désinstallation a effacé les positions dans PMON'
			],
			answer: 2,
			why: 'Le code RLP réutilisait le flag qui activait autrefois Power Peg, et le code Power Peg était encore sur ces serveurs. Sans le code RLP, chaque ordre parent avec ce flag lançait Power Peg.'
		},
		{
			q: 'SMARS plafonnait les ordres enfant à 9,5 % au-delà du meilleur prix. Pourquoi ce plafond n’a-t-il pas arrêté les 212 ordres ?',
			options: [
				'Le plafond ne visait que les ordres de plus d’un million de dollars',
				'Les ordres Power Peg contournaient complètement SMARS',
				'Le plafond avait été coupé pour le lancement du RLP',
				'Il ne couvrait pas les ordres reçus avant l’ouverture'
			],
			answer: 3,
			why: 'La SEC : le plafond "did not apply to orders" reçus "before the market open and intended to send to participate in the opening auction". Il ne voyait pas non plus les erreurs tant que les prix bougeaient de moins de 9,5 %.'
		}
	],
	recall: {
		q: 'Qu’avait de différent le huitième serveur de SMARS le 1er août 2012 ?',
		a: 'Un technicien n’y avait pas copié le nouveau code RLP. Les ordres avec le flag réutilisé y lançaient le vieux code Power Peg, qui envoyait des ordres enfant sans compter les exécutions. Knight a perdu plus de 460 millions de dollars en environ 45 minutes.'
	},
	sources: [
		{ title: 'SEC, Order Instituting Administrative and Cease-and-Desist Proceedings, In the Matter of Knight Capital Americas LLC (Release No. 34-70694)', url: ORDER },
		{ title: 'SEC, SEC Charges Knight Capital With Violations of Market Access Rule (press release 2013-222)', url: 'https://www.sec.gov/newsroom/press-releases/2013-222' }
	]
};
