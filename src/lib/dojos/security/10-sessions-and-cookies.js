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
