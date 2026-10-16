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
		'Une requête de connexion arrive sur une appli Spring Security. Elle peut porter un nom d’utilisateur et un mot de passe, un cookie remember-me, ou un JWT. Le code qui la vérifie n’en nomme aucun. Il tient une liste d’objets qui disent chacun « je prends ce type de token » ou « pas pour moi ».',
		'Cette forme a un nom : **strategy**. Le Gang of Four a catalogué 23 formes de ce genre en 1994. Un nom permet à un relecteur de dire « fais-en une strategy » au lieu de dessiner les classes.',
		'Le jour 11 en a déjà montré un, le **decorator** : une enveloppe qui ajoute du comportement et garde l’interface. Aujourd’hui, six de plus, tous sur le chemin d’une seule connexion : strategy, factory, template method, chain of responsibility, observer et adapter.'
	],
	terms: [
		{ term: 'Strategy', def: 'Stratégie : plusieurs implémentations interchangeables d’une même interface. L’appelant en choisit une, ou les essaie l’une après l’autre, sans connaître leurs classes.' },
		{ term: 'Factory', def: 'Fabrique : une fonction ou une classe dont le rôle est de créer le bon objet, pour que les appelants demandent « l’encodeur de mots de passe par défaut » au lieu d’appeler un constructeur.' },
		{ term: 'Template method', def: 'Patron de méthode : une classe de base fixe les étapes d’un algorithme et laisse une ou plusieurs étapes abstraites. Les sous-classes remplissent les étapes, jamais l’ordre.' },
		{ term: 'Observer', def: 'Observateur : un sujet garde une liste d’abonnés et prévient chacun quand quelque chose se passe. Le sujet ne sait pas ce qu’ils en font.' },
		{ term: 'Chain of responsibility', def: 'Chaîne de responsabilité : une requête traverse une liste de handlers dans l’ordre. Chacun peut la modifier, la passer au suivant, ou l’arrêter.' },
		{ term: 'Adapter', def: 'Adaptateur : une enveloppe qui fait rentrer un objet dans une interface pour laquelle il n’a pas été écrit. Un decorator garde l’interface et ajoute du comportement ; un adapter change l’interface.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['chain["FilterChainProxy : filtres de sécurité dans l’ordre"]', 'chain -->|"doFilter, filtre suivant"| upf["UsernamePasswordAuthenticationFilter"]'],
				highlight: ['chain', 'upf'],
				note: '**Chain of responsibility.** Chaque requête traverse une liste de filtres de sécurité. Chaque filtre fait sa part, puis appelle `chain.doFilter` pour passer la requête au suivant. Un filtre qui ne l’appelle pas arrête la requête là.'
			},
			{
				add: ['pm["ProviderManager"] -->|"le premier résultat non nul gagne"| ap["AuthenticationProvider : supports, authenticate"]', 'upf --> pm', 'dao["DaoAuthenticationProvider"] -.->|implémente| ap', 'rm["RememberMeAuthenticationProvider"] -.->|implémente| ap', 'jwt["JwtAuthenticationProvider"] -.->|implémente| ap'],
				highlight: ['pm', 'ap'],
				note: '**Strategy.** `ProviderManager` boucle sur ses providers. Il saute chacun de ceux dont `supports` répond non, et garde le premier résultat qui n’est pas null. Ajouter une méthode de connexion, c’est ajouter un provider à la liste. La boucle ne change pas.'
			},
			{
				add: ['tm["AbstractUserDetailsAuthenticationProvider : étapes fixées"]', 'dao -->|"remplit retrieveUser, additionalAuthenticationChecks"| tm'],
				highlight: ['tm'],
				note: '**Template method.** La classe de base fixe l’ordre : regarder dans le cache, `retrieveUser`, pré-vérifications, `additionalAuthenticationChecks`, post-vérifications, construire le token de succès. Les deux étapes nommées sont abstraites. `DaoAuthenticationProvider` les remplit : charger l’utilisateur, comparer le mot de passe.'
			},
			{
				add: ['fac["PasswordEncoderFactories"] -->|"createDelegatingPasswordEncoder"| dpe["DelegatingPasswordEncoder : bcrypt, argon2, scrypt..."]', 'dao -->|"matches"| dpe'],
				highlight: ['fac', 'dpe'],
				note: '**Factory.** Une seule méthode statique construit l’encodeur par défaut : une map qui associe des ids comme `bcrypt` et `argon2` à des encodeurs, avec `bcrypt` pour les nouveaux hashes. L’encodeur qu’elle renvoie lit le préfixe `{id}` d’un hash stocké et choisit l’encodeur correspondant. Une strategy, choisie par les données.'
			},
			{
				add: ['pm -->|"publishAuthenticationSuccess"| obs["Listeners de AuthenticationSuccessEvent"]', 'isr["InputStreamReader : des octets en entrée, des caractères en sortie"]', 'class isr ext'],
				highlight: ['obs', 'isr'],
				note: '**Observer**, puis **adapter**. Après un succès, `ProviderManager` publie un `AuthenticationSuccessEvent`, et chaque listener le reçoit. Pour l’adapter, regarde dans le JDK : `InputStreamReader` prend un `InputStream` d’octets et le fait rentrer dans l’interface `Reader` de caractères.'
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
			'Deux étapes remplies : [`DaoAuthenticationProvider`](' + AUTH + '/dao/DaoAuthenticationProvider.java#L80-L123) implémente `additionalAuthenticationChecks` (comparer le mot de passe avec l’encodeur) et `retrieveUser` (demander au `UserDetailsService`). Il n’écrit rien sur les caches ni sur les vérifications du compte. `performPreCheck` [lance les pré-vérifications, puis `additionalAuthenticationChecks`](' + TEMPLATE + '#L182-L199).',
			'Le template est une convention, pas un verrou. `authenticate` n’est pas `final`, donc une sous-classe pourrait la redéfinir et sauter les vérifications. `DaoAuthenticationProvider` fait l’inverse et marque son `retrieveUser` comme `final`.',
			'La boucle de strategy : [`ProviderManager.authenticate`](' + AUTH + '/ProviderManager.java#L166-L190) saute les providers qui ne `supports` pas la classe du token et s’arrête au premier résultat non nul. L’appel observer : [`publishAuthenticationSuccess`](' + AUTH + '/ProviderManager.java#L239-L241), qui [publie un événement applicatif Spring](' + AUTH + '/DefaultAuthenticationEventPublisher.java#L100-L104).',
			'La chaîne tient en une méthode : [`VirtualFilterChain.doFilter`](' + REPO + '/web/src/main/java/org/springframework/security/web/FilterChainProxy.java#L375-L388) appelle le filtre suivant et se passe elle-même en paramètre. La factory : [`createDelegatingPasswordEncoder`](' + CRYPTO + '/factory/PasswordEncoderFactories.java#L72-L91). L’adapter : [`InputStreamReader`](' + JDK + '/io/InputStreamReader.java#L34-L69), « a bridge from byte streams to character streams » (un pont entre les flux d’octets et les flux de caractères).'
		]
	},
	tradeoff: {
		gain: [
			'Étendre sans modifier : une nouvelle méthode de connexion, c’est un nouveau provider, un nouvel algorithme de hash, c’est une entrée de plus dans la map des encodeurs. L’appelant ne change pas.',
			'Un vocabulaire commun. « Une chaîne de filtres, puis une boucle de strategy, puis des observers » dit en une ligne ce qui demandait un paragraphe d’explication.',
			'Un template method rend les règles difficiles à oublier : un provider construit sur la classe de base reçoit le cache et les vérifications du compte gratuitement.'
		],
		cost: [
			'Les erreurs passent à l’exécution. Un hash stocké dont l’`{id}` n’a pas d’encodeur dans la map lève `IllegalArgumentException` à la connexion, pas au démarrage.',
			'Les observers sont plus couplés qu’ils n’en ont l’air. Avec le multicaster d’événements par défaut de Spring et sans gestionnaire d’erreurs, un listener qui lève une exception [fait lever une exception à l’émetteur](' + SPRING + '/spring-context/src/main/java/org/springframework/context/event/SimpleApplicationEventMulticaster.java#L162-L175).',
			'Les patterns utilisés pour eux-mêmes ajoutent des classes avec une seule implémentation et rien à échanger. Nomme un pattern quand il y a un deuxième cas, pas avant.'
		]
	},
	task: {
		prompt: 'Ton appli Spring Security a besoin d’une nouvelle façon de se connecter : une clé d’API dans un header `X-Api-Key`. En t’appuyant sur le diagramme, dis quels patterns tu utilises, ce que tu écris, et ce à quoi tu ne dois pas toucher.',
		hint: 'Quelle pièce lit la requête, quelle pièce décide, et quelle boucle sait déjà essayer un décideur de plus ?',
		answer: [
			'Chain : un nouveau filtre, placé dans la chaîne de filtres de sécurité, qui lit le header, construit un token de clé d’API et le passe à l’`AuthenticationManager`. Ensuite, il appelle `chain.doFilter`.',
			'Strategy : un nouvel `AuthenticationProvider` dont `supports` n’accepte que la classe du token de clé d’API, et dont `authenticate` va chercher la clé. Enregistre-le avec les autres providers.',
			'Ne touche pas à `ProviderManager`. Sa boucle essaie déjà chaque provider qui prend le token, et il publie déjà l’événement de succès, donc chaque listener existant couvre aussi la nouvelle méthode.',
			'Pas de template method ici : `AbstractUserDetailsAuthenticationProvider` ne prend que les tokens nom d’utilisateur et mot de passe, donc un provider de clé implémente l’interface directement.',
			'Le risque à nommer : la recherche de la clé, c’est du nouveau code de sécurité. Reprends le soin de `DaoAuthenticationProvider`, qui atténue les attaques temporelles quand un utilisateur n’est pas trouvé, et ne logue jamais la clé.'
		]
	},
	quiz: [
		{
			q: 'Une enveloppe prend un objet qui offre une interface et le rend utilisable là où une autre interface est attendue. Quel pattern est-ce ?',
			options: ['Decorator', 'Adapter', 'Observer', 'Factory'],
			answer: 1,
			why: 'C’est le changement d’interface qui en fait un adapter. Un decorator garde la même interface et ajoute du comportement. `InputStreamReader` transforme un `InputStream` d’octets en `Reader` de caractères.'
		},
		{
			q: 'Un hash de mot de passe stocké commence par `{md4x}`, et aucun encodeur n’est associé à cet id. Que se passe-t-il quand l’utilisateur se connecte ?',
			options: ['Le hash est migré vers bcrypt à la première connexion de l’utilisateur', 'L’appli refuse de démarrer tant qu’un hash stocké a un id inconnu', 'L’encodeur se rabat sur son id par défaut, bcrypt, et la connexion marche', '`DelegatingPasswordEncoder` lève `IllegalArgumentException` à la connexion'],
			answer: 3,
			why: 'L’encodeur délégant choisit une strategy d’après le préfixe `{id}`. Un id inconnu part vers son encodeur « non associé », qui lève une exception. Choisir la strategy à l’exécution déplace cette erreur à l’exécution.'
		},
		{
			q: 'Une appli Spring Security a besoin d’une nouvelle méthode de connexion. Avec le design en strategy de `ProviderManager`, qu’est-ce qui doit changer ?',
			options: ['Un nouvel `AuthenticationProvider`, enregistré avec les autres', '`ProviderManager.authenticate`, pour y ajouter un cas pour la nouvelle méthode', 'Chaque controller qui a besoin d’un utilisateur, pour appeler la nouvelle méthode', '`DaoAuthenticationProvider`, pour qu’il vérifie aussi les nouveaux identifiants'],
			answer: 0,
			why: '`ProviderManager` boucle sur les providers qu’il tient, quels qu’ils soient, et garde le premier résultat. Il ne nomme jamais un provider, donc il reste fermé pendant que la liste grandit.'
		}
	],
	takeaway: 'Apprends les patterns comme des noms pour des formes que tu croiseras dans le code, et sors-en un quand un deuxième cas apparaît, pas avant.',
	sources: [
		{ title: 'Gamma, Helm, Johnson & Vlissides, Design Patterns: Elements of Reusable Object-Oriented Software', url: 'https://www.oreilly.com/library/view/design-patterns-elements/0201633612/' },
		{ title: 'Refactoring Guru, History of patterns', url: 'https://refactoring.guru/design-patterns/history' },
		{ title: 'Spring Security reference, Servlet architecture', url: 'https://docs.spring.io/spring-security/reference/servlet/architecture.html' },
		{ title: 'Spring Security, AbstractUserDetailsAuthenticationProvider.java', url: `${TEMPLATE}#L134-L180` },
		{ title: 'Spring Security, ProviderManager.java', url: `${AUTH}/ProviderManager.java#L166-L190` }
	]
};
