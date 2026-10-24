const K8S_ISSUE = 'https://github.com/kubernetes/kubernetes/issues/95622';
const SOPS = 'https://github.com/getsops/sops/blob/e39ca97b6209f9132ea40d22beb37d796060cb32';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'secret-managers',
	part: 'Secrets and supply chain',
	title: 'Where secrets live',
	minutes: 10,
	hook: [
		'On 15 October 2020, Kubernetes published [CVE-2020-8564](' + K8S_ISSUE + '). The advisory: "In Kubernetes clusters using a logging level of at least 4, processing a malformed docker config file will result in the contents of the docker config file being leaked, which can include pull secrets or other registry credentials."',
		'The registry password sat in a Kubernetes Secret, and one log line copied it out. Versions 1.17.0 to 1.19.2 were affected, with fixes in 1.17.13, 1.18.10 and 1.19.3. The advised mitigation: "Do not enable verbose logging in production, limit access to logs."',
		'A running app needs its database password somewhere: in an environment variable, in a file, or fetched from a secret manager. Each place has its own readers.'
	],
	terms: [
		{ term: 'Kubernetes Secret', def: 'An API object that holds a few named values, up to 1 MiB, which Pods read as environment variables or as files. Its `data` values are base64 text.' },
		{ term: 'Base64', def: 'A way to write any bytes with 64 printable characters. Anyone can reverse it with `base64 -d`, and no key is involved.' },
		{ term: 'Encryption at rest', def: 'The API server encrypts each Secret before it writes it to etcd, with a key etcd never sees. Kubernetes turns it on only when you give `kube-apiserver` an `EncryptionConfiguration` file.' },
		{ term: 'Secret manager', def: 'A service (HashiCorp Vault, AWS Secrets Manager, Google Secret Manager) that stores secrets, hands them to authorized callers and can log each read.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['yaml["db-secret.yaml in git: password: aHVudGVyMi1wcm9kLWRi"] -->|"base64 -d"| plain["hunter2-prod-db"]'],
				highlight: ['yaml', 'plain'],
				note: 'A Secret manifest holds `data` values in base64. Anyone who clones the repo runs `base64 -d` and reads `hunter2-prod-db`. The Kubernetes docs: "Base64 encoding is _not_ an encryption method, it provides no additional confidentiality over plain text."'
			},
			{
				add: ['yaml -->|"kubectl apply"| api["kube-apiserver"]', 'api -->|"no EncryptionConfiguration"| etcd[("etcd: the Secret stored as is")]'],
				highlight: ['api', 'etcd'],
				note: 'The docs warn that Secrets are "by default, stored unencrypted in the API server\'s underlying data store (etcd)". Without `--encryption-provider-config`, the API server writes the value as plain text. A copy of an etcd backup is then a copy of every password in the cluster.'
			},
			{
				add: ['api -->|"env: secretKeyRef"| pod["Pod: DB_PASSWORD in the environment"]', 'pod --> leak["Read by /proc/1/environ, child processes, crash dumps, logs"]'],
				highlight: ['pod', 'leak'],
				note: 'As an environment variable, the password is in `/proc/<pid>/environ` and in every child process. The OWASP cheat sheet: environment variables "are generally accessible to all processes and may be included in logs or system dumps". A file mounted from a Secret lands in a `tmpfs`, so it never reaches the node\'s disk.'
			},
			{
				add: ['sops["sops: password: ENC[AES256_GCM,...]"] -->|"git push"| yaml', 'enc["EncryptionConfiguration: aescbc or kms first"] --> etcd'],
				highlight: ['sops', 'enc'],
				note: 'Two fixes for the first two leaks. sops encrypts each value in the file before it reaches git, and leaves the keys readable. An `EncryptionConfiguration` with `aescbc` or `kms` as the first provider makes etcd store `k8s:enc:aescbc:v1:key1:` followed by ciphertext.'
			},
			{
				add: ['vault["Secret manager: per-app policy, audit log, expiry"] -->|"short-lived credential"| pod'],
				highlight: ['vault'],
				note: 'A secret manager hands each app only the secrets its policy allows and records each request. OWASP lists what to audit, starting with "Who requested a secret and for what system and role." Credentials that expire after a set time limit how long a leaked copy works.'
			}
		]
	},
	example: {
		title: 'aes/cipher.go: how sops encrypts one value',
		repo: 'getsops/sops',
		url: `${SOPS}/aes/cipher.go#L141-L202`,
		lang: 'go',
		code: `func (c Cipher) Encrypt(plaintext interface{}, key []byte, additionalData string) (ciphertext string, err error) {
	if isEmpty(plaintext) {
		return "", nil
	}
	aescipher, err := cryptoaes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("Could not initialize AES GCM encryption cipher: %s", err)
	}
	var iv []byte
	if stash, ok := c.stash[stashKey{plaintext: plaintext, additionalData: additionalData}]; !ok {
		iv = make([]byte, nonceSize)
		_, err = rand.Read(iv)
		if err != nil {
			return "", fmt.Errorf("Could not generate random bytes for IV: %s", err)
		}
	} else {
		iv = stash
	}
	gcm, err := cipher.NewGCMWithNonceSize(aescipher, nonceSize)
	if err != nil {
		return "", fmt.Errorf("Could not create GCM: %s", err)
	}
…
	out := gcm.Seal(nil, iv, plainBytes, []byte(additionalData))
	return fmt.Sprintf("ENC[AES256_GCM,data:%s,iv:%s,tag:%s,type:%s]",
		base64.StdEncoding.EncodeToString(out[:len(out)-cryptoaes.BlockSize]),
		base64.StdEncoding.EncodeToString(iv),
		base64.StdEncoding.EncodeToString(out[len(out)-cryptoaes.BlockSize:]),
		encryptedType), nil
}`,
		notes: [
			'The lines with `make([]byte, nonceSize)` and `rand.Read(iv)` draw a fresh random IV of 32 bytes (`nonceSize` is 32 in this file) for each value. The `else` branch reuses the IV stashed at decryption, so an unchanged value keeps the same ciphertext and `git diff` shows only the values you edited.',
			'`additionalData` is the path to the value. [`Tree.Encrypt`](' + SOPS + '/sops.go#L557-L558) builds it as the keys joined with `:`, for example `app2:db:password:`. GCM checks it at decryption, so a ciphertext copied under another key fails with "Could not decrypt with AES_GCM".',
			'The `fmt.Sprintf` line writes the `ENC[AES256_GCM,data:...,iv:...,tag:...,type:str]` string you see in the file. The sops docs: "keys are stored in cleartext, and values are encrypted", which keeps diffs and merges readable.',
			'`key` is a data key, the same for the whole file. sops encrypts it with each master key (age, PGP or a cloud KMS) and stores the results in the `sops:` block. The docs: "As long as one of the KMS or PGP method is still usable, you will be able to access your data."'
		]
	},
	tradeoff: {
		gain: [
			'With sops, the repo holds only ciphertext for each value, and a pull request still shows which key changed.',
			'With `aescbc` or `kms` first in the `EncryptionConfiguration`, a stolen etcd backup holds ciphertext, and the key stays on the control plane or in the KMS.',
			'A secret manager logs who read which secret and can issue credentials that expire, so a leaked copy stops working on its own.'
		],
		cost: [
			'Encryption at rest does nothing against API access: `kubectl get secret db -o yaml` still returns the base64 value to anyone allowed to read it.',
			'Existing Secrets stay as plain text in etcd until they are written again. The docs give `kubectl get secrets --all-namespaces -o json | kubectl replace -f -` for that.',
			'Whoever holds the sops master key (an age key in `~/.config/sops/age/keys.txt`, or KMS decrypt rights) can decrypt every past version in git history.',
			'A secret manager is one more service on the startup path. OWASP notes that a slow one can "increase application startup times".'
		]
	},
	task: {
		prompt: 'A teammate opens a pull request with three files. `db-secret.yaml`: `kind: Secret`, `data: { password: aHVudGVyMi1wcm9kLWRi }`. `deploy.yaml`: the app container reads it with `env: [{ name: DB_PASSWORD, valueFrom: { secretKeyRef: { name: db, key: password } } }]`. `role.yaml`: the app\'s ServiceAccount gets `verbs: ["get", "list", "watch"]` on `secrets`. Find what leaks, and to whom. 10 minutes, on paper.',
		hint: 'Run `echo aHVudGVyMi1wcm9kLWRi | base64 -d`. Then read the Kubernetes docs line on what `list` gives on Secrets.',
		answer: [
			'`db-secret.yaml` puts the password in git: `base64 -d` prints `hunter2-prod-db`. Anyone with read access to the repo, today or in any later clone, has it. Fix: commit the file encrypted with `sops encrypt`, and rotate this password since it is already in the branch history.',
			'`role.yaml`: the docs say "granting list or watch permissions on Secrets allows a subject to read all Secret data in that namespace". The kubelet mounts the Secret for the Pod, so the app\'s ServiceAccount needs no verb on `secrets` unless the code calls the API itself.',
			'`deploy.yaml`: as an environment variable, the password is in `/proc/<pid>/environ` and passed to every child process. Mount it as a file instead: `volumes: [{ name: db, secret: { secretName: db } }]`, and the app reads `/etc/db/password` from a `tmpfs`.',
			'Not in the pull request but worth asking: does the cluster\'s `kube-apiserver` run with `--encryption-provider-config`? Without it, the value sits as plain text in etcd and in every etcd backup.'
		],
		steps: [
			{
				title: 'Decode the manifest',
				questions: [
					{ q: 'What does `echo aHVudGVyMi1wcm9kLWRi | base64 -d` print?', options: ['Random bytes, since the value is encrypted', 'An error without the cluster key', '`hunter2-prod-db`', 'A SHA-256 hash of the password'], answer: 2, why: 'Base64 has no key. Anyone can reverse it with `base64 -d`.' },
					{ q: 'Who can read the password from `db-secret.yaml`?', options: ['Anyone with read access to the repo, now or in a later clone', 'Only cluster admins', 'Only the app’s ServiceAccount', 'Nobody until it is applied'], answer: 0, why: 'The value is in git, so every clone of the branch carries it.' },
					{ q: 'What do you commit instead?', options: ['The same file, base64 encoded twice', 'The file encrypted with `sops encrypt`', 'The plain password in a ConfigMap', 'A `.gitignore` entry and nothing else'], answer: 1, why: 'sops encrypts each value before it reaches git and leaves the keys readable.' },
					{ q: 'The PR branch already holds the plain value. What else do you do?', options: ['Squash the PR before merging', 'Close the PR and open a new one', 'Nothing, sops covers it', 'Rotate the password'], answer: 3, why: 'The value is already in the branch history, so encrypting the next version does not hide the old one.' }
				]
			},
			{
				title: 'Read the role',
				questions: [
					{ q: 'What does `list` on `secrets` give the ServiceAccount?', options: ['Only the names of the Secrets', 'All Secret data in the namespace', 'Only the Secrets it created', 'Nothing without `get`'], answer: 1, why: 'The docs: "granting list or watch permissions on Secrets allows a subject to read all Secret data in that namespace".' },
					{ q: 'How does the Pod get the Secret to begin with?', options: ['The kubelet fetches it for the Pod', 'The app calls the API with its ServiceAccount', 'The image has it baked in', 'etcd sends it to the container'], answer: 0, why: 'The kubelet mounts the Secret or sets the variable. The app does not call the API for that.' },
					{ q: 'So which verbs does the app’s ServiceAccount need on `secrets`?', options: ['`get` only', '`list` only', '`get` and `watch`', 'None, unless the code calls the API itself'], answer: 3, why: 'With the kubelet doing the work, any verb here is extra access.' },
					{ q: 'If the app is compromised, what does the current role add?', options: ['Nothing, the app already has its own Secret', 'The attacker can delete Secrets', 'The attacker reads every Secret in the namespace', 'The attacker can read etcd backups'], answer: 2, why: '`get`, `list` and `watch` let anyone holding the app’s token read all the Secrets, not just `db`.' }
				]
			},
			{
				title: 'Read the deployment',
				questions: [
					{ q: 'With `env` and `secretKeyRef`, where does the password end up?', options: ['In `/proc/<pid>/environ` and every child process', 'Only in the kubelet’s memory', 'In a `tmpfs` file', 'Nowhere after startup'], answer: 0, why: 'A child process inherits its parent’s environment, and `/proc/<pid>/environ` keeps it.' },
					{ q: 'What does OWASP say about environment variables?', options: ['They are encrypted by the kernel', 'They "may be included in logs or system dumps"', 'They are safe inside containers', 'They expire after startup'], answer: 1, why: 'The cheat sheet: they "are generally accessible to all processes and may be included in logs or system dumps".' },
					{ q: 'What do you use instead?', options: ['A ConfigMap', 'A command line flag', 'A file mounted from the Secret volume', 'A label on the Pod'], answer: 2, why: '`volumes: [{ name: db, secret: { secretName: db } }]`, and the app reads `/etc/db/password`.' },
					{ q: 'Why is the mounted file better?', options: ['It is encrypted with the cluster key', 'It is read only once', 'It cannot be read by the app', 'It sits in a `tmpfs` and is not passed to child processes'], answer: 3, why: 'A file mounted from a Secret never reaches the node’s disk, and children do not inherit it.' }
				]
			},
			{
				title: 'Ask about etcd',
				questions: [
					{ q: 'Which `kube-apiserver` flag do you ask about?', options: ['`--encryption-provider-config`', '`--v=4`', '`--audit-log-path`', '`--secure-port`'], answer: 0, why: 'Without it, the API server writes Secrets to etcd as they are.' },
					{ q: 'Without it, what is in an etcd backup?', options: ['Only Secret names', 'Ciphertext under the cluster CA', 'Every Secret value as plain text, at most a base64 decode away', 'Nothing, Secrets stay in memory'], answer: 2, why: 'The docs: Secrets are "by default, stored unencrypted in the API server\'s underlying data store (etcd)".' },
					{ q: 'Which first provider in the `EncryptionConfiguration` leaves values unencrypted?', options: ['`aescbc`', '`identity`', '`kms`', '`secretbox`'], answer: 1, why: '`identity` writes resources as they are. The first provider is the one used for writes.' },
					{ q: 'Does encryption at rest stop `kubectl get secret db -o yaml`?', options: ['Yes, it returns ciphertext', 'Yes, it needs the KMS key', 'Only for `immutable` Secrets', 'No: anyone allowed to read it still gets the base64 value'], answer: 3, why: 'Encryption at rest protects etcd and its backups, not API access. That is why the role matters too.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'An attacker gets a copy of an etcd snapshot from a cluster with no `--encryption-provider-config`. What can they read?',
			options: [
				'Only Secret names, because the API server stores values as SHA-256 hashes',
				'Every Secret value, after at most a base64 decode',
				'Nothing until they also steal the cluster CA key that encrypts etcd',
				'Only Secrets marked `immutable: true`, because the others stay in memory'
			],
			answer: 1,
			why: 'Without an `EncryptionConfiguration`, the default `identity` provider writes resources to etcd as they are. Base64 has no key, so the values are one command away from plain text.'
		},
		{
			q: 'Why can sops files stay in git while a plain Secret manifest cannot?',
			options: [
				'sops encrypts each value with AES-256-GCM, and only holders of a master key can decrypt the data key',
				'sops encodes each value twice in base64, which removes the plain text from the diff view',
				'sops stores the values on a server and leaves only a link to each value in the file',
				'sops makes git refuse to show the file to users who are not listed in `.sops.yaml`'
			],
			answer: 0,
			why: 'Each value is sealed with AES-GCM under a data key, and that data key is stored encrypted with age, PGP or KMS master keys. Without one of those keys, the ciphertext in git cannot be opened.'
		},
		{
			q: 'Your app reads its API token from an environment variable. Which of these can read the token?',
			options: [
				'Only the kubelet, because Kubernetes hides environment values from the process itself',
				'Only containers in other Pods on the same node, through the shared `tmpfs`',
				'Any child process the app starts, and anything allowed to read `/proc/<pid>/environ`',
				'Nobody after startup, because Linux wipes the environment once `main` begins'
			],
			answer: 2,
			why: 'A child process inherits its parent\'s environment, and `/proc/<pid>/environ` keeps the environment set at `execve`. The man page: reading that file is governed by a ptrace read access check.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Read a password out of a base64 Secret manifest and out of a container’s environment, then encrypt the manifest with sops.',
		steps: [
			'Install `sops` and `age` (for example `brew install sops age`), then `mkdir ~/secret-lab && cd ~/secret-lab`.',
			'Write the manifest from the task: `printf \'%s\\n\' \'apiVersion: v1\' \'kind: Secret\' \'metadata:\' \'  name: db\' \'data:\' "  password: $(printf hunter2-prod-db | base64)" > db.yaml`, then decode it: `awk \'/password/ {print $2}\' db.yaml | base64 -d`.',
			'Pass the password as an environment variable and read it the way a child process or `/proc` would: `docker run --rm -e DB_PASSWORD=hunter2-prod-db alpine:3.20 sh -c \'sh -c "env | grep DB_PASSWORD"; tr "\\0" "\\n" < /proc/1/environ | grep DB_PASSWORD\'`.',
			'Make an age key: `mkdir -p ~/.config/sops/age && age-keygen -o ~/.config/sops/age/keys.txt`.',
			'Encrypt the values only: `sops encrypt --age "$(age-keygen -y ~/.config/sops/age/keys.txt)" --encrypted-regex \'^(data|stringData)$\' db.yaml > db.enc.yaml`, then `cat db.enc.yaml` and `sops decrypt db.enc.yaml`.',
			'Move the ciphertext under another key: `sed \'s/^    password: ENC/    pass: ENC/\' db.enc.yaml > moved.yaml && sops decrypt moved.yaml`.'
		],
		done: [
			'Step 2 prints `hunter2-prod-db`.',
			'Step 3 prints `DB_PASSWORD=hunter2-prod-db` twice: once from the child shell, once from `/proc/1/environ`.',
			'`db.enc.yaml` still shows `kind: Secret` and `name: db`, while `password:` holds `ENC[AES256_GCM,data:...]`.',
			'`sops decrypt moved.yaml` fails with `Could not decrypt with AES_GCM`.'
		],
		solution: [
			'Base64 is not encryption, so the manifest in git is the password.',
			'Every child process inherits the environment, which is why the chapter mounts the Secret as a file instead.',
			'sops leaves keys readable and seals each value with AES-256-GCM. The path to the value is part of the additional data, so a value moved under another key does not decrypt.',
			'Anyone with `keys.txt` can decrypt every past version of the file. Keep it out of the repo.'
		]
	},
	recall: {
		q: 'What does a Kubernetes cluster need before Secrets in etcd are encrypted?',
		a: 'A `kube-apiserver` started with `--encryption-provider-config`, pointing at an `EncryptionConfiguration` whose first provider is `aescbc`, `secretbox` or `kms`, not `identity`. Without it, values sit in etcd as plain text.'
	},
	sources: [
		{ title: 'Kubernetes docs, Secrets', url: 'https://kubernetes.io/docs/concepts/configuration/secret/' },
		{ title: 'Kubernetes docs, Good practices for Kubernetes Secrets', url: 'https://kubernetes.io/docs/concepts/security/secrets-good-practices/' },
		{ title: 'Kubernetes docs, Encrypting Confidential Data at Rest', url: 'https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/' },
		{ title: 'CVE-2020-8564: Docker config secrets leaked when file is malformed and log level >= 4', url: 'https://github.com/kubernetes/kubernetes/issues/95622' },
		{ title: 'SOPS docs, First steps', url: 'https://getsops.io/docs/usage/first-steps/' },
		{ title: 'SOPS docs, Security', url: 'https://getsops.io/docs/security/' },
		{ title: 'OWASP Secrets Management Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html' },
		{ title: 'Linux man page, environ(7)', url: 'https://man7.org/linux/man-pages/man7/environ.7.html' },
		{ title: 'Linux man page, proc_pid_environ(5)', url: 'https://man7.org/linux/man-pages/man5/proc_pid_environ.5.html' }
	]
};
