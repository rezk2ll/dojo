const COSIGN = 'https://github.com/sigstore/cosign/blob/cfeaa4a435c9d42cf724b3e1aac20c1cc09c4be7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'signing',
	part: 'Secrets and supply chain',
	title: 'Signing what you ship',
	minutes: 10,
	hook: [
		'On 1 April 2021, a Codecov customer downloaded the Bash Uploader script from `https://codecov.io/bash` and computed its SHA-256. The value did not match the checksum Codecov published on GitHub. The customer reported it the same morning.',
		'Codecov found that someone had been changing the script since 31 January 2021. The attacker had extracted a credential through "an error in Codecov’s Docker image creation process". The changed line sent the output of `env` from each customer’s CI job, with its tokens and keys, to a server outside Codecov.',
		'The customer caught it because the checksum lived on GitHub and the script lived on `codecov.io`. The attacker could change only one of the two. A **signature** goes further: it ties the file to the identity that signed it, and a changed file fails the check.',
		'Here you sign a container image with cosign without keeping a private key, and verify it before you run it.'
	],
	terms: [
		{ term: 'Keyless signing', def: 'cosign creates a key pair, signs once, and throws the private key away. A short-lived certificate records who held the key.' },
		{ term: 'Fulcio', def: 'The Sigstore certificate authority. It checks an OpenID Connect token and issues an X.509 certificate valid for 10 minutes, with the identity from the token in it.' },
		{ term: 'Rekor', def: 'The Sigstore transparency log: an append-only public log of each signature, its certificate and the digest of the signed file.' },
		{ term: 'Signer identity', def: 'The pair that `cosign verify` checks in the certificate: the subject (an email or a workflow URL) and the OIDC issuer that vouched for it.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['atk["Attacker with a stolen upload credential"] -->|"replaces the file"| srv["Download server or registry: codecov.io/bash, ghcr.io"]', 'srv --> ci["Customer CI: curl the script, run it"]'],
				highlight: ['atk', 'srv'],
				note: 'The attack path. The attacker changes the file where people download it. Every CI job that runs `curl` and then `bash` executes the new version with its secrets in the environment.'
			},
			{
				add: ['rel["Release workflow in GitHub Actions"] -->|"OIDC token"| ful["Fulcio: certificate valid 10 min, subject = workflow URL"]'],
				highlight: ['rel', 'ful'],
				note: 'The defence starts at release. The workflow runs `cosign sign` with `id-token: write`. cosign sends a new public key and the workflow’s OIDC token to Fulcio, which returns a certificate naming that workflow.'
			},
			{
				add: ['ful --> sig["Signature over the image digest, private key discarded"]', 'sig --> rek[("Rekor: signature, certificate, digest")]'],
				highlight: ['sig', 'rek'],
				note: 'cosign signs the image digest, attaches the signature to the image in the registry, and records it in Rekor. The private key is gone after this one signature, so there is no key file for an attacker to steal.'
			},
			{
				add: ['srv -.->|"pull"| ver["cosign verify --certificate-identity ... --certificate-oidc-issuer ..."]', 'rek -.-> ver'],
				highlight: ['ver'],
				note: 'Before running the image, the consumer runs `cosign verify` with the expected identity and issuer. cosign checks the signature against the digest, the certificate chain against the Sigstore root, the identity, and the Rekor entry.'
			},
			{
				add: ['ver -->|"digest or identity mismatch"| stop["Verification error: do not deploy"]'],
				highlight: ['stop'],
				note: 'A replaced image has a new digest, so the old signature does not match it. If the attacker signs it with their own account, the certificate names the wrong identity and the identity check fails.'
			}
		]
	},
	example: {
		title: 'pkg/cosign/verify.go: CheckCertificatePolicy, matching the signer identity',
		repo: 'sigstore/cosign',
		url: `${COSIGN}/pkg/cosign/verify.go#L467-L532`,
		lang: 'go',
		code: `func CheckCertificatePolicy(cert *x509.Certificate, co *CheckOpts) error {
	ce := CertExtensions{Cert: cert}

	if err := validateCertExtensions(ce, co); err != nil {
		return err
	}
	oidcIssuer := ce.GetIssuer()
	sans := cryptoutils.GetSubjectAlternateNames(cert)
…
			// Then the subject
			subjectMatches := false
			switch {
			case identity.SubjectRegExp != "":
				regex, err := regexp.Compile(identity.SubjectRegExp)
				if err != nil {
					return fmt.Errorf("malformed subject in identity: %s : %w", identity.SubjectRegExp, err)
				}
				for _, san := range sans {
					if regex.MatchString(san) {
						subjectMatches = true
						break
					}
				}
			case identity.Subject != "":
				for _, san := range sans {
					if san == identity.Subject {
						subjectMatches = true
						break
					}
				}
			default:
				// No subject constraint on this identity, so checks out
				subjectMatches = true
			}
			if subjectMatches && issuerMatches {
				// If both issuer / subject match, return verified
				return nil
			}
		}
		return &VerificationFailure{
			fmt.Errorf("none of the expected identities matched what was in the certificate, got subjects [%s] with issuer %s", strings.Join(sans, ", "), oidcIssuer),
		}
	}
	return nil
}`,
		notes: [
			'Line 473 reads the OIDC issuer from the certificate extension `1.3.6.1.4.1.57264.1.1`. Line 474 reads the subject alternative name, which Fulcio fills with an email or a URI.',
			'Lines 511 to 517 handle `--certificate-identity`: a SAN must equal the string exactly. `https://github.com/acme/api/.github/workflows/release.yml@refs/heads/main` matches only that workflow on that branch.',
			'Lines 500 to 510 handle `--certificate-identity-regexp` with Go’s `MatchString`. Its doc: "MatchString reports whether the string s contains any match". An unanchored pattern matches anywhere in the SAN.',
			'Line 522 passes only when the subject and the issuer both match. The flag help in `options/certificate.go` says one identity flag and one issuer flag "must be set for keyless flows".'
		]
	},
	tradeoff: {
		gain: [
			'There is no key file to leak or rotate. The Sigstore docs: "the private key is discarded after a single signing".',
			'A project can watch Rekor for its own identity and spot a signature it did not make.',
			'The Kubernetes project signs its release images this way, and anyone can verify them with one `cosign verify` command.'
		],
		cost: [
			'The consumer must know the signer identity in advance. The Sigstore docs ask maintainers to publish it somewhere only trusted people can edit.',
			'If someone pushes code to the branch your release workflow builds, the workflow signs that code with the expected identity.',
			'Anyone can read the email or workflow URL in each certificate, because the Rekor log is public.'
		]
	},
	task: {
		prompt: 'Your deploy script runs this before every rollout: `cosign verify ghcr.io/acme/api@sha256:4f1c... --certificate-identity-regexp \'github.com/acme\' --certificate-oidc-issuer https://token.actions.githubusercontent.com`. The image is built by `.github/workflows/release.yml` in `acme/api`, on tags. Find the hole and write the fixed command.',
		hint: 'GitHub Actions certificates carry a SAN like `https://github.com/OWNER/REPO/.github/workflows/FILE@REF`. Which SANs contain the text `github.com/acme`?',
		answer: [
			'`MatchString` passes when the SAN contains the pattern anywhere. `https://github.com/acme-tools/x/.github/workflows/a.yml@refs/heads/main` contains `github.com/acme`.',
			'Say an attacker gets push access to `ghcr.io/acme/api`. They create a GitHub org named `acme-tools` and sign their image from a workflow there. The issuer is the real GitHub issuer, so that check passes too.',
			'Any workflow in any `acme` repo also passes, for example a CI test workflow in another repo that never builds releases.',
			'Fixed: `--certificate-identity-regexp \'^https://github\\.com/acme/api/\\.github/workflows/release\\.yml@refs/tags/v[0-9.]+$\'`. The `^` and `$` anchor the whole SAN, and the escaped dots match only dots.'
		]
	},
	quiz: [
		{
			q: 'The Fulcio certificate on an image signature was valid for 10 minutes in March. Why does `cosign verify` still accept it in October?',
			options: [
				'cosign ignores the certificate expiry date for every container image signature',
				'The Rekor entry shows the signature was made while the certificate was valid',
				'Fulcio renews the certificate every 10 minutes for as long as the image exists',
				'The registry re-signs the image with its own key each time someone pulls it'
			],
			answer: 1,
			why: 'Rekor recorded the signature and its certificate when they were made, and cosign checks the proof of inclusion. The Sigstore docs: with this log, someone "can confirm that the certificate was valid at the time of signing".'
		},
		{
			q: 'An attacker replaces your image in the registry and signs it with cosign using their own GitHub account. Your deploy runs `cosign verify` with your exact identity and issuer. What happens?',
			options: [
				'It passes, because the new image has a valid Fulcio signature in Rekor',
				'It passes, because the registry keeps both signatures and cosign uses the newest',
				'It fails, because Rekor refuses to log a second signature for the same tag',
				'It fails, because no certificate on the new digest has your identity as its SAN'
			],
			answer: 3,
			why: 'The attacker’s signature is valid, but `CheckCertificatePolicy` compares the SAN with your `--certificate-identity` string. Their certificate names their account, so cosign returns "none of the expected identities matched".'
		},
		{
			q: 'Why does a keyless signer have no private key to rotate after a leak?',
			options: [
				'cosign keeps the key in Fulcio, which rotates it every night',
				'The key is stored encrypted in Rekor next to the signature',
				'cosign creates a key for one signing and then discards it',
				'The OIDC provider holds the key and signs on the user’s behalf'
			],
			answer: 2,
			why: 'cosign generates the key pair locally, Fulcio binds the public key to the identity for 10 minutes, and the private key is thrown away after one signature. To sign as you, an attacker needs an OIDC token for your identity.'
		}
	],
	recall: {
		q: 'Which two flags must `cosign verify` get for a keyless signature, and what values does Kubernetes give for its release images?',
		a: '`--certificate-identity krel-trust@k8s-releng-prod.iam.gserviceaccount.com` and `--certificate-oidc-issuer https://accounts.google.com`.'
	},
	sources: [
		{ title: 'Codecov, Bash Uploader Security Update (April 2021)', url: 'https://about.codecov.io/security-update/' },
		{ title: 'Sigstore docs, Overview', url: 'https://docs.sigstore.dev/about/overview/' },
		{ title: 'Sigstore docs, Fulcio', url: 'https://docs.sigstore.dev/certificate_authority/overview/' },
		{ title: 'Sigstore docs, Verifying Signatures', url: 'https://docs.sigstore.dev/cosign/verifying/verify/' },
		{ title: 'Sigstore docs, OIDC Verification Cheat Sheet', url: 'https://docs.sigstore.dev/quickstart/verification-cheat-sheet/' },
		{ title: 'Sigstore docs, The Importance of Verification', url: 'https://docs.sigstore.dev/about/the-importance-of-verification/' },
		{ title: 'Kubernetes docs, Verify Signed Kubernetes Artifacts', url: 'https://kubernetes.io/docs/tasks/administer-cluster/verify-signed-artifacts/' },
		{ title: 'Go docs, regexp.Regexp.MatchString', url: 'https://pkg.go.dev/regexp#Regexp.MatchString' }
	]
};
