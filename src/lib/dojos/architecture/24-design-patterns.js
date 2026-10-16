const REPO = 'https://github.com/spring-projects/spring-security/blob/9b4223b5ccf7a03c910ebc577f32a8245ec7941f';
const AUTH = `${REPO}/core/src/main/java/org/springframework/security/authentication`;
const TEMPLATE = `${AUTH}/dao/AbstractUserDetailsAuthenticationProvider.java`;
const CRYPTO = `${REPO}/crypto/src/main/java/org/springframework/security/crypto`;
const JDK = 'https://github.com/openjdk/jdk/blob/d0287a5e875e74cb90713beaa45672326807e2d1/src/java.base/share/classes/java';
const SPRING = 'https://github.com/spring-projects/spring-framework/blob/49adc91c7e41eaafb52fc11e1210989894bda1f3';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'design-patterns',
	part: 'The pattern toolbox',
	title: 'Design patterns: named shapes you already use',
	minutes: 10,
	hook: [
		'A login request reaches a Spring Security app. It may carry a username and password, a remember-me cookie, or a JWT. The code that checks it never names any of them. It holds a list of objects that each say "I support this kind of token" or "not mine".',
		'That shape has a name: **strategy**. The Gang of Four catalogued 23 such shapes in 1994. A name lets a reviewer say "make it a strategy" instead of drawing the classes.',
		'Day 11 already showed one, the **decorator**: a wrapper that adds behavior and keeps the interface. Today, six more, all on the path of one login: strategy, factory, template method, chain of responsibility, observer and adapter.'
	],
	terms: [
		{ term: 'Strategy', def: 'Several interchangeable implementations of one interface. The caller picks one, or tries them in turn, without knowing their classes.' },
		{ term: 'Factory', def: 'A function or class whose job is to create the right object, so callers ask for "the default password encoder" instead of calling a constructor.' },
		{ term: 'Template method', def: 'A base class fixes the steps of an algorithm and leaves one or more steps abstract. Subclasses fill in the steps, never the order.' },
		{ term: 'Observer', def: 'A subject keeps a list of subscribers and tells each one when something happens. The subject does not know what they do with it.' },
		{ term: 'Chain of responsibility', def: 'A request passes through a list of handlers in order. Each may change it, pass it on, or stop it.' },
		{ term: 'Adapter', def: 'A wrapper that makes an object fit an interface it was not written for. A decorator keeps the interface and adds behavior; an adapter changes the interface.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['chain["FilterChainProxy: security filters in order"]', 'chain -->|"doFilter, next filter"| upf["UsernamePasswordAuthenticationFilter"]'],
				highlight: ['chain', 'upf'],
				note: '**Chain of responsibility.** Each request goes through a list of security filters. Each filter does its part, then calls `chain.doFilter` to pass the request on. A filter that does not call it stops the request there.'
			},
			{
				add: ['pm["ProviderManager"] -->|"first non-null result wins"| ap["AuthenticationProvider: supports, authenticate"]', 'upf --> pm', 'dao["DaoAuthenticationProvider"] -.->|implements| ap', 'rm["RememberMeAuthenticationProvider"] -.->|implements| ap', 'jwt["JwtAuthenticationProvider"] -.->|implements| ap'],
				highlight: ['pm', 'ap'],
				note: '**Strategy.** `ProviderManager` loops over its providers. It skips each one whose `supports` says no, and keeps the first result that is not null. Adding a login method means a new provider in the list. The loop stays the same.'
			},
			{
				add: ['tm["AbstractUserDetailsAuthenticationProvider: fixed steps"]', 'dao -->|"fills retrieveUser, additionalAuthenticationChecks"| tm'],
				highlight: ['tm'],
				note: '**Template method.** The base class fixes the order: look in the cache, `retrieveUser`, pre-checks, `additionalAuthenticationChecks`, post-checks, build the success token. The two named steps are abstract. `DaoAuthenticationProvider` fills them: load the user, compare the password.'
			},
			{
				add: ['fac["PasswordEncoderFactories"] -->|"createDelegatingPasswordEncoder"| dpe["DelegatingPasswordEncoder: bcrypt, argon2, scrypt..."]', 'dao -->|"matches"| dpe'],
				highlight: ['fac', 'dpe'],
				note: '**Factory.** One static method builds the default encoder: a map from ids like `bcrypt` and `argon2` to encoders, with `bcrypt` for new hashes. The encoder it returns reads the `{id}` prefix of a stored hash and picks the matching encoder. A strategy, picked by data.'
			},
			{
				add: ['pm -->|"publishAuthenticationSuccess"| obs["Listeners of AuthenticationSuccessEvent"]', 'isr["InputStreamReader: bytes in, chars out"]', 'class isr ext'],
				highlight: ['obs', 'isr'],
				note: '**Observer**, then **adapter**. After a success, `ProviderManager` publishes an `AuthenticationSuccessEvent`, and every listener hears it. For the adapter, look in the JDK: `InputStreamReader` takes an `InputStream` of bytes and fits it to the `Reader` interface of characters.'
			}
		]
	},
	example: {
		title: 'AbstractUserDetailsAuthenticationProvider.java: the order is fixed',
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
			'Two steps filled in: [`DaoAuthenticationProvider`](' + AUTH + '/dao/DaoAuthenticationProvider.java#L80-L123) implements `additionalAuthenticationChecks` (compare the password with the encoder) and `retrieveUser` (ask the `UserDetailsService`). It writes nothing about caches or account checks. `performPreCheck` [runs the pre-checks, then `additionalAuthenticationChecks`](' + TEMPLATE + '#L182-L199).',
			'The template is a convention, not a lock. `authenticate` is not `final`, so a subclass could override it and skip the checks. `DaoAuthenticationProvider` goes the other way and marks its `retrieveUser` as `final`.',
			'The strategy loop: [`ProviderManager.authenticate`](' + AUTH + '/ProviderManager.java#L166-L190) skips providers that do not `supports` the token class and breaks on the first non-null result. The observer call: [`publishAuthenticationSuccess`](' + AUTH + '/ProviderManager.java#L239-L241), which [publishes a Spring application event](' + AUTH + '/DefaultAuthenticationEventPublisher.java#L100-L104).',
			'The chain is one method: [`VirtualFilterChain.doFilter`](' + REPO + '/web/src/main/java/org/springframework/security/web/FilterChainProxy.java#L375-L388) calls the next filter and passes itself along. The factory: [`createDelegatingPasswordEncoder`](' + CRYPTO + '/factory/PasswordEncoderFactories.java#L72-L91). The adapter: [`InputStreamReader`](' + JDK + '/io/InputStreamReader.java#L34-L69), "a bridge from byte streams to character streams".'
		]
	},
	tradeoff: {
		gain: [
			'Extension without editing: a new login method is a new provider, a new hash algorithm is one more entry in the encoder map. The caller stays the same.',
			'A shared vocabulary. "A chain of filters, then a strategy loop, then observers" says in one line what took a paragraph to explain.',
			'A template method makes the rules hard to forget: a provider built on the base class gets the cache and the account checks for free.'
		],
		cost: [
			'Errors move to run time. A stored hash whose `{id}` has no encoder in the map throws `IllegalArgumentException` at login, not at startup.',
			'Observers are coupled more than they look. With Spring\'s default event multicaster and no error handler, a listener that throws [makes the publisher throw](' + SPRING + '/spring-context/src/main/java/org/springframework/context/event/SimpleApplicationEventMulticaster.java#L162-L175).',
			'Patterns used for their own sake add classes with one implementation and nothing to swap. Name a pattern when there is a second case, not before.'
		]
	},
	task: {
		prompt: 'Your Spring Security app needs a new way to log in: an API key in an `X-Api-Key` header. Using the diagram, say which patterns you use, what you write, and what you must not touch.',
		hint: 'Which piece reads the request, which piece decides, and which loop already knows how to try one more decider?',
		answer: [
			'Chain: a new filter, placed in the security filter chain, that reads the header, builds an API key token and hands it to the `AuthenticationManager`. Then it calls `chain.doFilter`.',
			'Strategy: a new `AuthenticationProvider` whose `supports` accepts only the API key token class, and whose `authenticate` looks the key up. Register it with the other providers.',
			'Do not touch `ProviderManager`. Its loop already tries every provider that supports the token, and it already publishes the success event, so every existing listener covers the new method too.',
			'No template method here: `AbstractUserDetailsAuthenticationProvider` only supports username and password tokens, so a key provider implements the interface directly.',
			'Risk to name: the key lookup is new security code. Copy the care of `DaoAuthenticationProvider`, which mitigates timing attacks when a user is not found, and never log the key.'
		]
	},
	quiz: [
		{
			q: 'A wrapper takes an object that offers one interface and makes it usable where a different interface is expected. Which pattern is that?',
			options: ['Decorator', 'Adapter', 'Observer', 'Factory'],
			answer: 1,
			why: 'Changing the interface is what makes it an adapter. A decorator keeps the same interface and adds behavior. `InputStreamReader` turns a byte `InputStream` into a character `Reader`.'
		},
		{
			q: 'A stored password hash starts with `{md4x}`, and no encoder is mapped to that id. What happens when the user logs in?',
			options: ['The hash is upgraded to bcrypt', 'The app refuses to start', 'The encoder falls back to bcrypt and the login works', '`DelegatingPasswordEncoder` throws `IllegalArgumentException` at login'],
			answer: 3,
			why: 'The delegating encoder picks a strategy by the `{id}` prefix. An unknown id goes to its unmapped encoder, which throws. Picking the strategy at run time moves this error to run time.'
		},
		{
			q: 'A Spring Security app needs a new login method. With `ProviderManager`\'s strategy design, what has to change?',
			options: ['A new `AuthenticationProvider`, registered with the others', '`ProviderManager.authenticate`', 'Every controller that needs a user', '`DaoAuthenticationProvider`'],
			answer: 0,
			why: '`ProviderManager` loops over whatever providers it holds and keeps the first result. It never names a provider, so it stays closed while the list grows.'
		}
	],
	takeaway: 'Learn the patterns as names for shapes you will meet in code, and reach for one when a second case shows up, not before.',
	sources: [
		{ title: 'Gamma, Helm, Johnson & Vlissides, Design Patterns: Elements of Reusable Object-Oriented Software', url: 'https://www.oreilly.com/library/view/design-patterns-elements/0201633612/' },
		{ title: 'Refactoring Guru, History of patterns', url: 'https://refactoring.guru/design-patterns/history' },
		{ title: 'Spring Security reference, Servlet architecture', url: 'https://docs.spring.io/spring-security/reference/servlet/architecture.html' },
		{ title: 'Spring Security, AbstractUserDetailsAuthenticationProvider.java', url: `${TEMPLATE}#L134-L180` },
		{ title: 'Spring Security, ProviderManager.java', url: `${AUTH}/ProviderManager.java#L166-L190` }
	]
};
