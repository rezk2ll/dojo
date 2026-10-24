const AIDER = 'https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c';
const LINTER = `${AIDER}/aider/linter.py`;
const META = 'https://engineering.fb.com/2026/06/25/security/privacy-aware-infrastructure-in-the-ai-native-era-an-asset-classification-case-study/';
const AGENTS = 'https://www.anthropic.com/engineering/building-effective-agents';
const FLAKE8 = 'https://flake8.pycqa.org/en/latest/user/error-codes.html';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'when-not-to',
	part: 'Construire avec l’API',
	title: 'Quand ne pas utiliser de modèle',
	minutes: 10,
	hook: [
		'Meta classe ses données (colonnes, clés de logs, features de ML) pour que ses contrôles de confidentialité sachent ce qu’ils protègent. Un champ nommé `age` peut être l’âge d’une personne, à protéger strictement, ou la durée de vie d’un cache dans un pipeline d’infrastructure. Faire la différence demande du jugement, et un LLM s’y prend bien.',
		'Pourtant, dans le système en production de Meta, le LLM ne tranche pas le cas courant. Ses ingénieurs écrivent que des règles déterministes « resolve the large majority of traffic, roughly 85%, in single-digit milliseconds » (traitent environ 85 % du trafic en quelques millisecondes). Le LLM prend les 15 % restants, met des secondes et coûte « roughly 400 times the compute » (environ 400 fois plus de calcul).',
		'Le guide d’Anthropic sur les agents dit la même chose pour toute appli LLM : chercher « the simplest solution possible, and only increasing complexity when needed ».'
	],
	terms: [
		{ term: 'Déterministe', def: 'Même entrée, même sortie, à chaque exécution. Tu peux rejouer une ancienne décision et obtenir la même réponse, et un test peut la vérifier avec `==`.' },
		{ term: 'Règle', def: 'Du code qui associe une entrée à une réponse sans modèle : une regex, une requête SQL, une table de correspondance, une vérification du compilateur.' },
		{ term: 'Repli', def: 'Le chemin que prend une entrée quand aucune règle ne correspond. Dans un système hybride, le modèle sert de repli.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['task["Une tâche à automatiser"] --> enum{"Peux-tu écrire chaque réponse valide et la règle qui la choisit ?"}', 'enum -->|"oui"| code["Écrire du code : regex, SQL, table de correspondance"]'],
				highlight: ['enum', 'code'],
				note: 'Extraire `ORD-123456` d’un email, c’est une regex. Compter les tickets par produit, c’est un `GROUP BY`. Associer `FR` à `France`, c’est une table de correspondance. Aucune ne coûte de tokens, et chacune donne la même réponse à chaque fois.'
			},
			{
				add: ['enum -->|"non"| audit{"Faut-il pouvoir rejouer et expliquer la décision plus tard ?"}', 'audit -->|"oui"| rules["Des règles pour les cas connus, revues par une personne"]'],
				highlight: ['audit', 'rules'],
				note: 'L’application des politiques chez Meta exige des « decisions that can be explained and reproduced later » (des décisions qu’on peut expliquer et reproduire plus tard). Un appel de modèle peut répondre autrement au run suivant : Meta transforme donc les cas stables en « versioned, auditable rules that run without the LLM ». Une personne approuve chaque règle qui pourrait changer la protection de données sensibles.'
			},
			{
				add: ['audit -->|"non"| data{"Ces données ont-elles le droit de sortir de tes systèmes ?"}', 'data -->|"non"| local["Les garder dans du code que tu exécutes"]'],
				highlight: ['data', 'local'],
				note: 'Un appel d’API de modèle envoie l’entrée sur les serveurs de quelqu’un d’autre. Par exemple, la doc Claude sur les lots dit que le traitement par lots « stores request and response data for up to 29 days after batch creation » (garde requêtes et réponses jusqu’à 29 jours). Une regex sur ta machine n’envoie rien nulle part.'
			},
			{
				add: ['data -->|"oui"| model["Le modèle pour ce que les règles ne couvrent pas"]', 'model -.->|"les réponses stables donnent de nouvelles règles"| rules'],
				highlight: ['model'],
				note: 'Il reste les entrées ambiguës ou nouvelles, comme du texte libre ou le champ `age`. Meta se sert du LLM « to interpret novel or ambiguous assets », puis condense ce qu’il apprend en règles, ce qui « steadily shrinks the LLM\'s role in production over time » (réduit peu à peu la place du LLM en production).'
			}
		]
	},
	example: {
		title: 'aider/linter.py : le compilateur et flake8 vérifient chaque modification du modèle',
		repo: 'Aider-AI/aider',
		url: `${LINTER}#L82-L180`,
		lang: 'python',
		code: `    def lint(self, fname, cmd=None):
        rel_fname = self.get_rel_fname(fname)
        try:
            code = Path(fname).read_text(encoding=self.encoding, errors="replace")
…
        if callable(cmd):
            lintres = cmd(fname, rel_fname, code)
        elif cmd:
            lintres = self.run_cmd(cmd, rel_fname, code)
        else:
            lintres = basic_lint(rel_fname, code)

        if not lintres:
            return

        res = "# Fix any errors below, if possible.\\n\\n"
        res += lintres.text
        res += "\\n"
        res += tree_context(rel_fname, code, lintres.lines)

        return res

    def py_lint(self, fname, rel_fname, code):
        basic_res = basic_lint(rel_fname, code)
        compile_res = lint_python_compile(fname, code)
        flake_res = self.flake8_lint(rel_fname)
…
    def flake8_lint(self, rel_fname):
        fatal = "E9,F821,F823,F831,F406,F407,F701,F702,F704,F706"
        flake8_cmd = [
            sys.executable,
            "-m",
            "flake8",
            f"--select={fatal}",
            "--show-source",
            "--isolated",
            rel_fname,
        ]
…
def lint_python_compile(fname, code):
    try:
        compile(code, fname, "exec")  # USE TRACEBACK BELOW HERE
        return`,
		notes: [
			'Aider est un agent de code : après une modification d’un fichier Python par le modèle, `py_lint` lance trois vérifications, une analyse tree-sitter (`basic_lint`), le `compile()` de Python, et flake8. Aucune n’appelle de modèle : le même fichier donne les mêmes erreurs à chaque run.',
			'La ligne `fatal` ne garde que les codes qui signalent du code cassé. Dans la [liste de flake8](' + FLAKE8 + '), F821 est « undefined name », F706 « a return statement outside of a function/method », et E9 couvre les erreurs de syntaxe et d’IO. Un nom de fonction inventé, comme au jour 38, sort ici en F821, sans aucun jugement.',
			'La ligne `res = "# Fix any errors below, if possible."` est le point de rencontre. Le code trouve l’erreur et les lignes exactes. Si tu réponds oui à « Attempt to fix lint errors? », aider renvoie ce texte au modèle, qui écrit le correctif.',
			'Claude Code fait le même partage entre hooks et CLAUDE.md. Sa page de bonnes pratiques : « Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens » (les instructions de CLAUDE.md sont des conseils, les hooks garantissent l’action).'
		]
	},
	tradeoff: {
		gain: [
			'Vitesse et coût : les règles de Meta répondent en quelques millisecondes, alors que son chemin LLM prend des secondes et environ 400 fois plus de calcul.',
			'Une règle donne la même réponse à chaque run : tu la testes avec `==` et tu rejoues une décision des mois plus tard.',
			'Une regex ou une requête SQL sur ta machine n’envoie aucune donnée à une API extérieure.'
		],
		cost: [
			'Une règle ne couvre que les cas pour lesquels on l’a écrite. Un champ `age` dans un nouveau pipeline demande un contexte qu’aucune règle n’avait : Meta garde donc le LLM pour les quelque 15 % de cas nouveaux ou ambigus.',
			'Chaque règle coûte du temps humain : Meta teste chaque règle candidate sur un jeu revu mis de côté, puis en mode fantôme, avant qu’elle touche une décision.',
			'Tu maintiens deux chemins, les règles et le prompt du modèle. Meta fait renvoyer le même format de résultat aux deux, pour que les systèmes en aval n’aient pas à savoir lequel a répondu.'
		]
	},
	task: {
		prompt: 'Ton équipe support demande cinq automatisations. Pour chacune, choisis du code (regex, SQL, table de correspondance) ou un modèle, et dis pourquoi en une ligne. (1) Extraire des numéros de commande comme `ORD-123456` des emails reçus. (2) Compter les tickets de la semaine dernière par produit. (3) Afficher le nom du pays pour chaque code pays à deux lettres. (4) Résumer en une phrase chaque plainte énervée pour le responsable d’équipe. (5) Repérer les champs de ticket qui contiennent des données personnelles, sur 300 noms de champs, dont certains flous comme `age` ou `id2`.',
		hint: 'Pour chacune, demande-toi si tu peux lister chaque réponse valide et la règle qui la choisit. Puis demande-toi si une réponse fausse ou changeante poserait problème.',
		answer: [
			'(1) Du code : la regex `ORD-\\d{6}` trouve chaque numéro de commande et n’en invente jamais. (2) Du code : un `GROUP BY product` sur les lignes de la semaine dernière donne un compte exact, le même à chaque run.',
			'(3) Du code : une table de correspondance avec une ligne par code. La liste des réponses est finie et connue d’avance.',
			'(4) Un modèle : il n’existe pas de liste de résumés valides à écrire d’avance. Vérifie un échantillon à la main ou avec un juge (jour 37).',
			'(5) Les deux : des règles pour les noms clairs (`email`, `phone`, `birth_date`), puis un modèle avec du contexte pour les flous comme `age`. Quand le modèle donne souvent la même réponse pour un motif, une personne relit ce motif et l’ajoute comme règle, comme dans l’entonnoir de Meta.'
		],
		steps: [
			{
				title: 'Trie les cas clairs',
				questions: [
					{ q: '(1) Extraire `ORD-123456` des emails reçus. Code ou modèle ?', options: ['Un modèle, puisque les emails sont du texte libre', 'Du code : la regex `ORD-\\d{6}`', 'Un modèle, avec une regex pour vérifier', 'Une personne, puisque les numéros de commande comptent'], answer: 1, why: 'Le format est fixe, donc une regex trouve chaque numéro de commande et n’en invente jamais.' },
					{ q: '(2) Compter les tickets de la semaine dernière par produit. Code ou modèle ?', options: ['Du code : un `GROUP BY product`', 'Un modèle qui lit chaque ticket', 'Un modèle avec un outil SQL', 'Un modèle juge qui vérifie le compte'], answer: 0, why: 'Un `GROUP BY` donne un compte exact, le même à chaque run, et ne coûte aucun token.' },
					{ q: '(3) Afficher le nom du pays pour chaque code à deux lettres. Code ou modèle ?', options: ['Un modèle, puisque les noms de pays changent', 'Un modèle avec un cache', 'Une regex sur le code', 'Du code : une table de correspondance, une ligne par code'], answer: 3, why: 'La liste des réponses est finie et connue d’avance.' },
					{ q: 'Quelle question te dit qu’une tâche relève du code ?', options: ['L’entrée est-elle écrite en anglais ?', 'La tâche est-elle ennuyeuse ?', 'Peux-tu lister chaque réponse valide et la règle qui la choisit ?', 'L’équipe la veut-elle vite ?'], answer: 2, why: 'Quand tu peux écrire les réponses et la règle, une règle donne la même réponse à chaque fois.' }
				]
			},
			{
				title: 'Choisis pour le résumé',
				questions: [
					{ q: '(4) Un résumé en une phrase de chaque plainte énervée. Code ou modèle ?', options: ['Du code : la première phrase de la plainte', 'Un modèle : il n’existe pas de liste de résumés valides', 'Une table de correspondance des plaintes courantes', 'Une regex sur les mots énervés'], answer: 1, why: 'Un résumé demande du jugement sur du texte libre, et c’est là qu’un modèle est bon.' },
					{ q: 'Comment vérifies-tu les résumés ?', options: ['Un échantillon à la main ou avec un juge', 'Un `==` contre un résumé attendu', 'Rien : le modèle est déterministe', 'En comptant les mots de chaque résumé'], answer: 0, why: 'Le texte libre échoue au `==`, donc tu notes un échantillon, comme au jour 37.' },
					{ q: 'Qu’est-ce qui change quand le résumé passe par une API de modèle ?', options: ['Rien ne quitte ta machine', 'La réponse est la même à chaque run', 'Ça ne coûte aucun token', 'Le texte de la plainte part sur les serveurs de quelqu’un d’autre'], answer: 3, why: 'Un appel d’API de modèle envoie l’entrée ailleurs. Une regex sur ta machine n’envoie rien.' },
					{ q: 'Un résumé différent à un run suivant pose-t-il problème ici ?', options: ['Oui : il doit pouvoir être rejoué pour un audit', 'Oui : le nombre de tickets change', 'Peu : c’est une note pour une personne, pas une décision appliquée', 'Ça ne peut pas arriver avec un modèle'], answer: 2, why: 'Une réponse changeante compte quand une décision doit être reproduite plus tard. Une note pour le responsable se lit une fois.' }
				]
			},
			{
				title: 'Partage l’analyse des champs',
				questions: [
					{ q: '(5) Repérer les données personnelles parmi 300 noms de champs. Quelle approche convient ?', options: ['Seulement un modèle, pour les 300', 'Seulement des règles, pour les 300', 'Des règles pour les noms clairs, un modèle pour les flous', 'Une personne lit les 300'], answer: 2, why: 'Les noms clairs ne demandent aucun jugement, et les flous comme `age` demandent un contexte qu’aucune règle n’a.' },
					{ q: 'Quels champs vont aux règles ?', options: ['`email`, `phone`, `birth_date`', '`age`, `id2`', 'Tous les champs avec un chiffre dans le nom', 'Les champs dont le modèle n’est pas sûr'], answer: 0, why: 'Leur nom dit ce qu’ils contiennent, donc une règle peut les reconnaître à chaque fois.' },
					{ q: 'Pourquoi `age` va-t-il au modèle ?', options: ['C’est le nom le plus long', 'Les règles ne savent pas lire trois lettres', 'Les modèles sont plus rapides sur les noms courts', 'Ce peut être l’âge d’une personne ou la durée de vie d’un cache'], answer: 3, why: 'Distinguer les deux demande du contexte, et c’est le cas pour lequel Meta garde le LLM.' },
					{ q: 'Pourquoi aucune règle ne peut-elle trancher `id2` ?', options: ['Il contient un chiffre', 'Son nom ne dit pas ce qu’il contient', 'Il est trop court pour une regex', 'Les règles ne traitent que des nombres'], answer: 1, why: 'Une règle a besoin d’un nom qui dit ce que le champ contient. `id2` peut être n’importe quoi, il lui faut donc un modèle avec du contexte.' }
				]
			},
			{
				title: 'Fais grandir les règles',
				questions: [
					{ q: 'Le modèle donne souvent la même réponse pour un motif. Que fais-tu ?', options: ['Une personne relit le motif et l’ajoute comme règle', 'Tu laisses le modèle continuer à y répondre', 'Tu retires le motif de l’analyse', 'Tu demandes à un deuxième modèle de confirmer à chaque fois'], answer: 0, why: 'Meta transforme ce que le LLM apprend en règles, ce qui réduit son rôle au fil du temps.' },
					{ q: 'Pourquoi une personne doit-elle approuver une règle qui touche aux données personnelles ?', options: ['Les règles ne tournent pas sans signature', 'Le modèle ne sait pas écrire de règles', 'La règle pourrait changer la façon dont les données sensibles sont protégées', 'Ça rend la règle plus rapide'], answer: 2, why: 'Meta fait approuver par une personne chaque règle qui pourrait changer la protection des données sensibles.' },
					{ q: 'Avant qu’une règle candidate touche une décision, comment Meta la teste-t-elle ?', options: ['Elle demande au LLM de l’approuver', 'Elle la déploie et surveille le taux d’erreur', 'Elle la lance une fois sur le trafic du jour', 'Sur un jeu revu mis de côté, puis en mode fantôme'], answer: 3, why: 'Meta teste chaque règle candidate sur un jeu revu mis de côté puis en mode fantôme, ce qui fait partie du temps humain que coûte chaque règle.' },
					{ q: 'Tu gardes les deux chemins. Comment les systèmes en aval restent-ils simples ?', options: ['Ils rappellent le modèle pour vérifier', 'Les deux chemins renvoient le même format de résultat', 'Ils ne lisent que les résultats des règles', 'Ils stockent le chemin qui a répondu et s’en servent pour brancher'], answer: 1, why: 'Meta fait renvoyer le même format aux deux, donc les systèmes en aval n’ont pas à savoir quel chemin a répondu.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Dans l’entonnoir de classification de Meta, qu’est-ce qui tranche le cas courant ?',
			options: [
				'Le LLM, avec des règles en secours seulement quand l’API est en panne',
				'Des règles déterministes, environ 85 % du trafic en quelques millisecondes',
				'Une personne, qui relit chaque donnée avant qu’un label soit posé',
				'Trois juges LLM qui votent à la majorité sur chaque donnée'
			],
			answer: 1,
			why: 'Les règles passent en premier, et le LLM sert de repli pour les quelque 15 % nouveaux ou ambigus. Ce chemin prend des secondes et environ 400 fois plus de calcul. Meta se sert de son panel de trois juges pour contrôler la qualité du classifieur.'
		},
		{
			q: 'Pourquoi Meta veut-il que les décisions d’application viennent de règles versionnées plutôt que d’un appel de modèle ?',
			options: [
				'Les règles sont toujours plus justes qu’un modèle, sur tous les types de données',
				'Les régulateurs interdisent tout usage de LLM sur des données personnelles',
				'Une règle versionnée redonne la même décision quand on la rejoue, donc on peut l’auditer',
				'Un appel de modèle ne peut pas renvoyer un résultat structuré avec une catégorie'
			],
			answer: 2,
			why: 'L’application des politiques exige des décisions « that can be explained and reproduced later ». Une règle versionnée renvoie la même réponse pour la même entrée, alors qu’un appel de modèle peut varier d’un run à l’autre. Le billet garde le LLM pour les cas ambigus, où les règles font moins bien.'
		},
		{
			q: 'Le modèle d’aider modifie un fichier Python et appelle une fonction qui n’existe pas. Quelle partie d’aider le signale ?',
			options: [
				'Un second appel de modèle qui lit le diff et cherche les erreurs',
				'Rien, jusqu’à ce que l’utilisateur lance le programme et le voie planter',
				'Le modèle lui-même, qui relit sa modification avant d’enregistrer',
				'flake8, lancé par `py_lint`, qui signale F821 « undefined name »'
			],
			answer: 3,
			why: 'La liste `fatal` passée à flake8 contient F821. La vérification est déterministe : le même fichier donne la même erreur à chaque run, et aider peut renvoyer le résultat au modèle sous « # Fix any errors below, if possible. »'
		}
	],
	recall: {
		q: 'Dans l’entonnoir de Meta, quelle part du trafic les règles déterministes traitent-elles, et combien coûte le chemin LLM en comparaison ?',
		a: 'Environ 85 % passe par les règles, en quelques millisecondes. Le LLM traite les quelque 15 % restants, met des secondes et demande environ 400 fois plus de calcul.'
	},
	sources: [
		{ title: 'Meta Engineering, Privacy-aware infrastructure in the AI-native era: an asset classification case study (25 juin 2026)', url: META },
		{ title: 'Anthropic, Building effective agents', url: AGENTS },
		{ title: 'aider, aider/linter.py', url: LINTER },
		{ title: 'Doc flake8, Error / Violation Codes', url: FLAKE8 },
		{ title: 'Doc Claude Code, Best practices, lue le 2026-10-17', url: 'https://code.claude.com/docs/en/best-practices' },
		{ title: 'Doc Claude, Batch processing (conservation des données), lue le 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/batch-processing' }
	]
};
