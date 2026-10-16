const HA = 'https://github.com/home-assistant/core';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'missing-await',
	part: 'L’état et le temps',
	title: 'Des tâches d’arrêt que personne n’attendait',
	minutes: 10,
	hook: [
		'Un utilisateur de Home Assistant écrit une automatisation qui tourne à l’arrêt de Home Assistant. Elle bascule un interrupteur virtuel. Le ticket dit : "Although the automation definitely runs, the action of toggling an `input_boolean` helper does not persist after a HA restart." (l’automatisation tourne bien, mais l’état basculé est perdu au redémarrage).',
		'L’arrêt se fait par étapes. L’étape 1 lance les tâches d’arrêt enregistrées et doit leur laisser jusqu’à 20 secondes (`STOPPING_STAGE_SHUTDOWN_TIMEOUT`) pour finir. L’étape 2 arrête ensuite les intégrations. Aucune erreur ni aucun avertissement n’apparaît dans le journal.'
	],
	terms: [
		{ term: 'Coroutine', def: 'Une fonction définie avec `async def`. L’appeler ne l’exécute pas jusqu’au bout ; il faut l’`await` ou la planifier.' },
		{ term: 'asyncio.gather', def: 'Prend plusieurs tâches et renvoie un seul future, terminé quand toutes le sont. Le code l’attend avec `await`.' },
		{ term: 'Future', def: 'Un objet pour un résultat qui existera plus tard. `await future` met l’appelant en pause jusqu’à ce que le résultat soit là.' }
	],
	bug: {
		title: 'Fix missing await when running shutdown jobs (#106632)',
		repo: 'home-assistant/core',
		url: `${HA}/blob/7702f971fbb6e89d6510c716352fd08d2e85d1f0/homeassistant/core.py#L882-L898`,
		fix: `${HA}/commit/a4e9a053c7b3a79f8222d0798d0cd9247cfdb7eb`,
		lang: 'python',
		code: `# Stage 1 - Run shutdown jobs
try:
    async with self.timeout.async_timeout(STOPPING_STAGE_SHUTDOWN_TIMEOUT):
        tasks: list[asyncio.Future[Any]] = []
        for job in self._shutdown_jobs:
            task_or_none = self.async_run_hass_job(job.job, *job.args)
            if not task_or_none:
                continue
            tasks.append(task_or_none)
        if tasks:
            asyncio.gather(*tasks, return_exceptions=True)
except asyncio.TimeoutError:
    _LOGGER.warning(
        "Timed out waiting for shutdown jobs to complete, the shutdown will"
        " continue"
    )
    self._async_log_running_tasks("run shutdown jobs")`,
		lines: [11],
		diff: `                 if tasks:
-                    asyncio.gather(*tasks, return_exceptions=True)
+                    await asyncio.gather(*tasks, return_exceptions=True)
         except asyncio.TimeoutError:`,
		notes: [
			'**Le résultat de gather est jeté.** `asyncio.gather(...)` renvoie un future tout de suite. Sans `await`, rien ne l’attend. Le bloc `async with` se termine un instant après le lancement des tâches, et `async_stop` passe à l’étape 2 pendant qu’elles tournent encore.',
			'**Le délai ne se déclenche jamais.** Le bloc accorde 20 secondes, mais aucune ligne à l’intérieur ne fait de pause. Le message "Timed out waiting for shutdown jobs to complete" ne peut donc jamais s’afficher, même quand une tâche est lente. Le seul signe, c’est le résultat manquant, ici l’état de l’`input_boolean` qui n’est pas gardé.',
			'**Aucun avertissement de Python.** Une coroutine jamais attendue fait afficher à Python "coroutine ... was never awaited". `gather` renvoie un future, pas une coroutine, et les tâches qu’il contient sont déjà planifiées. Rien n’est laissé de côté d’une façon que Python signale.',
			'**Le correctif.** `await asyncio.gather(...)` met `async_stop` en pause jusqu’à ce que toutes les tâches soient finies ou que les 20 secondes soient écoulées. `return_exceptions=True` évite qu’une tâche en échec interrompe l’attente des autres.',
			'**Comment ça s’est vu.** Un utilisateur a ouvert le [ticket #106606](' + HA + '/issues/106606), "Home Assistant shutdown trigger still not working", sur la version 2024.1.0b1. La pull request du correctif renvoie à ce ticket.'
		]
	},
	quiz: [
		{
			q: 'Une tâche d’arrêt prend 5 secondes. Avec le code bogué, quand l’étape 2 commence-t-elle ?',
			options: ['Après 5 secondes, quand la tâche a fini', 'Tout de suite, pendant que la tâche tourne', 'Après 20 secondes, à la fin du délai', 'Jamais, l’arrêt reste bloqué sur la tâche'],
			answer: 1,
			why: 'Rien dans le bloc n’attend le future renvoyé par gather. Le bloc se termine dès que les tâches sont planifiées.'
		},
		{
			q: 'Pourquoi Python n’a-t-il pas affiché "coroutine was never awaited" pour cette ligne ?',
			options: [
				'gather renvoie un future, et ses tâches sont déjà planifiées',
				'Home Assistant masque tous les RuntimeWarning en production',
				'return_exceptions=True fait taire l’avertissement',
				'L’avertissement n’apparaît que si une tâche lève une erreur'
			],
			answer: 0,
			why: 'Cet avertissement concerne les objets coroutine créés puis abandonnés. gather enveloppe les tâches dans des tâches planifiées et renvoie un future, donc aucune coroutine n’est abandonnée.'
		},
		{
			q: 'Comment un test attraperait-il ce bug ?',
			options: [
				'Vérifier que la constante du délai d’arrêt vaut 20',
				'Enregistrer une tâche qui dort, puis vérifier qu’elle a fini avant l’étape 2',
				'Vérifier que async_stop renvoie None',
				'Appeler async_stop deux fois et vérifier que le second appel est ignoré'
			],
			answer: 1,
			why: 'Le bug ne se voit que si une tâche prend du temps. Une tâche qui dort un peu puis lève un drapeau, vérifié au début de l’étape 2, échoue sans le await et passe avec le correctif.'
		}
	],
	takeaway: 'Chaque appel qui renvoie un future ou une promesse a besoin d’un `await`, ou d’une raison claire de s’en passer. Un délai autour d’un code qui ne fait jamais de pause ne sert à rien : vérifie que quelque chose à l’intérieur attend vraiment.',
	sources: [
		{ title: 'home-assistant, pull request #106632', url: `${HA}/pull/106632` },
		{ title: 'Ticket #106606 : le déclencheur d’arrêt ne marche toujours pas', url: `${HA}/issues/106606` }
	]
};
