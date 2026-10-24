const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const RUNNER = `${SDK}/src/anthropic/lib/tools/_beta_runner.py`;
const DOCS = 'https://platform.claude.com/docs/en/agents-and-tools/tool-use';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'tool-use',
	part: 'Outils et agents',
	title: 'L’appel d’outils',
	minutes: 10,
	hook: [
		'Tu ajoutes un outil `get_weather` à ta requête et tu demandes "What\'s the weather in San Francisco?". Ton script affiche le premier bloc texte de la réponse : "I\'ll check the current weather in San Francisco for you." Puis il s’arrête sans afficher la moindre météo.',
		'Le modèle n’a appelé aucun service météo. **Il ne peut pas exécuter de code : il a renvoyé une demande, un bloc `tool_use` qui nomme l’outil et ses arguments.** C’était à ton code de lancer `get_weather`, de renvoyer le résultat et de reposer la question.'
	],
	terms: [
		{ term: 'Définition d’outil', def: 'Une entrée du tableau `tools` de la requête : un `name`, une `description` et un `input_schema` (un schéma JSON des arguments). Le modèle la lit pour décider quand appeler l’outil.' },
		{ term: 'Bloc tool_use', def: 'Un bloc de contenu dans la réponse du modèle, avec un `id`, le `name` de l’outil et un objet `input`. C’est une demande adressée à ton code : lance cet outil.' },
		{ term: 'Bloc tool_result', def: 'Un bloc de contenu que tu renvoies dans un message `user`, avec le `tool_use_id` auquel il répond, le résultat dans `content`, et `is_error: true` si l’outil a échoué.' },
		{ term: 'stop_reason', def: 'Le champ qui dit pourquoi le modèle a cessé d’écrire. `tool_use` veut dire qu’il attend des résultats d’outils ; `end_turn` veut dire que sa réponse est finie.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req1["Requête 1 : tools = get_weather, user : météo à San Francisco ?"] --> api["API Messages"]'],
				highlight: ['req1'],
				note: 'Tu envoies les définitions d’outils avec la question. Avec le `tool_choice` par défaut, `auto`, le modèle décide à chaque tour s’il appelle un outil ou s’il répond tout de suite. Les définitions comptent comme tokens d’entrée, et l’API ajoute un prompt système pour les outils : 286 tokens pour Claude Opus 5.5 en `auto` (table des prix, lue le 2026-10-17).'
			},
			{
				add: ['api --> resp1["Réponse 1 : stop_reason tool_use, texte puis tool_use id toolu_01A09, input location San Francisco, CA"]'],
				highlight: ['resp1'],
				note: 'La réponse contient un bloc texte et un bloc `tool_use`. Son `input` suit l’`input_schema` de l’outil : `{"location": "San Francisco, CA", "unit": "celsius"}` dans l’exemple de la doc. À ce stade, aucun code n’a tourné.'
			},
			{
				add: ['resp1 --> run["Ton code : get_weather location San Francisco, CA renvoie 15 degrés"]'],
				highlight: ['run'],
				note: 'Ton code lit `name`, `id` et `input`, puis appelle ta propre fonction. C’est ici que partent la requête SQL, l’appel HTTP ou la commande shell, dans ton processus et avec tes identifiants.'
			},
			{
				add: ['run --> req2["Requête 2 : historique + réponse 1 de l’assistant + tool_result user pour toolu_01A09"]', 'req2 --> api'],
				highlight: ['req2'],
				note: 'Tu ajoutes la réponse de l’assistant telle quelle, puis un message `user` dont le contenu commence par les blocs `tool_result`. Chaque `tool_use_id` reprend l’id d’un `tool_use`. Si le modèle a demandé deux outils, les deux résultats vont dans ce même message.'
			},
			{
				add: ['api --> resp2["Réponse 2 : stop_reason end_turn, 15 degrés Celsius, ciel partiellement nuageux"]'],
				highlight: ['resp2'],
				note: 'Le modèle lit le résultat et rédige la réponse, avec `stop_reason: "end_turn"`. S’il avait demandé un autre outil, tu referais un tour : cet aller-retour répété est la boucle d’agent (jour 18).'
			}
		]
	},
	example: {
		title: 'src/anthropic/lib/tools/_beta_runner.py : le SDK exécute les appels d’outils et construit le message user suivant',
		repo: 'anthropics/anthropic-sdk-python',
		url: `${RUNNER}#L645-L732`,
		lang: 'python',
		code: `    def _generate_tool_call_response(self) -> BetaMessageParam | None:
        content = self._get_last_assistant_message_content()
        if not content:
            return None

        tool_use_blocks = [block for block in content if block.type == "tool_use"]
        if not tool_use_blocks:
            return None

        results: list[BetaToolResultBlockParam] = []
…
                tool = self._tools_by_name.get(tool_use.name) if tool_use.name in available else None
…
                if tool is None:
…
                    result = {
                        "type": "tool_result",
                        "tool_use_id": tool_use.id,
                        "content": f"Error: Tool '{tool_use.name}' not found",
                        "is_error": True,
                    }
                else:
                    with self._tool_use_span(self._client, tool, tool_use) as run:
                        run.result = result = self._run_tool(tool, tool_use)
…
            results.append(result)

        return {"role": "user", "content": results}

    def _run_tool(self, tool: BetaRunnableTool, tool_use: BetaToolUseBlock) -> BetaToolResultBlockParam:
        try:
            return {
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": tool_result_content(tool.call(tool_use.input)),
            }
        except ToolError as exc:
            return {
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": tool_error_content(exc),
                "is_error": True,
            }
        except Exception as exc:
            log.exception(f"Error occurred while calling tool: {tool.name}", exc_info=exc)
            return {
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": tool_error_content(exc),
                "is_error": True,
            }`,
		notes: [
			'La ligne 650 ne garde que les blocs `tool_use` de la dernière réponse. S’il n’y en a aucun, la méthode renvoie `None` et le runner s’arrête : le modèle a répondu.',
			'Lignes 680 à 699 : un nom d’outil inconnu du runner ne lève pas d’exception. Le runner renvoie un `tool_result` avec `"Error: Tool \'...\' not found"` et `is_error: True`, pour que le modèle voie son erreur et tente un autre appel.',
			'La ligne 716, `tool.call(tool_use.input)`, est le seul endroit où ta fonction tourne. Les deux branches `except` transforment toute exception en `tool_result` avec `is_error: True`. D’après la doc, après une telle erreur le modèle "will retry 2-3 times with corrections before apologizing to the user".',
			'La ligne 709 renvoie un seul message `user` qui contient tous les résultats. La [doc sur les appels parallèles](' + DOCS + '/parallel-tool-use) veut tous les résultats d’une réponse "together in a single user message" ; des messages séparés font baisser le nombre d’appels parallèles.'
		]
	},
	tradeoff: {
		gain: [
			'Le modèle choisit l’outil et remplit les arguments à partir de ta `description` et de ton `input_schema`. Tu n’écris aucun code pour analyser la question de l’utilisateur.',
			'Ton code décide de ce qui tourne : tu peux journaliser, vérifier ou refuser chaque bloc `tool_use` avant que la ligne 716 appelle ta fonction.',
			'Avec `@beta_tool` et `client.beta.messages.tool_runner`, le SDK tire le schéma des annotations de type et de la docstring de ta fonction, puis gère tout l’aller-retour.'
		],
		cost: [
			'Chaque aller-retour est une requête de plus qui renvoie tout l’historique, plus les définitions d’outils et le prompt système des outils (286 tokens pour Claude Opus 5.5).',
			'Le modèle peut remplir un argument obligatoire que tu n’as jamais donné : à "What\'s the weather?" sans ville, la doc montre un appel avec `"location": "New York, NY"`.',
			'Le tool runner exécute chaque appel qu’il reçoit. Pour une validation humaine avant l’exécution, ou une journalisation sur mesure, la doc te renvoie vers la boucle manuelle.'
		]
	},
	task: {
		prompt: 'Une réponse a `stop_reason: "tool_use"` et trois blocs : un bloc texte, un `tool_use` d’id `toolu_A` pour `get_weather` avec `{"location": "Paris"}`, et un `tool_use` d’id `toolu_B` pour `calculate_sum` avec `{"a": 15, "b": 27}`. Ton service météo répond HTTP 500. Écris les deux messages que tu ajoutes avant la requête suivante.',
		hint: 'D’abord le message assistant tel qu’il est arrivé. Ensuite un seul message user : quels blocs, dans quel ordre, et quel champ signale l’échec ?',
		answer: [
			'Message 1 : `{"role": "assistant", "content": <les trois blocs de la réponse, sans changement>}`.',
			'Message 2 : `{"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_A", "content": "ConnectionError: weather service returned HTTP 500", "is_error": true}, {"type": "tool_result", "tool_use_id": "toolu_B", "content": "42"}]}`.',
			'Les deux résultats vont dans un seul message user, sans bloc texte avant eux ; un texte placé avant un `tool_result` fait échouer la requête avec une erreur 400.',
			'Le modèle dit alors à l’utilisateur que la météo est indisponible et donne 42 pour la somme. Un message d’erreur qui dit quoi essayer ensuite, comme "Retry after 60 seconds.", donne au modèle une action possible.'
		],
		steps: [
			{
				title: 'Lis la réponse',
				questions: [
					{ q: 'Ton script n’affiche que `content[0]` de cette réponse. Que montre-t-il ?', options: ['La météo à Paris', 'Le bloc texte, sans météo ni somme', 'Le bloc `tool_use` de `toolu_A`', 'La somme, 42'], answer: 1, why: 'Le premier bloc est le bloc texte. Comme le script de l’introduction, il affiche une phrase et aucun résultat, car aucun outil n’a encore tourné.' },
					{ q: 'Combien d’outils ton code doit-il lancer ?', options: ['Un : seul le premier `tool_use` compte', 'Trois : un par bloc de contenu', 'Deux : `toolu_A` et `toolu_B`', 'Aucun : le bloc texte répond déjà'], answer: 2, why: 'Le bloc texte n’est pas un appel. Les deux blocs `tool_use`, si.' },
					{ q: 'Où `get_weather` tourne-t-il vraiment ?', options: ['Dans ton processus, avec tes identifiants', 'Sur les serveurs d’Anthropic', 'Dans le modèle', 'Dans le navigateur de l’utilisateur'], answer: 0, why: 'Pour un outil client, le modèle n’écrit qu’une demande. C’est ton code qui appelle la fonction.' },
					{ q: 'Que renvoie `calculate_sum` pour `{"a": 15, "b": 27}` ?', options: ['`1527`', '`"15 + 27"`', 'Une erreur, comme l’appel météo', '`42`'], answer: 3, why: '15 plus 27 font 42. Seul le service météo a échoué.' }
				]
			},
			{
				title: 'Ajoute la réponse de l’assistant',
				questions: [
					{ q: 'Quel est le rôle du premier message que tu ajoutes ?', options: ['`user`', '`assistant`', '`system`', '`tool`'], answer: 1, why: 'C’est la réponse du modèle lui-même, elle repart donc en message `assistant`.' },
					{ q: 'Quels `id` ce message assistant doit-il encore porter ?', options: ['`toolu_A` et `toolu_B`, pour que chaque résultat ait un appel auquel répondre', 'Seulement `toolu_B`, puisqu’il a réussi', 'Aucun : les id ne vivent que dans les résultats', 'Un nouvel id généré par ton code'], answer: 0, why: 'Chaque `tool_use_id` de tes résultats doit correspondre à un id `tool_use` du tour assistant juste avant.' },
					{ q: 'Peux-tu retirer le bloc texte pour économiser des tokens ?', options: ['Oui : les blocs texte sont ignorés', 'Oui, si tu gardes les `id`', 'Seulement sur Opus 5.5', 'Non : le message assistant repart sans changement'], answer: 3, why: 'Les résultats répondent à cette réponse précise, donc tu la gardes telle quelle.' },
					{ q: 'Où va le message assistant dans `messages` ?', options: ['Après les résultats d’outils', 'Dans une requête à part', 'Juste avant le message user qui porte les résultats', 'Au début de l’historique'], answer: 2, why: 'Les résultats viennent juste après le tour assistant auquel ils répondent.' }
				]
			},
			{
				title: 'Écris les deux résultats',
				questions: [
					{ q: 'L’appel météo a échoué. Envoies-tu quand même un `tool_result` pour `toolu_A` ?', options: ['Oui : chaque bloc `tool_use` reçoit un résultat, ici un résultat qui signale l’erreur', 'Non : envoie seulement la somme', 'Non : lance une nouvelle requête sans outils', 'Seulement si le modèle redemande la météo'], answer: 0, why: 'Le modèle a demandé deux appels, il attend donc deux résultats. Un appel échoué en reçoit un aussi, avec l’erreur dedans.' },
					{ q: 'Quel est le `content` du résultat pour `toolu_A` ?', options: ['Une chaîne vide', '`"42"`', 'Rien : tu sautes les appels échoués', 'Le texte de l’erreur, par exemple "ConnectionError: weather service returned HTTP 500"'], answer: 3, why: 'Le modèle doit voir ce qui a échoué pour le dire à l’utilisateur.' },
					{ q: 'Quel est le `content` du résultat pour `toolu_B` ?', options: ['L’entrée `{"a": 15, "b": 27}`', '`"42"`, la somme', 'Le bloc texte de la réponse', 'Le statut HTTP de l’appel météo'], answer: 1, why: 'Le résultat porte ce que ta fonction a renvoyé. `calculate_sum` a fonctionné, donc son résultat est la somme.' },
					{ q: 'Quel texte d’erreur aide le plus le modèle ?', options: ['"Error"', 'Une chaîne vide', 'Un texte qui dit quoi essayer ensuite, comme "Retry after 60 seconds."', 'Toute la stack trace de ton serveur'], answer: 2, why: 'Une erreur qui propose une suite donne au modèle une action possible.' }
				]
			},
			{
				title: 'Emballe et envoie',
				questions: [
					{ q: 'Qu’envoie la requête suivante ?', options: ['Seulement le message user avec les deux résultats', 'Tout l’historique avec les deux nouveaux messages, et les mêmes `tools`', 'Seulement les deux blocs `tool_result`, sans `tools`', 'Seulement le message assistant'], answer: 1, why: 'Chaque aller-retour renvoie tout l’historique, plus les définitions d’outils et le prompt système des outils.' },
					{ q: 'Tu ajoutes un bloc texte "Voici les résultats :" avant les blocs `tool_result`. Que se passe-t-il ?', options: ['Le modèle le lit comme un indice', 'L’API retire le texte', 'Le modèle ne répond qu’au texte', 'La requête échoue avec une erreur 400'], answer: 3, why: 'Les blocs `tool_result` doivent venir en premier dans le message user.' },
					{ q: 'Lequel des deux résultats porte `is_error: true` ?', options: ['Seulement celui de `toolu_A`', 'Les deux, puisqu’un appel a échoué', 'Seulement celui de `toolu_B`', 'Aucun : un HTTP 500 est un résultat normal'], answer: 0, why: 'Seul l’appel météo a échoué. La somme est un résultat normal, `"42"`.' },
					{ q: 'Quel résultat le modèle peut-il donner tout de suite à l’utilisateur ?', options: ['La météo à Paris', 'Aucun : un appel a échoué', 'La somme, 42', 'Les deux'], answer: 2, why: 'La somme a réussi. Pour la météo, la doc dit que le modèle "will retry 2-3 times with corrections before apologizing to the user".' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Une réponse se termine par `stop_reason: "tool_use"`. Où en est l’outil ?',
			options: [
				'Anthropic l’a exécuté et le résultat est dans le bloc suivant de la même réponse',
				'Il n’a pas tourné : la réponse est une demande, ton code doit lancer l’outil et renvoyer un `tool_result`',
				'Le modèle l’a exécuté dans un bac à sable, il suffit de lire le bloc texte',
				'Le SDK l’a lancé en tâche de fond, le résultat arrive dans une seconde réponse en streaming'
			],
			answer: 1,
			why: 'Pour un outil client, le modèle écrit seulement un bloc `tool_use` avec un nom et un input. Ton application exécute la fonction et renvoie la sortie dans un bloc `tool_result`. Seuls les outils serveur comme `web_search` tournent chez Anthropic.'
		},
		{
			q: 'Le modèle a demandé deux outils dans une même réponse. Comment renvoies-tu les deux résultats ?',
			options: [
				'Deux messages user, un par résultat, dans l’ordre où les outils ont fini',
				'Un message user qui commence par un bloc texte d’explication, suivi des deux blocs `tool_result`',
				'Un message user avec les deux blocs `tool_result`, chacun avec le `tool_use_id` auquel il répond',
				'Un message assistant qui ajoute les résultats après les blocs `tool_use`'
			],
			answer: 2,
			why: 'La doc exige les résultats juste après le tour de l’assistant, avec les blocs `tool_result` en tête du message user. Tous les résultats d’une réponse vont dans un seul message user ; des messages séparés apprennent au modèle à moins appeler d’outils en parallèle.'
		},
		{
			q: 'Dans le tool runner du SDK Python, que se passe-t-il quand ta fonction d’outil lève une exception ?',
			options: [
				'Le runner la relance et la boucle s’arrête, donc tu dois entourer chaque outil d’un try/except',
				'Le runner relance le même appel 3 fois avant d’abandonner',
				'Le runner ignore l’appel et envoie les autres résultats sans lui',
				'Le runner envoie un `tool_result` avec le texte de l’erreur et `is_error: True`, et la boucle continue'
			],
			answer: 3,
			why: '`_run_tool` attrape `ToolError` et toute autre `Exception`, puis renvoie un `tool_result` avec `is_error: True`. Le modèle voit l’erreur et peut corriger son appel ou expliquer l’échec à l’utilisateur.'
		}
	],
	recall: {
		q: 'Après une réponse avec `stop_reason: "tool_use"`, quels deux messages ton code ajoute-t-il avant de rappeler l’API ?',
		a: 'La réponse de l’assistant sans changement, puis un message user dont le contenu commence par un bloc `tool_result` par bloc `tool_use`, chacun avec le `tool_use_id` correspondant (et `is_error: true` si l’outil a échoué).'
	},
	sources: [
		{ title: 'Doc Claude, Tool use with Claude (vue d’ensemble et prix), lu le 2026-10-17', url: `${DOCS}/overview` },
		{ title: 'Doc Claude, Handle tool calls, lu le 2026-10-17', url: `${DOCS}/handle-tool-calls` },
		{ title: 'Doc Claude, Parallel tool use, lu le 2026-10-17', url: `${DOCS}/parallel-tool-use` },
		{ title: 'Doc Claude, Tool runner (SDK), lu le 2026-10-17', url: `${DOCS}/tool-runner` },
		{ title: 'anthropics/anthropic-sdk-python, src/anthropic/lib/tools/_beta_runner.py au commit bcd55fe', url: RUNNER }
	]
};
