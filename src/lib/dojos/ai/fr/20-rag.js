const CB = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5/capabilities/contextual-embeddings';
const LAMBDA = `${CB}/contextual-rag-lambda-function`;
const POST = 'https://www.anthropic.com/news/contextual-retrieval';
const SR = 'https://platform.claude.com/docs/en/build-with-claude/search-results';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'rag',
	part: 'Outils et agents',
	title: 'La génération augmentée par récupération (RAG)',
	minutes: 10,
	hook: [
		'Ta base de connaissances contient des années de rapports SEC, découpés en morceaux de quelques centaines de tokens. Un utilisateur demande "What was the revenue growth for ACME Corp in Q2 2023?". La réponse tient dans un seul morceau : "The company\'s revenue grew by 3% over the previous quarter."',
		'Ce morceau ne nomme ni ACME ni le deuxième trimestre 2023 : ni la recherche par embeddings ni la recherche par mots-clés ne le classe près de la question. **Le modèle répond à partir d’autres morceaux, ou dit qu’il ne sait pas.**'
	],
	terms: [
		{ term: 'RAG', def: 'La définition d’Anthropic : une méthode qui "retrieves relevant information from a knowledge base and appends it to the user\'s prompt", pour que le modèle réponde à partir du texte de tes propres documents.' },
		{ term: 'Chunk (morceau)', def: 'Un bout de document, en général pas plus de quelques centaines de tokens, indexé et retrouvé à part.' },
		{ term: 'BM25', def: 'Une fonction de classement fondée sur TF-IDF, qui note les morceaux selon les mots exacts qu’ils partagent avec la requête. Elle trouve une chaîne comme "TS-999" qu’une recherche par embeddings peut rater.' },
		{ term: 'Contextual Retrieval', def: 'Avant l’indexation, un modèle écrit 50 à 100 tokens qui situent chaque morceau dans son document, et ce texte est placé devant le morceau, pour les embeddings comme pour l’index BM25.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['docs["Base de connaissances : rapports SEC"] --> chunks["Morceaux de quelques centaines de tokens"]'],
				highlight: ['docs', 'chunks'],
				note: 'Si toute la base fait moins de 200 000 tokens (environ 500 pages), l’article d’Anthropic conseille de tout mettre dans le prompt et de se passer de RAG, avec le prompt caching pour réduire le coût (jour 34). Au-delà, tu découpes les documents en morceaux.'
			},
			{
				add: ['chunks --> ctx["Claude écrit 50 à 100 tokens de contexte par morceau"]', 'ctx --> idx[("Index : embeddings + BM25")]'],
				highlight: ['ctx', 'idx'],
				note: 'Claude réécrit le morceau sur la croissance de 3 % en "This chunk is from an SEC filing on ACME corp\'s performance in Q2 2023; the previous quarter\'s revenue was $314 million." suivi du texte d’origine, et les embeddings comme l’index BM25 sont construits à partir de ce texte plus long.'
			},
			{
				add: ['query["Question : croissance du chiffre d’affaires d’ACME, T2 2023"] --> idx', 'idx -->|"top 150"| rerank["Le reranker note chaque morceau face à la question"]'],
				highlight: ['query', 'rerank'],
				note: 'Au moment de la requête, la recherche par embeddings trouve les morceaux proches par le sens (jour 4) et BM25 trouve les mots exacts, puis une fusion des rangs réunit les deux listes. Dans les tests d’Anthropic, un reranker notait ensuite les 150 premiers morceaux et en gardait 20.'
			},
			{
				add: ['rerank -->|"top 20"| prompt["Prompt : question + 20 morceaux en blocs search_result"]', 'prompt --> answer["Réponse avec citations : source, title, cited_text"]'],
				highlight: ['prompt', 'answer'],
				note: 'Les 20 morceaux entrent dans le prompt avec la question. Si tu envoies chacun comme bloc `search_result` avec une `source`, un `title` et les citations activées, chaque affirmation de la réponse porte une citation qui renvoie au morceau d’où elle vient.'
			}
		]
	},
	example: {
		title: 'contextual-rag-lambda-function/lambda_function.py : un appel au modèle par morceau avant l’indexation',
		repo: 'anthropics/claude-cookbooks',
		url: `${LAMBDA}/lambda_function.py#L10-L83`,
		lang: 'python',
		code: `contextual_retrieval_prompt = """
    <document>
    {doc_content}
    </document>


    Here is the chunk we want to situate within the whole document
    <chunk>
    {chunk_content}
    </chunk>


    Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk.
    Answer only with the succinct context and nothing else.
    """
…
            original_document_content = "".join(
                content.get("contentBody")
                for content in file_content.get("fileContents")
                if content
            )

            # Process one chunk at a time
            chunked_content = {"fileContents": []}
            for content in file_content.get("fileContents"):
                content_body = content.get("contentBody", "")
                content_type = content.get("contentType", "")
                content_metadata = content.get("contentMetadata", {})

                # Update chunk with additional context
                prompt = contextual_retrieval_prompt.format(
                    doc_content=original_document_content, chunk_content=content_body
                )
                response_stream = inference_adapter.invoke_model_with_response_stream(prompt)
                chunk_context = "".join(chunk for chunk in response_stream if chunk)

                # append chunk to output file content
                chunked_content["fileContents"].append(
                    {
                        "contentBody": chunk_context + "\\n\\n" + content_body,
                        "contentType": content_type,
                        "contentMetadata": content_metadata,
                    }
                )`,
		notes: [
			'Le prompt est celui de l’article d’Anthropic : le document entier entre balises `<document>`, le morceau entre balises `<chunk>`, et "Answer only with the succinct context and nothing else."',
			'Les lignes 56 à 60 reconstituent le document entier en recollant les morceaux du fichier. Le modèle a besoin du document entier pour dire de quelle entreprise et de quel trimestre parle un morceau.',
			'La ligne 73 fait un appel au modèle par morceau. L’[adaptateur](' + LAMBDA + '/inference_adapter.py#L13) l’envoie à Claude Haiku 4.5 sur Bedrock avec une `temperature` de 0.0. Le document complet part dans chaque appel ; le notebook du cookbook marque le bloc du document avec `"cache_control": {"type": "ephemeral"}` pour que les appels suivants le lisent depuis le cache.',
			'La ligne 79 écrit `chunk_context + "\\n\\n" + content_body` : le contexte d’abord, puis le morceau d’origine. C’est ce texte combiné qui est vectorisé et indexé, et le morceau se retrouve désormais avec "ACME" et "Q2 2023".'
		]
	},
	tradeoff: {
		gain: [
			'Dans les tests d’Anthropic, 5,7 % des morceaux pertinents n’arrivaient pas dans les 20 premiers. Les embeddings contextuels ont ramené ce taux à 3,7 %, l’ajout de BM25 contextuel à 2,9 %, et un reranker par-dessus à 1,9 %.',
			'La base de connaissances peut être bien plus grande que la fenêtre de contexte, et chaque requête ne transporte que les 20 morceaux utiles.',
			'Avec des blocs `search_result`, chaque affirmation revient avec `cited_text`, les blocs exacts qu’elle cite, et un lecteur peut vérifier la réponse dans la source. `cited_text` ne compte pas dans les tokens de sortie.'
		],
		cost: [
			'Ajouter le contexte coûte un appel au modèle par morceau à l’indexation. L’article l’estime à 1,02 $ par million de tokens de documents, avec le prompt caching, des morceaux de 800 tokens et des documents de 8 000 tokens.',
			'Chaque contexte est écrit à partir du document entier : modifier un document oblige à régénérer le contexte de ses morceaux.',
			'Un reranker ajoute une étape au moment de la requête, et cette étape ajoute de la latence. Envoyer plus de morceaux n’aide pas non plus : l’article dit que "more information can be distracting for models".'
		]
	},
	task: {
		prompt: 'Ta base de connaissances du support fait 3 millions de tokens de manuels produits. Un morceau du manuel du routeur Model X200 dit "Restart the device after changing this value." Les utilisateurs cherchent des choses comme "X200 error E-4012". Écris le contexte que tu placerais devant ce morceau, et dis quelle partie de la recherche trouve "E-4012".',
		hint: 'Qu’est-ce que le morceau ne dit pas alors que la question le nomme ? Quelle recherche compare des chaînes exactes ?',
		answer: [
			'3 millions de tokens, c’est bien au-dessus du seuil de 200 000 tokens pour tout mettre dans le prompt : il faut du RAG.',
			'Le contexte à placer devant, écrit par le modèle à partir du manuel entier : "This chunk is from the Model X200 router manual, section on the DNS cache timeout setting." Il nomme le produit et le réglage dont parle le morceau.',
			'BM25 trouve "E-4012", parce qu’il compare des chaînes exactes ; une recherche par embeddings risque de ne trouver que des morceaux sur les erreurs en général. Lance les deux et réunis les résultats par fusion des rangs.',
			'Envoie les morceaux retrouvés en blocs `search_result` avec l’URL du manuel comme `source`, pour que la réponse cite une page que l’utilisateur peut ouvrir.'
		],
		steps: [
			{
				title: 'Vérifie qu’il faut du RAG',
				questions: [
					{ q: 'Sous quelle taille l’article d’Anthropic conseille-t-il de mettre toute la base dans le prompt ?', options: ['20 000 tokens', '1 million de tokens', '200 000 tokens, environ 500 pages', '3 millions de tokens'], answer: 2, why: 'En dessous, tu te passes de RAG et tu utilises le cache de prompt pour réduire le coût.' },
					{ q: 'Tes manuels font 3 millions de tokens. Qu’en déduis-tu ?', options: ['Il faut du RAG', 'Tout mettre dans le prompt avec le cache', 'Fine-tuner un modèle dessus', 'Envoyer un manuel par requête'], answer: 0, why: '3 millions de tokens, c’est bien au-dessus du seuil de 200 000 tokens.' },
					{ q: 'Quelle est la première étape au-dessus de ce seuil ?', options: ['Écrire un résumé par manuel', 'Découper les documents en morceaux', 'Augmenter `max_tokens`', 'Écarter les vieux manuels'], answer: 1, why: 'Les morceaux sont ce que tu indexes et retrouves.' },
					{ q: 'Quelle taille fait un morceau, en général ?', options: ['Un manuel entier', 'Exactement 20 tokens', 'Une page de 2 000 mots', 'Pas plus de quelques centaines de tokens'], answer: 3, why: 'Un morceau est un bout de document, indexé et retrouvé à part.' }
				]
			},
			{
				title: 'Écris le contexte',
				questions: [
					{ q: 'Qu’est-ce que "Restart the device after changing this value." ne dit pas ?', options: ['Le produit et le réglage dont il parle', 'Le verbe', 'Seulement le code d’erreur', 'Rien : il est complet'], answer: 0, why: 'Comme le morceau sur ACME, il ne nomme jamais ce que l’utilisateur cherche.' },
					{ q: 'Quel contexte places-tu devant ?', options: ['"Restart the device."', '"This chunk is important."', '"This chunk is from the Model X200 router manual, section on the DNS cache timeout setting."', '"Answer only with the succinct context and nothing else."'], answer: 2, why: 'Il nomme le produit et le réglage dont parle le morceau.' },
					{ q: 'Le manuel du X200 se découpe en 400 morceaux. Combien d’appels au modèle demande l’ajout du contexte à l’indexation ?', options: ['Un pour tout le manuel', '20, un par morceau retrouvé', 'Aucun : BM25 écrit le contexte', '400, un par morceau'], answer: 3, why: 'Le cookbook fait un appel au modèle par morceau. Le cache de prompt sur le manuel garde peu cher le document répété.' },
					{ q: 'Quelqu’un réécrit la section sur le délai du cache DNS du manuel X200. Que refais-tu ?', options: ['Rien : l’ancien contexte convient encore', 'Générer à nouveau le contexte des morceaux de ce manuel, puis les réindexer', 'Réentraîner le modèle d’embeddings', 'Reconstruire seulement l’index BM25'], answer: 1, why: 'Chaque contexte est écrit à partir du document entier : un document modifié demande de réécrire le contexte de ses morceaux.' }
				]
			},
			{
				title: 'Trouve "E-4012"',
				questions: [
					{ q: 'La requête contient aussi le mot "X200", que le morceau d’origine ne nomme jamais. BM25 peut-il maintenant le trouver dans ce morceau ?', options: ['Non : BM25 n’indexe que le texte d’origine du morceau', 'Oui : le contexte ajouté nomme le Model X200, et BM25 indexe le texte combiné', 'Seule la recherche par embeddings voit le contexte', 'Non : BM25 ignore les noms de produits'], answer: 1, why: 'Le contexte et le morceau sont indexés comme un seul texte : un mot que seul le contexte contient devient une correspondance exacte.' },
					{ q: 'Quels morceaux BM25 peut-il trouver pour "E-4012" ?', options: ['Seulement ceux dont le texte, contexte compris, contient la chaîne "E-4012"', 'Tout morceau qui parle d’erreurs', 'Tout morceau du manuel X200', 'Les morceaux les plus proches de la requête par le sens'], answer: 0, why: 'BM25 note les correspondances exactes de mots. Un morceau qui ne contient jamais "E-4012" n’a aucun score pour ce terme, même si son sujet est proche.' },
					{ q: 'Que fais-tu des deux recherches ?', options: ['Tu ne gardes que BM25', 'Tu ne gardes que les embeddings', 'Tu lances les embeddings seulement si BM25 ne trouve rien', 'Tu lances les deux et réunis les listes par fusion des rangs'], answer: 3, why: 'Chaque recherche trouve ce que l’autre rate.' },
					{ q: 'Dans les tests d’Anthropic, qu’est-ce qui venait après la fusion ?', options: ['Un second passage BM25', 'Un résumé de chaque morceau', 'Un reranker qui notait les 150 premiers morceaux et en gardait 20', 'Un plus gros modèle d’embeddings'], answer: 2, why: 'Avec le reranker en plus, les morceaux ratés sont tombés à 1,9 %.' }
				]
			},
			{
				title: 'Envoie les morceaux avec leurs sources',
				questions: [
					{ q: 'Dans quel type de bloc envoies-tu les morceaux ?', options: ['`document`', '`tool_use`', '`thinking`', '`search_result`'], answer: 3, why: 'Avec les citations activées, chaque affirmation renvoie alors au morceau dont elle vient.' },
					{ q: 'Que mets-tu dans `source` ?', options: ['Le numéro du morceau', 'L’URL du manuel', 'Le code d’erreur', 'Le nom du modèle'], answer: 1, why: 'La réponse cite alors une page que l’utilisateur peut ouvrir.' },
					{ q: 'La réponse cite trois morceaux du manuel. Leur `cited_text` s’ajoute-t-il à ta facture de tokens de sortie ?', options: ['Non : `cited_text` ne compte pas dans les tokens de sortie', 'Oui, au tarif de sortie', 'Oui, au tarif d’entrée', 'Seulement au-delà de 20 citations'], answer: 0, why: '`cited_text` ne compte pas dans les tokens de sortie : les citations ne coûtent aucune sortie en plus.' },
					{ q: 'Pourquoi ne pas envoyer 100 morceaux par prudence ?', options: ['L’API limite une requête à 20 blocs', 'Les citations cessent de marcher après 20', '"More information can be distracting for models"', 'BM25 ne classe que 20 morceaux'], answer: 2, why: 'L’article prévient qu’envoyer plus de morceaux ne règle rien.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Ta base de connaissances fait 120 000 tokens de docs internes. Que conseille l’article d’Anthropic ?',
			options: [
				'Tout mettre dans le prompt avec le prompt caching, sans étape de recherche',
				'Découper en morceaux avec des embeddings, car BM25 exige des millions de tokens',
				'Utiliser Contextual Retrieval, car toute base au-delà de 100 000 tokens exige du RAG',
				'Fine-tuner un modèle sur les docs, car la recherche ne gère pas les docs internes'
			],
			answer: 0,
			why: 'L’article dit qu’une base de moins de 200 000 tokens (environ 500 pages) peut entrer entière dans le prompt. Le prompt caching réduit alors la latence de plus de 2x et le coût jusqu’à 90 % sur les requêtes répétées.'
		},
		{
			q: 'Un utilisateur cherche "Error code TS-999" et la recherche par embeddings renvoie des morceaux sur les codes d’erreur en général. Qu’est-ce qui trouve le bon morceau ?',
			options: [
				'Un modèle d’embeddings plus gros, avec plus de dimensions par vecteur',
				'Envoyer 100 morceaux au modèle au lieu de 20',
				'BM25, qui note les morceaux selon les mots et chaînes exacts',
				'Baisser la température du modèle qui écrit la réponse'
			],
			answer: 2,
			why: 'Les embeddings captent le sens et peuvent rater un identifiant exact. L’article prend cet exemple : BM25 cherche la chaîne "TS-999" elle-même. Combiner les deux recherches par fusion des rangs garde les points forts de chacune.'
		},
		{
			q: 'Tu envoies les morceaux retrouvés en blocs `search_result` avec les citations activées. Que contient une citation de la réponse ?',
			options: [
				'Seulement un numéro de morceau, que ton code doit relier à un document',
				'La `source` et le `title` que tu as envoyés, et le `cited_text` des blocs cités',
				'Un score de confiance de 0 à 1 pour chaque phrase de la réponse',
				'Un lien que l’API construit à partir de la première URL trouvée dans le morceau'
			],
			answer: 1,
			why: 'Une citation `search_result_location` reprend `source` et `title` de ton bloc et ajoute `cited_text` avec les indices des blocs couverts. Le modèle cite des blocs de texte entiers : des blocs plus petits donnent des citations plus fines.'
		}
	],
	recall: {
		q: 'Qu’ajoute Contextual Retrieval à chaque morceau, et de combien a-t-elle fait baisser le taux d’échec de la recherche dans les tests d’Anthropic ?',
		a: '50 à 100 tokens de contexte écrits par un modèle à partir du document entier, placés devant le morceau avant les embeddings et l’index BM25. Le taux d’échec dans les 20 premiers est passé de 5,7 % à 2,9 %, et à 1,9 % avec un reranker.'
	},
	sources: [
		{ title: 'Anthropic, Introducing Contextual Retrieval (2024-09-19), lu le 2026-10-17', url: POST },
		{ title: 'anthropics/claude-cookbooks, contextual-rag-lambda-function au commit b2b0aa1', url: LAMBDA },
		{ title: 'anthropics/claude-cookbooks, contextual-embeddings/guide.ipynb au commit b2b0aa1', url: `${CB}/guide.ipynb` },
		{ title: 'Doc Claude, Search results, lue le 2026-10-17', url: SR }
	]
};
