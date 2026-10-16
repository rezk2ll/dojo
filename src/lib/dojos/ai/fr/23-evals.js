const COOK = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5/capabilities/classification/evaluation';
const DOCS = 'https://platform.claude.com/docs/en/test-and-evaluate/develop-tests';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'evals',
	part: 'Outils et agents',
	title: 'Tester un prompt',
	minutes: 10,
	hook: [
		'Ton prompt range des tickets de support d’assurance dans 10 catégories. Un ticket sur un prélèvement contesté atterrit dans Billing Inquiries au lieu de Billing Disputes. Tu ajoutes une phrase au prompt, tu colles ce ticket et deux autres, et les trois reviennent justes.',
		'Tu mets le nouveau prompt en production. Personne ne vérifie les autres catégories, et une semaine plus tard les tickets Claims Disputes partent dans Claims Assistance. Trois tickets collés à la main ne peuvent pas te montrer qu’un changement a réparé une catégorie et en a cassé une autre.',
		'Une **éval** fait passer le même jeu fixe de tickets dans chaque version du prompt et donne un score à chaque version.'
	],
	terms: [
		{ term: 'Éval', def: 'Un jeu fixe d’entrées de test, la réponse attendue pour chacune, et un correcteur qui transforme les réponses du modèle en un score comparable d’une version du prompt à l’autre.' },
		{ term: 'Réponse de référence', def: 'La sortie attendue pour une entrée de test, écrite par une personne avant le run, comme le label `Billing Disputes` pour un ticket.' },
		{ term: 'Notation par code', def: 'Un programme vérifie chaque réponse, par exemple `output == golden_answer` ou `key_phrase in output`, et rend le même verdict pour la même réponse à chaque fois.' },
		{ term: 'Notation par LLM', def: 'Un second appel au modèle lit la réponse et une grille, puis rend un verdict comme « correct » ou « incorrect ». Il sait juger du texte libre que le code ne peut pas vérifier.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['goal["Critère de succès : un nombre vérifiable"]'],
				highlight: ['goal'],
				note: 'La doc commence par écrire le succès sous forme de nombre. Elle remplace "The model should classify sentiments well" par "an F1 score of at least 0.85" sur "a held-out test set of 10,000 diverse Twitter posts". Pour le routeur de tickets, le critère peut être un nombre minimum de labels justes sur le jeu de test.'
			},
			{
				add: ['goal --> set[("dataset.csv : 68 tickets, chacun avec son label attendu")]'],
				highlight: ['set'],
				note: 'Le jeu de test du cookbook compte 68 tickets répartis sur les 10 catégories, de 5 à 9 par catégorie. Chaque ligne contient le texte du ticket, son label et une assertion comme `contains:Billing Inquiries`. La doc demande d’ajouter aussi des cas limites, comme "Irrelevant or nonexistent input data" et "Overly long input data".'
			},
			{
				add: ['set --> run["Run : 3 prompts x 5 températures x 68 tickets = 1 020 appels"]'],
				highlight: ['run'],
				note: 'L’outil d’éval envoie chaque ticket à travers chaque prompt et chaque réglage du modèle. La config du cookbook liste 3 versions du prompt et 5 températures du même modèle, donc un run fait 1 020 appels à l’API.'
			},
			{
				add: ['run --> grade{"Noter chaque réponse"}', 'grade -->|"label entre balises"| code["Code : le texte contient-il le label attendu ?"]', 'grade -.->|"réponse en texte libre"| llm["Modèle correcteur avec une grille"]'],
				highlight: ['code', 'llm'],
				note: 'Un label de catégorie se vérifie par code, que la doc place en premier : "Fastest and most reliable, extremely scalable". Une réponse libre, comme un brouillon de réponse au client, demande un modèle correcteur avec une grille. La doc : "Test to ensure reliability first then scale."'
			},
			{
				add: ['code --> score["Score par version du prompt, enregistré dans results.csv"]', 'llm --> score', 'score -->|"prochain changement du prompt"| run'],
				highlight: ['score'],
				note: 'Chaque version du prompt reçoit un score, et le run écrit chaque ligne dans `results.csv`. Au prochain changement du prompt, tu relances les mêmes 68 tickets. Si les lignes Claims Disputes qui passaient la dernière fois échouent, l’éval te montre la régression avant tes utilisateurs.'
			}
		]
	},
	example: {
		title: 'claude-cookbooks : la config promptfoo de l’éval du classifieur de tickets',
		repo: 'anthropics/claude-cookbooks',
		url: `${COOK}/promptfooconfig.yaml#L1-L57`,
		lang: 'yaml',
		code: `description: 'Classification'

# Prompts defined in the prompts.py file
prompts: 
  - prompts.py:simple_classify
  - prompts.py:rag_classify
  - prompts.py:rag_chain_of_thought_classify

providers:
  - id: anthropic:messages:claude-haiku-4-5
    label: "Haiku: T-0.0"
    config:
      max_tokens: 4096
      temperature: 0
  - id: anthropic:messages:claude-haiku-4-5
    label: "Haiku: T-0.2"
    config:
      max_tokens: 4096
      temperature: 0.2
  - id: anthropic:messages:claude-haiku-4-5
    label: "Haiku: T-0.4"
    config:
      max_tokens: 4096
      temperature: 0.4
  - id: anthropic:messages:claude-haiku-4-5
    label: "Haiku: T-0.6"
    config:
      max_tokens: 4096
      temperature: 0.6
  - id: anthropic:messages:claude-haiku-4-5
    label: "Haiku: T-0.8"
    config:
      max_tokens: 4096
      temperature: 0.8
      

# Read more about why we use defaultTest here: https://www.promptfoo.dev/docs/configuration/guide/#tools-and-functions:~:text=Use-,defaultTest,-apply%20a%20transform
defaultTest:
  options:
    transform: file://transform.py
  assert:
  - type: icontains-any
    value:
      - 'Billing Inquiries'
      - 'Policy Administration'
      - 'Claims Assistance'
      - 'Coverage Explanations'
      - 'Quotes and Proposals'
      - 'Account Management'
      - 'Billing Disputes'
      - 'Claims Disputes'
      - 'Policy Comparisons'
      - 'General Inquiries'

tests: dataset.csv

outputPath: ../data/results.csv`,
		notes: [
			'Les lignes 4 à 7 chargent 3 versions du prompt depuis `prompts.py` : une simple, une avec 5 tickets proches récupérés comme exemples, et une qui demande en plus de raisonner d’abord. Les deux premières finissent par "Respond with just the label of the category between category tags." La troisième demande le raisonnement dans des balises `<scratchpad>` avant la balise `<category>`.',
			'Les lignes 9 à 34 font tourner le même modèle aux températures 0, 0.2, 0.4, 0.6 et 0.8. L’éval te montre alors si la température change le score, au lieu de le deviner.',
			'La ligne 40 passe chaque réponse dans `transform.py` avant la notation : il ne garde que le texte entre `<category>` et `</category>`. Les lignes 42 à 53 vérifient ensuite que ce texte est l’un des 10 labels valides. La [doc de promptfoo](https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/) définit `icontains-any` ainsi : "output contains any of the listed substrings, case insensitive".',
			'La ligne 55 charge les 68 lignes de test. Chaque ligne a une colonne `__expected`, comme `contains:Billing Inquiries`, donc une ligne ne passe que si le label extrait est le bon. Toute cette notation est du code, sans second appel au modèle.'
		]
	},
	tradeoff: {
		gain: [
			'Après chaque changement du prompt, `npx promptfoo@latest eval` relance les 1 020 vérifications en une commande et affiche le résultat de chaque ligne.',
			'La notation par code ne coûte aucun appel d’API en plus et rend le même verdict à chaque run, donc un changement de score vient des réponses du modèle et jamais du correcteur.',
			'La doc préfère le volume : "More questions with slightly lower signal automated grading is better than fewer questions with high-quality human hand-graded evals."'
		],
		cost: [
			'Chaque run paie tous ses appels : 1 020 ici, et un modèle correcteur ajoute un appel par réponse notée.',
			'L’éval ne couvre que les tickets du fichier. Avec 5 tickets Quotes and Proposals, une seule erreur fait bouger cette catégorie de 20 points.',
			'Un modèle correcteur peut rendre un verdict faux, alors tu compares ses verdicts à un échantillon noté à la main avant de te fier à son score.'
		]
	},
	task: {
		prompt: 'Une collègue ajoute une 4e version du prompt dans `prompts.py` et la liste sous `prompts:`. Combien d’appels à l’API fait un run maintenant ? Écris ensuite 2 nouvelles lignes de test pour des cas limites de la liste de la doc, avec la valeur `__expected` de chacune, et dis quel correcteur tu prendrais si l’éval devait aussi vérifier un brouillon de réponse au client.',
		hint: 'Un run fait un appel par prompt, par provider et par ligne. Pour les lignes, regarde la liste des cas limites de la doc : entrée hors sujet et entrée ambiguë.',
		answer: [
			'4 prompts x 5 températures x 68 tickets = 1 360 appels, contre 1 020 avant. Chaque nouvelle version du prompt ajoute 340 appels à chaque run.',
			'Entrée hors sujet : un ticket « What time does your office open on Saturday? », avec `__expected` à `contains:General Inquiries`, la catégorie des "Questions about company contact information or hours of operation".',
			'Entrée ambiguë : « You charged me twice and I want the second charge removed », avec `contains:Billing Disputes`. Écris le label avant le run, et si deux personnes de l’équipe ne sont pas d’accord, note-le : la doc range parmi les cas limites ceux "where even humans would find it hard to reach an assessment consensus".',
			'Un brouillon de réponse n’a pas de chaîne juste unique, donc le code ne peut pas le noter. Prends un modèle correcteur avec une grille qui rend « correct » ou « incorrect », par exemple l’assertion `llm-rubric` de promptfoo, et vérifie d’abord ses verdicts sur 20 réponses que tu as notées à la main.'
		]
	},
	quiz: [
		{
			q: 'Ton éval vérifie que le modèle a rendu l’un des 10 labels de catégorie. Quelle notation la doc te dit-elle de choisir ?',
			options: [
				'Une notation humaine, car une personne voit les labels qu’un programme raterait',
				'Un modèle correcteur, car il comprend de quoi parle le ticket',
				'Du code qui vérifie le label, car c’est le plus rapide et le plus fiable',
				'Aucune notation, car la température 0 donne toujours le même label'
			],
			answer: 2,
			why: 'La doc place la notation par code en premier pour les réponses de forme fixe, avec une égalité exacte ou une recherche de chaîne. Un modèle correcteur sert aux réponses qui demandent du jugement, comme une réponse libre. La notation humaine est la plus lente, et la doc dit "Avoid if possible."'
		},
		{
			q: 'Tu peux te payer soit 50 tickets notés par un expert métier, soit 1 000 tickets notés par une recherche de chaîne. Que disent les principes de conception d’une éval ?',
			options: [
				'Prends les 50 notés par l’expert, car une seule note fausse gâche le score',
				'Prends les 1 000 notés automatiquement, car le volume passe d’abord',
				'Ni l’un ni l’autre, car une éval demande au moins 10 000 cas pour compter',
				'Prends les 50 et copie chacun 20 fois pour atteindre le même volume'
			],
			answer: 1,
			why: 'Le troisième principe est "Prioritize volume over quality" : plus de questions notées automatiquement valent mieux que moins de questions notées à la main. Des copies du même ticket ajoutent des appels, mais aucun cas nouveau.'
		},
		{
			q: 'Dans la config du cookbook, le `__expected` d’une ligne vaut `contains:Billing Disputes`. Qu’ajoute la vérification `icontains-any` de `defaultTest` par-dessus ?',
			options: [
				'Elle vérifie que chaque réponse est l’un des 10 labels, sans tenir compte de la casse',
				'Elle relance chaque ligne en échec avec une température plus haute',
				'Elle demande à un second modèle si le label colle au ticket',
				'Elle remplace la vérification des lignes qui n’ont pas de `__expected`'
			],
			answer: 0,
			why: '`defaultTest` s’applique à toutes les lignes. Son assertion `icontains-any` passe quand le texte extrait contient l’un des labels listés, sans tenir compte de la casse, donc un label inventé échoue. Le `__expected` de la ligne vérifie ensuite que c’est le bon label.'
		}
	],
	recall: {
		q: 'Dans l’éval du classifieur de tickets du cookbook, combien y a-t-il de tickets de test, et comment chaque réponse est-elle notée ?',
		a: '68 tickets dans `dataset.csv`. Du code extrait le texte entre les balises `<category>` et le compare au label attendu de la ligne, comme `contains:Billing Inquiries`, sans modèle correcteur.'
	},
	sources: [
		{ title: 'Doc de l’API Claude, Define success criteria and build evaluations, lue le 2026-10-17', url: DOCS },
		{ title: 'claude-cookbooks, éval de classification : promptfooconfig.yaml', url: `${COOK}/promptfooconfig.yaml` },
		{ title: 'claude-cookbooks, éval de classification : dataset.csv', url: `${COOK}/dataset.csv` },
		{ title: 'Doc de promptfoo, Deterministic assertions, lue le 2026-10-17', url: 'https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/' },
		{ title: 'Doc de promptfoo, Test cases, lue le 2026-10-17', url: 'https://www.promptfoo.dev/docs/configuration/test-cases/' }
	]
};
