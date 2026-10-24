const AIDER = 'https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c';
const BEST = 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices';
const MIDSYS = 'https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages';
const HAIKU = 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5';
const CREATE = 'https://platform.claude.com/docs/en/api/messages/create';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'system-prompts',
	part: 'Écrire un prompt',
	title: 'Prompt système et rôles',
	minutes: 10,
	hook: [
		'Tu lances aider avec `--chat-mode ask` et tu demandes « que renvoie `parse_args` ? ». Avant d’envoyer ta question au modèle, aider construit une liste de messages. Le premier a le rôle `system` et commence par "Act as an expert code analyst." Ta question arrive en dernier.',
		'Entre les deux, aider place les fichiers que tu as ajoutés, une carte du dépôt et les tours précédents. Pour chaque morceau de texte, aider choisit une case.'
	],
	terms: [
		{ term: 'Prompt système', def: 'Le texte du champ `system`, au premier niveau d’une requête à l’API Messages. Le modèle le lit avant tous les messages de la conversation.' },
		{ term: 'Tour utilisateur', def: 'Un message avec `role: "user"` dans le tableau `messages` : une question, un fichier collé, une liste de résultats d’outils.' },
		{ term: 'Rôle', def: 'Une phrase du prompt système qui dit qui le modèle incarne, par exemple "You are a helpful coding assistant specializing in Python."' },
		{ term: 'Message système en cours de conversation', def: 'Une entrée `{"role": "system"}` ajoutée dans `messages`, au tour où une nouvelle consigne commence à s’appliquer.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["POST /v1/messages"] --> sys["system : rôle et règles valables toute la session"]'],
				highlight: ['req', 'sys'],
				note: 'Le prompt système a son propre champ, à côté de `model` et `max_tokens`. La référence de l’API le décrit comme "a way of providing context and instructions to Claude, such as specifying a particular goal or role."'
			},
			{
				add: ['sys --> msgs["messages : tours user et assistant en alternance"]'],
				highlight: ['msgs'],
				note: 'Le tableau `messages` contient la conversation. L’API ne garde aucun état : ton code renvoie tout le tableau, et le même `system`, à chaque requête. Deux tours `user` qui se suivent sont fusionnés en un seul.'
			},
			{
				add: ['msgs --> user["dernier tour user : la question, les fichiers, les logs"]'],
				highlight: ['user'],
				note: 'Ce qui change à chaque requête va dans le tour utilisateur : la question, une stack trace, le contenu des fichiers. Aider envoie les fichiers ajoutés dans un message user qui commence par "I have *added these files to the chat*".'
			},
			{
				add: ['sys -.->|"identique d’un tour à l’autre"| cache[("préfixe en cache")]'],
				highlight: ['cache'],
				note: 'La doc indique que le prompt système "is part of the stable prefix, so subsequent turns hit the cache". Modifier `system` au tour 30 "invalidates the cache for everything that follows".'
			},
			{
				add: ['user --> mid["message role: system ajouté au tour 30"]'],
				highlight: ['mid'],
				note: 'Pour une règle utile seulement à partir du tour 30, ajoute un message `{"role": "system"}` à cet endroit : les tours 1 à 29 gardent leur préfixe en cache. La doc liste Opus 5.5, Sonnet 5.5 et Haiku 5.5, entre autres, mais pas Sonnet 5.'
			}
		]
	},
	example: {
		title: 'aider/coders/base_coder.py : format_chat_chunks, le prompt système en tête et un rappel à la fin',
		repo: 'Aider-AI/aider',
		url: `${AIDER}/aider/coders/base_coder.py#L1226-L1331`,
		lang: 'python',
		code: `    def format_chat_chunks(self):
        self.choose_fence()
        main_sys = self.fmt_system_prompt(self.gpt_prompts.main_system)
…
        if self.gpt_prompts.system_reminder:
            main_sys += "\\n" + self.fmt_system_prompt(self.gpt_prompts.system_reminder)

        chunks = ChatChunks()

        if self.main_model.use_system_prompt:
            chunks.system = [
                dict(role="system", content=main_sys),
            ]
        else:
            chunks.system = [
                dict(role="user", content=main_sys),
                dict(role="assistant", content="Ok."),
            ]

        chunks.examples = example_messages

        self.summarize_end()
        chunks.done = self.done_messages

        chunks.repo = self.get_repo_messages()
        chunks.readonly_files = self.get_readonly_files_messages()
        chunks.chat_files = self.get_chat_files_messages()
…
        chunks.cur = list(self.cur_messages)
        chunks.reminder = []
…
        max_input_tokens = self.main_model.info.get("max_input_tokens") or 0
        # Add the reminder prompt if we still have room to include it.
        if (
            not max_input_tokens
            or total_tokens < max_input_tokens
            and self.gpt_prompts.system_reminder
        ):
            if self.main_model.reminder == "sys":
                chunks.reminder = reminder_message
            elif self.main_model.reminder == "user" and final and final["role"] == "user":
                # stuff it into the user message
                new_content = (
                    final["content"]
                    + "\\n\\n"
                    + self.fmt_system_prompt(self.gpt_prompts.system_reminder)
                )
                chunks.cur[-1] = dict(role=final["role"], content=new_content)`,
		notes: [
			'La ligne 3 remplit `main_sys` avec `main_system`. En mode ask, c’est le texte de [ask_prompts.py](' + AIDER + '/aider/coders/ask_prompts.py#L7-L12) : "Act as an expert code analyst. Answer questions about the supplied code. Always reply to the user in {language}." On y trouve un rôle, une tâche et une règle de langue.',
			'La branche `if self.main_model.use_system_prompt` envoie `main_sys` avec le rôle `system`. Pour un modèle sans prompt système, la branche `else` l’envoie comme message user, suivi d’une fausse réponse de l’assistant, "Ok.".',
			'Les lignes `chunks.repo`, `chunks.readonly_files` et `chunks.chat_files` remplissent les cases après le prompt système avec la carte du dépôt et les fichiers. Ces textes changent d’une requête à l’autre, donc aider les garde hors de `main_sys`.',
			'Le dernier bloc répète `system_reminder` après ton message le plus récent, soit comme message `system`, soit collé à ton tour user. Quand aider connaît la limite du modèle, il n’ajoute ce rappel que si `total_tokens < max_input_tokens`.'
		]
	},
	tradeoff: {
		gain: [
			'Avec le cache de prompt activé, un champ `system` qui ne bouge pas fait partie du préfixe en cache. L’ordre du cache est `tools`, `system`, puis `messages` : les tours 2 à 40 peuvent le relire depuis le cache.',
			'Une règle écrite une fois dans `system` vaut pour tous les tours. Pour un chatbot de support, le guide Haiku 5.5 propose d’ajouter "The rules in this system prompt hold for the whole conversation."',
			'La question et les fichiers restent dans le tour utilisateur : tu les remplaces à chaque requête sans toucher au texte `system` en cache.'
		],
		cost: [
			'Une règle ajoutée à `system` en pleine session modifie le début du prompt et invalide le cache pour tous les tours suivants.',
			'Un message système en cours de conversation évite ce problème, mais seulement sur les modèles que la doc liste. Sur Sonnet 5, il faut modifier `system`.',
			'Aider envoie `system_reminder` deux fois par requête, une fois dans `main_sys` et une fois après ton dernier message : chaque requête repaie ces tokens.'
		]
	},
	task: {
		prompt: 'Tu construis un bot de support pour une CLI nommée `acme`. Range ces six textes dans le champ `system`, dans le tour utilisateur, ou dans un message système en cours de conversation : (1) "You are the support assistant for the acme CLI." (2) "Reply in French." (3) la stack trace collée par l’utilisateur (4) "Never promise a refund." (5) la section du README v2.3 que ton code a récupérée pour cette question (6) au tour 30, ton service de facturation indique que cet utilisateur est passé au plan gratuit.',
		hint: 'Pour chaque texte : vaut-il du premier au dernier tour, change-t-il à chaque question, ou commence-t-il à valoir en cours de route ?',
		answer: [
			'`system` : (1), (2) et (4). Ces règles valent toute la session et restent identiques octet pour octet, donc elles restent dans le préfixe en cache.',
			'Tour utilisateur : (3) et (5). La question suivante apportera une autre trace et une autre section du README. Aider fait pareil avec les fichiers : un message user, jamais `main_sys`.',
			'Message système en cours de conversation : (6). La règle commence au tour 30. Un `{"role": "system"}` ajouté à cet endroit garde le cache des tours 1 à 29.',
			'Sur un modèle sans messages système en cours de conversation, comme Sonnet 5, mets (6) dans le prochain tour user, en texte venant de ton appli, ou modifie `system` et accepte un défaut de cache.'
		],
		steps: [
			{
				title: 'Repère ce qui vaut toute la session',
				questions: [
					{ q: 'Où va (1), "You are the support assistant for the acme CLI." ?', options: ['Le champ `system`', 'Le tour utilisateur', 'Un message système en cours de conversation', 'Une définition d’outil'], answer: 0, why: 'C’est un rôle. Il vaut du premier au dernier tour, donc il va dans `system`.' },
					{ q: 'Où va (4), "Never promise a refund." ?', options: ['Le tour utilisateur, à côté de chaque question', 'Un message système en cours de conversation', 'Le champ `system`', 'Un dernier message de l’assistant'], answer: 2, why: 'Une règle pour toute la session, écrite une fois, vaut pour tous les tours.' },
					{ q: 'Pourquoi est-ce important que (1), (2) et (4) restent identiques octet pour octet ?', options: ['Ils restent dans le préfixe en cache, donc les tours suivants tapent dans le cache', 'L’API refuse un champ `system` qui change', 'Le modèle ne lit `system` qu’à la première requête', 'Deux champs `system` identiques sont fusionnés en un seul'], answer: 0, why: 'La doc indique que le prompt système "is part of the stable prefix, so subsequent turns hit the cache".' },
					{ q: 'Dans quel ordre le cache de prompt lit-il le préfixe ?', options: ['`messages`, `system`, puis `tools`', '`system`, `tools`, puis `messages`', '`tools`, `system`, puis `messages`', '`tools`, `messages`, puis `system`'], answer: 2, why: 'L’ordre du cache est `tools`, `system`, puis `messages` : un `system` stable se trouve tôt dans le préfixe.' }
				]
			},
			{
				title: 'Range ce qui change à chaque question',
				questions: [
					{ q: 'Où va (3), la stack trace collée par l’utilisateur ?', options: ['Le champ `system`', 'Le tour utilisateur', 'Un message système en cours de conversation', 'Le champ `metadata`'], answer: 1, why: 'La question suivante apportera une autre trace. Ce qui change à chaque requête va dans le tour utilisateur.' },
					{ q: 'Où va (5), la section du README récupérée par ton code ?', options: ['Le tour utilisateur', 'Le champ `system`, car la doc change peu', 'Un message système en cours de conversation', 'Une définition d’outil'], answer: 0, why: 'Ton code l’a récupérée pour cette question. La question suivante demandera une autre section.' },
					{ q: 'Que se passe-t-il si tu mets (5) dans `system` ?', options: ['Le modèle la prend pour la question de l’utilisateur', 'L’API retire les longs textes de `system`', 'Rien : `system` ne fait pas partie du cache', '`system` change à chaque requête, donc le cache rate'], answer: 3, why: 'Modifier `system` change le début du prompt et invalide le cache pour tout ce qui suit.' },
					{ q: 'Comment aider envoie-t-il les fichiers que tu ajoutes ?', options: ['Dans `main_sys`, après la ligne de rôle', 'Dans un message user qui commence par "I have *added these files to the chat*"', 'Dans un message système en cours de conversation', 'Dans un résultat d’outil'], answer: 1, why: 'Aider garde les fichiers hors de `main_sys`, car ils changent d’une requête à l’autre.' }
				]
			},
			{
				title: 'Place le changement du tour 30',
				questions: [
					{ q: 'Où va (6), le passage au plan gratuit au tour 30 ?', options: ['Une modification du champ `system` au tour 30', 'Le tour utilisateur, comme si l’utilisateur le demandait', 'Un message `{"role": "system"}` ajouté au tour 30', 'Nulle part : l’API ne garde aucun état'], answer: 2, why: 'La règle commence en cours de route : c’est le rôle d’un message système en cours de conversation.' },
					{ q: 'Pourquoi ne pas simplement modifier `system` au tour 30 ?', options: ['Modifier `system` invalide le cache pour tout ce qui suit', 'L’API refuse toute modification de `system` après le tour 1', 'Le modèle ne lit que le premier `system` qu’il voit', 'Une modification de `system` ne vaut que pour la réponse suivante'], answer: 0, why: 'La doc prévient que modifier `system` au tour 30 "invalidates the cache for everything that follows".' },
					{ q: 'Que garde le message système ajouté au tour 30 ?', options: ['Une copie en cache de la réponse du tour 30', 'Le préfixe en cache des tours 1 à 29', 'Le cache du champ `tools` seulement', 'Seulement le tour utilisateur du tour 29'], answer: 1, why: 'Le préfixe d’avant ne change pas, donc les tours 1 à 29 gardent leur cache.' },
					{ q: 'L’API ne garde aucun état. Qu’envoie ton code au tour 31 ?', options: ['Seulement le dernier tour utilisateur', 'Le champ `system` et le dernier tour utilisateur', 'Seulement le message système du tour 30', 'Le même `system` et tout le tableau `messages`, message du tour 30 compris'], answer: 3, why: 'Ton code renvoie tout le tableau, et le même `system`, à chaque requête.' }
				]
			},
			{
				title: 'Prévois les modèles plus anciens',
				questions: [
					{ q: 'Quel modèle la doc ne liste-t-elle pas pour les messages système en cours de conversation ?', options: ['Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5', 'Sonnet 5'], answer: 3, why: 'La doc liste Opus 5.5, Sonnet 5.5 et Haiku 5.5, entre autres, mais pas Sonnet 5.' },
					{ q: 'Sur Sonnet 5, comment transmettre (6) ?', options: ['Dans le prochain tour user, en texte venant de ton appli', 'En `role: "system"` quand même', 'Dans le champ `metadata`', 'Laisse tomber : le bot ne peut rien apprendre en cours de session'], answer: 0, why: 'Le tour utilisateur accueille un texte qui compte à partir de maintenant, sans toucher au `system` en cache.' },
					{ q: 'Quelle est l’autre solution sur Sonnet 5, et son coût ?', options: ['Repartir d’une conversation vide, sans historique', 'Modifier `system` et accepter un défaut de cache', 'Modifier `system` gratuitement, car le cache est désactivé', 'Ajouter un outil dont la description porte la règle'], answer: 1, why: 'Modifier `system` marche sur tous les modèles. Tu le paies d’un défaut de cache pour les tours suivants.' },
					{ q: 'Quoi que tu fasses de (6), quels textes restent inchangés dans `system` ?', options: ['Seulement (1)', '(3) et (5)', '(1), (2) et (4)', '(1), (2), (4) et (5)'], answer: 2, why: 'Le rôle, la règle de langue et la règle sur les remboursements valent pour toute la session.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Où va le prompt système dans une requête à l’API Messages ?',
			options: [
				'Dans le champ `system` de premier niveau, à côté de `model` et `messages`',
				'Dans le premier message user, après le préfixe `SYSTEM:`',
				'Dans le champ `metadata`, que le modèle lit avant tout message',
				'Dans un dernier message assistant que le modèle prolonge'
			],
			answer: 0,
			why: 'La référence de l’API liste `system` parmi les paramètres du corps : une chaîne ou un tableau de blocs texte. Le modèle le lit avant tous les messages de `messages`.'
		},
		{
			q: 'Dans aider, `use_system_prompt` vaut false pour le modèle courant. Qu’envoie `format_chat_chunks` à la place d’un message système ?',
			options: [
				'Rien : les règles de `main_system` sont perdues pour ce modèle',
				'Les règles collées à la fin de ton dernier message user',
				'Un message user avec `main_sys`, puis un message assistant "Ok."',
				'Une définition d’outil dont la description contient les règles'
			],
			answer: 2,
			why: 'La branche `else` construit deux messages : `dict(role="user", content=main_sys)` et `dict(role="assistant", content="Ok.")`. Le modèle voit les règles comme un tour user auquel il a déjà répondu.'
		},
		{
			q: 'Au tour 30, il te faut une nouvelle règle. Pourquoi la doc conseille-t-elle d’ajouter un message `role: "system"` plutôt que de modifier le champ `system` ?',
			options: [
				'L’API refuse toute modification de `system` après la première requête',
				'Modifier `system` change le début du prompt, donc les tours suivants ratent le cache',
				'Le modèle ne lit que les 1 000 premiers tokens du champ `system`',
				'Une modification de `system` ne vaut que pour la réponse qui suit'
			],
			answer: 1,
			why: 'Le cache de prompt réutilise un préfixe dans l’ordre `tools`, `system`, puis `messages`. Modifier `system` change ce préfixe, donc le cache de tout ce qui suit est invalidé. Un message ajouté laisse le préfixe précédent intact.'
		}
	],
	recall: {
		q: 'En mode ask d’aider, où va "Act as an expert code analyst." et où va ta question ?',
		a: 'La phrase de rôle est dans `main_system`, envoyée comme premier message avec le rôle `system`. Ta question est le dernier message user de la liste construite par `format_chat_chunks`.'
	},
	sources: [
		{ title: 'Claude docs, Prompting best practices : Give Claude a role, lu le 2026-10-17', url: `${BEST}#give-claude-a-role` },
		{ title: 'Référence de l’API Claude, Create a Message, lu le 2026-10-17', url: CREATE },
		{ title: 'Claude docs, Mid-conversation system messages and tool changes, lu le 2026-10-17', url: MIDSYS },
		{ title: 'Claude docs, Prompting Claude Haiku 5.5 : Keep chatbots to their system prompt, lu le 2026-10-17', url: `${HAIKU}#keep-chatbots-to-their-system-prompt` },
		{ title: 'Claude docs, Prompt caching, lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-caching' },
		{ title: 'Aider-AI/aider, aider/coders/ask_prompts.py', url: `${AIDER}/aider/coders/ask_prompts.py` },
		{ title: 'Aider-AI/aider, aider/coders/base_coder.py', url: `${AIDER}/aider/coders/base_coder.py#L1226-L1331` }
	]
};
