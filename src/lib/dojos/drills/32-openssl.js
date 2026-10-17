/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'openssl',
	part: 'Text and data',
	title: 'openssl for TLS',
	minutes: 10,
	hook: [
		'Monitoring warns that the certificate of `shop.example.org` expires on 5 November 2026. Before you renew it, you check what the current certificate says, whether the server sends it, and whether the key on disk belongs to it. Every rep uses OpenSSL 3.0.',
		'In the current directory: `shop.crt` is the current certificate (subject `O = Shop, CN = shop.example.org`, SANs `shop.example.org` and `www.shop.example.org`), `shop.key` is its private key, and `new.key` is a fresh key for the renewal. A test instance of the site listens on `localhost:8443` and serves `shop.crt` for the name `shop.example.org`.'
	],
	terms: [
		{ term: 'PEM', def: 'The text form of a certificate or key: base64 between lines like `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----`.' },
		{ term: 'SAN', def: 'Subject Alternative Name: a certificate extension that holds a list of names, such as `DNS:www.shop.example.org`.' },
		{ term: 'SNI', def: 'Server Name Indication: the host name the client puts in its ClientHello, the first message of the TLS handshake.' },
		{ term: 'CSR', def: 'Certificate signing request (PKCS#10): a file holding your public key and the subject you ask for, signed with your own private key.' }
	],
	reps: [
		{
			prompt: 'Print `shop.crt` as readable text, without the PEM block.',
			accept: [
				'openssl x509 -in shop.crt -noout -text',
				'openssl x509 -in shop.crt -text -noout',
				'openssl x509 -noout -in shop.crt -text',
				'openssl x509 -noout -text -in shop.crt',
				'openssl x509 -text -in shop.crt -noout',
				'openssl x509 -text -noout -in shop.crt'
			],
			why: '`-in shop.crt` reads the certificate and `-text` prints every field, the SAN extension included. `-noout` stops `x509` from also printing the PEM block at the end.'
		},
		{
			prompt: 'Print only the subject of `shop.crt`.',
			accept: [
				'openssl x509 -in shop.crt -noout -subject',
				'openssl x509 -in shop.crt -subject -noout',
				'openssl x509 -noout -in shop.crt -subject',
				'openssl x509 -noout -subject -in shop.crt',
				'openssl x509 -subject -in shop.crt -noout',
				'openssl x509 -subject -noout -in shop.crt'
			],
			why: '`-subject` prints one line, here `subject=O = Shop, CN = shop.example.org`. `-issuer` prints the signer; `shop.crt` is self-signed, so its issuer is the same name.'
		},
		{
			prompt: 'Print only the expiry date of `shop.crt`.',
			accept: [
				'openssl x509 -in shop.crt -noout -enddate',
				'openssl x509 -in shop.crt -enddate -noout',
				'openssl x509 -noout -in shop.crt -enddate',
				'openssl x509 -noout -enddate -in shop.crt',
				'openssl x509 -enddate -in shop.crt -noout',
				'openssl x509 -enddate -noout -in shop.crt'
			],
			why: '`-enddate` prints the notAfter date, here `notAfter=Nov  5 23:27:17 2026 GMT`. `-startdate` prints notBefore, and `-dates` prints both.'
		},
		{
			prompt: 'Print only the Subject Alternative Name extension of `shop.crt`.',
			accept: [
				'openssl x509 -in shop.crt -noout -ext subjectAltName',
				'openssl x509 -in shop.crt -ext subjectAltName -noout',
				'openssl x509 -noout -in shop.crt -ext subjectAltName',
				'openssl x509 -noout -ext subjectAltName -in shop.crt',
				'openssl x509 -ext subjectAltName -in shop.crt -noout',
				'openssl x509 -ext subjectAltName -noout -in shop.crt'
			],
			why: '`-ext subjectAltName` prints only that extension: `DNS:shop.example.org, DNS:www.shop.example.org`. `-ext` also takes a comma-separated list of extension names.'
		},
		{
			prompt: 'In a cron job, check whether `shop.crt` expires within the next 30 days (2592000 seconds). The exit code is the answer.',
			accept: [
				'openssl x509 -in shop.crt -noout -checkend 2592000',
				'openssl x509 -in shop.crt -checkend 2592000 -noout',
				'openssl x509 -noout -in shop.crt -checkend 2592000',
				'openssl x509 -noout -checkend 2592000 -in shop.crt',
				'openssl x509 -checkend 2592000 -in shop.crt -noout',
				'openssl x509 -checkend 2592000 -noout -in shop.crt'
			],
			why: '`-checkend 2592000` exits nonzero if the certificate expires within that many seconds (30 × 86400). For `shop.crt` it prints `Certificate will expire` and exits with 1.'
		},
		{
			prompt: 'First half of the key check: print the public key inside `shop.crt`, in PEM.',
			accept: [
				'openssl x509 -in shop.crt -noout -pubkey',
				'openssl x509 -in shop.crt -pubkey -noout',
				'openssl x509 -noout -in shop.crt -pubkey',
				'openssl x509 -noout -pubkey -in shop.crt',
				'openssl x509 -pubkey -in shop.crt -noout',
				'openssl x509 -pubkey -noout -in shop.crt'
			],
			why: '`-pubkey` prints the certificate’s public key as a `-----BEGIN PUBLIC KEY-----` block. This block is what the next rep compares with `shop.key`.'
		},
		{
			prompt: 'Second half: print the public key that belongs to the private key `shop.key`, in PEM.',
			accept: ['openssl pkey -in shop.key -pubout', 'openssl pkey -pubout -in shop.key'],
			why: '`pkey -in shop.key` reads the private key and `-pubout` prints only its public part. If this output is identical to the `-pubkey` output of `shop.crt`, the key and the certificate belong together; `new.key` gives a different block.'
		},
		{
			prompt: 'Open a TLS connection to `localhost:8443`, send the SNI name `shop.example.org`, and close it as soon as the handshake is done.',
			accept: [
				'openssl s_client -connect localhost:8443 -servername shop.example.org </dev/null',
				'openssl s_client -connect localhost:8443 -servername shop.example.org < /dev/null',
				'openssl s_client -servername shop.example.org -connect localhost:8443 </dev/null',
				'openssl s_client -servername shop.example.org -connect localhost:8443 < /dev/null'
			],
			why: '`-connect localhost:8443` picks the host and port and `-servername` sets the SNI name. `s_client` reads what to send from stdin, and `</dev/null` gives it end of file at once, so it closes the connection after printing the certificate chain.'
		},
		{
			prompt: 'Print the expiry date of the certificate that `localhost:8443` sends for `shop.example.org`, by piping `s_client` into `x509`.',
			accept: [
				'openssl s_client -connect localhost:8443 -servername shop.example.org </dev/null | openssl x509 -noout -enddate',
				'openssl s_client -connect localhost:8443 -servername shop.example.org </dev/null | openssl x509 -enddate -noout',
				'openssl s_client -connect localhost:8443 -servername shop.example.org < /dev/null | openssl x509 -noout -enddate',
				'openssl s_client -connect localhost:8443 -servername shop.example.org < /dev/null | openssl x509 -enddate -noout',
				'openssl s_client -servername shop.example.org -connect localhost:8443 </dev/null | openssl x509 -noout -enddate',
				'openssl s_client -servername shop.example.org -connect localhost:8443 </dev/null | openssl x509 -enddate -noout',
				'openssl s_client -servername shop.example.org -connect localhost:8443 < /dev/null | openssl x509 -noout -enddate',
				'openssl s_client -servername shop.example.org -connect localhost:8443 < /dev/null | openssl x509 -enddate -noout'
			],
			why: '`s_client` prints the server certificate in PEM among its other output. `x509` with no `-in` reads stdin, finds that PEM block and prints `notAfter=Nov  5 23:27:17 2026 GMT`, the same date as `shop.crt`.'
		},
		{
			prompt: 'Create the renewal request `shop.csr` from `new.key`, with the subject `/CN=shop.example.org` given on the command line so nothing is prompted.',
			accept: [
				"openssl req -new -key new.key -out shop.csr -subj '/CN=shop.example.org'",
				"openssl req -new -key new.key -subj '/CN=shop.example.org' -out shop.csr",
				"openssl req -new -out shop.csr -key new.key -subj '/CN=shop.example.org'",
				"openssl req -new -out shop.csr -subj '/CN=shop.example.org' -key new.key",
				"openssl req -new -subj '/CN=shop.example.org' -key new.key -out shop.csr",
				"openssl req -new -subj '/CN=shop.example.org' -out shop.csr -key new.key",
				'openssl req -new -key new.key -out shop.csr -subj "/CN=shop.example.org"',
				'openssl req -new -key new.key -out shop.csr -subj /CN=shop.example.org'
			],
			why: '`-new` creates a request, `-key new.key` puts that key’s public half in it and signs it, and `-out shop.csr` names the file. Without `-subj`, `req` asks for each subject field on the terminal.'
		},
		{
			prompt: 'Print `shop.csr` as readable text, without the PEM block, to check its subject before you send it.',
			accept: [
				'openssl req -in shop.csr -noout -text',
				'openssl req -in shop.csr -text -noout',
				'openssl req -noout -in shop.csr -text',
				'openssl req -noout -text -in shop.csr',
				'openssl req -text -in shop.csr -noout',
				'openssl req -text -noout -in shop.csr'
			],
			why: '`req -in shop.csr -text` prints the request, starting with `Certificate Request:` and `Subject: CN = shop.example.org`. `-noout` drops the PEM block; adding `-verify` also checks the self-signature.'
		}
	],
	quiz: [],
	recall: {
		q: 'Which command prints the expiry date of `shop.crt`, and what does its output start with?',
		a: '`openssl x509 -in shop.crt -noout -enddate`. It prints one line starting with `notAfter=`, here `notAfter=Nov  5 23:27:17 2026 GMT`.'
	},
	sources: [
		{ title: 'openssl-x509 (OpenSSL 3.0)', url: 'https://docs.openssl.org/3.0/man1/openssl-x509/' },
		{ title: 'openssl-s_client (OpenSSL 3.0)', url: 'https://docs.openssl.org/3.0/man1/openssl-s_client/' },
		{ title: 'openssl-req (OpenSSL 3.0)', url: 'https://docs.openssl.org/3.0/man1/openssl-req/' },
		{ title: 'openssl-pkey (OpenSSL 3.0)', url: 'https://docs.openssl.org/3.0/man1/openssl-pkey/' }
	]
}
