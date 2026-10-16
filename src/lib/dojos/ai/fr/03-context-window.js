const AIDER = 'https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c';
const CW = 'https://platform.claude.com/docs/en/build-with-claude/context-windows';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'context-window',
	part: 'Comment marchent les modèles',
	title: 'La fenêtre de contexte',
	minutes: 10,
	hook: [
		'Ton premier message dans un chat de code disait « 4 espaces, jamais de tabulations ». Deux heures et 80 messages plus tard, le modèle écrit une fonction indentée avec des tabulations. Quand tu remontes, le message 1 affiche toujours la règle.',
		'Le modèle ne garde aucun souvenir des tours passés. À chaque tour, le programme renvoie toute la conversation, et le modèle lit **uniquement ce qui est dans cette requête**. Si le programme a raccourci l’historique pour qu’il tienne, ton premier message a pu disparaître ou être remplacé par un résumé.'
	],
	terms: [
		{ term: 'Fenêtre de contexte', def: 'Le nombre maximum de tokens qu’une requête peut contenir : tout ce que le modèle lit, plus tout ce qu’il écrit en retour pendant ce tour.' },
		{ term: 'Harnais', def: 'Le programme entre toi et le modèle (une appli de chat, aider, Claude Code) qui construit chaque requête et choisit l’historique à envoyer.' },
		{ term: 'Context rot', def: 'Le nom qu’Anthropic donne à la baisse de précision et de rappel quand le nombre de tokens dans le contexte augmente.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['sys["Prompt système + définitions d’outils"] --> win["Une requête : la fenêtre de contexte"]', 'hist["Chaque message passé, résultat d’outil, image"] --> win'],
				highlight: ['sys', 'hist', 'win'],
				note: 'La doc d’Anthropic liste ce qui compte : "the system prompt, every message in `messages` (including tool results, images, and documents), and your tool definitions." Le champ `usage` de la réponse donne le nombre de tokens consommés par la requête.'
			},
			{
				add: ['win --> out["Sortie de ce tour, réflexion comprise"]'],
				highlight: ['out'],
				note: 'La sortie se décompte de cette même fenêtre. La doc, lue le 2026-10-17, donne 1M de tokens pour des modèles comme Claude Opus 5.5 et Claude Sonnet 5.5, avec jusqu’à 128k tokens de sortie par requête. D’autres, comme Claude Sonnet 4.5, ont 200k.'
			},
			{
				add: ['out -->|"ajoutée à l’historique"| hist'],
				highlight: ['hist'],
				note: 'Chaque réponse rejoint l’historique du tour suivant, et la doc précise que "previous turns are preserved completely" (les tours passés sont gardés en entier). Une réponse de 2 000 tokens alourdit de 2 000 tokens chaque requête suivante, jusqu’à ce que le harnais la retire.'
			},
			{
				add: ['win -->|"entrée seule trop grosse"| err["400 invalid_request_error : prompt is too long"]', 'win -->|"la génération touche la limite"| stop["stop_reason : model_context_window_exceeded"]'],
				highlight: ['err', 'stop'],
				note: 'Si l’entrée dépasse à elle seule la fenêtre, l’API renvoie une erreur 400 avec "prompt is too long". Sur Claude 4.5 et les modèles plus récents, entrée plus `max_tokens` peut dépasser la fenêtre. La génération s’arrête alors à la limite avec `stop_reason: "model_context_window_exceeded"`.'
			},
			{
				add: ['hist -->|"le harnais réduit"| sum["aider : anciens messages remplacés par un résumé"]'],
				highlight: ['sum'],
				note: 'Un harnais reste sous la limite en supprimant ou en résumant l’historique. aider résume dès que l’historique dépasse `max_chat_history_tokens`, soit 1/16 de la limite d’entrée du modèle, entre 1 024 et 8 192 tokens. Ta première règle ne survit que si le résumé la reprend.'
			}
		]
	},
	example: {
		title: 'aider/history.py : ChatSummary garde la fin récente et résume le début',
		repo: 'Aider-AI/aider',
		url: `${AIDER}/aider/history.py#L37-L96`,
		lang: 'python',
		code: `        sized = self.tokenize(messages)
        total = sum(tokens for tokens, _msg in sized)
        if total <= self.max_tokens and depth == 0:
            return messages

        min_split = 4
        if len(messages) <= min_split or depth > 3:
            return self.summarize_all(messages)

        tail_tokens = 0
        split_index = len(messages)
        half_max_tokens = self.max_tokens // 2

        # Iterate over the messages in reverse order
        for i in range(len(sized) - 1, -1, -1):
            tokens, _msg = sized[i]
            if tail_tokens + tokens < half_max_tokens:
                tail_tokens += tokens
                split_index = i
            else:
                break

        # Ensure the head ends with an assistant message
        while messages[split_index - 1]["role"] != "assistant" and split_index > 1:
            split_index -= 1

        if split_index <= min_split:
            return self.summarize_all(messages)

        # Split head and tail
        tail = messages[split_index:]
…
        summary = self.summarize_all(keep)

        # If the combined summary and tail still fits, return directly
        summary_tokens = self.token_count(summary)
        tail_tokens = sum(tokens for tokens, _ in sized[split_index:])
        if summary_tokens + tail_tokens < self.max_tokens:
            return summary + tail

        # Otherwise recurse with increased depth
        return self.summarize_real(summary + tail, depth + 1)`,
		notes: [
			'Les lignes 39 et 40 renvoient l’historique intact tant qu’il tient dans `self.max_tokens`. Dans [`models.py`](' + AIDER + '/aider/models.py#L356-L358), cette limite vaut `min(max(max_input_tokens / 16, 1024), 8192)` : 8 192 tokens pour un modèle à 200k tokens d’entrée.',
			'Les lignes 51 à 57 partent du message le plus récent et remontent tant que le total reste sous la moitié de `max_tokens`. Avec la limite de 8 192, les 4 096 derniers tokens environ restent mot pour mot.',
			'La ligne 87 envoie le début, plus ancien, à un modèle avec le [prompt `summarize`](' + AIDER + '/aider/prompts.py#L46-L58), qui demande "less detail about older parts and more detail about the most recent messages" (moins de détails sur l’ancien, plus sur le récent). La règle des 4 espaces du message 1 se trouve dans ce début.',
			'Si le résultat est encore trop gros, la ligne 96 rappelle la fonction sur résumé plus fin, jusqu’à `depth > 3`. Chaque nouveau passage résume le résumé précédent.'
		]
	},
	tradeoff: {
		gain: [
			'Une fenêtre de 1M de tokens contient un gros extrait de code ou plusieurs longs documents en une seule requête, sans que le harnais découpe.',
			'Résumer le début permet à un chat aider de durer des heures, avec environ 8 192 tokens d’historique par requête.'
		],
		cost: [
			'Tout l’historique repart à chaque tour et compte dans la fenêtre à chaque fois. Le prompt caching change le prix d’un préfixe répété, et la doc précise qu’il ne change pas "whether they count" (le fait qu’ils comptent).',
			'Dans « Lost in the Middle », GPT-3.5-Turbo avec 20 ou 30 documents faisait moins bien avec la réponse au milieu que sans aucun document (56,1 %).',
			'Un résumé garde ce que le modèle résumeur a jugé important. Une règle de format du message 1 peut sauter sans la moindre erreur.'
		]
	},
	task: {
		prompt: 'Tu utilises aider avec un modèle dont `max_input_tokens` vaut 200 000. Ton historique atteint 12 000 tokens sur 40 messages, et les 10 derniers messages font 3 900 tokens. D’après `history.py`, que va envoyer aider comme historique au tour suivant ? Donne ensuite deux façons de garder « 4 espaces » en vigueur.',
		hint: 'Calcule d’abord `max_chat_history_tokens`, puis sa moitié pour la fin.',
		answer: [
			'`max_chat_history_tokens` vaut `min(max(200000 / 16, 1024), 8192)`, donc 8 192. L’historique fait 12 000 tokens, plus que 8 192 : le résumé démarre.',
			'La limite de la fin est 8 192 // 2 = 4 096. La boucle remonte tant que la fin reste sous 4 096 : les 10 derniers messages (3 900 tokens) restent mot pour mot, plus le message 30 s’il fait moins de 196 tokens.',
			'Les messages plus anciens, dont la règle des 4 espaces, partent dans `summarize_all`. aider envoie un message utilisateur qui commence par "I spoke to you previously about a number of things." suivi de la fin.',
			'Pour garder la règle : mets-la dans `CONVENTIONS.md` et charge-le avec `/read CONVENTIONS.md`. aider remet les fichiers en lecture seule dans chaque requête, à part de l’historique résumé. Ou répète la règle dans ton message actuel.'
		]
	},
	quiz: [
		{
			q: 'Laquelle de ces choses la page d’Anthropic sur la fenêtre de contexte ne compte-t-elle pas dans la fenêtre ?',
			options: [
				'Les définitions d’outils envoyées avec la requête',
				'Le texte des réponses passées de l’assistant dans `messages`',
				'Les données d’entraînement du modèle sur ta bibliothèque',
				'La sortie que Claude écrit pendant ce tour'
			],
			answer: 2,
			why: 'La fenêtre, c’est la requête : prompt système, chaque message, définitions d’outils et sortie du tour. La doc la distingue du "large corpus of data the language model was trained on" (le corpus d’entraînement).'
		},
		{
			q: 'Sur un modèle Claude 4.5 ou plus récent, entrée plus `max_tokens` dépasse la fenêtre, mais l’entrée seule tient. Que se passe-t-il ?',
			options: [
				'L’API rejette la requête avec "prompt is too long"',
				'L’API supprime les messages les plus anciens pour faire de la place',
				'L’API accepte et s’arrête à la limite avec `model_context_window_exceeded`',
				'L’API baisse `max_tokens` et renvoie `stop_reason: "max_tokens"`'
			],
			answer: 2,
			why: 'La doc : sur Claude 4.5 et plus récent, "if input tokens plus `max_tokens` exceeds the context window size, the API accepts the request." Si la génération atteint la limite, `stop_reason` vaut `"model_context_window_exceeded"`. Seule une entrée déjà trop grosse reçoit la 400.'
		},
		{
			q: 'Où « Lost in the Middle » a-t-il trouvé que les modèles utilisaient le mieux l’information utile ?',
			options: [
				'Au début ou à la fin du contexte d’entrée',
				'N’importe où dans le contexte, du moment qu’il tient',
				'Au milieu, là où elle est le plus loin du bruit',
				'Seulement dans les 100 derniers tokens de l’entrée'
			],
			answer: 0,
			why: 'L’article décrit "a distinctive U-shaped performance curve", une courbe en U : la précision est la plus haute quand le document utile est en premier ou en dernier, et chute quand il est au milieu.'
		}
	],
	recall: {
		q: 'Que renvoie l’API Claude quand l’entrée seule dépasse la fenêtre de contexte, et que fait aider avant d’en arriver là ?',
		a: 'Une 400 `invalid_request_error`, "prompt is too long". aider résume les anciens messages dès que l’historique dépasse `max_chat_history_tokens` (1/16 de la limite d’entrée, de 1 024 à 8 192 tokens).'
	},
	sources: [
		{ title: 'Doc Claude, Context windows, lue le 2026-10-17', url: CW },
		{ title: 'Liu et al. 2023, Lost in the Middle: How Language Models Use Long Contexts (arXiv 2307.03172)', url: 'https://arxiv.org/abs/2307.03172' },
		{ title: 'Aider-AI/aider, aider/history.py', url: `${AIDER}/aider/history.py` },
		{ title: 'Aider-AI/aider, aider/coders/base_coder.py (format_chat_chunks)', url: `${AIDER}/aider/coders/base_coder.py#L1279-L1294` },
		{ title: 'Doc aider, Specifying coding conventions', url: `${AIDER}/aider/website/docs/usage/conventions.md` }
	]
};
