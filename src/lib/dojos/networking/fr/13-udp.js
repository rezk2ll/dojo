const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2';
const CLIENT = `${GO}/src/net/dnsclient_unix.go`;
const CONFIG = `${GO}/src/net/dnsconfig_unix.go`;
const ISSUE = 'https://github.com/kubernetes/kubernetes/issues/56903';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'udp',
	part: 'Noms et adresses',
	title: 'UDP',
	minutes: 10,
	hook: [
		'Décembre 2017, issue Kubernetes #56903, intitulée "DNS intermittent delays of 5s". Le rapport : "DNS lookup is sometimes taking 5 seconds." Pour reproduire, une boucle lance `curl -w %{time_namelookup}` jusqu’à ce qu’une résolution dépasse une seconde.',
		'D’autres personnes sur le fil voient le même chiffre. L’une capture le trafic : "tcpdump shows that the first AAAA requests get lost somehow". Une requête est partie, et aucune réponse n’est jamais revenue.',
		'Les requêtes DNS passent par UDP, et UDP ne renvoie jamais un datagramme perdu. Seul un minuteur de la bibliothèque de résolution s’en aperçoit, et **le `timeout` par défaut de la glibc est de 5 secondes**.'
	],
	terms: [
		{ term: 'UDP', def: 'User Datagram Protocol (RFC 768) : un en-tête de 8 octets avec port source, port destination, longueur et checksum, puis les données. Le noyau envoie chaque datagramme une seule fois, sans ouvrir de connexion avant, et ne sait jamais s’il est arrivé.' },
		{ term: 'Datagramme', def: 'Un message UDP. Il arrive entier ou pas du tout : le destinataire reçoit le message complet en un seul `recv`, ou rien.' },
		{ term: 'ICMP port unreachable', def: 'La réponse d’un hôte quand un datagramme UDP arrive sur un port où aucun socket n’écoute. Linux la remonte au socket émetteur sous la forme `ECONNREFUSED`.' },
		{ term: 'Bit TC', def: 'Le bit de troncature d’une réponse DNS. Il indique que la réponse ne tenait pas dans le datagramme UDP et que le client doit reposer la question en TCP.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App : getaddrinfo(api.github.com)"] -->|"1 datagramme : requête, port 53"| dns["Serveur DNS"]', 'dns -->|"1 datagramme : réponse"| app'],
				highlight: ['app', 'dns'],
				note: 'Une résolution DNS en UDP, ce sont deux datagrammes : la requête et la réponse. Aucune connexion à ouvrir avant. La RFC 768 cite "the Internet Name Server" parmi les usages principaux du protocole.'
			},
			{
				add: ['app -->|"requête perdue en route"| drop(("perdue"))', 'timer["Minuteur du résolveur : 5 s"] -->|"renvoi"| dns'],
				highlight: ['drop', 'timer'],
				note: 'Quand la requête se perd, aucun code du noyau ne la renvoie. La bibliothèque de résolution attend son timeout, 5 secondes dans la glibc, puis renvoie la requête. La résolution prend 5 secondes plus un aller-retour : le chiffre de l’issue #56903.'
			},
			{
				add: ['app -->|"datagramme vers un port fermé"| host["Hôte sans écouteur"]', 'host -->|"ICMP port unreachable"| app'],
				highlight: ['host'],
				note: 'Pendant cette session, j’ai envoyé 5 octets vers `127.0.0.1:5999`, où rien n’écoutait. `send()` a renvoyé 5, puis `recv()` a levé `ConnectionRefusedError [Errno 111]`. L’erreur vient de la réponse ICMP, arrivée après un envoi déjà réussi.'
			},
			{
				add: ['dns -->|"réponse avec bit TC, 39 octets"| app', 'app -->|"même requête en TCP"| dns'],
				highlight: ['dns'],
				note: 'Une réponse trop grosse pour le datagramme revient tronquée. Pendant cette session, `dig TXT google.com +bufsize=512` a reçu 39 octets avec le flag `tc`, a affiché "Truncated, retrying in TCP mode.", puis a reçu 1187 octets en TCP.'
			}
		]
	},
	example: {
		title: 'src/net/dnsclient_unix.go : le résolveur de Go envoie une requête, UDP d’abord',
		repo: 'golang/go',
		url: `${CLIENT}#L168-L219`,
		lang: 'go',
		code: `// exchange sends a query on the connection and hopes for a response.
func (r *Resolver) exchange(ctx context.Context, server string, q dnsmessage.Question, timeout time.Duration, useTCP, ad bool) (dnsmessage.Parser, dnsmessage.Header, error) {
	q.Class = dnsmessage.ClassINET
	id, udpReq, tcpReq, err := newRequest(q, ad)
	if err != nil {
		return dnsmessage.Parser{}, dnsmessage.Header{}, errCannotMarshalDNSMessage
	}
	var networks []string
	if useTCP {
		networks = []string{"tcp"}
	} else {
		networks = []string{"udp", "tcp"}
	}
	for _, network := range networks {
		ctx, cancel := context.WithDeadline(ctx, time.Now().Add(timeout))
		defer cancel()

		c, err := r.dial(ctx, network, server)
		if err != nil {
			return dnsmessage.Parser{}, dnsmessage.Header{}, err
		}
		if d, ok := ctx.Deadline(); ok && !d.IsZero() {
			c.SetDeadline(d)
		}
		var p dnsmessage.Parser
		var h dnsmessage.Header
		if _, ok := c.(PacketConn); ok {
			p, h, err = dnsPacketRoundTrip(c, id, q, udpReq)
		} else {
			p, h, err = dnsStreamRoundTrip(c, id, q, tcpReq)
		}
		c.Close()
		if err != nil {
			return dnsmessage.Parser{}, dnsmessage.Header{}, mapErr(err)
		}
		if err := p.SkipQuestion(); err != dnsmessage.ErrSectionDone {
			return dnsmessage.Parser{}, dnsmessage.Header{}, errInvalidDNSResponse
		}
		// RFC 5966 indicates that when a client receives a UDP response with
		// the TC flag set, it should take the TC flag as an indication that it
		// should retry over TCP instead.
		// The case when the TC flag is set in a TCP response is not well specified,
		// so this implements the glibc resolver behavior, returning the existing
		// dns response instead of returning a "errNoAnswerFromDNSServer" error.
		// See go.dev/issue/64896
		if h.Truncated && network == "udp" {
			continue
		}
		return p, h, nil
	}
	return dnsmessage.Parser{}, dnsmessage.Header{}, errNoAnswerFromDNSServer
}`,
		notes: [
			'La ligne 12 liste les transports dans l’ordre : `"udp"` d’abord, `"tcp"` seulement si besoin. `useTCP` est vrai quand `resolv.conf` contient `options use-vc` ou `tcp`.',
			'Les lignes 15 et 23 posent une échéance sur le socket. En UDP, c’est le seul moyen pour ce code d’apprendre qu’un datagramme s’est perdu : `c.Read` renvoie une erreur de timeout une fois l’échéance passée.',
			'La ligne 28 appelle `dnsPacketRoundTrip`, qui fait un seul `Write` puis lit jusqu’à recevoir une réponse avec le bon ID et la bonne question. Son commentaire explique qu’il ignore les autres datagrammes "as they may be malicious forgery attempts".',
			'Lignes 46 à 48 : une réponse UDP avec le bit TC est écartée, et la boucle repose la question en TCP, comme `dig` à l’étape 4.',
			'Cette fonction envoie une seule requête. Les nouvelles tentatives sont chez l’appelant, qui boucle `cfg.attempts` fois sur chaque serveur. [dnsconfig_unix.go](' + CONFIG + '#L20-L24) fixe les valeurs par défaut : `timeout: 5 * time.Second` et `attempts: 2`, comme la glibc.'
		]
	},
	tradeoff: {
		gain: [
			'Une résolution DNS tient en un datagramme dans chaque sens. TCP demanderait une poignée de main avant de pouvoir envoyer la requête.',
			'Une application peut construire sa propre fiabilité par-dessus. QUIC le fait, et la RFC 9000 transporte ses paquets dans des datagrammes UDP "to better facilitate deployment in existing systems and networks".'
		],
		cost: [
			'Seul le minuteur de l’application remarque un datagramme perdu. Avec les valeurs par défaut de la glibc ou de Go, une requête DNS perdue ajoute 5 secondes.',
			'RFC 8085 : UDP "does not retransmit any lost packets", et une application "may receive multiple copies of the same UDP datagram". L’application doit elle-même remettre les datagrammes dans l’ordre, écarter les doublons et ralentir en cas de congestion.',
			'Les pare-feux et les NAT ne gardent l’état d’un flux UDP que jusqu’à l’expiration d’un minuteur. RFC 8085 : "Return traffic that arrives after the per-flow state has timed out is dropped".'
		]
	},
	task: {
		prompt: 'Trois sorties de cette session. (a) `dig +tries=2 +time=2 example.com @192.0.2.1` a affiché deux fois `;; communications error to 192.0.2.1#53: timed out`, puis `;; no servers could be reached`. `+time=2` fait attendre dig 2 secondes par essai. (b) Un socket UDP Python connecté à `127.0.0.1:5999` : `send` a renvoyé 5, `recv` a levé `ConnectionRefusedError`. (c) `dig TXT google.com @1.1.1.1 +bufsize=512` a affiché `;; Truncated, retrying in TCP mode.` Dis ce qui s’est passé sur le réseau dans chaque cas. Ensuite : un programme Go utilise un `resolv.conf` avec deux lignes `nameserver` et aucune option, et les deux serveurs jettent tous les paquets. Au bout de combien de temps la résolution échoue-t-elle ?',
		hint: 'Pour (b), demande-toi quel paquet peut rapporter une erreur pour un datagramme déjà envoyé. Pour la dernière partie, lis la boucle de l’appelant : tentatives fois serveurs.',
		answer: [
			'(a) Chaque requête est partie et rien n’est revenu : ni réponse, ni erreur ICMP. La RFC 5737 réserve `192.0.2.0/24` à la documentation, et personne n’y a répondu. dig a attendu son minuteur de 2 secondes à chaque essai.',
			'(b) Le datagramme est arrivé sur localhost, aucun socket n’était lié au port 5999, et le noyau a répondu par un ICMP port unreachable. Linux l’a remis au socket sous la forme `ECONNREFUSED` à l’appel suivant. (c) La réponse ne tenait pas dans 512 octets, elle est revenue avec le bit TC, et dig a reposé la question en TCP.',
			'Go essaie chaque serveur une fois par tentative : 2 tentatives fois 2 serveurs font 4 requêtes, chacune avec une échéance de 5 secondes. La résolution échoue après environ 20 secondes.'
		]
	},
	quiz: [
		{
			q: 'Le réseau perd une requête DNS UDP envoyée par un Pod. Qui la renvoie ?',
			options: [
				'Le code UDP du noyau, après un délai de retransmission',
				'La bibliothèque de résolution de l’app, quand son minuteur expire',
				'Le serveur DNS, qui remarque la requête manquante et la redemande',
				'Personne : la résolution échoue tout de suite avec une erreur'
			],
			answer: 1,
			why: 'UDP n’a pas d’accusés de réception : aucun des deux noyaux ne sait que le datagramme s’est perdu. La glibc et Go attendent leur `timeout`, 5 secondes par défaut, puis renvoient la requête, jusqu’à `attempts` fois.'
		},
		{
			q: 'Sur un socket UDP connecté, tu fais `send()` vers un port où rien n’écoute. `send()` renvoie le nombre d’octets. Que se passe-t-il ensuite ?',
			options: [
				'Rien : UDP ne signale jamais rien sur un datagramme après `send()`',
				'L’appel suivant sur le socket échoue avec `ECONNREFUSED`',
				'Le noyau renvoie le datagramme jusqu’à ce qu’un écouteur apparaisse',
				'Le noyau ouvre une connexion TCP pour signaler l’erreur'
			],
			answer: 1,
			why: 'L’hôte cible répond par un ICMP port unreachable. `send()` a déjà rendu la main, donc Linux garde l’erreur et la renvoie à un appel suivant sur ce socket. udp(7) : "You may get an error for an earlier packet that was sent on the same socket."'
		},
		{
			q: 'Le résolveur de Go reçoit une réponse UDP avec le bit TC. Que fait `exchange` ?',
			options: [
				'Il renvoie la réponse partielle, mieux que rien',
				'Il envoie la même requête en TCP au même serveur',
				'Il réessaie en UDP avec un tampon plus grand',
				'Il passe au nameserver suivant de `resolv.conf`'
			],
			answer: 1,
			why: 'La boucle sur `networks` contient `"udp"` puis `"tcp"`. Quand `h.Truncated && network == "udp"`, elle passe par `continue` : le tour suivant ouvre une connexion TCP vers le même serveur et renvoie la requête.'
		}
	],
	recall: {
		q: 'Pourquoi un seul paquet DNS perdu ajoute-t-il environ 5 secondes à une résolution sous Linux ?',
		a: 'UDP ne renvoie jamais un datagramme perdu. Le résolveur (glibc ou Go) attend son `timeout`, 5 secondes par défaut, puis renvoie la requête.'
	},
	sources: [
		{ title: 'RFC 768, User Datagram Protocol', url: 'https://www.rfc-editor.org/rfc/rfc768' },
		{ title: 'RFC 8085, UDP Usage Guidelines', url: 'https://www.rfc-editor.org/rfc/rfc8085' },
		{ title: 'udp(7), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man7/udp.7.html' },
		{ title: 'Issue Kubernetes #56903, DNS intermittent delays of 5s', url: ISSUE },
		{ title: 'resolv.conf(5), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man5/resolv.conf.5.html' },
		{ title: 'RFC 9000, QUIC: A UDP-Based Multiplexed and Secure Transport', url: 'https://www.rfc-editor.org/rfc/rfc9000' }
	]
};
