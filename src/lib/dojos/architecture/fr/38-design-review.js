const KEP = 'https://github.com/kubernetes/enhancements/blob/6ebe0a94771723b3f27cb4a757f0cc22f29e38a2/keps/sig-node/4781-kublet-restart-pod-status';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'design-review',
	part: 'Le métier d’architecte',
	title: 'Relire un design : scénarios, portes, pannes',
	minutes: 10,
	hook: [
		'Un collègue t’envoie un design doc et te demande une relecture. Les commentaires faciles viennent d’abord : renommer ce champ, corriger une faute dans le titre, ajouter un schéma. Tout ça est légitime. **Aucun ne change ce que fait le système.**',
		'Une revue d’architecture ne cherche que trois choses : quels **scénarios** le design abîme, quelles parties sont des **portes à sens unique**, et comment il **tombe en panne**. Les jours 3, 5 et 15 en une seule lecture.',
		'Et tu les écris sous forme de **questions**, pas de verdicts. L’auteur sait des choses que tu ignores. Le doc du jour est réel : la KEP-4781 de Kubernetes, encore **provisional** à ce commit. Le changement est depuis sorti dans Kubernetes 1.35, alors lis-la comme la proposition qu’elle était, au moment où une relecture coûtait le moins cher.'
	],
	terms: [
		{ term: 'Revue d’architecture', def: 'Lire une proposition pour y trouver les décisions coûteuses à changer. Pas pour le style, pas pour la formulation.' },
		{ term: 'KEP', def: 'Kubernetes Enhancement Proposal : le design doc par lequel passe un changement de Kubernetes, avec un template fixe et un statut (provisional, implementable, implemented).' },
		{ term: 'Mode de défaillance', def: 'Une façon précise de casser : ce qui tombe, ce que voit l’utilisateur, comment ça se rétablit.' },
		{ term: 'Question bloquante', def: 'Une question à laquelle il faut répondre avant d’accepter le design. Marque-la, pour qu’elle ne se noie pas parmi les petites.' },
		{ term: 'Contrat', def: 'Tout ce sur quoi d’autres équipes construisent : une API, un format de message, un comportement par défaut. C’est en général la partie la plus « sens unique » d’un design.' }
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
				note: 'Parcours les scénarios qui comptent (jour 3). Pas seulement le cas nominal : une appli qui se bloque pendant que le kubelet est arrêté, un nœud en panne pendant plusieurs minutes, une horloge décalée.'
			},
			{
				add: ['kep --> door["Portes à sens unique : qu’est-ce qui est dur à défaire ?"]'],
				highlight: ['door'],
				note: 'Trouve les contrats (jour 5). La readiness d’un pod décide où va le trafic. Une fois que le nouveau comportement est celui par défaut et que l’ancien a disparu, tout le monde construit dessus.'
			},
			{
				add: ['kep --> fail["Modes de défaillance : et si une étape meurt ou se répète ?"]'],
				highlight: ['fail'],
				note: 'Pour chaque étape, demande-toi : et si une dépendance est en panne, ou si l’étape tourne au mauvais moment (jour 15) ? Le template de KEP pose lui-même ces questions. Cherche celles qui sont restées vides.'
			},
			{
				add: ['q["Liste courte de questions, les bloquantes marquées"]', 'sc --> q', 'door --> q', 'fail --> q'],
				highlight: ['q'],
				note: 'Le résultat est une **liste courte de questions**, avec les bloquantes marquées. Cinq questions précises valent mieux que trente commentaires.'
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
			'Commence par ce qui est bien, et dis-le. La KEP nomme elle-même son plus gros risque : le trafic peut aller vers un pod déclaré Ready alors qu’il n’est plus en bonne santé. Beaucoup de design docs n’écrivent jamais leurs inconvénients.',
			'Le template fait la moitié de la relecture pour toi. Il pose des questions sur le rollback, le décalage de versions, les métriques et les modes de défaillance. **Les réponses vides, c’est là que vont tes questions.** Ici, les deux questions de Troubleshooting sont vides.',
			`Lis le design au pied de la lettre. La [ligne 119](${KEP}/README.md#L119) dit que le kubelet récupérera le champ \`Started\` « via l’API server » après un redémarrage. La question de la ligne 368, et si l’API server est en panne, n’a pas encore de réponse.`,
			`[Lis toute la KEP](${KEP}/README.md) avant l’exercice. Elle fait moins de 400 lignes, dont une bonne partie de commentaires du template. Environ 10 minutes.`
		]
	},
	tradeoff: {
		gain: [
			'Les portes à sens unique sont repérées tant qu’elles sont encore du texte, pas un comportement en production.',
			'Les questions laissent l’auteur maître de son design et t’apportent le contexte qui te manquait.',
			'La relecture elle-même devient une trace de ce qui a été envisagé.'
		],
		cost: [
			'Une bonne relecture demande une heure de lecture attentive. Elle entre en concurrence avec ton propre travail.',
			'Relire un doc rate ce que seul le code révèle. Certaines questions n’apparaissent que dans la PR.',
			'Trop de questions enterrent les importantes. Marquer « bloquante » n’est pas facultatif.'
		]
	},
	task: {
		prompt: 'Lis la KEP-4781. Écris **une question par angle** : un scénario qu’elle abîme, une porte à sens unique, un mode de défaillance. Indique laquelle, s’il y en a une, devrait bloquer l’acceptation.',
		hint: 'Compare la ligne 115 (ce que fait le feature gate par défaut) avec la ligne 201 (ce qu’il faut pour passer en GA). Puis lis la ligne 119 à côté de la ligne 368, et la ligne 249.',
		answer: [
			'**Scénario.** Une appli se bloque pendant que le kubelet est arrêté. La ligne 125 dit que son statut est corrigé « au prochain cycle de probe ». Vu la période et le seuil d’échec de la probe, combien de temps un pod cassé pendant le redémarrage peut-il continuer à recevoir du trafic ? Le doc devrait-il indiquer le pire cas ?',
			'**Porte à sens unique.** Ligne 115 : le nouveau comportement est activé par défaut dès la première release, et le gate ne sert qu’à rétablir l’ancien. Ligne 201 : pour la GA, il suffit de « aucun problème signalé par les utilisateurs ». Une fois le gate retiré, l’ancien comportement disparaît pour tout le monde. Quelle preuve, au-delà du silence, permet de passer en GA ?',
			'**Mode de défaillance.** Ligne 119 : après un redémarrage, le kubelet récupère `Started` depuis l’API server. La ligne 368 demande ce qui se passe si l’API server est indisponible, et elle est vide. Est-ce que le kubelet revient à l’ancienne remise à zéro, ou garde un statut périmé ?',
			'**Bloquante.** La question du mode de défaillance, avec la ligne 249 : « Quelles métriques précises devraient déclencher un rollback ? » est à `N/A`. Un changement de comportement par défaut qui oriente le trafic a besoin d’un repli connu et d’un signal pour faire un rollback. Je demanderais les deux avant qu’elle passe implementable.',
			'Non bloquante, mais à poser : la ligne 147 utilise une tolérance de 10 secondes pour le décalage d’horloge. Que se passe-t-il sur un nœud dont l’horloge est décalée de plus que ça ?'
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
			why: 'D’autres composants et des utilisateurs construisent sur le comportement de la readiness. Une fois que l’ancien comportement ne peut plus être réactivé, le changer à nouveau demande une nouvelle proposition et une nouvelle migration. Le reste est interne et peu coûteux à changer.'
		}
	],
	takeaway: 'Relis pour les scénarios, les portes à sens unique et les modes de défaillance. Pose des questions, marque les bloquantes, laisse tomber le style.',
	sources: [
		{ title: 'KEP-4781, Restarting kubelet does not change pod status (provisional)', url: `${KEP}/README.md` },
		{ title: 'KEP-4781, kep.yaml (status and feature gate)', url: `${KEP}/kep.yaml` },
		{ title: 'Kubernetes v1.35.0, ChangeContainerStatusOnKubeletRestart feature gate', url: 'https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/features/kube_features.go#L1189-L1192' },
		{ title: 'Kubernetes enhancements, KEP template', url: 'https://github.com/kubernetes/enhancements/blob/6ebe0a94771723b3f27cb4a757f0cc22f29e38a2/keps/NNNN-kep-template/README.md' },
		{ title: 'Malte Ubl, Design Docs at Google', url: 'https://www.industrialempathy.com/posts/design-docs-at-google/' }
	]
};
