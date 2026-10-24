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
		],
		steps: [
			{
				title: 'Associe chaque exigence à une option',
				questions: [
					{ q: '« Caché aux scripts ». Quelle option ?', options: ['`secure: true`', '`sameSite: \'strict\'`', '`httpOnly: true`', '`maxAge: 0`'], answer: 2, why: '`HttpOnly` cache le cookie à `document.cookie` : un script injecté par XSS ne peut pas le lire.' },
					{ q: '« Jamais envoyé en HTTP ». Quelle option ?', options: ['`httpOnly: true`', '`secure: true`', '`sameSite: \'none\'`', '`path: \'/\'`'], answer: 1, why: '`Secure` n’envoie le cookie qu’en `https:`. express-session le laisse coupé par défaut.' },
					{ q: '« Absent des POST cross-site », mais un utilisateur qui suit un lien arrive connecté. Quelle valeur ?', options: ['`sameSite: \'none\'`', '`sameSite: \'strict\'`', 'Pas de `sameSite` du tout', '`sameSite: \'lax\'`'], answer: 3, why: 'Avec `Lax`, une requête cross-site ne porte le cookie que pour une navigation de premier niveau avec une méthode sûre, ce qui exclut POST. Un lien suivi est un GET.' },
					{ q: '« Expiré au bout de 8 heures ». Que vaut `maxAge` ?', options: ['`8 * 60 * 60 * 1000`, 28 800 000', '`8 * 60 * 60`, 28 800', '`8`, en heures', '`480`, en minutes'], answer: 0, why: '`maxAge` est en millisecondes, donc 8 heures font 28 800 000.' }
				]
			},
			{
				title: 'Gère le proxy et le nom',
				questions: [
					{ q: 'L’appli est derrière un reverse proxy. De quoi `secure: true` a-t-il encore besoin ?', options: ['De `app.set(\'trust proxy\', 1)`', 'De `app.set(\'trust proxy\', false)`', 'D’un certificat TLS dans Node.js', 'De rien : Express détecte le proxy'], answer: 0, why: 'Derrière un proxy, `secure: true` exige aussi `app.set(\'trust proxy\', 1)`, pour qu’Express croie le proxy quand il dit que la requête est arrivée en HTTPS.' },
					{ q: 'Avec `secure: true`, que se passe-t-il sur une requête HTTP simple ?', options: ['Le cookie part sans `Secure`', 'Le serveur lève une erreur', 'Le navigateur le jette à l’arrivée', 'Le cookie n’est pas posé du tout'], answer: 3, why: 'Le README : "the cookie will not be set". C’est pour ça que les tests locaux en HTTP demandent un réglage à part.' },
					{ q: '« Seul cet hôte exact peut le poser ». Quel nom ?', options: ['`connect.sid`', '`__Host-sid`', '`__Secure-sid`', '`sid.shop.example.com`'], answer: 1, why: 'Avec le préfixe `__Host-`, le navigateur refuse le cookie s’il n’a pas `Secure`, `Path=/` et aucun `Domain`.' },
					{ q: 'Que doit porter le cookie pour qu’un nom `__Host-` soit accepté ?', options: ['`HttpOnly` et `SameSite=Strict`', '`Domain=shop.example.com`', '`Secure`, `Path=/`, et aucun `Domain`', 'Une date `Expires`'], answer: 2, why: 'Ce sont les règles de MDN. Un sous-domaine voisin ne peut alors pas poser son propre `__Host-sid` pour ton hôte.' }
				]
			},
			{
				title: 'Lis le Set-Cookie',
				questions: [
					{ q: 'Quels attributs le navigateur reçoit-il ?', options: ['`HttpOnly` et `Secure` seulement', '`Path=/`, `Expires=...`, `HttpOnly`, `Secure`, `SameSite=Lax`', '`Domain=...`, `HttpOnly`, `Secure`, `SameSite=Lax`', '`Max-Age=8h`, `HttpOnly`, `Secure`'], answer: 1, why: 'Chaque option réglée devient un attribut, et `maxAge` devient une date `Expires`.' },
					{ q: 'Comment express-session envoie-t-il la limite de 8 heures ?', options: ['Sous forme de `Max-Age=8`', 'Comme une valeur dans le cookie', 'Comme une date `Expires` : l’heure du serveur plus `maxAge`', 'Il ne l’envoie pas : seul le store l’expire'], answer: 2, why: 'Il ajoute `maxAge` à l’heure du serveur et envoie un `Expires` 8 heures plus tard.' },
					{ q: 'Avec les seuls défauts d’express-session, que manquerait-il ?', options: ['`Secure`, `SameSite` et une expiration', '`HttpOnly` et `Path`', 'Seulement `HttpOnly`', 'Rien : les défauts sont sûrs'], answer: 0, why: 'express-session pose `HttpOnly` par défaut, mais laisse `Secure` coupé et ne pose ni `SameSite` ni expiration.' },
					{ q: 'Que porte la valeur du cookie ?', options: ['L’id et le rôle de l’utilisateur, signés par le serveur', 'Le hash du mot de passe, pour vérifier chaque requête', 'Tout l’enregistrement de session, chiffré avec le secret', 'L’id de session, qui pointe vers un enregistrement sur le serveur'], answer: 3, why: 'L’utilisateur vit dans l’enregistrement de session, sous `req.session.passport.user`. Le cookie porte l’id et rien sur l’utilisateur.' }
				]
			},
			{
				title: 'Ferme la fixation de session',
				questions: [
					{ q: 'De quoi un attaquant a-t-il besoin pour une fixation de session sur Passport 0.5.3 ?', options: ['Du mot de passe de la victime, ou d’un lien de réinitialisation', 'Du secret que le serveur utilise pour signer les cookies', 'D’un accès en lecture au store de sessions sur le serveur', 'D’un moyen de faire utiliser au navigateur de la victime un id que l’attaquant détient déjà'], answer: 3, why: 'Avant la 0.6.0, l’id ne changeait pas à la connexion : la copie de l’attaquant ouvrait le compte de la victime.' },
					{ q: 'Quelle version de Passport change l’id à la connexion ?', options: ['La 0.6.0 ou plus récente', 'La 0.5.3', 'Toutes, avec `keepSessionInfo`', 'Aucune : tu dois la patcher toi-même'], answer: 0, why: 'La 0.6.0 appelle `req.session.regenerate` avant d’enregistrer l’utilisateur.' },
					{ q: 'Que fait `regenerate` dans le store ?', options: ['Il renouvelle seulement l’expiration du cookie', 'Il copie l’ancien id dans un nouveau cookie', 'Il détruit l’ancien id et en génère un nouveau', 'Il resigne l’ancien id avec un nouveau secret'], answer: 2, why: 'Il appelle `destroy(req.sessionID)`, puis `generate(req)` : l’ancien id ne pointe plus vers rien.' },
					{ q: 'Le panier rempli avant la connexion doit y survivre. Quelle option le garde ?', options: ['`saveUninitialized: true`', '`keepSessionInfo: true`', '`resave: true`', '`rolling: true`'], answer: 1, why: 'Avec `keepSessionInfo`, les données de l’ancienne session sont fusionnées dans la nouvelle. L’id, lui, est neuf.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Fais tourner les options de session de l’exercice dans une petite appli Express, lis le vrai `Set-Cookie`, et regarde l’id changer à la connexion.',
		steps: [
			'Crée un projet : `mkdir -p ~/cookie-lab && cd ~/cookie-lab && npm init -y && npm install express express-session`.',
			'Écris `app.js` : une appli Express sur `127.0.0.1:3000` avec `app.set(\'trust proxy\', 1)` et les options de session de l’exercice, avec `\'lab-secret\'` comme secret. Ajoute une route `/` qui pose `req.session.visits` et renvoie `id <id de session>`, et une route `/login` qui appelle `req.session.regenerate`, pose `req.session.user = 42` et renvoie le nouvel id de la même façon. Lance-la avec `node app.js &`.',
			'Appelle-la en HTTP simple : `curl -si localhost:3000/ | grep -iE "set-cookie|^id"`.',
			'Joue le proxy, qui dit à l’appli que la requête est arrivée en HTTPS : `curl -si -c jar -H "X-Forwarded-Proto: https" localhost:3000/ | grep -iE "set-cookie|^id"`.',
			'Renvoie ce cookie une fois : `curl -s -b jar -H "X-Forwarded-Proto: https" localhost:3000/`. Puis connecte-toi avec : `curl -si -b jar -H "X-Forwarded-Proto: https" localhost:3000/login | grep -iE "set-cookie|^id"`. Arrête l’appli avec `kill %1`.'
		],
		done: [
			'En HTTP simple, la réponse a une ligne `id` et aucun `Set-Cookie`.',
			'Avec `X-Forwarded-Proto: https`, la réponse a `Set-Cookie: __Host-sid=...; Path=/; Expires=...; HttpOnly; Secure; SameSite=Lax`, avec un `Expires` 8 heures plus tard.',
			'Renvoyé avec `-b jar`, `/` affiche le même id qu’avant : le cookie marche. L’id affiché par `/login` en diffère, et un nouveau `Set-Cookie` l’accompagne.'
		],
		solution: [
			'`const express = require(\'express\'); const session = require(\'express-session\'); const app = express(); app.set(\'trust proxy\', 1);`',
			'`app.use(session({ name: \'__Host-sid\', secret: \'lab-secret\', resave: false, saveUninitialized: false, cookie: { httpOnly: true, secure: true, sameSite: \'lax\', maxAge: 8 * 60 * 60 * 1000, path: \'/\' } }));`',
			'`app.get(\'/\', (req, res) => { req.session.visits = (req.session.visits || 0) + 1; res.send(\'id \' + req.sessionID + \'\\n\'); });`',
			'`app.get(\'/login\', (req, res) => req.session.regenerate(() => { req.session.user = 42; res.send(\'id \' + req.sessionID + \'\\n\'); }));`, puis `app.listen(3000, \'127.0.0.1\');`',
			'Avec `secure: true`, express-session ne pose aucun cookie sur une requête HTTP simple. `trust proxy` lui fait croire `X-Forwarded-Proto`, ce qui n’est sûr que si ton proxy écrase cet en-tête.',
			'`regenerate` détruit l’ancien id dans le store : un id connu de quelqu’un avant la connexion n’ouvre plus rien après.'
		]
	},
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
