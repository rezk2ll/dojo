const HAPROXY = 'https://github.com/haproxy/haproxy/blob/a383051731cfa80f0196bdecc4c6a2ab7c1ea234';
const CHECK = `${HAPROXY}/src/check.c`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'health-checks',
	part: 'Entre services',
	title: 'Les health checks',
	minutes: 10,
	hook: [
		'Le 27 octobre 2019 vers 18 h 30 UTC, un des load balancers de Healthchecks.io "was intermittently unable to reach the backend servers over their private IP addresses" (n’arrivait plus, par moments, à joindre les backends sur le réseau privé). Le rapport d’incident : "Haproxy was reporting backends sporadically flipping between healthy / unhealthy states."',
		'Un script de supervision a retiré ce load balancer de la rotation DNS, et le second a continué à servir. L’hébergeur a annoncé le réseau réparé à 22 h 21 UTC, presque 4 heures après le début.',
		'Chaque bascule venait du health check de HAProxy qui changeait d’avis. Par défaut, HAProxy teste un serveur toutes les 2000 ms, le marque hors service après 3 échecs d’affilée, et le remet en service après 2 succès.'
	],
	terms: [
		{ term: 'Health check actif', def: 'Une sonde que le balancer envoie selon son propre rythme, sans requête d’utilisateur : une connexion TCP, ou une requête HTTP comme `option httpchk` dans HAProxy.' },
		{ term: 'Health check passif', def: 'Un verdict tiré du vrai trafic. Envoy l’appelle outlier detection : un hôte qui renvoie 5 réponses 5xx d’affilée est éjecté 30 s par défaut.' },
		{ term: 'rise et fall', def: 'Les deux seuils de HAProxy : `fall 3` échecs d’affilée marquent un serveur DOWN, `rise 2` succès d’affilée le marquent UP.' },
		{ term: 'Flapping', def: 'Un serveur qui passe sans cesse de UP à DOWN et inversement, si bien que le balancer l’ajoute au pool puis l’en retire en boucle.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['hap["HAProxy : server web1 check, server web2 check"] -->|"OPTIONS / toutes les 2 s"| w1["web1"]', 'hap -->|"OPTIONS / toutes les 2 s"| w2["web2"]'],
				highlight: ['hap'],
				note: 'Avec `option httpchk` sans argument, HAProxy envoie `OPTIONS /` en HTTP/1.0 à chaque serveur. Le manuel : "responses 2xx and 3xx are considered valid, while all other ones indicate a server failure, including the lack of any response." (2xx et 3xx valent succès, tout le reste vaut échec, absence de réponse comprise).'
			},
			{
				add: ['w2 -->|"3 échecs d’affilée"| down["web2 DOWN : tout le trafic vers web1"]'],
				highlight: ['w2', 'down'],
				note: 'web2 plante. Ses 3 tests suivants échouent, soit environ 6 s à un test toutes les 2 s, et HAProxy le marque DOWN. Les requêtes envoyées à web2 pendant ces 6 s tombent sur un serveur mort. Ensuite, seul web1 reçoit du trafic, et HAProxy continue de tester web2.'
			},
			{
				add: ['env["Envoy outlier detection"] -->|"5 réponses 5xx d’affilée sur du vrai trafic"| ej["hôte éjecté 30 s, puis 60 s, puis 90 s"]'],
				highlight: ['env', 'ej'],
				note: 'Un check passif n’a besoin d’aucune sonde. Envoy compte les erreurs sur les vraies requêtes, éjecte un hôte après 5 réponses 5xx d’affilée, et le réintègre après `base_ejection_time` (30 s). Chaque nouvelle éjection d’affilée dure 30 s de plus, jusqu’à `max_ejection_time` (300 s). Par défaut, au plus 10 % des hôtes d’un cluster peuvent être éjectés (`max_ejection_percent`).'
			},
			{
				add: ['net["Réseau instable : des tests perdus"] -.-> w2', 'w2 -.->|"DOWN, UP, DOWN, UP"| hap'],
				highlight: ['net'],
				note: 'Quand une partie des tests échoue et l’autre passe, un serveur peut franchir les deux seuils encore et encore. Healthchecks.io l’a vu pendant que son load balancer ne joignait les backends qu’une partie du temps : chaque UP renvoyait du trafic vers des backends que le balancer ne joignait pas de façon fiable.'
			},
			{
				add: ['all["Tous les serveurs DOWN"] -->|"HAProxy"| e503["503 au client"]', 'all -->|"Envoy, moins de 50 % sains"| panic["panic : répartition sur tous les hôtes"]'],
				highlight: ['all', 'e503', 'panic'],
				note: 'Quand aucun serveur n’est UP, HAProxy répond 503, "when no server was available to handle the request". Envoy a un seuil de panique, 50 % par défaut : en dessous, Envoy ignore l’état de santé et répartit le trafic sur tous les hôtes. La doc explique pourquoi : "to avoid a situation in which host failures cascade throughout the cluster as load increases" (éviter que les pannes se propagent en cascade quand la charge monte).'
			}
		]
	},
	example: {
		title: 'src/check.c : set_server_check_status, le compteur rise et fall',
		repo: 'haproxy/haproxy',
		url: `${CHECK}#L504-L538`,
		lang: 'c',
		code: `	switch (check->result) {
	case CHK_RES_FAILED:
		/* Failure to connect to the agent as a secondary check should not
		 * cause the server to be marked down.
		 */
		if ((!(check->state & CHK_ST_AGENT) ||
		    (check->status >= HCHK_STATUS_L57DATA)) &&
		    (check->health > 0)) {
			if (s->counters.shared.tg)
				_HA_ATOMIC_INC(&s->counters.shared.tg[tgid - 1]->failed_checks);
			report = 1;
			check->health--;
			if (check->health < check->rise)
				check->health = 0;
		}
		break;

	case CHK_RES_PASSED:
	case CHK_RES_CONDPASS:
		if (check->health < check->rise + check->fall - 1) {
			report = 1;
			check->health++;

			if (check->health >= check->rise)
				check->health = check->rise + check->fall - 1; /* OK now */
		}

		/* clear consecutive_errors if observing is enabled */
		if (s->onerror)
			HA_ATOMIC_STORE(&s->consecutive_errors, 0);
		break;

	default:
		break;
	}`,
		notes: [
			'`check->health` est un seul compteur, de 0 à `rise + fall - 1`, soit 4 avec les valeurs par défaut. La [ligne de journal](' + CHECK + '#L554-L557) affiche le serveur UP tant que `health >= rise`, et DOWN en dessous.',
			'La ligne 12 retire un pour un test raté. Les lignes 13 et 14 ramènent le compteur à 0 dès qu’il passe sous `rise`. Depuis 4, les échecs donnent 3, puis 2, puis 0 : le troisième échec marque le serveur DOWN.',
			'La ligne 22 ajoute un pour un test réussi, et les lignes 24 et 25 sautent directement à 4 dès que le compteur atteint `rise`. Depuis 0, les succès donnent 1, puis 4 : le deuxième succès marque le serveur UP.',
			'Les lignes 29 et 30 remettent `consecutive_errors` à zéro après un test réussi. Ce compteur sert à `observe layer7`, le check passif de HAProxy : après `error-limit` (10) mauvaises réponses d’affilée, le défaut `on-error fail-check` compte un test raté.'
		]
	},
	tradeoff: {
		gain: [
			'Un check actif trouve un serveur mort même sans trafic : HAProxy envoie sa sonde toutes les 2 s, qu’il y ait des requêtes ou non.',
			'Un check passif juge les vraies requêtes : Envoy éjecte un hôte après 5 réponses 5xx d’affilée, même si son URL `/health` répond toujours 200.',
			'Un test perdu ne retire pas un serveur : un serveur UP à 4 descend à 3, et le succès suivant le remet à 4 sans qu’il quitte le pool.'
		],
		cost: [
			'Les sondes ajoutent de la charge : 20 instances HAProxy qui testent 50 backends toutes les 2 s envoient 500 tests par seconde.',
			'Un check qui teste aussi la base de données marque tous les backends DOWN d’un coup quand la base tombe. HAProxy répond alors 503 à toutes les requêtes, même à celles qui n’avaient pas besoin de la base.',
			'Un serveur planté reçoit encore des requêtes jusqu’au 3e test raté, environ 6 s avec les valeurs par défaut. Le check passif d’Envoy a le même trou : 5 requêtes d’utilisateurs ratées avant l’éjection.'
		]
	},
	task: {
		prompt: 'Une ligne server de HAProxy a `check` avec les valeurs par défaut (`inter 2s`, `rise 2`, `fall 3`). Le serveur est UP avec `health` à 4. Les 10 tests suivants donnent : échec, succès, échec, échec, succès, échec, échec, échec, succès, succès. Après quel test le serveur passe-t-il DOWN, et après quel test redevient-il UP ?',
		hint: 'Sers-toi des lignes 12 à 14 et 22 à 25 de l’exemple. UP veut dire `health >= 2`. Note le compteur après chaque test.',
		answer: [
			'Compteur après chaque test : 3, 4, 3, 2, 4, 3, 2, 0, 1, 4. Un succès pendant que le serveur est UP remet le compteur à 4 (lignes 24 et 25) : les deux premiers échecs d’affilée ne le font jamais passer sous 2.',
			'Le serveur passe DOWN après le test 8, le troisième échec d’affilée : le compteur descend de 2 à 1, sous `rise`, et la ligne 14 le met à 0.',
			'Il repasse UP après le test 10 : le test 9 donne 1, le test 10 donne 2, qui atteint `rise`, et la ligne 25 met 4.',
			'Avec un test toutes les 2 s, le test 8 tourne environ 16 s après le premier. Les échecs des tests 1, 3 et 4 n’ont pas retiré le serveur, car un succès est arrivé avant un troisième échec d’affilée.'
		]
	},
	quiz: [
		{
			q: 'Un backend derrière HAProxy plante. La ligne server a `check` et aucune autre option. Au bout de combien de temps HAProxy arrête-t-il de lui envoyer du trafic ?',
			options: [
				'Tout de suite, car la première requête ratée marque le serveur DOWN',
				'Environ 6 s : trois tests ratés d’affilée, un toutes les 2 s',
				'Environ 4 s : deux tests ratés d’affilée, un toutes les 2 s',
				'Jamais, car `check` seul ne teste qu’une connexion TCP'
			],
			answer: 1,
			why: 'Les défauts sont `inter 2000` et `fall 3`. Un processus planté refuse la connexion TCP, donc même un simple test TCP échoue. HAProxy marque le serveur DOWN au troisième échec d’affilée. `rise 2` est le nombre de succès pour revenir.'
		},
		{
			q: 'Le `/health` d’un service répond 200, mais 30 % des vraies requêtes renvoient 500 parce qu’une de ses dépendances tombe. Quel check le retire du pool ?',
			options: [
				'`option httpchk GET /health` de HAProxy, car il tourne toutes les 2 s',
				'Un simple test TCP, car les 500 ferment la connexion',
				'Un check passif comme l’outlier detection d’Envoy ou `observe layer7` de HAProxy',
				'Aucun, car une réponse 500 compte comme une réponse saine'
			],
			answer: 2,
			why: 'Le check actif ne voit que `/health`, qui répond toujours 200. Un check passif compte les erreurs sur les vraies requêtes : Envoy éjecte après 5 réponses 5xx d’affilée, HAProxy compte un test raté après 10 erreurs d’affilée avec `observe layer7`. Les deux cherchent des erreurs d’affilée, donc 30 % d’erreurs ne les déclenchent que si assez de 500 se suivent.'
		},
		{
			q: 'Les health checks actifs d’Envoy marquent 3 des 4 hôtes d’un cluster comme malades. Avec les réglages par défaut, où va le trafic ?',
			options: [
				'Vers le seul hôte sain, qui prend maintenant tout le trafic',
				'Nulle part : Envoy répond 503 jusqu’à ce qu’un deuxième hôte guérisse',
				'Vers l’hôte sain, plus les hôtes malades avec un poids divisé par deux',
				'Vers les 4 hôtes, car 25 % de sains est sous le seuil de panique de 50 %'
			],
			answer: 3,
			why: 'Sous le seuil de panique, 50 % par défaut, Envoy ignore l’état de santé et répartit sur tous les hôtes. Cela évite qu’une série de pannes envoie toute la charge sur un seul hôte et le fasse tomber à son tour.'
		}
	],
	recall: {
		q: 'Avec les `rise` et `fall` par défaut de HAProxy, combien de tests ratés d’affilée marquent un serveur DOWN, et combien de succès le ramènent ?',
		a: '`fall 3` : 3 tests ratés d’affilée, un toutes les 2000 ms, le marquent DOWN. `rise 2` : 2 succès d’affilée le marquent UP. Le compteur va de 0 à 4 dans `check.c`.'
	},
	sources: [
		{ title: 'Healthchecks.io, Incident Report: 27 October 2019', url: 'https://blog.healthchecks.io/2019/10/incident-report-27-october-2019/' },
		{ title: 'Manuel de configuration HAProxy (check, inter, rise, fall, observe, option httpchk)', url: 'https://github.com/haproxy/haproxy/blob/a383051731cfa80f0196bdecc4c6a2ab7c1ea234/doc/configuration.txt' },
		{ title: 'Doc Envoy, Outlier detection', url: 'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/outlier' },
		{ title: 'API Envoy, outlier_detection.proto (valeurs par défaut)', url: 'https://github.com/envoyproxy/envoy/blob/fc9cbc5f8cf8ea60289b6110850b2a2649fb3627/api/envoy/config/cluster/v3/outlier_detection.proto' },
		{ title: 'Doc Envoy, Panic threshold', url: 'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/panic_threshold' }
	]
};
