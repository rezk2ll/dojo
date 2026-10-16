const CB = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const E2E = `${CB}/capabilities/retrieval_augmented_generation/evaluation/eval_end_to_end.py`;
const EVALS = 'https://platform.claude.com/docs/en/test-and-evaluate/develop-tests';
const PAPER = 'https://arxiv.org/abs/2306.05685';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'grading-outputs',
	part: 'Construire avec l’API',
	title: 'Noter avec un modèle',
	minutes: 10,
	hook: [
		'Tu as réécrit le prompt d’un bot de support et tu veux savoir si ses réponses sont meilleures. Tu as 200 questions de test depuis le jour 23, mais les réponses sont du texte libre : `output == expected` échoue presque à chaque ligne.',
		'Tu demandes donc à un modèle de les noter. Dans une étude de 2023 sur cette méthode, on montre deux réponses presque identiques à un modèle juge, puis on les remontre dans l’ordre inverse. Le juge Claude-v1 a gardé le même verdict après l’échange dans 23,8 % des cas seulement, et il a choisi la première réponse 75,0 % du temps.'
	],
	terms: [
		{ term: 'LLM-as-a-judge', def: 'Un appel de modèle dont le seul rôle est de noter la sortie d’un autre modèle : choisir la meilleure de deux réponses, donner une note, ou dire correct ou incorrect.' },
		{ term: 'Grille', def: 'Les règles écrites que le juge applique, par exemple : une réponse à qui il manque un fait clé de la réponse de référence est incorrecte. Le juge la reçoit à chaque appel de notation.' },
		{ term: 'Biais de position', def: 'Un juge qui préfère une réponse à cause de sa place dans le prompt (première ou seconde), quel que soit son contenu.' },
		{ term: 'Taux d’accord', def: 'La part des cas où deux correcteurs donnent le même verdict. Tu le calcules entre le juge et des humains, et entre deux humains.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['case["Cas de test : question, réponse de référence"] --> sut["Le système testé écrit une réponse"]'],
				highlight: ['case', 'sut'],
				note: 'Chaque cas de test contient une question et, si tu en as une, une réponse de référence écrite par une personne. Le prompt que tu testes produit la réponse à noter. La référence compte : dans l’étude, donner une réponse de référence au juge a fait passer son taux d’échec sur 10 questions de maths de 70 % à 15 %.'
			},
			{
				add: ['sut --> judge["Prompt du juge : grille, référence, réponse dans des balises XML"]', 'judge --> out["explication, puis verdict : correct ou incorrect"]'],
				highlight: ['judge', 'out'],
				note: 'La doc Claude donne trois conseils : une grille détaillée, une sortie limitée à « only \'correct\' or \'incorrect\' » ou à une note de 1 à 5, et un raisonnement avant la note. Le juge écrit son explication d’abord et son verdict à la fin, dans des balises que ton code sait trouver.'
			},
			{
				add: ['out --> parse{"Balise de verdict trouvée ?"}', 'parse -->|"oui"| score["Compter correct / total"]', 'parse -->|"non"| errs["Erreurs du correcteur : compte à part"]'],
				highlight: ['parse', 'errs'],
				note: 'Ton code lit seulement la balise de verdict et garde l’explication pour les humains. Une réponse sans balise de verdict, ou une erreur d’API, est un échec du correcteur. Compte-les à part : rangées dans « incorrect », elles font baisser la note du prompt que tu testes.'
			},
			{
				add: ['score --> swap["Par paires : noter A,B puis B,A"]', 'swap -->|"même gagnant les deux fois"| win["Victoire"]', 'swap -->|"le gagnant change"| tie["Égalité"]'],
				highlight: ['swap', 'tie'],
				note: 'Pour comparer deux prompts, tu montres les deux réponses dans un seul appel. La parade de l’étude contre le biais de position : « call a judge twice by swapping the order of two answers and only declare a win when an answer is preferred in both orders » (appeler le juge deux fois en inversant l’ordre, et ne compter une victoire que si la même réponse gagne dans les deux ordres). Une réponse qui gagne dans un seul ordre compte comme une égalité.'
			},
			{
				add: ['win --> human["Contrôle : des humains notent aussi 50 cas"]', 'tie --> human', 'human --> agree["Accord juge et humains, à côté de l’accord entre humains"]'],
				highlight: ['human', 'agree'],
				note: 'Avant de faire confiance au juge, des personnes notent un échantillon à la main. Dans l’étude, le meilleur juge (GPT-4) était d’accord avec des experts sur 85 % des votes sans égalité, et les experts entre eux sur 81 %. Un juge proche du chiffre humain peut les remplacer ; un juge loin en dessous, non.'
			}
		]
	},
	example: {
		title: 'capabilities/retrieval_augmented_generation/evaluation/eval_end_to_end.py : un correcteur guidé par une référence',
		repo: 'anthropics/claude-cookbooks',
		url: `${E2E}#L8-L79`,
		lang: 'python',
		code: `def evaluate_end_to_end(query, generated_answer, correct_answer):
    prompt = f"""
…
    Is the Generated Answer correct based on the Correct Answer? You should pay attention to the substance of the answer, and ignore minute details that may differ.
…
    However, if there is any critical piece of information which is missing from the generated answer in comparison to the correct answer, then we should mark this as incorrect.

    Finally, if there are any direct contradictions between the correct answer and generated answer, we should deem the generated answer to be incorrect.

    Respond in the following XML format:
    <evaluation>
    <content>
    <explanation>Your explanation here</explanation>
    <is_correct>true/false</is_correct>
    </content>
    </evaluation>
    """

    client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            messages=[
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": "<evaluation>"},
            ],
            temperature=0,
            stop_sequences=["</evaluation>"],
        )
…
        is_correct_match = re.search(r"<is_correct>(.*?)</is_correct>", response_text, re.DOTALL)
…
    except Exception as e:
        print(f"Unexpected error: {e}")
        result = {
            "question": query,
            "correct_answer": correct_answer,
            "generated_answer": generated_answer,
            "is_correct": False,
            "explanation": f"Unexpected error: {str(e)}",
        }`,
		notes: [
			'Les lignes de la grille disent quand une réponse échoue : une « critical piece of information » qui manque, ou une « direct contradiction » avec la bonne réponse. Une réponse formulée autrement passe. Le juge reçoit la bonne réponse dans le prompt, ce que l’étude appelle la notation guidée par une référence.',
			'Le format XML place `<explanation>` avant `<is_correct>` : le modèle écrit ses raisons avant son verdict. Le `re.search` sur `<is_correct>` extrait le verdict, et l’explication part dans le résultat pour qu’une personne la lise plus tard.',
			'La ligne `{"role": "assistant", "content": "<evaluation>"}` pré-remplit la réponse. La [doc Messages](https://platform.claude.com/docs/en/build-with-claude/working-with-messages#prefilling-claudes-response) dit que le prefill « is not supported on Claude 4.6 and later models » et renvoie une erreur 400. Avec `claude-sonnet-4-6`, le bloc `except Exception` enregistrerait alors `is_correct: False` pour chaque réponse, et le run finirait avec toutes les réponses en échec, sans plantage.',
			'Chaque exemple noté par un LLM dans la [doc des évaluations](' + EVALS + '#example-evals) porte le commentaire « Generally best practice to use a different model to evaluate than the model used to generate the evaluated output » (mieux vaut un autre modèle pour noter que celui qui a produit la réponse). L’étude a vu Claude-v1 donner à ses propres réponses un taux de victoire 25 % plus haut que les humains, tout en disant que ses données ne permettent pas de conclure à un vrai biais.'
		]
	},
	tradeoff: {
		gain: [
			'Un juge note des réponses en texte libre que `==`, la recherche de chaîne et le score ROUGE ne savent pas noter. La doc le décrit comme « Fast and flexible, scalable and suitable for complex judgment ».',
			'Chaque verdict vient avec une explication : tu peux lire pourquoi la réponse 137 a échoué, au lieu de voir seulement le total baisser.',
			'Une fois qu’un juge colle à un échantillon noté à la main, il peut noter le reste. Dans l’étude, le meilleur juge était d’accord avec les experts sur 85 % des votes sans égalité, contre 81 % entre experts.'
		],
		cost: [
			'Dans le test « repetitive list » de l’étude, sur 23 réponses, gonfler une réponse avec une copie reformulée de sa liste a trompé Claude-v1 et GPT-3.5 dans 91,3 % des cas.',
			'Un juge peut se tromper sur une question qu’il sait résoudre. Dans l’étude, GPT-4 résolvait seul une question de maths élémentaire, puis notait comme correcte une mauvaise réponse à cette même question.',
			'Chaque note est un appel d’API qui coûte des tokens, et noter les paires dans les deux ordres double les appels. Trois exemples dans le prompt du juge ont rendu les appels 4 fois plus chers dans l’étude.',
			'Il te faut quand même des humains : un échantillon noté à la main, à refaire chaque fois que tu changes la grille ou le modèle juge.'
		]
	},
	task: {
		prompt: 'Le prompt A et le prompt B ont répondu aux 300 mêmes questions de test. Tu n’as pas de réponses de référence. Conçois la comparaison avec un modèle juge : combien d’appels de notation, ce qui compte comme une victoire, ce que tu fais d’une réponse sans verdict, et comment tu contrôles le juge avant d’annoncer « B gagne ».',
		hint: 'Note par paires, et pense à l’effet de l’ordre. Pour le contrôle, il te faut un chiffre auquel comparer le juge.',
		answer: [
			'Notation par paires, chaque paire deux fois (A puis B, B puis A) : 300 × 2 = 600 appels de notation.',
			'Un prompt gagne une question seulement si le juge préfère sa réponse dans les deux ordres. Si le verdict suit l’ordre, la question est une égalité. Tu annonces victoires, défaites et égalités.',
			'Une réponse sans balise de verdict, ou une erreur d’API, va dans un compte « erreur du correcteur » à part et se relance. Elle ne compte jamais comme une défaite pour A ou pour B.',
			'Avant d’annoncer, deux personnes notent à la main les 50 mêmes paires tirées au hasard. Calcule l’accord du juge avec chacune et l’accord entre les deux. Si le juge est proche du chiffre humain (l’étude a vu 85 % contre 81 %), tu publies le résultat ; s’il est loin en dessous, tu corriges d’abord la grille.'
		]
	},
	quiz: [
		{
			q: 'Ton juge par paires préfère la réponse A quand A est montrée en premier, et préfère B quand B est en premier. Que retient la méthode de l’étude ?',
			options: [
				'Une victoire de A, car seul le premier appel compte',
				'Une égalité, car aucune réponse n’a gagné dans les deux ordres',
				'Une victoire de B, car le second appel a vu les deux ordres',
				'Une erreur du correcteur, donc la paire sort de l’évaluation'
			],
			answer: 1,
			why: 'La méthode prudente appelle le juge dans les deux ordres et ne déclare une victoire que si la même réponse est préférée les deux fois. Un verdict qui suit la position ne dit rien du contenu, donc il compte comme une égalité.'
		},
		{
			q: 'Après le passage de ton correcteur à un modèle plus récent, chaque prompt testé obtient 0 %. Le correcteur entoure l’appel d’API d’un `except Exception` et renvoie `is_correct: False`. Que vérifies-tu d’abord ?',
			options: [
				'Si le nouveau modèle est plus sévère, en baissant la barre dans la grille',
				'Si le jeu de test a perdu ses réponses de référence pendant le changement',
				'Les explications, pour voir si elles disent toutes « Unexpected error »',
				'Si `temperature=0` pousse le nouveau modèle à refuser de noter'
			],
			answer: 2,
			why: 'La branche `except` transforme toute erreur d’API en note ratée, avec le texte de l’erreur comme explication. Une requête que le nouveau modèle refuse, comme un prefill sur Claude 4.6 et après, rend chaque réponse « incorrecte » sans plantage.'
		},
		{
			q: 'Comment décides-tu si tu peux faire confiance à la note du juge ?',
			options: [
				'Tu demandes au juge d’évaluer sa propre confiance de 1 à 5 pour chaque note',
				'Tu le lances deux fois sur les mêmes réponses et tu vérifies que les notes sont égales',
				'Tu prends le plus gros modèle disponible, car les gros juges n’ont pas de biais',
				'Des humains notent un échantillon, puis tu compares leurs verdicts à ceux du juge'
			],
			answer: 3,
			why: 'Seules des notes humaines te disent si le juge mesure ce que les gens appellent une bonne réponse. L’étude a fait exactement cette comparaison : 85 % d’accord entre juge et experts, contre 81 % entre experts. Un juge peut être constant avec lui-même et quand même avoir tort.'
		}
	],
	recall: {
		q: 'Dans l’étude « Judging LLM-as-a-Judge », comment annules-tu le biais de position d’un juge par paires ?',
		a: 'Tu appelles le juge deux fois en inversant les deux réponses. Tu ne comptes une victoire que si la même réponse est préférée les deux fois ; tout autre résultat est une égalité.'
	},
	sources: [
		{ title: 'Doc Claude, Define success criteria and build evaluations, lue le 2026-10-17', url: EVALS },
		{ title: 'Zheng et al., Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena (arXiv 2306.05685)', url: PAPER },
		{ title: 'claude-cookbooks, eval_end_to_end.py', url: E2E },
		{ title: 'Doc Claude, Working with the Messages API (prefill), lue le 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/working-with-messages' }
	]
};
