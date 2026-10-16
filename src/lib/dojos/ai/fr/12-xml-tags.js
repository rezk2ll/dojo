const CB = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const CLS = `${CB}/capabilities/classification/evaluation`;
const BEST = 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'xml-tags',
	part: 'Écrire un prompt',
	title: 'Structurer un prompt avec des balises XML',
	minutes: 10,
	hook: [
		'Ton classeur de tickets envoie un prompt fait de quatre morceaux collés bout à bout : les règles, dix descriptions de catégories, cinq anciens tickets avec leur étiquette, et le ticket du jour. Rien n’indique où un morceau finit et où le suivant commence.',
		'La réponse étiquette un des anciens tickets, ou elle répond directement au client. Ton code attendait une étiquette, comme `Billing Disputes`, et reçoit un paragraphe.'
	],
	terms: [
		{ term: 'Balise XML', def: 'Un nom entre chevrons placé autour d’un bloc de texte, comme `<ticket>` et `</ticket>`. Le modèle lit ce nom comme l’étiquette du bloc.' },
		{ term: 'Imbrication', def: 'Des balises dans des balises : chaque `<example>` dans un seul bloc `<examples>`, ou chaque `<document index="n">` dans `<documents>`.' },
		{ term: 'Balise de sortie', def: 'Une balise dans laquelle tu demandes au modèle de mettre sa réponse, pour que ton code la retrouve en cherchant cette balise.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['rules["Consigne : classer un ticket de support dans une de ces catégories"] --> cats["bloc categories : 10 entrées, chacune une étiquette et une description"]'],
				highlight: ['rules', 'cats'],
				note: 'Le classeur du cookbook commence par une phrase de consigne, puis les dix catégories dans `<categories>`. Chaque entrée est une `<category>` avec un `<label>` et un `<content>`.'
			},
			{
				add: ['cats --> ticket["bloc ticket : le texte du client aujourd’hui"]'],
				highlight: ['ticket'],
				note: 'Le texte du jour va dans `<ticket>`. La doc explique pourquoi une balise par type de contenu : envelopper chaque type "in its own tag (for example, `<instructions>`, `<context>`, `<input>`) reduces misinterpretation" (moins de contresens).'
			},
			{
				add: ['ticket --> ex["bloc examples : 5 anciens tickets tirés de la base vectorielle, chacun une requête et une étiquette"]'],
				highlight: ['ex'],
				note: 'Les cinq anciens tickets les plus proches sont chacun dans un `<example>`, tous dans `<examples>`. La doc demande exactement cela, "so Claude can distinguish them from instructions."'
			},
			{
				add: ['ex --> reply["Réponse : balises category autour de Billing Disputes"]', 'reply --> parse["transform.py : découpe sur la balise category"]'],
				highlight: ['reply', 'parse'],
				note: 'Le prompt se termine par "Respond with just the label of the category between category tags." Ensuite `transform.py` ne garde que le texte entre `<category>` et `</category>` et le passe au test.'
			}
		]
	},
	example: {
		title: 'capabilities/classification/evaluation/prompts.py : rag_classify, une balise par partie',
		repo: 'anthropics/claude-cookbooks',
		url: `${CLS}/prompts.py#L83-L121`,
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
			'La ligne 3 demande à la base vectorielle les 5 anciens tickets les plus proches de celui-ci. La boucle des lignes 5 à 15 met chacun dans un `<example>`, avec l’ancien texte dans `<query>` et sa réponse connue dans `<label>`.',
			'Les trois appels `.replace` de la fin remplissent `{{categories}}`, `{{ticket}}` et `{{examples}}`. Le texte de consigne ne bouge pas : seuls les blocs balisés changent d’un ticket à l’autre.',
			'La dernière ligne du prompt nomme la balise de sortie. [transform.py](' + CLS + '/transform.py#L1-L6) exécute ensuite `output.split("<category>")[1].split("</category>")[0].strip()`. Si la réponse n’a pas de `<category>`, le `[1]` lève une exception et le `except` renvoie la réponse entière.',
			'`prompts.py` n’échappe pas le texte du ticket. Un ticket qui contient la chaîne `</ticket>` ajoute une seconde balise fermante au prompt, et le texte qui suit se retrouve hors du bloc.'
		]
	},
	tradeoff: {
		gain: [
			'Le modèle reçoit un nom pour chaque bloc : il distingue les cinq tickets `<example>` du `<ticket>` qu’il doit étiqueter.',
			'Une balise de sortie ramène l’analyse de la réponse à une ligne de Python dans `transform.py`, avec un repli quand la balise manque.',
			'`rag_classify` reprend mot pour mot la consigne de `simple_classify` et ajoute un bloc `<examples>`. Tu ajoutes ou retires un bloc sans réécrire le reste.'
		],
		cost: [
			'Les dix catégories portent 60 balises : une ouvrante et une fermante pour `<category>`, `<label>` et `<content>`. Tu paies ces tokens à chaque ticket.',
			'`prompts.py` n’échappe pas le texte du ticket. Un client qui tape `</ticket>` ou `<category>` dans son ticket envoie ces chaînes telles quelles dans ton prompt (le jour 16 montre ce qu’un attaquant en fait).'
		]
	},
	task: {
		prompt: 'Le même cookbook contient un résumeur, `basic_summarize` : "You are a legal analyst known for highly accurate and detailed summaries of legal documents. Summarize the following text in bullet points. Focus on the main ideas and key details:" puis `{text}`, puis "Here is the summary of the legal document: <summary>". Réécris-le avec des balises pour que le document, la consigne et la réponse soient faciles à repérer.',
		hint: 'Trois changements : une balise autour de `{text}`, la place du document par rapport à la consigne, et une balise où le modèle met sa réponse.',
		answer: [
			'Enveloppe le document : `<document><source>sublease.txt</source><document_content>{text}</document_content></document>`. Ce sont les noms de balises que la doc utilise pour les documents.',
			'Mets le bloc document en premier et la consigne après. La doc place les longs documents "near the top of your prompt, above your query, instructions, and examples."',
			'Termine par une consigne comme "Write the summary inside <summary> tags.", puis lis le texte entre `<summary>` et `</summary>`. L’original finit sur un `<summary>` ouvert dans le texte user et ne demande jamais la balise fermante que ton code chercherait.',
			'La phrase de rôle sur l’analyste juridique peut rester dans le prompt système (jour 11).'
		]
	},
	quiz: [
		{
			q: 'Dans `rag_classify`, pourquoi chacun des 5 tickets récupérés est-il dans une balise `<example>` à l’intérieur de `<examples>` ?',
			options: [
				'L’API Messages refuse un prompt qui contient plus d’un bloc de texte sans balise',
				'Pour que le modèle distingue les anciens tickets de la consigne et du ticket du jour',
				'Les balises coûtent moins de tokens que le même texte écrit en paragraphes',
				'Le modèle ne lit que le texte entre balises et ignore le reste du prompt'
			],
			answer: 1,
			why: 'La doc demande des exemples dans `<example>` à l’intérieur de `<examples>` "so Claude can distinguish them from instructions". Les balises sont du texte qui nomme chaque bloc. L’API accepte n’importe quel texte, et la consigne hors balises est lue elle aussi.'
		},
		{
			q: 'Le modèle répond « C’est un remboursement. Billing Disputes », sans balise. Que renvoie `transform.py` ?',
			options: [
				'La chaîne `Billing Disputes`, trouvée en comparant chacun des dix noms de catégorie',
				'Une chaîne vide, car rien ne se trouve entre une balise ouvrante et une fermante',
				'La réponse entière, après avoir affiché "Error in get_transform"',
				'Rien : l’`IndexError` remonte et l’évaluation s’arrête sur ce ticket'
			],
			answer: 2,
			why: '`output.split("<category>")` renvoie une liste d’un seul élément, donc `[1]` lève une `IndexError`. Le `except` affiche l’erreur et renvoie `output` tel quel.'
		},
		{
			q: 'Tu envoies trois rapports dans un seul prompt. Quelle disposition correspond à la structure montrée par la doc ?',
			options: [
				'Un `<document index="n">` par rapport, avec `<source>` et `<document_content>` dedans',
				'Les trois rapports collés à la suite, chacun commençant par une ligne de tirets',
				'Une balise `<documents>` qui contient les trois rapports fondus en un seul texte',
				'Chaque rapport dans son propre message user, sans balise ni nom de fichier'
			],
			answer: 0,
			why: 'La section sur les contextes longs montre `<documents>` contenant un `<document index="n">` par fichier, avec le nom du fichier dans `<source>` et le texte dans `<document_content>`. Chaque rapport a ainsi son bloc et son nom.'
		}
	],
	recall: {
		q: 'Dans `rag_classify` du cookbook, quelles balises contiennent le ticket, les anciens exemples et la réponse ?',
		a: '`<ticket>` contient le texte du jour, `<examples>` contient 5 blocs `<example>` avec `<query>` et `<label>`, et le modèle répond dans `<category>`, que `transform.py` extrait avec `split`.'
	},
	sources: [
		{ title: 'Claude docs, Prompting best practices : Structure prompts with XML tags, lu le 2026-10-17', url: `${BEST}#structure-prompts-with-xml-tags` },
		{ title: 'Claude docs, Prompting best practices : Long context prompting, lu le 2026-10-17', url: `${BEST}#long-context-prompting` },
		{ title: 'anthropics/claude-cookbooks, prompts.py de la classification', url: `${CLS}/prompts.py` },
		{ title: 'anthropics/claude-cookbooks, transform.py de la classification', url: `${CLS}/transform.py` },
		{ title: 'anthropics/claude-cookbooks, prompts.py du résumé', url: `${CB}/capabilities/summarization/evaluation/prompts.py#L1-L11` }
	]
};
