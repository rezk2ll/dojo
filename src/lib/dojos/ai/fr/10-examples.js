const COOK = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'examples',
	part: 'Écrire un prompt',
	title: 'Montrer des exemples',
	minutes: 10,
	hook: [
		'Un cookbook Claude construit un classifieur de tickets de support pour une assurance : 10 catégories, chacune définie en trois lignes, et Claude Haiku 4.5 à température 0. Sur 68 tickets de test, il en classe 74 % correctement. Aucun des 7 tickets « General Inquiries » ne finit dans sa catégorie.',
		'La version suivante ajoute une seule chose au prompt : les 5 tickets étiquetés les plus proches de celui à classer. **La précision passe de 74 % à 94 %, et 5 des 7 tickets « General Inquiries » arrivent au bon endroit.**'
	],
	terms: [
		{ term: 'Few-shot prompting', def: 'Mettre dans le prompt quelques exemples résolus de la tâche, chacun avec une entrée et la sortie attendue. La doc d’Anthropic dit aussi multishot prompting.' },
		{ term: 'Exemples récupérés', def: 'Des exemples choisis pour chaque entrée au moment de la requête, en cherchant dans un jeu étiqueté les entrées les plus proches.' },
		{ term: 'Biais de l’étiquette majoritaire', def: 'La tendance d’un modèle à répondre avec l’étiquette qui revient le plus souvent dans les exemples du prompt.' },
		{ term: 'Biais de récence', def: 'La tendance d’un modèle à répéter les réponses des exemples placés en dernier dans le prompt.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['zero["Prompt : 10 définitions de catégories + le ticket"] -->|"Haiku 4.5, 68 tickets"| r1["74 % de bonnes réponses, General Inquiries 0 sur 7"]'],
				highlight: ['zero', 'r1'],
				note: 'Avec les seules définitions, le modèle doit rapprocher chaque ticket d’une description écrite. « This charge seems wrong » et « I have a question about my bill » collent tous les deux à deux définitions qui parlent de factures. Le cookbook dit que la confusion entre catégories proches "suggests Claude needs more context".'
			},
			{
				add: ['ex["exemples : texte du ticket + son étiquette, dans des balises example"] --> zero'],
				highlight: ['ex'],
				note: 'La doc : les exemples sont "one of the most reliable ways to steer Claude\'s output format, tone, and structure". Elle les veut pertinents, variés et entourés de balises `<example>` "so Claude can distinguish them from instructions". Elle en conseille 3 à 5.'
			},
			{
				add: ['train[("68 tickets d’entraînement étiquetés, en embeddings")] -->|"les 5 plus proches en similarité cosinus"| ex', 'zero --> r2["94 % de bonnes réponses, General Inquiries 5 sur 7"]'],
				highlight: ['train', 'r2'],
				note: 'Le cookbook choisit de nouveaux exemples pour chaque ticket. Il calcule les embeddings des 68 tickets d’entraînement et, pour chaque nouveau ticket, trouve "the 5 most similar training examples based on cosine similarity" (jour 4). Chaque prompt montre les étiquettes de tickets qui ressemblent à celui à classer.'
			},
			{
				add: ['bad["4 exemples : Positive, Positive, Positive, Negative"] -->|"GPT-3 2.7B, étude de 2021"| r3["près de 90 % de réponses Negative"]'],
				highlight: ['bad', 'r3'],
				note: 'Des exemples peuvent aussi tirer la réponse vers une étiquette. Dans l’étude « Calibrate Before Use », 3 exemples Positive suivis d’un Negative ont fait répondre Negative à un modèle de 2.7B près de 90 % du temps. Le dernier exemple a pesé plus lourd que les trois autres : le biais de récence l’a emporté sur le biais de l’étiquette majoritaire.'
			},
			{
				add: ['r3 --> fix["Équilibrer les étiquettes, varier l’ordre, relancer le jeu d’évaluation"]'],
				highlight: ['fix'],
				note: 'La même étude a vu la précision d’une tâche de sentiment aller de 54 % à 93 % rien qu’en réordonnant les mêmes exemples. La doc d’Anthropic demande des exemples qui "vary enough that Claude doesn\'t pick up unintended patterns". Teste chaque jeu d’exemples sur tout ton jeu d’évaluation (jour 7) : une seule entrée ne montre pas un biais.'
			}
		]
	},
	example: {
		title: 'capabilities/classification/evaluation/prompts.py : rag_classify, 5 exemples récupérés par ticket',
		repo: 'anthropics/claude-cookbooks',
		url: `${COOK}/capabilities/classification/evaluation/prompts.py#L83-L121`,
		lang: 'python',
		code: `def rag_classify(context: dict):
    X = context["vars"]["text"]
    rag = vectordb.search(X, 5)
    rag_string = ""
    for example in rag:
        rag_string += textwrap.dedent(f"""
        <example>
            <query>
                "{example["metadata"]["text"]}"
            </query>
            <label>
                {example["metadata"]["label"]}
            </label>
        </example>
        """)
    prompt = (
        textwrap.dedent("""
    You will classify a customer support ticket into one of the following categories:
    <categories>
        {{categories}}
    </categories>

    Here is the customer support ticket:
    <ticket>
        {{ticket}}
    </ticket>

    Use the following examples to help you classify the query:
    <examples>
        {{examples}}
    </examples>

    Respond with just the label of the category between category tags.
    """)
        .replace("{{categories}}", categories)
        .replace("{{ticket}}", X)
        .replace("{{examples}}", rag_string)
    )
    return prompt`,
		notes: [
			'La ligne 3 demande à la base vectorielle les 5 tickets d’entraînement les plus proches du nouveau ticket `X`. Les exemples changent à chaque ticket : une réclamation sur une facture reçoit des exemples de factures.',
			'Les lignes 7 à 14 entourent chaque exemple de `<example>`, avec le texte du ticket dans `<query>` et la réponse dans `<label>`. Le modèle voit la même forme pour chaque exemple, et les balises séparent le texte des exemples des instructions.',
			'Les lignes 29 à 31 placent les cinq dans `<examples>`, après le ticket. La ligne 33 demande "just the label", et les exemples montrent à quoi ressemble une étiquette.',
			'Le [notebook du guide](' + COOK + '/capabilities/classification/guide.ipynb) lance les mêmes prompts sur 68 tickets de test avec Claude Haiku 4.5 : 74 % de précision sans exemples, 94 % avec cette fonction.'
		]
	},
	tradeoff: {
		gain: [
			'Sur les 68 tickets de test du cookbook, 5 exemples récupérés ont fait passer la précision de 74 % à 94 %, sans changer de modèle.',
			'Les exemples récupérés collent à chaque entrée : une catégorie rare comme « General Inquiries » reçoit ses propres exemples quand un ticket lui ressemble.',
			'Les exemples montrent la forme de sortie : le modèle répond par une étiquette nue que ton code peut lire.'
		],
		cost: [
			'Chaque appel transporte 5 tickets complets avec leurs balises en entrée, en plus des 10 définitions de catégories.',
			'Il faut un jeu étiqueté où chercher (68 tickets ici) et un service d’embeddings. Le cookbook signale la limite de VoyageAI à "3RPM for accounts without an associated credit card".',
			'Des exemples déséquilibrés ou mal ordonnés tirent les réponses vers une étiquette : près de 90 % de Negative avec 3 exemples Positive et 1 Negative dans l’étude de 2021.'
		]
	},
	task: {
		prompt: 'Ton prompt de tri de tickets a 4 exemples fixes, dans cet ordre : `feature`, `feature`, `feature`, `bug`. Sur ton jeu d’évaluation de 100 tickets, 60 sont des bugs, et le modèle en étiquette 85 en `bug`. Explique ce qui s’est probablement passé, puis écris le changement que tu testerais et comment tu le mesurerais.',
		hint: 'Regarde quelle étiquette vient en dernier, et combien de fois chaque étiquette apparaît dans les exemples par rapport au jeu d’évaluation.',
		answer: [
			'Le dernier exemple est un `bug`, et le modèle en prédit trop : 85 réponses `bug` pour 60 vrais bugs. Ça correspond au biais de récence, celui que l’étude de 2021 a vu avec Positive, Positive, Positive, Negative.',
			'Teste un jeu équilibré : 2 exemples `bug` et 2 `feature`, puis change l’ordre plusieurs fois (par exemple `bug`, `feature`, `bug`, `feature` et l’inverse). Choisis des exemples de longueurs et de formulations différentes, comme le demande la doc.',
			'Lance chaque version sur les mêmes 100 tickets et note la précision et le nombre de réponses `bug`. Une bonne version donne près de 60 réponses `bug`, et sa précision bouge peu quand tu mélanges l’ordre.',
			'Si le jeu fixe échoue encore, récupère pour chaque entrée les 4 tickets étiquetés les plus proches, comme `rag_classify` le fait avec 5.'
		],
		steps: [
			{
				title: 'Lis les chiffres',
				questions: [
					{ q: 'Combien de réponses `bug` un modèle parfait donnerait-il sur ce jeu d’évaluation ?', options: ['60', '85', '25', '100'], answer: 0, why: '60 des 100 tickets sont des bugs.' },
					{ q: 'De combien le modèle prédit-il trop de `bug` ?', options: ['15 tickets', '25 tickets', '40 tickets', '85 tickets'], answer: 1, why: '85 réponses `bug` pour 60 vrais bugs : 25 de trop.' },
					{ q: 'Combien des 4 exemples sont des `bug`, et où ?', options: ['3, les trois premiers', '2, au milieu', '1, le dernier', 'Aucun'], answer: 2, why: 'L’ordre est `feature`, `feature`, `feature`, `bug`.' },
					{ q: 'La plupart des exemples sont des `feature`. Vers où le biais de l’étiquette majoritaire pousserait-il les réponses ?', options: ['Vers `feature`', 'Vers `bug`', 'Vers un équilibre', 'Vers des refus'], answer: 0, why: 'Le biais de l’étiquette majoritaire favorise l’étiquette la plus fréquente dans les exemples. Tu vois l’inverse : autre chose l’emporte.' }
				]
			},
			{
				title: 'Nomme le biais',
				questions: [
					{ q: 'Quel biais explique 85 réponses `bug` ?', options: ['Le biais de l’étiquette majoritaire : la plupart des exemples sont des `feature`', 'Du context rot dû à un long prompt', 'Une étiquette hallucinée', 'Le biais de récence : le dernier exemple est un `bug`'], answer: 3, why: 'Le modèle répète la réponse de l’exemple placé en dernier.' },
					{ q: 'Quel résultat de l’étude de 2021 ressemble à ça ?', options: ['Positive, Positive, Positive, Negative a donné près de 90 % de réponses Negative', 'Réordonner les exemples n’a rien changé', 'Plus d’exemples a toujours amélioré la précision', 'Le modèle refusait quand les exemples se contredisaient'], answer: 0, why: 'Même forme : trois d’une étiquette, puis une de l’autre, et la dernière gagne.' },
					{ q: 'Dans cette étude, quel biais l’a emporté ?', options: ['Le biais de l’étiquette majoritaire sur le biais de récence', 'Le biais de récence sur le biais de l’étiquette majoritaire', 'Les deux se sont annulés', 'Aucun n’est apparu avec seulement 4 exemples'], answer: 1, why: 'Le dernier exemple a pesé plus lourd que les trois autres.' },
					{ q: 'Dans la même étude, de combien la précision a-t-elle bougé rien qu’en réordonnant les mêmes exemples ?', options: ['Moins d’un point', 'De 74 % à 94 %', 'De 54 % à 93 %', 'De 85 % à 90 %'], answer: 2, why: 'L’ordre seul peut faire ou défaire un prompt few-shot. 74 % à 94 %, c’est le résultat de la récupération dans le cookbook, pas l’effet de l’ordre.' }
				]
			},
			{
				title: 'Écris le changement',
				questions: [
					{ q: 'Combien de chaque étiquette dans le nouveau jeu ?', options: ['2 `bug` et 2 `feature`', '3 `bug` et 1 `feature`', '4 `feature`', '1 `bug` d’abord, puis 3 `feature`'], answer: 0, why: 'Un jeu équilibré retire l’attrait de l’étiquette majoritaire.' },
					{ q: 'Quel ordre testes-tu ?', options: ['Seulement `feature`, `feature`, `bug`, `bug`', 'Seulement le premier ordre que tu écris', '`bug` en dernier, puisque les bugs sont majoritaires', 'Plusieurs, comme `bug`, `feature`, `bug`, `feature` et l’inverse'], answer: 3, why: 'Un seul ordre ne montre pas un effet de récence. Comparer quelques ordres, si.' },
					{ q: 'À quoi doivent ressembler les exemples ?', options: ['Tous de même longueur et de même formulation', 'Différents en longueur et en formulation', 'Copiés du jeu d’évaluation', 'Aussi courts que possible'], answer: 1, why: 'La doc demande des exemples qui "vary enough that Claude doesn\'t pick up unintended patterns".' },
					{ q: 'Comment marques-tu les exemples dans le prompt ?', options: ['En liste à puces au milieu des consignes', 'En majuscules', 'Dans des balises `<example>`', 'Après la question finale, sans balises'], answer: 2, why: 'Les balises permettent à Claude de "distinguish them from instructions".' }
				]
			},
			{
				title: 'Mesure-le',
				questions: [
					{ q: 'Sur quoi lances-tu chaque version ?', options: ['Les mêmes 100 tickets', 'Un nouveau jeu au hasard à chaque fois', 'Un seul ticket difficile', 'Les 4 exemples eux-mêmes'], answer: 0, why: 'Le même jeu d’évaluation rend les versions comparables. Une seule entrée ne montre pas un biais.' },
					{ q: 'Quels deux chiffres notes-tu pour chaque version ?', options: ['La latence et le coût', 'La précision et le nombre de réponses `bug`', 'La longueur du prompt et celle de la sortie', 'Le nombre d’exemples et la température'], answer: 1, why: 'La précision dit si c’est bon. Le nombre de `bug` montre si le biais a disparu.' },
					{ q: 'Que montre une bonne version ?', options: ['85 réponses `bug`, comme avant', '100 réponses `bug`', 'Exactement 50 réponses `bug`', 'Près de 60 réponses `bug`, et une précision qui bouge à peine quand tu mélanges l’ordre'], answer: 3, why: 'La vraie part de bugs est 60. Une précision stable d’un ordre à l’autre veut dire que l’ordre ne dicte plus la réponse.' },
					{ q: 'Le jeu fixe échoue encore. Qu’essaies-tu ensuite ?', options: ['Ajouter 20 exemples `bug` de plus', 'Retirer tous les exemples', 'Récupérer pour chaque entrée les 4 tickets étiquetés les plus proches', 'Monter la température'], answer: 2, why: 'Les exemples récupérés collent à chaque entrée, comme `rag_classify` avec 5. C’est ce qui a fait passer le cookbook de 74 % à 94 %.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Dans le classifieur du cookbook, qu’est-ce qui a fait passer Claude Haiku 4.5 de 74 % à 94 % sur 68 tickets ?',
			options: [
				'Passer de la température 0 à la température 0.8',
				'Ajouter les 5 tickets étiquetés les plus proches en exemples',
				'Réécrire les 10 définitions de catégories plus en détail',
				'Passer de Haiku 4.5 à une gamme de modèle plus grande'
			],
			answer: 1,
			why: '`rag_classify` cherche parmi 68 tickets d’entraînement les 5 plus proches de chaque entrée et les met dans `<examples>` avec leurs étiquettes. Les définitions, le modèle et la température restent ceux de `simple_classify`.'
		},
		{
			q: 'Quatre exemples de sentiment sont rangés Positive, Positive, Positive, Negative. Qu’a trouvé l’étude « Calibrate Before Use » ?',
			options: [
				'Le modèle a répondu Positive environ 75 % du temps, comme les exemples',
				'L’ordre n’avait plus d’effet à partir de 4 exemples',
				'Le modèle a répondu Negative près de 90 % du temps',
				'Le modèle a refusé de répondre quand les exemples divergeaient'
			],
			answer: 2,
			why: 'Le modèle a tendance à répéter les réponses placées vers la fin du prompt (biais de récence). Ici, cette tendance a pesé plus que la majorité de 3 contre 1 des exemples Positive.'
		},
		{
			q: 'Combien d’exemples le guide de prompting d’Anthropic conseille-t-il, et comment les marquer ?',
			options: [
				'Un seul exemple, écrit dans le prompt système',
				'3 à 5 exemples, entourés de balises `<example>`',
				'Au moins 20 exemples, un par ligne, sans balises',
				'Autant qu’il en tient, placés après la question finale'
			],
			answer: 1,
			why: 'Le guide dit d’inclure 3 à 5 exemples "for best results" et de les entourer de balises `<example>`, dans `<examples>` quand il y en a plusieurs, "so Claude can distinguish them from instructions".'
		}
	],
	recall: {
		q: 'Qu’ont changé 5 exemples récupérés dans le classifieur de tickets du cookbook, et que peut faire l’ordre des exemples ?',
		a: 'La précision est passée de 74 % à 94 % sur 68 tickets avec Haiku 4.5. L’ordre compte : Positive, Positive, Positive, Negative a fait répondre Negative à un modèle de 2021 près de 90 % du temps.'
	},
	sources: [
		{ title: 'Doc Claude, Prompting best practices (Use examples effectively), lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices' },
		{ title: 'anthropics/claude-cookbooks, notebook du guide Classification', url: `${COOK}/capabilities/classification/guide.ipynb` },
		{ title: 'Zhao et al. 2021, Calibrate Before Use: Improving Few-Shot Performance of Language Models, lu le 2026-10-17', url: 'https://arxiv.org/abs/2102.09690' }
	]
};
