const RAFT = 'https://github.com/etcd-io/raft/blob/638f42739b77572b5708eb0d8a776a272ade71ed';
const FAQ = 'https://github.com/etcd-io/website/blob/d8c30b769bc6dc107250492483278ea70af6390e/content/en/docs/v3.6/faq.md';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'consensus',
	part: 'Beyond one server',
	title: 'How replicas agree',
	minutes: 10,
	hook: [
		'Your Patroni cluster (day 29) keeps its leader key in a three-member etcd. One etcd host dies at night and **nobody notices**: writes keep working.',
		'A week later a second host dies. One etcd member is still up, healthy, with all the data, yet **writes stop committing**.',
		'etcd agrees on every write with Raft. A write counts only when a majority of members has it on disk, and a majority of three is two. The one member left cannot reach two, so etcd commits nothing.'
	],
	terms: [
		{ term: 'Leader, follower, candidate', def: 'The three roles a node can have. Only the leader accepts writes, and followers copy its log. A follower that stops hearing from the leader turns candidate and asks for votes.' },
		{ term: 'Term', def: 'A number that grows with each election. Each term has at most one leader. A node that sees a higher term steps down to follower.' },
		{ term: 'Quorum', def: 'A majority of voting members: (n/2)+1, rounded down in the division. 2 of 3, 3 of 4, 3 of 5.' },
		{ term: 'Commit', def: 'An entry of the log is committed once a quorum has stored it. Only then is it applied, and it is never lost after that.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['lead["Leader, term 4"] -->|"heartbeat"| f1["Follower A"]', 'lead -->|"heartbeat"| f2["Follower B"]'],
				highlight: ['lead'],
				note: 'Term 4 has one leader, and it sends heartbeats at a regular tick. As long as they arrive, followers reset their election timer and do nothing else. Writes go only to the leader.'
			},
			{
				add: ['f1 -->|"no heartbeat: term 5, vote for me"| f2'],
				highlight: ['f1'],
				note: 'Follower A waits for the election timeout with no heartbeat, then turns candidate: it adds one to the term, votes for itself, and asks the others for their vote. (With pre-vote on, it first asks whether it could win, without raising its term.) In etcd\'s raft, the timeout is a random number between the election timeout and twice that, so two followers rarely start together.'
			},
			{
				add: ['f2 -->|"vote granted: your log is as recent as mine"| f1'],
				highlight: ['f2'],
				note: 'B votes only if it has not voted for someone else in this term, and if A\'s last log entry is at least as recent as its own: a later term, or the same term and an index at least as large. A candidate that missed committed entries cannot win.'
			},
			{
				add: ['f1 -->|"append entry 42, term 5"| log[("Log on each node")]', 'log -->|"stored on 2 of 3"| commit["Committed: apply to state machine"]'],
				highlight: ['log', 'commit'],
				note: 'The new leader appends each write to its log and sends it to followers, who persist it and answer with their last index. When a quorum holds index 42, the entry is committed and every node applies it.'
			},
			{
				add: ['lead -.->|"alone in a minority: cannot commit"| log'],
				highlight: ['lead'],
				note: 'If the old leader was only cut off, it may still think it leads term 4. It cannot reach a majority, so nothing it accepts commits. When it next hears a message from term 5, it steps down to follower.'
			}
		]
	},
	example: {
		title: 'raft.go: terms, votes and commits in etcd\'s Raft library',
		repo: 'etcd-io/raft',
		url: `${RAFT}/raft.go#L772-L1262`,
		lang: 'go',
		code: `// maybeCommit attempts to advance the commit index. Returns true if the commit
// index changed (in which case the caller should call r.bcastAppend). This can
// only be called in StateLeader.
func (r *raft) maybeCommit() bool {
	defer traceCommit(r)

	return r.raftLog.maybeCommit(entryID{term: r.Term, index: r.trk.Committed()})
}
…
func (r *raft) becomeCandidate() {
	// TODO(xiangli) remove the panic when the raft implementation is stable
	if r.state == StateLeader {
		panic("invalid transition [leader -> candidate]")
	}
	r.step = stepCandidate
	r.reset(r.Term + 1)
	r.tick = r.tickElection
	r.Vote = r.id
	r.state = StateCandidate
	r.logger.Infof("%x became candidate at term %d", r.id, r.Term)

	traceBecomeCandidate(r)
}
…
	case pb.MsgVote, pb.MsgPreVote:
		// We can vote if this is a repeat of a vote we've already cast...
		canVote := r.Vote == m.GetFrom() ||
			// ...we haven't voted and we don't think there's a leader yet in this term...
			(r.Vote == None && r.lead == None) ||
			// ...or this is a PreVote for a future term...
			(m.GetType() == pb.MsgPreVote && m.GetTerm() > r.Term)
		// ...and we believe the candidate is up to date.
		lastID := r.raftLog.lastEntryID()
		candLastID := entryID{term: m.GetLogTerm(), index: m.GetIndex()}
		if canVote && r.raftLog.isUpToDate(candLastID) {
…
			r.send(&pb.Message{To: m.From, Term: m.Term, Type: voteRespMsgType(m.GetType()).Enum()})
			if m.GetType() == pb.MsgVote {
				// Only record real votes.
				r.electionElapsed = 0
				r.Vote = m.GetFrom()
			}
		} else {
			r.logger.Infof("%x [logterm: %d, index: %d, vote: %x] rejected %s from %x [logterm: %d, index: %d] at term %d",
				r.id, lastID.term, lastID.index, r.Vote, m.GetType(), m.GetFrom(), candLastID.term, candLastID.index, r.Term)
			r.send(&pb.Message{To: m.From, Term: new(r.Term), Type: voteRespMsgType(m.GetType()).Enum(), Reject: new(true)})
		}`,
		notes: [
			'Line 16 calls `reset(r.Term + 1)`, which [clears `Vote` when the term changes](' + RAFT + '/raft.go#L781-L785), and line 18 votes for itself. `campaign` (in the sources) sends a vote request to every voter with its last log index and term.',
			'Line 35 grants the vote only if [`isUpToDate`](' + RAFT + '/log.go#L435-L445) returns true: the candidate\'s last term is higher, or equal with an index at least as large. The code is `their.term > our.term || their.term == our.term && their.index >= our.index`.',
			'Line 7 gets the commit index from `r.trk.Committed()`, which ends in [`CommittedIndex`](' + RAFT + '/quorum/majority.go#L156-L162). It sorts every voter\'s acknowledged index and takes the one at position `n - (n/2 + 1)`. With five voters at 9, 7, 7, 4 and 3, the result is 7.',
			'Line 7 also passes `term: r.Term`, and [`raftLog.maybeCommit`](' + RAFT + '/log.go#L455-L464) commits only if the entry at that index has that term (`matchTerm`). So a leader commits by counting replicas only for entries of its own term. Every older entry before it is committed at the same time.',
			'The library does no disk or network work itself. Its [README](' + RAFT + '/README.md#L12) says "both network and disk IO are left to the user", and that no message may be sent "until the latest HardState has been persisted to disk" (in the sources). A vote or an ack that is not on disk could be forgotten after a crash.'
		]
	},
	tradeoff: {
		gain: [
			'Two leaders in one term would need two majorities, and two majorities of one cluster always share a member. The [FAQ](' + FAQ + '#L85) says the quorum model "totally avoids any possibility of split brain inconsistency".',
			'A committed write survives the loss of any minority: 1 of 3 members, 2 of 5.',
			'After a partition, etcd recovers with no operator action. Its [FAQ](' + FAQ + '#L51): it "automatically and safely resumes once the network recovers and restores quorum".'
		],
		cost: [
			'Every write waits for a majority to persist it, so latency is that of the slowest member in the fastest majority. Across regions, each write waits for a cross-region round trip.',
			'Losing a majority stops all writes, even if the members left hold every byte. The FAQ calls permanent quorum loss "catastrophic".',
			'Each extra member is one more machine that every write is copied to. The [FAQ](' + FAQ + '#L47) advises no more than seven, because "data must be replicated across more machines".',
			'4 members tolerate 1 failure, the same as 3. The FAQ: it ["doesn\'t buy additional fault tolerance"](' + FAQ + '#L67).'
		]
	},
	task: {
		prompt: 'A five-member etcd cluster. The leader is at term 8 and the acknowledged log indexes are: leader 9, B 7, C 7, D 4, E 3. (1) What is the commit index? (2) B and C crash. Can the cluster still commit? (3) B and C come back, and D starts an election at term 9 with last entry (term 8, index 4). Does C vote for it?',
		hint: 'Commit: sort the indexes and count a majority from the top. Votes: compare the last entry\'s term first, then its index.',
		answer: [
			'(1) Sorted: 3, 4, 7, 7, 9. The quorum is 5/2+1 = 3, so the position is 5 - 3 = 2, value 7. Three members (leader, B, C) hold index 7. Entry 7 commits if it was written in term 8.',
			'(2) Three members are left: leader, D and E. Three is still a quorum, so the cluster can commit, but only once D and E catch up to the new entries. The leader keeps sending them what they miss.',
			'(3) No. C\'s last entry is (term 8, index 7) and D\'s is (term 8, index 4): same term, smaller index, so D is not up to date and C rejects the vote. (If C heard from the leader within the election timeout and check-quorum is on, it [ignores the request](' + RAFT + '/raft.go#L1100-L1112) outright.) D cannot win without a vote from someone holding entry 7.',
			'Check (2) against the [fault tolerance table](' + FAQ + '#L55-L65) in the etcd FAQ: 5 members have a majority of 3 and tolerate 2 failures.'
		],
		steps: [
			{
				title: 'Find the commit index',
				questions: [
					{ q: 'What is the quorum of a five-member cluster?', options: ['3', '2', '4', '5'], answer: 0, why: '(n/2)+1 with the division rounded down: 5/2 is 2, plus 1 is 3.' },
					{ q: 'You sort the acknowledged indexes: 3, 4, 7, 7, 9. Which position gives the commit index?', options: ['Position 4, the highest', 'Position 2, counting from 0', 'Position 0, the lowest', 'Position 1'], answer: 1, why: 'etcd takes position `n - (n/2 + 1)`, here 5 - 3 = 2. Every value from there up is held by at least a quorum.' },
					{ q: 'What is the commit index?', options: ['9', '4', '7', '3'], answer: 2, why: 'The leader, B and C hold index 7: three members, a quorum. Only the leader holds 9.' },
					{ q: 'When does counting replicas commit entry 7?', options: ['Only once all five members hold it', 'Only after D and E acknowledge it', 'As soon as the leader has it on disk', 'Only if entry 7 was written in the leader\'s own term, 8'], answer: 3, why: 'A leader commits by counting replicas only for entries of its own term. Older entries before it commit along with it.' }
				]
			},
			{
				title: 'Lose B and C',
				questions: [
					{ q: 'B and C crash. Which members are left?', options: ['The leader, D and E', 'Only the leader', 'The leader and D', 'D and E'], answer: 0, why: 'Three of the five are still up.' },
					{ q: 'Can the cluster still commit?', options: ['No: two failures always stop writes', 'Yes: three is still a quorum of five', 'Only reads work from now on', 'Only after a new election'], answer: 1, why: 'Losing a minority, 2 of 5, leaves a majority, so the leader keeps committing.' },
					{ q: 'What must happen before a new write commits?', options: ['B and C must come back', 'The operator must reset the cluster', 'D and E must catch up and persist the entries they miss', 'A new leader must be elected'], answer: 2, why: 'D is at 4 and E at 3. The leader keeps sending them what they lack, and once both hold the new entry, three members have it.' },
					{ q: 'How many failures does a five-member cluster survive?', options: ['1', '3', '4', '2'], answer: 3, why: 'With 2 down, 3 are left, still a quorum. A third failure leaves 2, below it.' }
				]
			},
			{
				title: 'Judge D\'s vote request',
				questions: [
					{ q: 'B and C are back. What is C\'s last log entry?', options: ['(term 8, index 7)', '(term 8, index 4)', '(term 9, index 7)', '(term 7, index 7)'], answer: 0, why: 'C had acknowledged index 7, written in term 8.' },
					{ q: 'D asks for a vote with last entry (term 8, index 4). To decide whether D\'s log is up to date, what does C compare first?', options: ['The time of each last write', 'The term of each last entry', 'The index of each last entry', 'The node ids'], answer: 1, why: 'Up to date means a later last term, or the same last term and an index at least as large. The term comes first.' },
					{ q: 'Both last entries are in term 8. What decides it?', options: ['D wins ties, since it asked first', 'The higher election term, 9, wins', 'The index: 4 is smaller than 7, so D is not up to date', 'A random draw'], answer: 2, why: 'With the same last term, the candidate needs an index at least as large as the voter\'s.' },
					{ q: 'Does C vote for D?', options: ['Yes, because term 9 is higher than 8', 'Yes, if C has not voted in term 9 yet', 'Yes, but only if the leader is gone', 'No: D\'s log is behind C\'s'], answer: 3, why: '`isUpToDate` returns false, so C rejects the vote whatever the term of the request.' }
				]
			},
			{
				title: 'Draw the lesson',
				questions: [
					{ q: 'Why can D never win this election?', options: ['Any majority of three includes the leader, B or C, who all hold entry 7 and reject D', 'D has the lowest node id', 'Term 9 is too high to be accepted', 'etcd forbids a member that crashed from leading'], answer: 0, why: 'D only has its own vote and E\'s. The third vote must come from a member with entry 7.' },
					{ q: 'C heard the leader within the election timeout, and check-quorum is on. What does it do with D\'s request?', options: ['It votes yes, then steps down', 'It ignores the request outright', 'It becomes a candidate too', 'It forwards it to the leader'], answer: 1, why: 'A follower that still hears a live leader ignores vote requests, so a lagging member cannot disrupt the cluster.' },
					{ q: 'Why does the up-to-date rule matter?', options: ['It makes elections faster', 'It sends fewer messages', 'A candidate that missed committed entries cannot win, so a committed write is never lost', 'It saves disk space'], answer: 2, why: 'A committed entry is on a quorum, and every majority shares a member with that quorum. That member blocks any candidate without it.' },
					{ q: 'Someone proposes a sixth member "for safety". How many failures can six survive?', options: ['3', '5', '1', '2, the same as five, since the quorum rises to 4'], answer: 3, why: 'The quorum of 6 is 4, so losing 3 leaves too few. The FAQ: an even size "doesn\'t buy additional fault tolerance".' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You grow an etcd cluster from 3 to 4 members. How many member failures can it now survive?',
			options: [
				'One, the same as with 3, because the quorum rises from 2 to 3',
				'Two, because 4 members leave 2 alive after two failures',
				'Three, because one live member is enough to keep serving',
				'None, because an even number of members cannot elect a leader'
			],
			answer: 0,
			why: 'The quorum of 4 is 4/2+1 = 3. Losing 2 leaves 2, below the quorum. The etcd FAQ says adding a member to reach an even size "doesn\'t buy additional fault tolerance".'
		},
		{
			q: 'A follower at term 6, which has heard no leader for a full election timeout, receives a vote request for term 7 from a candidate whose last entry is (term 5, index 30). The follower\'s last entry is (term 6, index 12). What happens?',
			options: [
				'It grants the vote, because the candidate\'s log has more entries',
				'It moves to term 7 and rejects, because its own last term is higher',
				'It ignores the message, because a higher term must come from a leader',
				'It grants the vote, because the candidate\'s term 7 is higher than 6'
			],
			answer: 1,
			why: 'With no recent leader, the higher term in the request moves the follower to term 7. The vote then depends on the logs, and the last term is compared first: 6 is later than 5, so the candidate is not up to date, however long its log.'
		},
		{
			q: 'A network split leaves the old leader alone, with two followers on the other side. A client sends the old leader a write. What happens to it?',
			options: [
				'It commits at once, and the other side copies it after the split heals',
				'It commits on the old leader, and the two sides merge their logs later',
				'It never commits, because the old leader cannot reach a majority',
				'It is sent on to the new leader by the followers on the other side'
			],
			answer: 2,
			why: 'Commit needs a quorum of 2, and the old leader reaches only itself. The two followers elect a new leader at a higher term. When the old leader hears that term, it steps down, and its uncommitted entries are replaced by the new leader\'s log.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Run a three-member etcd on your laptop, stop members one by one, and watch writes keep working with 2 of 3 and stop with 1 of 3.',
		steps: [
			'Start a container that only holds a network for the three members, then the members, each on its own localhost ports: `docker run -d --name etcd-net alpine:3.20 sleep 86400`, then `for i in 1 2 3; do docker run -d --name etcd$i --network container:etcd-net quay.io/coreos/etcd:v3.5.25 etcd --name etcd$i --data-dir /etcd-data --listen-client-urls http://127.0.0.1:${i}2379 --advertise-client-urls http://127.0.0.1:${i}2379 --listen-peer-urls http://127.0.0.1:${i}2380 --initial-advertise-peer-urls http://127.0.0.1:${i}2380 --initial-cluster etcd1=http://127.0.0.1:12380,etcd2=http://127.0.0.1:22380,etcd3=http://127.0.0.1:32380 --initial-cluster-state new; done`.',
			'Look at the cluster and write a key: `docker exec etcd1 etcdctl --endpoints=127.0.0.1:12379,127.0.0.1:22379,127.0.0.1:32379 endpoint status -w table`, then `docker exec etcd1 etcdctl --endpoints=127.0.0.1:12379 put /service/leader node-a`. Note which member `IS LEADER`.',
			'Stop one member that is not the leader, for example `docker stop etcd3` if `etcd1` or `etcd2` leads. Write again from a live member: `docker exec etcd1 etcdctl --endpoints=127.0.0.1:12379 put /service/leader node-b`.',
			'Stop a second member, leaving only one. Write again with a timeout: `docker exec etcd1 etcdctl --endpoints=127.0.0.1:12379 --command-timeout=5s put /service/leader node-c` (run it on whichever member is still up). Then run `endpoint status -w table` and `endpoint health` against it.',
			'Start one stopped member again with `docker start etcd3` (or the one you stopped), wait a few seconds, and write once more.',
			'When you are done: `docker rm -f etcd1 etcd2 etcd3 etcd-net`.'
		],
		done: [
			'With three members, `endpoint status` shows one member with `IS LEADER` true and the same `RAFT INDEX` on all three.',
			'With one member stopped, the `put` prints `OK`.',
			'With two stopped, the `put` fails after the timeout, with `etcdserver: request timed out` if the last member still thinks it leads, or `context deadline exceeded` once it has stepped down. `endpoint status` shows `etcdserver: no leader`, and `endpoint health` says the member is unhealthy: `failed to commit proposal`.',
			'After `docker start`, the `put` prints `OK` again and `endpoint status` shows a higher `RAFT TERM`.'
		],
		solution: [
			'Three members have a quorum of 2. One failure leaves 2, so writes commit. Two failures leave 1, and the last member steps down: it cannot reach a majority, so it holds every byte and commits nothing.',
			'When a second member returns, a quorum exists again, an election runs at a higher term, and etcd resumes with no operator action.',
			'The members share one network namespace, so they talk over `127.0.0.1` on different ports, with no Docker network to create.'
		]
	},
	recall: {
		q: 'A three-member etcd cluster loses two members. Why do writes stop, and how many failures can five members tolerate?',
		a: 'A write commits only once a quorum, (n/2)+1, has it on disk. With 3 members the quorum is 2, and one member is left. Five members have a quorum of 3 and tolerate 2 failures.'
	},
	sources: [
		{ title: 'etcd-io/raft, raft.go: campaign', url: `${RAFT}/raft.go#L1052-L1072` },
		{ title: 'etcd-io/raft README: persist HardState before sending', url: `${RAFT}/README.md#L119` },
		{ title: 'Raft consensus algorithm (site and paper)', url: 'https://raft.github.io/' },
		{ title: 'etcd-io/raft README', url: 'https://github.com/etcd-io/raft/blob/main/README.md' },
		{ title: 'etcd docs, Frequently Asked Questions', url: 'https://etcd.io/docs/v3.6/faq/' }
	]
};
