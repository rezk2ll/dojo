const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';
const PERMS = 'https://code.claude.com/docs/en/permissions';
const MODES = 'https://code.claude.com/docs/en/permission-modes';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'permissions',
	part: 'Claude Code',
	title: 'Les modes de permission',
	minutes: 10,
	hook: [
		'Tu demandes à Claude Code de réparer un test qui échoue. Il demande avant de modifier `src/cart.ts`, avant `npm test`, puis encore avant la modification suivante. À la quinzième demande, tu appuies sur Entrée sans lire la commande.',
		'Toutes ces demandes viennent d’un seul réglage : le mode de permission. **Dans un fichier JSON, tu choisis ce qui tourne sans demander, outil par outil et commande par commande.** Le même fichier peut aussi bloquer une commande dans tous les modes.'
	],
	terms: [
		{ term: 'Mode de permission', def: 'Le réglage de base qui décide quels appels d’outils attendent ton accord. Le CLI passe de `default` (affiché Manual) à `acceptEdits` puis à `plan` avec `Shift+Tab`.' },
		{ term: 'Règle de permission', def: 'Une chaîne comme `Bash(npm run *)` ou `Read(./.env)` dans la liste `allow`, `ask` ou `deny` d’un fichier de réglages. Elle nomme un outil et, entre parenthèses, les usages qu’elle vise.' },
		{ term: 'Réglages gérés', def: 'Un fichier `managed-settings.json` ou une politique MDM qu’une organisation déploie sur chaque machine. Aucun réglage utilisateur, projet ou en ligne de commande ne peut écraser une clé qu’il fixe.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['call["Claude veut lancer : git push origin main"] --> deny{"Une règle deny correspond ?"}', 'deny -->|"oui"| blocked["Bloqué, dans tous les modes"]'],
				highlight: ['call', 'deny', 'blocked'],
				note: 'Le client Claude Code compare chaque appel d’outil aux règles avant de le lancer. Les règles deny passent en premier, tous fichiers de réglages confondus. Un `deny` de `Bash(git push *)` dans tes réglages utilisateur bloque le push même si le projet l’autorise, et même en mode `bypassPermissions`.'
			},
			{
				add: ['deny -->|"non"| ask{"Une règle ask correspond ?"}', 'ask -->|"oui"| prompt["Tu reçois une demande"]'],
				highlight: ['ask', 'prompt'],
				note: 'La doc : "Rules are evaluated in order: deny, then ask, then allow." Une règle ask sur `Bash(git push *)` déclenche une demande même si une règle allow sur `Bash(git push origin main)` correspond aussi. La doc range les règles ask explicites parmi les actions qu’aucun mode n’approuve tout seul, `bypassPermissions` compris.'
			},
			{
				add: ['ask -->|"non"| allow{"Une règle allow correspond ?"}', 'allow -->|"oui"| run["Tourne sans demande"]'],
				highlight: ['allow', 'run'],
				note: 'Une règle allow comme `Bash(npm run *)` laisse `npm run build` tourner sans demande. Tout ce qui précède le premier `*` doit correspondre tel quel : `Bash(git log *)` ne couvre que `git log`, et `Bash(git *)` couvre toutes les commandes git.'
			},
			{
				add: ['allow -->|"non"| mode{"Mode de permission"}', 'mode -->|"default"| prompt', 'mode -->|"acceptEdits : modification, mkdir, mv dans le projet"| run', 'mode -->|"plan : modification du code"| blocked'],
				highlight: ['mode'],
				note: 'Quand aucune règle ne correspond, c’est le mode qui tranche. `default` ne laisse passer que les lectures et demande pour le reste. `acceptEdits` laisse aussi passer les modifications de fichiers et `mkdir`, `touch`, `rm`, `mv`, `cp` et `sed` sur les chemins du dossier de travail. `plan` laisse Claude lire et explorer, mais bloque les modifications du code tant que tu n’as pas validé le plan.'
			},
			{
				add: ['prompt -->|"Oui, et ne plus demander"| saved[".claude/settings.local.json à la racine du dépôt"]'],
				highlight: ['saved'],
				note: 'Si tu réponds « Yes, and don\'t ask again » à une commande Bash, Claude Code enregistre une règle dans `.claude/settings.local.json` à la racine du dépôt git, et les sessions suivantes de ce dépôt l’utilisent. L’accord pour une modification de fichier n’est pas enregistré : il dure jusqu’à la fin de la session.'
			}
		]
	},
	example: {
		title: 'examples/settings/settings-strict.json dans anthropics/claude-code',
		repo: 'anthropics/claude-code',
		url: `${CC}/examples/settings/settings-strict.json#L1-L14`,
		lang: 'json',
		code: `{
  "permissions": {
    "disableBypassPermissionsMode": "disable",
    "ask": [
      "Bash"
    ],
    "deny": [
      "WebSearch",
      "WebFetch"
    ]
  },
  "allowManagedPermissionRulesOnly": true,
  "allowManagedHooksOnly": true,
  "strictKnownMarketplaces": [],`,
		notes: [
			'La ligne 3 empêche quiconque d’entrer en `bypassPermissions`. D’après la référence des réglages, Claude Code "then rejects the `--dangerously-skip-permissions` flag".',
			'Les lignes 4 à 6 mettent le nom nu `Bash` dans `ask`, ce qui vise toutes les commandes Bash. Les commandes en lecture seule comme `ls` et `cat` passent d’habitude sans demande, et la doc indique qu’une règle `ask` ou `deny` est le moyen de les faire demander.',
			'Les lignes 7 à 10 refusent `WebSearch` et `WebFetch` sans parenthèses. Un nom d’outil nu dans `deny` retire l’outil du contexte de Claude, qui ne le voit plus du tout. Une règle ciblée comme `Bash(rm *)` garde l’outil et bloque seulement les appels qui correspondent.',
			'La ligne 12 ne marche que dans les réglages gérés. Avec elle, Claude Code ignore les règles `allow`, `ask` et `deny` des fichiers utilisateur, projet et local, et cache les choix « ne plus demander » : les trois règles au-dessus sont les seules.'
		]
	},
	tradeoff: {
		gain: [
			'Claude Code applique une règle `deny` avant que l’outil tourne, quoi que le prompt ou `CLAUDE.md` aient dit à Claude.',
			'`acceptEdits` supprime la demande pour chaque modification dans le dossier de travail, et tu relis le résultat avec `git diff` ensuite.',
			'Un `.claude/settings.json` commité donne à toute l’équipe les mêmes listes allow et deny. Ses règles allow ne s’appliquent qu’après que chacun a accepté la fenêtre de confiance du dossier.'
		],
		cost: [
			'`Bash(git push *)` dans `deny` arrête `git push origin main` mais pas `git -C . push origin main` ni `git \'push\' origin main`, car une règle Bash compare le texte de la commande.',
			'Une règle allow large comme `Bash(git *)` autorise aussi `git push` et `git reset --hard`.',
			'`bypassPermissions` saute les demandes même pour les écritures dans `.git` et `.claude`, et la doc le réserve aux conteneurs et aux VM.'
		]
	},
	task: {
		prompt: 'Écris le `.claude/settings.json` d’un dépôt où Claude peut lancer n’importe quel script `npm run` et `git commit` sans demander, doit demander avant `git push`, ne doit jamais lire `.env`, et démarre chaque session en mode plan. Dis ensuite ce qui se passe quand Claude lance `git -C . push origin main`.',
		hint: 'Il te faut les listes `allow`, `ask` et `deny` et une clé `defaultMode`. Pour la dernière partie, compare le texte `git -C . push` à la règle `Bash(git push *)`.',
		answer: [
			'`{ "permissions": { "allow": ["Bash(npm run *)", "Bash(git commit *)"], "ask": ["Bash(git push *)"], "deny": ["Read(./.env)"], "defaultMode": "plan" } }`.',
			'`npm run test` et `git commit -m "fix"` tournent sans demande. `git push origin main` demande même après validation du plan, car les règles ask passent avant les règles allow et aucun mode ne les approuve tout seul.',
			'`Read(./.env)` bloque l’outil Read sur `.env`, et aussi `cat .env` ou `head .env` en Bash. Elle n’arrête pas `grep -r KEY .` ni un script Node qui ouvre le fichier lui-même. Le sandbox bloque ces cas au niveau de l’OS.',
			'`git -C . push origin main` ne correspond pas à `Bash(git push *)`, car la règle compare le texte `git push`. Sans autre règle, c’est le mode qui tranche : le mode plan demande ou passe la commande au classifieur, et le mode Manual demande.'
		],
		steps: [
			{
				title: 'Écris la liste allow',
				questions: [
					{ q: 'Quelle règle laisse tourner n’importe quel script `npm run` sans demande ?', options: ['`Bash(npm run)`', '`Bash(npm *)`', '`Bash(npm run *)`', '`Bash(run *)`'], answer: 2, why: '`npm run` puis `*` couvre `npm run build`, `npm run test` et tous les autres scripts, et rien d’autre.' },
					{ q: 'Quelle règle autorise `git commit -m "fix"` et aucune autre commande git ?', options: ['`Bash(git commit)`', '`Bash(git commit *)`', '`Bash(git *)`', '`Bash(commit *)`'], answer: 1, why: 'Le `*` après `git commit` couvre n’importe quel message et options. Sans lui, seule la commande nue correspond.' },
					{ q: 'Pourquoi ne pas autoriser `Bash(git *)` et en finir ?', options: ['Les jokers sont interdits dans les règles allow', 'Elle ne correspond à aucune commande git', 'Elle bloquerait `git commit`', 'Elle autorise aussi `git push` et `git reset --hard`'], answer: 3, why: 'Une règle allow large couvre toutes les commandes qui commencent par le même texte.' },
					{ q: 'Dans une règle comme `Bash(git log *)`, qu’en est-il du texte avant le `*` ?', options: ['Il doit correspondre tel quel', 'Il est ignoré', 'Ses mots peuvent venir dans n’importe quel ordre', 'Seul le premier mot doit correspondre'], answer: 0, why: 'Tout ce qui précède le premier `*` doit correspondre tel quel, donc `Bash(git log *)` ne couvre que `git log`.' }
				]
			},
			{
				title: 'Ajoute les règles ask et deny',
				questions: [
					{ q: 'Où va `Bash(git push *)` ?', options: ['Dans `allow`', 'Dans `ask`', 'Dans `deny`', 'Dans `defaultMode`'], answer: 1, why: 'La tâche veut une demande avant chaque push, pas un blocage.' },
					{ q: 'Quelle entrée empêche Claude de lire `.env` ?', options: ['`Read(./.env)` dans `ask`', '`Edit(./.env)` dans `deny`', '« Never read .env » dans CLAUDE.md', '`Read(./.env)` dans `deny`'], answer: 3, why: 'Une règle deny est appliquée par le client avant que l’outil tourne.' },
					{ q: '`Read(./.env)` en deny arrête-t-il aussi `cat .env` en Bash ?', options: ['Non, elle ne couvre que l’outil Read', 'Oui, elle bloque aussi `cat .env` et `head .env`', 'Seulement en mode plan', 'Seulement avec le sandbox'], answer: 1, why: 'La réponse range `cat .env` et `head .env` parmi les commandes que cette règle bloque.' },
					{ q: 'Quel appel peut encore atteindre `.env` malgré cette règle ?', options: ['`cat .env`', '`head .env`', '`grep -r KEY .`', 'L’outil Read sur `.env`'], answer: 2, why: 'Un `grep` récursif ouvre le fichier sans le nommer. Le sandbox bloque ce cas au niveau de l’OS.' }
				]
			},
			{
				title: 'Démarre en mode plan',
				questions: [
					{ q: 'Quelle clé fait démarrer chaque session en mode plan ?', options: ['`"defaultMode": "plan"`', '`"mode": "plan"`', '`"plan": true`', '`"startMode": "plan"`'], answer: 0, why: '`defaultMode` fixe le mode de départ d’une session.' },
					{ q: 'Où se place `defaultMode` dans le fichier ?', options: ['Au premier niveau, à côté de `permissions`', 'Dans `permissions`, à côté des trois listes', 'Dans la liste `allow`', 'Dans CLAUDE.md'], answer: 1, why: 'La réponse le met dans `permissions`, avec `allow`, `ask` et `deny`.' },
					{ q: 'Que laisse faire le mode plan à Claude ?', options: ['Modifier n’importe quel fichier du répertoire de travail', 'Lancer toute commande Bash sans demande', 'Rien tant que tu n’as pas tapé de plan', 'Lire et explorer, sans modifier le code source avant que tu valides le plan'], answer: 3, why: '`plan` bloque les modifications du code source jusqu’à la validation du plan.' },
					{ q: 'Tu valides le plan. `git push origin main` demande-t-il encore ?', options: ['Oui, les règles ask passent avant allow et aucun mode ne les approuve tout seul', 'Non, le plan validé le couvre', 'Non, le mode plan autorise les push', 'Seulement si le push va vers `main`'], answer: 0, why: 'La doc range les règles ask explicites parmi ce qu’aucun mode n’approuve tout seul, `bypassPermissions` compris.' }
				]
			},
			{
				title: 'Teste `git -C . push`',
				questions: [
					{ q: '`git -C . push origin main` correspond-il à `Bash(git push *)` ?', options: ['Oui, c’est quand même un push', 'Oui, Claude Code lit les options de git', 'Non, la règle compare le texte `git push`', 'Seulement en mode plan'], answer: 2, why: 'Une règle Bash porte sur le texte de la commande, et `git -C . push` ne commence pas par `git push`.' },
					{ q: 'Tu veux que `git -C . push origin main` demande aussi. Quelle règle ajoutes-tu ?', options: ['`Bash(git push -C *)` dans `ask`', '`Bash(git -C . push *)` dans `ask`', '`Bash(push *)` dans `ask`', 'Aucune : `Bash(git push *)` le couvre déjà'], answer: 1, why: 'Une règle Bash porte sur le texte de la commande, donc cette écriture demande sa propre règle. Tout ce qui précède le `*` doit correspondre tel quel.' },
					{ q: 'En mode Manual, que devient ce push ?', options: ['Il te demande ton accord', 'Il tourne sans demande', 'Il est bloqué', 'Il est enregistré comme nouvelle règle'], answer: 0, why: '`default` ne lance que les lectures et demande pour le reste.' },
					{ q: 'Quel autre push passe aussi à côté de `Bash(git push *)` ?', options: ['`git push origin main`', '`git push --force origin main`', '`git push origin dev`', '`git \'push\' origin main`'], answer: 3, why: 'Mettre le mot entre guillemets change le texte, donc la règle ne correspond plus.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Les réglages utilisateur autorisent `Bash(git push *)`. Le `.claude/settings.json` du projet refuse `Bash(git push *)`. Claude lance `git push origin main`. Que se passe-t-il ?',
			options: [
				'Ça tourne, car les réglages utilisateur passent avant ceux du projet',
				'C’est bloqué, car les règles deny de tous les niveaux passent en premier',
				'Ça demande, car les deux règles s’annulent',
				'Ça tourne, car la règle la plus précise gagne et elles sont égales'
			],
			answer: 1,
			why: 'Claude Code évalue deny, puis ask, puis allow, sur tous les fichiers de réglages. Un deny à n’importe quel niveau bloque l’appel, et un allow ailleurs ne peut pas y percer d’exception.'
		},
		{
			q: 'Tu passes en `acceptEdits` avec `Shift+Tab`. Quel appel te demande encore ton accord ?',
			options: [
				'Une modification de `src/cart.ts` dans le dossier de travail',
				'`mkdir tests/fixtures` dans le dossier de travail',
				'`npm install left-pad` sans règle allow pour cette commande',
				'`mv old.ts new.ts` dans le dossier de travail'
			],
			answer: 2,
			why: '`acceptEdits` approuve les modifications de fichiers et une liste fixe de commandes de fichiers (`mkdir`, `touch`, `rm`, `rmdir`, `mv`, `cp`, `sed`) sur les chemins du dossier de travail. Les autres commandes Bash hors lecture seule demandent toujours.'
		},
		{
			q: 'Le projet refuse `Bash(rm *)`. Quelle commande cette règle n’arrête-t-elle pas ?',
			options: [
				'`rm -rf build/`',
				'`FOO=bar rm -rf tmp/`',
				'`bash -c \'rm -rf build/\'`',
				'`rm build/app.js`'
			],
			answer: 2,
			why: 'Une règle Bash compare le texte de la commande, une fois les commandes composées découpées et les préfixes connus et affectations de variables retirés. `bash -c` passe la commande dans une chaîne, donc la règle ne voit pas `rm`. Un sandbox protège les fichiers quelle que soit l’écriture de la commande.'
		}
	],
	recall: {
		q: 'Dans quel ordre Claude Code vérifie-t-il les règles de permission, et qui décide quand aucune ne correspond ?',
		a: 'Deny, puis ask, puis allow, sur tous les fichiers de réglages. Si aucune ne correspond, c’est le mode de permission : par exemple `acceptEdits` lance les modifications dans le dossier de travail et `default` demande.'
	},
	sources: [
		{ title: 'Doc Claude Code, Configure permissions, lue le 2026-10-17', url: PERMS },
		{ title: 'Doc Claude Code, Choose a permission mode, lue le 2026-10-17', url: MODES },
		{ title: 'Doc Claude Code, Settings reference, lue le 2026-10-17', url: 'https://code.claude.com/docs/en/settings-reference' },
		{ title: 'anthropics/claude-code, examples/settings/settings-strict.json', url: `${CC}/examples/settings/settings-strict.json` }
	]
};
