const HA = 'https://github.com/home-assistant/core';
const PR = `${HA}/pull/141969`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'leaked-task',
	part: 'Les ressources',
	title: 'Une page de connexion abandonnée',
	minutes: 10,
	hook: [
		'Dans Home Assistant, un utilisateur commence à ajouter une intégration qui se connecte en OAuth, comme SmartThings. Home Assistant l’envoie sur le site de connexion externe. Il ferme la page sans se connecter, puis redémarre Home Assistant.',
		'Le redémarrage écrit un avertissement : **"Task <Task pending name=\'Task-304\' coro=<CloudOAuth2Implementation.async_generate_authorize_url.<locals>.await_tokens() ...> was still running after final writes shutdown stage"**. L’extrait est le code qui a lancé cette tâche.'
	],
	terms: [
		{ term: 'OAuth', def: 'Un parcours de connexion où l’utilisateur s’identifie sur un autre site, qui renvoie ensuite des jetons à l’application.' },
		{ term: 'Tâche suivie', def: 'Une tâche créée avec `hass.async_create_task`. Home Assistant la garde dans son ensemble `_tasks`. Si elle tourne encore à la dernière étape de l’arrêt, il écrit un avertissement et l’annule.' },
		{ term: 'Tâche de fond', def: 'Une tâche créée avec `hass.async_create_background_task`. Sa docstring dit qu’elle "Will be automatically cancelled on shutdown" (sera annulée à l’arrêt).' }
	],
	bug: {
		title: 'Fix warning about unfinished oauth tasks on shutdown (#141969)',
		repo: 'home-assistant/core',
		url: `${HA}/blob/253293c986de7e0d154ff6234ba1f7605ac564af/homeassistant/components/cloud/account_link.py#L107-L132`,
		fix: `${HA}/commit/2305cb0131bb8a997199cfaa09f418d817ad39b0`,
		lang: 'python',
		code: `async def async_generate_authorize_url(self, flow_id: str) -> str:
    """Generate a url for the user to authorize."""
    helper = account_link.AuthorizeAccountHelper(
        self.hass.data[DATA_CLOUD], self.service
    )
    authorize_url = await helper.async_get_authorize_url()

    async def await_tokens() -> None:
        """Wait for tokens and pass them on when received."""
        try:
            tokens = await helper.async_get_tokens()

        except TimeoutError:
            _LOGGER.info("Timeout fetching tokens for flow %s", flow_id)
        except account_link.AccountLinkException as err:
            _LOGGER.info(
                "Failed to fetch tokens for flow %s: %s", flow_id, err.code
            )
        else:
            await self.hass.config_entries.flow.async_configure(
                flow_id=flow_id, user_input=tokens
            )

    self.hass.async_create_task(await_tokens())

    return authorize_url`,
		lines: [24],
		diff: `                 )

-        self.hass.async_create_task(await_tokens())
+        # It's a background task because it should be cancelled on shutdown and there's nothing else
+        # we can do in such case. There's also no need to wait for this during setup.
+        self.hass.async_create_background_task(
+            await_tokens(), name="Awaiting OAuth tokens"
+        )

         return authorize_url`,
		notes: [
			'**La tâche attend une personne.** `await_tokens()` reste bloquée sur `helper.async_get_tokens()`. Elle se termine quand les jetons arrivent, quand l’attente expire ou quand la liaison échoue. Les jetons n’arrivent qu’après la connexion sur l’autre site, et fermer la page ne déclenche aucun de ces trois cas.',
			'**Personne ne l’annule.** `hass.async_create_task` crée une tâche suivie. À l’arrêt, Home Assistant annule d’abord toutes les tâches de fond. Les tâches suivies lancées avant continuent pendant les étapes d’arrêt des intégrations et d’écriture finale. À l’étape de fermeture, `async_stop` trouve `await_tokens()` encore en attente, écrit l’avertissement du début et seulement là l’annule.',
			'**Le correctif.** `async_create_background_task` range la même coroutine parmi les tâches que Home Assistant annule à l’arrêt. Le nouveau commentaire donne la raison : "it should be cancelled on shutdown and there\'s nothing else we can do in such case."',
			'**Comment ça s’est vu.** L’auteur de la [pull request #141969](' + PR + ') a écrit les étapes pour le reproduire : "Start authentication with integration using OAuth (e.g. SmartThings)", "When redirected to external login site, just close the page", puis "Restart Home Assistant".'
		]
	},
	quiz: [
		{
			q: 'L’utilisateur a fermé la page de connexion. Que fait la tâche `await_tokens()` au redémarrage ?',
			options: [
				'Elle a fini et a écrit un timeout',
				'Elle attend toujours dans `async_get_tokens()`',
				'Elle relance la connexion en boucle',
				'Elle a été annulée à la fermeture de la page'
			],
			answer: 1,
			why: 'La tâche se termine sur des jetons, un timeout ou une erreur de liaison. Fermer la page n’est rien de tout ça, et l’avertissement du signalement montre la tâche encore en attente.'
		},
		{
			q: 'Pourquoi cette tâche n’a-t-elle pas été annulée au début de l’arrêt ?',
			options: [
				'Elle tenait un verrou dont l’arrêt avait besoin',
				'C’était une tâche suivie, pas une tâche de fond',
				'Elle attrapait `CancelledError` et continuait',
				'Elle lançait un nouveau flux pendant l’arrêt'
			],
			answer: 1,
			why: 'Home Assistant annule les tâches de fond dès qu’il s’arrête. Une tâche suivie reste en vie jusqu’à l’étape de fermeture, où elle reçoit l’avertissement puis est annulée.'
		},
		{
			q: 'Tu lances une tâche qui attend quelque chose que tu ne contrôles pas. Que dois-tu décider en la créant ?',
			options: [
				'Sur quel thread elle doit tourner',
				'Combien de fois écrire son résultat',
				'Qui l’annule si l’événement n’arrive jamais',
				'Si elle doit porter un nom ou non'
			],
			answer: 2,
			why: 'Une tâche qui attend un utilisateur ou un service distant peut attendre plus longtemps que l’application ne tourne. Quelqu’un doit l’annuler, à l’arrêt ou après un délai.'
		}
	],
	takeaway: 'Pour chaque tâche qui attend un utilisateur ou un service distant, décide qui l’annule. À l’arrêt, vérifie qu’elle est annulée tôt au lieu d’être laissée jusqu’à la dernière étape.',
	sources: [
		{ title: 'home-assistant/core, pull request #141969', url: PR },
		{ title: 'Le commit du correctif', url: `${HA}/commit/2305cb0131bb8a997199cfaa09f418d817ad39b0` }
	]
};
