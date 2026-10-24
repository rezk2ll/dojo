const COOKBOOK = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const PAPER = 'https://arxiv.org/abs/2406.10279';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'hallucination',
	part: 'Comment marchent les modèles',
	title: 'Sûr de lui et faux',
	minutes: 10,
	hook: [
		'Tu demandes à un modèle un script qui modifie un fichier YAML en gardant ses commentaires. La réponse importe un paquet au nom plausible, appelle trois de ses fonctions et les explique une par une. `pip install` ne trouve aucun paquet de ce nom.',
		'Spracklen et al. ont généré 576 000 extraits de code avec 16 modèles et trouvé **205 474 noms de paquets uniques qui n’existent pas**. Le taux atteignait au moins 5,2 % pour les modèles commerciaux et 21,7 % pour les modèles open source.'
	],
	terms: [
		{ term: 'Hallucination', def: 'Un texte "factually incorrect or inconsistent with the given context" (faux, ou contraire au contexte fourni), selon le guide d’Anthropic.' },
		{ term: 'Hallucination de paquet', def: 'Du code généré qui importe ou recommande un paquet absent du registre.' },
		{ term: 'Ancrage', def: 'Mettre le texte source dans le contexte et demander au modèle de répondre uniquement à partir de lui, en citant.' },
		{ term: 'Citation', def: 'Un lien entre une phrase de la réponse et le passage d’un document fourni qui l’appuie. L’API Claude la renvoie sous forme de `cited_text` et d’un emplacement.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['q["Prompt : lire du YAML en gardant les commentaires"] --> gen["Le modèle prédit les tokens suivants probables"]'],
				highlight: ['q', 'gen'],
				note: 'Le modèle écrit, un par un, des tokens probables après le prompt (jour 2). Aucune étape de cette boucle ne cherche le nom du paquet sur PyPI : un nom inexistant peut sortir comme n’importe quel autre.'
			},
			{
				add: ['gen --> fake["import d’un paquet qui n’existe pas"]'],
				highlight: ['fake'],
				note: 'L’article donne la définition : une hallucination de paquet "occurs when an LLM generates code that recommends or contains a reference to a package that does not actually exist." (le code recommande ou référence un paquet qui n’existe pas).'
			},
			{
				add: ['fake -->|"même prompt, 10 essais"| rep["43 % des faux noms revenaient aux 10 essais"]', 'rep --> atk["Un attaquant publie ce nom avec du code malveillant"]'],
				highlight: ['rep', 'atk'],
				note: 'Les auteurs ont repris 500 prompts qui avaient produit un faux paquet et relancé chacun 10 fois. 43 % des faux paquets revenaient aux 10 essais, et 39 % ne revenaient jamais. Un nom qui se répète, un attaquant peut le prévoir, le déposer sur le registre et attendre.'
			},
			{
				add: ['docs["Docs ou code mis dans le contexte"] --> ground["Répondre seulement à partir d’eux, citer d’abord"]', 'ground --> idk["Permis : je ne sais pas"]'],
				highlight: ['docs', 'ground', 'idk'],
				note: 'Le guide d’Anthropic commence par trois remèdes. Donne à Claude dans le prompt la "permission to admit uncertainty" (le droit d’avouer un doute). Pour un document de plus de 20k tokens, demande-lui "to extract word-for-word quotes first". La liste avancée ajoute la consigne de n’utiliser que les documents fournis, "not its general knowledge".'
			},
			{
				add: ['ground --> cite["Citations : chaque affirmation pointe vers un passage"]', 'cite --> check["Tu vérifies les passages cités et les phrases sans citation"]'],
				highlight: ['cite', 'check'],
				note: 'Avec les citations activées, l’API extrait elle-même `cited_text` : les citations "are guaranteed to contain valid pointers to the provided documents" (pointent forcément vers les documents fournis). Les phrases sans citation viennent du modèle seul, et c’est toi qui les vérifies.'
			}
		]
	},
	example: {
		title: 'misc/using_citations.ipynb : réponses d’aide en ligne avec citations activées',
		repo: 'anthropics/claude-cookbooks',
		url: `${COOKBOOK}/misc/using_citations.ipynb?plain=1#L132-L168`,
		lang: 'python',
		code: `articles_dir = "./data/help_center_articles"
documents = []

for filename in sorted(os.listdir(articles_dir)):
    if filename.endswith(".txt"):
        with open(os.path.join(articles_dir, filename)) as f:
            content = f.read()
            # Split into title and body
            title_line, body = content.split("\\n", 1)
            title = title_line.replace("title: ", "")
            documents.append(
                {
                    "type": "document",
                    "source": {"type": "text", "media_type": "text/plain", "data": body},
                    "title": title,
                    "citations": {"enabled": True},
                }
            )

QUESTION = "I just checked out, where is my order tracking number? Track package is not available on the website yet for my order."

# Add the question to the content
content = documents

response = client.messages.create(
    model="claude-sonnet-4-6",
    temperature=0.0,
    max_tokens=1024,
    system="You are a customer support bot working for PetWorld. Your task is to provide short, helpful answers to user questions. Since you are in a chat interface avoid providing extra details. You will be given access to PetWorld's help center articles to help you answer questions.",
    messages=[
        {"role": "user", "content": documents},
        {
            "role": "user",
            "content": [{"type": "text", "text": f"Here is the user's question: {QUESTION}"}],
        },
    ],
)`,
		notes: [
			'La boucle transforme chaque article d’aide en bloc `document`, et `"citations": {"enabled": True}` demande à l’API d’y accrocher des liens. Le notebook précise qu’un texte brut "will get automatically chunked into sentences" (est découpé en phrases).',
			'Les documents vont dans le premier tour utilisateur, la question dans le second. Chaque phrase citée de la réponse se rattache alors à l’un de ces articles.',
			'La sortie enregistrée contient 3 blocs de texte. Celui du milieu porte deux citations de "Order Tracking Information", dont "If you haven\'t received a tracking number within 48 hours of your order confirmation, please contact our customer support team."',
			'Le dernier bloc, "your order likely hasn\'t shipped yet", n’a pas de citation. C’est une déduction du modèle, et ton interface peut l’afficher autrement que les phrases citées.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque phrase citée renvoie à un passage que le lecteur peut ouvrir, et l’API garantit que le lien pointe dans un document que tu as envoyé.',
			'La doc indique que `cited_text` "does not count toward your output tokens" : les citations peuvent coûter moins cher qu’un prompt qui demande à Claude de recopier les extraits.'
		],
		cost: [
			'L’ancrage demande la source dans le contexte : pour une question de paquet, tu vas chercher la vraie doc ou le code installé avant de demander.',
			'Les citations ne couvrent que les phrases qui en portent une. Les blocs sans citation, comme le "likely hasn\'t shipped yet" du cookbook, demandent encore un humain ou une vérification.',
			'Le guide d’Anthropic prévient que ces techniques "don\'t eliminate them entirely" (ne les suppriment pas toutes) et demande de valider les informations critiques.'
		]
	},
	task: {
		prompt: 'Un modèle t’a écrit `import yamlkeeper` et `yamlkeeper.load_with_comments(path)`. Note, dans l’ordre, les vérifications que tu fais avant `pip install`, puis réécris ton prompt pour que la réponse suivante soit ancrée.',
		hint: 'Une vérification porte sur le registre, une autre sur le code que tu as déjà. Pour le prompt, reprends les trois stratégies de base du guide d’Anthropic.',
		answer: [
			'Le registre d’abord : `pip index versions yamlkeeper` affiche "No matching distribution found for yamlkeeper", et `https://pypi.org/pypi/yamlkeeper/json` renvoie 404 (vérifié le 2026-10-17). Le modèle a inventé l’import. Si un paquet de ce nom existait, regarde son âge, son auteur et ses téléchargements avant d’installer, car un attaquant peut déposer un nom que les modèles répètent.',
			'Ensuite, vérifie si une bibliothèque dont tu dépends déjà fait le travail. Cherche une bibliothèque YAML dans ton lockfile et lis sa doc sur la gestion des commentaires.',
			'Réécris le prompt avec la vraie doc de la bibliothèque collée dans des balises `<docs>`. Demande au modèle de citer les fonctions qu’il utilise depuis cette doc, de n’utiliser aucun paquet hors de celle-ci, et de répondre « je ne sais pas » si la doc ne parle pas de garder les commentaires.',
			'Lance la nouvelle réponse et vérifie que chaque fonction appelée figure dans les extraits cités. Une fonction présente dans le code mais absente des extraits vient du modèle : considère-la comme non vérifiée.'
		],
		steps: [
			{
				title: 'Vérifie le registre',
				questions: [
					{ q: 'Que lances-tu en premier ?', options: ['`pip install yamlkeeper`, pour voir si ça marche', '`pip index versions yamlkeeper`', 'Un second prompt qui demande au modèle si le paquet existe', 'Une recherche de numéro de version dans la réponse'], answer: 1, why: 'Vérifie le registre avant d’installer quoi que ce soit. Installer un nom non vérifié, c’est ce qu’attend l’attaque.' },
					{ q: 'La commande affiche "No matching distribution found for yamlkeeper". Qu’est-ce que ça t’apprend ?', options: ['Le modèle a inventé l’import', 'Le paquet est privé, il te faut un jeton', 'PyPI est en panne, réessaie plus tard', 'Le paquet a été renommé en `yaml`'], answer: 0, why: 'Aucun paquet de ce nom n’existe sur PyPI. Le modèle a écrit un nom vraisemblable, et rien dans sa boucle ne l’a vérifié.' },
					{ q: 'Que renvoie `https://pypi.org/pypi/yamlkeeper/json` ?', options: ['200, avec une liste de versions vide', 'Une redirection vers un paquet proche', '404', '403, car tu n’es pas connecté'], answer: 2, why: 'Un 404 de l’API JSON de PyPI confirme qu’il n’y a pas de tel projet (vérifié le 2026-10-17).' },
					{ q: 'Imagine qu’un paquet `yamlkeeper` existe. Que regardes-tu avant de l’installer ?', options: ['Seulement que le nom correspond à l’import', 'Qu’il a un README', 'Rien : s’il existe, il est sûr', 'Son âge, son auteur et ses téléchargements'], answer: 3, why: 'Un attaquant peut déposer un nom que les modèles répètent. 43 % des faux noms revenaient dans les 10 exécutions du même prompt.' }
				]
			},
			{
				title: 'Regarde ce que tu as déjà',
				questions: [
					{ q: 'Quelle est la deuxième vérification ?', options: ['Si une bibliothèque dont tu dépends déjà fait le travail', 'Si le modèle redonne le même nom à la seconde exécution', 'Si le nom de la fonction sonne juste', 'Si un autre modèle propose le même paquet'], answer: 0, why: 'Le code que tu as déjà est réel et installé. Pars de lui avant de chercher un nouveau paquet.' },
					{ q: 'Comment trouves-tu cette bibliothèque ?', options: ['Demander au modèle la liste de tes dépendances', 'Chercher une bibliothèque YAML dans ton lockfile', 'Chercher « yaml » sur PyPI et prendre le premier résultat', 'Relire l’explication du modèle'], answer: 1, why: 'Le lockfile liste ce qui est vraiment installé. La parole du modèle sur tes dépendances n’est pas une vérification.' },
					{ q: 'Tu trouves une bibliothèque YAML dans le lockfile. Que lis-tu ensuite ?', options: ['Son changelog', 'Sa licence', 'Sa doc sur la gestion des commentaires', 'Son nombre d’étoiles'], answer: 2, why: 'Le but est de garder les commentaires : la doc sur leur gestion te dit si cette bibliothèque le fait.' },
					{ q: 'Pourquoi obtenir le même nom à une seconde exécution ne prouve-t-il rien ?', options: ['43 % des faux noms revenaient dans les 10 exécutions', 'Le modèle ne vérifie PyPI qu’à la première exécution', 'La seconde exécution utilise un modèle plus petit', 'Un nom répété est toujours un vrai paquet'], answer: 0, why: 'Les faux noms reviennent souvent. C’est ce qui les rend prévisibles pour un attaquant.' }
				]
			},
			{
				title: 'Ancre le prompt',
				questions: [
					{ q: 'Que mets-tu dans le nouveau prompt ?', options: ['Une description plus longue de ce que tu veux', 'Le faux import, marqué comme faux', 'Une demande de faire plus d’efforts', 'La vraie doc de la bibliothèque, dans des balises `<docs>`'], answer: 3, why: 'L’ancrage demande la source dans le contexte. Le modèle peut alors répondre à partir d’un texte fiable.' },
					{ q: 'Quelle consigne garde le modèle dans cette doc ?', options: ['Sois créatif avec l’API', 'N’utilise aucun paquet hors de la doc', 'Sers-toi aussi de tes connaissances générales', 'Préfère le paquet le plus récent que tu connais'], answer: 1, why: 'La liste avancée d’Anthropic dit de n’utiliser que les documents fournis, "not its general knowledge".' },
					{ q: 'Que demandes-tu au modèle de citer ?', options: ['Les fonctions qu’il utilise, tirées de la doc', 'Toute la doc, en retour', 'Son raisonnement, étape par étape', 'La page PyPI de la bibliothèque'], answer: 0, why: 'Une citation relie chaque fonction à un passage de la doc : tu peux la vérifier.' },
					{ q: 'Que doit faire le modèle si la doc ne parle pas de garder les commentaires ?', options: ['Donner sa meilleure idée de fonction', 'Nommer un paquet qui pourrait le faire', 'Répondre « je ne sais pas »', 'Renvoyer du code vide sans message'], answer: 2, why: 'Le premier remède d’Anthropic est de donner au modèle la "permission to admit uncertainty".' }
				]
			},
			{
				title: 'Vérifie la nouvelle réponse',
				questions: [
					{ q: 'Que vérifies-tu en lançant la nouvelle réponse ?', options: ['Que chaque fonction appelée figure dans les extraits cités', 'Qu’elle tourne sans avertissement', 'Qu’elle est plus courte que la première', 'Qu’elle garde les mêmes noms qu’avant'], answer: 0, why: 'Tourner ne suffit pas. Chaque appel doit correspondre à un passage que le modèle a cité.' },
					{ q: 'Une fonction est dans le code mais pas dans les extraits. Qu’est-ce que c’est ?', options: ['Rien d’inquiétant : le modèle l’a vue à l’entraînement', 'Du non vérifié : elle vient du modèle', 'Une fonction interne de la bibliothèque', 'La preuve que la doc n’est plus à jour'], answer: 1, why: 'Rien dans le contexte ne l’appuie : ce sont les mots du modèle tant que tu ne l’as pas vérifiée.' },
					{ q: 'Ces techniques suppriment-elles les hallucinations ?', options: ['Oui, dès que le modèle cite d’abord', 'Oui, à température 0', 'Seulement avec les citations activées', 'Non : le guide d’Anthropic dit qu’elles "don’t eliminate them entirely"'], answer: 3, why: 'Le guide demande de valider quand même les informations critiques.' },
					{ q: 'Avec les citations activées, quelles phrases ne s’appuient sur aucun passage de tes documents ?', options: ['Celles qui ne portent aucune citation', 'Chaque phrase citée', 'Seulement la première phrase', 'Aucune : chaque phrase reçoit une citation'], answer: 0, why: 'Les citations pointent forcément vers tes documents. Les phrases sans citation viennent du modèle seul, et tu les vérifies à la main.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Pourquoi est-ce grave que 43 % des noms de paquets hallucinés reviennent aux 10 essais du même prompt ?',
			options: [
				'Un attaquant peut prévoir le nom et publier un paquet malveillant sous ce nom',
				'Cela prouve que les paquets existent sur un registre privé vu par le modèle',
				'Cela veut dire que la température n’a aucun effet sur les hallucinations',
				'Cela montre que le modèle consulte PyPI et garde la réponse en cache'
			],
			answer: 0,
			why: 'Un nom qui se répète sera proposé à beaucoup d’utilisateurs. L’article décrit l’attaque : publier un paquet "with the same name as the hallucinated or fictitious package" contenant du code malveillant, puis attendre qu’on l’installe.'
		},
		{
			q: 'Avec la fonction Citations activée, que garantit l’API Claude ?',
			options: [
				'Chaque phrase de la réponse est appuyée par un document fourni',
				'Chaque citation pointe vers un vrai emplacement d’un document fourni',
				'Le modèle refuse de répondre si aucun document n’est pertinent',
				'Le texte cité est vérifié sur le web'
			],
			answer: 1,
			why: 'L’API analyse les citations et extrait elle-même `cited_text` : les citations "are guaranteed to contain valid pointers to the provided documents". Les blocs sans citation, comme le dernier bloc du cookbook, n’ont pas cette garantie.'
		},
		{
			q: 'Tu interroges Claude sur un contrat de 60k tokens. Quelle étape le guide d’Anthropic recommande-t-il avant l’analyse ?',
			options: [
				'Lui demander d’abord un résumé du contrat en 500 mots',
				'Monter la température pour qu’il explore plus de clauses',
				'Lui demander d’abord d’extraire des citations mot pour mot',
				'Découper le contrat et poser la question partie par partie'
			],
			answer: 2,
			why: 'Pour les documents de plus de 20k tokens, le guide demande d’extraire d’abord des citations mot pour mot ("extract word-for-word quotes first before performing its task") : l’analyse repose alors sur du texte présent dans le document.'
		}
	],
	recall: {
		q: 'Quelle part des paquets générés l’étude de Spracklen et al. a-t-elle trouvée hallucinée, et quels sont les trois remèdes de base d’Anthropic ?',
		a: 'Au moins 5,2 % pour les modèles commerciaux et 21,7 % pour les modèles open source. Les remèdes : autoriser « je ne sais pas », extraire d’abord des citations exactes, et vérifier les affirmations avec des citations.'
	},
	sources: [
		{ title: 'Doc Claude, Reduce hallucinations, lue le 2026-10-17', url: 'https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations' },
		{ title: 'Doc Claude, Citations, lue le 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/citations' },
		{ title: 'Spracklen et al. 2024, We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs (arXiv 2406.10279)', url: PAPER },
		{ title: 'anthropics/claude-cookbooks, misc/using_citations.ipynb', url: `${COOKBOOK}/misc/using_citations.ipynb` }
	]
};
