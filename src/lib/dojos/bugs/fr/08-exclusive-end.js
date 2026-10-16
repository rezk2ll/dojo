const NG = 'https://github.com/angular/angular';
const PARENT = 'fadfee43247acec7e450d5cc929a0a6780a54bd1';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'exclusive-end',
	part: 'Compter',
	title: 'Un caractère après le template',
	minutes: 10,
	hook: [
		'Angular 17 fournit un schematic qui réécrit les templates `*ngIf` en blocs `@if`. Sur certains fichiers, il produisait du **HTML cassé**. Un utilisateur l’a signalé sur un template où `</ng-template></span` tenait sur une seule ligne.',
		'Pour migrer un `<ng-template>`, le schematic copie son texte source dans `contents`, écrit le nouveau bloc, puis supprime `contents` du fichier. Le texte copié faisait **un caractère de plus** que le template.'
	],
	terms: [
		{ term: 'Source span', def: 'Les offsets de début et de fin d’un élément dans le texte du template, tels que le parseur Angular les enregistre.' },
		{ term: 'Fin exclusive', def: 'Un offset de fin qui pointe juste après le dernier caractère. `slice(start, end)` s’arrête déjà avant `end`.' },
		{ term: 'Schematic', def: 'Un script de l’Angular CLI qui modifie les fichiers d’un projet, ici pour migrer les templates vers le nouveau control flow.' }
	],
	bug: {
		title: 'fix(migrations): fix off by one issue with template removal in CF migration (#53255)',
		repo: 'angular/angular',
		url: `${NG}/blob/${PARENT}/packages/core/schematics/ng-generate/control-flow-migration/types.ts#L189-L228`,
		fix: `${NG}/commit/6291c8db092c0ab67f6789cc03c19dfa0bdc251d`,
		lang: 'typescript',
		code: `export class Template {
  el: Element;
  name: string;
  count: number = 0;
  contents: string = '';
  children: string = '';
  i18n: Attribute|null = null;
  attributes: Attribute[];
…
  generateContents(tmpl: string) {
    this.contents = tmpl.slice(this.el.sourceSpan.start.offset, this.el.sourceSpan.end.offset + 1);
    this.children = '';
    if (this.el.children.length > 0) {
      this.children = tmpl.slice(
          this.el.children[0].sourceSpan.start.offset,
          this.el.children[this.el.children.length - 1].sourceSpan.end.offset);
    }
  }`,
		lines: [11],
		diff: `   generateContents(tmpl: string) {
-    this.contents = tmpl.slice(this.el.sourceSpan.start.offset, this.el.sourceSpan.end.offset + 1);
+    this.contents = tmpl.slice(this.el.sourceSpan.start.offset, this.el.sourceSpan.end.offset);
     this.children = '';`,
		notes: [
			'**La fin est déjà exclusive.** `sourceSpan.end.offset` pointe juste après le dernier `>` de `</ng-template>`, et `slice` s’arrête avant son second argument. Le `+ 1` ajoute le caractère qui suit le template. Quatre lignes plus bas, le `slice` de `children` utilise `end.offset` sans `+ 1`, et celui-là est juste.',
			'**Où part le caractère en trop.** Prends `<ng-template #elseTmpl> 0 </ng-template></span>`. Le template fait 40 caractères. S’il commence à l’offset 100, son offset de fin vaut 140, et `slice(100, 141)` prend aussi le `<` de l’offset 140. La migration lance ensuite `template.replace(t.contents, \'\')` ([util.ts](' + NG + '/blob/' + PARENT + '/packages/core/schematics/ng-generate/control-flow-migration/util.ts#L348)), qui supprime ce `<` avec le reste et laisse `/span>` dans le fichier.',
			'**Pourquoi la plupart des fichiers passaient.** Quand une espace ou un retour à la ligne suit `</ng-template>`, le caractère en trop est un blanc, et le perdre ne casse pas le HTML. Le message du commit le dit : "an extra space was being added when it was unnecessary. This resulted in malformed html if there was no space afterwards."',
			'**Comment ça s’est vu.** L’issue [#53248](' + NG + '/issues/53248), "control-flow schematic fails on some multi-line elements", avec un template qui finit par `</ng-template></span`. Le correctif retire le `+ 1`, et son test place `</span>` juste après `</ng-template>`.'
		]
	},
	quiz: [
		{
			q: 'Le template commence à l’offset 100 et fait 40 caractères. Que renvoie le `slice` bogué ?',
			options: [
				'Les offsets 100 à 140 : le template plus le `<` suivant',
				'Les offsets 100 à 139 : exactement le template',
				'Les offsets 101 à 140 : le template sans son premier `<`',
				'Les offsets 99 à 139 : le template plus l’espace d’avant'
			],
			answer: 0,
			why: 'L’offset de fin vaut 140, un après le dernier caractère. `slice(100, 141)` renvoie les offsets 100 à 140, donc le caractère en 140 vient avec.'
		},
		{
			q: 'Pourquoi la migration marchait-elle sur la plupart des templates malgré le `+ 1` ?',
			options: [
				'Le parseur renvoyait souvent un offset de fin trop petit d’un',
				'Le caractère après le template était souvent une espace ou un retour à la ligne',
				'`replace` ignore le dernier caractère quand il ne correspond pas',
				'La plupart des templates passaient par un autre chemin de code'
			],
			answer: 1,
			why: 'Supprimer un blanc après `</ng-template>` laisse un HTML valide. Seule une balise écrite juste après, comme `</span>`, perd son `<`.'
		},
		{
			q: 'Quelle entrée de test révèle ce décalage d’un sur la fin d’une plage ?',
			options: [
				'Un template qui est le seul élément du fichier',
				'Un template suivi d’un retour à la ligne et d’une balise indentée',
				'Un template suivi directement d’une balise fermante, sans espace',
				'Un template qui ne contient aucun enfant'
			],
			answer: 2,
			why: 'Sans blanc après le template, le caractère en trop est le `<` de la balise suivante. C’est l’entrée que le commit de correction a ajoutée en test.'
		}
	],
	takeaway: 'Avant d’ajouter 1 à un offset de fin, vérifie si l’API te donne déjà la position après le dernier caractère. Teste avec quelque chose écrit juste après la plage, sans espace entre les deux.',
	sources: [
		{ title: 'angular, pull request #53255', url: `${NG}/pull/53255` },
		{ title: 'angular, issue #53248', url: `${NG}/issues/53248` }
	]
};
