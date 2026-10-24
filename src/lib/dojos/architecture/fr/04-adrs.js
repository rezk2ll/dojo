const BACKSTAGE = 'https://github.com/backstage/backstage/blob/b717df252896a9e12b0bca1f84cfe453ecba3283';
const ADRS = `${BACKSTAGE}/docs/architecture-decisions`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'adrs',
	part: 'Penser en architecte',
	title: 'Les ADR : écrire le pourquoi d’une décision',
	minutes: 10,
	hook: [
		'Backstage est un portail développeur open source fait de nombreux plugins. Imagine un nouveau venu qui ouvre un plugin qui importe `node-fetch`, puis un autre qui appelle le `fetch` intégré. Lequel a raison ? Si la réponse n’est que dans un fil de revue, il va deviner, et le plugin suivant prendra peut-être une troisième bibliothèque.',
		'La deuxième loi de l’architecture logicielle : **le pourquoi compte plus que le comment**. N’importe qui lit le comment dans le code. Le pourquoi ne reste que si quelqu’un écrit la décision.',
		'Un Architecture Decision Record (ADR) contient une décision sur une page. Backstage les range dans `docs/architecture-decisions`, numérotés, à côté du code. Deux d’entre eux répondent au nouveau venu, et montrent comment une décision change tout en gardant son historique lisible.'
	],
	terms: [
		{ term: 'ADR', def: 'Architecture Decision Record (registre de décision d’architecture) : un fichier court avec Titre, Statut, Contexte, Décision et Conséquences (Michael Nygard, 2011).' },
		{ term: 'Conséquences', def: 'Tout ce qui découle de la décision, le bon **et** le mauvais. Si tu n’as listé aucun inconvénient, cherche encore (première loi).' },
		{ term: 'Superseded (remplacé)', def: 'Le statut d’un ADR qu’un ADR plus récent a remplacé. Tu ne modifies jamais un ADR accepté pour changer la décision : tu en écris un nouveau et tu relies les deux.' },
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
				note: 'À la fin de la revue, l’ADR est Accepté ou Rejeté. ADR013 a été accepté en décembre 2021 : les paquets backend doivent utiliser le paquet `node-fetch`.'
			},
			{
				add: ['accepted -->|le contexte a changé| superseded["ADR013 marqué remplacé"]', 'adr14["ADR014, nov. 2024 : fetch natif"] -.->|remplace| superseded'],
				highlight: ['superseded', 'adr14'],
				note: 'Backstage a relevé son minimum à Node.js 20, où le `fetch` intégré marche sans option. Backstage a laissé la décision d’ADR013 telle quelle et a écrit **ADR014**. ADR013 commence maintenant par « Cet ADR a été remplacé par ADR014 et ne s’applique plus. » Les deux restent lisibles.'
			},
			{
				add: ['inplace["Premier commit : modifier ADR013 sur place"] -.->|même pull request| adr14'],
				highlight: ['inplace'],
				note: 'Backstage aussi a d’abord modifié sur place. Dans la pull request qui a créé ADR014, le premier commit réécrivait directement la Décision d’ADR013. Un commit suivant, dans la même pull request, a déplacé le changement dans un nouveau record, comme le demande la règle du projet : « Les records ne sont jamais supprimés, mais peuvent être marqués comme remplacés. »'
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
			'Les lignes 1 à 9, le Contexte, disent ce qui a changé depuis ADR013, sans plaider : un nouveau minimum Node.js, un `fetch` natif stable, des problèmes connus avec les anciennes bibliothèques. Comme le contexte a changé, un nouvel ADR se justifie.',
			'Les lignes 11 à 15, la Décision, sont des phrases complètes à la voix active, comme le demande le [template](https://github.com/backstage/backstage/blob/b717df252896a9e12b0bca1f84cfe453ecba3283/docs/architecture-decisions/adr000-template.md?plain=1#L9-L22). Le template vient du billet de blog de Nygard de 2011 et dit « toutes les conséquences doivent être listées ici », les négatives aussi.',
			'Les lignes 17 à 20 ouvrent les Conséquences, et la section en liste une négative. Son dernier paragraphe prévient que `msw` 1.x [n’intercepte pas correctement le fetch natif](https://github.com/backstage/backstage/blob/b717df252896a9e12b0bca1f84cfe453ecba3283/docs/architecture-decisions/adr014-use-fetch.md?plain=1#L79), donc certains tests vont échouer et devront être réécrits.',
			'Aucun des deux records n’a de section **Alternatives envisagées**, qui liste les options écartées et leur raison. ADR013 cite `axios` et `got` comme paquets à abandonner, sans dire pourquoi ils ont perdu. Un nouveau venu qui demande « pourquoi pas `axios` ? » doit encore aller poser la question.'
		]
	},
	tradeoff: {
		gain: [
			'Le pourquoi reste dans le dépôt après le départ de ses auteurs, et les relecteurs peuvent discuter le raisonnement écrit.',
			'Écrire les conséquences t’oblige à chercher l’inconvénient avant de livrer, comme les tests `msw` cassés.',
			'Un ADR remplacé garde l’historique : un lecteur voit ce qui a été décidé en 2021, ce qui a changé, et ce qui tient maintenant.'
		],
		cost: [
			'Presque deux ans après ADR014, le [plugin backend Kubernetes](https://github.com/backstage/backstage/blob/b717df252896a9e12b0bca1f84cfe453ecba3283/plugins/kubernetes-backend/src/service/KubernetesConnection.ts#L24) importe toujours `node-fetch`, car le record demande seulement d’abandonner « progressivement ».',
			'Si tu en écris un pour chaque petit choix, les choix importants se perdent dans la masse. Réserve les ADR aux décisions coûteuses à changer.'
		]
	},
	task: {
		prompt: 'Écris ADR014 sous forme de **Y-statement** (une phrase). Tout ce qu’il te faut est dans l’extrait et le diagramme.',
		hint: 'Dans le contexte de… (quel code), face à… (ce qui a changé), nous avons choisi… et écarté… (l’ancienne option), pour obtenir… (le gain), en acceptant… (le coût).',
		answer: [
			'Dans le contexte du code Backstage qui tourne dans Node.js et fait des appels HTTP,',
			'face à un minimum Node.js 20 avec un `fetch` natif intégré, et à des problèmes avec les bibliothèques tierces sur les versions récentes de Node.js,',
			'nous avons choisi le `fetch` natif partout dans Node.js et écarté le maintien de `node-fetch` que demandait ADR013,',
			'pour obtenir un seul `fetch`, sans paquet supplémentaire à tenir à jour,',
			'en acceptant que les tests basés sur `msw` 1.x puissent ne plus intercepter le trafic et doivent être réécrits pour `msw` 2.x.'
		],
		steps: [
			{
				title: 'Pose le contexte',
				questions: [
					{ q: '« Dans le contexte de… » nomme quel code ?', options: ['Tous les plugins Backstage, frontend compris', 'Le code Backstage qui tourne dans Node.js et fait des appels HTTP', 'Le dossier des ADR de Backstage', 'La bibliothèque de test `msw`'], answer: 1, why: 'La Décision porte sur le code exécuté dans Node.js, backend et CLI, qui récupère des données en HTTP.' },
					{ q: '« Face à… » nomme ce qui a changé. Qu’est-ce qui a changé ?', options: ['Une faille de sécurité trouvée dans `axios` et `got`', 'Un vote de l’équipe pour abandonner TypeScript dans les plugins', 'La fin du support de `msw` 1.x dans Backstage', 'Un minimum Node.js 20 avec un `fetch` natif, et des problèmes avec les bibliothèques tierces'], answer: 3, why: 'Le Contexte liste le nouveau minimum Node.js, un `fetch` natif stable, et des problèmes connus avec les anciennes bibliothèques.' },
					{ q: 'Où trouves-tu dans ADR014 ce qui a changé ?', options: ['Dans la section Contexte', 'Dans la section Décision', 'Dans la section Conséquences', 'Dans la ligne Statut'], answer: 0, why: 'Le Contexte dit ce qui a changé depuis ADR013, sans plaider.' },
					{ q: 'Pourquoi écrire ADR014 au lieu de modifier ADR013 ?', options: ['ADR013 avait plus de deux ans', 'Seul l’auteur d’origine peut modifier un ADR', 'Les records acceptés ne sont jamais supprimés, seulement marqués remplacés', 'Modifier un ADR change son numéro'], answer: 2, why: 'La règle du projet garde l’historique : un lecteur voit encore la décision de 2021 et ce qui l’a remplacée.' }
				]
			},
			{
				title: 'Nomme le choix et l’option écartée',
				questions: [
					{ q: 'Que mets-tu après « nous avons choisi… » ?', options: ['Le `fetch` natif partout dans Node.js', '`node-fetch` dans chaque paquet backend', '`axios` dans chaque plugin', 'Un wrapper de fetch écrit pour chaque plugin'], answer: 0, why: 'Tout le code qui tourne dans Node.js doit utiliser le `fetch` natif.' },
					{ q: 'Que mets-tu après « et écarté… » ?', options: ['`axios`, parce qu’il a perdu un benchmark', 'Le maintien de `node-fetch`, que demandait ADR013', 'Le `fetch` natif sur les anciens Node.js', 'La bibliothèque de test `msw`'], answer: 1, why: 'L’ancienne option est celle que recommandait ADR013.' },
					{ q: 'Quel type TypeScript la Décision demande-t-elle là où un `fetch` peut être injecté ?', options: ['`NodeFetch`', '`RequestInit`', '`typeof fetch`', '`Response`'], answer: 2, why: 'La Décision nomme `typeof fetch` comme type dans le code qui injecte un `fetch` ou y fait référence.' },
					{ q: 'Un nouveau venu demande « pourquoi pas `axios` ? ». Que lui dit ADR014 ?', options: ['Que `axios` est trop lent', 'Que `axios` casse les tests `msw`', 'Que `axios` ne tourne pas sur Node.js 20', 'Rien : aucun des deux records n’a de section Alternatives envisagées'], answer: 3, why: 'ADR013 cite `axios` et `got` comme paquets à abandonner, mais aucun record ne dit pourquoi ils ont perdu.' }
				]
			},
			{
				title: 'Nomme le gain',
				questions: [
					{ q: 'Que mets-tu après « pour obtenir… » ?', options: ['Des appels HTTP plus rapides dans chaque plugin', 'Un seul `fetch`, sans paquet supplémentaire à tenir à jour', 'Des tests qui n’échouent plus jamais', 'Le support des anciennes versions de Node.js'], answer: 1, why: 'Le `fetch` natif est livré avec Node.js, donc il n’y a plus de paquet tiers à maintenir.' },
					{ q: 'Lequel est un gain, et pas un coût ?', options: ['Plus de paquet fetch tiers à tenir à jour', 'Certains tests `msw` 1.x doivent être réécrits', 'Le plugin Kubernetes importe toujours `node-fetch`', 'Les plugins n’abandonnent l’ancien paquet que progressivement'], answer: 0, why: 'Les trois autres sont des prix payés pour le changement.' },
					{ q: 'Abandonner les paquets fetch tiers règle aussi quel problème du Contexte ?', options: ['Le démarrage lent du backend', 'Les plugins écrits en JavaScript simple', 'Les problèmes avec les bibliothèques tierces sur les versions récentes de Node.js', 'Les collisions de numéros entre ADR'], answer: 2, why: 'Le Contexte renvoie vers des problèmes de bibliothèques tierces apparus seulement sur les Node.js récents.' },
					{ q: 'Où va le gain dans le Y-statement ?', options: ['Après « face à »', 'Après « dans le contexte de »', 'Après « en acceptant »', 'Après « pour obtenir »'], answer: 3, why: 'Le modèle se lit : nous avons choisi… et écarté…, pour obtenir…, en acceptant….' }
				]
			},
			{
				title: 'Nomme le coût',
				questions: [
					{ q: 'Que mets-tu après « en acceptant… » ?', options: ['Que Node.js 20 est maintenant le minimum', 'Qu’ADR013 est supprimé', 'Que les tests basés sur `msw` 1.x puissent ne plus intercepter le trafic et doivent être réécrits pour `msw` 2.x', 'Que tous les plugins doivent changer le même jour'], answer: 2, why: 'Les Conséquences préviennent que `msw` 1.x n’intercepte pas correctement le fetch natif. Le minimum Node.js, c’est du contexte, pas un coût.' },
					{ q: 'Où ce coût est-il écrit dans ADR014 ?', options: ['Dans le Contexte', 'Dans les Conséquences', 'Dans la Décision', 'Dans le Titre'], answer: 1, why: 'Les Conséquences contiennent le bon et le mauvais qui découlent de la décision.' },
					{ q: 'Ta phrase n’a rien après « en acceptant ». Que te dit la première loi ?', options: ['Tu n’as pas encore trouvé l’inconvénient', 'La décision ne coûte rien', 'L’ADR est complet', 'Le coût va dans un autre ADR'], answer: 0, why: 'Tout, en architecture, est un compromis. Si tu n’as listé aucun inconvénient, cherche encore.' },
					{ q: 'Quel coût de l’abandon « progressif » se voit dans le code ?', options: ['Tous les plugins backend ont cassé le jour du merge d’ADR014', 'ADR013 a été supprimé par erreur', 'Le `fetch` natif a échoué sur Node.js 20', 'Le plugin backend Kubernetes importe toujours `node-fetch` presque deux ans après'], answer: 3, why: 'Un record qui demande seulement un abandon progressif laisse l’ancien code en place.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un an après l’acceptation d’un ADR, l’équipe change la décision. Qu’arrive-t-il à l’ancien ADR ?',
			options: ['On modifie sa section Décision pour coller au nouveau choix', 'On écrit un nouvel ADR et on marque l’ancien « remplacé »', 'On le supprime, le code fait foi', 'On ajoute un commentaire dans le code qui l’utilisait'],
			answer: 1,
			why: 'Les ADR acceptés gardent l’historique. Tu les remplaces, pour que les lecteurs voient à la fois ce qui a été décidé et pourquoi ça a changé. L’ADR013 de Backstage commence par une note qui renvoie vers ADR014.'
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
	recall: {
		q: 'Backstage est passé de `node-fetch` au `fetch` natif. Qu’a-t-il fait d’ADR013, et pourquoi ?',
		a: 'Il a écrit ADR014 et marqué ADR013 comme remplacé, sans toucher à la décision d’ADR013. Les records acceptés ne sont jamais supprimés : un lecteur voit encore la décision de 2021, ce qui a changé (Node.js 20) et ce qui tient maintenant.'
	},
	sources: [
		{ title: 'Backstage ADR014, Proper use of HTTP fetching libraries', url: `${ADRS}/adr014-use-fetch.md` },
		{ title: 'Backstage ADR013 (superseded), the node-fetch decision', url: `${ADRS}/adr013-use-node-fetch.md` },
		{ title: 'Backstage, ADR overview: creating and superseding', url: `${ADRS}/index.md?plain=1#L12-L37` },
		{ title: 'Michael Nygard, Documenting Architecture Decisions (2011)', url: 'https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions' },
		{ title: 'adr.github.io, ADR templates including the Y-statement', url: 'https://adr.github.io/adr-templates/' }
	]
};
