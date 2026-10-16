const PATRONI = 'https://github.com/patroni/patroni/blob/dbee9c3523540db23232871479ddc5698a3b9435';
const HA = `${PATRONI}/patroni/ha.py`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'failover',
	part: 'La garder en marche',
	title: 'Basculer sans split brain',
	minutes: 10,
	hook: [
		'3 h du matin. La carte réseau du primaire décroche. Un script voit le primaire disparaître, promeut le réplica et y redirige l’appli. Dix secondes plus tard, l’ancien primaire revient, **toujours primaire**, et la moitié des serveurs d’appli écrivent encore dessus.',
		'Maintenant, **deux primaires** acceptent des écritures, et les commandes arrivent sur les deux. Chacune est une base valide à elle seule, et aucune n’a les lignes de l’autre. Aucun rejeu ne peut les fusionner : quelqu’un va passer une semaine à trier ça à la main.',
		'Patroni empêche ce split brain en ne laissant qu’**un seul** nœud être primaire. Il s’appuie sur un verrou dans etcd qui expire, sur un nœud qui se rétrograde lui-même quand il ne peut plus renouveler ce verrou, et sur un watchdog qui redémarre la machine si même ça échoue.'
	],
	terms: [
		{ term: 'Split brain', def: 'Deux serveurs acceptent tous les deux des écritures comme primaire. Leurs historiques divergent, et les commits du côté perdant sont perdus ou fusionnés à la main.' },
		{ term: 'DCS', def: 'Distributed configuration store : etcd, Consul, ZooKeeper ou l’API Kubernetes. Un petit cluster qui se met d’accord sur quelques clés, même quand certains de ses propres nœuds tombent.' },
		{ term: 'Clé leader', def: 'Une clé dans le DCS qui nomme le primaire, rattachée à un bail (lease) avec un TTL. Qui la tient peut tourner en primaire ; si personne ne la renouvelle, elle disparaît.' },
		{ term: 'Watchdog', def: 'Un minuteur, noyau ou matériel, qui redémarre la machine s’il ne reçoit pas de signal de vie à temps. Patroni compte sur lui quand le nœud ne peut pas se rétrograder.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['a["Nœud A : primaire"] -->|"renouvelle le verrou toutes les 10 s"| etcd[("etcd : clé leader, TTL 30 s")]', 'b["Nœud B : réplica"] -->|"lit : le leader est A"| etcd'],
				highlight: ['a', 'etcd'],
				note: 'A tient la clé leader et la renouvelle à chaque boucle, toutes les `loop_wait` (10 s par défaut). La doc du failsafe : « the node is allowed to run Postgres as the primary only if it can update the leader lock in DCS » (un nœud ne peut être primaire que s’il arrive à mettre à jour le verrou). B voit la clé et continue de répliquer depuis A.'
			},
			{
				add: ['cut["Coupure réseau : A ne joint plus etcd"] -.-> a'],
				highlight: ['cut'],
				note: 'Vu de A, un etcd en panne et un A isolé se ressemblent. Patroni suppose le pire, une partition, donc A **se rétrograde lui-même** en lecture seule tout de suite, avant que sa clé puisse expirer. Tant qu’aucun autre nœud ne se promeut, le cluster n’a pas de primaire et refuse les écritures.'
			},
			{
				add: ['b -->|"clé expirée : la créer si absente"| etcd'],
				highlight: ['b'],
				note: 'Après le TTL, etcd supprime la clé. B vérifie qu’il est en assez bonne santé (pas trop en retard), puis tente de créer la clé. La création ne réussit que si la clé n’existe pas, et etcd s’accorde là-dessus entre ses propres nœuds. Le seul nœud dont la création réussit se promeut.'
			},
			{
				add: ['wd["Watchdog sur A"] -->|"redémarre sans signal de vie"| a'],
				highlight: ['wd'],
				note: 'Si Patroni sur A a planté ou si sa VM est en pause, personne ne lance la rétrogradation. Le watchdog n’a besoin de rien de la part de Patroni : sans signal de vie, il redémarre la machine. Patroni le règle pour se déclencher 5 secondes avant le TTL, donc A est tombé avant que B puisse gagner.'
			},
			{
				add: ['a -.->|"commits jamais reçus par B"| lost["Timeline divergente sur A"]'],
				highlight: ['lost'],
				note: 'En réplication asynchrone, les commits que A n’avait pas encore envoyés à B restent sur l’ancienne timeline de A, « effectively unrecoverable » (irrécupérables en pratique). `maximum_lag_on_failover` borne le retard permis au gagnant. `synchronous_mode` le ramène à zéro, mais les écritures bloquent alors quand il ne reste aucun standby synchrone.'
			}
		]
	},
	example: {
		title: 'patroni/ha.py : le leader renouvelle son verrou, ou cesse d’être leader',
		repo: 'patroni/patroni',
		url: `${HA}#L1969-L2020`,
		lang: 'python',
		code: `    def process_healthy_cluster(self) -> str:
        if self.has_lock():
            if self.is_paused() and not self.state_handler.is_primary():
                if self.cluster.failover and self.cluster.failover.candidate == self.state_handler.name:
                    return 'waiting to become primary after promote...'

                if not self.is_standby_cluster():
                    self._delete_leader()
                    return 'removed leader lock because postgres is not running as primary'

            # update lock to avoid split-brain
            if self.update_lock(True):
                msg = self.process_manual_failover_from_leader()
                if msg is not None:
                    return msg

                # check if the node is ready to be used by pg_rewind
                self._rewind.ensure_checkpoint_after_promote(self.wakeup)

                if self.is_standby_cluster():
                    # in case of standby cluster we don't really need to
                    # enforce anything, since the leader is not a primary
                    # So just remind the role.
                    msg = 'no action. I am ({0}), the standby leader with the lock'.format(self.state_handler.name) \\
                          if self.state_handler.role == PostgresqlRole.STANDBY_LEADER else \\
                          'promoted self to a standby leader because i had the session lock'
                    return self.enforce_follow_remote_member(msg)
                else:
                    return self.enforce_primary_role(
                        'no action. I am ({0}), the leader with the lock'.format(self.state_handler.name),
                        'promoted self to leader because I had the session lock'
                    )
            else:
                # Either there is no connection to DCS or someone else acquired the lock
                logger.error('failed to update leader lock')
                if self.state_handler.is_primary():
                    if self.is_paused():
                        return 'continue to run as primary after failing to update leader lock in DCS'
                    self.demote('immediate-nolock')
                    return 'demoted self because failed to update leader lock in DCS'
                else:
                    return 'not promoting because failed to update leader lock in DCS'
…
        return self.follow('demoting self because I do not have the lock and I was a leader',
                           'no action. I am ({0}), a secondary, and following a leader ({1})'.format(
                               self.state_handler.name, lock_owner), refresh=False)`,
		notes: [
			'Ligne 12 : rien d’autre ne se passe sur le leader tant que `update_lock(True)` n’a pas réussi. [`update_lock`](' + HA + '#L375-L410) écrit la clé leader, et n’appelle `self.watchdog.keepalive()` qu’après une écriture réussie. Un leader qui ne peut plus écrire la clé cesse de nourrir son propre watchdog.',
			'Lignes 36 à 40 : sur une mise à jour ratée, un primaire en marche appelle `demote(\'immediate-nolock\')`. La [doc du failsafe](' + PATRONI + '/docs/dcs_failsafe_mode.rst?plain=1#L15-L20) explique pourquoi : l’échec peut venir d’une partition ou d’une panne du DCS, et « it is impossible to distinguish between these two from a single node » (impossible de les distinguer depuis un seul nœud). Seul le mode pause (lignes 37 et 38), quand un humain a la main, le garde primaire.',
			'Sur etcd v3, [`_do_attempt_to_acquire_leader`](' + PATRONI + '/patroni/dcs/etcd3.py#L973-L991) prend le verrou : il écrit la clé leader avec le bail du nœud et `create_revision=\'0\'`, une condition qui n’est vraie que si la clé n’existe pas. La doc d’etcd : « When a lease expires or is revoked, all keys attached to that lease will be deleted. » (quand un bail expire, toutes ses clés sont supprimées).',
			'Un réplica ne court que si [`is_lagging`](' + HA + '#L1371-L1379) est faux, c’est-à-dire s’il est à moins de `maximum_lag_on_failover` octets de la dernière position connue du primaire. La docstring (dans les sources) reconnaît que plusieurs nœuds peuvent se compter comme les plus sains, « but this is totally fine » (et que ça ne pose aucun problème) : l’écriture avec `create_revision=\'0\'` ne réussit que pour l’un d’eux.',
			'La [doc du watchdog](' + PATRONI + '/docs/watchdog.rst?plain=1#L6-L18) liste ce qui peut empêcher la rétrogradation : Patroni « has crashed », « Shutting down PostgreSQL is too slow », ou la VM est en pause. Avec `ttl=30` et `loop_wait=10`, la boucle a « at least 15 seconds » (au moins 15 secondes) avant que la machine soit redémarrée.'
		]
	},
	tradeoff: {
		gain: [
			'Au plus un primaire à la fois, tant que le DCS marche et que l’ancien primaire se rétrograde ou que son watchdog le redémarre : pas d’historiques divergents à fusionner à la main.',
			'Le basculement se passe d’humain : en à peu près un TTL, un réplica sain tient le verrou et se promeut.'
		],
		cost: [
			'Si etcd est injoignable, un primaire en parfaite santé se rétrograde, sauf si tu actives `failsafe_mode` et que chaque membre peut le confirmer.',
			'L’ancienne clé doit expirer avant qu’un réplica puisse se promouvoir : compte des dizaines de secondes sans primaire avec le `ttl` par défaut de 30.',
			'En réplication asynchrone, tu perds les derniers commits d’avant le basculement. `synchronous_mode` l’évite, mais « the system may be unavailable for writes even though some servers are available » (le système peut refuser les écritures alors que des serveurs sont disponibles).',
			'Le DCS est un cluster de plus à faire tourner, avec ses trois ou cinq nœuds, sa supervision et ses mises à jour.'
		]
	},
	task: {
		prompt: 'Trois nœuds Patroni, un etcd à trois membres, `ttl: 30`, `loop_wait: 10`, `retry_timeout: 10`, réplication asynchrone. À 03:00:00, le port de switch du primaire, le nœud A, meurt : A ne joint plus etcd, ni B, ni C, mais les serveurs d’appli de sa baie joignent encore A. Écris la chronologie de la minute qui suit : qui est primaire et quand, et ce que voit l’appli dans la baie de A.',
		hint: 'Suis d’abord A : quand essaie-t-il de renouveler, et que fait-il quand ça échoue ? Puis suis la clé dans etcd.',
		answer: [
			'Jusqu’à la boucle suivante de A, 10 s au plus, A est encore primaire et sa baie continue d’écrire. Ces écritures ne peuvent pas atteindre B ni C.',
			'À cette boucle, A tente de renouveler la clé. L’appel échoue en `retry_timeout` (10 s). A se rétrograde en lecture seule. Dès lors, l’appli de la baie de A reçoit des erreurs en écriture : une panne pour elle, mais pas de second primaire.',
			'Dans etcd, la clé expire 30 s après le dernier renouvellement réussi de A, donc vers 03:00:30. À leur boucle suivante, B et C ne voient plus de leader, vérifient leur retard, et courent. Disons que B crée la clé le premier et se promeut ; C suit B.',
			'Si Patroni sur A s’était figé au lieu de rétrograder, le watchdog, réglé 5 s avant le TTL, redémarre A avant l’expiration de la clé. A ne tourne donc plus quand B se promeut.',
			'Le coût : les commits que A a pris dans les dernières secondes avant sa rétrogradation, et qui n’ont jamais été envoyés à B, restent sur l’ancienne timeline de A. Avec `synchronous_mode`, ils n’auraient même pas été confirmés au client.'
		]
	},
	quiz: [
		{
			q: 'Patroni sur le primaire n’arrive pas à mettre à jour la clé leader, mais Postgres va bien et des clients sont connectés. Que fait Patroni, par défaut ?',
			options: [
				'Il le garde primaire jusqu’à ce qu’un réplica prenne vraiment la clé, puis le rétrograde',
				'Il rétrograde Postgres tout de suite, faute de distinguer une partition d’une panne',
				'Il le garde primaire, car un Postgres sain vaut mieux que pas de primaire du tout',
				'Il arrête Postgres et attend qu’un opérateur le relance à la main'
			],
			answer: 1,
			why: 'La doc : « In case the update of the leader lock fails, Postgres is immediately demoted and started as read-only. » Depuis un seul nœud, une panne du DCS et une partition réseau se ressemblent, et dans une partition un autre nœud est peut-être déjà en train de se promouvoir. `failsafe_mode` est l’exception, à activer exprès.'
		},
		{
			q: 'Pourquoi Patroni a-t-il besoin d’un watchdog alors qu’il rétrograde déjà le primaire quand la mise à jour du verrou échoue ?',
			options: [
				'Parce que c’est le watchdog qui renouvelle vraiment la clé leader dans etcd',
				'Parce que Postgres ignore les rétrogradations tant que des transactions sont ouvertes',
				'Parce que Patroni lui-même peut avoir planté ou être figé et ne jamais rétrograder',
				'Parce qu’etcd ne peut faire expirer une clé qu’après le redémarrage de l’ancien nœud'
			],
			answer: 2,
			why: 'La rétrogradation est du code que Patroni doit exécuter. La doc du watchdog liste ce qui peut l’en empêcher : un plantage, un arrêt trop lent, ou Patroni qui ne tourne plus parce que la VM est en pause. Le watchdog redémarre la machine sans rien demander à Patroni.'
		},
		{
			q: 'En réplication asynchrone, avec `maximum_lag_on_failover` à 1 Mo, le primaire meurt. Que peux-tu perdre ?',
			options: [
				'Jusqu’à environ 1 Mo de WAL, plus ce qui a été écrit depuis le dernier relevé',
				'Rien, car Patroni ne promeut qu’un réplica qui a tous les commits',
				'Exactement 1 Mo de WAL, car c’est la taille que Patroni garde en réserve',
				'Tout depuis la dernière base backup, puisque le réplica doit être reconstruit'
			],
			answer: 0,
			why: 'La doc des modes de réplication : la perte est « worst case bounded by maximum_lag_on_failover bytes of transaction log plus the amount that is written in the last ttl seconds », car la position du primaire n’est relevée qu’à chaque boucle. Avec `synchronous_mode`, Patroni ne promeut qu’un standby dont il est « certain » qu’il a chaque commit confirmé à un client (jour 28).'
		}
	],
	recall: {
		q: 'Qu’est-ce qui pousse un primaire Patroni à se rétrograder, et qu’est-ce qui empêche un primaire figé d’écrire après qu’un réplica a pris la main ?',
		a: 'Une mise à jour ratée de la clé leader dans etcd : Patroni appelle aussitôt `demote(\'immediate-nolock\')`. Si Patroni est figé, le watchdog redémarre la machine 5 secondes avant la fin du TTL de 30 s.'
	},
	sources: [
		{ title: 'Doc Patroni, Watchdog support', url: 'https://patroni.readthedocs.io/en/latest/watchdog.html' },
		{ title: 'Doc Patroni, DCS Failsafe Mode', url: 'https://patroni.readthedocs.io/en/latest/dcs_failsafe_mode.html' },
		{ title: 'Doc Patroni, Replication modes', url: 'https://patroni.readthedocs.io/en/latest/replication_modes.html' },
		{ title: 'Doc etcd, garanties de l’API KV et baux', url: 'https://etcd.io/docs/v3.5/learning/api/' },
		{ title: 'Source Patroni, patroni/ha.py', url: HA },
		{ title: 'Source Patroni, ha.py, choix du nœud le plus sain', url: `${HA}#L1390-L1393` }
	]
};
