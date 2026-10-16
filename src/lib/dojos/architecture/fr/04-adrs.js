const BACKSTAGE = 'https://github.com/backstage/backstage/blob/b717df252896a9e12b0bca1f84cfe453ecba3283';
const ADRS = `${BACKSTAGE}/docs/architecture-decisions`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'adrs',
	part: 'Penser en architecte',
	title: 'Écris la décision, avec son pourquoi',
	minutes: 10,
	hook: [
		'Backstage est un portail développeur open source fait de nombreux plugins. Imagine un nouveau venu qui ouvre un plugin qui importe `node-fetch`, puis un autre qui appelle le `fetch` intégré. Lequel a raison ? Si la réponse ne vit que dans un fil de revue, il va deviner, et le code va dériver encore plus.',
		'C’est la deuxième loi en action : **le pourquoi compte plus que le comment**. Le code montre le comment. Seule une décision écrite garde le pourquoi.',
		'L’outil est minuscule : un **Architecture Decision Record**. Une page, une décision. Backstage les range dans `docs/architecture-decisions`, numérotés, à côté du code. Deux d’entre eux répondent au nouveau venu, et montrent comment une décision change sans perdre son historique.'
	],
	terms: [
		{ term: 'ADR', def: 'Architecture Decision Record (registre de décision d’architecture). Un fichier court : Titre, Statut, Contexte, Décision, Conséquences (Michael Nygard, 2011).' },
		{ term: 'Contexte', def: 'Les forces en jeu, écrites de façon neutre. Ce qui est vrai, ce qui pèse sur la décision.' },
		{ term: 'Conséquences', def: 'Tout ce qui découle de la décision, le bon **et** le mauvais. S’il n’y a rien de mauvais, regarde encore (première loi).' },
		{ term: 'Alternatives envisagées', def: 'Les options auxquelles tu as dit non, chacune avec sa raison. Ça évite que la personne suivante les propose à nouveau.' },
		{ term: 'Superseded (remplacé)', def: 'Un ADR plus récent a remplacé celui-ci. Tu ne modifies jamais un ADR accepté pour changer la décision, tu en écris un nouveau et tu les relies.' },
		{ term: 'Y-statement', def: 'Un ADR en une phrase : « Dans le contexte de…, face à…, nous avons choisi… et écarté…, pour obtenir…, en acceptant… »' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['draft["Proposé : une pull request, pas encore de numéro"]'],
				highlight: ['draft'],
				note: 'Un ADR commence à l’état **Proposé** : une question avec une réponse suggérée, ouverte à la revue. Chez Backstage, c’est une pull request créée depuis le template, et le guide dit « n’attribue pas de numéro à l’ADR » tant que les retours ne sont pas arrivés.'
			},
			{
				add: ['draft -->|validé| accepted["Accepté : ADR013, déc. 2021"]', 'draft -->|pas ça| rejected["Rejeté"]'],
				highlight: ['accepted', 'rejected'],
				note: 'Il finit **Accepté** ou **Rejeté**. ADR013 a été écrit en décembre 2021 : les paquets backend doivent utiliser le paquet `node-fetch`.'
			},
			{
				add: ['accepted -->|le contexte a changé| superseded["ADR013 marqué remplacé"]', 'adr14["ADR014, nov. 2024 : fetch natif"] -.->|remplace| superseded'],
				highlight: ['superseded', 'adr14'],
				note: 'Backstage a relevé son minimum à Node.js 20, où le `fetch` intégré marche sans option. Backstage n’a pas réécrit ADR013. Il a écrit **ADR014**, et ADR013 commence maintenant par « Cet ADR a été remplacé par ADR014 et ne s’applique plus. » Les deux restent lisibles.'
			},
			{
				add: ['inplace["Premier commit : modifier ADR013 sur place"] -.->|même pull request| adr14'],
				highlight: ['inplace'],
				note: 'La tentation de modifier sur place est réelle. Dans la pull request qui a créé ADR014, le premier commit réécrivait directement la Décision d’ADR013. Un commit suivant, dans la même pull request, a déplacé le changement dans un nouveau record. La règle du projet a gagné : « Les records ne sont jamais supprimés, mais peuvent être marqués comme remplacés. »'
			}
		]
	},
	example: {
		title: 'docs/architecture-decisions/adr014-use-fetch.md (extrait)',
		repo: 'backstage/backstage',
		url: `${ADRS}/adr014-use-fetch.md?plain=1#L7-L79`,
		lang: 'md',
		code: `## Context

Until now we have been recommending the use of \`node-fetch\` in Node.js contexts
through [ADR013](./adr013-use-node-fetch.md). Since then, Backstage has had its
minimum requirements upgraded to Node.js 20 or newer. The Node.js platform has
established a stable, reliable \`undici\` based native \`fetch\` in these versions.
Additionally, there are [some issues](https://github.com/backstage/backstage/issues/24590)
with using third party libraries that only appeared in newer versions of
Node.js.

## Decision

All code that is executed in Node.js (including backend and CLIs) should use the
native \`fetch\` for HTTP data fetching, and \`typeof fetch\` as the TypeScript type
in code where a \`fetch\` implementation can be injected or is referred to.
…
## Consequences

We will gradually transition away from third party \`fetch\` replacement packages
such as \`node-fetch\` and others on the Node.js platform.
…`,
		notes: [
			'Le **Contexte** dit ce qui a changé depuis la dernière décision, sans plaider : un nouveau minimum Node.js, un `fetch` natif stable, des problèmes connus avec les anciennes bibliothèques. C’est un contexte qui a changé qui rend un nouvel ADR légitime.',
			'La **Décision** est faite de phrases complètes à la voix active, comme le demande le [template](https://github.com/backstage/backstage/blob/b717df252896a9e12b0bca1f84cfe453ecba3283/docs/architecture-decisions/adr000-template.md?plain=1#L9-L22). Le template vient du billet de blog de Nygard de 2011 et dit « toutes les conséquences doivent être listées ici », les négatives aussi.',
			'Les **Conséquences** le font. Leur dernier paragraphe prévient que `msw` 1.x [n’intercepte pas correctement le fetch natif](https://github.com/backstage/backstage/blob/b717df252896a9e12b0bca1f84cfe453ecba3283/docs/architecture-decisions/adr014-use-fetch.md?plain=1#L79), donc certains tests vont échouer et devront être réécrits. C’est le coût, dit à voix haute.',
			'Ce qui manque : une section **Alternatives envisagées**. ADR013 cite `axios` et `got` comme paquets à abandonner, mais aucun des deux records ne dit pourquoi ils ont perdu. Un nouveau venu qui demande « pourquoi pas `axios` ? » doit encore aller poser la question.'
		]
	},
	tradeoff: {
		gain: [
			'Le pourquoi survit aux départs, et les relecteurs discutent du raisonnement, pas de toi.',
			'Écrire les conséquences te force à trouver l’inconvénient avant de livrer, comme les tests `msw` cassés.',
			'Un ADR remplacé garde l’historique : un lecteur voit ce qui a été décidé en 2021, ce qui a changé, et ce qui tient maintenant.'
		],
		cost: [
			'Ça prend du temps que tu préférerais passer à coder.',
			'Une décision sur le papier n’est pas une décision dans le code. Presque deux ans après ADR014, le [plugin backend Kubernetes](https://github.com/backstage/backstage/blob/b717df252896a9e12b0bca1f84cfe453ecba3283/plugins/kubernetes-backend/src/service/KubernetesConnection.ts#L24) importe toujours `node-fetch`. Le record dit « progressivement », et progressivement, c’est lent.',
			'En écrire un pour chaque petit choix enterre les choix importants. Garde-les pour les décisions coûteuses à changer.'
		]
	},
	task: {
		prompt: 'Écris ADR014 sous forme de **Y-statement** (une phrase). Tout ce qu’il te faut est dans l’extrait et le diagramme.',
		hint: 'Dans le contexte de… (quel code), face à… (ce qui a changé), nous avons choisi… et écarté… (l’ancienne option), pour obtenir… (le gain), en acceptant… (le coût).',
		answer: [
			'**Dans le contexte du** code Backstage qui tourne dans Node.js et fait des appels HTTP,',
			'**face à** un minimum Node.js 20 avec un `fetch` natif intégré, et à des problèmes avec les bibliothèques tierces sur les versions récentes de Node.js,',
			'**nous avons choisi** le `fetch` natif partout dans Node.js **et écarté** le maintien de `node-fetch` que demandait ADR013,',
			'**pour obtenir** un seul `fetch`, sans paquet supplémentaire à tenir à jour,',
			'**en acceptant** que les tests basés sur `msw` 1.x puissent ne plus intercepter le trafic et doivent être réécrits pour `msw` 2.x.'
		]
	},
	quiz: [
		{
			q: 'Un an après l’acceptation d’un ADR, l’équipe change la décision. Que devient l’ancien ADR ?',
			options: ['On modifie sa section Décision pour coller au nouveau choix', 'On écrit un nouvel ADR et on marque l’ancien « remplacé »', 'On le supprime, le code fait foi', 'On ajoute un commentaire dans le code qui l’utilisait'],
			answer: 1,
			why: 'Les ADR acceptés forment un historique. Tu les remplaces, pour que les lecteurs voient à la fois ce qui a été décidé et pourquoi ça a changé. L’ADR013 de Backstage commence par une note qui renvoie vers ADR014.'
		},
		{
			q: 'ADR014 prévient que les tests `msw` 1.x peuvent échouer avec le fetch natif. Pourquoi cette ligne a-t-elle sa place dans les Conséquences ?',
			options: ['C’est un bug de `msw` 1.x, donc sa place est dans le gestionnaire de tickets, pas dans l’ADR', 'Elle a sa place dans le Contexte, parce qu’elle décrit un fait vrai avant la décision', 'Elle a sa place dans la Décision, puisqu’elle fait partie du plan de passage au fetch natif', 'Les Conséquences contiennent le bon et le mauvais qui découlent de la décision, et ceci est un prix à payer'],
			answer: 3,
			why: 'Si les Conséquences n’ont aucun inconvénient, la première loi dit que tu ne l’as pas encore trouvé. Le nommer dit aussi à chaque auteur de plugin à quoi s’attendre.'
		},
		{
			q: 'Chez Backstage, quand un nouvel ADR reçoit-il son numéro ?',
			options: ['Dès que le fichier est créé à partir du template, avant toute revue', 'Seulement quand il est remplacé, pour que le nouveau puisse renvoyer vers lui', 'Vers la fin de la revue, une fois que la pull request a recueilli des retours', 'Jamais, les ADR sont nommés par date pour que deux pull requests n’entrent pas en conflit'],
			answer: 2,
			why: 'Le guide dit de copier le template sans attribuer de numéro, de recueillir les retours sur la pull request, et « au bout du compte, d’attribuer un numéro ». Un numéro marque une décision réellement prise.'
		}
	],
	takeaway: 'Une décision, une page : contexte, décision, conséquences. Quand le contexte change, écris un nouveau record et remplace l’ancien.',
	sources: [
		{ title: 'Backstage ADR014, Proper use of HTTP fetching libraries', url: `${ADRS}/adr014-use-fetch.md` },
		{ title: 'Backstage ADR013 (superseded), the node-fetch decision', url: `${ADRS}/adr013-use-node-fetch.md` },
		{ title: 'Backstage, ADR overview: creating and superseding', url: `${ADRS}/index.md?plain=1#L12-L37` },
		{ title: 'Michael Nygard, Documenting Architecture Decisions (2011)', url: 'https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions' },
		{ title: 'adr.github.io, ADR templates including the Y-statement', url: 'https://adr.github.io/adr-templates/' }
	]
};
