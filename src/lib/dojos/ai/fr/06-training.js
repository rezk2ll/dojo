const NANO = 'https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'training',
	part: 'Comment marchent les modèles',
	title: 'Comment on entraîne un modèle',
	minutes: 10,
	hook: [
		'Dans l’article InstructGPT (2022), les auteurs donnent une petite fonction Python à GPT-3 175B et demandent : "What is the purpose of the list C in the code below?" Le modèle ne répond pas. Il écrit quatre choix, de "A. to store the value of C[0]" à "D. to store the value of C[i - 1]", comme une page de QCM.',
		'Le même modèle, après trois étapes d’entraînement en plus, s’appelle InstructGPT et répond à la question par des phrases. Même architecture, mêmes 175B paramètres. **La différence vient de l’entraînement fait après le pré-entraînement, sur des prompts et des réponses humaines.**'
	],
	terms: [
		{ term: 'Pré-entraînement', def: 'Entraîner un modèle à prédire le token suivant sur une grande masse de texte brut. On obtient un modèle de base, qui prolonge du texte.' },
		{ term: 'SFT', def: 'Supervised fine-tuning : on continue d’entraîner le modèle de base sur des prompts accompagnés de réponses écrites par des personnes.' },
		{ term: 'RLHF', def: 'Reinforcement learning from human feedback : des personnes classent des réponses, un modèle de récompense apprend à prédire ce classement, et on entraîne le modèle à obtenir une récompense élevée.' },
		{ term: 'Constitutional AI', def: 'La méthode d’Anthropic où un modèle critique et réécrit ses propres réponses, et désigne la moins nocive de deux réponses, à l’aide d’une liste écrite de principes.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['web[("Texte brut : pages web, livres, code")] -->|"prédire le token suivant"| base["Modèle de base"]'],
				highlight: ['web', 'base'],
				note: 'Le pré-entraînement montre au modèle une fenêtre de tokens et note sa prédiction pour chaque token suivant. Le README de nanoGPT annonce GPT-2 (124M) reproduit sur OpenWebText en "about 4 days" sur un nœud de 8 GPU A100. Personne n’écrit de réponse ici : la cible, c’est le token qui suit dans le texte.'
			},
			{
				add: ['base -->|"prolonge le texte"| quiz["Prompt : à quoi sert la liste C ? Sortie : A. B. C. D."]'],
				highlight: ['quiz'],
				note: 'Un modèle de base écrit ce qui a des chances de suivre dans ses textes d’entraînement. Après une question sur du code, une page de QCM à quatre choix est une suite probable. L’article InstructGPT précise que GPT-3 répond à cette question de code "about 50% of the time".'
			},
			{
				add: ['demo["13k prompts avec réponses écrites par les annotateurs"] -->|"même perte sur le token suivant"| sft["Modèle SFT"]', 'base --> sft'],
				highlight: ['demo', 'sft'],
				note: 'L’étape 1 d’InstructGPT, c’est le SFT. Une équipe de 40 prestataires a écrit la réponse attendue pour environ 13k prompts d’entraînement. Le modèle s’entraîne sur ces paires avec la même perte qu’au pré-entraînement, et apprend la forme « une question, puis une réponse ».'
			},
			{
				add: ['rank["33k prompts : les annotateurs classent 4 à 9 réponses"] --> rm["Modèle de récompense : prompt + réponse en entrée, un nombre en sortie"]', 'sft --> rank'],
				highlight: ['rank', 'rm'],
				note: 'L’étape 2 entraîne un modèle de récompense. Pour chaque prompt, les annotateurs classent entre 4 et 9 réponses du modèle SFT. Un modèle de 6B apprend à donner un score plus haut à la réponse préférée.'
			},
			{
				add: ['rm -->|"récompense"| ppo["PPO sur 31k prompts, pénalité KL vers le modèle SFT"]', 'sft --> ppo', 'ppo --> inst["InstructGPT"]'],
				highlight: ['ppo', 'inst'],
				note: 'L’étape 3, c’est le RLHF avec l’algorithme PPO. Le modèle répond à 31k prompts et on le pousse vers une récompense plus haute. Une pénalité KL à chaque token le garde proche du modèle SFT : il ne peut pas dériver vers du texte qui trompe seulement le modèle de récompense.'
			},
			{
				add: ['rules["16 principes écrits"] --> fb["Un modèle de feedback choisit la moins nocive de 2 réponses"]', 'fb -->|"des étiquettes IA à la place des étiquettes humaines sur la nocivité"| rm'],
				highlight: ['rules', 'fb'],
				note: 'Constitutional AI change l’origine des étiquettes de nocivité. Un modèle de feedback lit deux réponses et un principe tiré au hasard parmi 16, puis en choisit une. Pour l’utilité, des personnes écrivent toujours les étiquettes, comme en RLHF. Anthropic appelle ça "RL from AI Feedback" (RLAIF).'
			}
		]
	},
	example: {
		title: 'train.py : get_batch, où la cible est le token suivant',
		repo: 'karpathy/nanoGPT',
		url: `${NANO}/train.py#L116-L131`,
		lang: 'python',
		code: `def get_batch(split):
    # We recreate np.memmap every batch to avoid a memory leak, as per
    # https://stackoverflow.com/questions/45132940/numpy-memmap-memory-usage-want-to-iterate-once/61472122#61472122
    if split == 'train':
        data = np.memmap(os.path.join(data_dir, 'train.bin'), dtype=np.uint16, mode='r')
    else:
        data = np.memmap(os.path.join(data_dir, 'val.bin'), dtype=np.uint16, mode='r')
    ix = torch.randint(len(data) - block_size, (batch_size,))
    x = torch.stack([torch.from_numpy((data[i:i+block_size]).astype(np.int64)) for i in ix])
    y = torch.stack([torch.from_numpy((data[i+1:i+1+block_size]).astype(np.int64)) for i in ix])
    if device_type == 'cuda':
        # pin arrays x,y, which allows us to move them to GPU asynchronously (non_blocking=True)
        x, y = x.pin_memory().to(device, non_blocking=True), y.pin_memory().to(device, non_blocking=True)
    else:
        x, y = x.to(device), y.to(device)
    return x, y`,
		notes: [
			'La ligne 5 ouvre `train.bin` : tout le jeu de données en une seule suite d’identifiants de tokens GPT-2, stockés en `uint16`. Le vocabulaire de GPT-2 compte 50 257 tokens, donc chaque identifiant tient sur 16 bits.',
			'La ligne 8 tire `batch_size` points de départ au hasard, 12 par défaut, et la ligne 9 découpe `block_size` tokens à partir de chacun : 1024 par défaut. Les fenêtres traversent les frontières de documents, et personne ne les a étiquetées.',
			'La ligne 10 construit les cibles `y` à partir des mêmes données, décalées d’un token vers la droite. La position 0 de `y` contient le token qui suit la position 0 de `x` : chaque position de la fenêtre sert d’exemple d’entraînement.',
			'Le modèle compare ses prédictions à `y` avec [`F.cross_entropy`](' + NANO + '/model.py#L184-L187), dans `model.py`. Le SFT reprend cette boucle : le README dit "Finetuning is no different than training", avec un modèle pré-entraîné au départ et un learning rate plus petit (`3e-5` dans `config/finetune_shakespeare.py`, contre `6e-4` dans `train.py`).'
		]
	},
	tradeoff: {
		gain: [
			'Les annotateurs ont préféré les réponses d’InstructGPT 1.3B à celles de GPT-3 175B, un modèle qui a plus de 100 fois plus de paramètres.',
			'Sur les tâches où la réponse doit venir de l’entrée, comme un résumé, InstructGPT a inventé des informations dans 21 % des cas, contre 41 % pour GPT-3.',
			'Constitutional AI a entraîné un assistant inoffensif sans aucune étiquette humaine sur la nocivité. L’article : "The only human oversight is provided through a list of rules or principles".'
		],
		cost: [
			'Le RLHF a fait baisser les scores sur des benchmarks publics comme SQuAD, DROP, HellaSwag et la traduction WMT 2015 du français vers l’anglais. L’article appelle ça un "alignment tax" et le réduit en mêlant des mises à jour de pré-entraînement au PPO.',
			'Le modèle apprend les préférences de "a specific group of people (mostly our labelers and researchers)", selon l’article, et pas une idée générale des valeurs humaines.',
			'Le modèle de récompense n’est qu’une estimation apprise des préférences humaines. Sans pénalité KL, le PPO peut trouver des réponses très bien notées que personne ne préférerait.'
		]
	},
	task: {
		prompt: 'Ton `train.bin` contient les identifiants `[10, 20, 30, 40, 50, 60]` et `block_size` vaut 4. `get_batch` tire le point de départ `i = 1`. Écris les `x` et `y` renvoyés pour cette ligne, et dis combien de prédictions de token suivant la perte note. Puis dis quelle étape du schéma empêcherait le modèle de répondre à une question par une liste de choix de QCM.',
		hint: 'La ligne 9 découpe `data[i:i+block_size]`, la ligne 10 découpe `data[i+1:i+1+block_size]`.',
		answer: [
			'`x = [20, 30, 40, 50]` et `y = [30, 40, 50, 60]`. Chaque position de `y` contient le token qui suit la même position dans `x`.',
			'La perte note 4 prédictions pour cette ligne : après `20` prédire `30`, après `20 30` prédire `40`, et ainsi de suite jusqu’à `60`.',
			'Le SFT est la première étape utile : le modèle s’entraîne sur environ 13k prompts accompagnés de réponses écrites, donc après une question, une réponse est la suite probable. Le RLHF s’entraîne ensuite sur des classements de ces réponses.'
		]
	},
	quiz: [
		{
			q: 'Dans la boucle de pré-entraînement de nanoGPT, à quoi la perte compare-t-elle la sortie du modèle ?',
			options: [
				'À des réponses écrites par des annotateurs pour chaque prompt',
				'Au score d’un modèle de récompense entraîné sur des classements',
				'Au token suivant du même texte, pris dans `y` décalé d’un cran',
				'À la sortie d’un modèle professeur plus grand sur la même fenêtre'
			],
			answer: 2,
			why: '`get_batch` construit `y` avec `data[i+1:i+1+block_size]`, les mêmes tokens décalés d’un cran. `F.cross_entropy` note la probabilité que le modèle donne à chacun de ces tokens suivants. Les réponses écrites par des personnes n’arrivent qu’à l’étape SFT.'
		},
		{
			q: 'Que produisent les annotateurs d’InstructGPT pour entraîner le modèle de récompense ?',
			options: [
				'Une réponse écrite par prompt, utilisée comme texte cible',
				'Un classement de 4 à 9 réponses du modèle pour un même prompt',
				'Une note de 1 à 10 tapée pour chaque réponse prise seule',
				'Une liste de principes que le modèle doit suivre'
			],
			answer: 1,
			why: 'Les annotateurs classent entre K = 4 et K = 9 réponses, ce qui donne chaque paire de réponses comme comparaison. Le modèle de récompense apprend à donner un nombre plus haut à la réponse préférée de chaque paire. Les réponses écrites servent au SFT, les principes à Constitutional AI.'
		},
		{
			q: 'Dans la phase RL de Constitutional AI, d’où viennent les étiquettes de nocivité ?',
			options: [
				'De crowdworkers qui comparent deux réponses et gardent la plus sûre',
				'D’un filtre par mots-clés qui signale les mots interdits',
				'Des annotateurs du SFT, qui notent une seconde fois',
				'D’un modèle de feedback qui choisit entre deux réponses avec un principe'
			],
			answer: 3,
			why: 'Le modèle de feedback voit la conversation, deux réponses et un principe tiré parmi 16, et ses probabilités pour (A) et (B) donnent l’étiquette. Pour l’utilité, des humains fournissent toujours les étiquettes, comme en RLHF. Un modèle de préférence entraîné sur ces étiquettes donne ensuite la récompense du RL.'
		}
	],
	recall: {
		q: 'Quelles trois étapes InstructGPT ajoute-t-il après le pré-entraînement, et sur combien de prompts chacune ?',
		a: 'Un SFT sur environ 13k prompts avec réponses écrites, un modèle de récompense entraîné sur des classements pour 33k prompts, puis du PPO contre cette récompense sur 31k prompts.'
	},
	sources: [
		{ title: 'Ouyang et al. 2022, Training language models to follow instructions with human feedback (InstructGPT), lu le 2026-10-17', url: 'https://arxiv.org/abs/2203.02155' },
		{ title: 'Bai et al. 2022, Constitutional AI: Harmlessness from AI Feedback, lu le 2026-10-17', url: 'https://arxiv.org/abs/2212.08073' },
		{ title: 'Anthropic, Claude’s Constitution, lu le 2026-10-17', url: 'https://www.anthropic.com/news/claudes-constitution' },
		{ title: 'README de karpathy/nanoGPT (section finetuning)', url: `${NANO}/README.md` },
		{ title: 'karpathy/nanoGPT config/finetune_shakespeare.py', url: `${NANO}/config/finetune_shakespeare.py` }
	]
};
