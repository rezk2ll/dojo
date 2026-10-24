const CB = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const GUIDE = `${CB}/capabilities/summarization/guide.ipynb`;
const BEST = 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices';
const CW = 'https://platform.claude.com/docs/en/build-with-claude/context-windows';
const CIT = 'https://platform.claude.com/docs/en/build-with-claude/citations';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'long-documents',
	part: 'Écrire un prompt',
	title: 'Travailler avec de longs documents',
	minutes: 10,
	hook: [
		'Tu colles trois contrats de sous-location dans un seul prompt. Ta question vient en premier, « Quel est le loyer mensuel de chaque contrat ? », puis les trois documents. La réponse donne deux loyers et affirme que le troisième contrat n’en indique pas. Il en indique un, dans une clause au milieu du deuxième document.',
		'La doc sur les fenêtres de contexte nomme l’effet : "As token count grows, accuracy and recall degrade, a phenomenon known as *context rot*." Les trois contrats tiennent dans la fenêtre, et le modèle peut quand même rater une clause au milieu.'
	],
	terms: [
		{ term: 'Context rot', def: 'La baisse de précision et de rappel quand le nombre de tokens dans le contexte augmente, nommée dans la doc sur les fenêtres de contexte.' },
		{ term: 'Extraction de citations', def: 'Demander au modèle de recopier d’abord les passages utiles dans des balises `<quotes>`, puis de répondre à partir de ces citations.' },
		{ term: 'Découpage', def: 'Couper un long texte en morceaux et envoyer chaque morceau dans sa propre requête. Le cookbook coupe tous les 2 000 caractères.' },
		{ term: 'Citations', def: 'Une fonction de l’API activée par `citations.enabled=true` sur chaque bloc document. Chaque affirmation de la réponse revient avec le passage qui l’appuie.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['docs["Haut du tour user : les documents, chacun avec source et document_content"] --> ask["Bas : la question et les consignes"]'],
				highlight: ['docs', 'ask'],
				note: 'À partir de 20k tokens, la doc demande de placer les longs documents "near the top of your prompt, above your query, instructions, and examples." Elle ajoute : "Queries at the end can improve response quality by up to 30 percent in tests".'
			},
			{
				add: ['ask --> quotes["Étape 1 : recopier les passages utiles dans des balises quotes"]'],
				highlight: ['quotes'],
				note: 'L’exemple de la doc demande : "Find quotes from the patient records and appointment history that are relevant to diagnosing the patient\'s reported symptoms. Place these in <quotes> tags." Selon la doc, cela "helps Claude focus on the relevant content and ignore the rest of the document."'
			},
			{
				add: ['quotes --> answer["Étape 2 : répondre à partir des citations, dans des balises info"]'],
				highlight: ['answer'],
				note: 'La seconde moitié de la même consigne : "Then, based on these quotes, list all information that would help the doctor diagnose". Tu peux vérifier chaque ligne de la réponse contre une citation au-dessus.'
			},
			{
				add: ['count{"Nombre de tokens sous la fenêtre de contexte ?"} -->|"oui"| docs', 'count -->|"non"| chunk["Découpage : résumer chaque morceau, puis combiner les résumés"]'],
				highlight: ['count', 'chunk'],
				note: 'Opus 5.5, Sonnet 5.5 et Haiku 5.5 ont une fenêtre de 1M tokens. Sur Haiku 5.5, les prompts de plus de 100 000 tokens coûtent plus cher. Une entrée qui dépasse la fenêtre reçoit un 400 "prompt is too long". L’API de comptage de tokens te le dit avant l’envoi.'
			}
		]
	},
	example: {
		title: 'capabilities/summarization/guide.ipynb : découper, résumer chaque morceau, combiner',
		repo: 'anthropics/claude-cookbooks',
		url: `${GUIDE}?plain=1#L777-L831`,
		lang: 'python',
		code: `def chunk_text(text, chunk_size=2000):
    return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]


def summarize_long_document(text, max_tokens=2000):
    chunks = chunk_text(text)

    # Iterate over chunks and summarize each one
    # We use guided_legal_summary here, but you can use basic_summarize or any other summarization function
    # Note that we'll also use haiku for the interim summaries, and the 3.5 sonnet for the final summary
    chunk_summaries = [
        guided_sublease_summary(chunk, model="claude-haiku-4-5", max_tokens=max_tokens)
        for chunk in chunks
    ]

    final_summary_prompt = f"""

    You are looking at the chunked summaries of multiple documents that are all related. Combine the following summaries of the document from different truthful sources into a coherent overall summary:

    {"".join(chunk_summaries)}
…
    Summary:
    """

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=max_tokens,
        system="You are a legal expert that summarizes notes on one document.",
        messages=[
            {"role": "user", "content": final_summary_prompt},
            {
                "role": "assistant",
                "content": "Here is the summary of the legal document: <summary>",
            },
        ],
        stop_sequences=["</summary>"],
    )

    return response.content[0].text`,
		notes: [
			'La ligne 2 tranche le texte tous les 2 000 caractères avec `text[i : i + chunk_size]`. La coupe ignore les phrases : une clause de loyer peut tomber pour moitié dans un morceau et pour moitié dans le suivant.',
			'Les lignes 11 à 14 résument chaque morceau avec `claude-haiku-4-5`. L’appel final ne voit que `"".join(chunk_summaries)`. Un loyer qu’un résumé de morceau a omis ne peut pas revenir dans le résumé final.',
			'La liste `messages` se termine par un tour assistant, "Here is the summary of the legal document: <summary>", et `stop_sequences=["</summary>"]` arrête la réponse à la balise fermante. Le modèle est censé prolonger ce texte assistant partiel : c’est un prefill. La page des bonnes pratiques : à partir des modèles Claude 4.6, "Requests with prefilled assistant messages to these models return a 400 error", et `claude-sonnet-4-6` en fait partie.',
			'Sans prefill, écris "Write the summary inside <summary> tags" dans le tour user et lis le texte entre les balises (jour 12), ou passe par les sorties structurées (jour 14).'
		]
	},
	tradeoff: {
		gain: [
			'Une seule requête, avec tous les documents en haut et la question à la fin, permet au modèle de comparer directement les trois contrats. La doc a mesuré des réponses meilleures "up to 30 percent" avec la question en dernier.',
			'Les citations d’abord te donnent un contrôle : chaque affirmation de la réponse doit correspondre à un passage de `<quotes>`. Avec la fonction citations, l’API renvoie elle-même le passage et sa position.',
			'Le découpage traite une entrée plus grande que la fenêtre, par exemple une pile de contrats au-delà de 1M tokens.'
		],
		cost: [
			'Un long prompt coûte des tokens d’entrée à chaque requête. Sur Haiku 5.5, les prompts de plus de 100 000 tokens sont facturés à un tarif plus élevé.',
			'Plus de tokens en contexte, c’est plus de context rot : la doc précise que "more context isn\'t automatically better".',
			'Un découpage fixe à 2 000 caractères coupe des clauses, et un résumé de résumés ne garde que ce que chaque premier résumé a gardé.',
			'Les citations ajoutent un peu d’entrée : "system prompt additions and document chunking". Le champ `cited_text` ne compte pas dans les tokens de sortie.'
		]
	},
	task: {
		prompt: 'Réécris la requête de l’introduction pour Sonnet 5.5 : trois contrats, `lease_a.txt`, `lease_b.txt` et `lease_c.txt`, et la question « Quel est le loyer mensuel de chaque contrat ? ». Donne la disposition du tour user, la consigne, et dis comment tu vérifierais que la réponse pour le contrat B n’est pas inventée.',
		hint: 'Reprends les noms de balises que la doc utilise pour plusieurs documents, déplace la question, et demande les citations avant la réponse.',
		answer: [
			'En haut du tour user : `<documents>` avec trois blocs `<document index="n">`, chacun avec `<source>lease_a.txt</source>` et le texte dans `<document_content>`.',
			'Après les documents : "Find the clauses that state the monthly rent in each lease and copy them into <quotes> tags, with the source file. Then give the rent per lease in <answer> tags. If a lease states no rent, say so."',
			'Pour vérifier le contrat B : cherche la citation recopiée dans `lease_b.txt`. Si elle n’y est pas mot pour mot, la réponse n’est pas fondée sur le texte. Avec `citations.enabled=true` sur des documents texte, l’API renvoie des indices de caractères dans le document, et ton code peut vérifier le passage lui-même.',
			'Avant l’envoi, passe la requête à l’API de comptage de tokens. Si le total est sous la fenêtre de 1M tokens de Sonnet 5.5, envoie une seule requête, sans découpage.'
		],
		steps: [
			{
				title: 'Dispose les contrats',
				questions: [
					{ q: 'Quelle balise regroupe les trois contrats ?', options: ['`<quotes>`', '`<documents>`', '`<answer>`', '`<leases>`'], answer: 1, why: 'La doc montre `<documents>` contenant un `<document index="n">` par fichier.' },
					{ q: 'Que mets-tu dans `<source>` pour le deuxième contrat ?', options: ['Le loyer que tu attends', 'L’indice `2`', '`lease_b.txt`', 'Tout le texte du contrat'], answer: 2, why: '`<source>` contient le nom du fichier, pour que le modèle et toi distinguiez les contrats.' },
					{ q: 'Les trois contrats tiennent dans la fenêtre. Le modèle peut-il quand même rater la clause de loyer au milieu du contrat B ?', options: ['Oui : la précision et le rappel baissent quand le nombre de tokens augmente', 'Non : tout ce qui est dans la fenêtre est lu aussi bien', 'Seulement si les contrats sont des PDF', 'Seulement sur Haiku 5.5'], answer: 0, why: 'La doc des fenêtres de contexte appelle ça le context rot : "As token count grows, accuracy and recall degrade". C’est pour ça que la disposition et les citations comptent.' },
					{ q: 'À partir de quelle taille d’entrée la doc donne-t-elle ce conseil de disposition des longs documents ?', options: ['Seulement au-delà de la fenêtre de 1M tokens', 'À partir de 100 000 tokens', 'Pour tout prompt, même d’une ligne', 'À partir de 20k tokens'], answer: 3, why: 'Les conseils sur les longs contextes visent les entrées de 20k tokens et plus, ce que trois contrats complets peuvent atteindre.' }
				]
			},
			{
				title: 'Demande les citations, puis le loyer',
				questions: [
					{ q: 'Après les citations, dans quelle balise la consigne demande-t-elle les loyers ?', options: ['`<answer>`, un loyer par contrat', '`<quotes>`, à côté des clauses', '`<document_content>`', '`<source>`'], answer: 0, why: 'La consigne demande d’abord les citations, puis le loyer de chaque contrat dans des balises `<answer>` : ton code distingue ainsi les preuves du résultat.' },
					{ q: 'Que demande la consigne en premier ?', options: ['Un résumé de chaque contrat', 'Le loyer de chaque contrat dans des balises `<answer>`', 'Les clauses de loyer recopiées dans des balises `<quotes>`, avec le fichier source', 'Le nombre de clauses de chaque contrat'], answer: 2, why: 'D’abord les citations, puis la réponse tirée de ces citations.' },
					{ q: 'Pourquoi demander le fichier source à côté de chaque clause recopiée ?', options: ['L’API refuse les citations sans nom de fichier', 'Pour savoir dans quel fichier chercher chaque citation', 'Ça réduit les tokens d’entrée de la requête', 'Ça active la fonction citations'], answer: 1, why: 'Trois contrats peuvent avoir des clauses proches. Avec `lease_b.txt` à côté de la citation, tu cherches dans le bon fichier quand tu vérifies le contrat B.' },
					{ q: 'Un contrat peut ne pas indiquer de loyer. Que dit la consigne ?', options: ['Donne le loyer du contrat le plus proche', 'Laisse ce contrat hors de la réponse', 'Écris 0 pour ce contrat', 'Si un contrat n’indique pas de loyer, dis-le'], answer: 3, why: 'Une porte de sortie explicite évite que le modèle comble le vide avec un chiffre inventé.' }
				]
			},
			{
				title: 'Vérifie le contrat B',
				questions: [
					{ q: 'Comment vérifies-tu le loyer que le modèle donne pour le contrat B ?', options: ['Chercher la citation recopiée dans `lease_b.txt`', 'Demander au modèle s’il est sûr', 'Le comparer aux loyers de A et C', 'Renvoyer la même requête'], answer: 0, why: 'La citation est une affirmation sur le fichier. Le fichier peut la confirmer.' },
					{ q: 'La citation n’est pas mot pour mot dans `lease_b.txt`. Qu’est-ce que ça t’apprend ?', options: ['Le fichier a un problème d’encodage', 'La réponse pour le contrat B n’est pas fondée sur le texte', 'Le loyer est juste, seule la formulation change', 'Le contrat B n’indique pas de loyer'], answer: 1, why: 'Une citation absente de la source n’appuie pas la réponse.' },
					{ q: 'Avec `citations.enabled=true` sur des documents texte, que renvoie l’API ?', options: ['Un score pour chaque affirmation', 'Seulement le nom de fichier de chaque source', 'Des indices de caractères dans le document', 'Une copie de tout le document'], answer: 2, why: 'Ton code peut alors vérifier lui-même le passage cité.' },
					{ q: 'Le champ `cited_text` s’ajoute-t-il à tes tokens de sortie ?', options: ['Oui, il les double', 'Oui, au tarif de l’entrée', 'Seulement sur Haiku 5.5', 'Non, il ne compte pas dans les tokens de sortie'], answer: 3, why: 'Les citations ajoutent un peu d’entrée, mais `cited_text` ne compte pas dans les tokens de sortie.' }
				]
			},
			{
				title: 'Décide du découpage',
				questions: [
					{ q: 'Que lances-tu avant l’envoi ?', options: ['Une première requête avec un seul contrat', 'L’API de comptage de tokens sur la requête', 'Un comptage de mots des trois fichiers', 'Le `chunk_text` du cookbook'], answer: 1, why: 'L’API de comptage de tokens te donne la taille avant l’envoi.' },
					{ q: 'Quelle est la taille de la fenêtre de contexte de Sonnet 5.5 ?', options: ['1M tokens', '100 000 tokens', '200 000 caractères', '2 000 caractères'], answer: 0, why: 'Opus 5.5, Sonnet 5.5 et Haiku 5.5 ont une fenêtre de 1M tokens.' },
					{ q: 'Le total est sous la fenêtre. Que fais-tu ?', options: ['Découper quand même, par prudence', 'Envoyer un contrat par requête', 'Résumer d’abord chaque contrat', 'Envoyer une seule requête, sans découpage'], answer: 3, why: 'Une seule requête permet au modèle de comparer directement les trois contrats.' },
					{ q: 'Pourquoi éviter ici le découpage du cookbook en morceaux de 2 000 caractères ?', options: ['Le découpage coûte plus de tokens de sortie', 'Les coupes ignorent les phrases, et un résumé de résumés ne garde que ce que chaque premier résumé a gardé', 'Les morceaux doivent aller à `claude-haiku-4-5`', 'Le découpage ne marche que sur les PDF'], answer: 1, why: 'Une clause de loyer peut être coupée en deux, et un chiffre oublié par un résumé de morceau ne revient pas.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu envoies 40k tokens de rapports et une question. Où la doc dit-elle de placer la question ?',
			options: [
				'En haut, avant les rapports, pour que le modèle sache quoi chercher',
				'À la fin, après les rapports, sous les documents et les exemples',
				'Dans le prompt système, pendant que les rapports vont dans le tour user',
				'Répétée avant et après chaque rapport, pour qu’elle reste en vue'
			],
			answer: 1,
			why: 'À partir de 20k tokens, la doc place les longs documents "near the top of your prompt, above your query, instructions, and examples." La question à la fin a amélioré la qualité des réponses "by up to 30 percent in tests".'
		},
		{
			q: '`summarize_long_document` du cookbook envoie à `claude-sonnet-4-6` un message assistant qui finit par `<summary>`. Que se passe-t-il ?',
			options: [
				'Le modèle continue après `<summary>` et s’arrête à `</summary>`',
				'L’API ignore le message assistant et ne répond qu’au tour user',
				'Le modèle répète le texte du prefill, puis écrit le résumé',
				'L’API renvoie une erreur 400, car les modèles 4.6 refusent le prefill'
			],
			answer: 3,
			why: 'La page des bonnes pratiques : à partir des modèles Claude 4.6, les réponses pré-remplies sur le dernier tour assistant "are no longer supported" et renvoient une erreur 400. Le commentaire du notebook parle encore de "the 3.5 sonnet for the final summary", alors que l’appel nomme `claude-sonnet-4-6`.'
		},
		{
			q: 'Pourquoi demander au modèle de recopier des citations dans `<quotes>` avant de répondre sur un long document ?',
			options: [
				'Les citations remplacent le document, donc la requête coûte moins de tokens d’entrée',
				'Le cache de prompt ne fonctionne que sur du texte placé dans des balises `<quotes>`',
				'Le modèle se concentre sur les passages utiles, et tu peux vérifier la réponse avec eux',
				'L’API renvoie une erreur 400 pour un long document envoyé sans aucune citation'
			],
			answer: 2,
			why: 'Selon la doc, citer d’abord "helps Claude focus on the relevant content and ignore the rest of the document". Le document part quand même en entier, donc le coût d’entrée ne baisse pas. Les citations te donnent aussi un texte à chercher dans la source.'
		}
	],
	recall: {
		q: 'Pour un prompt de 40k tokens avec trois documents, où vont les documents, où va la question, et qu’écrit le modèle en premier ?',
		a: 'Les documents en haut, chacun dans `<document>` avec `<source>` et `<document_content>`. La question à la fin, où la doc a mesuré jusqu’à 30 % de réponses meilleures. Le modèle recopie d’abord les passages utiles dans `<quotes>`.'
	},
	sources: [
		{ title: 'Claude docs, Prompting best practices : Long context prompting, lu le 2026-10-17', url: `${BEST}#long-context-prompting` },
		{ title: 'Claude docs, Prompting best practices : Migrating away from prefilled responses, lu le 2026-10-17', url: `${BEST}#migrating-away-from-prefilled-responses` },
		{ title: 'Claude docs, Context windows, lu le 2026-10-17', url: CW },
		{ title: 'Claude docs, Citations, lu le 2026-10-17', url: CIT },
		{ title: 'anthropics/claude-cookbooks, capabilities/summarization/guide.ipynb', url: GUIDE }
	]
};
