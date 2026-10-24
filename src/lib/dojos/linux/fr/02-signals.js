const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const PM = `${PG}/src/backend/postmaster/postmaster.c`;
const PGIMG = 'https://github.com/docker-library/postgres/blob/dfc76bb299b057785026eb2eea39556b6fe52983/17/bookworm/Dockerfile';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'signals',
	part: 'Les processus',
	title: 'Les signaux',
	minutes: 10,
	hook: [
		'Tu lances `docker stop db` sur un conteneur PostgreSQL démarré avec `--stop-signal SIGTERM`, pendant qu’un client exécute une longue requête. La commande reste bloquée 10 secondes, puis rend la main. `docker logs db` affiche `received smart shutdown request`.',
		'Docker a envoyé SIGTERM au processus principal, a attendu ses 10 secondes par défaut, puis a envoyé SIGKILL. Pour PostgreSQL, SIGTERM veut dire Smart Shutdown : refuser les nouvelles connexions, puis attendre la fin de chaque session ouverte. La session avec la longue requête ne s’est pas terminée, et **le noyau a tué le serveur à la seconde 10** sans exécuter une ligne de son code.',
		'L’image officielle `postgres` contient `STOPSIGNAL SIGINT` dans son Dockerfile. Pour PostgreSQL, SIGINT veut dire Fast Shutdown : il annule les transactions ouvertes et s’arrête proprement.'
	],
	terms: [
		{ term: 'Signal', def: 'Un avis numéroté que le noyau remet à un processus, envoyé par un autre processus avec `kill()` ou par le noyau lui-même. SIGTERM porte le numéro 15, SIGKILL le 9 sur x86.' },
		{ term: 'Disposition', def: 'Ce que fait un processus quand un signal donné arrive : l’action par défaut (souvent terminer), l’ignorer, ou lancer un handler.' },
		{ term: 'Handler', def: 'Une fonction que le programme enregistre avec `sigaction()`. Le noyau l’appelle à l’arrivée du signal. SIGKILL et SIGSTOP ne peuvent pas en avoir.' },
		{ term: 'Délai de grâce', def: 'Les secondes que `docker stop` attend entre le signal d’arrêt et SIGKILL. 10 par défaut, réglable avec `--stop-timeout` ou `docker stop -t`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['dk["docker stop db"] -->|"kill SIGTERM"| pm["postgres, processus principal du conteneur"]'],
				highlight: ['dk', 'pm'],
				note: 'Docker envoie au processus principal le `StopSignal` de l’image, ou SIGTERM si l’image n’en fixe pas. Il attend ensuite jusqu’au délai : 10 secondes pour un conteneur Linux, sauf si `--stop-timeout` ou `-t` dit autre chose.'
			},
			{
				add: ['pm --> h["Le handler tourne : pending_pm_shutdown_request = true"]'],
				highlight: ['h'],
				note: 'Le noyau marque SIGTERM comme en attente. Au prochain retour du mode noyau vers le mode utilisateur, il voit un signal en attente avec un handler, sauve le compteur de programme et les registres sur la pile, puis saute dans le handler. Celui de PostgreSQL lève un drapeau et rend la main.'
			},
			{
				add: ['h --> smart["Smart Shutdown : plus de nouvelles connexions, attente de chaque session"]', 'smart --> busy["Une session exécute encore sa requête"]'],
				highlight: ['smart', 'busy'],
				note: 'La boucle principale voit le drapeau et écrit `received smart shutdown request`. La doc : le serveur « lets existing sessions end their work normally. It shuts down only after all of the sessions terminate. » Une requête de 600 secondes garde le serveur debout au moins 600 secondes.'
			},
			{
				add: ['dk -->|"10 s plus tard : SIGKILL"| dead["Le noyau termine postgres, aucun code de postgres ne tourne"]'],
				highlight: ['dead'],
				note: 'SIGKILL ne peut être ni intercepté, ni bloqué, ni ignoré. Le noyau termine le processus et aucun handler ne tourne. La doc de PostgreSQL prévient : avec SIGKILL, le serveur ne libère pas « shared memory and semaphores », et il ne transmet pas le signal à ses processus enfants.'
			},
			{
				add: ['img["STOPSIGNAL SIGINT dans l’image"] -->|"SIGINT"| fast["Fast Shutdown : les enfants reçoivent SIGTERM, les transactions sont annulées"]'],
				highlight: ['img', 'fast'],
				note: 'Avec SIGINT, le serveur « sends all existing server processes SIGTERM, which will cause them to abort their current transactions and exit promptly ». L’image officielle le règle ainsi pour qu’un simple `docker stop` demande un Fast Shutdown.'
			}
		]
	},
	example: {
		title: 'src/backend/postmaster/postmaster.c : un handler, trois modes d’arrêt',
		repo: 'postgres/postgres',
		url: `${PM}#L2042-L2153`,
		lang: 'c',
		code: `/*
 * pg_ctl uses SIGTERM, SIGINT and SIGQUIT to request different types of
 * shutdown.
 */
static void
handle_pm_shutdown_request_signal(SIGNAL_ARGS)
{
	switch (postgres_signal_arg)
	{
		case SIGTERM:
			/* smart is implied if the other two flags aren't set */
			pending_pm_shutdown_request = true;
			break;
		case SIGINT:
			pending_pm_fast_shutdown_request = true;
			pending_pm_shutdown_request = true;
			break;
		case SIGQUIT:
			pending_pm_immediate_shutdown_request = true;
			pending_pm_shutdown_request = true;
			break;
	}
	SetLatch(MyLatch);
}
…
	switch (mode)
	{
		case SmartShutdown:

			/*
			 * Smart Shutdown:
			 *
			 * Wait for children to end their work, then shut down.
			 */
			if (Shutdown >= SmartShutdown)
				break;
			Shutdown = SmartShutdown;
			ereport(LOG,
					(errmsg("received smart shutdown request")));
…
		case FastShutdown:

			/*
			 * Fast Shutdown:
			 *
			 * Abort all children with SIGTERM (rollback active transactions
			 * and exit) and shut down when they are gone.
			 */
			if (Shutdown >= FastShutdown)
				break;
			Shutdown = FastShutdown;
			ereport(LOG,
					(errmsg("received fast shutdown request")));`,
		notes: [
			'Au démarrage, [les lignes 551 à 553](' + PM + '#L551-L553) enregistrent ce seul handler pour SIGINT, SIGQUIT et SIGTERM. Les lignes 10 à 21 ne font que noter quel signal est arrivé, dans trois drapeaux.',
			'Ligne 23, `SetLatch()` réveille la boucle principale, et le handler rend la main. Le vrai travail se fait plus tard, hors du handler, quand la boucle appelle `process_pm_shutdown_request()`. signal-safety(7) explique pourquoi : un handler qui appelle `printf()` pendant que le programme est déjà dedans « will operate on inconsistent data ».',
			'Les lignes 28 à 39 forment la branche SIGTERM. Le commentaire de la ligne 33 dit ce qu’elle fait : attendre que les enfants finissent leur travail, puis s’arrêter. La ligne 39 écrit la ligne de log que tu vois après `docker stop`.',
			'Les lignes 41 à 53 forment la branche SIGINT. La ligne 46 annonce le plan : envoyer SIGTERM à tous les enfants, ce qui annule leurs transactions.',
			'Le switch n’a pas de `case SIGKILL`. sigaction(2) accepte « any valid signal except SIGKILL and SIGSTOP » : aucun programme ne peut enregistrer de code pour SIGKILL.'
		]
	},
	tradeoff: {
		gain: [
			'SIGTERM laisse le programme faire son propre arrêt : PostgreSQL refuse les nouvelles connexions et termine ses sessions avant de sortir.',
			'SIGKILL ne peut être ni intercepté, ni bloqué, ni ignoré : `docker stop` rend la main après le délai de grâce, même si le programme ne gère jamais SIGTERM.'
		],
		cost: [
			'Un handler qui attend ses clients peut dépasser 10 secondes. SIGKILL tombe alors en plein milieu, et PostgreSQL ne peut pas libérer sa mémoire partagée ni ses sémaphores.',
			'Chaque programme lit les signaux à sa façon : pour PostgreSQL, SIGTERM est un arrêt lent et poli. L’image doit fixer `STOPSIGNAL` au signal que le programme traite comme un arrêt rapide.'
		]
	},
	task: {
		prompt: 'Un conteneur a `python app.py` comme processus principal. `grep SigCgt /proc/<pid>/status` affiche `SigCgt: 0000000000004000`. Quels signaux intercepte-t-il, et que se passe-t-il au `docker stop` ? Le bit n-1 du masque représente le signal n.',
		hint: 'Écris 0x4000 en binaire et compte à partir du bit 0. Cherche ensuite le signal 15 dans signal(7).',
		answer: [
			'0x4000 vaut 2 puissance 14 : seul le bit 14 est à 1, c’est le signal 15, SIGTERM. Capturé pendant cette session : un processus Python avec `signal.signal(signal.SIGTERM, ...)` affiche exactement `0000000000004000`, et `sleep 60` n’affiche que des zéros.',
			'`docker stop` envoie SIGTERM, donc le handler du programme tourne. Si ce handler fait sortir le programme en moins de 10 secondes, Docker n’envoie jamais SIGKILL.',
			'Si le handler se contente d’écrire un log et de rendre la main, le programme continue. Docker envoie SIGKILL à la seconde 10, et le handler n’y peut rien.',
			'Pour comparer, capturé pendant cette session : `sleep 300` sans handler, après `kill -TERM`, sort avec le code 143. Une boucle bash avec `trap ... TERM` continue après `kill -TERM` et sort avec 137 après `kill -KILL`.'
		],
		steps: [
			{
				title: 'Décode le masque',
				questions: [
					{ q: 'Que liste la ligne `SigCgt` de `/proc/<pid>/status` ?', options: ['Les signaux que le processus a envoyés', 'Les signaux que le processus ignore', 'Les signaux en file, qui attendent d’être remis', 'Les signaux qu’il intercepte avec un handler'], answer: 3, why: '`SigCgt` est le masque des signaux interceptés : un bit par signal qui a un handler.' },
					{ q: '`0x4000` est quelle puissance de 2 ?', options: ['2 puissance 14', '2 puissance 15', '2 puissance 12', '2 puissance 4'], answer: 0, why: '0x4000 vaut 16384, soit 2 puissance 14. Un seul bit est à 1.' },
					{ q: 'Seul le bit 14 est à 1. Si le bit n-1 représente le signal n, quel est le numéro du signal ?', options: ['14', '15', '13', '16'], answer: 1, why: 'Le bit 14 est n-1 avec n = 15. On compte à partir du bit 0 pour le signal 1.' },
					{ q: '`sleep 60` affiche `SigCgt: 0000000000000000`. Qu’est-ce que ça t’apprend ?', options: ['`sleep` bloque tous les signaux jusqu’à son réveil', '`sleep` ne peut pas recevoir de signaux', '`sleep` n’a aucun handler : les défauts s’appliquent', 'Le noyau cache le masque des programmes courts'], answer: 2, why: 'Que des zéros, c’est aucun handler. SIGTERM applique alors son action par défaut : terminer.' }
				]
			},
			{
				title: 'Nomme le signal',
				questions: [
					{ q: 'Quel signal porte le numéro 15 ?', options: ['SIGKILL', 'SIGINT', 'SIGQUIT', 'SIGTERM'], answer: 3, why: 'signal(7) : SIGTERM vaut 15. SIGKILL vaut 9 sur x86.' },
					{ q: 'Quelle ligne Python donnerait exactement ce masque ?', options: ['`signal.signal(signal.SIGTERM, handler)`', '`signal.signal(signal.SIGKILL, handler)`', '`os.kill(os.getpid(), 15)`', '`signal.pause()`'], answer: 0, why: 'Enregistrer un handler pour SIGTERM met le bit 14 à 1. Le chapitre a capturé exactement `0000000000004000` dans ce cas.' },
					{ q: 'Pourrais-tu ajouter un bit pour SIGKILL dans ce masque ?', options: ['Oui, avec `sigaction()` quand le processus tourne en root', 'Non : SIGKILL ne peut être ni intercepté, ni bloqué, ni ignoré', 'Oui, mais seulement dans un conteneur', 'Seulement si SIGTERM est intercepté avant'], answer: 1, why: 'sigaction(2) accepte « any valid signal except SIGKILL and SIGSTOP ».' },
					{ q: 'Que ne te dit pas le masque sur le handler de SIGTERM ?', options: ['Qu’un handler existe', 'Pour quel signal il est', 'Si le handler fait sortir le programme', 'Que l’action par défaut est remplacée'], answer: 2, why: 'Le bit dit seulement qu’un handler est enregistré. Ce qu’il fait, sortir ou juste écrire un log, se lit dans le code.' }
				]
			},
			{
				title: 'Suis le docker stop',
				questions: [
					{ q: 'Qu’envoie d’abord `docker stop` quand l’image ne fixe aucun `STOPSIGNAL` ?', options: ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP'], answer: 0, why: 'Docker envoie le `StopSignal` de l’image, ou SIGTERM s’il n’y en a pas.' },
					{ q: 'Le handler nettoie et sort en moins de 10 secondes. Que se passe-t-il ensuite ?', options: ['Docker envoie quand même SIGKILL à la seconde 10', 'Docker redémarre le conteneur', 'Le noyau relance le handler une deuxième fois', 'Docker n’envoie jamais SIGKILL'], answer: 3, why: 'SIGKILL n’arrive que si le processus tourne encore à la fin du délai de grâce.' },
					{ q: 'Le handler se contente d’écrire un log et rend la main. Que se passe-t-il ?', options: ['Le programme sort de lui-même une fois le handler revenu', 'Il continue jusqu’au SIGKILL de la seconde 10', 'Docker attend le programme indéfiniment', 'Le noyau transforme tout de suite SIGTERM en SIGKILL'], answer: 1, why: 'Après le retour d’un handler, le programme reprend. Docker envoie SIGKILL quand les 10 secondes sont écoulées.' },
					{ q: 'Comment laisser plus de 10 secondes au programme ?', options: ['Intercepter SIGKILL dans le handler', 'Fixer `STOPSIGNAL SIGINT`', 'Passer `--stop-timeout` ou `docker stop -t`', 'Relancer le conteneur avec `--rm`'], answer: 2, why: 'Le délai de grâce vaut 10 secondes par défaut, et ces deux options le changent.' }
				]
			},
			{
				title: 'Vérifie les codes de sortie',
				questions: [
					{ q: '`sleep 300` sans handler reçoit `kill -TERM`. Quel code le shell voit-il ?', options: ['143', '137', '15', '0'], answer: 0, why: 'Capturé dans le chapitre : 143, soit 128 + 15 pour SIGTERM.' },
					{ q: 'Une boucle bash avec `trap ... TERM` reçoit `kill -TERM`. Que se passe-t-il ?', options: ['Elle sort avec 143', 'Elle sort avec 0', 'Elle sort avec 137', 'Elle continue de tourner'], answer: 3, why: 'Le trap est un handler : l’action par défaut ne s’applique plus.' },
					{ q: 'Cette boucle reçoit ensuite `kill -KILL`. Quel code ?', options: ['143', '137', '9', '1'], answer: 1, why: 'SIGKILL la termine quoi que dise le trap, et le code vaut 137, soit 128 + 9.' },
					{ q: 'Après un arrêt qui a pris 10 secondes, le processus principal a fini avec le code 137. Qu’est-ce que ça indique ?', options: ['Le handler est sorti en erreur', 'Le healthcheck a échoué', 'SIGKILL l’a terminé après le délai de grâce', 'SIGTERM a été remis deux fois'], answer: 2, why: '137 veut dire SIGKILL, et 10 secondes est le délai de grâce par défaut.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Pourquoi un processus peut-il exécuter du code de nettoyage après `kill -TERM`, mais jamais après `kill -KILL` ?',
			options: [
				'`kill -KILL` envoie SIGTERM neuf fois de suite, trop vite pour un handler',
				'Le noyau ne laisse aucun processus intercepter, bloquer ou ignorer SIGKILL',
				'Le handler de SIGKILL tourne, mais le noyau jette sa sortie',
				'Seuls les processus root ont le droit d’enregistrer un handler pour SIGKILL'
			],
			answer: 1,
			why: 'signal(7) : « The signals SIGKILL and SIGSTOP cannot be caught, blocked, or ignored. » sigaction(2) les refuse, il n’y a donc aucun handler à lancer, et le noyau applique l’action par défaut : terminer.'
		},
		{
			q: '`docker stop api` prend exactement 10 secondes à chaque fois. Quelle est la cause probable ?',
			options: [
				'Docker attend toujours 10 secondes pour vider les logs du conteneur',
				'Le noyau garde SIGTERM en file 10 secondes avant de le remettre',
				'Le processus principal ne sort pas sur SIGTERM, donc Docker envoie SIGKILL au bout du délai',
				'Le healthcheck du conteneur tourne toutes les 10 secondes et bloque l’arrêt'
			],
			answer: 2,
			why: 'Docker envoie le signal d’arrêt, SIGTERM par défaut, puis attend jusqu’à 10 secondes pour un conteneur Linux. Un processus qui ignore SIGTERM, ou qui le gère sans sortir, reçoit SIGKILL à la fin du délai.'
		},
		{
			q: 'Le processus principal de PostgreSQL reçoit SIGTERM avec 3 sessions ouvertes. Que fait-il ?',
			options: [
				'Il refuse les nouvelles connexions et attend que les 3 sessions finissent d’elles-mêmes',
				'Il envoie SIGTERM aux 3 sessions, annule leurs transactions et sort',
				'Il sort tout de suite sans checkpoint d’arrêt, et rejoue le WAL au prochain démarrage',
				'Il l’ignore, car seul `pg_ctl stop` peut arrêter le serveur'
			],
			answer: 0,
			why: 'SIGTERM, c’est le Smart Shutdown : le handler lève `pending_pm_shutdown_request`, et le serveur attend la fin de chaque session. Annuler les transactions correspond au Fast Shutdown (SIGINT). Sortir sans l’arrêt normal correspond à l’Immediate Shutdown (SIGQUIT).'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Lire le masque des signaux interceptés d’un processus, puis voir SIGTERM géré et SIGKILL non.',
		steps: [
			'Crée un dossier de travail : `mkdir -p ~/signal-lab && cd ~/signal-lab`.',
			'Écris un programme qui intercepte SIGTERM sans sortir : `printf \'import signal, time\\nsignal.signal(signal.SIGTERM, lambda s, f: print("got SIGTERM, ignoring", flush=True))\\nwhile True: time.sleep(1)\\n\' > app.py`.',
			'Lance-le en arrière-plan et lis son masque (Linux) : `python3 app.py & p=$!; sleep 1; grep SigCgt /proc/$p/status`.',
			'Envoie SIGTERM, vérifie qu’il tourne encore, puis envoie SIGKILL : `kill -TERM $p; sleep 1; kill -0 $p && echo still running; kill -KILL $p; wait $p; echo status=$?`.',
			'Compare avec un programme sans handler : `sleep 300 & s=$!; grep SigCgt /proc/$s/status; kill -TERM $s; wait $s; echo status=$?`.'
		],
		done: [
			'Le masque de `app.py` a le bit 14 à 1 : il finit par `4000`, ou par `4002` quand Python intercepte aussi SIGINT pour Ctrl-C.',
			'Après `kill -TERM`, le programme affiche `got SIGTERM, ignoring` et `still running` apparaît.',
			'Après `kill -KILL`, `status=137` apparaît.',
			'`sleep 300` montre un masque tout à zéro et finit avec `status=143`.'
		],
		solution: [
			'0x4000 est le bit 14, le signal 15, SIGTERM. Le bit 1 (0x2) est le signal 2, SIGINT.',
			'Le handler remplace l’action par défaut : SIGTERM n’affiche qu’une ligne. C’est ce qui fait attendre `docker stop` ses 10 secondes complètes.',
			'SIGKILL ne peut pas être intercepté, le noyau termine donc le processus : 128 + 9 = 137. Sans handler, SIGTERM termine `sleep` : 128 + 15 = 143.',
			'Sous macOS il n’y a pas de `/proc` : saute les `grep SigCgt`, les étapes `kill` marchent pareil.'
		]
	},
	recall: {
		q: 'Qu’envoie `docker stop` au processus principal, et quand arrive le deuxième signal ?',
		a: 'Le `StopSignal` de l’image, SIGTERM par défaut, puis SIGKILL si le processus tourne encore après 10 secondes. SIGKILL ne peut pas être intercepté : aucun code de nettoyage ne tourne.'
	},
	sources: [
		{ title: 'signal(7), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man7/signal.7.html' },
		{ title: 'sigaction(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/sigaction.2.html' },
		{ title: 'signal-safety(7), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man7/signal-safety.7.html' },
		{ title: 'Doc Docker, docker container stop', url: 'https://docs.docker.com/reference/cli/docker/container/stop/' },
		{ title: 'Doc PostgreSQL, Shutting Down the Server', url: 'https://www.postgresql.org/docs/current/server-shutdown.html' },
		{ title: 'docker-library/postgres, 17/bookworm/Dockerfile (STOPSIGNAL SIGINT)', url: PGIMG + '#L193-L215' }
	]
};
