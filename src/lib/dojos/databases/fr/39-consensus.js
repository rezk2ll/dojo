const RAFT = 'https://github.com/etcd-io/raft/blob/638f42739b77572b5708eb0d8a776a272ade71ed';
const FAQ = 'https://github.com/etcd-io/website/blob/d8c30b769bc6dc107250492483278ea70af6390e/content/en/docs/v3.6/faq.md';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'consensus',
	part: 'Au-delà d’un serveur',
	title: 'Comment les réplicas se mettent d’accord',
	minutes: 10,
	hook: [
		'Ton cluster Patroni (jour 29) garde sa clé de leader dans un etcd à trois membres. Une machine etcd meurt dans la nuit et **personne ne s’en aperçoit** : les écritures continuent.',
		'Une semaine plus tard, une deuxième machine meurt. Un membre etcd tourne encore, en bonne santé, avec toutes les données, mais **plus aucune écriture n’est validée**.',
		'etcd se met d’accord sur chaque écriture avec Raft. Une écriture ne compte que quand une majorité des membres l’a sur disque, et sur trois membres, il en faut deux. Le seul membre restant n’atteint pas deux, donc etcd ne valide plus rien.'
	],
	terms: [
		{ term: 'Leader, follower, candidat', def: 'Les trois rôles possibles d’un nœud. Seul le leader accepte les écritures, et les followers copient son journal. Un follower qui n’entend plus le leader passe candidat et demande des votes.' },
		{ term: 'Terme', def: 'Un nombre qui augmente à chaque élection. Chaque terme a au plus un leader. Un nœud qui voit un terme plus grand repasse follower.' },
		{ term: 'Quorum', def: 'Une majorité des membres votants : (n/2)+1, avec la division arrondie vers le bas. 2 sur 3, 3 sur 4, 3 sur 5.' },
		{ term: 'Commit', def: 'Une entrée du journal est validée (committed) dès qu’un quorum l’a stockée. Alors seulement elle est appliquée, et elle n’est plus jamais perdue ensuite.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['lead["Leader, terme 4"] -->|"heartbeat"| f1["Follower A"]', 'lead -->|"heartbeat"| f2["Follower B"]'],
				highlight: ['lead'],
				note: 'Le terme 4 a un seul leader, qui envoie des heartbeats à intervalle régulier. Tant qu’ils arrivent, les followers remettent leur minuteur d’élection à zéro et ne font rien d’autre. Les écritures ne vont qu’au leader.'
			},
			{
				add: ['f1 -->|"plus de heartbeat : terme 5, vote pour moi"| f2'],
				highlight: ['f1'],
				note: 'Le follower A attend l’election timeout sans recevoir de heartbeat, puis passe candidat : il ajoute un au terme, vote pour lui-même et demande leur vote aux autres. (Avec le pre-vote activé, il demande d’abord s’il pourrait gagner, sans augmenter son terme.) Dans le raft d’etcd, le délai est tiré au hasard entre l’election timeout et le double, donc deux followers démarrent rarement ensemble.'
			},
			{
				add: ['f2 -->|"vote accordé : ton journal est aussi récent que le mien"| f1'],
				highlight: ['f2'],
				note: 'B ne vote que s’il n’a pas déjà voté pour quelqu’un d’autre dans ce terme, et si la dernière entrée du journal de A est au moins aussi récente que la sienne : un terme plus grand, ou le même terme et un index au moins aussi grand. Un candidat qui a raté des entrées validées ne peut pas gagner.'
			},
			{
				add: ['f1 -->|"ajoute l’entrée 42, terme 5"| log[("Journal sur chaque nœud")]', 'log -->|"stockée sur 2 sur 3"| commit["Validée : appliquée à la machine à états"]'],
				highlight: ['log', 'commit'],
				note: 'Le nouveau leader ajoute chaque écriture à son journal et l’envoie aux followers, qui la persistent et répondent avec leur dernier index. Quand un quorum a l’index 42, l’entrée est validée et chaque nœud l’applique.'
			},
			{
				add: ['lead -.->|"seul dans une minorité : ne peut rien valider"| log'],
				highlight: ['lead'],
				note: 'Si l’ancien leader était seulement coupé du réseau, il peut encore se croire leader du terme 4. Il n’atteint pas de majorité, donc rien de ce qu’il accepte n’est validé. Dès qu’il reçoit un message du terme 5, il repasse follower.'
			}
		]
	},
	example: {
		title: 'raft.go : termes, votes et commits dans la bibliothèque Raft d’etcd',
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
			'La ligne 16 appelle `reset(r.Term + 1)`, qui [efface `Vote` quand le terme change](' + RAFT + '/raft.go#L781-L785), et la ligne 18 vote pour lui-même. `campaign` (dans les sources) envoie une demande de vote à chaque votant avec l’index et le terme de sa dernière entrée.',
			'La ligne 35 n’accorde le vote que si [`isUpToDate`](' + RAFT + '/log.go#L435-L445) renvoie true : le dernier terme du candidat est plus grand, ou égal avec un index au moins aussi grand. Le code est `their.term > our.term || their.term == our.term && their.index >= our.index`.',
			'La ligne 7 obtient l’index de commit par `r.trk.Committed()`, qui finit dans [`CommittedIndex`](' + RAFT + '/quorum/majority.go#L156-L162). Cette fonction trie l’index acquitté de chaque votant et prend celui en position `n - (n/2 + 1)`. Avec cinq votants à 9, 7, 7, 4 et 3, le résultat est 7.',
			'La ligne 7 passe aussi `term: r.Term`, et [`raftLog.maybeCommit`](' + RAFT + '/log.go#L455-L464) ne valide que si l’entrée à cet index porte ce terme (`matchTerm`). Un leader ne valide donc par comptage que les entrées de son propre terme. Toutes les entrées plus anciennes sont validées en même temps.',
			'La bibliothèque ne touche ni au disque ni au réseau. Son [README](' + RAFT + '/README.md#L12) dit « both network and disk IO are left to the user » (le réseau et le disque sont laissés à l’utilisateur), et qu’aucun message ne doit partir « until the latest HardState has been persisted to disk » (avant que le dernier HardState soit sur disque, dans les sources). Un vote ou un acquittement qui n’est pas sur disque pourrait être oublié après un crash.'
		]
	},
	tradeoff: {
		gain: [
			'Deux leaders dans un même terme demanderaient deux majorités, et deux majorités d’un même cluster ont toujours un membre en commun. La [FAQ](' + FAQ + '#L85) dit que le modèle à quorum « totally avoids any possibility of split brain inconsistency ».',
			'Une écriture validée survit à la perte de n’importe quelle minorité : 1 membre sur 3, 2 sur 5.',
			'Après une coupure réseau, etcd repart sans intervention. Sa [FAQ](' + FAQ + '#L51) : il « automatically and safely resumes once the network recovers and restores quorum » (reprend tout seul, sans risque, dès que le quorum revient).'
		],
		cost: [
			'Chaque écriture attend qu’une majorité la persiste, donc la latence est celle du membre le plus lent de la majorité la plus rapide. Entre régions, chaque écriture attend un aller-retour entre régions.',
			'Perdre la majorité arrête toutes les écritures, même si les membres restants ont chaque octet. La FAQ qualifie la perte définitive du quorum de « catastrophic ».',
			'Chaque membre de plus, c’est une machine de plus où chaque écriture est copiée. La [FAQ](' + FAQ + '#L47) conseille de ne pas dépasser sept, parce que « data must be replicated across more machines » (les données doivent être copiées sur plus de machines).',
			'4 membres tolèrent 1 panne, autant que 3. La FAQ : ça [« doesn\'t buy additional fault tolerance »](' + FAQ + '#L67).'
		]
	},
	task: {
		prompt: 'Un cluster etcd à cinq membres. Le leader est au terme 8, et les index acquittés sont : leader 9, B 7, C 7, D 4, E 3. (1) Quel est l’index de commit ? (2) B et C plantent. Le cluster peut-il encore valider ? (3) B et C reviennent, et D lance une élection au terme 9 avec comme dernière entrée (terme 8, index 4). C vote-t-il pour lui ?',
		hint: 'Commit : trie les index et compte une majorité depuis le haut. Votes : compare d’abord le terme de la dernière entrée, puis son index.',
		answer: [
			'(1) Triés : 3, 4, 7, 7, 9. Le quorum est 5/2+1 = 3, donc la position est 5 - 3 = 2, valeur 7. Trois membres (leader, B, C) ont l’index 7. L’entrée 7 est validée si elle a été écrite au terme 8.',
			'(2) Il reste trois membres : le leader, D et E. Trois forment encore un quorum, donc le cluster peut valider, mais seulement quand D et E ont rattrapé les nouvelles entrées. Le leader continue de leur envoyer ce qui leur manque.',
			'(3) Non. La dernière entrée de C est (terme 8, index 7) et celle de D (terme 8, index 4) : même terme, index plus petit, donc D n’est pas à jour et C refuse le vote. (Si C a entendu le leader dans l’election timeout et que check-quorum est activé, il [ignore la demande](' + RAFT + '/raft.go#L1100-L1112) purement et simplement.) D ne peut pas gagner sans le vote d’un membre qui a l’entrée 7.',
			'Vérifie (2) avec le [tableau de tolérance aux pannes](' + FAQ + '#L55-L65) de la FAQ d’etcd : 5 membres ont une majorité de 3 et tolèrent 2 pannes.'
		]
	},
	quiz: [
		{
			q: 'Tu passes un cluster etcd de 3 à 4 membres. Combien de pannes de membres peut-il maintenant supporter ?',
			options: [
				'Une, comme avec 3, parce que le quorum passe de 2 à 3',
				'Deux, parce qu’avec 4 membres il en reste 2 après deux pannes',
				'Trois, parce qu’un seul membre vivant suffit pour continuer',
				'Aucune, parce qu’un nombre pair de membres ne peut pas élire'
			],
			answer: 0,
			why: 'Le quorum de 4 est 4/2+1 = 3. En perdre 2 en laisse 2, sous le quorum. La FAQ d’etcd dit qu’ajouter un membre pour arriver à un nombre pair « doesn\'t buy additional fault tolerance ».'
		},
		{
			q: 'Un follower au terme 6, qui n’a entendu aucun leader pendant tout un election timeout, reçoit une demande de vote pour le terme 7 d’un candidat dont la dernière entrée est (terme 5, index 30). La dernière entrée du follower est (terme 6, index 12). Que se passe-t-il ?',
			options: [
				'Il accorde le vote, parce que le journal du candidat a plus d’entrées',
				'Il passe au terme 7 et refuse, parce que son propre dernier terme est plus grand',
				'Il ignore le message, parce qu’un terme plus grand doit venir d’un leader',
				'Il accorde le vote, parce que le terme 7 du candidat est plus grand que 6'
			],
			answer: 1,
			why: 'Sans leader récent, le terme plus grand de la demande fait passer le follower au terme 7. Le vote dépend ensuite des journaux, et le dernier terme est comparé en premier : 6 est plus récent que 5, donc le candidat n’est pas à jour, quelle que soit la longueur de son journal.'
		},
		{
			q: 'Une coupure réseau isole l’ancien leader, avec deux followers de l’autre côté. Un client envoie une écriture à l’ancien leader. Qu’arrive-t-il à cette écriture ?',
			options: [
				'Elle est validée tout de suite, et l’autre côté la copie après la coupure',
				'Elle est validée sur l’ancien leader, et les deux côtés fusionnent ensuite',
				'Elle n’est jamais validée, parce que l’ancien leader n’a pas de majorité',
				'Elle est transmise au nouveau leader par les followers de l’autre côté'
			],
			answer: 2,
			why: 'Valider demande un quorum de 2, et l’ancien leader n’atteint que lui-même. Les deux followers élisent un nouveau leader à un terme plus grand. Quand l’ancien leader voit ce terme, il redevient follower, et ses entrées non validées sont remplacées par le journal du nouveau leader.'
		}
	],
	recall: {
		q: 'Un cluster etcd à trois membres en perd deux. Pourquoi les écritures s’arrêtent-elles, et combien de pannes cinq membres tolèrent-ils ?',
		a: 'Une écriture n’est validée qu’une fois sur disque chez un quorum, (n/2)+1 membres. Avec 3 membres, le quorum est 2, et il n’en reste qu’un. Cinq membres ont un quorum de 3 et tolèrent 2 pannes.'
	},
	sources: [
		{ title: 'etcd-io/raft, raft.go : campaign', url: `${RAFT}/raft.go#L1052-L1072` },
		{ title: 'README de etcd-io/raft : persister le HardState avant d’envoyer', url: `${RAFT}/README.md#L119` },
		{ title: 'L’algorithme de consensus Raft (site et article)', url: 'https://raft.github.io/' },
		{ title: 'README de etcd-io/raft', url: 'https://github.com/etcd-io/raft/blob/main/README.md' },
		{ title: 'Documentation etcd, Frequently Asked Questions', url: 'https://etcd.io/docs/v3.6/faq/' }
	]
};
