const GO = 'https://github.com/golang/go/blob/022c8636110ebac86a9b88724cda168ed713c21f/src/crypto/tls';
const CLIENT = `${GO}/handshake_client.go`;
const RFC = 'https://www.rfc-editor.org/rfc/rfc8446';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'tls-handshake',
	part: 'HTTP and TLS',
	title: 'The TLS 1.3 handshake',
	minutes: 10,
	hook: [
		'A health check calls a site by its IP address: `curl https://<IPv4 of example.org>/`. It fails before any HTTP is sent: `TLS alert, handshake failure (552)`, then `sslv3 alert handshake failure`.',
		'The same check with `curl --resolve example.org:443:<same IPv4> https://example.org/` returns `200`. Same address, same port, same server. **Only the first message of the TLS handshake changed: it now names `example.org`.**',
		'A Go client built with Go 1.27.2 shows the same split. With `ServerName: "example.org"` it gets TLS 1.3 in 23 ms. With the IP address as `ServerName`, it gets `remote error: tls: handshake failure`.'
	],
	terms: [
		{ term: 'ClientHello', def: 'The first TLS message, sent by the client in clear text. It lists the TLS versions, cipher suites and key exchange groups the client supports, plus extensions such as SNI and ALPN.' },
		{ term: 'Key share', def: 'The `key_share` extension: the client\'s public value for one or more key exchange groups, such as X25519. With the server\'s share, both sides compute the same secret without ever sending it.' },
		{ term: 'SNI', def: 'Server Name Indication, the `server_name` extension in the ClientHello. It names the host the client wants, so one IP address can serve many sites, each with its own certificate.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['client["Client, after the TCP handshake"] -->|"ClientHello: SNI example.org, ALPN h2, key_share X25519"| server["example.org:443"]'],
				highlight: ['client'],
				note: 'The client sends one ClientHello in clear text. It names the host in SNI, offers `h2,http/1.1` in ALPN, lists TLS 1.3 in `supported_versions`, and already includes a key share. curl printed this step as `TLSv1.3 (OUT), TLS handshake, Client hello (1)`.'
			},
			{
				add: ['server -->|"ServerHello: key_share X25519, TLS_AES_256_GCM_SHA384"| client'],
				highlight: ['server'],
				note: 'The server picks a version, a cipher suite and one of the offered groups, and answers with its own key share. `openssl s_client` printed `Server Temp Key: X25519, 253 bits` and `TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384`. RFC 8446: "All handshake messages after the ServerHello are now encrypted".'
			},
			{
				add: ['server -->|"encrypted: EncryptedExtensions, Certificate, CertificateVerify, Finished"| client'],
				highlight: ['server'],
				note: 'In the same flight the server sends, encrypted, the chosen ALPN protocol (`ALPN: server accepted h2`), its certificate for `CN=example.org`, a signature over the handshake with the certificate\'s key, and Finished. The client checks that the certificate matches the name it asked for.'
			},
			{
				add: ['client -->|"encrypted: Finished, then GET / HTTP/2"| server'],
				highlight: ['client'],
				note: 'The client sends its Finished and its first request right behind it. TLS took one round trip: ClientHello out, server flight back. If the server had accepted none of the client\'s groups, it would send a HelloRetryRequest first, and the handshake would take a second round trip.'
			},
			{
				add: ['ipclient["Client with an IP literal as host"] -->|"ClientHello without server_name"| server', 'server -->|"alert handshake_failure (40)"| ipclient'],
				highlight: ['ipclient'],
				note: 'RFC 6066 says "Literal IPv4 and IPv6 addresses are not permitted" in SNI. Go leaves the extension out when the host is an IP address, as the code below shows, and curl failed the same way. A server that picks the certificate by name has nothing to choose from. example.org answers with alert 40, `handshake_failure`.'
			}
		]
	},
	example: {
		title: 'src/crypto/tls/handshake_client.go in Go 1.27.2: building the ClientHello',
		repo: 'golang/go',
		url: `${CLIENT}#L71-L1320`,
		lang: 'go',
		code: `	hello := &clientHelloMsg{
		vers:                         maxVersion,
		compressionMethods:           []uint8{compressionNone},
		random:                       make([]byte, 32),
…
		serverName:                   hostnameInSNI(config.ServerName),
		supportedCurves:              config.curvePreferences(maxVersion),
…
		alpnProtocols:                config.NextProtos,
		supportedVersions:            supportedVersions,
	}

	// The version at the beginning of the ClientHello was capped at TLS 1.2
	// for compatibility reasons. The supported_versions extension is used
	// to negotiate versions now. See RFC 8446, Section 4.2.1.
	if hello.vers > VersionTLS12 {
		hello.vers = VersionTLS12
	}
…
		// Since the order is fixed, the first one is always the one to send a
		// key share for. All the PQ hybrids sort first, and produce a fallback
		// ECDH share.
		curveID := hello.supportedCurves[0]
		ke, err := keyExchangeForCurveID(curveID)
…
		keyShareKeys, hello.keyShares, err = ke.keyShares(config.rand())
…
func hostnameInSNI(name string) string {
	host := name
	if len(host) > 0 && host[0] == '[' && host[len(host)-1] == ']' {
		host = host[1 : len(host)-1]
	}
	if i := strings.LastIndex(host, "%"); i > 0 {
		host = host[:i]
	}
	if net.ParseIP(host) != nil {
		return ""
	}
	for len(name) > 0 && name[len(name)-1] == '.' {
		name = name[:len(name)-1]
	}
	return name
}`,
		notes: [
			'Line 6 fills SNI through `hostnameInSNI`. Lines 36 to 38 return an empty string when the name parses as an IP address, so a client dialing `ServerName: "<IPv4>"` sends no `server_name` at all, and the Go run in the opening got `handshake failure`.',
			'Lines 16 to 18 write TLS 1.2 in the old version field even for a TLS 1.3 client. The real list goes in `supportedVersions` on line 10, as RFC 8446 section 4.2.1 requires.',
			'Lines 23 to 26 build the key share for the first group in the fixed order. In Go 1.27.2, [`curvePreferenceOrder`](' + GO + '/defaults.go#L38-L43) puts `X25519MLKEM768` first, which also yields an `X25519` share. The Go run negotiated `group=X25519MLKEM768`.',
			'Line 4 is 32 random bytes, and line 9 carries `config.NextProtos` as the ALPN list. Both travel in clear text in the ClientHello, like the SNI on line 6.'
		]
	},
	tradeoff: {
		gain: [
			'TLS 1.3 sets up keys in one round trip, because the ClientHello already carries a key share.',
			'Everything after the ServerHello is encrypted, including the server certificate and the chosen ALPN protocol.',
			'RFC 8446 removed static RSA and static Diffie-Hellman, so every certificate based key exchange has forward secrecy: a private key that leaks after the handshake does not expose that session\'s keys, once they are erased.'
		],
		cost: [
			'The ClientHello is clear text, so anyone on the path can read the SNI `example.org` and the ALPN list.',
			'If the server accepts none of the offered groups, a HelloRetryRequest adds a second round trip.',
			'A client that connects by IP address sends no SNI, and a server that hosts many names may refuse it with `handshake_failure`.'
		]
	},
	task: {
		prompt: 'Two runs of `openssl s_client` against example.org:443. Run A, with `-servername example.org`, printed `Server Temp Key: X25519, 253 bits`, `Verification: OK` and `New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384`. Run B, with `-noservername`, printed `sslv3 alert handshake failure ... SSL alert number 40` and `New, (NONE), Cipher is (NONE)`. Say what each line tells you. Then: the round trip time to a server is 40 ms. How long after the client sends its TCP SYN can the first byte of the HTTP response arrive, with a full TLS 1.3 handshake? And if the server answers with a HelloRetryRequest?',
		hint: 'Count the trips: TCP needs one before the ClientHello can go. The request leaves together with the client Finished.',
		answer: [
			'Run A: the key exchange used X25519, the certificate chain verified against the trust store, and the session uses TLS 1.3 with the AES 256 GCM suite.',
			'Run B: alert 40 is `handshake_failure`, which RFC 8446 defines as "unable to negotiate an acceptable set of security parameters". No cipher was chosen. Without SNI this server has no certificate to offer.',
			'Timing: SYN out at 0 ms, SYN-ACK back at 40. The ClientHello goes out at 40, and the server flight with Finished arrives at 80. The client sends Finished and the `GET` at 80, and the first response byte arrives at 120 ms at the earliest.',
			'With a HelloRetryRequest the client sends a second ClientHello after 80 ms. The server flight then arrives at 120, the request leaves at 120, and the response arrives at 160 ms at the earliest.'
		]
	},
	quiz: [
		{
			q: 'Why can a TLS 1.3 client send its HTTP request after one round trip of TLS?',
			options: [
				'The server pushes its certificate to the client before the client says hello',
				'The ClientHello carries a key share, so both sides have keys after the ServerHello',
				'TLS 1.3 sends the request in clear text and encrypts only the server\'s response',
				'The client reuses the TCP sequence numbers of the connection as the encryption key'
			],
			answer: 1,
			why: 'The client guesses a group, such as X25519, and sends its public value in `key_share`. The server answers with its own share in the ServerHello, both compute the same secret, and the rest of the server flight is already encrypted.'
		},
		{
			q: '`curl https://<IP address>/` gets `handshake failure`, but the same IP with `--resolve` and the host name works. What differs between the two ClientHellos?',
			options: [
				'The first one offers only TLS 1.2 because the host is numeric',
				'The first one has no `server_name` extension, so the server cannot pick a certificate',
				'The first one has no key share, because IP addresses cannot use X25519',
				'The first one uses a different ALPN list, which the server rejects'
			],
			answer: 1,
			why: 'RFC 6066 forbids IP literals in SNI, so the client omits the extension. A server that serves many names on one IP chooses the certificate from SNI. With no name, Cloudflare answers alert 40, `handshake_failure`.'
		},
		{
			q: 'Which part of a TLS 1.3 handshake can a network observer read?',
			options: [
				'The server certificate, because certificates are public anyway',
				'The ClientHello, including the SNI host name and the ALPN list',
				'The HTTP request path, because it is sent with the Finished message',
				'Nothing, because TLS 1.3 encrypts every message from the first byte'
			],
			answer: 1,
			why: 'RFC 8446 encrypts every handshake message after the ServerHello, so the certificate and EncryptedExtensions are hidden. The ClientHello and ServerHello go in clear text, and the ClientHello carries `server_name` and the ALPN protocols.'
		}
	],
	recall: {
		q: 'What does a TLS 1.3 ClientHello carry that lets the handshake finish in one round trip, and what happens when it has no SNI?',
		a: 'A `key_share`, for example X25519, so both sides derive keys right after the ServerHello. Without `server_name`, a server that hosts many names cannot choose a certificate: example.org answered alert 40, `handshake_failure`.'
	},
	sources: [
		{ title: 'RFC 8446, The Transport Layer Security (TLS) Protocol Version 1.3', url: RFC },
		{ title: 'RFC 6066, TLS Extensions, section 3: Server Name Indication', url: 'https://www.rfc-editor.org/rfc/rfc6066#section-3' },
		{ title: 'Go 1.27.2 source, src/crypto/tls/handshake_client.go', url: CLIENT },
		{ title: 'Go 1.27.2 source, src/crypto/tls/defaults.go', url: `${GO}/defaults.go` },
		{ title: 'OpenSSL docs, openssl-s_client', url: 'https://docs.openssl.org/3.0/man1/openssl-s_client/' }
	]
};
