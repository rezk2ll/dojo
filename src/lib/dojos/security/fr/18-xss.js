const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/html/template';
const ADVISORY = 'https://github.com/grafana/grafana/security/advisories/GHSA-vw7q-p2qg-4m5f';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'xss',
	part: 'Les entrées et les sorties',
	title: 'Le cross-site scripting (XSS)',
	minutes: 10,
	hook: [
		'Le 19 juin 2022 à 10 h 32 UTC, un chercheur signale à Grafana une XSS stockée dans la fonction Unified Alerting. Grafana confirme le lendemain et publie le correctif le 14 juillet, dans les versions 9.0.3, 8.5.9, 8.4.10 et 8.3.10 (CVE-2022-31097, CVSS 7.3).',
		'L’impact, selon l’avis : un attaquant pouvait « escalate privilege from editor to admin by tricking an authenticated admin to click on a link ». Dans une XSS stockée, Grafana enregistrait la saisie de l’Editor puis la servait dans une page. Quand un Admin ouvrait cette page, le script tournait dans son navigateur connecté.'
	],
	terms: [
		{ term: 'XSS stockée', def: 'Le script est enregistré sur le serveur, dans un commentaire ou un champ de profil, puis envoyé à chaque visiteur qui ouvre la page qui l’affiche.' },
		{ term: 'XSS réfléchie', def: 'Le script voyage dans la requête, par exemple `/search?q=<script>…`, et le serveur le recopie dans la réponse. La victime le reçoit en cliquant sur un lien piégé.' },
		{ term: 'Échappement contextuel', def: 'Encoder une valeur pour l’endroit exact où elle est insérée : texte HTML, attribut, URL ou chaîne JavaScript. Chaque endroit demande un encodage différent.' },
		{ term: 'Porte de sortie', def: 'Une fonction du framework qui insère une chaîne sans aucun échappement : `template.HTML` en Go, `{@html}` en Svelte, `dangerouslySetInnerHTML` en React.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["L’attaquant enregistre un commentaire : une balise img avec src=x et un gestionnaire onerror"] --> db[("table comments")]'],
				highlight: ['post', 'db'],
				note: 'La charge classique : une image à la source cassée avec un gestionnaire `onerror`. Le serveur range le commentaire comme du texte. Rien ne s’est encore exécuté.'
			},
			{
				add: ['db --> concat["Le serveur construit la page par concaténation : div ouvrante + commentaire + div fermante"]', 'concat --> run["Le navigateur de la victime lit une balise img et lance onerror"]'],
				highlight: ['concat', 'run'],
				note: 'La page place le commentaire entre deux balises sans l’encoder. Le navigateur ne distingue pas le commentaire du balisage de la page : il crée un élément `<img>` et lance le gestionnaire. Le script tourne dans la page du site, au nom de la victime. L’OWASP cite l’« account impersonation » (l’usurpation du compte) parmi les effets.'
			},
			{
				add: ['link["Réfléchie : une balise script dans /search?q=, envoyée en lien"] --> concat'],
				highlight: ['link'],
				note: 'La variante réfléchie se passe de la base. Le serveur recopie le paramètre `q` dans « Aucun résultat pour ... », et l’attaquant envoie le lien par e-mail ou depuis un autre site. L’OWASP : « the injected script is reflected off the web server ».'
			},
			{
				add: ['db --> esc["html/template : {{.}} dans du texte passe par l’échappeur HTML"]', 'esc --> text["Le navigateur affiche la balise img comme des caractères"]'],
				highlight: ['esc', 'text'],
				note: 'Avec `html/template` en Go, `<div>{{.}}</div>` fait passer la valeur par l’échappeur HTML. Il écrit `<` en `&lt;` et `>` en `&gt;` : le navigateur affiche les caractères et ne crée aucun élément.'
			},
			{
				add: ['esc --> ctx["La même valeur dans un href, une chaîne JS, un onclick : un échappeur différent pour chacun"]'],
				highlight: ['ctx'],
				note: 'L’échappeur HTML seul ne convient pas dans `<script>` ni dans `href`. La fiche OWASP : « There are many different output encoding methods because browsers parse HTML, JS, URLs, and CSS differently. » `html/template` suit la position de chaque `{{.}}` et choisit l’échappeur de cet endroit.'
			}
		]
	},
	example: {
		title: 'src/html/template/escape.go : escapeAction choisit les échappeurs selon le contexte',
		repo: 'golang/go',
		url: `${GO}/escape.go#L202-L279`,
		lang: 'go',
		code: `	s := make([]string, 0, 3)
	switch c.state {
	case stateError:
		return c
	case stateURL, stateCSSDqStr, stateCSSSqStr, stateCSSDqURL, stateCSSSqURL, stateCSSURL:
		switch c.urlPart {
		case urlPartNone:
			s = append(s, "_html_template_urlfilter")
			fallthrough
		case urlPartPreQuery:
			switch c.state {
			case stateCSSDqStr, stateCSSSqStr:
				s = append(s, "_html_template_cssescaper")
			default:
				s = append(s, "_html_template_urlnormalizer")
			}
		case urlPartQueryOrFrag:
			s = append(s, "_html_template_urlescaper")
…
	case stateJS:
		s = append(s, "_html_template_jsvalescaper")
		// A slash after a value starts a div operator.
		c.jsCtx = jsCtxDivOp
	case stateJSDqStr, stateJSSqStr:
		s = append(s, "_html_template_jsstrescaper")
	case stateJSTmplLit:
		s = append(s, "_html_template_jstmpllitescaper")
	case stateJSRegexp:
		s = append(s, "_html_template_jsregexpescaper")
	case stateCSS:
		s = append(s, "_html_template_cssvaluefilter")
	case stateText:
		s = append(s, "_html_template_htmlescaper")
	case stateRCDATA:
		s = append(s, "_html_template_rcdataescaper")
…
	switch c.delim {
	case delimNone:
		// No extra-escaping needed for raw text content.
	case delimSpaceOrTagEnd:
		s = append(s, "_html_template_nospaceescaper")
	default:
		s = append(s, "_html_template_attrescaper")
	}
	e.editActionNode(n, s)
	return c`,
		notes: [
			'`c.state` indique où se trouve l’analyseur quand il atteint `{{.}}` : texte HTML, URL, chaîne JavaScript. Les lignes 32 et 33, `stateText`, couvrent le cas simple entre deux balises : l’échappeur HTML, et rien d’autre.',
			'La ligne 8 ajoute `urlfilter` quand la valeur commence une URL, comme dans `href="{{.}}"`. [`isSafeURL`](' + GO + '/url.go#L45-L54) accepte les URL relatives et les schémas `http`, `https` et `mailto`. Tout le reste, comme `javascript:alert(1)`, est remplacé par `#ZgotmplZ`.',
			'La ligne 24, `stateJSDqStr`, traite une valeur dans une chaîne JavaScript entre guillemets doubles. L’échappeur de chaînes JS écrit `"` en `\\u0022` et `<` en `\\u003c` : la valeur ne peut fermer ni la chaîne ni la balise `<script>`.',
			'Les lignes 37 à 44 ajoutent une couche pour les attributs. Dans un attribut entre guillemets, `attrescaper` encode les guillemets pour que la valeur ne puisse pas terminer l’attribut. La [doc du paquet](' + GO + '/doc.go#L60-L73) montre le résultat : à l’analyse, `href="/search?q={{.}}"` est réécrit en `{{. | urlescaper | attrescaper}}`.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque `{{.}}` est échappé pour son emplacement, sans appel à écrire. Un développeur qui oublie reste protégé.',
			'`href="{{.}}"` bloque les URL `javascript:` par défaut, un trou que l’échappeur HTML seul laisse ouvert.'
		],
		cost: [
			'`template.HTML` saute tout échappement. La doc de Go : « the encapsulated content should come from a trusted source, as it will be included verbatim in the template output. » Le `{@html}` de Svelte fait pareil : « Never render unsanitized content. »',
			'L’échappement n’existe qu’avec `html/template`. Le même gabarit analysé avec `text/template` affiche `<script>` tel quel, et seule la ligne d’import change.',
			'Le code qui construit du HTML hors du gabarit, avec `innerHTML` dans le navigateur ou par concaténation sur le serveur, n’a aucun échappement.'
		]
	},
	task: {
		prompt: 'Prédis la sortie. Un handler Go utilise `html/template` avec `<p>Hello {{.Name}}</p>`, `<a href="{{.Site}}">site</a>`, `<script>var user = "{{.Name}}";</script>` et `<div>{{.Bio}}</div>`. Les données : `Name` vaut `<b>"Bob"</b>`, `Site` vaut `javascript:alert(1)`, et `Bio` est un `template.HTML` construit à partir du texte d’un utilisateur, `<img src=x onerror=alert(1)>`. Quelle ligne est le trou ?',
		hint: 'Trois valeurs sont des chaînes simples, une a un type spécial. Quel échappeur reçoit chaque emplacement ?',
		answer: [
			'Ligne 1, texte HTML : `Hello &lt;b&gt;&#34;Bob&#34;&lt;/b&gt;`. Le navigateur affiche les balises comme des caractères.',
			'Ligne 2, début d’URL : `href="#ZgotmplZ"`. `javascript:` n’est ni `http`, ni `https`, ni `mailto`, donc `urlfilter` remplace toute la valeur.',
			'Ligne 3, chaîne JavaScript : `"\\u003cb\\u003e\\u0022Bob\\u0022\\u003c\\/b\\u003e"`. Les guillemets ne ferment pas la chaîne, et `</` ne ferme pas le script. Sortie vérifiée avec Go 1.24.',
			'La ligne 4 est le trou : `<div><img src=x onerror=alert(1)></div>`, recopié tel quel parce que `template.HTML` le marque comme sûr. Correction : passe `Bio` en `string` simple, ou fais-le passer par un nettoyeur HTML avant la conversion.'
		]
	},
	quiz: [
		{
			q: 'Un site échappe `<`, `>`, `&` et les guillemets dans chaque valeur. Un utilisateur met `javascript:alert(1)` comme page perso, et la page affiche `<a href="...">`. Que se passe-t-il au clic ?',
			options: [
				'Rien, l’échappeur HTML a déjà encodé les deux-points',
				'Le script s’exécute : aucun de ces caractères n’est dans la valeur',
				'Le navigateur bloque, car `javascript:` est interdit dans `href`',
				'Le lien ouvre une page blanche, car les guillemets sont échappés'
			],
			answer: 1,
			why: 'L’échappement HTML encode `<`, `>`, `&` et les guillemets, et `javascript:alert(1)` n’en contient aucun. Une URL demande son propre contrôle du schéma : c’est le rôle de `urlfilter` dans `html/template`, qui sort `#ZgotmplZ`.'
		},
		{
			q: 'Qu’est-ce qui rend une XSS « stockée » plutôt que « réfléchie » ?',
			options: [
				'Le script est enregistré sur le serveur et servi à tous ceux qui ouvrent la page',
				'Le script est dans une balise `<script>`, pas dans un gestionnaire d’événement',
				'Le script lit des cookies stockés dans le navigateur',
				'Le script est mis en cache par un CDN devant le serveur'
			],
			answer: 0,
			why: 'L’OWASP : une attaque stockée est celle où « the injected script is permanently stored on the target servers », comme un champ de commentaire. Dans une XSS réfléchie, le script arrive dans la requête et la victime doit ouvrir un lien piégé. La balise utilisée ne change pas le type.'
		},
		{
			q: 'En Svelte, quelle ligne peut exécuter un script venu de `comment`, une chaîne tapée par un visiteur ?',
			options: [
				'`<p>{comment}</p>`',
				'`<p>{comment.trim()}</p>`',
				'`<p>{@html comment}</p>`',
				'`<p>{String(comment)}</p>`'
			],
			answer: 2,
			why: 'Pour une expression texte, la doc de Svelte dit : « The expression will be stringified and escaped to prevent code injections. » `{@html}` saute cette étape et insère la chaîne comme du HTML brut : le navigateur crée un vrai élément à partir d’un `<img onerror>` dans `comment`.'
		}
	],
	recall: {
		q: 'Que sort `html/template` en Go pour `<a href="{{.}}">` quand la valeur est `javascript:alert(1)`, et pourquoi ?',
		a: '`href="#ZgotmplZ"`. Une valeur en début d’URL passe par `urlfilter`, qui n’accepte que les URL relatives et les schémas `http`, `https` et `mailto`.'
	},
	sources: [
		{ title: 'Avis Grafana GHSA-vw7q-p2qg-4m5f (CVE-2022-31097), XSS stockée dans Unified Alerting', url: ADVISORY },
		{ title: 'Code Go, documentation du paquet html/template (doc.go)', url: `${GO}/doc.go` },
		{ title: 'Code Go, html/template content.go : le type HTML', url: `${GO}/content.go#L27-L35` },
		{ title: 'OWASP Cross Site Scripting Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html' },
		{ title: 'OWASP, Cross Site Scripting (XSS) : attaques stockées et réfléchies', url: 'https://owasp.org/www-community/attacks/xss/' },
		{ title: 'Doc Svelte, {@html ...}', url: 'https://svelte.dev/docs/svelte/@html' }
	]
};
