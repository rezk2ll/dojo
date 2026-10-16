const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const EXAMPLE = `${SDK}/examples/messages.py`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'messages-api',
	part: 'Construire avec l’API',
	title: 'L’API Messages',
	minutes: 10,
	hook: [
		'Ton script envoie « Liste les trois endpoints les plus lents de ce log » à l’API et affiche une réponse correcte. Un second appel envoie « Et pourquoi le deuxième est-il lent ? », et la réponse parle d’autre chose : le modèle ne sait pas ce qu’est « le deuxième ».',
		'L’API ne garde aucune conversation entre tes deux appels : la seconde requête contenait un seul message, rien d’autre. La doc : « The Messages API is stateless, which means that you always send the full conversational history to the API. » (l’API est sans état, tu envoies toujours tout l’historique). **C’est ton code qui tient l’historique et l’envoie en entier à chaque fois.**'
	],
	terms: [
		{ term: 'Message', def: 'Un objet avec un `role`, `user` ou `assistant`, et un `content`. Le tableau `messages` d’une requête contient la conversation jusqu’ici, du plus ancien au plus récent.' },
		{ term: 'Bloc de contenu', def: 'Un élément d’un tableau `content`, avec un `type` comme `text`, `image`, `tool_use` ou `thinking`. Une simple chaîne en `content` est un raccourci pour un seul bloc `text`.' },
		{ term: 'max_tokens', def: 'Le nombre maximal de tokens que le modèle peut générer pour cette réponse. Le modèle peut s’arrêter avant, et s’arrête là au plus tard.' },
		{ term: 'stop_reason', def: 'Le champ de chaque réponse réussie qui dit pourquoi le modèle s’est arrêté : `end_turn`, `max_tokens`, `tool_use` et quatre autres valeurs.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["Ton code : model, max_tokens, messages = [user : Hello, Claude]"] -->|"POST /v1/messages"| api["API Messages"]'],
				highlight: ['req', 'api'],
				note: 'Une requête demande `model`, `max_tokens` et `messages`. Les consignes valables pour toute la conversation vont dans le champ `system` au niveau de la requête. La référence accepte jusqu’à 100 000 messages dans une requête.'
			},
			{
				add: ['api --> resp["Message : role assistant, content [text : Hello!], usage 12 en entrée, 6 en sortie"]'],
				highlight: ['resp'],
				note: 'La réponse est un seul message `assistant`. Son `content` est un tableau de blocs, ici un seul bloc `text`. Dans l’exemple de la doc, `usage` compte 12 tokens en entrée et 6 en sortie.'
			},
			{
				add: ['resp -->|"stop_reason"| check{"Pourquoi l’arrêt ?"}', 'check -->|"end_turn"| done["Réponse complète : utilise-la"]'],
				highlight: ['check', 'done'],
				note: '`end_turn` veut dire que le modèle a atteint un point d’arrêt naturel. Une stop reason arrive avec un HTTP 200 et un contenu valide. Une requête en échec, elle, renvoie un statut 4xx ou 5xx avec le détail de l’erreur.'
			},
			{
				add: ['check -->|"max_tokens"| cut["Coupée : monte max_tokens ou demande la suite"]', 'check -->|"tool_use"| tool["Lance l’outil et renvoie son résultat (jour 17)"]'],
				highlight: ['cut', 'tool'],
				note: '`max_tokens` veut dire que le texte s’est arrêté à ta limite, souvent au milieu d’une phrase. `tool_use` veut dire que le modèle demande à ton code de lancer un outil. Les autres valeurs sont `stop_sequence`, `pause_turn`, `refusal` et `model_context_window_exceeded`.'
			},
			{
				add: ['done --> next["Appel suivant : user, assistant, user, tout renvoyé"]', 'next -->|"input_tokens grimpe : 30"| api'],
				highlight: ['next'],
				note: 'Pour une relance, ton code ajoute le message assistant et le nouveau message user, puis envoie toute la liste. Dans la doc, l’exemple à trois messages compte 30 tokens en entrée, contre 12 pour un seul message. Tu peux écrire toi-même d’anciens tours assistant : la doc autorise les « synthetic `assistant` messages » (messages assistant fabriqués).'
			}
		]
	},
	example: {
		title: 'examples/messages.py : deux appels, le second porte la première réponse',
		repo: 'anthropics/anthropic-sdk-python',
		url: `${EXAMPLE}#L1-L35`,
		lang: 'python',
		code: `from anthropic import Anthropic

client = Anthropic()

response = client.messages.create(
    max_tokens=1024,
    messages=[
        {
            "role": "user",
            "content": "Hello!",
        }
    ],
    model="claude-sonnet-5-5",
)
print(response)

response2 = client.messages.create(
    max_tokens=1024,
    messages=[
        {
            "role": "user",
            "content": "Hello!",
        },
        {
            "role": response.role,
            "content": response.content,
        },
        {
            "role": "user",
            "content": "How are you?",
        },
    ],
    model="claude-sonnet-5-5",
)
print(response2)`,
		notes: [
			'La ligne 3 crée le client sans argument. Le [README du SDK](' + SDK + '/README.md#L27-L29) montre que `api_key` vaut par défaut `os.environ.get("ANTHROPIC_API_KEY")`.',
			'Les lignes 5 à 14 sont le plus petit appel valide : `max_tokens`, `messages` et `model`. La ligne 10 passe une simple chaîne, que l’API lit comme un bloc `text`.',
			'Les lignes 24 à 27 remettent la première réponse dans l’historique. `response.content` est la liste de blocs telle que l’API l’a renvoyée : le second appel montre au modèle sa propre réponse précédente.',
			'Aucun des deux appels ne regarde `response.stop_reason`. Avec `max_tokens=1024`, une longue réponse reviendrait coupée, avec un HTTP 200 et `stop_reason` à `max_tokens`, et la ligne 15 l’afficherait comme une réponse complète.'
		]
	},
	tradeoff: {
		gain: [
			'Ton code décide exactement de ce que voit le modèle à chaque appel : il peut retirer de vieux tours, raccourcir un long résultat d’outil ou ajouter un tour assistant fabriqué.',
			'Chaque réponse a la même forme : une liste de blocs typés et un `stop_reason`. Une seule boucle traite une réponse texte et une demande `tool_use` (jour 17).'
		],
		cost: [
			'L’historique repart à chaque appel, donc `input_tokens` grimpe à chaque tour. Le jour 34 montre comment le prompt caching rend un préfixe répété moins cher.',
			'Une réponse coupée renvoie un HTTP 200, et la gestion d’erreurs seule ne la voit pas. Ton code doit lire `stop_reason`.',
			'`response.content[0].text` suppose que le premier bloc est du texte. Avec des outils ou l’extended thinking, `content` peut aussi contenir des blocs `tool_use` ou `thinking`, qui n’ont pas de champ `text`.'
		]
	},
	task: {
		prompt: 'Un outil de résumé fait `r = client.messages.create(model=..., max_tokens=200, messages=[{"role": "user", "content": doc}])` et renvoie `r.content[0].text`. Des utilisateurs signalent des résumés qui s’arrêtent au milieu d’une phrase. Explique ce qui se passe et écris les quelques lignes qui corrigent la valeur renvoyée.',
		hint: 'Regarde `r.stop_reason` et `r.usage.output_tokens` pour un des mauvais résumés.',
		answer: [
			'Pour les mauvais résumés, `r.stop_reason` vaut `"max_tokens"` et `r.usage.output_tokens` vaut 200. Le modèle a touché la limite, et l’API a quand même répondu en HTTP 200.',
			'Assemble les blocs texte au lieu de prendre l’index 0 : `text = "".join(b.text for b in r.content if b.type == "text")`.',
			'Puis teste la stop reason : `if r.stop_reason == "max_tokens": raise SummaryTooLong(r.usage.output_tokens)`, ou monte `max_tokens`, ou renvoie le texte partiel comme tour `assistant` suivi d’un tour user qui demande la suite.',
			'La doc des stop reasons montre ce dernier schéma : jusqu’à 3 appels, chacun avec `"Please continue from where you left off."`, tant que `stop_reason` vaut `max_tokens`.'
		]
	},
	quiz: [
		{
			q: 'Ton second appel n’envoie que `[{"role": "user", "content": "And why is the second one slow?"}]`. Que voit le modèle ?',
			options: [
				'Ce seul message, car l’API ne garde aucun historique entre deux appels',
				'Ce message et tes tours précédents, que l’API garde pendant 5 minutes',
				'Ce message et les tours précédents, que le client du SDK ajoute pour toi',
				'Ce message et le tour dont l’`id` est revenu dans la réponse précédente'
			],
			answer: 0,
			why: 'L’API Messages est sans état : le modèle voit le tableau `messages` de cette requête et rien d’autre. L’exemple `messages.py` montre la correction : renvoyer `response.role` et `response.content` avec le nouveau tour user.'
		},
		{
			q: 'Une réponse revient avec un HTTP 200 et `stop_reason: "max_tokens"`. Qu’est-ce que cela t’apprend ?',
			options: [
				'La requête a échoué, et tu dois la relancer avec un backoff',
				'La réponse s’est arrêtée à ta limite `max_tokens` et peut être coupée en pleine phrase',
				'Le modèle a fini, et a utilisé exactement le nombre de tokens autorisé',
				'La conversation ne tient plus dans la fenêtre de contexte du modèle'
			],
			answer: 1,
			why: 'Une stop reason fait partie d’une réponse réussie, et `max_tokens` veut dire que la génération a atteint la limite de ta requête. Une fenêtre de contexte pleine a sa propre valeur, `model_context_window_exceeded`, et une requête en échec renvoie un statut 4xx ou 5xx.'
		},
		{
			q: 'Toutes les réponses de la conversation doivent être en français. Où va cette consigne ?',
			options: [
				'Dans un premier message `"role": "system"` du tableau `messages`',
				'Dans l’en-tête `anthropic-version` de chaque requête',
				'Dans le champ `system` au niveau de la requête',
				'Dans un message `assistant` placé avant le premier tour user'
			],
			answer: 2,
			why: 'La référence dit d’utiliser le paramètre `system` de la requête pour un prompt système. Le guide ajoute qu’un message `system` avec du contenu « cannot be the first entry in `messages` » (ne peut pas être le premier élément).'
		}
	],
	recall: {
		q: 'Pourquoi le second appel `messages.create` de `messages.py` renvoie-t-il la première réponse, et quel champ te dit qu’une réponse a été coupée ?',
		a: 'L’API Messages est sans état, donc chaque requête porte tout l’historique. `stop_reason: "max_tokens"` marque une réponse qui a touché la limite.'
	},
	sources: [
		{ title: 'Référence de l’API Claude, Messages, lue le 2026-10-17', url: 'https://platform.claude.com/docs/en/api/messages' },
		{ title: 'Doc Claude, Using the Messages API, lue le 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/working-with-messages' },
		{ title: 'Doc Claude, Stop reasons and fallback, lue le 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons' },
		{ title: 'anthropics/anthropic-sdk-python, examples/messages.py', url: EXAMPLE }
	]
};
