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
