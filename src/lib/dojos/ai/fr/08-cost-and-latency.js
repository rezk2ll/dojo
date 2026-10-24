const COOK = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cost-and-latency',
	part: 'Comment marchent les modèles',
	title: 'Coût et latence',
	minutes: 10,
	hook: [
		'Un notebook des cookbooks Claude envoie le code source du b-tree de SQLite, `btree.h` et `btree.c`, à Claude Sonnet 4.6 et demande : "What is the purpose of the BtShared structure?" Le premier mot de la réponse arrive au bout de 20,87 secondes. La réponse complète, 362 tokens, se termine à 28,32 secondes.',
		'Le même notebook repose la même question, avec le code source déjà en cache. **Le premier mot arrive cette fois au bout de 1,94 seconde.** La réponse met encore environ 6,5 secondes à se terminer.'
	],
	terms: [
		{ term: 'Tokens d’entrée', def: 'Tous les tokens que tu envoies dans une requête : prompt système, tours précédents, documents, définitions d’outils et la question.' },
		{ term: 'Tokens de sortie', def: 'Tous les tokens que le modèle génère dans sa réponse, réflexion comprise. Sur tous les modèles Claude actuels, un token de sortie coûte 5 fois un token d’entrée.' },
		{ term: 'TTFT', def: 'Time to first token : le temps entre l’envoi de la requête et la réception du premier token de la réponse. Ton code ne peut le mesurer que sur une réponse en streaming.' },
		{ term: '`usage`', def: 'L’objet présent dans chaque réponse de la Messages API, qui compte les tokens de la requête par catégorie. Anthropic facture chaque requête à partir de ces nombres.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["Requête : 151 629 tokens de code SQLite + une question de 22 tokens"] --> api["Messages API, en streaming"]'],
				highlight: ['req'],
				note: 'Le notebook envoie un seul message utilisateur : les deux fichiers source, marqués avec `cache_control`, puis la question. La question fait 22 tokens. Le code source en fait 151 629, presque 7 000 fois plus.'
			},
			{
				add: ['api -->|"20,87 s"| first["Premier token de texte reçu : TTFT"]'],
				highlight: ['first'],
				note: 'Le TTFT, c’est le temps pendant lequel l’utilisateur fixe une zone de réponse vide. La doc le définit comme "the time it takes for the model to generate the first token of the response, from when the prompt was sent". Sur cette requête à froid, il vaut 20,87 secondes.'
			},
			{
				add: ['first -->|"7,45 s pour 362 tokens"| done["Dernier token : 28,32 s au total"]'],
				highlight: ['done'],
				note: 'Après le premier token, le temps dépend de la longueur de ce que le modèle écrit. 362 tokens de sortie ont pris 28,32 − 20,87 = 7,45 secondes, environ 49 tokens par seconde. Avec le cache chaud, 330 tokens ont pris 6,46 secondes, à peu près la même vitesse.'
			},
			{
				add: ['done --> usage["usage : input_tokens 22, cache_creation_input_tokens 151 629, output_tokens 362"]'],
				highlight: ['usage'],
				note: 'Le message final contient `usage`. La référence de l’API : "Total input tokens in a request is the summation of `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`." Ici `input_tokens` ne vaut que 22, parce que le code source est passé par le cache.'
			},
			{
				add: ['usage -->|"prix Sonnet 4.6, lus le 2026-10-17"| bill["0,569 $ d’écriture en cache + 0,005 $ de sortie ≈ 0,574 $"]', 'warm["Même requête, source lue depuis le cache"] -->|"TTFT 1,94 s"| bill2["0,0455 $ de lecture en cache + 0,005 $ de sortie ≈ 0,051 $"]'],
				highlight: ['bill', 'bill2'],
				note: 'Aux tarifs Sonnet 4.6 de la page des prix, une écriture en cache de 5 minutes coûte 3,75 $ par million de tokens, et une lecture en cache 0,30 $. La requête à froid coûte environ 0,57 $, presque tout en entrée. La requête à chaud coûte environ 0,05 $, et son TTFT baisse de 90,7 %.'
			}
		]
	},
	example: {
		title: 'misc/speculative_prompt_caching.ipynb : mesurer le TTFT et le temps total sur un stream',
		repo: 'anthropics/claude-cookbooks',
		url: `${COOK}/misc/speculative_prompt_caching.ipynb`,
		lang: 'python',
		code: `    print("\\nSending request to API...")
    start_time = time.time()

    # Measure time to first token
    first_token_time = None
    async with client.messages.stream(
        messages=[full_message],
        model=MODEL,
        **DEFAULT_CLIENT_ARGS,
    ) as stream:
        async for text in stream.text_stream:
            if first_token_time is None and text.strip():
                first_token_time = time.time() - start_time
                print(f"\\n🕐 Time to first token: {first_token_time:.2f} seconds")
                break

        # Get the full response
        response = await stream.get_final_message()

    total_time = time.time() - start_time
    print(f"Total response time: {total_time:.2f} seconds")
    print_query_statistics(response, "Standard Caching")`,
		notes: [
			'La ligne 2 lance le chrono juste avant la requête. La ligne 6 utilise `messages.stream` : le texte arrive par morceaux. Sans stream, le premier et le dernier token arrivent dans ton code au même moment.',
			'Les lignes 12 et 13 notent le TTFT au premier morceau qui contient du texte visible, `text.strip()`. La ligne 15 sort de la boucle, et la ligne 18 attend la fin du message avec `get_final_message()`.',
			'La ligne 20 donne le temps total : total moins TTFT, c’est le temps de génération. Mesure les deux : un long prompt fait surtout monter le TTFT, une longue réponse fait surtout monter le temps qui suit.',
			'La ligne 22 affiche `usage` depuis le message final : `input_tokens`, `output_tokens`, `cache_read_input_tokens` et `cache_creation_input_tokens`. Ce sont ces nombres que tu multiplies par les tarifs de la [page des prix](https://platform.claude.com/docs/en/about-claude/pricing).'
		]
	},
	tradeoff: {
		gain: [
			'Lire les 151 629 tokens depuis le cache a fait passer le TTFT de 20,87 à 1,94 seconde, et le coût d’une question d’environ 0,57 $ à environ 0,05 $.',
			'`max_tokens` pose un plafond strict sur les tokens de sortie, les plus chers : 15 $ par million sur Sonnet 4.6, contre 3 $ en entrée.',
			'`usage` revient dans chaque réponse : tu peux journaliser le vrai coût de chaque requête au lieu de l’estimer depuis une grille de prix.'
		],
		cost: [
			'Une écriture en cache coûte plus cher qu’un token d’entrée simple : 3,75 $ contre 3 $ par million sur Sonnet 4.6. Si personne ne pose de deuxième question, le cache n’a fait qu’ajouter du coût.',
			'La doc prévient qu’à `max_tokens`, "the response will be cut off, perhaps mid-sentence or mid-word". Avec `max_tokens: 50`, une réponse de 200 tokens s’arrête après ses 50 premiers tokens.',
			'Les nombres de `usage` ne collent pas un pour un au texte que tu vois. La référence de l’API : "`output_tokens` will be non-zero, even for an empty string response from Claude."'
		]
	},
	task: {
		prompt: 'La requête à froid du notebook renvoie `input_tokens: 22`, `cache_creation_input_tokens: 151629`, `output_tokens: 362`. La requête à chaud renvoie `input_tokens: 22`, `cache_read_input_tokens: 151629`, `output_tokens: 330`. Avec les prix de Claude Sonnet 4.6 lus le 2026-10-17 (3 $ en entrée, 3,75 $ pour une écriture en cache de 5 minutes, 0,30 $ pour une lecture en cache, 15 $ en sortie, par million de tokens), calcule le coût de chaque requête. Puis dis ce qui coûte le plus dans chacune.',
		hint: 'Multiplie chacun des trois nombres par son propre prix, additionne, et divise par 1 000 000.',
		answer: [
			'À froid : 22 × 3 = 66, plus 151 629 × 3,75 ≈ 568 609, plus 362 × 15 = 5 430. Total ≈ 574 105 / 1 000 000 ≈ 0,574 $. L’écriture en cache en fait 99 %.',
			'À chaud : 22 × 3 = 66, plus 151 629 × 0,30 ≈ 45 489, plus 330 × 15 = 4 950. Total ≈ 50 505 / 1 000 000 ≈ 0,051 $. La lecture en cache en fait encore environ 90 %.',
			'La sortie pèse peu dans les deux factures parce que la réponse est courte. Un prompt de 300 tokens avec une réponse de 4 000 tokens inverserait tout : la sortie ferait 98 % du coût à ces prix.'
		],
		steps: [
			{
				title: 'Lis les champs de `usage`',
				questions: [
					{ q: 'Combien de tokens d’entrée la requête à froid a-t-elle au total ?', options: ['22', '151 629', '151 651', '152 013'], answer: 2, why: 'L’entrée totale est la somme de `input_tokens`, `cache_creation_input_tokens` et `cache_read_input_tokens` : 22 + 151 629.' },
					{ q: 'Pourquoi `input_tokens` ne vaut-il que 22 ?', options: ['La source est comptée dans les champs du cache', 'L’API a jeté la source pour économiser des tokens', 'Seule la question est facturée, toujours', 'La source était trop longue et a été tronquée'], answer: 0, why: 'La source était marquée avec `cache_control` : ses 151 629 tokens apparaissent comme une écriture en cache, pas comme une entrée simple.' },
					{ q: 'Quel prix s’applique à `cache_creation_input_tokens` ?', options: ['3 $ par million, l’entrée simple', '3,75 $ par million, une écriture en cache de 5 minutes', '0,30 $ par million, une lecture en cache', '15 $ par million, la sortie'], answer: 1, why: 'Écrire en cache coûte plus cher qu’un token d’entrée simple sur Sonnet 4.6.' },
					{ q: 'Quel prix s’applique à `cache_read_input_tokens` ?', options: ['3 $ par million', '3,75 $ par million', '0,30 $ par million', '15 $ par million'], answer: 2, why: 'Une lecture en cache coûte un dixième du prix d’entrée simple sur Sonnet 4.6.' }
				]
			},
			{
				title: 'Calcule le prix de la requête à froid',
				questions: [
					{ q: 'Combien font 151 629 × 3,75, la part écriture en cache ?', options: ['Environ 568 609', 'Environ 454 887', 'Environ 45 489', 'Environ 5 430'], answer: 0, why: 'L’écriture en cache coûte 3,75 $ par million, pas les 3 $ de l’entrée simple.' },
					{ q: 'Combien fait la part sortie, 362 × 15 ?', options: ['1 086', '4 950', '362', '5 430'], answer: 3, why: 'La sortie coûte 15 $ par million sur Sonnet 4.6.' },
					{ q: 'Envoyée en entrée simple à 3 $, la source coûterait environ 454 887. Combien l’écriture en cache ajoute-t-elle à la requête à froid ?', options: ['Environ 0,574 $', 'Environ 0,114 $', 'Environ 0,0455 $', 'Rien : une écriture coûte autant qu’une entrée simple'], answer: 1, why: '568 609 − 454 887 ≈ 113 722, soit environ 0,114 $, 25 % de plus que l’entrée simple pour la source. Seule une lecture en cache plus tard le rembourse.' },
					{ q: 'Quelle part du coût à froid revient à l’écriture en cache ?', options: ['Environ 99 %', 'Environ 50 %', 'Environ 90 %', 'Environ 1 %'], answer: 0, why: '568 609 sur 574 105. La question et la réponse comptent à peine à côté de la source.' }
				]
			},
			{
				title: 'Calcule le prix de la requête à chaud',
				questions: [
					{ q: 'Combien font 151 629 × 0,30, la part lecture en cache ?', options: ['Environ 568 609', 'Environ 4 549', 'Environ 45 489', 'Environ 454 887'], answer: 2, why: 'La lecture en cache coûte 0,30 $ par million.' },
					{ q: 'Combien fait la part sortie, 330 × 15 ?', options: ['4 950', '5 430', '990', '330'], answer: 0, why: 'La réponse à chaud fait 330 tokens, un peu moins que celle à froid.' },
					{ q: 'Par rapport à la même requête avec la source en entrée simple à 3 $, combien la lecture en cache fait-elle économiser ?', options: ['Environ 0,051 $', 'Environ 0,114 $', 'Environ 0,574 $', 'Environ 0,41 $'], answer: 3, why: '454 887 − 45 489 ≈ 409 398, soit environ 0,41 $ par question à chaud. Une seule requête à chaud rembourse largement les 0,114 $ de plus de l’écriture en cache.' },
					{ q: 'Quelle part du coût à chaud revient à la lecture en cache ?', options: ['Environ 99 %', 'Environ 90 %', 'Environ 10 %', 'Environ 50 %'], answer: 1, why: '45 489 sur 50 505. Lire 151 629 tokens reste l’essentiel de la facture, même au prix du cache.' }
				]
			},
			{
				title: 'Dis ce qui coûte le plus',
				questions: [
					{ q: 'Qu’est-ce qui coûte le plus dans la requête à froid ?', options: ['L’écriture de la source en cache', 'Les 362 tokens de sortie', 'La question de 22 tokens', 'Les 20,87 secondes de TTFT'], answer: 0, why: 'Elle fait 99 % de la facture à froid.' },
					{ q: 'Qu’est-ce qui coûte le plus dans la requête à chaud ?', options: ['Les 330 tokens de sortie', 'La lecture de la source en cache', 'La question de 22 tokens', 'Une nouvelle écriture en cache'], answer: 1, why: 'À environ 90 % de la facture, la lecture en cache dépasse encore la sortie.' },
					{ q: 'Pourquoi la sortie pèse-t-elle peu dans les deux factures ?', options: ['Les tokens de sortie coûtent moins cher que ceux d’entrée', 'Les tokens de sortie sont mis en cache aussi', 'La réponse est courte', '`max_tokens` plafonne le prix de la sortie'], answer: 2, why: 'Un token de sortie coûte 5 fois un token d’entrée simple, mais il n’y en a qu’environ 350 contre 151 629 de source.' },
					{ q: 'Un prompt de 300 tokens reçoit une réponse de 4 000 tokens à ces prix. Quelle part du coût revient à la sortie ?', options: ['Environ 50 %', 'Environ 10 %', 'Environ 75 %', 'Environ 98 %'], answer: 3, why: '4 000 × 15 = 60 000 contre 300 × 3 = 900. Une longue réponse fait basculer la facture vers la sortie.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Quels champs de `usage` s’additionnent pour donner le total des tokens d’entrée d’une requête ?',
			options: [
				'Seulement `input_tokens`, qui inclut déjà la partie en cache',
				'`input_tokens` plus `output_tokens`, les deux moitiés d’un appel',
				'`input_tokens`, `cache_creation_input_tokens` et `cache_read_input_tokens`',
				'`cache_read_input_tokens` seul, quand le cache de prompt est actif'
			],
			answer: 2,
			why: 'La référence de l’API dit que le total d’entrée "is the summation of `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`". Dans le notebook, `input_tokens` valait 22 alors que 151 629 autres tokens passaient par les champs du cache.'
		},
		{
			q: 'Claude Opus 5.5 réfléchit avant chaque réponse. Où ses tokens de réflexion apparaissent-ils dans `usage` ?',
			options: [
				'Nulle part : les tokens de réflexion sont gratuits et non comptés',
				'Dans `output_tokens`, avec un détail dans `output_tokens_details`',
				'Dans `input_tokens`, parce que le modèle relit sa réflexion',
				'Dans `cache_creation_input_tokens`, car la réflexion est mise en cache'
			],
			answer: 1,
			why: 'La référence de l’API : "`output_tokens` remains the inclusive, authoritative total used for billing". `output_tokens_details.thinking_tokens` indique combien de ces tokens ont servi à raisonner. La réflexion est facturée au prix de sortie, 20 $ par million sur Opus 5.5.'
		},
		{
			q: 'Avec le cache chaud, le TTFT vaut 1,94 s et la réponse se termine à 8,40 s. Qu’est-ce qui raccourcirait le plus les 6,46 s restantes ?',
			options: [
				'Mettre aussi en cache la question de 22 tokens',
				'Retirer le prompt système de la requête',
				'Passer `max_tokens` de 4096 à 8192',
				'Demander une réponse plus courte au modèle'
			],
			answer: 3,
			why: 'Après le premier token, le temps suit le nombre de tokens générés : environ 49 à 51 tokens par seconde dans les deux essais. L’entrée est déjà en cache, donc la réduire change peu, et un `max_tokens` plus haut autorise seulement une réponse plus longue.'
		}
	],
	recall: {
		q: 'Dans l’essai du cookbook sur Sonnet 4.6, quels étaient le TTFT et le coût par question avec les 151 629 tokens de source à froid, puis en cache ?',
		a: 'À froid : TTFT de 20,87 s et environ 0,57 $. En cache : TTFT de 1,94 s et environ 0,05 $. Dans les deux cas, générer environ 350 tokens de sortie a pris 6,5 à 7,5 s.'
	},
	sources: [
		{ title: 'Doc Claude, référence de la Messages API (usage), lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/api/messages' },
		{ title: 'Doc Claude, Pricing, lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/about-claude/pricing' },
		{ title: 'Doc Claude, Reducing latency, lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency' },
		{ title: 'anthropics/claude-cookbooks, notebook Speculative prompt caching', url: `${COOK}/misc/speculative_prompt_caching.ipynb` }
	]
};
