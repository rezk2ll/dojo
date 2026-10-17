const PASSPORT = 'https://github.com/jaredhanson/passport/blob/c33067bc5aa81a6dd827076d810bf788bb6acac7/lib/sessionmanager.js';
const FIX = 'https://github.com/jaredhanson/passport/commit/7e9b9cf4d7be02428e963fc729496a45baeea608';
const ES = 'https://github.com/expressjs/session/blob/8947e169ae838b22cc1af198e50e370e6fc09f96';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sessions-and-cookies',
	part: 'L’identité',
	title: 'Sessions et cookies',
	minutes: 10,
	hook: [
		'Le 2 juillet 2022, GitHub publie l’avis GHSA-v923-w3x8-wh69 (CVE-2022-25896) pour Passport, le middleware d’authentification pour Express. Avant la 0.6.0, l’id de session restait le même quand un utilisateur se connectait. Le correctif, la PR #900 "Address Session Fixation Concerns", sort dans la 0.6.0 le 20 mai 2022.',
		'L’OWASP décrit l’attaque que ça permet. L’attaquant obtient un id de session valide en visitant le site, fait utiliser cet id par le navigateur de la victime, et attend qu’elle se connecte. Si l’id ne change pas à la connexion, la copie du cookie que garde l’attaquant ouvre maintenant le compte de la victime.'
	],
	terms: [
		{ term: 'Id de session', def: 'Une valeur aléatoire dans un cookie qui pointe vers un enregistrement sur le serveur. express-session l’appelle `connect.sid` et la tire de 24 octets aléatoires (192 bits) ; l’OWASP demande au moins 64 bits d’entropie.' },
		{ term: 'Fixation de session', def: 'Une attaque où l’attaquant choisit l’id de session avant que la victime se connecte, puis le réutilise après. Elle marche quand le serveur garde le même id à travers la connexion.' },
		{ term: 'HttpOnly et Secure', def: 'Deux attributs de `Set-Cookie`. `HttpOnly` cache le cookie à `document.cookie`. `Secure` ne l’envoie qu’en `https:`, sauf sur localhost.' },
		{ term: 'SameSite', def: 'Un attribut de `Set-Cookie` qui décide si le navigateur envoie le cookie sur les requêtes cross-site : `Strict`, `Lax` ou `None`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['att["L’attaquant visite la boutique"] -->|"Set-Cookie: connect.sid=abc"| sid["Session anonyme abc dans le store"]'],
				highlight: ['att', 'sid'],
				note: 'Tout visiteur reçoit un id de session, l’attaquant aussi : `abc`. L’enregistrement derrière est vide. L’OWASP liste des façons de pousser un id dans un autre navigateur : un lien avec l’id dans l’URL, un champ de formulaire caché, ou un script qui écrit `document.cookie` via une faille XSS.'
			},
			{
				add: ['sid -->|"id posé dans le navigateur de la victime"| vic["La victime se connecte avec le cookie abc"]'],
				highlight: ['vic'],
				note: 'La victime tape le bon mot de passe. Le navigateur envoie `connect.sid=abc`, puisque c’est le cookie qu’il détient.'
			},
			{
				add: ['vic -->|"Passport avant 0.6.0"| same["Même id abc, qui contient l’utilisateur 42"]', 'same -->|"l’attaquant envoie le cookie abc"| own["L’attaquant est connecté comme l’utilisateur 42"]'],
				highlight: ['same', 'own'],
				note: 'Avant le correctif, `logIn` appelait `_serializeUser` et écrivait l’utilisateur directement dans `req.session`. L’enregistrement `abc` dit maintenant « utilisateur 42 », et l’attaquant détient `abc`. Aucun mot de passe n’a été volé.'
			},
			{
				add: ['vic -->|"Passport 0.6.0 : regenerate"| fresh["Nouvel id xyz avec l’utilisateur 42, abc détruit"]'],
				highlight: ['fresh'],
				note: 'Passport 0.6.0 appelle `req.session.regenerate` avant d’enregistrer l’utilisateur. Le store d’express-session détruit `abc` et génère un nouvel id, `xyz`, envoyé dans un nouveau `Set-Cookie`. Le `abc` de l’attaquant ne pointe plus vers rien.'
			}
		]
	},
	example: {
		title: 'lib/sessionmanager.js dans Passport 0.6.0 : logIn',
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
			'La ligne 28 est le correctif : `req.session.regenerate(...)` tourne avant l’enregistrement de l’utilisateur. Dans [`session/store.js`](' + ES + '/session/store.js#L50-L56), `regenerate` appelle `destroy(req.sessionID)` puis `generate(req)` : l’ancien id disparaît du store.',
			'Lignes 37 à 39 : avec `keepSessionInfo`, les données de l’ancienne session (un panier, une URL de retour) sont fusionnées dans la nouvelle. L’id change et les données restent.',
			'La ligne 44 range le résultat de `serializeUser`, en général le seul id de l’utilisateur, sous `req.session.passport.user`. Le cookie porte l’id de session et rien sur l’utilisateur.',
			'La ligne 47 sauvegarde avant de rappeler : la redirection après connexion n’arrive pas avant que la nouvelle session soit dans le store. `logOut`, dans le même fichier, supprime l’utilisateur, sauvegarde, puis régénère lui aussi.',
			'Le [commit du correctif](' + FIX + ') montre le code d’avant : `logIn` passait directement à `this._serializeUser` et écrivait dans la session reçue.'
		]
	},
	tradeoff: {
		gain: [
			'Régénérer à la connexion coûte une suppression et une écriture dans le store. En échange, un id connu avant la connexion n’ouvre plus rien après.',
			'express-session met `HttpOnly` par défaut : un script injecté par XSS ne peut pas lire l’id de session dans `document.cookie`.'
		],
		cost: [
			'Les données de la session anonyme disparaissent à la connexion, sauf avec `keepSessionInfo: true`. Sans lui, un panier rempli avant la connexion est perdu.',
			'Par défaut, express-session laisse `Secure` désactivé, sans `SameSite` ni expiration. Tu dois régler les trois, et derrière un proxy, `secure: true` demande aussi `app.set(\'trust proxy\', 1)`.',
			'Avec `secure: true` sur un site en HTTP simple, le README précise que "the cookie will not be set" : les tests locaux en HTTP demandent un réglage à part.'
		]
	},
	task: {
		prompt: 'Écris les options d’express-session pour une boutique servie en HTTPS derrière un reverse proxy. Exigences : cookie caché aux scripts, jamais envoyé en HTTP, absent des POST cross-site, expiré au bout de 8 heures, et nommé pour que seul cet hôte exact puisse le poser. Puis liste les attributs que le navigateur reçoit dans `Set-Cookie`.',
		hint: 'Utilise `cookie.httpOnly`, `cookie.secure`, `cookie.sameSite`, `cookie.maxAge` (en millisecondes) et `name`. Pour le nom, lis les règles de MDN sur le préfixe `__Host-`.',
		answer: [
			'`app.set(\'trust proxy\', 1)`, puis `session({ name: \'__Host-sid\', secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { httpOnly: true, secure: true, sameSite: \'lax\', maxAge: 8 * 60 * 60 * 1000, path: \'/\' } })`.',
			'`maxAge` vaut 28 800 000 ms. express-session l’ajoute à l’heure du serveur et envoie un `Expires` 8 heures plus tard. Le navigateur reçoit `Path=/`, `Expires=...`, `HttpOnly`, `Secure` et `SameSite=Lax`.',
			'Avec `__Host-`, le navigateur refuse le cookie s’il n’a pas `Secure`, `Path=/` et aucun `Domain`. Un sous-domaine voisin ne peut donc pas poser son propre `__Host-sid` pour ton hôte.',
			'`Lax` envoie encore le cookie quand un utilisateur suit un lien depuis un autre site : il arrive connecté. Un POST de formulaire cross-site arrive sans. Appelle `req.login` de Passport 0.6.0 ou plus récent pour que l’id change à la connexion.'
		]
	},
	quiz: [
		{
			q: 'Une appli tourne sur Passport 0.5.3. De quoi un attaquant a-t-il besoin pour une fixation de session ?',
			options: [
				'Du mot de passe de la victime, pour se connecter une fois et copier le cookie',
				'D’un moyen de faire utiliser au navigateur de la victime un id qu’il connaît déjà',
				'D’un accès en lecture au store, pour changer l’utilisateur d’une session',
				'Du secret de signature des cookies, pour forger un id de session valide'
			],
			answer: 1,
			why: 'Avant la 0.6.0, `logIn` rangeait l’utilisateur dans la session existante sans changer son id. Si la victime se connecte pendant que son navigateur porte l’id de l’attaquant, le serveur marque cet id comme connecté, et l’attaquant le rejoue.'
		},
		{
			q: 'Quel attribut de `Set-Cookie` empêche un script injecté par XSS de lire l’id de session ?',
			options: [
				'`Secure`',
				'`SameSite=Strict`',
				'`HttpOnly`',
				'`Max-Age=0`'
			],
			answer: 2,
			why: 'MDN : `HttpOnly` "Forbids JavaScript from accessing the cookie, for example, through the Document.cookie property." `Secure` porte sur le schéma, `SameSite` sur l’envoi cross-site, et `Max-Age=0` supprime le cookie.'
		},
		{
			q: 'Un cookie de session a `SameSite=Lax`. Un autre site soumet un `<form method="POST">` caché vers ta boutique. Le cookie part-il ?',
			options: [
				'Oui, car l’envoi d’un formulaire est une navigation de premier niveau',
				'Oui, car `Lax` ne bloque que les requêtes de `<img>` et `<script>`',
				'Non, car `Lax` n’envoie les cookies cross-site que sur les méthodes sûres',
				'Non, car `Lax` n’envoie jamais de cookie sur une requête cross-site'
			],
			answer: 2,
			why: 'MDN : avec `Lax`, une requête cross-site ne porte le cookie que si c’est une navigation de premier niveau avec une méthode sûre, ce qui "excludes POST, PUT, and DELETE". Un lien suivi (GET) le porte encore.'
		}
	],
	recall: {
		q: 'Qu’a changé Passport 0.6.0 dans `logIn` contre la fixation de session, et quels trois attributs de cookie dois-tu régler toi-même dans express-session ?',
		a: 'Il appelle `req.session.regenerate` avant d’enregistrer l’utilisateur : l’id change à la connexion. Tu règles `Secure`, `SameSite` et une expiration (`maxAge`) ; `HttpOnly` est actif par défaut.'
	},
	sources: [
		{ title: 'Avis GitHub GHSA-v923-w3x8-wh69, régénération de session dans Passport', url: 'https://github.com/advisories/GHSA-v923-w3x8-wh69' },
		{ title: 'Passport PR #900, Address Session Fixation Concerns', url: 'https://github.com/jaredhanson/passport/pull/900' },
		{ title: 'README d’express-session', url: `${ES}/README.md` },
		{ title: 'MDN, Set-Cookie', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie' },
		{ title: 'OWASP, Session fixation', url: 'https://owasp.org/www-community/attacks/Session_fixation' },
		{ title: 'OWASP, Session Management Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html' }
	]
};
