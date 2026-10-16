const OH = 'https://github.com/OpenHands/software-agent-sdk/blob/bf9b6057b00e1b2b532ecff508c0d92d818adced/openhands-sdk/openhands/sdk';
const LOOP = `${OH}/conversation/impl/local_conversation.py`;
const STUCK = `${OH}/conversation/stuck_detector.py`;
const RUNNER = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a/src/anthropic/lib/tools/_beta_runner.py';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'agent-loop',
	part: 'Outils et agents',
	title: 'La boucle d’agent',
	minutes: 10,
	hook: [
		'Tu demandes à un agent de faire passer un test qui échoue, et tu pars prendre un café. Il lance `pytest tests/test_dates.py`, lit l’erreur, rappelle le même outil avec les mêmes arguments, obtient la même erreur et recommence. À ton retour, le journal montre des dizaines d’appels identiques, tous facturés.',
		'Pour le modèle, chaque appel avait un sens : la dernière observation disait encore « test échoué », donc l’étape suivante ressemblait à « réessayer ». **Aucun code hors du modèle ne comptait les appels ni ne les arrêtait.**'
	],
	terms: [
		{ term: 'Agent', def: 'La définition d’Anthropic : un système où les modèles "dynamically direct their own processes and tool usage" (pilotent eux-mêmes leur démarche et leurs outils). En code, un modèle qui appelle des outils en boucle jusqu’à ce qu’une condition d’arrêt soit remplie.' },
		{ term: 'Observation', def: 'Ce que l’environnement renvoie après une action : un résultat d’outil, la sortie d’une commande, une erreur. Le modèle la lit avant de choisir l’action suivante.' },
		{ term: 'Condition d’arrêt', def: 'Une vérification hors du modèle qui termine la boucle : la tâche est marquée finie, un plafond d’itérations ou un budget est atteint, ou une répétition est détectée.' },
		{ term: 'Motif de blocage', def: 'Une suite dans l’historique qui ne montre aucun progrès, par exemple la même action avec la même observation 4 fois de suite (le réglage par défaut d’OpenHands).' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['task["Tâche : faire passer tests/test_dates.py"] --> think["Réfléchir : le modèle lit l’historique et choisit l’étape suivante"]'],
				highlight: ['task', 'think'],
				note: 'La boucle part d’une tâche de l’utilisateur : le modèle lit tout l’historique et écrit son raisonnement puis un appel d’outil. L’article ReAct (2022) décrit cette alternance de "reasoning traces and task-specific actions".'
			},
			{
				add: ['think --> act["Agir : appel d’outil, par exemple lancer pytest"]', 'act --> env[("Environnement : fichiers, shell, API")]'],
				highlight: ['act', 'env'],
				note: 'Ton code exécute l’appel d’outil (jour 17). L’action modifie ou lit quelque chose : un fichier, une commande shell, une page web.'
			},
			{
				add: ['env -->|"observation : sortie ou erreur"| obs["Observer : le résultat revient dans l’historique"]', 'obs --> think'],
				highlight: ['obs'],
				note: 'Le résultat revient dans le contexte et le modèle réfléchit à nouveau. Le billet d’Anthropic dit qu’un agent doit obtenir à chaque étape une "ground truth" de l’environnement, comme un résultat d’outil ou une exécution de code, pour juger de son avancée.'
			},
			{
				add: ['think -->|"outil finish ou end_turn"| done["Arrêt : tâche finie"]', 'cap["Vérifications hors du modèle : plafond d’itérations, budget, détecteur de blocage"] -.->|"break"| think'],
				highlight: ['done', 'cap'],
				note: 'Le modèle termine la boucle quand il juge la tâche finie. Ton code la termine quand une limite est atteinte. Le billet d’Anthropic : "it\'s also common to include stopping conditions (such as a maximum number of iterations) to maintain control."'
			},
			{
				add: ['rep["Même action, même erreur, 3 fois"] -->|"relance, puis STUCK"| cap'],
				highlight: ['rep'],
				note: 'Une boucle déraille quand l’observation ne change pas le choix suivant du modèle. L’agent de la pause café lançait un appel, recevait une erreur et recommençait. Un détecteur qui compare les dernières actions et observations repère cette répétition exacte.'
			}
		]
	},
	example: {
		title: 'openhands/sdk/conversation/impl/local_conversation.py : la boucle d’exécution et ses vérifications d’arrêt',
		repo: 'OpenHands/software-agent-sdk',
		url: `${LOOP}#L1974-L2085`,
		lang: 'python',
		code: `while True:
    with self._state:
        if self._state.execution_status in [
            ConversationExecutionStatus.PAUSED,
            ConversationExecutionStatus.STUCK,
        ]:
            break

        # Handle stop hooks on FINISHED
        if (
            self._state.execution_status
            == ConversationExecutionStatus.FINISHED
        ):
…
            # No hooks or hooks allowed stopping
            break

        # Check for stuck patterns if enabled
        if self._check_stuck_or_nudge():
            continue
…
            self.agent.step(
                self, on_event=self._on_event, on_token=self._on_token
            )
        iteration += 1
…
        budget_detail = self._budget_exceeded_detail()
        if budget_detail and (
            self._state.execution_status
            != ConversationExecutionStatus.FINISHED
        ):
            self._emit_run_limit_error("MaxBudgetReached", budget_detail)
            break

        if iteration >= self.max_iteration_per_run:
…
            error_msg = (
                f"Agent reached maximum iterations limit "
                f"({self.max_iteration_per_run})."
            )
            logger.error(error_msg)
            self._state.execution_status = ConversationExecutionStatus.ERROR
            self._on_event(
                ConversationErrorEvent(
                    source="environment",
                    code="MaxIterationsReached",
                    detail=error_msg,
                )
            )
            break`,
		notes: [
			'Le `break` du haut sort avant l’appel suivant au modèle si le statut vaut `PAUSED` ou `STUCK`. Un statut `FINISHED` termine aussi la boucle : l’agent le pose quand le modèle appelle `FinishTool`, dont la description dit de l’utiliser quand la tâche est faite ou "You cannot proceed further".',
			'`_check_stuck_or_nudge()` tourne avant chaque étape. Quand le même appel d’outil avec les mêmes arguments a échoué 3 fois de suite, il ajoute d’abord un message user : "You\'ve called `{action.tool_name}` with the same arguments {threshold} times in a row and gotten the same error each time". Si l’appel suivant se répète encore, le [détecteur de blocage](' + STUCK + '#L104-L154) pose `STUCK`.',
			'Les seuils par défaut du détecteur : 4 paires action et observation identiques, 3 appels identiques en échec, 3 messages de l’agent d’affilée sans intervention de l’utilisateur, et 6 pour un motif en alternance. Il compare l’action, le nom de l’outil et la réflexion du modèle : un appel qui change d’un caractère ne compte pas comme une répétition.',
			'Les deux dernières vérifications sont des limites indépendantes du modèle : `max_budget_per_run` en dollars (désactivé par défaut), et `max_iteration_per_run`, 500 par défaut. Atteindre l’une d’elles pose `ERROR` avec le code `MaxBudgetReached` ou `MaxIterationsReached`.'
		]
	},
	tradeoff: {
		gain: [
			'Le modèle choisit chaque étape d’après une vraie sortie, donc il peut traiter des tâches dont le nombre d’étapes est inconnu d’avance. Dans l’article ReAct, cette méthode dépasse l’apprentissage par imitation et par renforcement de 34 et 10 points de taux de réussite sur ALFWorld et WebShop.',
			'Les vérifications hors du modèle plafonnent le coût : dans OpenHands, au plus 500 étapes par exécution, plus un budget en dollars si tu règles `max_budget_per_run`, quoi que décide le modèle.'
		],
		cost: [
			'Chaque étape renvoie tout l’historique : l’entrée grossit à chaque observation, et le prix de l’appel suivant aussi. Le billet d’Anthropic cite "higher costs, and the potential for compounding errors".',
			'Un plafond d’itérations arrête tard un agent bloqué : 500 étapes d’un agent bloqué font 500 appels au modèle, chacun avec tout l’historique. Le tool runner du SDK Python d’Anthropic a `max_iterations=None` par défaut : aucun plafond si tu n’en passes pas.',
			'La détection de répétition exacte rate une boucle qui varie : un agent qui modifie une ligne différente à chaque fois et retombe sur le même test en échec passe à travers ces règles.'
		]
	},
	task: {
		prompt: 'Les six derniers appels d’outils de ton agent, du plus ancien au plus récent : `run_tests()` renvoie "FAILED test_parse_date", `edit(file="dates.py", line=12)` renvoie "ok", puis cette paire encore deux fois. Le texte de l’édition et la réflexion du modèle sont identiques à chaque fois. Quelle règle d’OpenHands se déclenche, et qu’ajouterais-tu pour que la boucle s’arrête plus tôt ?',
		hint: 'Aucun appel ne renvoie d’erreur d’outil, et deux actions consécutives ne sont jamais identiques. Compte les actions et les observations à part.',
		answer: [
			'La règle action et erreur ne se déclenche pas : `run_tests` renvoie une observation normale qui contient un message d’échec, et la règle ne compte que les erreurs d’outil. La règle des actions identiques non plus : les actions alternent.',
			'C’est la règle du motif en alternance qui se déclenche. Elle prend les 6 dernières actions et les 6 dernières observations et vérifie que chacune égale celle placée deux rangs plus tôt : A, B, A, B, A, B. C’est le cas ici, donc l’exécution s’arrête en `STUCK`.',
			'Pour arrêter plus tôt : donne à l’exécution un `max_budget_per_run` et un `max_iteration_per_run` plus bas, par exemple 30 pour corriger un seul test.',
			'Fais aussi renvoyer plus de détails à `run_tests`. S’il renvoie l’assertion et le diff, le modèle reçoit une information nouvelle après chaque édition et répète moins souvent la même.'
		]
	},
	quiz: [
		{
			q: 'Un agent a appelé 3 fois le même outil avec les mêmes arguments et reçu 3 fois la même erreur. Que fait OpenHands en premier ?',
			options: [
				'Il arrête tout de suite l’exécution avec le statut `ERROR` et le code `MaxIterationsReached`',
				'Il relance l’appel avec une température plus haute pour que le modèle change d’arguments',
				'Il ajoute un message user qui signale les 3 échecs et demande une autre approche',
				'Il retire l’outil en échec de la liste des outils jusqu’à la fin de l’exécution'
			],
			answer: 2,
			why: '`get_action_error_nudge` renvoie une relance quand la série égale le seuil de 3, et `_check_stuck_or_nudge` l’ajoute comme message user. C’est seulement si la série dépasse 3 que `is_stuck()` renvoie vrai et pose `STUCK`.'
		},
		{
			q: 'Pourquoi une boucle dont la seule condition d’arrêt est « le modèle décide qu’il a fini » risque-t-elle de tourner sans fin ?',
			options: [
				'Le modèle peut choisir « réessayer » sans fin, et aucun code hors de lui ne compte les étapes',
				'L’API refuse de renvoyer `end_turn` tant que des outils sont définis dans la requête',
				'La fenêtre de contexte se vide après chaque étape, donc le modèle oublie la tâche',
				'Les résultats d’outils sont cachés au modèle, qui ne voit jamais que la tâche est finie'
			],
			answer: 0,
			why: 'Vue de l’intérieur, chaque étape paraît raisonnable : la dernière observation dit encore que le test échoue. Un plafond d’itérations, un budget ou un détecteur de répétition est du code hors du modèle, et il termine la boucle quoi que le modèle écrive ensuite.'
		},
		{
			q: 'Tu utilises le tool runner du SDK Python d’Anthropic sans passer `max_iterations`. Qu’est-ce qui limite le nombre de tours ?',
			options: [
				'Un plafond par défaut de 500 itérations, comme dans OpenHands',
				'Un plafond par défaut de 10 itérations, imposé par l’API à chaque requête avec outils',
				'Le détecteur de blocage intégré au SDK, qui arrête les appels identiques répétés',
				'Aucun compteur : elle tourne jusqu’à `end_turn` ou une réponse sans appel d’outil'
			],
			answer: 3,
			why: '`max_iterations` vaut `None` par défaut, et `_should_stop` ne regarde le compteur que s’il est réglé. Sinon le runner s’arrête sur un stop reason terminal comme `end_turn`, `max_tokens` ou `refusal`, ou quand la réponse ne contient aucun appel d’outil.'
		}
	],
	recall: {
		q: 'Cite les vérifications d’arrêt de la boucle d’OpenHands, avec le plafond d’itérations par défaut.',
		a: 'Le modèle appelle `FinishTool` (statut `FINISHED`), le détecteur de blocage pose `STUCK` (après une relance à 3 appels identiques en échec), le budget en dollars `max_budget_per_run`, et `max_iteration_per_run`, 500 par défaut.'
	},
	sources: [
		{ title: 'Yao et al., ReAct: Synergizing Reasoning and Acting in Language Models, arXiv 2210.03629', url: 'https://arxiv.org/abs/2210.03629' },
		{ title: 'Anthropic, Building effective agents (2024-12-19), lu le 2026-10-17', url: 'https://www.anthropic.com/engineering/building-effective-agents' },
		{ title: 'OpenHands/software-agent-sdk, stuck_detector.py au commit bf9b605', url: STUCK },
		{ title: 'OpenHands/software-agent-sdk, local_conversation.py au commit bf9b605', url: LOOP },
		{ title: 'anthropics/anthropic-sdk-python, _beta_runner.py au commit bcd55fe (table des stop reasons)', url: `${RUNNER}#L114-L136` }
	]
};
