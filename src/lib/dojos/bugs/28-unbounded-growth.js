const ETCD = 'https://github.com/etcd-io/etcd';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'unbounded-growth',
	part: 'Resources',
	title: 'A queue only the leader empties',
	minutes: 10,
	hook: [
		'An etcd 3.4.3 cluster of three members serves clients that use leases. The report: "Leader memory is normal , but two follower node memory are very big". There is no goroutine leak, the load is low, and a restart only helps for a while.',
		'A lease is a timer: keys attached to it are deleted when it expires. Every member keeps all leases, but only the leader expires them. `revokeExpiredLeases` runs `findExpiredLeases` only `if le.isPrimary()`, and that loop is the only code that pops items off `leaseExpiredNotifier`.'
	],
	terms: [
		{ term: 'Lease', def: 'An etcd object with a time to live. When it expires or is revoked, the keys attached to it are deleted.' },
		{ term: 'Leader and follower', def: 'etcd members agree through Raft. One member is the leader (`isPrimary()` is true), the others are followers that apply the same log.' },
		{ term: 'leaseExpiredNotifier', def: 'A heap of lease IDs ordered by expiry time, plus a map from ID to item. The leader polls it to find leases to revoke.' }
	],
	bug: {
		title: 'lease: fix memory leak in LeaseGrant when node is follower',
		repo: 'etcd-io/etcd',
		url: `${ETCD}/blob/3ac7a1151519af0816647d5f0757119c3f4a24ac/lease/lessor.go#L276-L305`,
		fix: `${ETCD}/commit/b1da829844837b71c37546dda24ce7150b0e771f`,
		lang: 'go',
		code: `le.mu.Lock()
defer le.mu.Unlock()

if _, ok := le.leaseMap[id]; ok {
	return nil, ErrLeaseExists
}

if l.ttl < le.minLeaseTTL {
	l.ttl = le.minLeaseTTL
}

if le.isPrimary() {
	l.refresh(0)
} else {
	l.forever()
}

le.leaseMap[id] = l
item := &LeaseWithTime{id: l.ID, time: l.expiry.UnixNano()}
le.leaseExpiredNotifier.RegisterOrUpdate(item)
l.persistTo(le.b)

leaseTotalTTLs.Observe(float64(l.ttl))
leaseGranted.Inc()

if le.isPrimary() {
	le.scheduleCheckpointIfNeeded(l)
}

return l, nil`,
		lines: [19, 20],
		diff: ` 	le.leaseMap[id] = l
-	item := &LeaseWithTime{id: l.ID, time: l.expiry.UnixNano()}
-	le.leaseExpiredNotifier.RegisterOrUpdate(item)
 	l.persistTo(le.b)

 	leaseTotalTTLs.Observe(float64(l.ttl))
 	leaseGranted.Inc()

 	if le.isPrimary() {
+		item := &LeaseWithTime{id: l.ID, time: l.expiry.UnixNano()}
+		le.leaseExpiredNotifier.RegisterOrUpdate(item)
 		le.scheduleCheckpointIfNeeded(l)
 	}`,
		notes: [
			'**Every member adds, one member removes.** Lines 19 and 20 run on every member, leader or not. The heap only shrinks in `expireExists`, which only the leader calls. On a follower, each new lease ID adds one item to the heap and one entry to its map, and nothing takes them out.',
			'**Revoking does not help.** `Revoke` deletes the lease from `leaseMap` and from the backend, but leaves its item in the notifier. On the leader, `expireExists` later finds the dead ID and unregisters it. On a follower that never happens. Say clients grant and revoke 10 leases a second: after one day each follower holds 864,000 items for leases that no longer exist.',
			'**The item on a follower is useless anyway.** Line 15 sets a follower lease to `forever()`, so the item it registers has an expiry far in the future. When a follower becomes leader, `Promote` refreshes every lease and registers it again, so the leader does not need what the follower stored.',
			'**The fix.** Register the item only `if le.isPrimary()`. The same commit makes `Demote` replace the notifier with an empty one, so a leader that steps down drops its items too. Reported in issue [#11730](' + ETCD + '/issues/11730), fixed in pull request [#11731](' + ETCD + '/pull/11731).'
		]
	},
	quiz: [
		{
			q: 'Clients grant and then revoke 1,000 leases with new IDs. How many items does a follower’s notifier hold afterwards, before the fix?',
			options: ['0, because each revoke removes its item', '1, because items share one slot per member', '1,000, one for each lease ID', '2,000, one for the grant and one for the revoke'],
			answer: 2,
			why: '`RegisterOrUpdate` adds one item per new ID. `Revoke` does not touch the notifier, and only the leader pops items, so all 1,000 stay.'
		},
		{
			q: 'Why was the leader’s memory normal in the report?',
			options: [
				'The leader grants fewer leases than the followers',
				'The leader polls the heap and unregisters items for gone leases',
				'The leader stores leases on disk instead of in memory',
				'The leader rebuilds its notifier every 500 ms'
			],
			answer: 1,
			why: '`findExpiredLeases` runs on the leader and calls `expireExists`, which unregisters items whose ID is no longer in `leaseMap`.'
		},
		{
			q: 'You add items to a queue or map. What should you check first to rule out this kind of leak?',
			options: [
				'That the code that removes items runs on every path that adds them',
				'That the map was created with a large enough capacity',
				'That the items are small structs and not pointers',
				'That the queue is protected by the same mutex as the map'
			],
			answer: 0,
			why: 'Here the add ran on every member and the remove only on the leader. Size, item type and locking do not stop a structure from growing if nothing removes from it.'
		}
	],
	takeaway: 'For each map, heap or queue that grows, find the code that removes from it and check it runs wherever the adding code runs. A role check (leader only, primary only) on one side and not the other is a leak.',
	sources: [
		{ title: 'etcd pull request #11731', url: `${ETCD}/pull/11731` },
		{ title: 'etcd issue #11730, the report', url: `${ETCD}/issues/11730` }
	]
};
