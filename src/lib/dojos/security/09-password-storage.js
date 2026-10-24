const DJ = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const HASHERS = `${DJ}/django/contrib/auth/hashers.py`;
const SOPHOS = 'https://web.archive.org/web/20131107082752/http://nakedsecurity.sophos.com/2013/11/04/anatomy-of-a-password-disaster-adobes-giant-sized-cryptographic-blunder/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'password-storage',
	part: 'Identity',
	title: 'Storing passwords',
	minutes: 10,
	hook: [
		'In October 2013, Adobe confirmed that attackers took Adobe IDs and "encrypted passwords for approximately 38 million active users". Soon after, a dump of 150 million records appeared online, with the users\' password hints stored next to the passwords.',
		'Sophos took a sample of 1,000,000 records. Every password blob was a multiple of 8 bytes long, which points to a 64-bit block cipher such as 3DES. The same password always gave the same blob, because the cipher ran in ECB mode with one key for everyone.',
		'With the hints and a list of common passwords, Sophos identified the top five passwords, used by 2.75% of the sample, without the key.'
	],
	terms: [
		{ term: 'Hash', def: 'A one-way function: from the password you get the hash, and nothing turns the hash back into the password. To check a login, you hash the attempt and compare.' },
		{ term: 'Salt', def: 'A random string stored next to each user\'s hash and mixed into the input. Two users with the same password get different hashes. Django\'s salts are 22 characters, at least 128 bits.' },
		{ term: 'Work factor', def: 'How much computing one hash costs: 1,800,000 iterations of PBKDF2-SHA256 in Django at the pinned commit. Every guess by an attacker pays the same cost.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['pw["123456 for user A and for user B"] -->|"3DES, ECB, one key"| enc["Same blob twice in the table"]'],
				highlight: ['pw', 'enc'],
				note: 'Adobe encrypted every password with one key and no per-user value. Users A and B chose the same password, so their rows hold the same blob. Sophos counted how often each blob repeats and read the hints next to the top ones.'
			},
			{
				add: ['enc --> key["Key found or guessed: every password decrypts"]'],
				highlight: ['key'],
				note: 'Whoever holds Adobe\'s key can decrypt every blob. Sophos: "Anyone who computes, guesses or acquires the decryption key immediately gets access to all the passwords in the database." The login code needs that key for every check, so the key lives on the same servers as the table.'
			},
			{
				add: ['enc --> fast["Plain SHA-256 instead: still one value per password"]'],
				highlight: ['fast'],
				note: 'A plain hash removes the key but keeps both problems: equal passwords give equal hashes, and one hash costs almost nothing. OWASP: fast functions like SHA-256 "allow attackers to perform large numbers of guesses quickly".'
			},
			{
				add: ['salt["Salt per user + PBKDF2, 1,800,000 iterations"] -.->|"different hashes for A and B"| enc', 'salt -.->|"each guess costs 1,800,000 rounds"| fast'],
				highlight: ['salt'],
				note: 'Django gives each user a fresh 22-character salt, so A and B get different hashes. Each guess runs 1,800,000 rounds of HMAC-SHA256 for one user only. OWASP\'s minimums: Argon2id with 19 MiB and 2 iterations, or PBKDF2-HMAC-SHA256 with 600,000.'
			},
			{
				add: ['salt --> login["Next correct login: must_update is true, store a new hash"]'],
				highlight: ['login'],
				note: 'The work factor sits inside each stored value, so old hashes can be found. When a user logs in with an older count, `check_password` gets `must_update = True` and calls its `setter` to store a hash at the current count.'
			}
		]
	},
	example: {
		title: 'django/contrib/auth/hashers.py: PBKDF2PasswordHasher',
		repo: 'django/django',
		url: `${HASHERS}#L325-L370`,
		lang: 'python',
		code: `    algorithm = "pbkdf2_sha256"
    iterations = 1_800_000
    digest = hashlib.sha256

    def encode(self, password, salt, iterations=None):
        self._check_encode_args(password, salt)
        iterations = iterations or self.iterations
        salt = force_str(salt)
        hash = pbkdf2(password, salt, iterations, digest=self.digest)
        hash = base64.b64encode(hash).decode("ascii").strip()
        return "%s$%d$%s$%s" % (self.algorithm, iterations, salt, hash)

    def decode(self, encoded):
        algorithm, iterations, salt, hash = encoded.split("$", 3)
        assert algorithm == self.algorithm
        return {
            "algorithm": algorithm,
            "hash": hash,
            "iterations": int(iterations),
            "salt": salt,
        }

    def verify(self, password, encoded):
        decoded = self.decode(encoded)
        encoded_2 = self.encode(password, decoded["salt"], decoded["iterations"])
        return constant_time_compare(encoded, encoded_2)

…
    def must_update(self, encoded):
        decoded = self.decode(encoded)
        update_salt = must_update_salt(decoded["salt"], self.salt_entropy)
        return (decoded["iterations"] != self.iterations) or update_salt

    def harden_runtime(self, password, encoded):
        decoded = self.decode(encoded)
        extra_iterations = self.iterations - decoded["iterations"]
        if extra_iterations > 0:
            self.encode(password, decoded["salt"], extra_iterations)`,
		notes: [
			'The `return` in `encode` writes `pbkdf2_sha256$1800000$<salt>$<hash>`. Each row carries its own algorithm, work factor and salt, so rows made with different settings can sit in one table.',
			'`verify` hashes the login attempt again with the salt and iteration count read from the row, then compares with `constant_time_compare`. Nothing is ever decrypted, because there is no key.',
			'`must_update` is true when the row\'s count differs from `iterations`, or when the salt has under 128 bits. In [`verify_password`](' + HASHERS + '#L61-L72) that flag reaches `check_password`, which rehashes the password the user just typed.',
			'`harden_runtime` runs the missing iterations after a failed login on an old row. Login time then stays close to the current work factor, so timing tells an attacker less about which accounts still have old hashes.',
			'The default `iterations` is 1,800,000 at this commit on Django\'s main branch. The docs say Django will "increase it with each release". The same file has `Argon2PasswordHasher` with `time_cost = 2` and `memory_cost = 102400`, which argon2-cffi reads as kibibytes: 100 MiB.'
		]
	},
	tradeoff: {
		gain: [
			'A stolen table gives no key to find. Each password must be guessed on its own, with its own salt, at 1,800,000 rounds per guess.',
			'The work factor can grow without a reset: every user who logs in after an upgrade gets the new count, through `must_update`.'
		],
		cost: [
			'Each login spends 1,800,000 rounds of CPU on purpose. OWASP warns that a work factor set too high lets an attacker exhaust the CPU "with a large number of login attempts", and suggests under one second per hash.',
			'Users who never log in again keep their old hash. Django\'s docs describe wrapping old MD5 hashes in PBKDF2 to upgrade them without a login.',
			'You can never show or email a user their password. A reset link is the only recovery path.'
		]
	},
	task: {
		prompt: 'A users table has three rows. Row 1: `5f4dcc3b5aa765d61d8327deb882cf99`. Row 2: `pbkdf2_sha256$600000$Xq3...$9fK...`. Row 3: a column `password_enc` holding AES-GCM ciphertext, with the key in `settings.py`. The app runs Django at the pinned commit. Rank the rows from worst to best and say what happens to row 2 at its next correct login.',
		hint: 'Row 1 has 32 hex characters and no `$`. What fits that shape, and what does the table say about two users with the same password? For row 2, compare 600000 with `iterations`.',
		answer: [
			'Row 1 is an unsalted MD5: 32 hex characters, no salt, no work factor. It is MD5 of the word `password`, so any public lookup table reverses it at once.',
			'Row 3 is next. AES-GCM with a fresh nonce hides equal passwords better than Adobe\'s ECB, but anyone who reads `settings.py` decrypts every row. Same problem as Adobe: one key for all.',
			'Row 2 is the best: salted, slow and one-way. At the next correct login `must_update` sees 600000, which differs from 1,800,000, so `check_password` calls `setter` and the row gets `pbkdf2_sha256$1800000$<new salt>$<hash>`.',
			'Fix for rows 1 and 3: hash them into PBKDF2 or Argon2 now. Row 3 can be decrypted and rehashed in one migration. Row 1 needs the wrapped-hasher method from the Django docs.'
		],
		steps: [
			{
				title: 'Identify each row',
				questions: [
					{ q: 'Row 1 is 32 hex characters with no `$`. What is it?', options: ['An unsalted MD5', 'A Django PBKDF2 hash', 'An AES-GCM ciphertext', 'A base64 encoded password'], answer: 0, why: 'MD5 gives 32 hex characters, and nothing else is stored with it: no salt, no work factor.' },
					{ q: 'Two users pick the same password, stored like row 1. What does the table show?', options: ['Two different values', 'Two values that differ only in the salt', 'An error on insert', 'The same value twice'], answer: 3, why: 'With no salt, equal passwords give equal hashes, like the equal blobs at Adobe.' },
					{ q: 'Split on `$`, what are the four parts of row 2?', options: ['Key, nonce, salt, hash', 'Algorithm, iterations, salt, hash', 'User id, algorithm, salt, hash', 'Algorithm, date, salt, hash'], answer: 1, why: '`encode` writes `"%s$%d$%s$%s" % (self.algorithm, iterations, salt, hash)`.' },
					{ q: 'Row 3 is AES-GCM with the key in `settings.py`. What kind of storage is that?', options: ['One-way hashing with a secret pepper', 'Salted hashing with a work factor', 'Two-way encryption: the key gives back the password', 'Plain encoding, like base64, with no key'], answer: 2, why: 'Anyone with the key can undo it, and the login code needs that key on the same servers.' }
				]
			},
			{
				title: 'Rank the rows',
				questions: [
					{ q: 'Which row is the worst?', options: ['Row 2', 'Row 3', 'Row 1', 'All three are as bad'], answer: 2, why: 'It is the MD5 of the word `password`, so any public lookup table reverses it at once.' },
					{ q: 'Why is row 3 still bad, even with a fresh nonce?', options: ['AES-GCM is broken', 'Anyone who reads `settings.py` decrypts every row', 'The nonce leaks the password length', 'GCM gives equal blobs for equal passwords'], answer: 1, why: 'Same problem as Adobe: one key for everyone. Sophos: whoever gets the key "immediately gets access to all the passwords in the database".' },
					{ q: 'What does row 3 do better than Adobe did?', options: ['It needs no key to check a login', 'It has a work factor, like PBKDF2', 'It cannot be decrypted, even with the key', 'A fresh nonce hides equal passwords'], answer: 3, why: 'ECB with one key gave equal blobs for equal passwords. A fresh nonce per row breaks that pattern.' },
					{ q: 'Why is row 2 the best?', options: ['It is salted, slow and one-way', 'It is encrypted with a longer key', 'It is the newest row in the table', 'It hides the name of the algorithm'], answer: 0, why: 'Each guess must be made for one user, with that user\'s salt, at 600,000 rounds or more.' }
				]
			},
			{
				title: 'Follow row 2 at its next login',
				questions: [
					{ q: 'The user logs in with the right password. What does `verify` do?', options: ['Decrypts the row and compares', 'Compares the typed text with the stored hash text', 'Asks an admin to confirm', 'Hashes the attempt with the row\'s salt and count, then compares'], answer: 3, why: 'Nothing is decrypted. `verify` encodes the attempt again and checks it with `constant_time_compare`.' },
					{ q: 'Why does `must_update` return true for row 2?', options: ['600000 differs from the current 1,800,000', 'The algorithm name has changed', 'The hash is in base64', 'The row is more than a year old'], answer: 0, why: '`must_update` is true when the stored count differs from `self.iterations`, or when the salt has under 128 bits.' },
					{ q: 'What does the row hold after that login?', options: ['The same value, untouched', '`pbkdf2_sha256$600000$<new salt>$<hash>`', '`pbkdf2_sha256$1800000$<new salt>$<hash>`', 'An Argon2 hash of the old hash'], answer: 2, why: '`check_password` calls `setter` with the password just typed. The new value carries the current count and a fresh salt.' },
					{ q: 'Someone tries a wrong password on row 2. What does `harden_runtime` do?', options: ['Locks the account for an hour after the attempt', 'Runs the missing iterations, so the timing looks current', 'Rehashes the row at 1,800,000 with a new salt', 'Logs the attempt and returns early to save time'], answer: 1, why: 'Login time stays close to the current work factor, so timing tells an attacker less about which rows are old.' }
				]
			},
			{
				title: 'Fix rows 1 and 3',
				questions: [
					{ q: 'How do you fix row 3?', options: ['Rotate the AES key and encrypt every row again', 'Decrypt it and hash it into PBKDF2 or Argon2, in one migration', 'Move the key from `settings.py` to an environment variable', 'Add a salt column next to the encrypted value'], answer: 1, why: 'You hold the key, so you can recover each password once and store a one-way hash instead.' },
					{ q: 'Row 1 cannot be decrypted. How does it get a strong hash before the user logs in?', options: ['Reset it to a random password', 'Add a salt to the MD5 and store it again', 'Wrap the MD5 in PBKDF2, as the Django docs describe', 'Nothing can be done until the next login'], answer: 2, why: 'Django\'s docs describe wrapping old MD5 hashes in PBKDF2, so they upgrade without a login.' },
					{ q: 'Why not use a salted SHA-256 instead?', options: ['SHA-256 is fast, so guesses are cheap', 'SHA-256 can be reversed with the salt', 'The salt would have to stay secret', 'SHA-256 output is too short'], answer: 0, why: 'OWASP: fast hashes like SHA-256 "allow attackers to perform large numbers of guesses quickly".' },
					{ q: 'What are OWASP\'s minimums?', options: ['MD5 with a 128-bit salt, or SHA-1 with 1,000 rounds', 'SHA-256 with 10,000 rounds and a 64-bit salt', 'AES-GCM with a fresh nonce and a 256-bit key', 'Argon2id with 19 MiB and 2 iterations, or PBKDF2-SHA256 at 600,000'], answer: 3, why: 'Those are OWASP\'s numbers. Django\'s 1,800,000 is well above the PBKDF2 minimum.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Sophos could tell which Adobe users shared a password without having the key. Why?',
			options: [
				'The dump also held each password in plain text next to the blob',
				'ECB with one key gives the same blob for the same password, with no salt',
				'3DES is broken, so each blob could be decrypted in seconds',
				'Adobe hashed the passwords with MD5, and MD5 tables are public'
			],
			answer: 1,
			why: 'In ECB mode the same input block and key always give the same output block. With no per-user salt or nonce, equal passwords produced equal blobs, and the hints next to them gave the passwords away.'
		},
		{
			q: 'A row holds `pbkdf2_sha256$600000$...`, and Django\'s current `iterations` is 1,800,000. The user logs in with the right password. What happens?',
			options: [
				'The login fails until an admin resets the password',
				'Django rehashes the password at 1,800,000 iterations and saves it',
				'Django runs 1,800,000 iterations but keeps the old row',
				'Nothing changes: the stored count is kept forever'
			],
			answer: 1,
			why: '`must_update` returns true because 600000 differs from `self.iterations`. `check_password` then calls `setter(password)` with the password the user just typed, and the new value carries 1,800,000 iterations and a fresh salt.'
		},
		{
			q: 'Why is a salted SHA-256 still a poor choice for passwords?',
			options: [
				'SHA-256 output is short enough to collide for common passwords',
				'The salt must be secret, and it is stored next to the hash',
				'SHA-256 is fast, so an attacker can try many guesses per second',
				'SHA-256 is two-way, so the hash can be decrypted with the salt'
			],
			answer: 2,
			why: 'The salt only stops one guess from matching many users at once. OWASP: fast hashes like SHA-256 "allow attackers to perform large numbers of guesses quickly". A work factor makes each guess cost what a real login costs.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Reverse row 1, see what a salt changes, and time a work factor on your own machine.',
		steps: [
			'Hash the word `password` with MD5 and compare with row 1 of the task: `python3 -c \'import hashlib; print(hashlib.md5(b"password").hexdigest())\'`.',
			'Two users, same password, two salts: `python3 -c \'import hashlib,os; [print(hashlib.pbkdf2_hmac("sha256", b"password", os.urandom(16), 1000).hex()[:16]) for _ in range(2)]\'`.',
			'Count how many plain SHA-256 guesses one core makes per second: `python3 -c \'import hashlib,timeit; print(int(100000/timeit.timeit(lambda: hashlib.sha256(b"guess").digest(), number=100000)), "per second")\'`.',
			'Time one PBKDF2 guess at 600,000 iterations: `python3 -c \'import hashlib,os,time; t=time.time(); hashlib.pbkdf2_hmac("sha256", b"password", os.urandom(16), 600000); print(round(time.time()-t, 2), "s")\'`. Run it again with `1800000` in place of `600000`.',
			'Build the string Django would store: `python3 -c \'import hashlib,base64,secrets,string; s="".join(secrets.choice(string.ascii_letters+string.digits) for _ in range(22)); h=base64.b64encode(hashlib.pbkdf2_hmac("sha256", b"password", s.encode(), 1800000)).decode(); print("pbkdf2_sha256$1800000$%s$%s" % (s, h))\'`.'
		],
		done: [
			'Step 1 prints `5f4dcc3b5aa765d61d8327deb882cf99`, the exact value of row 1.',
			'Step 2 prints two different values for the same password.',
			'Step 3 prints hundreds of thousands of guesses per second or more. Step 4 takes a fraction of a second at 600,000, and clearly longer at 1,800,000.',
			'Step 5 prints a line shaped like row 2: `pbkdf2_sha256$1800000$<salt>$<hash>`.'
		],
		solution: [
			'Row 1 is the MD5 of `password` with no salt. You reversed it with one guess, the way a lookup table does for every common password at once.',
			'The salt makes each user\'s hash different, so one guess tests one user. The work factor makes each guess cost what a real login costs: a few guesses per second per core, against the SHA-256 count of step 3.',
			'The stored string carries the algorithm, the count and the salt. That is how `must_update` spots a row at 600000 and rehashes it at the next login.'
		]
	},
	recall: {
		q: 'What does Django store for a password, and what happens when the stored work factor is out of date?',
		a: '`pbkdf2_sha256$<iterations>$<salt>$<hash>`, with 1,800,000 iterations at the pinned commit. At the next correct login, `must_update` is true and the password is rehashed at the current count.'
	},
	sources: [
		{ title: 'Sophos Naked Security, Anatomy of a password disaster: Adobe (archived, November 2013)', url: SOPHOS },
		{ title: 'Krebs on Security, Adobe breach impacted at least 38 million users (October 2013)', url: 'https://krebsonsecurity.com/2013/10/adobe-breach-impacted-at-least-38-million-users/' },
		{ title: 'OWASP Password Storage Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html' },
		{ title: 'Django docs, Password management in Django', url: 'https://docs.djangoproject.com/en/stable/topics/auth/passwords/' },
		{ title: 'Django source, django/contrib/auth/hashers.py', url: HASHERS }
	]
};
