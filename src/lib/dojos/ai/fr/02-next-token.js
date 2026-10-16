const NANOGPT = 'https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'next-token',
	part: 'Comment marchent les modèles',
	title: 'Prédire le token suivant',
	minutes: 10,
	hook: [
		'Tu colles deux fois la même fonction dans un chat et tu demandes un nom. La première réponse est `parse_header`, la seconde `read_header_line`. Rien n’a changé de ton côté.',
		'Un modèle de langage écrit un token à la fois. Pour chaque position, il calcule **une probabilité pour chaque token de son vocabulaire**, puis le programme en tire un au sort selon ces probabilités. Deux tirages peuvent tomber sur deux tokens différents.'
	],
	terms: [
		{ term: 'Logits', def: 'Les scores bruts que le modèle sort pour la position suivante, un nombre par token du vocabulaire. Plus il est haut, plus le token est probable.' },
		{ term: 'Softmax', def: 'La fonction qui transforme les logits en probabilités entre 0 et 1 dont la somme fait 1.' },
		{ term: 'Température', def: 'Le nombre par lequel on divise les logits avant le softmax. En dessous de 1, les probabilités se resserrent sur le meilleur token ; au-dessus de 1, elles s’aplatissent.' },
		{ term: 'Échantillonnage', def: 'Le choix du token suivant au hasard, où chaque token a une chance égale à sa probabilité.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['ids["Contexte : les ids de tokens déjà là, coupés à block_size 1024"] --> fwd["Passe avant dans le modèle"]'],
				highlight: ['ids', 'fwd'],
				note: 'nanoGPT donne au modèle les tokens déjà écrits. S’il y en a plus que `block_size` (1024 par défaut), il ne garde que les 1024 derniers. Le modèle ne peut se servir que de cette fenêtre.'
			},
			{
				add: ['fwd --> logits["Logits : 50304 scores pour le token suivant"]'],
				highlight: ['logits'],
				note: 'Le modèle renvoie un score par entrée du vocabulaire, pour la dernière position. Le vocabulaire par défaut de nanoGPT compte 50304 entrées : les 50257 tokens de GPT-2, complétés jusqu’à un multiple de 64.'
			},
			{
				add: ['logits -->|"divise par la température, garde top_k"| probs["Softmax : des probabilités qui font 1 au total"]'],
				highlight: ['probs'],
				note: 'Prends trois tokens de logits 2.0, 1.0 et 0.1. À température 1, le softmax donne 0.659, 0.242 et 0.099. À température 0.5, le premier monte à 0.864. Avec `top_k=2`, le troisième disparaît et les deux autres reçoivent 0.731 et 0.269.'
			},
			{
				add: ['probs -->|"torch.multinomial"| pick["Un token tiré au hasard"]', 'pick -->|"ajoute, recommence"| ids'],
				highlight: ['pick'],
				note: 'Le programme tire un token selon les probabilités et l’ajoute au contexte. La boucle repart avec un token de plus. Une réponse de 300 tokens, ce sont 300 tours de cette boucle.'
			},
			{
				add: ['pick --> stop["Arrêt : max_new_tokens dans nanoGPT ; end_turn ou max_tokens dans l’API"]'],
				highlight: ['stop'],
				note: 'nanoGPT s’arrête après `max_new_tokens`. L’API Messages indique la raison de l’arrêt dans `stop_reason` : `"end_turn"` quand le modèle a atteint "a natural stopping point" (un point d’arrêt naturel), `"max_tokens"` quand il a touché ta limite.'
			}
		]
	},
	example: {
		title: 'model.py : GPT.generate, la boucle du token suivant',
		repo: 'karpathy/nanoGPT',
		url: `${NANOGPT}/model.py#L306-L330`,
		lang: 'python',
		code: `    def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):
        """
        Take a conditioning sequence of indices idx (LongTensor of shape (b,t)) and complete
        the sequence max_new_tokens times, feeding the predictions back into the model each time.
        Most likely you'll want to make sure to be in model.eval() mode of operation for this.
        """
        for _ in range(max_new_tokens):
            # if the sequence context is growing too long we must crop it at block_size
            idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]
            # forward the model to get the logits for the index in the sequence
            logits, _ = self(idx_cond)
            # pluck the logits at the final step and scale by desired temperature
            logits = logits[:, -1, :] / temperature
            # optionally crop the logits to only the top k options
            if top_k is not None:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = -float('Inf')
            # apply softmax to convert logits to (normalized) probabilities
            probs = F.softmax(logits, dim=-1)
            # sample from the distribution
            idx_next = torch.multinomial(probs, num_samples=1)
            # append sampled index to the running sequence and continue
            idx = torch.cat((idx, idx_next), dim=1)

        return idx`,
		notes: [
			'Ligne 318, `logits[:, -1, :] / temperature` ne garde que les scores de la dernière position et les divise. Diviser par 0.5 double les écarts entre scores, et le softmax donne alors plus de poids au meilleur token.',
			'Les lignes 320 à 322 mettent à moins l’infini tous les logits sous le k-ième meilleur. Après le softmax, ces tokens ont une probabilité de 0 et ne peuvent plus sortir.',
			'Ligne 326, `torch.multinomial(probs, num_samples=1)` fait le tirage. [`sample.py`](' + NANOGPT + '/sample.py#L17-L19) l’appelle avec `temperature = 0.8`, `top_k = 200` et `seed = 1337`, qu’il passe à `torch.manual_seed` pour que les tirages partent du même état à chaque exécution.',
			'Ligne 328, le nouveau token s’ajoute à `idx`. Le tour suivant le lit comme une partie du contexte : chaque token dépend ainsi de ceux d’avant.'
		]
	},
	tradeoff: {
		gain: [
			'Une seule boucle produit un texte de n’importe quelle longueur : chaque tour ajoute un token, jusqu’à `max_new_tokens` ou au `max_tokens` de l’API.',
			'Le tirage varie les réponses : demander deux fois des noms ou des entrées de test te donne des candidats différents.'
		],
		cost: [
			'Le même prompt peut donner deux sorties différentes. La référence de l’API Messages précise : "even with `temperature` of `0.0`, the results will not be fully deterministic." (même à 0, les résultats ne sont pas entièrement déterministes).',
			'Le modèle s’engage sur chaque token au fur et à mesure. Un mauvais token en position 5 reste dans le contexte de tous les tours suivants.',
			'Sur les modèles sortis après Claude Opus 4.6, l’API refuse avec une erreur 400 toute `temperature` autre que 1.0, tout `top_p` sous 0.99 et n’importe quel `top_k`.'
		]
	},
	task: {
		prompt: 'Trois tokens candidats ont pour logits 2.0 (" Paris"), 1.0 (" Lyon") et 0.1 (" the"). Calcule leurs probabilités à température 1 puis à température 2. Dis ensuite lesquels `generate(..., top_k=1)` peut renvoyer, et pourquoi ce réglage donne toujours la même chose.',
		hint: 'Softmax : divise chaque logit par la température, prends l’`exp` de chacun, puis divise chacun par leur somme.',
		answer: [
			'Température 1 : les exp valent 7.39, 2.72 et 1.11, somme 11.21, soit 0.659, 0.242 et 0.099.',
			'Température 2 : les logits passent à 1.0, 0.5 et 0.05, et le softmax donne 0.502, 0.304 et 0.194. " the" passe d’environ 1 tirage sur 10 à environ 1 sur 5.',
			'Avec `top_k=1`, tous les logits sous le meilleur passent à moins l’infini. " Paris" a une probabilité de 1, donc `torch.multinomial` le renvoie à chaque fois.',
			'Avec `top_k=1`, la boucle prend le meilleur token à chaque tour, et le tirage n’a plus rien d’aléatoire. Sur les modèles Claude sortis après Opus 4.6, tu ne peux pas le demander : l’API refuse tout `top_k`.'
		]
	},
	quiz: [
		{
			q: 'Dans le `generate` de nanoGPT, que fait la division des logits par `temperature = 0.5` ?',
			options: [
				'Elle divise par deux le nombre de tokens parmi lesquels le modèle choisit',
				'Elle rend les tokens les plus probables encore plus probables après le softmax',
				'Elle divise par deux le nombre de nouveaux tokens générés par la boucle',
				'Elle rend tous les tokens aussi probables les uns que les autres'
			],
			answer: 1,
			why: 'Diviser par 0.5 double chaque logit, donc double les écarts. Le softmax est exponentiel en les logits : la part du meilleur token grimpe, de 0.659 à 0.864 dans l’exemple du chapitre.'
		},
		{
			q: 'Tu appelles un modèle Claude sorti après Opus 4.6 avec `temperature: 0`. Que se passe-t-il ?',
			options: [
				'Le modèle répond en prenant toujours le meilleur token',
				'L’API rejette la requête avec une erreur 400',
				'La valeur est ignorée et 1.0 est utilisé sans rien dire',
				'Le modèle produit une sortie entièrement déterministe'
			],
			answer: 1,
			why: 'La référence de l’API Messages marque `temperature` comme dépréciée : pour les modèles sortis après Claude Opus 4.6, "A value of 1.0 will be accepted for backwards compatibility, all other values will be rejected with a 400 error."'
		},
		{
			q: 'Pourquoi une réponse partie sur un mauvais token peut-elle continuer dans la mauvaise direction ?',
			options: [
				'Chaque token tiré s’ajoute au contexte que lit le tour suivant',
				'Le modèle relit toute la réponse à la fin et garde la pire version',
				'La température monte à mesure que la réponse s’allonge',
				'Top-k retire les bons tokens après la première erreur'
			],
			answer: 0,
			why: '`idx = torch.cat((idx, idx_next), dim=1)` ajoute le token tiré à l’entrée. Toutes les prédictions suivantes partent d’un contexte qui le contient.'
		}
	],
	recall: {
		q: 'Que sort le modèle à chaque tour, et quelle ligne de nanoGPT choisit le token suivant ?',
		a: 'Un score (logit) pour chaque token du vocabulaire, 50304 dans nanoGPT. Le softmax en fait des probabilités, et `torch.multinomial(probs, num_samples=1)` en tire un.'
	},
	sources: [
		{ title: 'karpathy/nanoGPT, model.py', url: `${NANOGPT}/model.py` },
		{ title: 'karpathy/nanoGPT, sample.py', url: `${NANOGPT}/sample.py` },
		{ title: 'Référence de l’API Claude, Create a Message (temperature, top_k, top_p, stop_reason), lue le 2026-10-17', url: 'https://platform.claude.com/docs/en/api/messages/create' }
	]
};
