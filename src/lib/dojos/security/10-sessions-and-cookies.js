const PASSPORT = 'https://github.com/jaredhanson/passport/blob/c33067bc5aa81a6dd827076d810bf788bb6acac7/lib/sessionmanager.js';
const FIX = 'https://github.com/jaredhanson/passport/commit/7e9b9cf4d7be02428e963fc729496a45baeea608';
const ES = 'https://github.com/expressjs/session/blob/8947e169ae838b22cc1af198e50e370e6fc09f96';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sessions-and-cookies',
	part: 'Identity',
	title: 'Sessions and cookies',
	minutes: 10,
	hook: [
		'On 2 July 2022, GitHub published GHSA-v923-w3x8-wh69 (CVE-2022-25896) for Passport, the login middleware for Express. Versions before 0.6.0 kept the same session id when a user logged in. The fix, PR #900 "Address Session Fixation Concerns", shipped in 0.6.0 on 20 May 2022.',
		'OWASP describes the attack it allows. The attacker gets a valid session id by visiting the site, makes the victim\'s browser use that id, and waits for the victim to log in. If the id does not change at login, the attacker\'s copy of the cookie now opens the victim\'s account.'
	],
	terms: [
		{ term: 'Session id', def: 'A random value in a cookie that points to a record on the server. express-session names it `connect.sid` and makes it from 24 random bytes (192 bits); OWASP asks for at least 64 bits of entropy.' },
		{ term: 'Session fixation', def: 'An attack where the attacker picks the session id before the victim logs in, then reuses it after. It works when the server keeps the same id across login.' },
		{ term: 'HttpOnly and Secure', def: 'Two `Set-Cookie` attributes. `HttpOnly` hides the cookie from `document.cookie`. `Secure` sends it only over `https:`, except on localhost.' },
		{ term: 'SameSite', def: 'A `Set-Cookie` attribute that controls whether the browser sends the cookie on cross-site requests: `Strict`, `Lax` or `None`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['att["Attacker visits the shop"] -->|"Set-Cookie: connect.sid=abc"| sid["Anonymous session abc in the store"]'],
				highlight: ['att', 'sid'],
				note: 'Any visitor gets a session id, and so does the attacker: `abc`. The record behind it holds nothing yet. OWASP lists ways to push an id into another browser: a link with the id in the URL, a hidden form field, or a script that writes `document.cookie` through an XSS hole.'
			},
			{
				add: ['sid -->|"id planted in the victim\'s browser"| vic["Victim logs in with cookie abc"]'],
				highlight: ['vic'],
				note: 'The victim types the right password. The browser sends `connect.sid=abc`, because that is the cookie it holds.'
			},
			{
				add: ['vic -->|"Passport before 0.6.0"| same["Same id abc, now holds user 42"]', 'same -->|"attacker sends cookie abc"| own["Attacker is logged in as user 42"]'],
				highlight: ['same', 'own'],
				note: 'Before the fix, `logIn` called `_serializeUser` and wrote the user into `req.session` directly. Record `abc` now says "user 42", and the attacker holds `abc`. No password was stolen.'
			},
			{
				add: ['vic -->|"Passport 0.6.0: regenerate"| fresh["New id xyz holds user 42, abc destroyed"]'],
				highlight: ['fresh'],
				note: 'Passport 0.6.0 calls `req.session.regenerate` before it stores the user. express-session\'s store destroys `abc` and generates a new id, `xyz`, sent in a new `Set-Cookie`. The attacker\'s `abc` points to nothing.'
			}
		]
	},
	example: {
		title: 'lib/sessionmanager.js in Passport 0.6.0: logIn',
		repo: 'jaredhanson/passport',
		url: `${PASSPORT}#L14-L55`,
		lang: 'javascript',
		code: `SessionManager.prototype.logIn = function(req, user, options, cb) {
  if (typeof options == 'function') {
    cb = options;
    options = {};
  }
  options = options || {};

  if (!req.session) { return cb(new Error('Login sessions require session support. Did you forget to use \`express-session\` middleware?')); }

  var self = this;
  var prevSession = req.session;

  // regenerate the session, which is good practice to help
  // guard against forms of session fixation
  req.session.regenerate(function(err) {
    if (err) {
      return cb(err);
    }

    self._serializeUser(user, req, function(err, obj) {
      if (err) {
        return cb(err);
      }
      if (options.keepSessionInfo) {
        merge(req.session, prevSession);
      }
      if (!req.session[self._key]) {
        req.session[self._key] = {};
      }
      // store user information in session, typically a user id
      req.session[self._key].user = obj;
      // save the session before redirection to ensure page
      // load does not happen before session is saved
      req.session.save(function(err) {
        if (err) {
          return cb(err);
        }
        cb();
      });
    });
  });
}`,
		notes: [
			'Line 28 is the fix: `req.session.regenerate(...)` runs before the user is stored. In [`session/store.js`](' + ES + '/session/store.js#L50-L56), `regenerate` calls `destroy(req.sessionID)` and then `generate(req)`, so the old id is gone from the store.',
			'Lines 37 to 39: with `keepSessionInfo`, the old session\'s data (a cart, a return URL) is merged into the new session. The id is new and the data stays.',
			'Line 44 stores the result of `serializeUser`, usually only the user id, under `req.session.passport.user`. The cookie carries the session id and nothing about the user.',
			'Line 47 saves before calling back, so the redirect after login does not arrive before the new session is in the store. `logOut` in the same file deletes the user, saves, and regenerates too.',
			'The [fix commit](' + FIX + ') shows the code before: `logIn` went straight to `this._serializeUser` and wrote into the session it was given.'
		]
	},
	tradeoff: {
		gain: [
			'Regenerating at login costs one store delete and one write. In exchange, an id that someone knew before login opens nothing after it.',
			'express-session sets `HttpOnly` by default, so a script injected through XSS cannot read the session id from `document.cookie`.'
		],
		cost: [
			'Data in the anonymous session is lost at login unless you pass `keepSessionInfo: true`. A cart filled before login disappears without it.',
			'express-session leaves `Secure` off and sets no `SameSite` and no expiry by default. You must set all three, and behind a proxy `secure: true` also needs `app.set(\'trust proxy\', 1)`.',
			'With `secure: true` on a plain HTTP site, the README says "the cookie will not be set", so local HTTP testing needs a separate setting.'
		]
	},
	task: {
		prompt: 'Write the express-session options for a shop served over HTTPS behind one reverse proxy. Requirements: the cookie is hidden from scripts, never sent over HTTP, not sent on cross-site POSTs, gone after 8 hours, and named so that only this exact host can set it. Then list the attributes the browser receives in `Set-Cookie`.',
		hint: 'Use `cookie.httpOnly`, `cookie.secure`, `cookie.sameSite`, `cookie.maxAge` (in milliseconds) and `name`. For the name, read the MDN rules for the `__Host-` prefix.',
		answer: [
			'`app.set(\'trust proxy\', 1)`, then `session({ name: \'__Host-sid\', secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { httpOnly: true, secure: true, sameSite: \'lax\', maxAge: 8 * 60 * 60 * 1000, path: \'/\' } })`.',
			'`maxAge` is 28,800,000 ms. express-session adds it to the server time and sends an `Expires` 8 hours ahead. The browser receives `Path=/`, `Expires=...`, `HttpOnly`, `Secure` and `SameSite=Lax`.',
			'`__Host-` makes the browser refuse the cookie unless it has `Secure`, `Path=/` and no `Domain`. A sibling subdomain then cannot plant its own `__Host-sid` for your host.',
			'`Lax` still sends the cookie when a user follows a link from another site, so they arrive logged in. A cross-site form POST arrives without it. Call `req.login` from Passport 0.6.0 or later so the id changes at login.'
		],
		steps: [
			{
				title: 'Match each requirement to an option',
				questions: [
					{ q: '"Hidden from scripts". Which option?', options: ['`secure: true`', '`sameSite: \'strict\'`', '`httpOnly: true`', '`maxAge: 0`'], answer: 2, why: '`HttpOnly` hides the cookie from `document.cookie`, so a script injected through XSS cannot read it.' },
					{ q: '"Never sent over HTTP". Which option?', options: ['`httpOnly: true`', '`secure: true`', '`sameSite: \'none\'`', '`path: \'/\'`'], answer: 1, why: '`Secure` sends the cookie only over `https:`. express-session leaves it off by default.' },
					{ q: '"Not sent on cross-site POSTs", yet users who follow a link arrive logged in. Which value?', options: ['`sameSite: \'none\'`', '`sameSite: \'strict\'`', 'No `sameSite` at all', '`sameSite: \'lax\'`'], answer: 3, why: 'With `Lax`, a cross-site request carries the cookie only on a top-level navigation with a safe method, which excludes POST. A followed link is a GET.' },
					{ q: '"Gone after 8 hours". What is `maxAge`?', options: ['`8 * 60 * 60 * 1000`, 28,800,000', '`8 * 60 * 60`, 28,800', '`8`, in hours', '`480`, in minutes'], answer: 0, why: '`maxAge` is in milliseconds, so 8 hours is 28,800,000.' }
				]
			},
			{
				title: 'Handle the proxy and the name',
				questions: [
					{ q: 'The app sits behind one reverse proxy. What else does `secure: true` need?', options: ['`app.set(\'trust proxy\', 1)`', '`app.set(\'trust proxy\', false)`', 'A TLS certificate inside Node.js', 'Nothing: Express detects the proxy'], answer: 0, why: 'Behind a proxy, `secure: true` also needs `app.set(\'trust proxy\', 1)`, so Express believes the proxy when it says the request came over HTTPS.' },
					{ q: 'With `secure: true`, what happens on a plain HTTP request?', options: ['The cookie is sent without `Secure`', 'The server throws an error', 'The browser drops it on arrival', 'The cookie is not set at all'], answer: 3, why: 'The README: "the cookie will not be set". That is why local HTTP testing needs a separate setting.' },
					{ q: '"Only this exact host can set it". Which name?', options: ['`connect.sid`', '`__Host-sid`', '`__Secure-sid`', '`sid.shop.example.com`'], answer: 1, why: 'The `__Host-` prefix makes the browser refuse the cookie unless it has `Secure`, `Path=/` and no `Domain`.' },
					{ q: 'What must the cookie carry for a `__Host-` name to be accepted?', options: ['`HttpOnly` and `SameSite=Strict`', '`Domain=shop.example.com`', '`Secure`, `Path=/`, and no `Domain`', 'An `Expires` date'], answer: 2, why: 'Those are the MDN rules. A sibling subdomain then cannot plant its own `__Host-sid` for your host.' }
				]
			},
			{
				title: 'Read the Set-Cookie',
				questions: [
					{ q: 'Which attributes does the browser receive?', options: ['`HttpOnly` and `Secure` only', '`Path=/`, `Expires=...`, `HttpOnly`, `Secure`, `SameSite=Lax`', '`Domain=...`, `HttpOnly`, `Secure`, `SameSite=Lax`', '`Max-Age=8h`, `HttpOnly`, `Secure`'], answer: 1, why: 'Each option you set becomes an attribute, and `maxAge` becomes an `Expires` date.' },
					{ q: 'How does express-session send the 8-hour limit?', options: ['As `Max-Age=8`', 'As a value inside the cookie', 'As an `Expires` date: server time plus `maxAge`', 'It does not: only the store expires it'], answer: 2, why: 'It adds `maxAge` to the server time and sends an `Expires` 8 hours ahead.' },
					{ q: 'With only the express-session defaults, what would be missing?', options: ['`Secure`, `SameSite` and an expiry', '`HttpOnly` and `Path`', 'Only `HttpOnly`', 'Nothing: the defaults are safe'], answer: 0, why: 'express-session sets `HttpOnly` by default, but leaves `Secure` off and sets no `SameSite` and no expiry.' },
					{ q: 'What does the cookie value carry?', options: ['The user id and role, signed by the server', 'The password hash, so each request can be checked', 'The whole session record, encrypted with the secret', 'The session id, which points to a record on the server'], answer: 3, why: 'The user lives in the session record, under `req.session.passport.user`. The cookie carries the id and nothing about the user.' }
				]
			},
			{
				title: 'Close session fixation',
				questions: [
					{ q: 'What does an attacker need for session fixation on Passport 0.5.3?', options: ['The victim\'s password, or a reset link for the account', 'The secret the server uses to sign session cookies', 'Read access to the session store on the server', 'A way to make the victim\'s browser use an id they already hold'], answer: 3, why: 'Before 0.6.0, the id did not change at login, so the attacker\'s copy of it opened the victim\'s account.' },
					{ q: 'Which Passport version changes the id at login?', options: ['0.6.0 or later', '0.5.3', 'Any version, with `keepSessionInfo`', 'None: you must patch it yourself'], answer: 0, why: '0.6.0 calls `req.session.regenerate` before it stores the user.' },
					{ q: 'What does `regenerate` do in the store?', options: ['It only renews the cookie expiry', 'It copies the old id into a new cookie', 'It destroys the old id and generates a new one', 'It signs the old id again with a new secret'], answer: 2, why: 'It calls `destroy(req.sessionID)`, then `generate(req)`, so the old id points to nothing.' },
					{ q: 'The cart filled before login must survive it. Which option keeps it?', options: ['`saveUninitialized: true`', '`keepSessionInfo: true`', '`resave: true`', '`rolling: true`'], answer: 1, why: 'With `keepSessionInfo`, the old session\'s data is merged into the new session. The id is still new.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'An app runs Passport 0.5.3. What does an attacker need for a session fixation attack?',
			options: [
				'The victim\'s password, to log in once and copy the cookie',
				'A way to make the victim\'s browser use a session id the attacker already has',
				'Read access to the session store, to change the user id of a session',
				'The cookie signing secret, to forge a valid session id'
			],
			answer: 1,
			why: 'Before 0.6.0, `logIn` stored the user in the existing session without changing its id. If the victim logs in while their browser carries the attacker\'s id, the server marks that id as logged in, and the attacker replays it.'
		},
		{
			q: 'Which `Set-Cookie` attribute stops a script injected by XSS from reading the session id?',
			options: [
				'`Secure`',
				'`SameSite=Strict`',
				'`HttpOnly`',
				'`Max-Age=0`'
			],
			answer: 2,
			why: 'MDN: `HttpOnly` "Forbids JavaScript from accessing the cookie, for example, through the Document.cookie property." `Secure` controls the scheme, `SameSite` controls cross-site sending, and `Max-Age=0` deletes the cookie.'
		},
		{
			q: 'A session cookie has `SameSite=Lax`. Another site submits a hidden `<form method="POST">` to your shop. Is the cookie sent?',
			options: [
				'Yes, because a form submission is a top-level navigation',
				'Yes, because `Lax` only blocks requests from `<img>` and `<script>`',
				'No, because `Lax` only sends cross-site cookies on safe methods',
				'No, because `Lax` never sends cookies on any cross-site request'
			],
			answer: 2,
			why: 'MDN: with `Lax`, a cross-site request carries the cookie only if it is a top-level navigation and uses a safe method, which "excludes POST, PUT, and DELETE". A followed link (GET) still carries it.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Run the task\'s session options in a small Express app, read the real `Set-Cookie`, and watch the id change at login.',
		steps: [
			'Make a project: `mkdir -p ~/cookie-lab && cd ~/cookie-lab && npm init -y && npm install express express-session`.',
			'Write `app.js`: an Express app on `127.0.0.1:3000` with `app.set(\'trust proxy\', 1)` and the session options from the task, with `\'lab-secret\'` as the secret. Add a `/` route that sets `req.session.visits` and sends `id <session id>`, and a `/login` route that calls `req.session.regenerate`, sets `req.session.user = 42` and sends the new id the same way. Start it with `node app.js &`.',
			'Call it over plain HTTP: `curl -si localhost:3000/ | grep -iE "set-cookie|^id"`.',
			'Play the proxy, which tells the app the request came over HTTPS: `curl -si -c jar -H "X-Forwarded-Proto: https" localhost:3000/ | grep -iE "set-cookie|^id"`.',
			'Send the cookie back once: `curl -s -b jar -H "X-Forwarded-Proto: https" localhost:3000/`. Then log in with it: `curl -si -b jar -H "X-Forwarded-Proto: https" localhost:3000/login | grep -iE "set-cookie|^id"`. Stop the app with `kill %1`.'
		],
		done: [
			'Over plain HTTP, the response has an `id` line and no `Set-Cookie`.',
			'With `X-Forwarded-Proto: https`, the response has `Set-Cookie: __Host-sid=...; Path=/; Expires=...; HttpOnly; Secure; SameSite=Lax`, with `Expires` 8 hours ahead.',
			'Sent back with `-b jar`, `/` prints the same id as before, so the cookie works. The id that `/login` prints differs from it, and a new `Set-Cookie` comes with it.'
		],
		solution: [
			'`const express = require(\'express\'); const session = require(\'express-session\'); const app = express(); app.set(\'trust proxy\', 1);`',
			'`app.use(session({ name: \'__Host-sid\', secret: \'lab-secret\', resave: false, saveUninitialized: false, cookie: { httpOnly: true, secure: true, sameSite: \'lax\', maxAge: 8 * 60 * 60 * 1000, path: \'/\' } }));`',
			'`app.get(\'/\', (req, res) => { req.session.visits = (req.session.visits || 0) + 1; res.send(\'id \' + req.sessionID + \'\\n\'); });`',
			'`app.get(\'/login\', (req, res) => req.session.regenerate(() => { req.session.user = 42; res.send(\'id \' + req.sessionID + \'\\n\'); }));`, then `app.listen(3000, \'127.0.0.1\');`',
			'With `secure: true`, express-session sets no cookie on a plain HTTP request. `trust proxy` makes it believe `X-Forwarded-Proto`, which is safe only when your proxy overwrites that header.',
			'`regenerate` destroys the old id in the store, so an id that someone knew before login opens nothing after it.'
		]
	},
	recall: {
		q: 'What did Passport 0.6.0 change in `logIn` to stop session fixation, and which three cookie attributes must you set yourself in express-session?',
		a: 'It calls `req.session.regenerate` before storing the user, so the id changes at login. You set `Secure`, `SameSite` and an expiry (`maxAge`); `HttpOnly` is on by default.'
	},
	sources: [
		{ title: 'GitHub Advisory GHSA-v923-w3x8-wh69, Passport session regeneration', url: 'https://github.com/advisories/GHSA-v923-w3x8-wh69' },
		{ title: 'Passport PR #900, Address Session Fixation Concerns', url: 'https://github.com/jaredhanson/passport/pull/900' },
		{ title: 'express-session README', url: `${ES}/README.md` },
		{ title: 'MDN, Set-Cookie', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie' },
		{ title: 'OWASP, Session fixation', url: 'https://owasp.org/www-community/attacks/Session_fixation' },
		{ title: 'OWASP Session Management Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html' }
	]
};
