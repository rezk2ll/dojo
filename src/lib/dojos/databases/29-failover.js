const PATRONI = 'https://github.com/patroni/patroni/blob/dbee9c3523540db23232871479ddc5698a3b9435';
const HA = `${PATRONI}/patroni/ha.py`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'failover',
	part: 'Keeping it running',
	title: 'Failover without split brain',
	minutes: 10,
	hook: [
		'3 a.m. The primary\'s network card flaps. A script sees the primary gone, promotes the replica, and points the app at it. Ten seconds later the old primary is back, **still a primary**, and half the app servers still write to it.',
		'Now **two primaries** accept writes, and orders land on both. Each one is a valid database on its own, and neither has the other\'s rows. No replay can merge them, so someone will spend a week sorting it out by hand.',
		'Patroni prevents this split brain by letting **exactly one** node be primary. It uses a lock in etcd that expires, a node that demotes itself when it cannot renew the lock, and a watchdog that resets the machine when even that fails.'
	],
	terms: [
		{ term: 'Split brain', def: 'Two servers both accept writes as primary. Their histories fork, and the commits on the losing side are lost or merged by hand.' },
		{ term: 'DCS', def: 'Distributed configuration store: etcd, Consul, ZooKeeper or the Kubernetes API. A small cluster that agrees on a few keys, even when some of its own nodes fail.' },
		{ term: 'Leader key', def: 'A key in the DCS naming the primary, attached to a lease with a TTL. Whoever holds it may run as primary; if nobody renews it, it disappears.' },
		{ term: 'Watchdog', def: 'A kernel or hardware timer that resets the machine unless it gets a keepalive in time. Patroni relies on it when the node cannot demote itself.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['a["Node A: primary"] -->|"renew lock every 10 s"| etcd[("etcd: leader key, TTL 30 s")]', 'b["Node B: replica"] -->|"reads: leader is A"| etcd'],
				highlight: ['a', 'etcd'],
				note: 'A holds the leader key and renews it on every loop, every `loop_wait` (10 s by default). The failsafe doc: "the node is allowed to run Postgres as the primary only if it can update the leader lock in DCS." B sees the key and keeps replicating from A.'
			},
			{
				add: ['cut["Network split: A cannot reach etcd"] -.-> a'],
				highlight: ['cut'],
				note: 'From where A stands, etcd being down and A being cut off look the same. Patroni assumes the worst, a partition, so A **demotes itself** to read-only right away, before its key can expire. Until another node promotes, the cluster has no primary and refuses writes.'
			},
			{
				add: ['b -->|"key expired: create it if absent"| etcd'],
				highlight: ['b'],
				note: 'After the TTL, etcd deletes the key. B checks it is healthy enough (not too far behind), then tries to create the key. The create only succeeds if the key does not exist, and etcd agrees on that across its own nodes. The one node whose create succeeds promotes itself.'
			},
			{
				add: ['wd["Watchdog on A"] -->|"reset if no keepalive"| a'],
				highlight: ['wd'],
				note: 'If Patroni on A has crashed or its VM is paused, nobody runs the demote. The watchdog needs nothing from Patroni: without a keepalive, it resets the machine. Patroni sets it to fire 5 seconds before the TTL, so A is down before B can win.'
			},
			{
				add: ['a -.->|"commits B never got"| lost["Forked timeline on A"]'],
				highlight: ['lost'],
				note: 'With asynchronous replication, commits A had not streamed to B stay on A\'s old timeline, "effectively unrecoverable". `maximum_lag_on_failover` caps how far behind a winner may be. `synchronous_mode` makes it zero, but writes then block when no synchronous standby is left.'
			}
		]
	},
	example: {
		title: 'patroni/ha.py: the leader renews its lock, or stops being the leader',
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
			'Line 12: nothing else happens on the leader until `update_lock(True)` succeeds. [`update_lock`](' + HA + '#L375-L410) writes the leader key, and only after a successful write calls `self.watchdog.keepalive()`. A leader that cannot write the key stops feeding its own watchdog.',
			'Lines 36 to 40: on a failed update, a running primary calls `demote(\'immediate-nolock\')`. The [failsafe doc](' + PATRONI + '/docs/dcs_failsafe_mode.rst?plain=1#L15-L20) explains why: a failed update can be a partition or a DCS outage, and "it is impossible to distinguish between these two from a single node". Only in pause (lines 37 and 38), when a human is in charge, does it stay primary.',
			'On etcd v3, [`_do_attempt_to_acquire_leader`](' + PATRONI + '/patroni/dcs/etcd3.py#L973-L991) takes the lock: it writes the leader key with the node\'s lease and `create_revision=\'0\'`, a condition that only holds when the key does not exist. etcd\'s docs: "When a lease expires or is revoked, all keys attached to that lease will be deleted."',
			'A replica only races when [`is_lagging`](' + HA + '#L1371-L1379) is false, that is, it is within `maximum_lag_on_failover` bytes of the last known primary position. The docstring (in the sources) admits that several nodes may count themselves as the healthiest, "but this is totally fine": the write with `create_revision=\'0\'` succeeds for only one of them.',
			'The [watchdog doc](' + PATRONI + '/docs/watchdog.rst?plain=1#L6-L18) lists what can stop the demote: Patroni "has crashed", "Shutting down PostgreSQL is too slow", or the VM is paused. With `ttl=30` and `loop_wait=10`, the loop has "at least 15 seconds" before the machine is reset.'
		]
	},
	tradeoff: {
		gain: [
			'At most one primary at a time, as long as the DCS works and the old primary demotes or its watchdog resets it: no forked histories to merge by hand.',
			'Failover needs no human: within about a TTL, a healthy replica holds the lock and promotes.'
		],
		cost: [
			'If etcd is unreachable, a perfectly healthy primary demotes itself, unless you turn on `failsafe_mode` and every member can confirm it.',
			'The old key has to expire before a replica can promote, so expect tens of seconds with no primary under the default `ttl` of 30.',
			'With asynchronous replication, the last commits before failover are lost. `synchronous_mode` avoids that, but "the system may be unavailable for writes even though some servers are available".',
			'The DCS is one more cluster to run, with its own three or five nodes, monitoring and upgrades.'
		]
	},
	task: {
		prompt: 'Three Patroni nodes, etcd with three members, `ttl: 30`, `loop_wait: 10`, `retry_timeout: 10`, asynchronous replication. At 03:00:00 the switch port of the primary, node A, dies: A can no longer reach etcd, B or C, but the app servers on its rack still reach A. Write a timeline of the next minute: who is primary when, and what the app on A\'s rack sees.',
		hint: 'Follow A first: when does it try to renew, and what does it do when that fails? Then follow the key in etcd.',
		answer: [
			'Until A\'s next loop, at most 10 s later, A is still primary and its rack keeps writing. Those writes cannot reach B or C.',
			'At that loop A tries to renew the key. The call fails within `retry_timeout` (10 s). A demotes itself to read-only. From now on, the app on A\'s rack gets errors on writes: downtime for them, but no second primary.',
			'In etcd the key expires 30 s after A\'s last successful renewal, so by about 03:00:30. On their next loop B and C see no leader, check their lag, and race. Say B creates the key first and promotes; C follows B.',
			'If A\'s Patroni had hung instead of demoting, the watchdog, set 5 s before the TTL, resets A before the key expires. So A is no longer running when B promotes.',
			'The cost: commits A took in the last seconds before it demoted, and that never streamed to B, stay on A\'s old timeline. With `synchronous_mode` they would not have been acknowledged in the first place.'
		],
		steps: [
			{
				title: 'Follow A in its first seconds',
				questions: [
					{ q: 'At 03:00:00 the port dies. Is A still primary right after?', options: ['No, it demotes the instant the port dies', 'Yes, until its next loop, at most 10 s later', 'Yes, until the key expires 30 s later', 'No, B promotes at once'], answer: 1, why: 'Patroni only notices on its next loop, every `loop_wait` (10 s). Until then A keeps accepting writes from its rack.' },
					{ q: 'Where do the writes A takes in those seconds go?', options: ['To B and C, once the port is back', 'Nowhere: A refuses them', 'Into etcd', 'Only into A: they cannot reach B or C'], answer: 3, why: 'With asynchronous replication, the commit returns once A flushed its own WAL. Nothing can stream out.' },
					{ q: 'A tries to renew the key and cannot reach etcd. How long can that call take?', options: ['Up to `retry_timeout`, 10 s', 'Up to the TTL, 30 s', 'Forever, until etcd answers', 'No time: it fails at once'], answer: 0, why: '`retry_timeout` bounds how long Patroni retries the DCS before treating the update as failed.' },
					{ q: 'Why can\'t A wait and see if the problem is only etcd?', options: ['etcd forbids it', 'A has no replicas', 'From one node, a DCS outage and a partition look the same', 'Postgres would crash'], answer: 2, why: 'The failsafe doc: "it is impossible to distinguish between these two from a single node". In a partition, another node may already be promoting.' }
				]
			},
			{
				title: 'Say what A does and what its rack sees',
				questions: [
					{ q: 'The renewal failed. What does A do?', options: ['`demote(\'immediate-nolock\')`: it restarts read-only', 'It keeps running as primary', 'It shuts down Postgres and waits for an operator', 'It promotes B over the network'], answer: 0, why: 'The leader code demotes at once on a failed update, unless the cluster is paused.' },
					{ q: 'What does the app on A\'s rack see from then on?', options: ['Writes keep working against A', 'Writes go to B through A', 'Errors on writes: downtime, but no second primary', 'Stale reads with no errors'], answer: 2, why: 'A read-only server refuses writes. That is the price of never having two primaries.' },
					{ q: 'A stops renewing. What else does that stop?', options: ['etcd itself', 'The keepalive to A\'s watchdog', 'Replication from B', 'The TTL countdown'], answer: 1, why: '`update_lock` calls `watchdog.keepalive()` only after a successful write. A leader that cannot write stops feeding its watchdog.' },
					{ q: 'A\'s Patroni had hung instead of demoting. What saves you?', options: ['The watchdog resets A, set 5 s before the TTL runs out', 'etcd kills A\'s Postgres', 'B sends A a demote command', 'Nothing: you get split brain'], answer: 0, why: 'The watchdog needs nothing from Patroni. A is down before the key can expire and B can win.' }
				]
			},
			{
				title: 'Follow the key in etcd',
				questions: [
					{ q: 'When does the leader key disappear?', options: ['At 03:00:00, when the port dies', 'At A\'s next loop', '30 s after A\'s last successful renewal, by about 03:00:30', 'Only when an operator deletes it'], answer: 2, why: 'The key is attached to a lease with a 30 s TTL. When the lease expires, etcd deletes every key attached to it.' },
					{ q: 'What must B check before it races for the key?', options: ['That A is unreachable by ping', 'That it is not lagging past `maximum_lag_on_failover`', 'That C agrees by vote', 'That its disk is empty'], answer: 1, why: 'A replica only races when `is_lagging` is false. A replica too far behind would lose too many commits.' },
					{ q: 'B and C both feel healthiest and race. How does etcd pick one?', options: ['The node with the lowest name wins', 'Both win and etcd merges them', 'The first node to ping etcd wins', 'The create only succeeds if the key does not exist, so one write wins'], answer: 3, why: 'Patroni writes with `create_revision=\'0\'`. etcd agrees on that condition across its own members.' },
					{ q: 'B wins. What does C do?', options: ['It follows B', 'It promotes too', 'It shuts down', 'It keeps following A'], answer: 0, why: 'C sees B holds the key and replicates from the new primary.' }
				]
			},
			{
				title: 'Count what is lost',
				questions: [
					{ q: 'Which commits are lost?', options: ['None: Patroni promotes only a replica with every commit', 'Those A took in its last seconds that never streamed to B', 'Everything since the last base backup', 'All writes made after 03:00:30'], answer: 1, why: 'With asynchronous replication, they stay on A\'s old timeline, "effectively unrecoverable".' },
					{ q: 'What bounds that loss in the worst case?', options: ['The TTL alone', '`loop_wait` alone', '`maximum_lag_on_failover` bytes, plus what was written in the last TTL seconds', 'The size of A\'s disk'], answer: 2, why: 'The primary\'s position is only sampled each loop, so the doc adds the last TTL seconds to the lag limit.' },
					{ q: 'Which setting would have kept those commits?', options: ['A shorter `loop_wait`', '`failsafe_mode`', 'A bigger `maximum_lag_on_failover`', '`synchronous_mode`: they would not have been acknowledged'], answer: 3, why: 'With synchronous mode, a commit returns only once a standby has it.' },
					{ q: 'What does `synchronous_mode` cost?', options: ['Writes can block when no synchronous standby is left', 'Reads must go to the primary', 'etcd needs five members', 'Nothing'], answer: 0, why: 'The doc: "the system may be unavailable for writes even though some servers are available".' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Patroni on the primary cannot update the leader key, but Postgres itself is fine and clients are connected. What does Patroni do, by default?',
			options: [
				'Keeps it primary until a replica actually takes the key, then demotes',
				'Demotes Postgres right away, because it cannot tell a partition from an outage',
				'Keeps it primary, because a healthy Postgres is a better choice than none',
				'Shuts Postgres down and waits for an operator to restart it by hand'
			],
			answer: 1,
			why: 'The doc: "In case the update of the leader lock fails, Postgres is immediately demoted and started as read-only." From one node, a DCS outage and a network partition look the same, and in a partition another node may already be promoting. `failsafe_mode` is the opt-in exception.'
		},
		{
			q: 'Why does Patroni need a watchdog when it already demotes the primary on a failed lock update?',
			options: [
				'Because the watchdog is what actually renews the leader key in etcd',
				'Because Postgres ignores demote requests while it has open transactions',
				'Because Patroni itself may be crashed or frozen and never run the demote',
				'Because etcd can only expire a key after the old node has been reset'
			],
			answer: 2,
			why: 'The demote is code Patroni must run. The watchdog doc lists what can stop it: a crash, a slow shutdown, or Patroni not getting to run because the VM is paused. The watchdog resets the machine without asking Patroni anything.'
		},
		{
			q: 'With asynchronous replication and `maximum_lag_on_failover` at 1 MB, the primary dies. What can you lose?',
			options: [
				'Up to about 1 MB of WAL, plus what was written since the last status update',
				'Nothing, because Patroni only promotes a replica that has every commit',
				'Exactly 1 MB of WAL, because that is the size Patroni keeps in reserve',
				'Everything since the last base backup, since the replica has to be rebuilt'
			],
			answer: 0,
			why: 'The replication modes doc: loss is "worst case bounded by maximum_lag_on_failover bytes of transaction log plus the amount that is written in the last ttl seconds", because the primary\'s position is only sampled each loop. With `synchronous_mode`, Patroni only promotes a standby it is "certain" holds every commit acknowledged to a client (day 28).'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Play the leader key by hand in a real etcd: take it with a lease, lose it by not renewing, and watch a second node win it.',
		steps: [
			'Start etcd: `docker run -d --name dojo-etcd quay.io/coreos/etcd:v3.5.17 etcd --listen-client-urls http://0.0.0.0:2379 --advertise-client-urls http://localhost:2379`',
			'Node A gets a lease with the default Patroni TTL: `docker exec dojo-etcd etcdctl lease grant 30`. Note the lease id.',
			'A takes the key only if nobody holds it: `printf \'create("/leader") = "0"\\n\\nput /leader A --lease=<A lease>\\n\\nget /leader\\n\\n\' | docker exec -i dojo-etcd etcdctl txn`',
			'Node B gets its own lease (`etcdctl lease grant 30` again) and sends the same transaction with `B` and its lease id.',
			'A renews, as a healthy leader does every loop: `docker exec dojo-etcd etcdctl lease keep-alive --once <A lease>`, then `docker exec dojo-etcd etcdctl lease timetolive <A lease>`.',
			'Now cut A off: stop renewing. Run `lease timetolive <A lease>` a few times, and after 30 seconds `docker exec dojo-etcd etcdctl get /leader`.',
			'B races again: get B a fresh lease, resend its transaction, then `docker exec dojo-etcd etcdctl get /leader`. Then A comes back and tries to renew: `docker exec dojo-etcd etcdctl lease keep-alive --once <A lease>`.'
		],
		done: [
			'In step 3, etcd prints `SUCCESS`. In step 4, it prints `FAILURE` followed by `/leader` and `A`.',
			'In step 5, `timetolive` shows the remaining time back near 30 s.',
			'In step 6, the remaining time counts down to `already expired`, and `get /leader` prints nothing.',
			'In step 7, B gets `SUCCESS` and `get /leader` shows `B`. A gets `requested lease not found`.'
		],
		solution: [
			'`create("/leader") = "0"` holds only when the key does not exist, and etcd checks it atomically. That is the `create_revision=\'0\'` write Patroni sends, and why two nodes cannot both win.',
			'The key lives only as long as its lease. A leader that stops renewing loses the key after the TTL, with nobody having to delete it.',
			'When A returns, its lease is gone, so it cannot claim it is still leader. Patroni goes further: A demoted itself at the first failed renewal, long before the TTL ran out.',
			'Clean up with `docker rm -f dojo-etcd`.'
		]
	},
	recall: {
		q: 'What makes a Patroni primary demote itself, and what keeps a frozen primary from writing after a replica takes over?',
		a: 'A failed update of the leader key in etcd: Patroni calls `demote(\'immediate-nolock\')` at once. If Patroni is frozen, the watchdog resets the machine 5 seconds before the 30 s TTL runs out.'
	},
	sources: [
		{ title: 'Patroni docs, Watchdog support', url: 'https://patroni.readthedocs.io/en/latest/watchdog.html' },
		{ title: 'Patroni docs, DCS Failsafe Mode', url: 'https://patroni.readthedocs.io/en/latest/dcs_failsafe_mode.html' },
		{ title: 'Patroni docs, Replication modes', url: 'https://patroni.readthedocs.io/en/latest/replication_modes.html' },
		{ title: 'etcd docs, KV API guarantees and leases', url: 'https://etcd.io/docs/v3.5/learning/api/' },
		{ title: 'Patroni source, patroni/ha.py', url: HA },
		{ title: 'Patroni source, ha.py, choosing the healthiest node', url: `${HA}#L1390-L1393` }
	]
};
