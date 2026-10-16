const GO = 'https://github.com/golang/go';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'string-length',
	part: 'Compter',
	title: 'Deux caractères, six octets',
	minutes: 10,
	hook: [
		'Un programme Go est compilé pour WebAssembly et lancé sous Node avec `node wasm_exec.js main.wasm hello 世界`. Il plante avant même que `main` démarre, avec **"RangeError: Source is too large"**. Le même programme lancé avec `hello world` affiche bien ses arguments.',
		'Avant de lancer Go, `wasm_exec.js` copie chaque argument dans la mémoire WebAssembly, en octets UTF-8 suivis d’un octet nul. Ensuite il avance `offset` pour que l’argument suivant commence sur un multiple de 8.'
	],
	terms: [
		{ term: 'Unité de code UTF-16', def: 'Ce dont sont faites les chaînes JavaScript. `str.length` compte ces unités, pas des octets.' },
		{ term: 'UTF-8', def: 'Un encodage où un caractère ASCII prend 1 octet et les autres 2 à 4. `世` en prend 3.' },
		{ term: 'TextEncoder', def: 'L’API du navigateur et de Node dont la méthode `encode` transforme une chaîne en ses octets UTF-8, dans un `Uint8Array`.' },
		{ term: 'Vue Uint8Array', def: '`new Uint8Array(buffer, offset, n)` est une fenêtre de `n` octets sur une mémoire existante. `set` copie dedans et lève une erreur si la source est plus longue.' }
	],
	bug: {
		title: 'misc/wasm: fix command line arguments containing multi-byte characters',
		repo: 'golang/go',
		url: `${GO}/blob/cbf90b0028265a6195257e31a03aae42d402dd64/misc/wasm/wasm_exec.js#L412-L429`,
		fix: `${GO}/commit/9308637e3c2babcb3695d9f9673cf2a2b840362d`,
		lang: 'javascript',
		code: `const mem = new DataView(this._inst.exports.mem.buffer)

// Pass command line arguments and environment variables to WebAssembly by writing them to the linear memory.
let offset = 4096;

const strPtr = (str) => {
	let ptr = offset;
	new Uint8Array(mem.buffer, offset, str.length + 1).set(encoder.encode(str + "\\0"));
	offset += str.length + (8 - (str.length % 8));
	return ptr;
};

const argc = this.argv.length;

const argvPtrs = [];
this.argv.forEach((arg) => {
	argvPtrs.push(strPtr(arg));
});`,
		lines: [8, 9],
		diff: ` const strPtr = (str) => {
-	let ptr = offset;
-	new Uint8Array(mem.buffer, offset, str.length + 1).set(encoder.encode(str + "\\0"));
-	offset += str.length + (8 - (str.length % 8));
+	const ptr = offset;
+	const bytes = encoder.encode(str + "\\0");
+	new Uint8Array(mem.buffer, offset, bytes.length).set(bytes);
+	offset += bytes.length;
+	if (offset % 8 !== 0) {
+		offset += 8 - (offset % 8);
+	}
 	return ptr;
 };`,
		notes: [
			'**Deux longueurs, deux unités.** `str.length` compte des unités UTF-16. `encoder.encode` renvoie des octets UTF-8. La vue est dimensionnée avec la première et remplie avec la seconde. Pour du texte ASCII, les deux donnent le même nombre, donc `hello world` passe.',
			'**Où ça casse.** Prends `世界`. `str.length` vaut 2, donc la vue fait 2 + 1 = **3 octets**. Chaque caractère prend 3 octets en UTF-8, donc `encode("世界\\0")` renvoie **7 octets**. `set` ne peut pas copier 7 octets dans une fenêtre de 3 et lève "Source is too large".',
			'**La ligne 9 fait la même erreur.** Elle avance `offset` du nombre de caractères. Si seule la ligne 8 était corrigée, `ééééééé` (7 caractères, 14 octets plus l’octet nul) écrirait 15 octets, et `offset` n’avancerait que de 7 + 1 = 8. L’argument suivant commencerait au milieu de celui-ci et écraserait ses 7 derniers octets.',
			'**Le correctif.** Il encode une seule fois et utilise `bytes.length` pour la vue comme pour l’offset. Puis il arrondit `offset` au multiple de 8 suivant, seulement s’il n’en est pas déjà un.',
			'**Comment ça s’est vu.** Issue [#31645](' + GO + '/issues/31645), "misc/wasm: wrong string length in strPtr function in wasm_exec.js". Le rapporteur l’a montré dans le REPL de Node : `"世界".length` donne 2 et les octets encodés ont une longueur de 6.'
		]
	},
	quiz: [
		{
			q: 'L’argument est `世界`. Quelles tailles se rencontrent dans l’appel à `set` bogué ?',
			options: [
				'Une vue de 3 octets et 7 octets encodés',
				'Une vue de 7 octets et 3 octets encodés',
				'Une vue de 2 octets et 6 octets encodés',
				'Une vue de 7 octets et 7 octets encodés'
			],
			answer: 0,
			why: '`str.length + 1` vaut 2 + 1 = 3. L’encodage UTF-8 de `世界` plus l’octet nul fait 3 + 3 + 1 = 7 octets.'
		},
		{
			q: 'Pourquoi le code marche-t-il avec des arguments comme `-test.v` ?',
			options: [
				'TextEncoder renvoie des unités UTF-16 pour du texte ASCII',
				'En ASCII, `length` et le nombre d’octets UTF-8 sont égaux',
				'Node complète chaque chaîne à 8 octets avant de l’encoder',
				'L’octet nul est retiré quand le texte est en ASCII'
			],
			answer: 1,
			why: 'Chaque caractère ASCII fait une unité UTF-16 et un octet UTF-8. Les deux comptes ne divergent qu’à partir d’un caractère hors ASCII.'
		},
		{
			q: 'Tu dimensionnes un buffer pour la forme encodée d’une chaîne. Quelle entrée de test attrape ce genre de bug ?',
			options: [
				'Une longue chaîne ASCII proche de la limite du buffer',
				'Une chaîne vide, pour que le buffer ne contienne que l’octet nul',
				'Une chaîne avec des caractères hors ASCII, comme é ou 世',
				'Une chaîne avec des espaces et des tabulations au milieu'
			],
			answer: 2,
			why: 'Seuls les caractères hors ASCII rendent la taille encodée différente du nombre de caractères. Avec les autres entrées, les deux comptes restent égaux.'
		}
	],
	takeaway: 'Quand tu dimensionnes un buffer ou avances un offset pour du texte encodé, prends la longueur des octets encodés, pas celle de la chaîne. Teste avec au moins un caractère hors ASCII.',
	sources: [
		{ title: 'go, issue #31645', url: `${GO}/issues/31645` },
		{ title: 'La revue, CL 173877', url: 'https://go-review.googlesource.com/c/go/+/173877' }
	]
};
