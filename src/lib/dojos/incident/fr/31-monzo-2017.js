const PM = 'https://community.monzo.com/t/resolved-current-account-payments-may-fail-major-outage-27-10-2017/26296/95';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'monzo-2017',
	part: 'Capacité et effets en cascade',
	title: 'Monzo 2017 : linkerd, Kubernetes et une panne des paiements',
	minutes: 10,
	hook: [
		'Vendredi 27 octobre 2017, 14 h 10, à la banque Monzo. Son backend compte plusieurs centaines de microservices en conteneurs Docker, que Kubernetes fait tourner sur des nœuds AWS.',
		'Chaque appel d’un service à un autre passe par linkerd. Linkerd traduit un nom comme `service.foo` en adresse IP et port, d’après ce que Kubernetes lui dit de l’emplacement de chaque service.',
		'Un ingénieur déploie une petite modification sur un service dont les paiements du compte courant ont besoin. Toutes les requêtes vers ce service échouent, et les paiements des clients aussi.'
	],
	terms: [
		{ term: 'linkerd', def: 'Un proxy sur chaque nœud qui route et répartit les appels entre services. Il apprend les adresses des services auprès de l’apiserver de Kubernetes.' },
		{ term: 'apiserver', def: 'Le processus Kubernetes que tous les autres composants interrogent sur l’état du cluster. Il lit et écrit cet état dans etcd.' },
		{ term: 'etcd', def: 'La base distribuée où Kubernetes range ce qui est déployé et où. Une écriture exige l’accord d’une majorité de ses nœuds (un quorum).' },
		{ term: 'endpoints', def: 'La liste des adresses IP des pods derrière un Service Kubernetes. Un Service réduit à 0 réplica a une liste vide.' }
	],
	incident: {
		org: 'Monzo',
		title: 'RESOLVED: Current account payments may fail - Major Outage (27/10/2017)',
		date: '2017-10-27',
		url: PM,
		steps: [
			{
				situation: [
					'14 h 10. La modification est partie par le processus de livraison habituel. Depuis, toutes les requêtes vers le service échouent, et les paiements du compte courant avec.',
					'La carte prépayée n’utilise pas ce service et marche toujours. Chez Monzo, un changement d’interface reste compatible dans les deux sens, donc un retour arrière est sans risque.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Tu appelles toute l’équipe Platform et tu lis les logs de linkerd sur chaque nœud',
					'Tu annules le déploiement que tu viens de faire, puis tu suis le taux d’erreur',
					'Tu écris un correctif pour le service et tu le déploies par-dessus',
					'Tu ajoutes des réplicas au service pour absorber les requêtes en échec'
				],
				answer: 1,
				why: 'Les échecs ont commencé avec le déploiement, et le retour arrière est prévu pour être sûr. L’équipe l’a fait à 14 h 12 : "This is standard practice for deployments that don\'t go according to plan."'
			},
			{
				situation: [
					'14 h 12. L’ancienne version tourne de nouveau. Les erreurs continuent et les paiements restent impossibles.',
					'Personne n’a encore déclaré d’incident. Un seul ingénieur s’occupe de ce qui ressemblait à un mauvais déploiement.'
				],
				q: 'Que fais-tu ensuite ?',
				options: [
					'Tu reviens encore plus loin, à la version de la veille, au cas où l’ancienne serait cassée aussi',
					'Tu attends dix minutes, le temps que les nouveaux pods remplissent leurs caches',
					'Tu demandes de redéployer la modification avec plus de logs pour voir quel appel échoue',
					'Tu déclares une panne et tu réunis du monde : la cause est hors du code annulé'
				],
				answer: 3,
				why: 'Un code qui marchait avant échoue lui aussi, donc la panne vient de quelque chose dont le service dépend. L’équipe a déclaré une panne en interne à 14 h 16, et plusieurs personnes se sont réunies pour mesurer l’impact et chercher.'
			},
			{
				situation: [
					'14 h 18. Les ingénieurs voient linkerd en mauvais état. Linkerd n’a jamais reçu de Kubernetes l’emplacement des nouveaux pods, alors il envoie les requêtes vers des adresses IP où aucun processus ne tourne.',
					'Il y a plusieurs centaines d’instances de linkerd, une par nœud. Un outil interne sait trouver un nœud en difficulté et le redémarrer.'
				],
				q: 'Comment redémarres-tu linkerd ?',
				options: [
					'Tu en redémarres quelques-uns, tu vérifies qu’ils ont les bonnes adresses, puis le reste',
					'Tu redémarres les centaines d’instances d’un coup, elles ont sans doute le même problème',
					'Tu laisses linkerd et tu redémarres les pods de paiement jusqu’à ce qu’il les voie',
					'Tu coupes linkerd partout et les services s’appellent directement par IP'
				],
				answer: 0,
				why: 'Personne ne sait encore pourquoi linkerd a raté la mise à jour, et chaque linkerd redémarré doit recharger ses routes depuis Kubernetes. À 14 h 26, l’équipe les a tous redémarrés. Le postmortem parle d’"an unfortunate and poor decision that worsened the impact of the outage" (une mauvaise décision qui a aggravé la panne).'
			},
			{
				situation: [
					'14 h 26. Pendant le redémarrage, les paiements par carte du compte courant et les virements entrants échouent toujours pour les clients.',
					'Monzo a des procédures internes prévues pour servir de secours quand ses systèmes ont un problème.'
				],
				q: 'Que fais-tu pour les clients, tout de suite ?',
				options: [
					'Rien tant que la plateforme n’est pas réparée, pour que les ingénieurs restent concentrés',
					'Tu dis aux clients de payer avec la carte d’une autre banque en attendant',
					'Tu lances les procédures de secours pour que la plupart des paiements passent',
					'Tu gèles tous les comptes courants pour qu’aucun paiement n’échoue à moitié'
				],
				answer: 2,
				why: 'Les procédures de secours existent pour ce cas, et d’autres ingénieurs peuvent les lancer pendant que l’enquête continue. L’équipe l’a fait : "most customers are still able to use their card successfully despite the ongoing instability."'
			},
			{
				situation: [
					'15 h 13. Les apiservers ont été redémarrés à 14 h 37 et tous les pods linkerd sont revenus, mais plus aucun service ne reçoit de trafic. L’app n’affiche plus ni fil ni solde, et les outils internes tombent.',
					'15 h 27. Linkerd logue une `NullPointerException` en lisant la réponse de découverte de services : cette version ne sait pas lire un Service sans endpoints. Une version plus récente, corrigée, tourne en staging depuis des semaines.',
					'Un tel Service existe : la veille, une équipe a réduit un nouveau service à 0 réplica, et son Service Kubernetes est resté.'
				],
				q: 'Qu’est-ce qui relance le trafic le plus vite ?',
				options: [
					'Tu redémarres encore tous les linkerd, maintenant que les apiservers vont bien',
					'Tu supprimes le Service sans endpoints, pour que linkerd puisse lire la réponse',
					'Tu déploies la version de linkerd testée en staging sur les centaines de nœuds',
					'Tu remets le cluster etcd dans la version d’avant sa dernière mise à jour'
				],
				answer: 1,
				why: 'Supprimer un Service inutilisé retire l’entrée qui fait planter la lecture, sans aucun nouveau déploiement. L’équipe a d’abord lancé la nouvelle version de linkerd, puis à 15 h 31 a supprimé le Service : "linkerd is successfully able to load service discovery information."'
			}
		],
		outcome: [
			'Deux semaines plus tôt, l’équipe Platform avait mis à jour etcd et l’avait passé de trois nœuds à neuf, trois par zone AWS. Un bug de Kubernetes et du client etcd peut faire expirer des requêtes après ce genre de reconfiguration.',
			'À cause de ces expirations, linkerd n’a jamais reçu les nouvelles adresses du service de paiement et envoyait les appels vers des IP sans processus. En redémarrant, chaque linkerd a rechargé la découverte de services, et tous ont planté sur le Service sans endpoints.',
			'Les paiements du compte courant ont échoué de 14 h 10 à 15 h 31. De 15 h 13 à 15 h 31, aucun service de la plateforme ne répondait. Le postmortem la classe "among the worst technical incidents that have happened in our history."',
			'Les correctifs annoncés : corriger le bug d’expiration de Kubernetes, déployer une version de linkerd qui lit les Services vides, ajouter de meilleurs health checks, tableaux de bord et alertes sur ces composants, et annoncer les pannes plus vite en interne comme en externe.'
		]
	},
	quiz: [
		{
			q: 'Monzo a annulé le déploiement du service de paiement à 14 h 12, mais les requêtes échouaient toujours. Pourquoi ?',
			options: [
				'Le retour arrière lui-même a échoué, donc la version cassée tournait encore',
				'L’ancienne version avait le même bug, car les deux partageaient le code fautif',
				'La base refusait l’ancienne version, son schéma ayant déjà changé',
				'Linkerd visait encore les anciennes IP des pods, faute de mise à jour de Kubernetes'
			],
			answer: 3,
			why: 'Le retour arrière lance de nouveaux pods à de nouvelles adresses. Linkerd n’apprend ces adresses que par Kubernetes, et ces mises à jour expiraient, donc aucune version du service n’était joignable.'
		},
		{
			q: 'Jusqu’à 15 h 13, la panne touchait les paiements du compte courant. Pourquoi le redémarrage de tous les linkerd a-t-il coupé tout le trafic ?',
			options: [
				'Chaque nouveau linkerd rechargeait la découverte et plantait sur le Service sans endpoints',
				'Le redémarrage a supprimé les Services Kubernetes, donc plus aucun nom ne se résolvait',
				'Des centaines de linkerd démarrant ensemble ont saturé le CPU des nœuds pendant une heure',
				'Les linkerd redémarrés avaient un fichier de config vide et refusaient tous les appels'
			],
			answer: 0,
			why: 'Un linkerd tout neuf lit la liste complète des services auprès de l’apiserver. La `NullPointerException` sur le Service vide ([linkerd #1219](https://github.com/linkerd/linkerd/issues/1219)) a frappé chaque instance redémarrée, donc une seule entrée fautive a touché toute la flotte d’un coup.'
		},
		{
			q: 'Le etcd de Monzo avait 9 nœuds, 3 dans chacune des 3 zones. Combien de nœuds peut-il perdre en acceptant encore des écritures ?',
			options: [
				'2 nœuds, car un cluster de 9 garde une majorité de 7',
				'3 nœuds, donc une zone exactement et pas plus',
				'4 nœuds, par exemple une zone entière et un nœud de plus',
				'8 nœuds, tant qu’il en reste un pour répondre'
			],
			answer: 2,
			why: 'Le quorum de 9 est 5. Perdre une zone (3 nœuds) et un nœud de plus en laisse 5 : c’est la "simultaneous loss of an entire zone and a single node in another zone" que décrit le postmortem.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui faisait planter les linkerd redémarrés chez Monzo, et qu’est-ce qui a tout débloqué à 15 h 31 ?',
		a: 'Un Service Kubernetes réduit à 0 réplica, sans endpoints : linkerd levait une NullPointerException en le lisant. Supprimer ce Service a relancé le trafic.'
	},
	sources: [
		{ title: 'Monzo, RESOLVED: Current account payments may fail - Major Outage (27/10/2017), postmortem du Head of Engineering', url: PM },
		{ title: 'linkerd, issue #1219, NullPointerException on Kubernetes 1.6.1', url: 'https://github.com/linkerd/linkerd/issues/1219' },
		{ title: 'Kubernetes, issue #47131, apiserver timeouts after rolling-update of etcd cluster', url: 'https://github.com/kubernetes/kubernetes/issues/47131' }
	]
};
