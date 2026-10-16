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
		'Redis garde tout le jeu de données **en mémoire**. C’est ce qui le rend rapide. Qu’une écriture survive aussi à un redémarrage dépend de deux réglages que la plupart des gens n’ouvrent jamais : les **snapshots** et l’**append-only file**.',
		'Alors la première question à poser à une base clé-valeur n’est pas « à quelle vitesse ». C’est **« est-ce un cache, ou la seule copie ? »**. Un cache peut tout perdre et se remplir à nouveau. La seule copie demande le même soin que PostgreSQL : un journal, du fsync, des sauvegardes.'
	],
	terms: [
		{ term: 'Base clé-valeur', def: 'Une base où tu lis et écris des valeurs par clé, sans jointure ni planificateur. Redis ajoute des valeurs typées : strings, hashes, lists, sets, sorted sets, streams.' },
		{ term: 'TTL', def: 'Un délai d’expiration sur une clé, posé avec `EXPIRE` ou `SET ... EX`. Redis appelle une telle clé « volatile ». Quand le temps est écoulé, la clé est supprimée.' },
		{ term: 'Snapshot RDB', def: 'Une copie à un instant donné de tout le jeu de données dans un seul fichier compact, écrite par un processus enfant forké aux points de sauvegarde configurés.' },
		{ term: 'AOF', def: 'L’append-only file : chaque commande d’écriture est journalisée puis rejouée au démarrage pour reconstruire les données. Désactivé par défaut.' },
		{ term: 'appendfsync', def: 'La fréquence à laquelle l’AOF est forcé sur le disque : `always`, `everysec` (par défaut) ou `no`, qui laisse faire le système d’exploitation.' },
		{ term: 'Politique d’éviction', def: 'Ce que fait Redis quand il atteint `maxmemory` : jeter des clés par LRU, LFU, TTL ou au hasard, ou refuser les écritures avec `noeviction`, le défaut.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App : SET cart:42 ... EX 3600"] --> mem["Mémoire Redis : tout le jeu de données"]'],
				highlight: ['app', 'mem'],
				note: '**La mémoire d’abord.** L’écriture change les données en mémoire et la réponse repart. Sans persistance, c’est toute l’histoire : un redémarrage repart de zéro.'
			},
			{
				add: ['mem -->|"chaque écriture ajoutée"| buf["Buffer AOF"]', 'buf -->|"write(), fsync une fois par seconde"| aof[("fichier append-only")]'],
				highlight: ['buf', 'aof'],
				note: '**Le journal.** Avec `appendonly yes`, chaque commande d’écriture va dans un buffer, est écrite dans le fichier, puis fsyncée une fois par seconde par un thread en arrière-plan avec le `everysec` par défaut. C’est la même idée que le WAL (jour 15), avec un défaut moins strict.'
			},
			{
				add: ['mem -.->|"fork, snapshot aux points de sauvegarde"| rdb[("dump.rdb")]'],
				highlight: ['rdb'],
				note: '**Le snapshot.** À chaque point de sauvegarde, par exemple « après 300 secondes s’il y a eu au moins 100 changements », Redis forke et l’enfant écrit les données dans `dump.rdb`. Compact et parfait pour les sauvegardes, mais un crash perd tout depuis le dernier.'
			},
			{
				add: ['exp["Expiration : à l’accès, plus un contrôle aléatoire régulier"] -.->|"supprime les clés expirées"| mem'],
				highlight: ['exp'],
				note: '**Les TTL.** Une clé dont le délai est dépassé est supprimée quand quelqu’un la lit. Les clés que personne ne lit sont trouvées par un cycle régulier qui teste des clés au hasard parmi celles qui ont un TTL.'
			},
			{
				add: ['evict["maxmemory atteint"] -.->|"éviction selon la politique, ou refus des écritures"| mem'],
				highlight: ['evict'],
				note: '**Mémoire pleine.** Avec une politique `allkeys-*`, Redis jette n’importe quelle clé pour faire de la place : parfait pour un cache, fatal pour des paniers. Avec `noeviction`, le défaut, les écritures qui demandent de la mémoire échouent et les lectures continuent.'
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
			'**Une seconde, ou deux.** La [doc](' + PERSIST + '#L160) dit qu’avec `everysec` "you may lose 1 second of data if there is a disaster" (tu peux perdre 1 seconde de données en cas de sinistre). Le code ajoute un détail : si le fsync précédent tourne encore en arrière-plan, l’écriture est repoussée, et ce n’est qu’au bout de deux secondes que Redis écrit quand même et compte un `aof_delayed_fsync`. Sur un disque lent, la fenêtre s’allonge.',
			'**`always` veut dire s’arrêter en cas d’échec.** Avec `always`, le fsync tourne dans le thread principal avant que les réponses partent. S’il échoue, Redis [logue et s’arrête](' + REDIS + '/src/aof.c?plain=1#L1595-L1602) : une écriture qu’il a confirmée doit être sur le disque, donc il préfère planter que mentir. La doc le dit "Very very slow, very safe" (très très lent, très sûr), aidé par le group commit.',
			'**Un trou pendant les réécritures.** Avec `no-appendfsync-on-rewrite yes`, le bloc `try_fsync` sort pendant qu’un enfant sauvegarde. Le [fichier de config](' + CONF + '#L1584-L1587) prévient que la durabilité tombe alors à celle de `appendfsync no` : il est "possible to lose up to 30 seconds of log in the worst scenario" (possible de perdre jusqu’à 30 secondes de journal au pire).',
			'**Les défauts sont ceux d’un cache.** D’origine, [`appendonly no`](' + CONF + '#L1511) et des [points de sauvegarde](' + CONF + '#L519-L522) RDB à 1 heure, 5 minutes et 60 secondes. La doc dit qu’avec RDB on "should be prepared to lose the latest minutes of data" (doit s’attendre à perdre les dernières minutes), et recommande RDB et AOF ensemble pour ["a degree of data safety comparable to what PostgreSQL can provide you"](' + PERSIST + '#L61-L62) (une sûreté comparable à PostgreSQL).',
			'**Les TTL ont leurs pièges.** Un délai est [effacé](' + DOCS + '/commands/expire.md?plain=1#L81-L88) par les commandes qui écrasent la clé, comme `SET`, mais `INCR`, `LPUSH` et `HSET` n’y touchent pas. Et la [politique par défaut](' + CONF + '#L1284-L1286) est `noeviction` : un Redis plein refuse les écritures comme `SET` avec une erreur.'
		]
	},
	tradeoff: {
		gain: [
			'Les lectures et écritures sont servies depuis la mémoire, sans planificateur ni lecture disque sur le chemin chaud.',
			'Des structures de données côté serveur : compteurs avec `INCR`, classements dans des sorted sets, files dans des lists ou des streams, chaque mise à jour atomique.',
			'Les TTL et l’éviction donnent un cache qui se nettoie tout seul, sans job de nettoyage.'
		],
		cost: [
			'Les données doivent tenir en RAM. La mémoire, c’est la facture, et `maxmemory` est une décision à prendre.',
			'La durabilité est à activer, et plus faible par défaut : `everysec` peut perdre environ une seconde d’écritures confirmées, RDB seul peut en perdre des minutes.',
			'Pas de jointures, pas de contraintes, pas d’index secondaires à lui. Chaque chemin d’accès est une clé que tu as conçue à l’avance.',
			'Un cache devant une base peut servir des données périmées. Chaque chemin d’écriture doit mettre à jour ou supprimer la clé en cache, sinon c’est le TTL qui décide quand la vérité revient.'
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
			q: 'Redis atteint `maxmemory` avec la `maxmemory-policy` par défaut. Que devient un nouveau `SET` ?',
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
	takeaway: 'Décide d’abord si Redis tient un cache ou la seule copie : le cache reçoit des TTL et une politique d’éviction, la seule copie reçoit l’AOF, des sauvegardes RDB et noeviction, et risque encore environ une seconde d’écritures.',
	sources: [
		{ title: 'Doc Redis, Redis persistence', url: 'https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/' },
		{ title: 'Doc Redis, EXPIRE', url: 'https://redis.io/docs/latest/commands/expire/' },
		{ title: 'Source Redis, redis.conf', url: CONF }
	]
};
