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
		],
		steps: [
			{
				title: 'Calcule la limite d’historique',
				questions: [
					{ q: 'Que vaut `max_chat_history_tokens` pour un modèle à 200 000 tokens d’entrée ?', options: ['12 500', '8 192', '1 024', '200 000'], answer: 1, why: '`min(max(200000 / 16, 1024), 8192)` : 200 000 / 16 font 12 500, et le `min` plafonne à 8 192.' },
					{ q: 'Pourquoi la limite n’est-elle pas 12 500, soit 200 000 / 16 ?', options: ['aider arrondit à la puissance de deux inférieure', 'Le `max` la remonte à 1 024', 'Le `min` plafonne le résultat à 8 192', 'Les tokens de sortie sont retirés avant'], answer: 2, why: 'La formule borne le résultat entre 1 024 et 8 192. 12 500 dépasse le plafond.' },
					{ q: 'L’historique fait 12 000 tokens. Qu’en fait aider ?', options: ['Il renvoie l’historique intact', 'Il lance le résumé, car 12 000 dépasse 8 192', 'Il reçoit une erreur 400 "prompt is too long"', 'Il jette les 4 messages les plus anciens'], answer: 1, why: 'Les lignes 39 et 40 ne renvoient l’historique intact que s’il tient dans `self.max_tokens`.' },
					{ q: 'Un historique de 6 000 tokens serait-il résumé ?', options: ['Non : il tient sous 8 192, donc il repart intact', 'Oui : tout historique est résumé', 'Oui : il dépasse la limite de 4 096 de la fin', 'Seulement s’il a plus de 4 messages'], answer: 0, why: 'Le test `total <= self.max_tokens` passe en premier. Sous la limite, rien ne change.' }
				]
			},
			{
				title: 'Trouve la fin',
				questions: [
					{ q: 'Quelle est la limite de la fin ?', options: ['4 096', '8 192', '6 000', '3 900'], answer: 0, why: '`half_max_tokens = self.max_tokens // 2`, donc 8 192 // 2.' },
					{ q: 'Dans quel ordre la boucle parcourt-elle les messages ?', options: ['Du message 1 vers la fin', 'Du milieu vers les bords', 'Le plus gros message d’abord', 'Du message le plus récent en remontant'], answer: 3, why: '`range(len(sized) - 1, -1, -1)` part du dernier message et remonte.' },
					{ q: 'Les 10 derniers messages, 3 900 tokens, restent-ils mot pour mot ?', options: ['Non : ils sont résumés avec le reste', 'Oui : 3 900 est sous 4 096', 'Seulement les 4 derniers, fixés par `min_split`', 'Non : la fin doit faire 4 096 tout pile'], answer: 1, why: 'La boucle ajoute des messages tant que la fin reste sous `half_max_tokens`.' },
					{ q: 'Quand le message 30 rejoint-il aussi la fin ?', options: ['S’il fait moins de 196 tokens', 'Si c’est un message de l’assistant', 'Jamais : la fin fait toujours 10 messages', 'S’il fait moins de 4 096 tokens'], answer: 0, why: '4 096 moins 3 900 laissent 196. Le message 30 n’entre que si la fin reste sous 4 096 avec lui.' }
				]
			},
			{
				title: 'Dis ce qu’envoie aider',
				questions: [
					{ q: 'Où finit la règle des 4 espaces du message 1 ?', options: ['Dans le début, envoyé à `summarize_all`', 'Dans la fin, gardée mot pour mot', 'Dans le prompt système', 'Supprimée, sans aucun résumé'], answer: 0, why: 'Le message 1 est bien plus ancien que la fin : il est dans le début qu’on résume.' },
					{ q: 'Que demande le prompt `summarize` d’aider ?', options: ['Chaque règle recopiée mot pour mot', 'Seulement les blocs de code de chaque message', '"less detail about older parts and more detail about the most recent messages"', 'Le même niveau de détail pour chaque message'], answer: 2, why: 'Le prompt favorise les messages récents. Une règle du message 1 tombe dans la partie la moins détaillée.' },
					{ q: 'Sous quelle forme le résumé arrive-t-il dans la requête suivante ?', options: ['Un message utilisateur qui commence par "I spoke to you previously about a number of things."', 'Un prompt système en plus', 'Un résultat d’outil', 'Un commentaire en haut du fichier modifié'], answer: 0, why: 'aider envoie ce message utilisateur, puis la fin mot pour mot.' },
					{ q: 'Pourquoi le modèle peut-il maintenant écrire des tabulations ?', options: ['L’API refuse les requêtes qui contiennent d’anciennes règles', 'La règle ne survit que si le résumé la reprend', 'La fin l’emporte toujours sur le début', 'aider retire exprès les règles de format'], answer: 1, why: 'Un résumé garde ce que le modèle résumeur a jugé important. Une règle de format peut sauter sans la moindre erreur.' }
				]
			},
			{
				title: 'Garde la règle en vigueur',
				questions: [
					{ q: 'Quelle façon garde la règle dans chaque requête, quoi que dise le résumé ?', options: ['La réécrire dans le message 1 avec « important »', 'La mettre dans `CONVENTIONS.md` et le charger avec `/read CONVENTIONS.md`', 'Augmenter le `max_input_tokens` du modèle', 'Demander au modèle de s’en souvenir'], answer: 1, why: 'C’est la façon que donne la doc d’aider pour les conventions de code.' },
					{ q: 'Pourquoi un fichier en lecture seule survit-il au résumé ?', options: ['Le modèle résumeur ne raccourcit jamais les fichiers', 'L’API met les fichiers en cache d’un tour à l’autre', 'Les fichiers en lecture seule font partie des données d’entraînement', 'aider remet les fichiers en lecture seule dans chaque requête, à part de l’historique résumé'], answer: 3, why: 'Le fichier ne fait pas partie de l’historique du chat : `summarize_all` n’y touche jamais.' },
					{ q: 'Quelle est la deuxième façon de garder la règle ?', options: ['La répéter dans ton message actuel', 'Baisser la température', 'Passer à un modèle avec une fenêtre de 1M de tokens', 'Activer le prompt caching'], answer: 0, why: 'Une plus grande fenêtre n’aide pas : aider plafonne l’historique à 8 192 tokens. Le cache change le prix, pas ce qui compte.' },
					{ q: 'Pourquoi répéter la règle dans ton message actuel marche-t-il ?', options: ['L’API ne lit que le dernier message', 'Les règles répétées pèsent plus à l’entraînement', 'Les messages les plus récents restent mot pour mot dans la fin', 'aider marque le texte répété en lecture seule'], answer: 2, why: 'La fin est gardée telle quelle, et « Lost in the Middle » a montré que les modèles exploitent bien l’information en fin de contexte.' }
				]
			}
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
