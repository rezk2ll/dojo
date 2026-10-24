const U3 = 'https://github.com/urllib3/urllib3/blob/a37bc93b65d6bcf00d3dc43d966bab6bd130ecd8/src/urllib3/connectionpool.py';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'connection-pools',
	part: 'Entre services',
	title: 'Les pools de connexions',
	minutes: 10,
	hook: [
		'Un programme Go envoie 1000 requêtes GET à un serveur local, 50 à la fois, avec un clone de `http.DefaultTransport`. Lancé pour ce chapitre (go1.24.4), il a ouvert 749 nouvelles connexions TCP, et `ss` a ensuite montré 747 sockets client en `TIME_WAIT`. Le même programme avec `MaxIdleConnsPerHost: 50` a ouvert 41 connexions et n’en a laissé aucune en `TIME_WAIT`.',
		'Par défaut, Go garde au plus 2 connexions inactives par hôte : `DefaultMaxIdleConnsPerHost = 2`. Après chaque vague de 50 réponses, le transport en garde 2 et ferme les 48 autres, et la vague suivante en ouvre 48 nouvelles.',
		'Chaque nouvelle connexion paie ses poignées de main avant le premier octet. Dans cette session, `curl` a reçu le premier octet de https://example.org/ après 42 ms sur une connexion neuve, et après 11 ms sur une connexion réutilisée.'
	],
	terms: [
		{ term: 'Pool de connexions', def: 'Une liste par hôte de connexions ouvertes qu’une bibliothèque cliente garde entre deux requêtes, pour que la suivante saute les poignées de main TCP et TLS.' },
		{ term: 'Connexion inactive', def: 'Une connexion du pool sans requête en cours. Go la ferme après `IdleConnTimeout`, 90 s dans `DefaultTransport`.' },
		{ term: 'Taille du pool', def: 'Le nombre de connexions inactives que le pool garde par hôte : `MaxIdleConnsPerHost` en Go (2 par défaut), `maxsize` dans urllib3 (1 par défaut), `pool_maxsize` dans requests (10 par défaut).' },
		{ term: 'Pool bloquant', def: 'Un pool qui plafonne le nombre de connexions en service à sa taille. Une requête qui ne trouve aucune connexion libre attend au lieu d’en ouvrir une : urllib3 avec `block=True`, Go avec `MaxConnsPerHost`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['g["50 goroutines appellent Get en même temps"] --> tr["Transport : aucune connexion inactive pour l’hôte"]', 'tr -->|"50 connexions ouvertes"| s["Serveur"]'],
				highlight: ['g', 'tr'],
				note: 'Le pool démarre vide : chacune des 50 requêtes ouvre sa propre connexion TCP. En HTTPS, chacune fait aussi une poignée de main TLS. `MaxConnsPerHost` vaut 0 par défaut, donc aucune limite sur les ouvertures.'
			},
			{
				add: ['s -->|"50 réponses"| tr', 'tr --> keep["2 gardées inactives"]', 'tr --> drop["48 fermées : errTooManyIdleHost"]'],
				highlight: ['keep', 'drop'],
				note: 'Une fois la réponse lue, le transport propose la connexion au pool. `tryPutIdleConn` renvoie `errTooManyIdleHost` dès que l’hôte a déjà 2 connexions inactives, et la connexion est fermée. Le client ferme en premier, donc ses 48 sockets passent en `TIME_WAIT`.'
			},
			{
				add: ['g2["50 requêtes suivantes"] -->|"2 réutilisées"| keep', 'g2 -->|"48 nouvelles ouvertures"| s'],
				highlight: ['g2'],
				note: 'La vague suivante trouve 2 connexions inactives et en rouvre 48. Sur 20 vagues, le test ci-dessus a ouvert 749 connexions pour 1000 requêtes.'
			},
			{
				add: ['fix["MaxIdleConnsPerHost: 50"] --> keep'],
				highlight: ['fix'],
				note: 'Avec de la place pour 50 connexions inactives, chaque connexion revient au pool et la vague suivante la réutilise. Le test a ouvert 41 connexions au total. Une connexion que personne ne reprend pendant 90 s est fermée par `IdleConnTimeout`.'
			},
			{
				add: ['py["pool urllib3 : maxsize 10, block=True"] -->|"11e thread"| wait["attend ; EmptyPoolError après pool_timeout"]'],
				highlight: ['py', 'wait'],
				note: 'Avec un pool bloquant, une requête qui trouve le pool vide attend qu’une autre rende sa connexion. urllib3 attend sans limite, ou lève `EmptyPoolError` après `pool_timeout` secondes si tu en fixes un. Avec `block=False`, le défaut, il ouvre une connexion en plus et la jette ensuite.'
			}
		]
	},
	example: {
		title: 'src/urllib3/connectionpool.py : prendre une connexion et la rendre',
		repo: 'urllib3/urllib3',
		url: `${U3}#L262-L341`,
		lang: 'python',
		code: `    def _get_conn(self, timeout: float | None = None) -> BaseHTTPConnection:
…
        conn = None

        if self.pool is None:
            raise ClosedPoolError(self, "Pool is closed.")

        try:
            conn = self.pool.get(block=self.block, timeout=timeout)

        except AttributeError:  # self.pool is None
            raise ClosedPoolError(self, "Pool is closed.") from None  # Defensive:

        except queue.Empty:
            if self.block:
                raise EmptyPoolError(
                    self,
                    "Pool is empty and a new connection can't be opened due to blocking mode.",
                ) from None
            pass  # Oh well, we'll create a new connection then

        # If this is a persistent connection, check if it got disconnected
        if conn and is_connection_dropped(conn):
            log.debug("Resetting dropped connection: %s", self.host)
            conn.close()

        return conn or self._new_conn()

    def _put_conn(self, conn: BaseHTTPConnection | None) -> None:
…
        if self.pool is not None:
            try:
                self.pool.put(conn, block=False)
                return  # Everything is dandy, done.
            except AttributeError:
                # self.pool is None.
                pass
            except queue.Full:
                # Connection never got put back into the pool, close it.
                if conn:
                    conn.close()

                if self.block:
                    # This should never happen if you got the conn from self._get_conn
                    raise FullPoolError(
                        self,
                        "Pool reached maximum size and no more connections are allowed.",
                    ) from None

                log.warning(
                    "Connection pool is full, discarding connection: %s. Connection pool size: %s",
                    self.host,
                    self.pool.qsize(),
                )

        # Connection never got put back into the pool, close it.
        if conn:
            conn.close()`,
		notes: [
			'`self.pool` est une `queue.LifoQueue` de `maxsize` places, [remplie de `None`](' + U3 + '#L214-L216) à la création. La ligne 9 prend la dernière connexion rendue, ou un `None`, et pour un `None` la ligne 27 appelle `_new_conn()`.',
			'Les lignes 14 à 20 tournent quand la file est vide, c’est-à-dire quand `maxsize` connexions sont déjà en service. Avec `block=True`, la ligne 9 a attendu `timeout` secondes (sans fin s’il vaut `None`, le défaut), et la ligne 16 lève `EmptyPoolError`. Avec `block=False`, la ligne 20 laisse passer et la ligne 27 ouvre une connexion au-delà de la taille du pool.',
			'La ligne 33 rend une connexion sans attendre. Si la file est pleine, les lignes 40 et 41 la ferment et la ligne 50 écrit l’avertissement. Une `requests.Session` partagée par 32 threads, lancée pour ce chapitre (requests 2.31.0), l’a écrit 22 fois en 320 appels : "Connection pool is full, discarding connection: 127.0.0.1. Connection pool size: 10".',
			'La ligne 23 vérifie une connexion du pool avant de la réutiliser. Si le serveur l’a fermée pendant qu’elle attendait, la ligne 25 la ferme et la ligne 27 en ouvre une neuve.'
		]
	},
	tradeoff: {
		gain: [
			'Une connexion réutilisée saute les poignées de main TCP et TLS : 11 ms avant le premier octet au lieu de 42 ms pour example.org dans cette session.',
			'Un pool à la taille de la concurrence du client arrête le va-et-vient : 41 connexions et 0 socket en `TIME_WAIT` pour 1000 requêtes, contre 749 et 747 avec le défaut de 2 de Go.'
		],
		cost: [
			'Chaque connexion inactive occupe une socket et de la mémoire des deux côtés, jusqu’à ce que `IdleConnTimeout` (90 s en Go) ou l’idle timeout du serveur la ferme. 50 connexions inactives depuis chacun de 40 pods clients font 2000 sockets sur le serveur.',
			'Le serveur peut fermer une connexion du pool pendant qu’elle attend. urllib3 vérifie avec `is_connection_dropped` avant de la reprendre, et Go rejoue certaines requêtes tombées sur une connexion inactive fermée (chapitre 27).',
			'Un pool bloquant plafonne la charge sur le serveur, mais déplace l’attente vers le client. Avec `block=True`, le 11e thread d’un pool de taille 10 attend, sans limite tant que `pool_timeout` n’est pas fixé.'
		]
	},
	task: {
		prompt: 'Un worker Python lance 32 threads qui partagent une seule `requests.Session` et appellent le même hôte d’API. Son journal se remplit de "Connection pool is full, discarding connection: api.internal. Connection pool size: 10". Explique l’avertissement, donne la ligne qui le corrige, et dis ce que changerait `pool_block=True`.',
		hint: 'requests construit son pool avec `DEFAULT_POOLSIZE = 10` et `DEFAULT_POOLBLOCK = False`. Compte combien de connexions les 32 threads tiennent au pic.',
		answer: [
			'Jusqu’à 32 threads tiennent une connexion en même temps. Le pool a `block=False` : urllib3 ouvre jusqu’à 32 connexions. Sa file n’en garde que 10. Chaque connexion rendue à une file pleine est fermée et journalisée, et la requête suivante en ouvre une neuve.',
			'Correction : `session.mount("https://", requests.adapters.HTTPAdapter(pool_maxsize=32))`. Dans le test lancé pour ce chapitre, ce changement a fait passer les avertissements de 22 à 0.',
			'Avec `pool_block=True` et une taille de 10, au plus 10 requêtes tournent en même temps. Les 22 autres threads attendent qu’une connexion revienne. L’API ne voit jamais plus de 10 connexions, mais les threads passent du temps à attendre. requests appelle `urlopen` sans `pool_timeout`, donc cette attente n’a pas de limite.'
		],
		steps: [
			{
				title: 'Compte les connexions',
				questions: [
					{ q: 'Combien de connexions peuvent être utilisées au pic ?', options: ['32, une par thread', '10, la taille du pool', '1, puisque la session est partagée', '2, comme le défaut de Go'], answer: 0, why: 'Chacun des 32 threads tient une connexion pendant sa requête, et tous appellent le même hôte.' },
					{ q: 'Quelle taille de pool requests donne-t-il par défaut ?', options: ['1, comme urllib3', '10, via `DEFAULT_POOLSIZE`', '32, une par thread', 'Aucune limite'], answer: 1, why: 'La ligne de journal le dit : "Connection pool size: 10". requests fixe `DEFAULT_POOLSIZE = 10`.' },
					{ q: 'La file est vide et un 11e thread demande une connexion. Avec `block=False`, que fait urllib3 ?', options: ['Il attend qu’une connexion revienne', 'Il lève `EmptyPoolError`', 'Il ouvre une nouvelle connexion au-delà de la taille du pool', 'Il partage une connexion occupée'], answer: 2, why: 'Sur `queue.Empty` avec `block=False`, `_get_conn` continue et appelle `_new_conn()`.' },
					{ q: 'Combien de connexions peuvent donc être ouvertes en même temps ?', options: ['10, jamais plus', '22, celles au-delà du pool', '1, réutilisée à tour de rôle', 'Jusqu’à 32'], answer: 3, why: 'Chaque thread qui trouve la file vide ouvre la sienne : le nombre suit les threads, pas la taille du pool.' }
				]
			},
			{
				title: 'Explique l’avertissement',
				questions: [
					{ q: 'Quand urllib3 journalise-t-il "Connection pool is full, discarding connection" ?', options: ['Quand le serveur refuse une nouvelle connexion', 'Quand une connexion rendue trouve la file déjà pleine', 'Quand une requête attend plus que `pool_timeout`', 'Quand une connexion coupée est remplacée'], answer: 1, why: '`_put_conn` remet la connexion avec `block=False`. Sur `queue.Full`, il la ferme et journalise l’avertissement.' },
					{ q: 'Que devient cette connexion ?', options: ['Elle est fermée', 'Elle reste ouverte hors du pool', 'Elle part vers un thread qui attend', 'Elle est rendue au serveur pour être réutilisée'], answer: 0, why: 'Les lignes 40 et 41 la ferment. Ses poignées de main TCP et TLS sont perdues.' },
					{ q: 'Que fait une requête suivante quand la file est de nouveau vide ?', options: ['Elle réutilise la connexion fermée', 'Elle attend que l’avertissement disparaisse', 'Elle ouvre une nouvelle connexion, avec de nouvelles poignées de main', 'Elle échoue avec `FullPoolError`'], answer: 2, why: 'Avec 10 places pour 32 utilisateurs, la file se vide de nouveau et `_new_conn()` tourne. C’est ce va-et-vient que signale l’avertissement.' },
					{ q: 'Les threads voient-ils une erreur ?', options: ['Oui : chaque avertissement est une requête échouée', 'Oui : ils reçoivent `EmptyPoolError`', 'Seulement pour les appels HTTPS', 'Non : les requêtes réussissent, le coût est en connexions en plus'], answer: 3, why: 'L’avertissement porte sur une connexion jetée après la fin de sa requête. Le coût, ce sont les poignées de main des nouvelles.' }
				]
			},
			{
				title: 'Écris la correction',
				questions: [
					{ q: 'Quelle ligne corrige le problème ?', options: ['`session.max_redirects = 32`', '`session.mount("https://", requests.adapters.HTTPAdapter(pool_connections=32))`', '`session.mount("https://", requests.adapters.HTTPAdapter(pool_maxsize=32))`', '`requests.Session(pool_block=True)`'], answer: 2, why: '`pool_maxsize` est la taille de la file de chaque hôte. 32 places suffisent pour toutes les connexions que les threads ouvrent.' },
					{ q: 'Pourquoi 32 ?', options: ['C’est le nombre de threads qui tiennent une connexion au pic', 'C’est le double du défaut de 16', 'C’est la limite de connexions de l’API', 'C’est le défaut de Go pour un hôte'], answer: 0, why: 'Un pool dimensionné sur la concurrence du client arrête le va-et-vient : chaque connexion rendue trouve une place.' },
					{ q: 'Qu’a donné ce changement dans le test lancé pour ce chapitre ?', options: ['Les avertissements sont passés de 22 à 10', 'Les avertissements sont passés de 22 à 0', 'Rien n’a changé', 'Les avertissements ont doublé'], answer: 1, why: 'Avec 32 places, aucune connexion rendue n’est tombée sur une file pleine.' },
					{ q: 'Que coûte `pool_maxsize=32` ?', options: ['Chaque requête devient plus lente', 'Plus de sockets en `TIME_WAIT`', 'Rien du tout', 'Jusqu’à 32 connexions inactives tenues des deux côtés jusqu’à ce que l’un les ferme'], answer: 3, why: 'Une connexion inactive tient un socket et de la mémoire chez le client et chez le serveur jusqu’à ce qu’un idle timeout la ferme.' }
				]
			},
			{
				title: 'Pèse `pool_block=True`',
				questions: [
					{ q: 'Avec `pool_block=True` et une taille de 10, combien de requêtes tournent en même temps ?', options: ['10', '32', '22', '1'], answer: 0, why: 'Un pool bloquant plafonne les connexions utilisées à sa taille.' },
					{ q: 'Que font les 22 autres threads ?', options: ['Ils ouvrent des connexions en plus', 'Ils échouent avec `FullPoolError`', 'Ils attendent qu’une connexion revienne', 'Ils partagent une connexion occupée'], answer: 2, why: '`_get_conn` appelle `self.pool.get(block=True, ...)`, qui attend qu’un autre thread en rende une.' },
					{ q: 'Combien de temps peuvent-ils attendre ?', options: ['5 s, puis `EmptyPoolError`', '90 s, l’idle timeout', '60 s, comme un balancer', 'Sans limite : requests appelle `urlopen` sans `pool_timeout`'], answer: 3, why: 'Avec `timeout=None`, `queue.get` attend indéfiniment.' },
					{ q: 'Quand `pool_block=True` a-t-il du sens ?', options: ['Quand l’avertissement remplit le journal', 'Quand l’API ne doit jamais voir plus de 10 connexions de ce worker', 'Toujours, c’est plus rapide', 'Jamais, c’est obsolète'], answer: 1, why: 'Il protège le serveur des connexions en plus, et le prix, ce sont des threads qui attendent côté client.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un service Go utilise `http.DefaultClient` et envoie 50 requêtes à la fois au même hôte. Après chaque vague, qu’arrive-t-il aux 50 connexions ?',
			options: [
				'Les 50 restent ouvertes dans le pool jusqu’à ce que `IdleConnTimeout` les ferme après 90 s',
				'2 restent inactives dans le pool et 48 sont fermées, avec des sockets client en `TIME_WAIT`',
				'Les 50 sont fermées, car `DefaultClient` n’utilise pas de connexions keep-alive',
				'Les 50 requêtes attendent une seule connexion partagée, car la taille du pool vaut 1'
			],
			answer: 1,
			why: '`DefaultMaxIdleConnsPerHost` vaut 2. `tryPutIdleConn` renvoie `errTooManyIdleHost` à partir de la 3e connexion inactive vers le même hôte, et le transport la ferme. La vague suivante doit ouvrir 48 nouvelles connexions.'
		},
		{
			q: 'urllib3 écrit "Connection pool is full, discarding connection". Que s’est-il passé ?',
			options: [
				'Le serveur a refusé une nouvelle connexion car il a atteint sa propre limite',
				'Une requête a attendu plus longtemps que le timeout du pool et a été annulée',
				'Plus de `maxsize` connexions étaient ouvertes, et la file n’avait plus de place',
				'Une connexion du pool était fermée par le serveur et a été remplacée'
			],
			answer: 2,
			why: 'Avec `block=False`, `_get_conn` ouvre une nouvelle connexion quand la file est vide : plus de `maxsize` connexions peuvent être en service. `_put_conn` remet la connexion avec `block=False`. Si la file est pleine, il ferme la connexion et écrit cet avertissement.'
		},
		{
			q: 'Un pool urllib3 a `maxsize=10` et `block=True`, et les requêtes passent `pool_timeout=5`. Dix threads sont en pleine requête quand un 11e demande une connexion. Que fait-il ?',
			options: [
				'Il attend jusqu’à 5 s qu’une connexion revienne, puis lève `EmptyPoolError`',
				'Il ouvre une 11e connexion et la ferme après la requête',
				'Il partage une des 10 connexions occupées en y enchaînant sa requête',
				'Il échoue tout de suite avec `FullPoolError` car le pool est plein'
			],
			answer: 0,
			why: '`_get_conn` appelle `self.pool.get(block=True, timeout=5)`, qui attend qu’un autre thread rende une connexion. Si 5 s passent avant, `queue.Empty` est levée puis transformée en `EmptyPoolError`. `FullPoolError` ne sert qu’à rendre une connexion à un pool bloquant plein.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Reproduire l’avertissement "Connection pool is full" avec 32 threads et une seule `requests.Session`, puis le corriger et essayer un pool bloquant.',
		steps: [
			'Prépare : `mkdir -p ~/pool-lab && cd ~/pool-lab && python3 -m venv .venv && .venv/bin/pip install requests==2.31.0`.',
			'Dans un second terminal, lance un serveur keep-alive qui met 50 ms par requête : `node -e "require(\'http\').createServer((q, r) => setTimeout(() => r.end(\'ok\\n\'), 50)).listen(8093, \'127.0.0.1\')"`.',
			'Crée `worker.py` avec cette ligne. Il partage une session entre 32 threads pour 320 appels, et ses arguments fixent `pool_maxsize` et `pool_block` : `import logging, sys, time, requests; from concurrent.futures import ThreadPoolExecutor; logging.basicConfig(level=logging.WARNING); s = requests.Session(); s.mount("http://", requests.adapters.HTTPAdapter(pool_maxsize=int(sys.argv[1]), pool_block=len(sys.argv) > 2)) if len(sys.argv) > 1 else None; t = time.time(); list(ThreadPoolExecutor(32).map(lambda _: s.get("http://127.0.0.1:8093/").status_code, range(320))); print(f"320 calls in {time.time() - t:.1f} s")`',
			'Lance-le de trois façons et compte les avertissements à chaque fois : `.venv/bin/python worker.py 2>&1 | grep -c "pool is full"`, puis pareil avec `worker.py 32`, puis avec `worker.py 10 block`. Relance chacun sans `grep` pour voir le temps.'
		],
		done: [
			'Sans argument, le compte est d’environ 22, et le journal montre `Connection pool is full, discarding connection: 127.0.0.1. Connection pool size: 10`.',
			'Avec `32`, le compte est `0`.',
			'Avec `10 block`, le compte est `0` et l’exécution dure nettement plus qu’avec `32` (1,7 s contre 0,5 s sur la machine qui a servi à tester ce lab).'
		],
		solution: [
			'Avec la taille par défaut de 10 et `block=False`, les 32 threads ouvrent jusqu’à 32 connexions. Chacune, rendue à une file pleine, est fermée et journalisée.',
			'`pool_maxsize=32` donne une place à chaque connexion. `pool_block=True` avec une taille de 10 évite l’avertissement en faisant attendre 22 threads, d’où la lenteur de cette exécution.'
		]
	},
	recall: {
		q: 'Combien de connexions inactives par hôte le `http.Transport` de Go garde-t-il par défaut, et qu’ont donné 1000 requêtes envoyées 50 à la fois avec ce défaut ?',
		a: 'Deux (`DefaultMaxIdleConnsPerHost = 2`). Le test a ouvert 749 connexions TCP et laissé 747 sockets en `TIME_WAIT`. Avec `MaxIdleConnsPerHost: 50`, il en a ouvert 41.'
	},
	sources: [
		{ title: 'Source Go, net/http/transport.go : champs du pool et DefaultMaxIdleConnsPerHost', url: 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/net/http/transport.go#L47-L63' },
		{ title: 'Source Go, net/http/transport.go : tryPutIdleConn', url: 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/net/http/transport.go#L1105-L1198' },
		{ title: 'Source urllib3, connectionpool.py : HTTPConnectionPool', url: 'https://github.com/urllib3/urllib3/blob/a37bc93b65d6bcf00d3dc43d966bab6bd130ecd8/src/urllib3/connectionpool.py#L127-L156' },
		{ title: 'Source requests, adapters.py : valeurs par défaut du pool de HTTPAdapter', url: 'https://github.com/psf/requests/blob/611c6162cbc4ac2020a2f91c7cfa4f3abf9bbb60/src/requests/adapters.py#L79-L80' },
		{ title: 'Doc curl, --write-out', url: 'https://curl.se/docs/manpage.html#-w' }
	]
};
