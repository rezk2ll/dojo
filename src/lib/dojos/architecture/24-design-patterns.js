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
		'A login request reaches a Spring Security app. It may carry a username and password, a remember-me cookie, or a JWT. The code that checks it never names any of them: it holds a list of objects that each say "I support this kind of token" or "not mine".',
		'The Gang of Four call that shape a **strategy**, one of the 23 shapes they catalogued in 1994. With the name, a reviewer can write "make it a strategy" instead of drawing the classes.',
		'Day 11 showed the decorator: a wrapper that adds behavior and keeps the interface. Six more patterns sit on the path of one login: strategy, factory, template method, chain of responsibility, observer and adapter.'
	],
	terms: [
		{ term: 'Strategy', def: 'Several interchangeable implementations of one interface. The caller picks one, or tries them in turn, without knowing their classes.' },
		{ term: 'Template method', def: 'A base class fixes the steps of an algorithm and leaves one or more steps abstract. Subclasses fill in the steps, never the order.' },
		{ term: 'Chain of responsibility', def: 'A request passes through a list of handlers in order. Each may change it, pass it on, or stop it.' },
		{ term: 'Adapter', def: 'A wrapper that makes an object fit an interface it was not written for. A decorator keeps the interface and adds behavior; an adapter changes the interface.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['chain["FilterChainProxy: security filters in order"]', 'chain -->|"doFilter, next filter"| upf["UsernamePasswordAuthenticationFilter"]'],
				highlight: ['chain', 'upf'],
				note: 'The security filters form a chain of responsibility. Each filter does its part, then calls `chain.doFilter` to pass the request on. A filter that does not call it stops the request there.'
			},
			{
				add: ['pm["ProviderManager"] -->|"first non-null result wins"| ap["AuthenticationProvider: supports, authenticate"]', 'upf --> pm', 'dao["DaoAuthenticationProvider"] -.->|implements| ap', 'rm["RememberMeAuthenticationProvider"] -.->|implements| ap', 'jwt["JwtAuthenticationProvider"] -.->|implements| ap'],
				highlight: ['pm', 'ap'],
				note: 'Each `AuthenticationProvider` is a strategy. `ProviderManager` loops over its providers, skips each one whose `supports` says no, and keeps the first result that is not null. A new login method is a new provider in the list, and the loop code does not change.'
			},
			{
				add: ['tm["AbstractUserDetailsAuthenticationProvider: fixed steps"]', 'dao -->|"fills retrieveUser, additionalAuthenticationChecks"| tm'],
				highlight: ['tm'],
				note: '`AbstractUserDetailsAuthenticationProvider` uses a template method. Its `authenticate` fixes the order: look in the cache, `retrieveUser`, pre-checks, `additionalAuthenticationChecks`, post-checks, build the success token. `retrieveUser` and `additionalAuthenticationChecks` are abstract, and `DaoAuthenticationProvider` fills them: load the user, compare the password.'
			},
			{
				add: ['fac["PasswordEncoderFactories"] -->|"createDelegatingPasswordEncoder"| dpe["DelegatingPasswordEncoder: bcrypt, argon2, scrypt..."]', 'dao -->|"matches"| dpe'],
				highlight: ['fac', 'dpe'],
				note: '`PasswordEncoderFactories` is a factory: one static method builds the default encoder, so callers never call its constructor. The encoder holds a map from ids like `bcrypt` and `argon2` to encoders, with `bcrypt` for new hashes. It reads the `{id}` prefix of a stored hash and picks the matching encoder, so the stored data picks the strategy.'
			},
			{
				add: ['pm -->|"publishAuthenticationSuccess"| obs["Listeners of AuthenticationSuccessEvent"]', 'isr["InputStreamReader: bytes in, chars out"]', 'class isr ext'],
				highlight: ['obs', 'isr'],
				note: 'After a success, `ProviderManager` publishes an `AuthenticationSuccessEvent`, and every listener receives it without `ProviderManager` knowing them: that is the observer. The adapter is in the JDK: `InputStreamReader` takes an `InputStream` of bytes and fits it to the `Reader` interface of characters.'
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
			'Line 10 calls `retrieveUser`, and line 15 calls `performPreCheck`, which runs the pre-checks and then `additionalAuthenticationChecks`. [`DaoAuthenticationProvider`](' + AUTH + '/dao/DaoAuthenticationProvider.java#L80-L123) implements those two steps: ask the `UserDetailsService`, compare the password with the encoder. It writes nothing about caches (lines 6 and 20) or account checks.',
			'Line 2 declares `authenticate` without `final`, so a subclass could override it and skip the checks. `DaoAuthenticationProvider` does mark its own `retrieveUser` as `final`.',
			'The strategy loop is in `ProviderManager.authenticate`: it skips providers that do not `supports` the token class and breaks on the first non-null result. The observer call is [`publishAuthenticationSuccess`](' + AUTH + '/ProviderManager.java#L239-L241), which publishes a Spring application event.',
			'The chain is one method: [`VirtualFilterChain.doFilter`](' + REPO + '/web/src/main/java/org/springframework/security/web/FilterChainProxy.java#L375-L388) calls the next filter and passes itself along. The factory is `createDelegatingPasswordEncoder`. The Javadoc of `InputStreamReader` calls it "a bridge from byte streams to character streams".'
		]
	},
	tradeoff: {
		gain: [
			'A new login method is a new provider, and a new hash algorithm is one more entry in the encoder map. `ProviderManager` and its callers stay unchanged.',
			'"A chain of filters, then a strategy loop, then observers" describes this login path in one line.',
			'A provider built on `AbstractUserDetailsAuthenticationProvider` gets the cache and the account checks without writing them.'
		],
		cost: [
			'A stored hash whose `{id}` has no encoder in the map throws `IllegalArgumentException` at login. Nothing checks the ids at startup.',
			'With Spring\'s default event multicaster and no error handler, a listener that throws [makes the publisher throw](' + SPRING + '/spring-context/src/main/java/org/springframework/context/event/SimpleApplicationEventMulticaster.java#L162-L175). The observers can break the code that publishes.',
			'An interface with only one implementation adds a class and gives the caller nothing to swap.'
		]
	},
	task: {
		prompt: 'Your Spring Security app needs a new way to log in: an API key in an `X-Api-Key` header. Using the diagram, say which patterns you use, what you write, and what you must not touch.',
		hint: 'Which piece reads the request, which piece decides, and which loop already knows how to try one more decider?',
		answer: [
			'Chain: a new filter, placed in the security filter chain, that reads the header, builds an API key token and hands it to the `AuthenticationManager`. Then it calls `chain.doFilter`.',
			'Strategy: a new `AuthenticationProvider` whose `supports` accepts only the API key token class, and whose `authenticate` looks the key up. You register it with the other providers.',
			'Leave `ProviderManager` as it is. Its loop already tries every provider that supports the token, and it already publishes the success event, so every existing listener covers the new method too.',
			'No template method here: `AbstractUserDetailsAuthenticationProvider` only supports username and password tokens, so a key provider implements the interface directly.',
			'Risk to name: the key lookup is new security code. Copy the care of `DaoAuthenticationProvider`, which mitigates timing attacks when a user is not found, and never log the key.'
		],
		steps: [
			{
				title: 'Find what reads the request',
				questions: [
					{ q: 'Which piece reads the `X-Api-Key` header?', options: ['A new `AuthenticationProvider`', '`ProviderManager`', 'A new filter in the security filter chain', 'A listener of `AuthenticationSuccessEvent`'], answer: 2, why: 'The filters are the pieces that see the HTTP request. The providers only see a token.' },
					{ q: 'Which pattern do the security filters follow?', options: ['Strategy', 'Chain of responsibility', 'Observer', 'Adapter'], answer: 1, why: 'Each filter does its part, then passes the request on to the next one, or stops it.' },
					{ q: 'The filter has built an API key token. Who does it hand it to?', options: ['The `AuthenticationManager`', 'The `UserDetailsService`', 'Only the next filter', '`PasswordEncoderFactories`'], answer: 0, why: 'The filter reads, the manager decides. Checking the key is not the filter\'s job.' },
					{ q: 'What must the filter call at the end so the request goes on?', options: ['`publishAuthenticationSuccess`', '`retrieveUser`', '`supports`', '`chain.doFilter`'], answer: 3, why: 'A filter that does not call `chain.doFilter` stops the request there.' }
				]
			},
			{
				title: 'Find what decides',
				questions: [
					{ q: 'Your provider finds the key and accepts it. What must `authenticate` return?', options: ['`null`', 'An authenticated token that says who the caller is', 'The raw key, unchanged', 'The next filter in the chain'], answer: 1, why: 'A non-null result ends the loop, and it is what the rest of the request sees as the logged-in caller, like the success token the template method builds.' },
					{ q: 'What does the new provider\'s `supports` accept?', options: ['Every token class', 'Only username and password tokens', 'Only the API key token class', 'Only JWTs'], answer: 2, why: 'Saying "not mine" to every other token keeps it out of the other login methods.' },
					{ q: 'Which pattern is each `AuthenticationProvider`?', options: ['Template method', 'Factory', 'Chain of responsibility', 'Strategy'], answer: 3, why: 'Interchangeable implementations of one interface, tried in turn by a caller that never names their classes.' },
					{ q: 'Which two methods does the `AuthenticationProvider` interface ask you to write?', options: ['`supports` and `authenticate`', '`retrieveUser` and `additionalAuthenticationChecks`', '`doFilter` and `supports`', '`matches` and `encode`'], answer: 0, why: '`supports` says "mine or not", and `authenticate` does the check. The other pairs belong to the template method, the filters and the encoder.' }
				]
			},
			{
				title: 'Say what you leave alone',
				questions: [
					{ q: 'Do you change `UsernamePasswordAuthenticationFilter` to read the key too?', options: ['Yes: add an API key branch to it', 'No: your new filter sits beside it in the chain', 'Yes: replace it with your filter', 'No, but remove it from the chain'], answer: 1, why: 'Each filter does its own part and passes the request on. Password logins keep working untouched.' },
					{ q: 'A listener of the success event throws on API key logins. With Spring\'s default multicaster and no error handler, what happens to the login?', options: ['The publisher throws, so the login fails', 'Nothing: listeners cannot affect the login', 'Only the audit line is lost', 'Spring retries the listener'], answer: 0, why: 'The observers run inside the publisher\'s call. A listener that throws breaks the code that published.' },
					{ q: 'A listener writes an audit line on every successful login. Do you update it for API keys?', options: ['Yes: it only knows passwords', 'Yes: register it on the new filter', 'No: `ProviderManager` already publishes the success event for every provider', 'Only if the key is a JWT'], answer: 2, why: 'The event comes from `ProviderManager`, not from a provider, so the new method is covered for free.' },
					{ q: 'Which pattern lets that listener work without `ProviderManager` knowing it?', options: ['Adapter', 'Observer', 'Decorator', 'Template method'], answer: 1, why: 'Every listener receives the event, and the publisher does not know who they are.' }
				]
			},
			{
				title: 'Check what does not fit',
				questions: [
					{ q: 'Why not extend `AbstractUserDetailsAuthenticationProvider`?', options: ['The class is `final`', 'It only supports username and password tokens', 'It has no `authenticate` method', 'It only works with JWTs'], answer: 1, why: 'Its fixed steps load a user and check a password. An API key token does not go through them.' },
					{ q: 'So how do you write the key provider?', options: ['Extend `DaoAuthenticationProvider`', 'Wrap an `InputStreamReader`', 'Implement `AuthenticationProvider` directly', 'Override `ProviderManager.authenticate`'], answer: 2, why: 'No template method fits, so you implement the interface yourself.' },
					{ q: 'What is the risk to name?', options: ['The key lookup is new security code', '`ProviderManager` gets slower with one more provider', 'The filter chain gets too long', 'Listeners may miss the event'], answer: 0, why: 'New code that decides who gets in deserves the most care in this change.' },
					{ q: 'Which care do you copy from `DaoAuthenticationProvider`?', options: ['Caching every key forever', 'Storing keys with a `{bcrypt}` prefix', 'Skipping the pre-checks for speed', 'Mitigating timing attacks on a miss, and never logging the key'], answer: 3, why: '`DaoAuthenticationProvider` mitigates timing attacks when a user is not found. A key in a log is a leaked key.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A wrapper takes an object that offers one interface and makes it usable where a different interface is expected. Which pattern is that?',
			options: ['Decorator', 'Adapter', 'Observer', 'Factory'],
			answer: 1,
			why: 'An adapter changes the interface, and a decorator keeps the same interface and adds behavior. `InputStreamReader` turns a byte `InputStream` into a character `Reader`.'
		},
		{
			q: 'A stored password hash starts with `{md4x}`, and no encoder is mapped to that id. What happens when the user logs in?',
			options: ['The hash is upgraded to bcrypt the first time the user logs in', 'The app refuses to start until every stored hash has a known id', 'The encoder falls back to its default id, bcrypt, and the login works', '`DelegatingPasswordEncoder` throws `IllegalArgumentException` at login'],
			answer: 3,
			why: 'The delegating encoder picks a strategy by the `{id}` prefix. An unknown id goes to its unmapped encoder, which throws. The strategy is picked at login, so the error shows up at login.'
		},
		{
			q: 'A Spring Security app needs a new login method. With `ProviderManager`\'s strategy design, what has to change?',
			options: ['A new `AuthenticationProvider`, registered with the others', '`ProviderManager.authenticate`, to add a branch for the new method', 'Every controller that needs a user, to call the new login method', '`DaoAuthenticationProvider`, so it also checks the new credentials'],
			answer: 0,
			why: '`ProviderManager` loops over whatever providers it holds and keeps the first result. It never names a provider, so its code stays the same while the list grows.'
		}
	],
	recall: {
		q: 'How does Spring Security\'s `ProviderManager` pick the provider for a login, and what do you write to add a new login method?',
		a: 'It loops over its providers, skips those whose `supports` rejects the token class, and keeps the first non-null result. A new login method is a new `AuthenticationProvider` registered in that list, and `ProviderManager` stays unchanged.'
	},
	sources: [
		{ title: 'Gamma, Helm, Johnson & Vlissides, Design Patterns: Elements of Reusable Object-Oriented Software', url: 'https://www.oreilly.com/library/view/design-patterns-elements/0201633612/' },
		{ title: 'Refactoring Guru, History of patterns', url: 'https://refactoring.guru/design-patterns/history' },
		{ title: 'Spring Security reference, Servlet architecture', url: 'https://docs.spring.io/spring-security/reference/servlet/architecture.html' },
		{ title: 'Spring Security, AbstractUserDetailsAuthenticationProvider.java', url: `${TEMPLATE}#L134-L180` },
		{ title: 'Spring Security, AbstractUserDetailsAuthenticationProvider.java: performPreCheck', url: `${TEMPLATE}#L182-L199` },
		{ title: 'Spring Security, ProviderManager.java', url: `${AUTH}/ProviderManager.java#L166-L190` },
		{ title: 'Spring Security, DefaultAuthenticationEventPublisher.java', url: `${AUTH}/DefaultAuthenticationEventPublisher.java#L100-L104` },
		{ title: 'Spring Security, PasswordEncoderFactories.java', url: `${CRYPTO}/factory/PasswordEncoderFactories.java#L72-L91` },
		{ title: 'OpenJDK, InputStreamReader.java', url: `${JDK}/io/InputStreamReader.java#L34-L69` }
	]
};
