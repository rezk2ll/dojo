const PYYAML = 'https://github.com/yaml/pyyaml/blob/f5e4504a92f169f65350a1047dccb23bc97028be/lib/yaml';
const PR561 = 'https://github.com/yaml/pyyaml/pull/561';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'deserialization',
	part: 'Les entrées et les sorties',
	title: 'La désérialisation dangereuse',
	minutes: 10,
	hook: [
		'Le 27 juin 2018, NVD publie la CVE-2017-18342 contre PyYAML. La fiche dit : "In PyYAML before 5.1, the yaml.load() API could execute arbitrary code if used with untrusted data" (avant la 5.1, `yaml.load()` peut exécuter du code arbitraire sur des données non fiables). NVD lui donne 9,8 sur 10.',
		'Le wiki de PyYAML reconnaît que la fonction "has been unsafe since the first release in May 2006". En version 3.13, la ligne s’écrit `def load(stream, Loader=Loader):`. Ce `Loader` par défaut peut importer n’importe quel module et appeler n’importe quelle fonction nommée par un tag du document.',
		'La 5.1 (13 mars 2019) passe le défaut à un nouveau `FullLoader` et affiche un avertissement. En 2020, deux CVE visent `FullLoader` lui-même (CVE-2020-1747 et CVE-2020-14343). La 6.0 (13 octobre 2021) change la ligne en `def load(stream, Loader):` dans la [PR #561](' + PR561 + ') : un appel sans loader lève `TypeError`.',
		'Le `pickle` de Python a la même propriété, sans aucun mode sûr. Dans ton appli, cherche chaque appel qui reconstruit des objets à partir d’octets qu’un utilisateur peut envoyer.'
	],
	terms: [
		{ term: 'Désérialisation', def: 'Retransformer des octets stockés ou reçus (YAML, JSON, pickle) en objets en mémoire. OWASP : "taking data structured in some format, and rebuilding it into an object."' },
		{ term: 'Tag', def: 'Un marqueur YAML comme `!!python/object/apply:` qui indique au loader quel constructeur fabrique la valeur suivante. C’est le loader qui décide pour quels tags il a un constructeur.' },
		{ term: 'SafeLoader', def: 'Le loader de PyYAML qu’utilise `yaml.safe_load`. Il a des constructeurs pour 12 tags standard (chaînes, nombres, listes, dictionnaires et quelques autres) et refuse tous les autres.' },
		{ term: 'Pickle', def: 'Le format de sérialisation binaire propre à Python. Charger un pickle peut importer et appeler n’importe quelle fonction nommée dans les données.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['up["POST /jobs avec un corps YAML"] --> load["yaml.load(body, Loader=yaml.Loader)"]'],
				highlight: ['up', 'load'],
				note: 'Un lanceur de tâches reçoit des descriptions de tâche en YAML et les lit avec le loader complet. Un simple `yaml.load(body)` fait pareil avec PyYAML avant la 5.1, où ce loader complet est le défaut.'
			},
			{
				add: ['load --> tag["Tag trouvé : !!python/object/apply:os.system"]', 'tag --> call["UnsafeConstructor importe os et appelle system()"]', 'call --> shell["Une commande tourne avec l’utilisateur de l’appli"]'],
				highlight: ['tag', 'call', 'shell'],
				note: 'Le document porte un tag qui nomme une fonction, ici l’exemple inoffensif `!!python/object/apply:os.system ["echo hi"]`. Le loader importe `os` et appelle `os.system` avec la liste en arguments. NVD décrit le résultat : l’API "could execute arbitrary code".'
			},
			{
				add: ['up --> safe["yaml.safe_load(body)"]', 'safe --> undef["SafeConstructor : aucun constructeur pour ce tag"]', 'undef --> err["ConstructorError, rien n’est importé ni appelé"]'],
				highlight: ['safe', 'undef', 'err'],
				note: 'La correction tient en un appel : `yaml.safe_load(body)`. Son constructeur connaît 12 tags standard. Tout autre tag tombe sur le cas par défaut, qui lève "could not determine a constructor for the tag" avant d’importer le moindre module.'
			},
			{
				add: ['cookie["Cookie : prefs = pickle en base64"] --> pl["pickle.loads(data)"]', 'pl --> any["Importe et appelle tout global cité dans les données"]', 'cookie --> js["json.loads(data)"]', 'js --> plain["dict, list, str, int, float, bool, None"]'],
				highlight: ['pl', 'any', 'js', 'plain'],
				note: 'Pickle n’a pas de loader sûr. La doc Python : "Never unpickle data that could have come from an untrusted source". Elle renvoie vers json : "deserializing untrusted JSON does not in itself create an arbitrary code execution vulnerability."'
			}
		]
	},
	example: {
		title: 'lib/yaml/constructor.py : UnsafeConstructor, le seul constructeur qui connaît les tags python/object',
		repo: 'yaml/pyyaml',
		url: `${PYYAML}/constructor.py#L716-L746`,
		lang: 'python',
		code: `class UnsafeConstructor(FullConstructor):

    def find_python_module(self, name, mark):
        return super(UnsafeConstructor, self).find_python_module(name, mark, unsafe=True)

    def find_python_name(self, name, mark):
        return super(UnsafeConstructor, self).find_python_name(name, mark, unsafe=True)

    def make_python_instance(self, suffix, node, args=None, kwds=None, newobj=False):
        return super(UnsafeConstructor, self).make_python_instance(
            suffix, node, args, kwds, newobj, unsafe=True)

    def set_python_instance_state(self, instance, state):
        return super(UnsafeConstructor, self).set_python_instance_state(
            instance, state, unsafe=True)

UnsafeConstructor.add_multi_constructor(
    'tag:yaml.org,2002:python/module:',
    UnsafeConstructor.construct_python_module)

UnsafeConstructor.add_multi_constructor(
    'tag:yaml.org,2002:python/object:',
    UnsafeConstructor.construct_python_object)

UnsafeConstructor.add_multi_constructor(
    'tag:yaml.org,2002:python/object/new:',
    UnsafeConstructor.construct_python_object_new)

UnsafeConstructor.add_multi_constructor(
    'tag:yaml.org,2002:python/object/apply:',
    UnsafeConstructor.construct_python_object_apply)`,
		notes: [
			'Les lignes 3 à 7 passent `unsafe=True` aux recherches de nom. Avec ce drapeau, la classe parente appelle `__import__` sur le module cité dans le tag. Sans lui, la recherche échoue avec "module %r is not imported".',
			'Les lignes 9 à 11 passent `unsafe=True` à la construction de la valeur. La classe parente saute alors son contrôle "expected a class" : le tag peut nommer une simple fonction comme `os.system`, et le loader l’appelle.',
			'Les lignes 17 à 31 enregistrent les quatre tags qui fabriquent des objets arbitraires, et seulement sur cette classe. Le changelog de la 5.4 parle de "Fix for CVE-2020-14343, moves arbitrary python tags to UnsafeLoader".',
			'`SafeConstructor` enregistre 12 tags standard, puis [`add_constructor(None, construct_undefined)`](' + PYYAML + '/constructor.py#L429-L483) pour tous les autres. Cette méthode lève `ConstructorError` : `safe_load` s’arrête au premier tag `!!python/`.'
		]
	},
	tradeoff: {
		gain: [
			'`yaml.safe_load` ne renvoie que des valeurs simples : chaînes, nombres, booléens, null, dates, listes, dictionnaires et ensembles. Un fichier de config comme `port: 8080` se charge comme avant.',
			'Depuis PyYAML 6.0, un `yaml.load(data)` nu échoue avec `TypeError` dès le premier appel. En relecture, tu vois quel loader utilise chaque appel.'
		],
		cost: [
			'Tes propres classes ne se chargent plus depuis le YAML. La doc de PyYAML indique de dériver la classe de `yaml.YAMLObject` et de mettre `yaml_loader` à `yaml.SafeLoader` pour la déclarer sûre.',
			'En 5.1, `FullLoader` passait pour un compromis, puis NVD a enregistré CVE-2020-1747 et CVE-2020-14343 contre lui. Les deux passaient "by abusing the python/object/new constructor", un tag que `FullLoader` acceptait encore.',
			'La doc Python : JSON "can only represent a subset of the Python built-in types, and no custom classes". Après `json.loads`, c’est à toi de construire tes objets à partir du dict.'
		]
	},
	task: {
		prompt: 'Une appli Flask lit des données à trois endroits : (1) `spec = yaml.load(request.data, Loader=yaml.Loader)` dans `POST /jobs`, (2) `prefs = pickle.loads(base64.b64decode(request.cookies["prefs"]))`, (3) `settings = yaml.safe_load(open("/etc/app/settings.yml"))` au démarrage. Quelles lignes reconstruisent des objets à partir de données qu’un utilisateur contrôle, et par quoi remplacer chacune ?',
		hint: 'Pour chaque ligne, demande-toi qui peut écrire les octets lus. Regarde ensuite quel loader utilise chaque appel.',
		answer: [
			'La ligne 1 est dangereuse. N’importe quel client envoie le corps de la requête, et `yaml.Loader` est l’ancien nom d’`UnsafeLoader`, qui connaît le tag `!!python/object/apply:`. Remplace-la par `spec = yaml.safe_load(request.data)`.',
			'La ligne 2 est dangereuse. Le navigateur garde le cookie, donc l’utilisateur peut y mettre n’importe quels octets, et `pickle.loads` importe tous les globaux qu’ils nomment. Stocke du JSON à la place : `prefs = json.loads(request.cookies["prefs"])`.',
			'Si le cookie ne doit pas être modifiable du tout, signe-le. La doc de pickle propose "signing data with hmac" et de vérifier la signature avant de charger.',
			'La ligne 3 peut rester. Les utilisateurs ne peuvent pas écrire `/etc/app/settings.yml`, et `safe_load` refuserait de toute façon un tag `!!python/`.'
		],
		steps: [
			{
				title: 'Demande qui écrit les octets',
				questions: [
					{ q: 'La ligne 1 lit `request.data`. Qui contrôle ces octets ?', options: ['Seulement le code de l’appli', 'N’importe quel client qui envoie `POST /jobs`', 'Seulement un admin avec un accès shell', 'La bibliothèque YAML, qui le remplit'], answer: 1, why: 'Le corps de la requête vient directement de celui qui envoie la requête.' },
					{ q: 'La ligne 2 lit le cookie `prefs`. Qui le contrôle ?', options: ['Le serveur, puisqu’il a posé le cookie', 'Personne : base64 le rend non modifiable', 'L’utilisateur, puisque le navigateur le garde', 'Seulement la couche session de Flask'], answer: 2, why: 'Le navigateur garde le cookie, donc l’utilisateur peut y mettre n’importe quels octets.' },
					{ q: 'La ligne 3 lit `/etc/app/settings.yml`. Qui peut l’écrire ?', options: ['Pas les utilisateurs de l’appli', 'N’importe quel client, via `POST /jobs`', 'Quiconque pose le cookie `prefs`', 'Quiconque peut lire les logs de l’appli'], answer: 0, why: 'C’est un fichier du serveur, lu au démarrage. Les utilisateurs n’ont aucun moyen de l’écrire.' },
					{ q: 'Quelles lignes prennent des données qu’un utilisateur contrôle ?', options: ['Seulement la ligne 1', 'Les lignes 1 et 3', 'Les trois', 'Les lignes 1 et 2'], answer: 3, why: 'Le corps de la requête et le cookie viennent tous deux du client. Le fichier de réglages, non.' }
				]
			},
			{
				title: 'Vérifie le loader YAML',
				questions: [
					{ q: 'Qu’est-ce que `yaml.Loader` à la ligne 1 ?', options: ['L’ancien nom d’`UnsafeLoader`', 'Un alias de `SafeLoader`', 'Le nouveau nom de `FullLoader`', 'Un loader qui ne lit que des chaînes'], answer: 0, why: '`yaml.Loader` utilise le même constructeur qu’`UnsafeLoader`, qui connaît le tag `!!python/object/apply:`.' },
					{ q: 'Un client envoie `!!python/object/apply:os.system ["echo hi"]`. Que fait la ligne 1 ?', options: ['Elle renvoie la chaîne `"echo hi"`', 'Elle appelle `os.system("echo hi")`', 'Elle lève `ConstructorError`', 'Elle lève `TypeError` pour un `Loader` manquant'], answer: 1, why: 'Le tag nomme une fonction, et le constructeur dangereux importe le module puis l’appelle.' },
					{ q: 'Quelle ligne d’`UnsafeConstructor` rend cet appel possible ?', options: ['L’`add_multi_constructor` pour `python/object/apply:`', 'La ligne `import yaml` en haut du fichier', 'Les 12 tags standard de `SafeConstructor`', 'Le fourre-tout `construct_undefined` des autres tags'], answer: 0, why: 'Seul `UnsafeConstructor` enregistre les quatre tags qui fabriquent des objets arbitraires, dont `python/object/apply:`.' },
					{ q: '`Loader=yaml.FullLoader` rendrait-il la ligne 1 sûre ?', options: ['Oui : il a été conçu comme défaut sûr', 'Oui : il refuse tous les tags', 'Non : il a eu deux CVE d’exécution de code en 2020', 'Non : il ne lit que du JSON'], answer: 2, why: 'CVE-2020-1747 et CVE-2020-14343 abusaient toutes deux du constructeur `python/object/new` que `FullLoader` acceptait encore.' }
				]
			},
			{
				title: 'Vérifie le cookie',
				questions: [
					{ q: 'Que peut faire `pickle.loads` avec un cookie écrit par l’utilisateur ?', options: ['Seulement fabriquer un dict de valeurs simples', 'Importer et appeler n’importe quel global nommé dans les octets', 'Rien, base64 est vérifié avant', 'Lire seulement les champs posés par Flask'], answer: 1, why: 'Charger un pickle peut importer et appeler n’importe quelle fonction nommée dans les données.' },
					{ q: 'Pickle a-t-il un mode sûr comme `safe_load` ?', options: ['Oui : `pickle.safe_loads`', 'Oui : le protocole 0', 'Oui : tout pickle de moins de 4096 octets', 'Non'], answer: 3, why: 'La doc Python : "Never unpickle data that could have come from an untrusted source".' },
					{ q: 'Base64 empêche-t-il l’utilisateur de modifier le cookie ?', options: ['Oui, il chiffre les données', 'Oui, si on encode deux fois', 'Non : c’est un encodage, sans clé', 'Seulement en HTTPS'], answer: 2, why: 'N’importe qui peut décoder du base64, changer les octets et réencoder.' },
					{ q: 'Un `try` autour de `pickle.loads` aide-t-il ?', options: ['Non : le code a déjà tourné dans `loads`', 'Oui : l’erreur est attrapée et loggée', 'Oui : `except` annule ce que l’appel a fait', 'Seulement pour les cookies de moins de 4096 octets'], answer: 0, why: 'L’appel à `os.system` a lieu dans `pickle.loads`. Il ne reste rien à attraper à temps.' }
				]
			},
			{
				title: 'Remplace chaque ligne',
				questions: [
					{ q: 'La ligne 1 est maintenant `yaml.safe_load(request.data)`. Le client renvoie `!!python/object/apply:os.system ["echo hi"]`. Que se passe-t-il ?', options: ['Elle appelle `os.system("echo hi")`', 'Elle renvoie la chaîne `"echo hi"`', 'Elle lève `TypeError` faute de `Loader`', 'Elle lève `ConstructorError` avant tout import'], answer: 3, why: 'Le tag n’est pas un des 12 tags standard : il tombe dans le cas par défaut, qui lève "could not determine a constructor for the tag". `POST /jobs` devrait en faire une 400.' },
					{ q: 'La ligne 2 lit maintenant du JSON avec `json.loads`. Un utilisateur remet l’ancien pickle en base64 dans le cookie `prefs`. Que se passe-t-il ?', options: ['Elle importe les globales que nomment les octets', 'Elle lève une erreur de décodage : la valeur n’est pas du JSON, et rien n’est importé ni appelé', 'Elle renvoie l’objet que décrivait le pickle', 'Elle décode le base64, puis le dépickle'], answer: 1, why: '`json.loads` ne construit que des dicts, des listes, des chaînes, des nombres, des booléens et `None`. Des octets qu’il ne sait pas lire finissent en erreur, jamais en appel.' },
					{ q: 'Le cookie ne doit en plus pas être modifiable du tout. Qu’ajoutes-tu ?', options: ['Une signature `hmac` vérifiée avant de charger', 'Un nom de cookie plus long et plus aléatoire', 'Le seul drapeau `HttpOnly` sur le cookie', 'Un second pickle qui porte une somme de contrôle'], answer: 0, why: 'La doc de pickle propose "signing data with hmac" et de vérifier la signature avant de charger.' },
					{ q: 'Que fais-tu de la ligne 3 ?', options: ['La passer à `yaml.Loader` pour tout le YAML', 'La remplacer par `pickle.load` sur un fichier binaire', 'La garder : le fichier est de confiance et `safe_load` est sûr', 'La supprimer : un fichier de config n’est jamais sûr'], answer: 2, why: 'L’entrée est de confiance et le loader est déjà le bon.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un service lit des fichiers YAML envoyés par les utilisateurs. Quel appel les lit sans fabriquer d’objets Python arbitraires ?',
			options: [
				'`yaml.safe_load(data)`',
				'`yaml.load(data, Loader=yaml.FullLoader)`',
				'`yaml.load(data, Loader=yaml.Loader)`',
				'`yaml.unsafe_load(data)` après avoir vérifié l’extension `.yml`'
			],
			answer: 0,
			why: '`safe_load` utilise `SafeConstructor`, qui lève `ConstructorError` sur tout tag hors de ses 12 tags standard. `yaml.Loader` utilise le même constructeur qu’`UnsafeLoader`, et `FullLoader` a eu deux CVE d’exécution de code en 2020. L’extension du fichier ne dit rien des tags qu’il contient.'
		},
		{
			q: 'Avec PyYAML 6.0, que se passe-t-il quand le code appelle `yaml.load(data)` sans argument `Loader` ?',
			options: [
				'Il lit avec `FullLoader` et affiche un `YAMLLoadWarning`',
				'Il lève `TypeError`, car `Loader` est un argument obligatoire',
				'Il lit avec `SafeLoader`, devenu le défaut en 6.0',
				'Il lit avec `UnsafeLoader`, comme la version 3.13'
			],
			answer: 1,
			why: 'La PR #561 a changé la signature de `def load(stream, Loader=None):` en `def load(stream, Loader):` et retiré l’avertissement. Python lève alors "missing 1 required positional argument: \'Loader\'". Le défaut `FullLoader` avec avertissement, c’était de la 5.1 à la 5.4.'
		},
		{
			q: 'Une appli web garde les préférences dans un cookie, sous forme de pickle encodé en base64. Vers quel changement pointe la doc Python ?',
			options: [
				'Entourer `pickle.loads` d’un `try` et `except` pour qu’un cookie abîmé ne fasse que logger',
				'Encoder le pickle deux fois en base64 pour que l’utilisateur ne puisse ni le lire ni le modifier',
				'Rejeter les cookies de plus de 4096 octets avant d’appeler `pickle.loads`',
				'Stocker les préférences en JSON dans le cookie et les lire avec `json.loads`'
			],
			answer: 3,
			why: 'Le code s’exécute pendant le chargement, dans `pickle.loads` : le `try` arrive trop tard, et un pickle court peut quand même nommer `os.system`. Base64 est un encodage, sans clé. La doc dit que JSON "does not in itself create an arbitrary code execution vulnerability."'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Voir un tag YAML et un pickle lancer une commande sur ton portable, puis voir `safe_load` et JSON les refuser.',
		steps: [
			'Prépare : `mkdir -p ~/deser-lab && cd ~/deser-lab && python3 -m venv .venv && .venv/bin/pip install pyyaml`.',
			'Écris un job hostile : `printf \'%s\\n\' \'!!python/object/apply:os.system ["echo pwned > proof.txt"]\' > job.yml`.',
			'Charge-le avec le loader complet : `.venv/bin/python -c \'import yaml; yaml.load(open("job.yml"), Loader=yaml.Loader)\'`, puis `cat proof.txt` et `rm proof.txt`.',
			'Charge-le en sécurité : `.venv/bin/python -c \'import yaml; yaml.safe_load(open("job.yml"))\'`, puis essaie `yaml.load(open("job.yml"))` sans `Loader`.',
			'Fabrique un cookie hostile : `python3 -c \'import os, pickle, base64; P = type("P", (), {"__reduce__": lambda s: (os.system, ("echo pickled > proof.txt",))}); print(base64.b64encode(pickle.dumps(P())).decode())\' > cookie.txt`, puis charge-le avec `python3 -c \'import pickle, base64; pickle.loads(base64.b64decode(open("cookie.txt").read()))\'`.'
		],
		done: [
			'Après l’étape 3, `cat proof.txt` affiche `pwned`.',
			'`safe_load` s’arrête sur `could not determine a constructor for the tag` et `proof.txt` n’est pas créé.',
			'Le `yaml.load` nu lève `TypeError` à propos du `Loader` manquant (PyYAML 6.0 ou plus).',
			'Après l’étape 5, `cat proof.txt` affiche `pickled`.'
		],
		solution: [
			'Le tag YAML nomme `os.system`, et `yaml.Loader` l’importe puis l’appelle. `safe_load` n’a pas de constructeur pour ce tag et lève une erreur avant d’importer quoi que ce soit.',
			'Le `__reduce__` du pickle dit à `pickle.loads` d’appeler `os.system`. Aucune option de pickle ne l’empêche.',
			'La correction du cookie : `python3 -c \'import json; print(json.loads("{\\"theme\\": \\"dark\\"}"))\'` renvoie un simple dict. JSON ne contient que des valeurs simples.'
		]
	},
	recall: {
		q: 'Quel appel PyYAML utilises-tu sur un YAML venu d’un utilisateur, et depuis quelle version `yaml.load` refuse-t-il de tourner sans `Loader` ?',
		a: '`yaml.safe_load(data)`, qui utilise `SafeLoader` et refuse tout tag hors de ses 12 tags standard. Depuis PyYAML 6.0 (13 octobre 2021), `yaml.load(data)` sans `Loader` lève `TypeError`.'
	},
	sources: [
		{ title: 'NVD, CVE-2017-18342', url: 'https://nvd.nist.gov/vuln/detail/CVE-2017-18342' },
		{ title: 'NVD, CVE-2020-14343 (correction incomplète de CVE-2020-1747)', url: 'https://nvd.nist.gov/vuln/detail/CVE-2020-14343' },
		{ title: 'Wiki PyYAML, PyYAML yaml.load(input) Deprecation', url: 'https://github.com/yaml/pyyaml/wiki/PyYAML-yaml.load(input)-Deprecation' },
		{ title: 'yaml/pyyaml PR #561, yaml.load(s, Loader=...) requires Loader= argument always', url: PR561 },
		{ title: 'Documentation PyYAML', url: 'https://pyyaml.org/wiki/PyYAMLDocumentation' },
		{ title: 'Documentation Python, pickle (avertissement de sécurité et Restricting Globals)', url: 'https://docs.python.org/3/library/pickle.html' },
		{ title: 'OWASP Deserialization Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html' }
	]
};
