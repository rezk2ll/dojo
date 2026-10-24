const REDIS = 'https://github.com/redis/redis/blob/e0bb9316848db7950c2b18cdc59c2058f62b8a3d';
const CONF = `${REDIS}/redis.conf`;
const DOCS = 'https://github.com/redis/docs/blob/3b030c7ef066c0bb7f88ddec02c784e49783b0f8/content';
const PERSIST = `${DOCS}/operate/oss_and_stack/management/persistence.md?plain=1`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'key-value',
	part: 'Au-delà d’un serveur',
	title: 'Les bases clé-valeur',
	minutes: 10,
	hook: [
		'Un déploiement redémarre le conteneur Redis. Le cache des produits se remplit en une minute, personne ne remarque rien. Mais les paniers vivaient aussi dans Redis, et **les paniers des dernières minutes ont disparu**.',
		'Redis garde tout le jeu de données **en mémoire** et sert les lectures et les écritures depuis là. Qu’une écriture survive aussi à un redémarrage dépend de deux réglages : les snapshots RDB et l’append-only file.',
		'Avant de mettre des données dans une base clé-valeur, décide si elle tient un cache ou la seule copie. Un cache peut tout perdre et se remplir à nouveau depuis la base. La seule copie demande le même soin que PostgreSQL : un journal, du fsync, des sauvegardes.'
	],
	terms: [
		{ term: 'TTL', def: 'Un délai d’expiration sur une clé, posé avec `EXPIRE` ou `SET ... EX`. Redis appelle une telle clé « volatile ». Quand le temps est écoulé, la clé est supprimée.' },
		{ term: 'Snapshot RDB', def: 'Une copie à un instant donné de tout le jeu de données dans un seul fichier compact, écrite par un processus enfant forké aux points de sauvegarde configurés.' },
		{ term: 'AOF', def: 'L’append-only file : chaque commande d’écriture est journalisée puis rejouée au démarrage pour reconstruire les données. Redis le livre désactivé.' },
		{ term: 'Politique d’éviction', def: 'Ce que fait Redis quand il atteint `maxmemory` : jeter des clés par LRU, LFU, TTL ou au hasard, ou refuser les écritures avec `noeviction`, le défaut.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App : SET cart:42 ... EX 3600"] --> mem["Mémoire Redis : tout le jeu de données"]'],
				highlight: ['app', 'mem'],
				note: 'L’écriture change les données en mémoire et la réponse repart. Sans persistance, Redis redémarre avec un jeu de données vide.'
			},
			{
				add: ['mem -->|"chaque écriture ajoutée"| buf["Buffer AOF"]', 'buf -->|"write(), fsync une fois par seconde"| aof[("fichier append-only")]'],
				highlight: ['buf', 'aof'],
				note: 'Avec `appendonly yes`, chaque commande d’écriture va dans un buffer, est écrite dans le fichier, puis fsyncée une fois par seconde par un thread en arrière-plan avec le `everysec` par défaut. C’est la même idée que le WAL (jour 15), avec un défaut moins strict.'
			},
			{
				add: ['mem -.->|"fork, snapshot aux points de sauvegarde"| rdb[("dump.rdb")]'],
				highlight: ['rdb'],
				note: 'À chaque point de sauvegarde, par exemple « après 300 secondes s’il y a eu au moins 100 changements », Redis forke et l’enfant écrit les données dans `dump.rdb`. Le fichier est compact et convient bien aux sauvegardes, mais un crash perd toutes les écritures depuis le dernier snapshot.'
			},
			{
				add: ['exp["Expiration : à l’accès, plus un contrôle aléatoire régulier"] -.->|"supprime les clés expirées"| mem'],
				highlight: ['exp'],
				note: 'Une clé dont le délai est dépassé est supprimée quand quelqu’un la lit. Les clés que personne ne lit sont trouvées par un cycle régulier qui teste des clés au hasard parmi celles qui ont un TTL.'
			},
			{
				add: ['evict["maxmemory atteint"] -.->|"éviction selon la politique, ou refus des écritures"| mem'],
				highlight: ['evict'],
				note: 'Avec une politique `allkeys-*`, Redis jette n’importe quelle clé pour faire de la place. Un cache recharge la clé jetée, mais un panier jeté est perdu. Avec `noeviction`, le défaut, les écritures qui demandent de la mémoire échouent et les lectures continuent.'
			}
		]
	},
	example: {
		title: 'Redis, src/aof.c : flushAppendOnlyFile et les trois politiques de fsync',
		repo: 'redis/redis',
		url: `${REDIS}/src/aof.c?plain=1#L1444-L1615`,
		lang: 'c',
		code: `    if (server.aof_fsync == AOF_FSYNC_EVERYSEC)
        sync_in_progress = aofFsyncInProgress();

    if (server.aof_fsync == AOF_FSYNC_EVERYSEC && !force) {
        /* With this append fsync policy we do background fsyncing.
         * If the fsync is still in progress we can try to delay
         * the write for a couple of seconds. */
        if (sync_in_progress) {
            if (server.aof_flush_postponed_start == 0) {
                /* No previous write postponing, remember that we are
                 * postponing the flush and return. */
                server.aof_flush_postponed_start = server.mstime;
                return;
            } else if (server.mstime - server.aof_flush_postponed_start < 2000) {
                /* We were already waiting for fsync to finish, but for less
                 * than two seconds this is still ok. Postpone again. */
                return;
            }
            /* Otherwise fall through, and go write since we can't wait
             * over two seconds. */
            server.aof_delayed_fsync++;
            serverLog(LL_NOTICE,"Asynchronous AOF fsync is taking too long (disk is busy?). Writing the AOF buffer without waiting for fsync to complete, this may slow down Redis.");
        }
    }
…
try_fsync:
    /* Don't fsync if no-appendfsync-on-rewrite is set to yes and there are
     * children doing I/O in the background. */
    if (server.aof_no_fsync_on_rewrite && hasActiveChildProcess())
        return;

    /* Perform the fsync if needed. */
    if (server.aof_fsync == AOF_FSYNC_ALWAYS) {
        /* redis_fsync is defined as fdatasync() for Linux in order to avoid
         * flushing metadata. */
        latencyStartMonitor(latency);
        /* Let's try to get this data on the disk. To guarantee data safe when
         * the AOF fsync policy is 'always', we should exit if failed to fsync
         * AOF (see comment next to the exit(1) after write error above). */
        if (redis_fsync(server.aof_fd) == -1) {
            serverLog(LL_WARNING,"Can't persist AOF for fsync error when the "
              "AOF fsync policy is 'always': %s. Exiting...", strerror(errno));
            exit(1);
        }
        latencyEndMonitor(latency);
        latencyAddSampleIfNeeded("aof-fsync-always",latency);
        server.aof_last_incr_fsync_offset = server.aof_last_incr_size;
        server.aof_last_fsync = server.mstime;
        atomicSet(server.fsynced_reploff_pending, server.master_repl_offset);
    } else if (server.aof_fsync == AOF_FSYNC_EVERYSEC &&
               server.mstime - server.aof_last_fsync >= 1000) {
        if (!sync_in_progress) {
            aof_background_fsync(server.aof_fd);
            server.aof_last_incr_fsync_offset = server.aof_last_incr_size;
        }
        server.aof_last_fsync = server.mstime;
    }`,
		notes: [
			'Les lignes 8 à 22 gèrent un disque lent. La [doc](' + PERSIST + '#L160) dit qu’avec `everysec` "you may lose 1 second of data if there is a disaster" (tu peux perdre 1 seconde de données en cas de sinistre). Si le fsync précédent tourne encore en arrière-plan, la ligne 13 repousse l’écriture. Redis n’écrit quand même qu’au bout de deux secondes (ligne 14) et compte alors un `aof_delayed_fsync` ligne 21, donc sur un disque lent tu peux perdre plus d’une seconde.',
			'Lignes 33 à 43 : avec `always`, le fsync tourne dans le thread principal avant que les réponses partent. S’il échoue, Redis logue et s’arrête ligne 43, parce qu’une écriture qu’il a confirmée doit être sur le disque. La doc le décrit comme "Very very slow, very safe" (très très lent, très sûr), aidé par le group commit.',
			'Lignes 29 et 30 : avec `no-appendfsync-on-rewrite yes`, la fonction sort sans fsync pendant qu’un enfant sauvegarde. Le [fichier de config](' + CONF + '#L1584-L1587) prévient que la durabilité tombe alors à celle de `appendfsync no` : il est "possible to lose up to 30 seconds of log in the worst scenario" (possible de perdre jusqu’à 30 secondes de journal au pire).',
			'D’origine, `redis.conf` règle `appendonly no` et des points de sauvegarde RDB à 1 heure, 5 minutes et 60 secondes. La [doc](' + PERSIST + '#L61-L62) dit qu’avec RDB tu "should be prepared to lose the latest minutes of data" (dois t’attendre à perdre les dernières minutes). Elle recommande RDB et AOF ensemble pour "a degree of data safety comparable to what PostgreSQL can provide you" (une sûreté comparable à PostgreSQL).',
			'Les commandes qui écrasent la clé, comme `SET`, [effacent son délai](' + DOCS + '/commands/expire.md?plain=1#L81-L88), mais `INCR`, `LPUSH` et `HSET` n’y touchent pas. La politique par défaut de `redis.conf` est `noeviction`, donc un Redis plein refuse les écritures comme `SET` avec une erreur.'
		]
	},
	tradeoff: {
		gain: [
			'Les lectures et écritures sont servies depuis la mémoire, sans planificateur ni lecture disque sur le chemin chaud.',
			'Redis garde des structures de données côté serveur : compteurs avec `INCR`, classements dans des sorted sets, files dans des lists ou des streams, chaque mise à jour atomique.',
			'Avec les TTL et l’éviction, Redis supprime lui-même les vieilles entrées du cache, sans job de nettoyage.'
		],
		cost: [
			'Tout le jeu de données doit tenir en RAM, donc la taille de la RAM fixe la facture, et tu dois choisir une valeur de `maxmemory`.',
			'Une fois l’AOF activé (il est livré désactivé), `everysec` peut perdre environ une seconde d’écritures confirmées, et RDB seul peut en perdre des minutes.',
			'Redis n’a ni jointures, ni contraintes, ni index secondaires à lui. Chaque chemin d’accès est une clé que tu as conçue à l’avance.',
			'Un cache devant une base peut servir des données périmées. Chaque chemin d’écriture doit mettre à jour ou supprimer la clé en cache, sinon les lecteurs voient l’ancienne valeur jusqu’à l’expiration du TTL.'
		]
	},
	task: {
		prompt: 'Ta boutique veut Redis pour trois choses : (1) des fragments de pages produit déjà rendus, (2) les sessions utilisateur, (3) un limiteur de 100 requêtes par minute et par IP. Pour chacune, écris les réglages de persistance et d’éviction que tu choisirais, et pour (3) les commandes, pour que le compteur reparte à zéro chaque minute et ne vive jamais éternellement.',
		hint: 'Demande-toi pour chacune : si Redis redémarre vide, qu’est-ce qui casse ? Puis vérifie quelles commandes gardent un TTL et lesquelles l’effacent.',
		answer: [
			'(1) Cache : le perdre coûte un remplissage. La persistance peut rester coupée, ou RDB seulement. Règle `maxmemory` et `maxmemory-policy allkeys-lru`, et donne un TTL à chaque fragment.',
			'(2) Sessions : les perdre déconnecte tout le monde. Mets `appendonly yes` avec `everysec` et garde RDB pour les sauvegardes. Garde `noeviction` et de la marge en mémoire : une politique `volatile-*` évincerait justement les clés avec un TTL, tes sessions. Accepte qu’environ une seconde d’écritures puisse être perdue, ou garde les sessions dans PostgreSQL si ce n’est pas acceptable.',
			'(3) Limiteur : `INCR rate:203.0.113.7:2026-10-17T10:42` puis, si le résultat vaut 1, `EXPIRE rate:203.0.113.7:2026-10-17T10:42 60`. `INCR` laisse le TTL en place, donc les incréments suivants le gardent. Ne réécris jamais le compteur avec un simple `SET` : ça efface le TTL et la clé vit pour toujours.',
			'Perdre les compteurs dans un redémarrage ne remet les limites à zéro que pour une minute, donc (3) peut tourner sans persistance, sur la même instance que (1) si tu acceptes que l’éviction jette parfois un compteur trop tôt.'
		],
		steps: [
			{
				title: 'Demande ce qu’un redémarrage casse',
				questions: [
					{ q: 'Redis redémarre vide. Que coûte la perte des fragments produit (1) ?', options: ['Un remplissage depuis la base', 'Tous les utilisateurs sont déconnectés', 'Les limites repartent à zéro', 'Des commandes sont perdues pour de bon'], answer: 0, why: 'Un cache peut tout perdre et se remplir à nouveau. C’est ce qui en fait un cache.' },
					{ q: 'Que coûte la perte des sessions (2) ?', options: ['Les pages s’affichent plus lentement pendant une minute', 'Tout le monde est déconnecté', 'Les limites repartent à zéro', 'Rien : les sessions se reconstruisent seules'], answer: 1, why: 'Redis garde la seule copie d’une session. Sans elle, l’utilisateur doit se reconnecter.' },
					{ q: 'Que coûte la perte des compteurs du limiteur (3) ?', options: ['Tout le monde est déconnecté', 'Chaque IP est bloquée jusqu’à ce qu’un humain intervienne', 'Les limites repartent à zéro pour une minute au plus', 'Rien, jamais'], answer: 2, why: 'Chaque compteur couvre une minute. Un Redis vide recommence simplement à compter.' },
					{ q: 'Tel que livré, que persiste `redis.conf` ?', options: ['Chaque écriture, fsyncée avant la réponse', 'Un AOF en `everysec`', 'Rien du tout', 'Des snapshots RDB aux points de sauvegarde, avec l’AOF coupé'], answer: 3, why: 'Il est livré avec `appendonly no` et des points de sauvegarde RDB à 1 heure, 5 minutes et 60 secondes, donc des minutes d’écritures peuvent se perdre.' }
				]
			},
			{
				title: 'Choisis la persistance',
				questions: [
					{ q: 'Quelle persistance convient aux fragments produit (1) ?', options: ['Coupée, ou RDB seulement', '`appendfsync always`', 'AOF en `everysec` plus RDB', 'Une copie dans PostgreSQL'], answer: 0, why: 'Perdre le cache coûte un remplissage, donc aucune raison de payer un fsync à chaque écriture.' },
					{ q: 'Quelle persistance convient aux sessions (2) ?', options: ['Coupée : les sessions vivent peu', 'Des snapshots RDB seulement', '`appendonly yes` avec `everysec`, et RDB pour les sauvegardes', '`no-appendfsync-on-rewrite yes` pour la vitesse'], answer: 2, why: 'La doc recommande RDB et AOF ensemble pour une sûreté proche de celle de PostgreSQL. RDB seul peut perdre des minutes.' },
					{ q: 'Avec `appendfsync everysec`, que peut perdre une coupure de courant ?', options: ['Rien, chaque écriture est sur le disque', 'Environ une seconde d’écritures, plus si un fsync était lent', 'Tout depuis le dernier snapshot RDB', 'Seulement les clés qui ont un TTL'], answer: 1, why: 'Le fsync tourne une fois par seconde en arrière-plan, et Redis repousse les écritures jusqu’à deux secondes quand un fsync est lent.' },
					{ q: 'Le métier ne peut pas accepter de perdre même une seconde de sessions. Que fais-tu ?', options: ['Passer les sessions en RDB seulement', 'Activer `no-appendfsync-on-rewrite`', 'Donner un TTL plus long à chaque session', 'Garder les sessions dans PostgreSQL'], answer: 3, why: 'Les trois autres perdent plus, pas moins. Si la fenêtre de Redis est trop large, range les données là où les commits sont durables.' }
				]
			},
			{
				title: 'Choisis l’éviction',
				questions: [
					{ q: 'Quels réglages mémoire conviennent aux fragments produit (1) ?', options: ['`noeviction` et pas de `maxmemory`', '`maxmemory` avec `allkeys-lru`, et un TTL sur chaque fragment', '`volatile-ttl` sans aucun TTL posé', 'Pas de `maxmemory`, pour ne jamais rien jeter'], answer: 1, why: 'Un cache doit évincer les entrées les moins récemment utilisées quand il est plein, et les TTL nettoient les vieux fragments sans job.' },
					{ q: 'Quelle politique d’éviction convient aux sessions (2) ?', options: ['`noeviction`, avec de la marge en mémoire', '`allkeys-lru`', '`volatile-lru`', '`allkeys-random`'], answer: 0, why: 'Une session ne doit pas disparaître parce que la mémoire est serrée. Un Redis plein refuse alors les écritures, donc tu surveilles la mémoire et tu gardes de la marge.' },
					{ q: 'Pourquoi une politique `volatile-*` est-elle le mauvais choix pour les sessions ?', options: ['Elle ignore le TTL de chaque clé', 'Elle refuse toutes les écritures quand Redis est plein', 'Elle évince justement les clés avec un TTL, c’est-à-dire les sessions', 'Elle demande de couper l’AOF'], answer: 2, why: 'Les sessions ont des TTL, donc `volatile-*` les choisit en premier, précisément les clés que tu voulais garder.' },
					{ q: 'Un Redis en `noeviction` atteint `maxmemory`. Que devient un nouveau `SET` ?', options: ['Redis évince la plus vieille clé pour faire de la place', 'Redis écrit les vieilles clés sur le disque', 'Redis supprime d’abord toutes les clés avec un TTL', 'Redis le refuse avec une erreur, et les lectures marchent encore'], answer: 3, why: '`noeviction` est le défaut : les commandes qui demandent plus de mémoire échouent, rien n’est jeté.' }
				]
			},
			{
				title: 'Écris le limiteur',
				questions: [
					{ q: 'Quelles commandes comptent une requête pour que le compteur s’arrête après une minute ?', options: ['`INCR` sur la clé, puis `EXPIRE` de 60 secondes si le résultat vaut 1', '`SET key 1 EX 60` à chaque requête', '`GET` la clé, ajouter un dans l’application, puis `SET`', '`EXPIRE` de 60 secondes sur la clé, puis `INCR`'], answer: 0, why: '`INCR` crée la clé à 1 la première fois, et c’est là qu’elle reçoit son délai.' },
					{ q: 'Pourquoi poser le TTL seulement quand `INCR` renvoie 1 ?', options: ['`EXPIRE` échoue sur une clé au-dessus de 1', 'La clé vient d’être créée, et les `INCR` suivants gardent son TTL', '`INCR` efface le TTL à chaque fois', 'Redis n’autorise qu’un `EXPIRE` par clé'], answer: 1, why: 'Les commandes qui modifient une valeur sur place, comme `INCR`, laissent le délai tranquille, donc un seul `EXPIRE` couvre la minute.' },
					{ q: 'Un script remet un compteur à zéro avec un simple `SET rate:... 0`. Que se passe-t-il ?', options: ['Le TTL est gardé', 'Le TTL revient à 60 secondes', 'La clé est supprimée tout de suite', 'Le TTL est effacé, et la clé vit pour toujours'], answer: 3, why: 'Les commandes qui écrasent la clé, comme `SET`, effacent son délai. Utilise `SET ... EX` ou `KEEPTTL` si tu dois la réécrire.' },
					{ q: 'Où peut tourner le limiteur (3) ?', options: ['Seulement sur l’instance des sessions, en `appendfsync always`', 'Sur sa propre instance avec AOF', 'Sans persistance, même sur l’instance du cache, si un compteur évincé trop tôt est acceptable', 'Seulement dans PostgreSQL'], answer: 2, why: 'Un compteur perdu ne remet une limite à zéro que pour une minute. Partager l’instance du cache veut dire que `allkeys-lru` peut en jeter un trop tôt.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Une clé `session:9` a un TTL d’une heure. L’application lance `SET session:9 "{...}"` sans option. Que vaut le TTL maintenant ?',
			options: [
				'Toujours environ une heure, car un TTL survit à toute écriture sur sa clé',
				'Remis à une heure à partir de maintenant, car SET relance le minuteur',
				'Effacé : SET écrase la clé et retire son délai, elle n’expire plus jamais',
				'Zéro, donc la clé est supprimée à la prochaine lecture par un client'
			],
			answer: 2,
			why: 'Les commandes qui écrasent la valeur, comme SET, effacent le délai. Celles qui la modifient sur place, comme INCR ou HSET, le gardent. Utilise `SET ... EX` ou `KEEPTTL` quand tu réécris une clé volatile.'
		},
		{
			q: 'Redis tourne avec `appendonly yes` et le `appendfsync everysec` par défaut. Le courant saute. Que peut-on perdre ?',
			options: [
				'Rien, car chaque écriture est fsyncée avant que le client reçoive sa réponse',
				'À peu près la dernière seconde d’écritures, plus si un fsync lent les retenait',
				'Tout depuis le dernier snapshot RDB, qui peut dater de plusieurs minutes',
				'Seulement les clés avec un TTL, car les clés volatiles ne vont jamais dans l’AOF'
			],
			answer: 1,
			why: 'Avec everysec, le fsync tourne une fois par seconde en arrière-plan, donc les écritures confirmées depuis le dernier fsync peuvent être perdues. La doc parle d’environ une seconde ; le code repousse les écritures jusqu’à deux secondes quand un fsync est lent.'
		},
		{
			q: 'Redis atteint `maxmemory` avec la `maxmemory-policy` par défaut. Que se passe-t-il pour un nouveau `SET` ?',
			options: [
				'Redis évince la clé utilisée le moins récemment pour faire de la place',
				'Redis écrit les plus vieilles clés sur le disque et les recharge à la demande',
				'Redis supprime d’abord toutes les clés qui ont un TTL, puis accepte l’écriture',
				'Redis refuse l’écriture avec une erreur et continue de répondre aux lectures'
			],
			answer: 3,
			why: 'Le défaut est noeviction : les commandes qui demandent plus de mémoire échouent, les lectures marchent encore. Un cache doit choisir explicitement une politique `allkeys-*` ; une base qui ne doit pas perdre de clés garde noeviction et surveille la mémoire.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Construire le limiteur dans un Redis local, voir `SET` effacer un TTL, et voir `noeviction` et `allkeys-lru` se comporter quand la mémoire est pleine.',
		steps: [
			'Lance Redis et ouvre le CLI : `docker run -d --name kv-lab redis:7`, puis `docker exec -it kv-lab redis-cli`.',
			'Lis les défauts : `CONFIG GET appendonly`, `CONFIG GET save`, `CONFIG GET maxmemory-policy`.',
			'Compte deux requêtes d’une même IP : `INCR rate:203.0.113.7:2026-10-17T10:42`, puis `EXPIRE rate:203.0.113.7:2026-10-17T10:42 60` puisque le résultat valait 1, puis encore un `INCR` et un `TTL` sur la clé. Écrase-la ensuite avec `SET rate:203.0.113.7:2026-10-17T10:42 5` et relance `TTL`.',
			'Réécris une session de deux façons : `SET session:9 x EX 3600`, puis `SET session:9 y KEEPTTL`, puis `TTL session:9`.',
			'Remplis la mémoire : `FLUSHALL`, puis `EVAL "for i=1,20000 do redis.call(\'SET\',\'junk:\'..i,string.rep(\'x\',100)) end" 0`, puis `CONFIG SET maxmemory 2mb`. Essaie `SET one more` et `GET junk:5`. Puis `CONFIG SET maxmemory-policy allkeys-lru`, réessaie `SET one more`, et lance `DBSIZE`.',
			'Quitte le CLI et nettoie : `docker rm -f kv-lab`.'
		],
		done: [
			'Les défauts affichent `appendonly no`, les points de sauvegarde `3600 1 300 100 60 10000`, et `noeviction`.',
			'Après le deuxième `INCR`, `TTL` affiche environ 60. Après le simple `SET`, `TTL` affiche `-1` : plus de délai, la clé vit pour toujours.',
			'Avec `KEEPTTL`, `TTL session:9` affiche encore environ 3600.',
			'En `noeviction`, `SET one more` échoue avec `OOM command not allowed when used memory > \'maxmemory\'`, et `GET junk:5` répond encore.',
			'En `allkeys-lru`, le même `SET` renvoie `OK`, et `DBSIZE` est bien en dessous de 20 000 : Redis a jeté des clés pour tenir.'
		],
		solution: [
			'Limiteur, à chaque requête : `INCR rate:<ip>:<minute>`. Si la réponse vaut `1`, `EXPIRE rate:<ip>:<minute> 60`. Ne réécris jamais le compteur avec un simple `SET`.',
			'Instance du cache pour (1) et (3) : `maxmemory` réglé, `maxmemory-policy allkeys-lru`, persistance coupée ou RDB seulement.',
			'Instance des sessions (2) : `appendonly yes`, `appendfsync everysec`, RDB gardé pour les sauvegardes, `maxmemory-policy noeviction`, et des alertes mémoire avec de la marge.'
		]
	},
	recall: {
		q: 'Redis tient la seule copie de tes paniers. Quels réglages poses-tu, et combien une coupure de courant peut-elle encore faire perdre ?',
		a: '`appendonly yes` avec `appendfsync everysec`, des snapshots RDB pour les sauvegardes, et `noeviction`. Une coupure peut encore faire perdre environ une seconde d’écritures confirmées, plus si un fsync était lent.'
	},
	sources: [
		{ title: 'Doc Redis, Redis persistence', url: 'https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/' },
		{ title: 'Doc Redis, EXPIRE', url: 'https://redis.io/docs/latest/commands/expire/' },
		{ title: 'Source Redis, redis.conf', url: CONF },
		{ title: 'Source Redis, redis.conf : points de sauvegarde RDB', url: `${CONF}#L519-L522` },
		{ title: 'Source Redis, redis.conf : maxmemory-policy par défaut', url: `${CONF}#L1284-L1286` }
	]
};
