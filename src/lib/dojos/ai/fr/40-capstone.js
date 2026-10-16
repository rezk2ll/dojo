const AGENTS = 'https://www.anthropic.com/engineering/building-effective-agents';
const LOOP = 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works';
const BP = 'https://code.claude.com/docs/en/best-practices';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'Construire avec l’API',
	title: 'Projet final : un petit agent de code',
	minutes: 10,
	hook: [
		'Quand Anthropic a construit un agent de code pour SWE-bench, ses ingénieurs ont « spent more time optimizing our tools than the overall prompt » (passé plus de temps sur les outils que sur le prompt). Un exemple : le modèle se trompait avec des chemins relatifs une fois sorti du dossier racine, alors l’outil a été changé pour exiger des chemins absolus.',
		'Ton exercice : concevoir sur papier un petit agent de code, de bout en bout : ses outils, sa boucle, ses permissions et l’éval qui te dit si un changement l’a amélioré. Chaque partie reprend un chapitre déjà fait, indiqué par son numéro de jour.'
	],
	terms: [
		{ term: 'Outil', def: 'Un nom, une description et un schéma d’entrée que le modèle voit, plus le code que tu exécutes quand le modèle le demande (jour 17).' },
		{ term: 'Condition d’arrêt', def: 'Une règle qui termine la boucle : un `stop_reason` autre que `tool_use`, ou une limite que tu fixes, comme un nombre maximal d’itérations (jour 18).' },
		{ term: 'Jeu d’éval', def: 'Une liste fixe de cas passés dont on connaît le bon résultat, rejouée après chaque changement de prompt, d’outils ou de modèle (jour 23).' }
	],
	kata: {
		brief: [
			'Ton équipe veut un bot pour les tests qui échouent. Quand le CI d’une pull request fait échouer un test pytest, le bot reçoit un checkout de la branche et l’identifiant du test, par exemple `tests/test_dates.py::test_leap_day`. Il doit pousser un correctif proposé dans un commit sur une nouvelle branche, qu’une personne relira. Il appelle l’API Messages de Claude avec des outils que ton code exécute.',
			'Le bot tourne la nuit, sans personne pour le surveiller. Le checkout contient un fichier `.env` avec de vrais identifiants, et le conteneur de CI a accès au réseau. L’équipe a gardé 40 anciens tests en échec, chacun avec le correctif qu’une personne a fusionné.',
			'Conçois-le sur une feuille : les outils (nom et entrées), la boucle et quand elle s’arrête, ce que le bot fait seul et ce qui demande une personne, et comment tu mesures que la version 2 du prompt bat la version 1.'
		],
		minutes: 10,
		checklist: [
			'Trois à cinq outils, chacun avec des entrées étroites, et des chemins de fichier obligatoirement absolus.',
			'Une boucle qui continue seulement tant que `stop_reason` vaut `tool_use`, plus tes propres limites d’itérations et de tokens.',
			'La vraie sortie des tests renvoyée au modèle après chaque modification, pour qu’il juge son avancée d’après pytest et pas d’après sa propre lecture.',
			'Pas de shell général : le bot ne lance que pytest et flake8, et il ne peut ni lire `.env` ni joindre le réseau.',
			'Une personne relit chaque correctif : le bot pousse sur une nouvelle branche, jamais sur `main`, et ne fusionne jamais.',
			'Une éval sur les 40 cas passés, notée par du code, avec une vérification que le nouveau test échoue sans le correctif.',
			'Des vérifications déterministes avant les appels de modèle partout où une règle peut répondre (jour 39).'
		],
		sample: [
			'Outils : le bot reçoit `read_file(path)`, `edit_file(path, old_text, new_text)`, `run_tests(test_id)` et `lint(path)`. Les chemins doivent être absolus et dans le checkout, sinon l’outil renvoie une erreur. `edit_file` échoue si `old_text` n’apparaît pas exactement une fois, pour que le modèle ne modifie pas le mauvais endroit. Pas d’outil `git` : ton code commite et pousse une fois la boucle finie.',
			'Boucle : la doc donne la forme, « while `stop_reason == "tool_use"`, execute the tools and continue the conversation » (tant que le modèle demande un outil, exécute et continue). Tout autre stop reason (`end_turn`, `max_tokens`, `stop_sequence`, `refusal`) termine la boucle. Tu ajoutes un plafond de 30 itérations et un budget de tokens, et quand l’un est atteint, le bot signale « abandon » au lieu de pousser un demi-correctif.',
			'Vérité terrain : `run_tests` renvoie la vraie sortie de pytest, et `lint` lance flake8 avec les codes fatals d’aider, donc un nom inventé sort en F821 avant même les tests. Le guide sur les agents leur demande de « gain \'ground truth\' from the environment at each step ». Le modèle ne décide jamais seul que le test passe.',
			'Permissions : le bot tourne dans un conteneur sans réseau et sans `.env` monté, donc le modèle ne peut pas lire les secrets même si un fichier du dépôt le lui demande (jour 16). Les seules commandes sont les appels pytest et flake8 dans `run_tests` et `lint`. Ton code pousse sur `bot/fix-<test-id>` et ouvre une PR, et une personne la fusionne (jour 24).',
			'Éval : rejoue les 40 anciens échecs avec la version 1 du prompt, puis la version 2. Un cas réussit quand le test en échec passe, que toute la suite reste verte et que le diff ne touche aucun fichier hors du module testé. Du code note les trois, donc pas besoin d’un juge modèle (jour 37). Rapporte 31/40 contre 35/40, plus les itérations et les tokens par cas.',
			'Relecture : pour chaque cas réussi, annule la modification du bot et relance le test. Il doit échouer, sinon le bot a seulement affaibli le test (jour 38). Lis à la main le diff de cinq cas tirés au hasard avant de changer de version.'
		]
	},
	quiz: [],
	recall: {
		q: 'Quelles conditions terminent la boucle de l’agent dans ta conception ?',
		a: 'Tout `stop_reason` autre que `tool_use` (`end_turn`, `max_tokens`, `stop_sequence`, `refusal`), ou une de tes propres limites, comme 30 itérations ou le budget de tokens.'
	},
	sources: [
		{ title: 'Anthropic, Building effective agents', url: AGENTS },
		{ title: 'Doc Claude, How tool use works, lue le 2026-10-17', url: LOOP },
		{ title: 'Doc Claude Code, Best practices, lue le 2026-10-17', url: BP }
	]
};
