const RA = 'https://github.com/rack/rack-attack/blob/b771ea18afb9e6b625906a641d2d331e6d0c282b';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'login-rate-limit',
	part: 'L’identité',
	title: 'Ralentir les tentatives',
	minutes: 10,
	hook: [
		'Le 1er octobre 2023, quelqu’un publie en ligne une annonce : il dit détenir des informations de profil d’utilisateurs de 23andMe. Dans sa déclaration à la SEC du 1er décembre 2023, 23andMe écrit que l’attaquant est entré dans 0,1 % des comptes, ceux dont l’identifiant et le mot de passe "were the same as those used on other websites that had been previously compromised" (étaient les mêmes que sur d’autres sites déjà compromis). Depuis ces comptes, l’attaquant a atteint des fichiers sur d’autres utilisateurs inscrits à la fonction DNA Relatives.',
		'L’Information Commissioner’s Office britannique inflige à 23andMe une amende de 2,31 millions de livres le 17 juin 2025. Il établit que le credential stuffing a duré d’avril à septembre 2023 et a touché les données de 155 592 résidents britanniques. L’ICO relève l’absence de "mandatory multi-factor authentication, secure password protocols, or unpredictable usernames" (MFA obligatoire, règles de mot de passe sûres, identifiants non devinables).',
		'Dans le credential stuffing, chaque compte reçoit un seul essai, avec un mot de passe que son propriétaire a utilisé sur un autre site. Une règle qui bloque un compte après 5 mauvais mots de passe ne se déclenche jamais sur ce trafic.'
	],
	terms: [
		{ term: 'Credential stuffing', def: 'Essayer des couples identifiant et mot de passe tirés de la fuite d’un autre site (OWASP). Ça marche sur chaque utilisateur qui a réutilisé un mot de passe.' },
		{ term: 'Discriminant', def: 'Dans Rack::Attack, la valeur selon laquelle un throttle compte : l’IP du client, un email normalisé, ou ce que renvoie le bloc. Un discriminant `nil` veut dire que la requête n’est pas comptée.' },
		{ term: 'Fenêtre fixe', def: 'Un compteur qui repart à chaque multiple de la période. Avec une période de 20 secondes, les temps Unix 1 000 000 à 1 000 019 partagent un compteur, et 1 000 020 en ouvre un nouveau.' },
		{ term: 'Verrouillage de compte', def: 'Refuser les connexions d’un compte après un nombre d’échecs dans une fenêtre d’observation, pendant une durée de verrouillage (OWASP Authentication Cheat Sheet).' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["POST /login depuis 203.0.113.7, email Ann@Example.com"] --> ra["Middleware Rack::Attack, avant l’appli"]'],
				highlight: ['req', 'ra'],
				note: 'Rack::Attack se place devant l’appli comme middleware Rack. Pour chaque requête, `call` vérifie les safelists, puis les blocklists, puis les throttles, et seulement ensuite passe la requête à l’appli.'
			},
			{
				add: ['ra --> ipkey["compteur logins/ip : 203.0.113.7"]', 'ra --> emkey["compteur logins/email : ann@example.com"]'],
				highlight: ['ipkey', 'emkey'],
				note: 'La configuration d’exemple définit deux throttles sur `POST /login`, chacun avec `limit: 5, period: 20.seconds`. L’un compte par `req.ip`. L’autre compte par le paramètre email, mis en minuscules et sans ses espaces. La même requête ajoute 1 aux deux compteurs.'
			},
			{
				add: ['emkey --> count["store.increment(key), compteur à 6 dans cette fenêtre"]', 'count -->|"compteur au-dessus de la limite 5"| deny["429 Retry later, l’appli ne tourne pas"]'],
				highlight: ['count', 'deny'],
				note: 'Le cache incrémente le compteur de la fenêtre en cours. Quand le compteur dépasse la limite, Rack::Attack répond `429` avec le corps `Retry later`. Le code de connexion et son hachage de mot de passe ne tournent pas.'
			},
			{
				add: ['bots["Beaucoup d’IP, un couple volé par compte"] -->|"1 requête par IP, 1 par email"| pass["Les deux compteurs restent à 1"]'],
				highlight: ['bots', 'pass'],
				note: 'Une campagne de credential stuffing envoie une requête par compte et les répartit sur beaucoup d’adresses. OWASP : les réseaux de proxys "may defeat both IP block-lists and rate limiting, as per IP request volume may remain relatively low" (peuvent contourner les listes de blocage et la limitation, le volume par IP restant faible). Chaque compteur reste sous 5.'
			},
			{
				add: ['mal["L’attaquant envoie 6 mauvais mots de passe pour ann@example.com"] --> locked["Ann reçoit 429 jusqu’à la fin de la fenêtre"]'],
				highlight: ['mal', 'locked'],
				note: 'Le compteur par email ne sait pas qui tape. La configuration d’exemple prévient que "a malicious user could intentionally throttle logins for another user" (un utilisateur malveillant peut bloquer exprès les connexions d’un autre). OWASP propose de laisser marcher le parcours de mot de passe oublié pendant le verrouillage.'
			}
		]
	},
	example: {
		title: 'lib/rack/attack/throttle.rb : matched_by? dans Rack::Attack',
		repo: 'rack/rack-attack',
		url: `${RA}/lib/rack/attack/throttle.rb#L25-L49`,
		lang: 'ruby',
		code: `      def matched_by?(request)
        discriminator = discriminator_for(request)
        return false unless discriminator

        current_period  = period_for(request)
        current_limit   = limit_for(request)
        count           = cache.count("#{name}:#{discriminator}", current_period)

        data = {
          discriminator: discriminator,
          count: count,
          period: current_period,
          limit: current_limit,
          epoch_time: cache.last_epoch_time
        }

        annotate_request_with_throttle_data(request, data)

        (count > current_limit).tap do |throttled|
          if throttled
            annotate_request_with_matched_data(request, data)
            Rack::Attack.instrument(request)
          end
        end
      end`,
		notes: [
			'La ligne 2 exécute le bloc du throttle. La ligne 3 ignore la requête quand le bloc renvoie `nil` : c’est ainsi qu’un throttle de connexion laisse de côté tout ce qui n’est pas `POST /login`. Avant le retour de la ligne 2, le [normaliseur par défaut](' + RA + '/lib/rack/attack.rb#L92-L94) applique `to_s.strip.downcase` au discriminant.',
			'La ligne 7 compte sous la clé `name:discriminator`. [`key_and_expiry`](' + RA + '/lib/rack/attack/cache.rb#L73-L78) ajoute `(@last_epoch_time / period).to_i` à la clé : chaque période a son propre compteur, qui expire à la fin de la période plus 1 seconde.',
			'La ligne 19 bloque quand `count > current_limit` : avec `limit: 5`, les requêtes 1 à 5 d’une fenêtre passent et la 6e reçoit `429`. L’incrément de la ligne 7 a lieu avant cette comparaison : les connexions réussies et les requêtes bloquées comptent aussi.',
			'Le compteur vit dans le cache, pas dans le processus Ruby. Le [README](' + RA + '/README.md#L315) prévient qu’un cache en mémoire est "mostly ineffective" (presque inefficace) avec plusieurs processus, car chacun garde ses propres comptes.'
		]
	},
	tradeoff: {
		gain: [
			'Une seule machine a droit à 5 tentatives de connexion par 20 secondes au plus, soit 900 par heure, avec le throttle `logins/ip`.',
			'Le throttle `logins/email` plafonne les essais sur un compte au même rythme, quel que soit le nombre d’IP de l’attaquant.',
			'Une requête bloquée reçoit `429` avant que l’appli tourne : elle ne coûte ni hachage de mot de passe ni requête en base.'
		],
		cost: [
			'Le credential stuffing envoie une requête par compte depuis beaucoup d’IP : aucun des deux compteurs n’atteint sa limite.',
			'Quiconque connaît l’email d’un utilisateur peut envoyer 6 mauvais mots de passe par fenêtre et le tenir dehors.',
			'Une fenêtre fixe repart à chaque multiple de la période : un client peut envoyer 5 requêtes à la fin d’une fenêtre et 5 de plus une seconde après.'
		]
	},
	task: {
		prompt: 'Ton appli utilise le throttle `logins/email` : `limit: 5, period: 20.seconds`.\n\nPartie 1. Un attaquant envoie 5 tentatives de connexion pour `ann@example.com` au temps Unix 1 000 019, puis 5 autres à 1 000 020. Combien atteignent l’appli, et pourquoi ?\n\nPartie 2. La semaine suivante, 50 000 IP différentes envoient chacune une connexion pour un compte différent, chaque fois avec un mot de passe fuité d’un autre site. Que voient les deux throttles, et quelles défenses tirées des sources de ce chapitre agissent sur ce trafic ?',
		hint: 'La clé contient `Time.now.to_i / period`, une division entière. Calcule-la pour les deux temps. Pour la partie 2, compte les requêtes par IP et par email.',
		answer: [
			'Partie 1 : 1 000 019 / 20 donne 50 000 et 1 000 020 / 20 donne 50 001. Les deux salves tombent dans deux fenêtres, chacune avec son compteur, et chaque compteur arrive à 5, qui ne dépasse pas la limite. Les 10 tentatives atteignent l’appli en à peu près une seconde.',
			'Partie 2 : chaque compteur par IP et chaque compteur par email est à 1, donc rien n’est bloqué. La limitation ne voit pas cette attaque.',
			'Le cheat sheet OWASP sur le credential stuffing cite d’abord l’authentification multifacteur, et liste aussi la vérification des mots de passe contre des listes de fuites comme Pwned Passwords. L’ICO a relevé l’absence de MFA obligatoire dans l’amende de 23andMe.'
		],
		steps: [
			{
				title: 'Calcule les clés de fenêtre',
				questions: [
					{ q: 'Qu’ajoute `key_and_expiry` à la clé du compteur ?', options: ['L’IP du client', '`(time / period).to_i`, le numéro de fenêtre', 'Un nonce aléatoire', 'Le temps Unix complet'], answer: 1, why: 'Chaque période a son propre compteur, nommé par la division entière du temps par la période.' },
					{ q: 'Combien donne 1 000 019 / 20 en division entière ?', options: ['50 001', '50 000,95', '50 000', '50 019'], answer: 2, why: '20 × 50 000 font 1 000 000, et 19 de plus n’atteignent pas le multiple suivant.' },
					{ q: 'Et 1 000 020 / 20 ?', options: ['50 001', '50 000', '50 002', '50 020'], answer: 0, why: '1 000 020 vaut exactement 20 × 50 001 : c’est le début d’une nouvelle fenêtre.' },
					{ q: 'Que devient le compteur au début d’une nouvelle fenêtre ?', options: ['Il garde l’ancien total', 'Il est divisé par deux', 'Il double la limite', 'Une nouvelle clé part de 0'], answer: 3, why: 'Une fenêtre fixe repart à chaque multiple de la période. L’ancienne clé expire, c’est tout.' }
				]
			},
			{
				title: 'Compte la partie 1',
				questions: [
					{ q: 'Avec `limit: 5`, quelle requête d’une fenêtre reçoit la première un `429` ?', options: ['La 5e', 'La 6e', 'La 4e', 'La 20e'], answer: 1, why: 'La ligne 19 bloque quand `count > current_limit`. Un total de 5 ne dépasse pas 5.' },
					{ q: 'La première salve de 5 tombe dans la fenêtre 50 000. Combien passent ?', options: ['4', '0', '1', '5'], answer: 3, why: 'Les totaux 1 à 5 sont tous au plus égaux à la limite.' },
					{ q: 'La seconde salve de 5 tombe dans la fenêtre 50 001. Combien passent ?', options: ['5', '0', '1', '4'], answer: 0, why: 'C’est un nouveau compteur : la seconde salve compte elle aussi de 1 à 5.' },
					{ q: 'Combien des 10 tentatives atteignent donc l’appli, et en combien de temps ?', options: ['5, en 20 secondes', '6, en 1 seconde', '10, en à peu près une seconde', '10, en 40 secondes'], answer: 2, why: 'Les deux salves chevauchent le bord d’une fenêtre : une fenêtre fixe laisse passer deux fois la limite en une seconde environ.' }
				]
			},
			{
				title: 'Lis le trafic de la partie 2',
				questions: [
					{ q: '50 000 IP envoient chacune une connexion. À combien arrive chaque compteur `logins/ip` ?', options: ['1', '5', '50 000', '6'], answer: 0, why: 'Le throttle compte par discriminant, et chaque IP n’envoie qu’une requête.' },
					{ q: 'Chaque requête vise un compte différent. À combien arrive chaque compteur `logins/email` ?', options: ['5', '50 000', '0', '1'], answer: 3, why: 'Un essai par compte : chaque compteur par email reste à 1.' },
					{ q: 'Combien de requêtes reçoivent donc un `429` ?', options: ['45 000', 'Aucune', 'Toutes après la 5e', 'La moitié'], answer: 1, why: '`count > 5` est faux pour chaque compteur. La limitation ne voit pas cette attaque.' },
					{ q: 'Comment s’appelle cette attaque ?', options: ['Le password spraying', 'La fixation de session', 'Le credential stuffing', 'Le verrouillage de compte'], answer: 2, why: 'Le credential stuffing essaie des couples identifiant et mot de passe tirés de la fuite d’un autre site, un par compte.' }
				]
			},
			{
				title: 'Choisis les défenses',
				questions: [
					{ q: 'Quelle défense le cheat sheet OWASP sur le credential stuffing cite-t-il en premier ?', options: ['L’authentification multifacteur', 'Une limite de throttle plus basse', 'Des identifiants plus longs', 'Bloquer toutes les IP étrangères'], answer: 0, why: 'Un mot de passe réutilisé ne suffit plus quand un second facteur est exigé.' },
					{ q: 'Que liste aussi l’OWASP, qui agit sur le mot de passe lui-même ?', options: ['Imposer un changement de mot de passe tous les 30 jours', 'Hasher les mots de passe deux fois', 'Cacher le formulaire de connexion', 'Vérifier les mots de passe contre des listes de fuites comme Pwned Passwords'], answer: 3, why: 'Un mot de passe déjà présent dans une liste de fuites est justement celui que cette attaque utilise.' },
					{ q: 'Qu’a relevé l’ICO comme manquant dans l’amende de 23andMe ?', options: ['Un CAPTCHA', 'Un throttle par IP', 'Une authentification multifacteur obligatoire', 'Un pare-feu applicatif'], answer: 2, why: 'L’ICO a relevé l’absence de "mandatory multi-factor authentication, secure password protocols, or unpredictable usernames" (MFA obligatoire, règles de mots de passe sûres, identifiants imprévisibles).' },
					{ q: 'Pourquoi ne pas simplement baisser `logins/email` à 1 essai par fenêtre ?', options: ['Rack::Attack ne le permet pas', 'Ça compte toujours 1 par compte, et ça permet à un attaquant de bloquer les vrais utilisateurs', 'Ça ralentirait le cache', 'Ça ne marche qu’avec `GET`'], answer: 1, why: 'Le stuffing n’envoie de toute façon qu’un essai par compte, et une limite serrée par compte laisse quiconque connaît un email en bloquer le titulaire.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un throttle a `limit: 5, period: 20`. Combien de requêtes d’une même IP atteignent l’appli dans une fenêtre de 20 secondes ?',
			options: ['4', '5', '6', '20'],
			answer: 1,
			why: '`matched_by?` renvoie vrai quand `count > current_limit`. Les comptes 1 à 5 ne dépassent pas 5 et passent. La 6e requête porte le compteur à 6 et reçoit `429`.'
		},
		{
			q: 'Une campagne de credential stuffing utilise 10 000 IP et essaie chaque couple volé une fois. Pourquoi les throttles `logins/ip` et `logins/email` ne se déclenchent-ils pas ?',
			options: [
				'Rack::Attack saute les throttles pour les requêtes qui portent un mot de passe valide',
				'Chaque IP et chaque email arrivent à un compteur de 1, sous la limite de 5',
				'L’attaquant envoie les requêtes en `GET` au lieu de `POST`',
				'Le cache efface les compteurs quand il y a plus de 1 000 clés'
			],
			answer: 1,
			why: 'Chaque throttle compte par discriminant. Avec une requête par IP et une par compte, chaque compteur reste à 1, et le test `count > 5` est faux pour tous.'
		},
		{
			q: 'Le throttle `logins/email` autorise 5 tentatives par 20 secondes. Que peut en faire un attaquant qui connaît l’email d’Ann ?',
			options: [
				'Lire le mot de passe d’Ann dans le corps de la réponse 429',
				'Tenir Ann dehors en envoyant 6 mauvais mots de passe par fenêtre',
				'Monter la limite de l’email d’Ann à 100 tentatives',
				'Réinitialiser le mot de passe d’Ann via le compteur'
			],
			answer: 1,
			why: 'Le compteur est indexé par l’email, pas par l’auteur de la requête. Dès que l’attaquant le pousse à 6, la connexion correcte d’Ann dans cette fenêtre reçoit aussi `429`.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Construis le même compteur à fenêtre fixe que Rack::Attack et regarde-le laisser passer 10 tentatives au bord d’une fenêtre, rater un trafic d’un essai par compte, et bloquer un vrai utilisateur.',
		steps: [
			'Crée un dossier : `mkdir -p ~/throttle-lab && cd ~/throttle-lab`.',
			'Écris `throttle.py` avec une fonction `allowed(name, key, now, limit=5, period=20)`. Elle compte sous la clé `name:key:now // period`, incrémente avant de comparer, et renvoie si le total est au plus égal à la limite.',
			'Rejoue la partie 1 : `python3 -c \'from throttle import allowed; print(sum(allowed("logins/email", "ann@example.com", t) for t in [1000019]*5 + [1000020]*5))\'`.',
			'Rejoue la partie 2, un essai par IP et par compte : `python3 -c \'from throttle import allowed; print(sum(allowed("logins/ip", f"10.0.{i // 256}.{i % 256}", 1000000) and allowed("logins/email", f"user{i}@example.com", 1000000) for i in range(50000)))\'`.',
			'Bloque Ann : `python3 -c \'from throttle import allowed; [allowed("logins/email", "ann@example.com", 1000000) for _ in range(6)]; print(allowed("logins/email", "ann@example.com", 1000005))\'`.'
		],
		done: [
			'La partie 1 affiche `10`.',
			'La partie 2 affiche `50000` : aucune requête n’est bloquée.',
			'Le test de blocage affiche `False` : la connexion d’Ann elle-même, 5 secondes plus tard, est refusée.'
		],
		solution: [
			'`counts = Counter()` depuis `collections`, puis dans `allowed` : `k = f"{name}:{key}:{now // period}"`, `counts[k] += 1`, `return counts[k] <= limit`.',
			'La partie 1 en laisse passer 10 car 1000019 et 1000020 tombent dans les fenêtres 50000 et 50001, chacune avec son compteur.',
			'La partie 2 les laisse toutes passer car chaque compteur reste à 1. Seuls la MFA ou un contrôle des mots de passe fuités agissent sur ce trafic.',
			'Le blocage marche car le compteur est indexé sur l’email, pas sur celui qui envoie la requête. Nettoie avec `rm -rf ~/throttle-lab`.'
		]
	},
	recall: {
		q: 'Pourquoi une limite de connexion par compte n’arrête-t-elle pas le credential stuffing, et quel risque ajoute-t-elle ?',
		a: 'Le credential stuffing essaie chaque compte une fois : un compteur par compte reste à 1. Comme le compteur est indexé par le compte et pas par l’expéditeur, n’importe qui peut le pousser au-dessus de la limite et tenir dehors le vrai utilisateur.'
	},
	sources: [
		{ title: '23andMe, Form 8-K/A du 1er décembre 2023', url: 'https://www.sec.gov/Archives/edgar/data/1804591/000119312523287449/d242666d8ka.htm' },
		{ title: 'ICO, 23andMe fined £2.31 million for failing to protect UK users’ genetic data', url: 'https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2025/06/23andme-fined-for-failing-to-protect-uk-users-genetic-data/' },
		{ title: 'Rack::Attack, configuration d’exemple', url: `${RA}/docs/example_configuration.md` },
		{ title: 'OWASP, Credential Stuffing Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html' },
		{ title: 'OWASP, Authentication Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html' }
	]
};
