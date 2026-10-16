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
		'Il y a maintenant **deux primaires**. Les commandes arrivent sur les deux. Chacune est une base valide à elle seule, et aucune n’a les lignes de l’autre. Aucun rejeu ne peut les fusionner. Quelqu’un va passer une semaine à trier ça à la main.',
		'C’est le split brain, et c’est pire qu’une panne. Au programme : comment Patroni laisse **un seul** nœud être primaire, avec un verrou dans etcd qui expire, un nœud qui se rétrograde lui-même quand il ne peut plus le renouveler, et un watchdog pour quand même ça échoue.'
	],
	terms: [
		{ term: 'Split brain', def: 'Deux serveurs acceptent tous les deux des écritures comme primaire. Leurs historiques divergent, et les commits du côté perdant sont perdus ou fusionnés à la main.' },
		{ term: 'DCS', def: 'Distributed configuration store : etcd, Consul, ZooKeeper ou l’API Kubernetes. Un petit cluster qui se met d’accord sur quelques clés, même quand certains de ses propres nœuds tombent.' },
		{ term: 'Clé leader', def: 'Une clé dans le DCS qui nomme le primaire, rattachée à un bail (lease) avec un TTL. Qui la tient peut tourner en primaire ; si personne ne la renouvelle, elle disparaît.' },
		{ term: 'Course au leader', def: 'Quand la clé leader a disparu, les réplicas en bonne santé essaient de la créer. Le DCS ne laisse réussir qu’une seule création.' },
		{ term: 'Fencing', def: 'S’assurer que l’ancien primaire cesse de prendre des écritures avant ou pendant qu’un nouveau démarre : le rétrograder, l’arrêter, ou lui couper le courant.' },
		{ term: 'Watchdog', def: 'Un minuteur, noyau ou matériel, qui redémarre la machine s’il ne reçoit pas de signal de vie à temps. Le fencing de dernier recours.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['a["Nœud A : primaire"] -->|"renouvelle le verrou toutes les 10 s"| etcd[("etcd : clé leader, TTL 30 s")]', 'b["Nœud B : réplica"] -->|"lit : le leader est A"| etcd'],
				highlight: ['a', 'etcd'],
				note: '**Une clé, un primaire.** A tient la clé leader et la renouvelle à chaque boucle, toutes les `loop_wait` (10 s par défaut). La doc du failsafe pose la règle : « the node is allowed to run Postgres as the primary only if it can update the leader lock in DCS » (un nœud ne peut être primaire que s’il arrive à mettre à jour le verrou). B voit la clé et continue de répliquer depuis A.'
			},
			{
				add: ['cut["Coupure réseau : A ne joint plus etcd"] -.-> a'],
				highlight: ['cut'],
				note: '**A ne peut plus renouveler.** Vu de A, un etcd en panne et un A isolé se ressemblent. Patroni suppose le pire, une partition, donc A **se rétrograde lui-même** en lecture seule tout de suite, avant que sa clé puisse expirer. Personne d’autre n’est encore primaire, et A ne l’est plus non plus.'
			},
			{
				add: ['b -->|"clé expirée : la créer si absente"| etcd'],
				highlight: ['b'],
				note: '**La course.** Après le TTL, etcd supprime la clé. B vérifie qu’il est en assez bonne santé (pas trop en retard), puis tente de créer la clé. La création ne réussit que si la clé n’existe pas, et etcd s’accorde là-dessus entre ses propres nœuds. Un seul gagnant, qui se promeut.'
			},
			{
				add: ['wd["Watchdog sur A"] -->|"redémarre sans signal de vie"| a'],
				highlight: ['wd'],
				note: '**Quand A ne peut même pas se rétrograder.** Si Patroni sur A a planté ou si sa VM est en pause, personne ne lance la rétrogradation. Le watchdog s’en moque : sans signal de vie, il redémarre la machine. Patroni le règle pour se déclencher 5 secondes avant le TTL, donc A est tombé avant que B puisse gagner.'
			},
			{
				add: ['a -.->|"commits jamais reçus par B"| lost["Timeline divergente sur A"]'],
				highlight: ['lost'],
				note: '**Ce que coûte encore un basculement.** En réplication asynchrone, les commits que A n’avait pas encore envoyés à B restent sur l’ancienne timeline de A, « effectively unrecoverable » (irrécupérables en pratique). `maximum_lag_on_failover` borne le retard permis au gagnant. `synchronous_mode` le ramène à zéro, au prix d’écritures bloquées quand il ne reste aucun standby synchrone.'
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
			'**Le verrou d’abord.** Rien d’autre ne se passe sur le leader tant que `update_lock(True)` n’a pas réussi. [`update_lock`](' + HA + '#L375-L410) écrit la clé leader, et n’appelle `self.watchdog.keepalive()` qu’après une écriture réussie. Un leader qui ne peut plus écrire la clé cesse de nourrir son propre watchdog.',
			'**Échec veut dire rétrogradation, tout de suite.** Sur une mise à jour ratée, un primaire en marche appelle `demote(\'immediate-nolock\')`. La [doc du failsafe](' + PATRONI + '/docs/dcs_failsafe_mode.rst?plain=1#L15-L20) explique pourquoi : l’échec peut venir d’une partition ou d’une panne du DCS, et « it is impossible to distinguish between these two from a single node » (impossible de les distinguer depuis un seul nœud). Seul le mode pause, quand un humain a la main, le garde primaire.',
			'**Prendre le verrou, c’est créer si absent.** Sur etcd v3, [`_do_attempt_to_acquire_leader`](' + PATRONI + '/patroni/dcs/etcd3.py#L973-L991) écrit la clé leader avec le bail du nœud et `create_revision=\'0\'`, une condition qui n’est vraie que si la clé n’existe pas. La doc d’etcd : « When a lease expires or is revoked, all keys attached to that lease will be deleted. » (quand un bail expire, toutes ses clés sont supprimées).',
			'**Plusieurs peuvent se croire les meilleurs ; un seul gagne.** Un réplica ne court que si [`is_lagging`](' + HA + '#L1371-L1379) est faux, c’est-à-dire s’il est à moins de `maximum_lag_on_failover` octets de la dernière position connue du primaire. La [docstring](' + HA + '#L1390-L1393) reconnaît que plusieurs nœuds peuvent se compter comme les plus sains, « but this is totally fine » (et que ça ne pose aucun problème) : le créer-si-absent en choisit un.',
			'**Le watchdog ferme la brèche.** La [doc du watchdog](' + PATRONI + '/docs/watchdog.rst?plain=1#L6-L18) liste ce qui peut empêcher la rétrogradation : Patroni « has crashed », « Shutting down PostgreSQL is too slow », ou la VM est en pause. Avec `ttl=30` et `loop_wait=10`, la boucle a « at least 15 seconds » (au moins 15 secondes) avant que la machine soit redémarrée.'
		]
	},
	tradeoff: {
		gain: [
			'Au plus un primaire à la fois, tant que le DCS marche et que le fencing se déclenche : pas d’historiques divergents à fusionner à la main.',
			'Le basculement se passe d’humain : en à peu près un TTL, un réplica sain tient le verrou et se promeut.',
			'Les règles sont courtes et lisibles : tenir la clé ou se rétrograder, ne courir qu’en bonne santé, et laisser le DCS choisir un seul gagnant.'
		],
		cost: [
			'Le primaire dépend maintenant du DCS. Si etcd est injoignable, un primaire en parfaite santé se rétrograde, sauf si tu actives `failsafe_mode` et que chaque membre peut le confirmer.',
			'Le basculement n’est pas instantané. L’ancienne clé doit d’abord expirer : compte des dizaines de secondes sans primaire avec le `ttl` par défaut de 30.',
			'La réplication asynchrone perd encore les derniers commits au basculement. `synchronous_mode` l’évite, mais « the system may be unavailable for writes even though some servers are available » (le système peut refuser les écritures alors que des serveurs sont disponibles).',
			'Un cluster de plus à faire tourner : le DCS veut ses trois ou cinq nœuds, sa supervision et ses mises à jour.'
		]
	},
	task: {
		prompt: 'Trois nœuds Patroni, un etcd à trois membres, `ttl: 30`, `loop_wait: 10`, `retry_timeout: 10`, réplication asynchrone. À 03:00:00, le port de switch du primaire, le nœud A, meurt : A ne joint plus etcd, ni B, ni C, mais les serveurs d’appli de sa baie joignent encore A. Écris la chronologie de la minute qui suit : qui est primaire et quand, et ce que voit l’appli dans la baie de A.',
		hint: 'Suis d’abord A : quand essaie-t-il de renouveler, et que fait-il quand ça échoue ? Puis suis la clé dans etcd.',
		answer: [
			'Jusqu’à la boucle suivante de A, 10 s au plus, A est encore primaire et sa baie continue d’écrire. Ces écritures ne peuvent pas atteindre B ni C.',
			'À cette boucle, A tente de renouveler la clé. L’appel échoue en `retry_timeout` (10 s). A se rétrograde en lecture seule. Dès lors, l’appli de la baie de A reçoit des erreurs en écriture : une panne pour elle, mais pas de second primaire.',
			'Dans etcd, la clé expire 30 s après le dernier renouvellement réussi de A, donc vers 03:00:30. À leur boucle suivante, B et C ne voient plus de leader, vérifient leur retard, et courent. Disons que B crée la clé le premier et se promeut ; C suit B.',
			'Si Patroni sur A s’était figé au lieu de rétrograder, le watchdog, réglé 5 s avant le TTL, redémarre A avant l’expiration de la clé. C’est pour ça que B peut se promouvoir sans danger.',
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
	takeaway: 'Le primaire, c’est celui qui tient un verrou qui expire dans un store d’accord avec lui-même ; un nœud qui ne peut pas le renouveler se rétrograde aussitôt, et un watchdog l’arrête s’il n’y arrive pas.',
	sources: [
		{ title: 'Doc Patroni, Watchdog support', url: 'https://patroni.readthedocs.io/en/latest/watchdog.html' },
		{ title: 'Doc Patroni, DCS Failsafe Mode', url: 'https://patroni.readthedocs.io/en/latest/dcs_failsafe_mode.html' },
		{ title: 'Doc Patroni, Replication modes', url: 'https://patroni.readthedocs.io/en/latest/replication_modes.html' },
		{ title: 'Doc etcd, garanties de l’API KV et baux', url: 'https://etcd.io/docs/v3.5/learning/api/' },
		{ title: 'Source Patroni, patroni/ha.py', url: HA }
	]
};
