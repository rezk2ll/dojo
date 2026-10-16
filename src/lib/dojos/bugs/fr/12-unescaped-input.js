const HUGO = 'https://github.com/gohugoio/hugo';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'unescaped-input',
	part: 'Les entrées',
	title: 'Un guillemet dans l’ID d’un titre',
	minutes: 10,
	hook: [
		'Dans Hugo, un titre Markdown peut fixer son propre ID : `## Intro {id="intro"}`. Une page contient ce titre à la place : `## Intro {id="x\\"><img src=x onerror=alert(1)><a class=\\""}`.',
		'Le titre lui-même sort sans danger : `<h2 id="x&quot;&gt;&lt;img ...">`. La table des matières de la même page, affichée avec `{{ .TableOfContents }}`, contient **un vrai élément `<img>`**. Son gestionnaire `onerror` s’exécute au chargement de la page.'
	],
	terms: [
		{ term: 'Table des matières (ToC)', def: 'La liste des liens vers les titres d’une page. Hugo construit son HTML dans `tocBuilder` en écrivant des chaînes dans un buffer.' },
		{ term: 'Sortie d’attribut', def: 'Une valeur placée dans `attr="..."` qui contient un `"`. Le guillemet ferme l’attribut trop tôt et le reste est lu comme du nouveau HTML.' },
		{ term: 'template.HTMLEscapeString', def: 'Une fonction Go qui remplace `<`, `>`, `&`, `\'` et `"` par des entités HTML, pour que le navigateur les lise comme du texte.' }
	],
	bug: {
		title: 'markup/tableofcontents: Escape heading IDs in ToC HTML',
		repo: 'gohugoio/hugo',
		url: `${HUGO}/blob/c7e1a8e639bc6569af5fe1ae8157e973b9721813/markup/tableofcontents/tableofcontents.go#L242-L256`,
		fix: `${HUGO}/commit/671fbf2c11ef721996dc3fcb7dd6dd0d8d2ac8df`,
		lang: 'go',
		code: `func (b *tocBuilder) writeHeading(level, indent int, h *Heading) {
	b.indent(indent)
	b.s.WriteString("<li>")
	if !h.IsZero() {
		b.s.WriteString("<a href=\\"#" + h.ID + "\\">" + h.Title + "</a>")
	}
	b.writeHeadings(level, indent, h.Headings)
	b.s.WriteString("</li>\\n")
}

func (b *tocBuilder) indent(n int) {
	for range n {
		b.s.WriteString("  ")
	}
}`,
		lines: [5],
		diff: ` 	if !h.IsZero() {
-		b.s.WriteString("<a href=\\"#" + h.ID + "\\">" + h.Title + "</a>")
+		b.s.WriteString("<a href=\\"#" + template.HTMLEscapeString(h.ID) + "\\">" + h.Title + "</a>")
 	}`,
		notes: [
			'**L’ID entre tel quel.** La ligne 5 colle `h.ID` entre `href="#` et `">` avec `+`. Rien entre les deux ne touche à un guillemet ou à un `<`. Le message du commit le dit : "Explicit heading IDs (e.g. `## Foo {id="..."}`) were written unescaped into the ToC href, allowing attribute breakout."',
			'**Ce que lit le navigateur.** Avec l’ID du début, la ligne 5 écrit `<a href="#x"><img src=x onerror=alert(1)><a class="">Intro</a>`. Le premier `"` ferme `href`. Le `>` ferme le lien. Vient ensuite un `<img>` dont la source `x` ne se charge pas, donc `onerror` s’exécute.',
			'**Pourquoi le titre était sûr.** Le `<h2>` est écrit par un autre moteur de rendu qui échappe ses attributs, et le correctif n’y touche pas. Seule cette fonction construit son HTML en collant des chaînes, donc seule la ToC a laissé passer le guillemet.',
			'**Le correctif.** `template.HTMLEscapeString(h.ID)` transforme le même ID en `x&#34;&gt;&lt;img src=x onerror=alert(1)&gt;&lt;a class=&#34;`. Le test ajouté avec lui vérifie aussi que `a&b<c>` devient `a&amp;b&lt;c&gt;` et que la page ne contient aucun `<img src=x`.'
		]
	},
	quiz: [
		{
			q: 'L’ID vaut `x"><img src=x onerror=alert(1)><a class="`. Que met la ToC boguée dans la page ?',
			options: [
				'Un lien dont le `href` contient tout l’ID en texte brut',
				'Un lien fermé trop tôt, suivi d’un vrai élément `<img>`',
				'Rien, car Hugo refuse les ID qui contiennent des guillemets',
				'Un lien dont les guillemets sont devenus des entités `&quot;`'
			],
			answer: 1,
			why: 'Le premier `"` de l’ID termine la valeur de `href` et `>` termine la balise `<a>`. Le navigateur lit ensuite `<img src=x onerror=alert(1)>` comme un nouvel élément.'
		},
		{
			q: 'Le même ID était sans danger dans le `<h2>` de la page. Pourquoi ?',
			options: [
				'Les navigateurs n’exécutent pas d’événements dans un titre',
				'La ToC est construite avant que les ID soient analysés',
				'Hugo retire `onerror` des attributs des titres',
				'Son moteur échappe l’ID ; la ToC colle des chaînes'
			],
			answer: 3,
			why: 'Le correctif ne change que `writeHeading` dans le constructeur de la ToC. La sortie `<h2 id="x&quot;...">` était déjà échappée par le moteur qui écrit les titres.'
		},
		{
			q: 'Tu écris un test pour une fonction qui construit du HTML à partir de chaînes. Quelle valeur utiliser ?',
			options: [
				'Un ID avec `"`, `<` et `&`, comparé à une sortie échappée',
				'Un ID très long, pour vérifier que le buffer grandit',
				'Un ID en minuscules seulement, pour vérifier le lien',
				'Deux titres avec le même ID, pour vérifier les doublons'
			],
			answer: 0,
			why: 'Seuls les caractères qui ont un sens en HTML montrent si la valeur est échappée. Dans un attribut, c’est le guillemet qui compte le plus.'
		}
	],
	takeaway: 'Quand du code construit du HTML en collant des chaînes, fais passer chaque valeur qu’un auteur ou un utilisateur contrôle par une fonction d’échappement. Dans un attribut, c’est le `"` qui permet d’en sortir.',
	sources: [
		{ title: 'Le commit du correctif, avec son test', url: `${HUGO}/commit/671fbf2c11ef721996dc3fcb7dd6dd0d8d2ac8df` }
	]
};
