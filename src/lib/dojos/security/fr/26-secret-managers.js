const K8S_ISSUE = 'https://github.com/kubernetes/kubernetes/issues/95622';
const SOPS = 'https://github.com/getsops/sops/blob/e39ca97b6209f9132ea40d22beb37d796060cb32';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'secret-managers',
	part: 'Les secrets et la chaîne d’approvisionnement',
	title: 'Où vivent les secrets',
	minutes: 10,
	hook: [
		'Le 15 octobre 2020, Kubernetes publie la [CVE-2020-8564](' + K8S_ISSUE + '). L’avis : "In Kubernetes clusters using a logging level of at least 4, processing a malformed docker config file will result in the contents of the docker config file being leaked, which can include pull secrets or other registry credentials." Avec des logs en niveau 4 ou plus, un fichier de config Docker mal formé finit en clair dans les logs.',
		'Le mot de passe du registre était rangé dans un Secret Kubernetes, et une ligne de log l’a recopié. Les versions 1.17.0 à 1.19.2 sont touchées, corrigées en 1.17.13, 1.18.10 et 1.19.3. La parade proposée : "Do not enable verbose logging in production, limit access to logs."',
		'Ton appli a besoin de son mot de passe de base de données quelque part : dans une variable d’environnement, dans un fichier, ou chez un gestionnaire de secrets. Chaque endroit a ses propres lecteurs.'
	],
	terms: [
		{ term: 'Secret Kubernetes', def: 'Un objet de l’API qui contient quelques valeurs nommées, 1 MiB au plus, que les Pods lisent en variables d’environnement ou en fichiers. Ses valeurs `data` sont du texte en base64.' },
		{ term: 'Base64', def: 'Une façon d’écrire n’importe quels octets avec 64 caractères imprimables. N’importe qui l’inverse avec `base64 -d`, sans aucune clé.' },
		{ term: 'Chiffrement au repos', def: 'L’API server chiffre chaque Secret avant de l’écrire dans etcd, avec une clé qu’etcd ne voit jamais. Kubernetes ne l’active que si tu donnes à `kube-apiserver` un fichier `EncryptionConfiguration`.' },
		{ term: 'Gestionnaire de secrets', def: 'Un service (HashiCorp Vault, AWS Secrets Manager, Google Secret Manager) qui stocke les secrets, les remet aux appelants autorisés et peut journaliser chaque lecture.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['yaml["db-secret.yaml dans git : password: aHVudGVyMi1wcm9kLWRi"] -->|"base64 -d"| plain["hunter2-prod-db"]'],
				highlight: ['yaml', 'plain'],
				note: 'Un manifeste de Secret range ses valeurs `data` en base64. Quiconque clone le dépôt lance `base64 -d` et lit `hunter2-prod-db`. La doc Kubernetes : "Base64 encoding is _not_ an encryption method, it provides no additional confidentiality over plain text."'
			},
			{
				add: ['yaml -->|"kubectl apply"| api["kube-apiserver"]', 'api -->|"pas d’EncryptionConfiguration"| etcd[("etcd : le Secret stocké tel quel")]'],
				highlight: ['api', 'etcd'],
				note: 'La doc prévient que les Secrets sont "by default, stored unencrypted in the API server\'s underlying data store (etcd)". Sans `--encryption-provider-config`, l’API server écrit la valeur en clair. Une copie d’une sauvegarde etcd contient alors tous les mots de passe du cluster.'
			},
			{
				add: ['api -->|"env: secretKeyRef"| pod["Pod : DB_PASSWORD dans l’environnement"]', 'pod --> leak["Lu via /proc/1/environ, les processus enfants, les dumps, les logs"]'],
				highlight: ['pod', 'leak'],
				note: 'En variable d’environnement, le mot de passe se trouve dans `/proc/<pid>/environ` et dans chaque processus enfant. La fiche OWASP : les variables d’environnement "are generally accessible to all processes and may be included in logs or system dumps". Un fichier monté depuis un Secret atterrit dans un `tmpfs` et n’arrive jamais sur le disque du nœud.'
			},
			{
				add: ['sops["sops : password: ENC[AES256_GCM,...]"] -->|"git push"| yaml', 'enc["EncryptionConfiguration : aescbc ou kms en premier"] --> etcd'],
				highlight: ['sops', 'enc'],
				note: 'Deux parades pour les deux premières fuites. sops chiffre chaque valeur du fichier avant qu’elle parte dans git, et laisse les clés lisibles. Une `EncryptionConfiguration` avec `aescbc` ou `kms` en premier fournisseur fait stocker à etcd `k8s:enc:aescbc:v1:key1:` suivi du chiffré.'
			},
			{
				add: ['vault["Gestionnaire de secrets : politique par appli, journal d’audit, expiration"] -->|"identifiant à courte durée"| pod'],
				highlight: ['vault'],
				note: 'Un gestionnaire de secrets ne donne à chaque appli que les secrets que sa politique autorise, et note chaque demande. OWASP liste ce qu’il faut auditer, en commençant par "Who requested a secret and for what system and role." Un identifiant qui expire au bout d’un délai fixé limite la durée de vie d’une copie volée.'
			}
		]
	},
	example: {
		title: 'aes/cipher.go : comment sops chiffre une valeur',
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
			'Les lignes `make([]byte, nonceSize)` et `rand.Read(iv)` tirent un IV aléatoire neuf de 32 octets (`nonceSize` vaut 32 dans ce fichier) pour chaque valeur. La branche `else` reprend l’IV mis de côté au déchiffrement : une valeur inchangée garde le même chiffré, et `git diff` ne montre que les valeurs que tu as modifiées.',
			'`additionalData` est le chemin de la valeur. [`Tree.Encrypt`](' + SOPS + '/sops.go#L557-L558) le construit en joignant les clés avec `:`, par exemple `app2:db:password:`. GCM le vérifie au déchiffrement : un chiffré recopié sous une autre clé échoue avec "Could not decrypt with AES_GCM".',
			'La ligne `fmt.Sprintf` écrit la chaîne `ENC[AES256_GCM,data:...,iv:...,tag:...,type:str]` que tu vois dans le fichier. La doc sops : "keys are stored in cleartext, and values are encrypted". Les diffs et les merges restent donc lisibles.',
			'`key` est une clé de données, la même pour tout le fichier. sops la chiffre avec chaque clé maîtresse (age, PGP ou un KMS cloud) et range les résultats dans le bloc `sops:`. La doc : "As long as one of the KMS or PGP method is still usable, you will be able to access your data."'
		]
	},
	tradeoff: {
		gain: [
			'Avec sops, le dépôt ne contient que du chiffré pour chaque valeur, et une pull request montre quand même quelle clé a changé.',
			'Avec `aescbc` ou `kms` en premier dans l’`EncryptionConfiguration`, une sauvegarde etcd volée ne contient que du chiffré, et la clé reste sur le control plane ou dans le KMS.',
			'Un gestionnaire de secrets note qui a lu quel secret et peut émettre des identifiants qui expirent : une copie volée cesse de marcher toute seule.'
		],
		cost: [
			'Le chiffrement au repos ne change rien pour qui a accès à l’API : `kubectl get secret db -o yaml` rend toujours la valeur en base64 à tout compte autorisé à la lire.',
			'Les Secrets existants restent en clair dans etcd tant qu’ils ne sont pas réécrits. La doc donne `kubectl get secrets --all-namespaces -o json | kubectl replace -f -` pour ça.',
			'Qui détient la clé maîtresse sops (une clé age dans `~/.config/sops/age/keys.txt`, ou le droit de déchiffrer sur le KMS) peut déchiffrer chaque ancienne version de l’historique git.',
			'Un gestionnaire de secrets ajoute un service sur le chemin du démarrage. OWASP note qu’un service lent peut "increase application startup times".'
		]
	},
	task: {
		prompt: 'Un collègue ouvre une pull request avec trois fichiers. `db-secret.yaml` : `kind: Secret`, `data: { password: aHVudGVyMi1wcm9kLWRi }`. `deploy.yaml` : le conteneur lit la valeur avec `env: [{ name: DB_PASSWORD, valueFrom: { secretKeyRef: { name: db, key: password } } }]`. `role.yaml` : le ServiceAccount de l’appli reçoit `verbs: ["get", "list", "watch"]` sur `secrets`. Trouve ce qui fuit, et vers qui. 10 minutes, sur papier.',
		hint: 'Lance `echo aHVudGVyMi1wcm9kLWRi | base64 -d`. Puis relis la phrase de la doc Kubernetes sur ce que donne `list` sur les Secrets.',
		answer: [
			'`db-secret.yaml` met le mot de passe dans git : `base64 -d` affiche `hunter2-prod-db`. Toute personne qui peut lire le dépôt, aujourd’hui ou dans un clone futur, l’a. Correction : committer le fichier chiffré avec `sops encrypt`, et changer ce mot de passe, déjà présent dans l’historique de la branche.',
			'`role.yaml` : la doc dit "granting list or watch permissions on Secrets allows a subject to read all Secret data in that namespace". Le kubelet monte le Secret pour le Pod, donc le ServiceAccount de l’appli n’a besoin d’aucun verbe sur `secrets`, sauf si le code appelle l’API lui-même.',
			'`deploy.yaml` : en variable d’environnement, le mot de passe est dans `/proc/<pid>/environ` et passe à chaque processus enfant. Monte-le plutôt en fichier : `volumes: [{ name: db, secret: { secretName: db } }]`, et l’appli lit `/etc/db/password` dans un `tmpfs`.',
			'Hors de la pull request, une question à poser : le `kube-apiserver` du cluster tourne-t-il avec `--encryption-provider-config` ? Sans ça, la valeur est en clair dans etcd et dans chaque sauvegarde etcd.'
		]
	},
	quiz: [
		{
			q: 'Un attaquant récupère un snapshot etcd d’un cluster sans `--encryption-provider-config`. Que peut-il lire ?',
			options: [
				'Seulement les noms des Secrets, car l’API server stocke les valeurs en hash SHA-256',
				'Toutes les valeurs des Secrets, au pire après un décodage base64',
				'Rien tant qu’il n’a pas aussi volé la clé de la CA du cluster qui chiffre etcd',
				'Seulement les Secrets marqués `immutable: true`, les autres restent en mémoire'
			],
			answer: 1,
			why: 'Sans `EncryptionConfiguration`, le fournisseur par défaut `identity` écrit les ressources dans etcd telles quelles. Le base64 n’a pas de clé : les valeurs sont à une commande du texte clair.'
		},
		{
			q: 'Pourquoi un fichier sops peut-il rester dans git, et pas un manifeste de Secret brut ?',
			options: [
				'sops chiffre chaque valeur en AES-256-GCM, et seuls les détenteurs d’une clé maîtresse déchiffrent la clé de données',
				'sops encode chaque valeur deux fois en base64, ce qui retire le texte clair de l’affichage du diff',
				'sops range les valeurs sur un serveur et ne laisse dans le fichier qu’un lien vers chacune',
				'sops fait refuser à git d’afficher le fichier aux personnes absentes de `.sops.yaml`'
			],
			answer: 0,
			why: 'Chaque valeur est scellée en AES-GCM avec une clé de données, elle-même stockée chiffrée par des clés maîtresses age, PGP ou KMS. Sans l’une de ces clés, le chiffré présent dans git reste fermé.'
		},
		{
			q: 'Ton appli lit son jeton d’API dans une variable d’environnement. Qui peut lire ce jeton ?',
			options: [
				'Seulement le kubelet, car Kubernetes cache les valeurs d’environnement au processus lui-même',
				'Seulement les conteneurs des autres Pods du nœud, via le `tmpfs` partagé',
				'Tout processus enfant lancé par l’appli, et quiconque peut lire `/proc/<pid>/environ`',
				'Personne après le démarrage, car Linux efface l’environnement dès que `main` commence'
			],
			answer: 2,
			why: 'Un processus enfant hérite d’une copie de l’environnement de son parent, et `/proc/<pid>/environ` garde l’environnement fixé à l’`execve`. La page de man : la lecture de ce fichier passe par un contrôle d’accès ptrace en lecture.'
		}
	],
	recall: {
		q: 'De quoi un cluster Kubernetes a-t-il besoin pour que les Secrets soient chiffrés dans etcd ?',
		a: 'Un `kube-apiserver` lancé avec `--encryption-provider-config`, qui pointe vers une `EncryptionConfiguration` dont le premier fournisseur est `aescbc`, `secretbox` ou `kms`, et pas `identity`. Sans ça, les valeurs sont en clair dans etcd.'
	},
	sources: [
		{ title: 'Doc Kubernetes, Secrets', url: 'https://kubernetes.io/docs/concepts/configuration/secret/' },
		{ title: 'Doc Kubernetes, Good practices for Kubernetes Secrets', url: 'https://kubernetes.io/docs/concepts/security/secrets-good-practices/' },
		{ title: 'Doc Kubernetes, Encrypting Confidential Data at Rest', url: 'https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/' },
		{ title: 'CVE-2020-8564 : Docker config secrets leaked when file is malformed and log level >= 4', url: 'https://github.com/kubernetes/kubernetes/issues/95622' },
		{ title: 'Doc SOPS, First steps', url: 'https://getsops.io/docs/usage/first-steps/' },
		{ title: 'Doc SOPS, Security', url: 'https://getsops.io/docs/security/' },
		{ title: 'OWASP, Secrets Management Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html' },
		{ title: 'Page de man Linux, environ(7)', url: 'https://man7.org/linux/man-pages/man7/environ.7.html' },
		{ title: 'Page de man Linux, proc_pid_environ(5)', url: 'https://man7.org/linux/man-pages/man5/proc_pid_environ.5.html' }
	]
};
