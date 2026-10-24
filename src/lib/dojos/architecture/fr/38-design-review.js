const KEP = 'https://github.com/kubernetes/enhancements/blob/6ebe0a94771723b3f27cb4a757f0cc22f29e38a2/keps/sig-node/4781-kublet-restart-pod-status';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'design-review',
	part: 'Le métier d’architecte',
	title: 'Relire un design : scénarios, portes, pannes',
	minutes: 10,
	hook: [
		'Un collègue t’envoie un design doc et te demande une relecture. Les commentaires faciles viennent d’abord : renommer ce champ, corriger une faute dans le titre, ajouter un schéma. **Aucun ne change ce que fait le système.**',
		'Une revue d’architecture cherche trois choses : les scénarios que le design abîme (jour 3), les parties qui sont des **portes à sens unique** (jour 5), et ses façons de tomber en panne (jour 15).',
		'Tu écris chaque point sous forme de question, car l’auteur sait des choses que tu ignores. Le doc ici est réel : la KEP-4781 de Kubernetes, encore **provisional** à ce commit. Le changement est depuis sorti dans Kubernetes 1.35, alors lis-la comme la proposition qu’elle était, au moment où une relecture coûtait le moins cher.'
	],
	terms: [
		{ term: 'Revue d’architecture', def: 'Lire une proposition pour y trouver les décisions coûteuses à changer, comme un comportement par défaut sur lequel d’autres équipes construisent.' },
		{ term: 'KEP', def: 'Kubernetes Enhancement Proposal : le design doc par lequel passe un changement de Kubernetes, avec un template fixe et un statut (provisional, implementable, implemented).' },
		{ term: 'Mode de défaillance', def: 'Une façon précise de casser : ce qui tombe, ce que voit l’utilisateur, comment ça se rétablit.' },
		{ term: 'Question bloquante', def: 'Une question à laquelle il faut répondre avant d’accepter le design. Marque-la, pour que l’auteur la trouve parmi les petites.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['kep["KEP-4781 : garder le statut des pods quand le kubelet redémarre"]'],
				highlight: ['kep'],
				note: 'Le design : avant cette KEP, quand le kubelet (l’agent sur chaque nœud) redémarre, il remet ses conteneurs à « pas Ready » jusqu’à ce que leurs probes repassent. La KEP appelle ça une tempête de « Not Ready », et propose de **garder plutôt le dernier statut connu**.'
			},
			{
				add: ['kep --> sc["Scénarios : à qui ça fait mal ?"]'],
				highlight: ['sc'],
				note: 'Parcours les scénarios qui comptent (jour 3), y compris ceux où ça se passe mal : une appli qui se bloque pendant que le kubelet est arrêté, un nœud en panne pendant plusieurs minutes, une horloge décalée.'
			},
			{
				add: ['kep --> door["Portes à sens unique : qu’est-ce qui est dur à défaire ?"]'],
				highlight: ['door'],
				note: 'Trouve les contrats (jour 5) : ce sur quoi d’autres équipes construisent, comme une API ou un comportement par défaut. La readiness d’un pod décide où va le trafic. Une fois que le nouveau comportement est celui par défaut et que l’ancien a disparu, tout le monde construit dessus.'
			},
			{
				add: ['kep --> fail["Modes de défaillance : et si une étape meurt ou se répète ?"]'],
				highlight: ['fail'],
				note: 'Pour chaque étape, demande-toi : et si une dépendance est en panne, ou si l’étape tourne au mauvais moment (jour 15) ? Le template de KEP pose lui-même ces questions, et tu cherches celles qui n’ont pas de réponse.'
			},
			{
				add: ['q["Liste courte de questions, les bloquantes marquées"]', 'sc --> q', 'door --> q', 'fail --> q'],
				highlight: ['q'],
				note: 'La revue produit une **liste courte de questions**, avec les bloquantes marquées. Avec cinq questions, l’auteur voit tout de suite la bloquante. Au milieu de trente commentaires, l’auteur peut la rater.'
			}
		]
	},
	example: {
		title: 'keps/sig-node/4781-kublet-restart-pod-status/README.md (extrait)',
		repo: 'kubernetes/enhancements',
		url: `${KEP}/README.md#L105-L370`,
		lang: 'md',
		code: `### Risks and Mitigations

##### Inconsistency with other Kubernetes components
If other parts of Kubernetes (e.g., the API server, controllers) expect certain behavior regarding container readiness states, these changes might cause inconsistencies.

##### Delayed Health Check Updates
By preserving the old state without immediate health checks, there is a delay in recognizing containers that have become unhealthy during or after kubelet's downtime. Services relying on Pod readiness for service discovery might continue directing traffic to Pods with containers that are no longer healthy but are still reported as Ready.
…
### Troubleshooting

###### How does this feature react if the API server and/or etcd is unavailable?

###### What are other known failure modes?`,
		notes: [
			'Lignes 6 et 7 : la KEP nomme elle-même son plus gros risque. Le trafic peut aller vers un pod déclaré Ready alors qu’il n’est plus en bonne santé. Beaucoup de design docs n’écrivent jamais leurs inconvénients, alors dis dans ta relecture que celui-ci le fait.',
			'Les lignes 9 à 13 viennent du template de KEP, qui pose des questions sur le rollback, le décalage de versions, les métriques et les modes de défaillance. **Tes questions vont là où les réponses manquent.** Ici, les deux questions de Troubleshooting (lignes 11 et 13) n’ont pas de réponse.',
			`Lis le design au pied de la lettre. La [ligne 119](${KEP}/README.md#L119) dit que le kubelet récupérera le champ \`Started\` « via l’API server » après un redémarrage. La question de la ligne 368, et si l’API server est en panne, n’a pas encore de réponse.`,
			`[Lis toute la KEP](${KEP}/README.md) avant l’exercice. Elle fait moins de 400 lignes, dont une bonne partie de commentaires du template, et tu la lis en 10 minutes environ.`
		]
	},
	tradeoff: {
		gain: [
			'Tu repères les portes à sens unique quand elles sont encore du texte dans un doc, avant que le kubelet se comporte ainsi en production.',
			'Les questions laissent l’auteur maître de son design et t’apportent le contexte qui te manquait.',
			'Le fil de la relecture garde la trace des risques que l’équipe a examinés.'
		],
		cost: [
			'Une bonne relecture demande une heure de lecture attentive, prise sur ton propre travail.',
			'Relire un doc rate ce que seul le code montre. Certaines questions n’apparaissent que dans la PR.',
			'Dans une liste de trente questions, l’auteur peut rater la bloquante si tu ne la marques pas.'
		]
	},
	task: {
		prompt: 'Lis la KEP-4781. Écris **une question par angle** : un scénario qu’elle abîme, une porte à sens unique, un mode de défaillance. Indique laquelle, s’il y en a une, devrait bloquer l’acceptation.',
		hint: 'Compare la ligne 115 (ce que fait le feature gate par défaut) avec la ligne 201 (ce qu’il faut pour passer en GA). Puis lis la ligne 119 à côté de la ligne 368, et la ligne 249.',
		answer: [
			'Scénario : une appli se bloque pendant que le kubelet est arrêté. La ligne 125 dit que son statut est corrigé « au prochain cycle de probe ». Vu la période et le seuil d’échec de la probe, combien de temps un pod cassé pendant le redémarrage peut-il continuer à recevoir du trafic ? Le doc devrait-il indiquer le pire cas ?',
			'Porte à sens unique : à la ligne 115, le nouveau comportement est activé par défaut dès la première release, et le gate ne sert qu’à rétablir l’ancien. Ligne 201 : pour la GA, il suffit de « aucun problème signalé par les utilisateurs ». Une fois le gate retiré, l’ancien comportement disparaît pour tout le monde. Quelle preuve, au-delà du silence, permet de passer en GA ?',
			'Mode de défaillance : à la ligne 119, après un redémarrage, le kubelet récupère `Started` depuis l’API server. La ligne 368 demande ce qui se passe si l’API server est indisponible, et elle est vide. Est-ce que le kubelet revient à l’ancienne remise à zéro, ou garde un statut périmé ?',
			'Bloquante : la question du mode de défaillance, avec la ligne 249, où « Quelles métriques précises devraient déclencher un rollback ? » est à `N/A`. Un changement de comportement par défaut qui oriente le trafic a besoin d’un repli connu et d’un signal pour faire un rollback. Je demanderais les deux avant que la KEP passe en implementable.',
			'Non bloquante, mais à poser : la ligne 147 utilise une tolérance de 10 secondes pour le décalage d’horloge. Que se passe-t-il sur un nœud dont l’horloge est décalée de plus que ça ?'
		],
		steps: [
			{
				title: 'Lis ce que change la KEP',
				questions: [
					{ q: 'Avant cette KEP, que fait le kubelet aux conteneurs quand il redémarre ?', options: ['Il garde leur dernier statut connu', 'Il les remet à not Ready jusqu’à ce que leurs probes passent à nouveau', 'Il redémarre chaque conteneur du nœud', 'Il demande leur statut à l’API server'], answer: 1, why: 'La KEP appelle le résultat une tempête de « Not Ready », et c’est ce qu’elle veut arrêter.' },
					{ q: 'Que propose la KEP à la place ?', options: ['Garder le dernier statut connu à travers le redémarrage', 'Sauter les probes pendant la première minute', 'Retirer les readiness probes des pods', 'Redémarrer le kubelet moins souvent'], answer: 0, why: 'Le titre le dit : garder le statut des pods à travers les redémarrages du kubelet.' },
					{ q: 'Quel risque la KEP nomme-t-elle elle-même ?', options: ['Le kubelet pourrait planter plus souvent', 'Les pods pourraient redémarrer deux fois', 'Les horloges pourraient dériver entre nœuds', 'Le trafic peut aller vers un pod déclaré Ready mais plus en bonne santé'], answer: 3, why: 'Sa section « Delayed Health Check Updates » le dit. Reconnais au doc d’avoir écrit son propre défaut.' },
					{ q: 'Où vont tes questions en premier ?', options: ['Sur les fautes de frappe et les noms de champs', 'Sur les diagrammes', 'Là où les réponses du template sont vides', 'Sur la liste des tests e2e'], answer: 2, why: 'Le template de KEP pose des questions sur le rollback, le décalage de versions, les métriques et les modes de défaillance. Une réponse vide, c’est là que la revue commence.' }
				]
			},
			{
				title: 'Pose un scénario qu’elle abîme',
				questions: [
					{ q: 'Quel scénario ce design abîme-t-il ?', options: ['Une appli qui se bloque pendant que le kubelet est arrêté', 'Un pod qui démarre pour la première fois', 'Un nœud qui ne redémarre jamais son kubelet', 'Un conteneur sans readiness probe'], answer: 0, why: 'Son statut reste Ready, donc il continue de recevoir du trafic jusqu’à ce qu’une probe le remarque.' },
					{ q: 'D’après la ligne 125, quand le statut de ce pod est-il corrigé ?', options: ['Juste après le démarrage du kubelet', 'Quand l’API server s’en aperçoit', 'Jamais, tant que le pod ne redémarre pas', 'Au prochain cycle de probe'], answer: 3, why: 'Le statut est corrigé par les probes, donc le délai dépend de la façon dont la probe est réglée.' },
					{ q: 'Qu’est-ce qui décide combien de temps un pod cassé peut recevoir du trafic ?', options: ['Le nombre de nœuds du cluster', 'La période et le seuil d’échec de la probe', 'La taille de l’image du conteneur', 'Le nom du feature gate'], answer: 1, why: 'Une probe doit échouer assez de fois, à sa période, avant que le pod passe à not Ready.' },
					{ q: 'Comment formules-tu ce point dans la revue ?', options: ['« C’est faux, annule ça. »', '« Ajoute un diagramme ici. »', '« Combien de temps un tel pod peut-il recevoir du trafic ? Le doc devrait-il indiquer le pire cas ? »', '« Merci de renommer le gate. »'], answer: 2, why: 'Une question fait venir le contexte de l’auteur, et fait quand même ressortir le problème si tu as raison.' }
				]
			},
			{
				title: 'Trouve la porte à sens unique',
				questions: [
					{ q: 'Ligne 115 : que fait le feature gate par défaut ?', options: ['Il active le nouveau comportement dès la première release', 'Il garde l’ancien comportement jusqu’à la GA', 'Il demande à chaque admin de cluster de choisir', 'Il active le nouveau comportement seulement sur les nouveaux nœuds'], answer: 0, why: 'Le nouveau comportement est celui par défaut, et le gate ne sert qu’à rétablir l’ancien.' },
					{ q: 'Pourquoi la readiness des pods compte-t-elle comme un contrat sur lequel d’autres équipes construisent ?', options: ['Elle est stockée dans etcd', 'Elle fait partie du template de KEP', 'Elle décide où va le trafic, donc les services et leur routage en dépendent', 'Seul le kubelet la lit'], answer: 2, why: 'Un comportement par défaut qui oriente le trafic, beaucoup d’équipes s’appuient dessus sans lire la KEP. C’est ce qui fait de son changement un changement de contrat.' },
					{ q: 'Ligne 201 : que faut-il pour la GA ?', options: ['Un jeu complet de tests e2e et une métrique', 'Deux releases avec le gate activé par défaut', 'L’accord de chaque SIG', '« Aucun problème signalé par les utilisateurs »'], answer: 3, why: 'C’est la barre que fixe la KEP, et le silence est une preuve faible pour un comportement par défaut qui oriente le trafic.' },
					{ q: 'Quelle question poses-tu là-dessus ?', options: ['Le gate peut-il avoir un nom plus court ?', 'Quelle preuve, au-delà du silence, permet de passer en GA ?', 'La GA peut-elle arriver une release plus tôt ?', 'Qui a écrit le feature gate ?'], answer: 1, why: 'Elle demande un vrai signal avant que la porte se ferme pour tout le monde.' }
				]
			},
			{
				title: 'Trouve un mode de défaillance et marque le bloquant',
				questions: [
					{ q: 'Ligne 119 : après un redémarrage, où le kubelet récupère-t-il `Started` ?', options: ['Sur son disque local', 'Seulement auprès du runtime de conteneurs', 'Auprès de l’API server', 'Auprès des probes'], answer: 2, why: 'La KEP dit que le kubelet le récupère « via l’API server », donc l’API server devient une dépendance du redémarrage.' },
					{ q: 'La ligne 368 demande ce qui se passe si l’API server est indisponible. Que dit-elle ?', options: ['Le kubelet l’attend', 'Le kubelet revient à l’ancienne remise à zéro', 'Rien : la réponse est vide', 'Le kubelet garde un statut périmé'], answer: 2, why: 'La question est dans le template et n’a pas encore de réponse. Ce trou, c’est ta question de mode de défaillance.' },
					{ q: 'Quelle question devrait bloquer l’acceptation ?', options: ['La tolérance de décalage d’horloge de la ligne 147', 'Le délai du cycle de probe de la ligne 125', 'La faute « kublet » dans le nom du dossier', 'Le mode de défaillance de l’API server, avec les métriques de rollback à `N/A` de la ligne 249'], answer: 3, why: 'Un changement de comportement par défaut qui oriente le trafic a besoin d’un repli connu et d’un signal de rollback avant de passer en implementable.' },
					{ q: 'Pourquoi marquer la question bloquante ?', options: ['Pour que l’auteur la trouve parmi les petites', 'Parce que le template exige une étiquette', 'Pour que les autres questions puissent être ignorées', 'Pour accélérer le merge'], answer: 0, why: 'Dans une liste de trente commentaires, l’auteur peut la rater. Marquée, elle se voit tout de suite.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Quel commentaire relève d’une revue d’**architecture** ?',
			options: ['Renommer le feature gate avec un nom plus court, il est pénible à taper', 'Corriger la faute « kublet » dans le nom du dossier avant le merge', 'Ajouter une table des matières pour aller vite à chaque section', 'Si l’API server est en panne quand le kubelet redémarre, quel statut reçoit un pod ?'],
			answer: 3,
			why: 'Il nomme un mode de défaillance avec un effet visible pour l’utilisateur (du trafic vers les mauvais pods, ou une tempête de not-Ready). Les autres relèvent du style : à corriger, mais peu coûteux à changer plus tard.'
		},
		{
			q: 'Pourquoi formuler les points de relecture sous forme de questions ?',
			options: ['Uniquement par politesse, puisque c’est l’auteur qui décide de toute façon à la fin', 'L’auteur a peut-être un contexte qui te manque. Une question l’obtient ou révèle le trou, sans conflit', 'Les questions n’ont pas besoin de réponse, donc l’auteur peut ignorer les mineures', 'Le template de KEP exige que chaque point de relecture soit écrit comme une question'],
			answer: 1,
			why: 'Tu peux te tromper. Une question ne coûte rien si c’est le cas, et fait quand même remonter le problème si tu as raison.'
		},
		{
			q: 'Dans la KEP-4781, quelle partie est la plus « **sens unique** » ?',
			options: ['Changer la readiness par défaut dont dépend le routage du trafic, une fois le gate de désactivation retiré', 'La tolérance de 10 secondes au décalage d’horloge dans le kubelet, dont dépendent les nodes', 'La liste des cas de test e2e, puisque les jobs de CI sont construits autour de chacun', 'Les chiffres de couverture des tests unitaires, puisqu’ils figurent dans la KEP elle-même'],
			answer: 0,
			why: 'D’autres composants et des utilisateurs construisent sur le comportement de la readiness. Une fois que l’ancien comportement ne peut plus être réactivé, le changer à nouveau demande une nouvelle proposition et une nouvelle migration. La tolérance d’horloge, les tests et les chiffres de couverture sont internes, et une PR suivante peut les changer.'
		}
	],
	recall: {
		q: 'Que cherche une revue d’architecture de la KEP-4781, et sous quelle forme écris-tu chaque point ?',
		a: 'Les scénarios qu’elle abîme, les portes à sens unique (la nouvelle readiness par défaut une fois le gate retiré), et les modes de défaillance (l’API server en panne quand le kubelet redémarre). Chaque point est une question, et les bloquantes sont marquées.'
	},
	sources: [
		{ title: 'KEP-4781, Restarting kubelet does not change pod status (provisional)', url: `${KEP}/README.md` },
		{ title: 'KEP-4781, kep.yaml (status and feature gate)', url: `${KEP}/kep.yaml` },
		{ title: 'Kubernetes v1.35.0, ChangeContainerStatusOnKubeletRestart feature gate', url: 'https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/features/kube_features.go#L1189-L1192' },
		{ title: 'Kubernetes enhancements, KEP template', url: 'https://github.com/kubernetes/enhancements/blob/6ebe0a94771723b3f27cb4a757f0cc22f29e38a2/keps/NNNN-kep-template/README.md' },
		{ title: 'Malte Ubl, Design Docs at Google', url: 'https://www.industrialempathy.com/posts/design-docs-at-google/' }
	]
};
