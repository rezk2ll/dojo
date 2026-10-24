const REPO = 'https://github.com/spring-projects/spring-security/blob/9b4223b5ccf7a03c910ebc577f32a8245ec7941f';
const AUTH = `${REPO}/core/src/main/java/org/springframework/security/authentication`;
const TEMPLATE = `${AUTH}/dao/AbstractUserDetailsAuthenticationProvider.java`;
const CRYPTO = `${REPO}/crypto/src/main/java/org/springframework/security/crypto`;
const JDK = 'https://github.com/openjdk/jdk/blob/d0287a5e875e74cb90713beaa45672326807e2d1/src/java.base/share/classes/java';
const SPRING = 'https://github.com/spring-projects/spring-framework/blob/49adc91c7e41eaafb52fc11e1210989894bda1f3';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'design-patterns',
	part: 'La boîte à patterns',
	title: 'Design patterns : des formes nommées que tu utilises déjà',
	minutes: 10,
	hook: [
		'Une requête de connexion arrive sur une appli Spring Security. Elle peut porter un nom d’utilisateur et un mot de passe, un cookie remember-me, ou un JWT. Le code qui la vérifie n’en nomme aucun : il tient une liste d’objets qui disent chacun « je prends ce type de token » ou « pas pour moi ».',
		'Le Gang of Four appelle cette forme une **strategy**, l’une des 23 formes qu’il a cataloguées en 1994. Avec ce nom, un relecteur peut écrire « fais-en une strategy » au lieu de dessiner les classes.',
		'Le jour 11 a montré le decorator : une enveloppe qui ajoute du comportement et garde l’interface. Six autres patterns se trouvent sur le chemin d’une seule connexion : strategy, factory, template method, chain of responsibility, observer et adapter.'
	],
	terms: [
		{ term: 'Strategy', def: 'Stratégie : plusieurs implémentations interchangeables d’une même interface. L’appelant en choisit une, ou les essaie l’une après l’autre, sans connaître leurs classes.' },
		{ term: 'Template method', def: 'Patron de méthode : une classe de base fixe les étapes d’un algorithme et laisse une ou plusieurs étapes abstraites. Les sous-classes remplissent les étapes, jamais l’ordre.' },
		{ term: 'Chain of responsibility', def: 'Chaîne de responsabilité : une requête traverse une liste de handlers dans l’ordre. Chacun peut la modifier, la passer au suivant, ou l’arrêter.' },
		{ term: 'Adapter', def: 'Adaptateur : une enveloppe qui fait rentrer un objet dans une interface pour laquelle il n’a pas été écrit. Un decorator garde l’interface et ajoute du comportement ; un adapter change l’interface.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['chain["FilterChainProxy : filtres de sécurité dans l’ordre"]', 'chain -->|"doFilter, filtre suivant"| upf["UsernamePasswordAuthenticationFilter"]'],
				highlight: ['chain', 'upf'],
				note: 'Les filtres de sécurité forment une chain of responsibility. Chaque filtre fait sa part, puis appelle `chain.doFilter` pour passer la requête au suivant. Un filtre qui ne l’appelle pas arrête la requête là.'
			},
			{
				add: ['pm["ProviderManager"] -->|"le premier résultat non nul gagne"| ap["AuthenticationProvider : supports, authenticate"]', 'upf --> pm', 'dao["DaoAuthenticationProvider"] -.->|implémente| ap', 'rm["RememberMeAuthenticationProvider"] -.->|implémente| ap', 'jwt["JwtAuthenticationProvider"] -.->|implémente| ap'],
				highlight: ['pm', 'ap'],
				note: 'Chaque `AuthenticationProvider` est une strategy. `ProviderManager` boucle sur ses providers, saute ceux dont `supports` répond non, et garde le premier résultat qui n’est pas null. Pour une nouvelle méthode de connexion, tu ajoutes un provider à la liste, et le code de la boucle ne bouge pas.'
			},
			{
				add: ['tm["AbstractUserDetailsAuthenticationProvider : étapes fixées"]', 'dao -->|"remplit retrieveUser, additionalAuthenticationChecks"| tm'],
				highlight: ['tm'],
				note: '`AbstractUserDetailsAuthenticationProvider` utilise un template method. Son `authenticate` fixe l’ordre : regarder dans le cache, `retrieveUser`, pré-vérifications, `additionalAuthenticationChecks`, post-vérifications, construire le token de succès. `retrieveUser` et `additionalAuthenticationChecks` sont abstraites, et `DaoAuthenticationProvider` les remplit : charger l’utilisateur, comparer le mot de passe.'
			},
			{
				add: ['fac["PasswordEncoderFactories"] -->|"createDelegatingPasswordEncoder"| dpe["DelegatingPasswordEncoder : bcrypt, argon2, scrypt..."]', 'dao -->|"matches"| dpe'],
				highlight: ['fac', 'dpe'],
				note: '`PasswordEncoderFactories` est une factory : une seule méthode statique construit l’encodeur par défaut, et les appelants n’appellent jamais son constructeur. L’encodeur tient une map qui associe des ids comme `bcrypt` et `argon2` à des encodeurs, avec `bcrypt` pour les nouveaux hashes. Il lit le préfixe `{id}` d’un hash stocké et prend l’encodeur correspondant : c’est la donnée stockée qui choisit la strategy.'
			},
			{
				add: ['pm -->|"publishAuthenticationSuccess"| obs["Listeners de AuthenticationSuccessEvent"]', 'isr["InputStreamReader : des octets en entrée, des caractères en sortie"]', 'class isr ext'],
				highlight: ['obs', 'isr'],
				note: 'Après un succès, `ProviderManager` publie un `AuthenticationSuccessEvent`, et chaque listener le reçoit sans que `ProviderManager` le connaisse : c’est l’observer. L’adapter se trouve dans le JDK : `InputStreamReader` prend un `InputStream` d’octets et le fait rentrer dans l’interface `Reader` de caractères.'
			}
		]
	},
	example: {
		title: 'AbstractUserDetailsAuthenticationProvider.java : l’ordre est fixé',
		repo: 'spring-projects/spring-security',
		url: `${TEMPLATE}#L134-L180`,
		lang: 'java',
		code: `	@Override
	public Authentication authenticate(Authentication authentication) throws AuthenticationException {
		…
		String username = determineUsername(authentication);
		boolean cacheWasUsed = true;
		UserDetails user = this.userCache.getUserFromCache(username);
		if (user == null) {
			cacheWasUsed = false;
			try {
				user = retrieveUser(username, (UsernamePasswordAuthenticationToken) authentication);
			}
			…
		}
		try {
			performPreCheck(user, (UsernamePasswordAuthenticationToken) authentication);
		}
		…
		this.postAuthenticationChecks.check(user);
		if (!cacheWasUsed) {
			this.userCache.putUserInCache(user);
		}
		…
		return createSuccessAuthentication(principalToReturn, authentication, user);
	}`,
		notes: [
			'La ligne 10 appelle `retrieveUser`, et la ligne 15 appelle `performPreCheck`, qui lance les pré-vérifications puis `additionalAuthenticationChecks`. [`DaoAuthenticationProvider`](' + AUTH + '/dao/DaoAuthenticationProvider.java#L80-L123) implémente ces deux étapes : demander au `UserDetailsService`, comparer le mot de passe avec l’encodeur. Il n’écrit rien sur les caches (lignes 6 et 20) ni sur les vérifications du compte.',
			'La ligne 2 déclare `authenticate` sans `final` : une sous-classe pourrait la redéfinir et sauter les vérifications. `DaoAuthenticationProvider`, lui, marque son propre `retrieveUser` comme `final`.',
			'La boucle de strategy se trouve dans `ProviderManager.authenticate` : elle saute les providers qui ne `supports` pas la classe du token et s’arrête au premier résultat non nul. L’appel observer, c’est [`publishAuthenticationSuccess`](' + AUTH + '/ProviderManager.java#L239-L241), qui publie un événement applicatif Spring.',
			'La chaîne tient en une méthode : [`VirtualFilterChain.doFilter`](' + REPO + '/web/src/main/java/org/springframework/security/web/FilterChainProxy.java#L375-L388) appelle le filtre suivant et se passe elle-même en paramètre. La factory, c’est `createDelegatingPasswordEncoder`. La Javadoc d’`InputStreamReader` le décrit comme « a bridge from byte streams to character streams » (un pont entre les flux d’octets et les flux de caractères).'
		]
	},
	tradeoff: {
		gain: [
			'Une nouvelle méthode de connexion, c’est un nouveau provider, et un nouvel algorithme de hash, une entrée de plus dans la map des encodeurs. `ProviderManager` et ses appelants ne changent pas.',
			'« Une chaîne de filtres, puis une boucle de strategy, puis des observers » décrit ce chemin de connexion en une ligne.',
			'Un provider construit sur `AbstractUserDetailsAuthenticationProvider` reçoit le cache et les vérifications du compte sans les écrire.'
		],
		cost: [
			'Un hash stocké dont l’`{id}` n’a pas d’encodeur dans la map lève `IllegalArgumentException` à la connexion. Rien ne vérifie les ids au démarrage.',
			'Avec le multicaster d’événements par défaut de Spring et sans gestionnaire d’erreurs, un listener qui lève une exception [fait lever une exception à l’émetteur](' + SPRING + '/spring-context/src/main/java/org/springframework/context/event/SimpleApplicationEventMulticaster.java#L162-L175). Un observer peut donc casser le code qui publie.',
			'Une interface avec une seule implémentation ajoute une classe et ne donne rien à échanger à l’appelant.'
		]
	},
	task: {
		prompt: 'Ton appli Spring Security a besoin d’une nouvelle façon de se connecter : une clé d’API dans un header `X-Api-Key`. En t’appuyant sur le diagramme, dis quels patterns tu utilises, ce que tu écris, et ce à quoi tu ne dois pas toucher.',
		hint: 'Quelle pièce lit la requête, quelle pièce décide, et quelle boucle sait déjà essayer un décideur de plus ?',
		answer: [
			'Chain : un nouveau filtre, placé dans la chaîne de filtres de sécurité, qui lit le header, construit un token de clé d’API et le passe à l’`AuthenticationManager`. Ensuite, il appelle `chain.doFilter`.',
			'Strategy : un nouvel `AuthenticationProvider` dont `supports` n’accepte que la classe du token de clé d’API, et dont `authenticate` va chercher la clé. Tu l’enregistres avec les autres providers.',
			'Laisse `ProviderManager` tel quel. Sa boucle essaie déjà chaque provider qui prend le token, et il publie déjà l’événement de succès, donc chaque listener existant couvre aussi la nouvelle méthode.',
			'Pas de template method ici : `AbstractUserDetailsAuthenticationProvider` ne prend que les tokens nom d’utilisateur et mot de passe, donc un provider de clé implémente l’interface directement.',
			'Le risque à nommer : la recherche de la clé, c’est du nouveau code de sécurité. Reprends le soin de `DaoAuthenticationProvider`, qui atténue les attaques temporelles quand un utilisateur n’est pas trouvé, et ne logue jamais la clé.'
		],
		steps: [
			{
				title: 'Trouve ce qui lit la requête',
				questions: [
					{ q: 'Quelle pièce lit le header `X-Api-Key` ?', options: ['Un nouvel `AuthenticationProvider`', '`ProviderManager`', 'Un nouveau filtre dans la chaîne de filtres de sécurité', 'Un listener de `AuthenticationSuccessEvent`'], answer: 2, why: 'Les filtres sont les pièces qui voient la requête HTTP. Les providers ne voient qu’un token.' },
					{ q: 'Quel pattern suivent les filtres de sécurité ?', options: ['Strategy', 'Chain of responsibility', 'Observer', 'Adapter'], answer: 1, why: 'Chaque filtre fait sa part, puis passe la requête au suivant, ou l’arrête.' },
					{ q: 'Le filtre a construit un token de clé d’API. À qui le passe-t-il ?', options: ['À l’`AuthenticationManager`', 'Au `UserDetailsService`', 'Seulement au filtre suivant', 'À `PasswordEncoderFactories`'], answer: 0, why: 'Le filtre lit, le manager décide. Vérifier la clé n’est pas le travail du filtre.' },
					{ q: 'Qu’est-ce que le filtre doit appeler à la fin pour que la requête continue ?', options: ['`publishAuthenticationSuccess`', '`retrieveUser`', '`supports`', '`chain.doFilter`'], answer: 3, why: 'Un filtre qui n’appelle pas `chain.doFilter` arrête la requête là.' }
				]
			},
			{
				title: 'Trouve ce qui décide',
				questions: [
					{ q: 'Quelle pièce décide si la clé est valide ?', options: ['Le nouveau filtre', 'Un nouvel `AuthenticationProvider`', '`FilterChainProxy`', '`DelegatingPasswordEncoder`'], answer: 1, why: 'Le `authenticate` d’un provider va chercher la clé et renvoie un résultat ou échoue.' },
					{ q: 'Qu’accepte le `supports` du nouveau provider ?', options: ['Toutes les classes de token', 'Seulement les tokens nom d’utilisateur et mot de passe', 'Seulement la classe du token de clé d’API', 'Seulement les JWT'], answer: 2, why: 'Dire « pas pour moi » à tous les autres tokens le tient à l’écart des autres méthodes de connexion.' },
					{ q: 'Quel pattern est chaque `AuthenticationProvider` ?', options: ['Template method', 'Factory', 'Chain of responsibility', 'Strategy'], answer: 3, why: 'Des implémentations interchangeables d’une même interface, essayées l’une après l’autre par un appelant qui ne nomme jamais leurs classes.' },
					{ q: 'Comment le nouveau provider rejoint-il les autres ?', options: ['Tu l’enregistres avec les autres providers', 'Tu ajoutes un `if` pour les clés d’API dans `ProviderManager`', 'Tu crées une sous-classe de `ProviderManager`', 'Tu remplaces `DaoAuthenticationProvider`'], answer: 0, why: 'Une nouvelle méthode de connexion, c’est un nouveau provider dans la liste.' }
				]
			},
			{
				title: 'Dis ce que tu laisses tel quel',
				questions: [
					{ q: 'Est-ce que tu modifies `ProviderManager` ?', options: ['Oui : tu ajoutes une branche pour les clés d’API', 'Non : sa boucle essaie déjà chaque provider qui prend le token', 'Oui : tu le places devant les filtres', 'Non, mais tu le copies dans un nouveau manager'], answer: 1, why: 'La boucle de strategy est la raison pour laquelle le nouveau provider ne demande aucun changement ailleurs.' },
					{ q: 'Comment `ProviderManager` choisit-il un résultat ?', options: ['Il saute les providers dont `supports` dit non et garde le premier résultat non nul', 'Il interroge tous les providers et garde le dernier résultat', 'Il choisit un provider au hasard', 'Il n’appelle que le premier provider de la liste'], answer: 0, why: 'Il s’arrête au premier résultat qui n’est pas nul.' },
					{ q: 'Un listener écrit une ligne d’audit à chaque connexion réussie. Faut-il le modifier pour les clés d’API ?', options: ['Oui : il ne connaît que les mots de passe', 'Oui : il faut l’enregistrer sur le nouveau filtre', 'Non : `ProviderManager` publie déjà l’événement de succès pour chaque provider', 'Seulement si la clé est un JWT'], answer: 2, why: 'L’événement vient de `ProviderManager`, pas d’un provider : la nouvelle méthode est couverte gratuitement.' },
					{ q: 'Quel pattern permet à ce listener de marcher sans que `ProviderManager` le connaisse ?', options: ['Adapter', 'Observer', 'Decorator', 'Template method'], answer: 1, why: 'Chaque listener reçoit l’événement, et celui qui le publie ne sait pas qui ils sont.' }
				]
			},
			{
				title: 'Vérifie ce qui ne colle pas',
				questions: [
					{ q: 'Pourquoi ne pas étendre `AbstractUserDetailsAuthenticationProvider` ?', options: ['La classe est `final`', 'Elle ne prend que les tokens nom d’utilisateur et mot de passe', 'Elle n’a pas de méthode `authenticate`', 'Elle ne marche qu’avec les JWT'], answer: 1, why: 'Ses étapes fixes chargent un utilisateur et vérifient un mot de passe. Un token de clé d’API ne passe pas par là.' },
					{ q: 'Alors comment écris-tu le provider de clé ?', options: ['Tu étends `DaoAuthenticationProvider`', 'Tu enveloppes un `InputStreamReader`', 'Tu implémentes `AuthenticationProvider` directement', 'Tu redéfinis `ProviderManager.authenticate`'], answer: 2, why: 'Aucun template method ne convient, donc tu implémentes l’interface toi-même.' },
					{ q: 'Quel est le risque à nommer ?', options: ['La recherche de la clé, c’est du nouveau code de sécurité', '`ProviderManager` ralentit avec un provider de plus', 'La chaîne de filtres devient trop longue', 'Les listeners peuvent rater l’événement'], answer: 0, why: 'Du nouveau code qui décide qui entre mérite le plus de soin dans ce changement.' },
					{ q: 'Quel soin reprends-tu de `DaoAuthenticationProvider` ?', options: ['Mettre chaque clé en cache pour toujours', 'Stocker les clés avec un préfixe `{bcrypt}`', 'Sauter les pré-vérifications pour aller plus vite', 'Atténuer les attaques temporelles en cas d’échec, et ne jamais loguer la clé'], answer: 3, why: '`DaoAuthenticationProvider` atténue les attaques temporelles quand un utilisateur n’est pas trouvé. Une clé dans un log est une clé qui a fuité.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Une enveloppe prend un objet qui offre une interface et le rend utilisable là où une autre interface est attendue. Quel pattern est-ce ?',
			options: ['Decorator', 'Adapter', 'Observer', 'Factory'],
			answer: 1,
			why: 'Un adapter change l’interface, et un decorator garde la même interface en ajoutant du comportement. `InputStreamReader` transforme un `InputStream` d’octets en `Reader` de caractères.'
		},
		{
			q: 'Un hash de mot de passe stocké commence par `{md4x}`, et aucun encodeur n’est associé à cet id. Que se passe-t-il quand l’utilisateur se connecte ?',
			options: ['Le hash est migré vers bcrypt à la première connexion de l’utilisateur', 'L’appli refuse de démarrer tant qu’un hash stocké a un id inconnu', 'L’encodeur se rabat sur son id par défaut, bcrypt, et la connexion marche', '`DelegatingPasswordEncoder` lève `IllegalArgumentException` à la connexion'],
			answer: 3,
			why: 'L’encodeur délégant choisit une strategy d’après le préfixe `{id}`. Un id inconnu part vers son encodeur « non associé », qui lève une exception. La strategy se choisit à la connexion, donc l’erreur apparaît à la connexion.'
		},
		{
			q: 'Une appli Spring Security a besoin d’une nouvelle méthode de connexion. Avec le design en strategy de `ProviderManager`, qu’est-ce qui doit changer ?',
			options: ['Un nouvel `AuthenticationProvider`, enregistré avec les autres', '`ProviderManager.authenticate`, pour y ajouter un cas pour la nouvelle méthode', 'Chaque controller qui a besoin d’un utilisateur, pour appeler la nouvelle méthode', '`DaoAuthenticationProvider`, pour qu’il vérifie aussi les nouveaux identifiants'],
			answer: 0,
			why: '`ProviderManager` boucle sur les providers qu’il tient, quels qu’ils soient, et garde le premier résultat. Il ne nomme jamais un provider, donc son code ne change pas quand la liste s’allonge.'
		}
	],
	recall: {
		q: 'Comment le `ProviderManager` de Spring Security choisit-il le provider d’une connexion, et qu’écris-tu pour ajouter une méthode de connexion ?',
		a: 'Il boucle sur ses providers, saute ceux dont `supports` refuse la classe du token, et garde le premier résultat non nul. Pour une nouvelle méthode, tu écris un nouvel `AuthenticationProvider` et tu l’enregistres dans cette liste : `ProviderManager` ne change pas.'
	},
	sources: [
		{ title: 'Gamma, Helm, Johnson & Vlissides, Design Patterns: Elements of Reusable Object-Oriented Software', url: 'https://www.oreilly.com/library/view/design-patterns-elements/0201633612/' },
		{ title: 'Refactoring Guru, History of patterns', url: 'https://refactoring.guru/design-patterns/history' },
		{ title: 'Spring Security reference, Servlet architecture', url: 'https://docs.spring.io/spring-security/reference/servlet/architecture.html' },
		{ title: 'Spring Security, AbstractUserDetailsAuthenticationProvider.java', url: `${TEMPLATE}#L134-L180` },
		{ title: 'Spring Security, AbstractUserDetailsAuthenticationProvider.java : performPreCheck', url: `${TEMPLATE}#L182-L199` },
		{ title: 'Spring Security, ProviderManager.java', url: `${AUTH}/ProviderManager.java#L166-L190` },
		{ title: 'Spring Security, DefaultAuthenticationEventPublisher.java', url: `${AUTH}/DefaultAuthenticationEventPublisher.java#L100-L104` },
		{ title: 'Spring Security, PasswordEncoderFactories.java', url: `${CRYPTO}/factory/PasswordEncoderFactories.java#L72-L91` },
		{ title: 'OpenJDK, InputStreamReader.java', url: `${JDK}/io/InputStreamReader.java#L34-L69` }
	]
};
