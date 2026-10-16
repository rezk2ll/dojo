const MINBPE = 'https://github.com/karpathy/minbpe/blob/1acefe89412b20245db5a22d2a02001e547dc602';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'tokens',
	part: 'Comment marchent les modèles',
	title: 'Les tokens',
	minutes: 10,
	hook: [
		'Tu demandes à un modèle de chat combien de r il y a dans « strawberry ». Il répond 2. Une minute plus tard, le même modèle t’écrit une migration SQL qui marche.',
		'Le modèle n’a jamais vu les dix lettres. Le tokenizer de GPT-4 (`cl100k_base` dans tiktoken) transforme " strawberry" en **un seul entier, 73700**. Pour compter les lettres de ce nombre, le modèle doit se souvenir d’une orthographe qu’on ne lui a jamais montrée directement.'
	],
	terms: [
		{ term: 'Token', def: 'Une unité de texte que le modèle lit ou écrit, stockée sous forme d’identifiant entier. Un token peut être un octet, quelques lettres ou un mot entier avec son espace devant.' },
		{ term: 'Tokenizer', def: 'Le programme qui transforme le texte en liste d’identifiants de tokens avant que le modèle le voie, et qui refait du texte à partir des identifiants après.' },
		{ term: 'BPE', def: 'Byte pair encoding : on part des 256 valeurs d’octet, puis on donne à chaque tour un nouvel identifiant à la paire de voisins la plus fréquente.' },
		{ term: 'Vocabulaire', def: 'La table complète des identifiants que connaît un tokenizer. Dans minbpe, sa taille vaut 256 plus le nombre de fusions.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['text["Texte d’entraînement : aaabdaaabac"] --> bytes["Octets UTF-8 : 97 97 97 98 100 97 97 97 98 97 99"]'],
				highlight: ['text', 'bytes'],
				note: 'Le tokenizer part des octets bruts. Ici chacun des 11 caractères tient sur un octet, donc le texte fait 11 identifiants entre 0 et 255. Les identifiants 0 à 255 sont toujours dans le vocabulaire : n’importe quel texte peut donc être encodé.'
			},
			{
				add: ['bytes --> m1["Fusion 1 : la paire 97 97 vue 4 fois, nouvel id 256 = aa"]'],
				highlight: ['m1'],
				note: 'L’entraînement compte chaque paire d’identifiants voisins et prend la plus fréquente. La paire (97, 97), « aa », apparaît 4 fois. Elle reçoit l’identifiant 256, et chaque « aa » de la liste est remplacé : on passe de 11 identifiants à 9.'
			},
			{
				add: ['m1 --> m2["Fusion 2 : 256 97 = aaa, id 257"]', 'm2 --> m3["Fusion 3 : 257 98 = aaab, id 258"]'],
				highlight: ['m2', 'm3'],
				note: 'La même étape tourne sur la nouvelle liste. La fusion 2 colle « aa » et « a » en 257, la fusion 3 colle « aaa » et « b » en 258. On a demandé un vocabulaire de 259, donc l’entraînement s’arrête après 3 fusions.'
			},
			{
				add: ['m3 --> enc["encode aaabdaaabac : 258 100 258 97 99"]'],
				highlight: ['enc'],
				note: 'L’encodage rejoue les fusions dans l’ordre où elles ont été apprises. Le texte d’entraînement tient maintenant en 5 identifiants au lieu de 11. Un texte sans paire apprise reste en octets : `encode("abac")` renvoie 4 identifiants, `[97, 98, 97, 99]`.'
			},
			{
				add: ['enc --> model["Le modèle ne lit que des identifiants, jamais des lettres"]'],
				highlight: ['model'],
				note: 'Les vrais tokenizers font pareil avec environ 100 000 fusions apprises sur un gros corpus. Dans `cl100k_base`, " strawberry" avec son espace devant est l’identifiant 73700. En début de ligne, "strawberry" fait 3 identifiants : "str", "aw", "berry".'
			}
		]
	},
	example: {
		title: 'minbpe/basic.py : entraîner et utiliser un tokenizer BPE au niveau des octets',
		repo: 'karpathy/minbpe',
		url: `${MINBPE}/minbpe/basic.py#L20-L74`,
		lang: 'python',
		code: `    def train(self, text, vocab_size, verbose=False):
        assert vocab_size >= 256
        num_merges = vocab_size - 256

        # input text preprocessing
        text_bytes = text.encode("utf-8") # raw bytes
        ids = list(text_bytes) # list of integers in range 0..255

        # iteratively merge the most common pairs to create new tokens
        merges = {} # (int, int) -> int
        vocab = {idx: bytes([idx]) for idx in range(256)} # int -> bytes
        for i in range(num_merges):
            # count up the number of times every consecutive pair appears
            stats = get_stats(ids)
            # find the pair with the highest count
            pair = max(stats, key=stats.get)
            # mint a new token: assign it the next available id
            idx = 256 + i
            # replace all occurrences of pair in ids with idx
            ids = merge(ids, pair, idx)
            # save the merge
            merges[pair] = idx
            vocab[idx] = vocab[pair[0]] + vocab[pair[1]]
…
    def encode(self, text):
        # given a string text, return the token ids
        text_bytes = text.encode("utf-8") # raw bytes
        ids = list(text_bytes) # list of integers in range 0..255
        while len(ids) >= 2:
            # find the pair with the lowest merge index
            stats = get_stats(ids)
            pair = min(stats, key=lambda p: self.merges.get(p, float("inf")))
            # subtle: if there are no more merges available, the key will
            # result in an inf for every single pair, and the min will be
            # just the first pair in the list, arbitrarily
            # we can detect this terminating case by a membership check
            if pair not in self.merges:
                break # nothing else can be merged anymore
            # otherwise let's merge the best pair (lowest merge index)
            idx = self.merges[pair]
            ids = merge(ids, pair, idx)
        return ids`,
		notes: [
			'`num_merges = vocab_size - 256` fixe la taille du vocabulaire. Avec `train(text, 259)`, il y a exactement 3 fusions, les 3 cases du diagramme.',
			'`pair = max(stats, key=stats.get)` choisit la paire voisine la plus fréquente, et la ligne suivante lui donne l’identifiant `256 + i`. [`get_stats`](' + MINBPE + '/minbpe/base.py#L13-L22) compte les paires avec `zip(ids, ids[1:])`.',
			'Dans `encode`, `min(... self.merges.get(p, float("inf")))` choisit la paire apprise en premier. Les fusions passent dans l’ordre de l’entraînement, donc « aa » (256) est toujours construit avant « aaa » (257).',
			'`if pair not in self.merges: break` arrête la boucle quand il ne reste aucune paire apprise. Sur "aaaab", tu obtiens `[256, 256, 98]` : deux tokens « aa » et un « b », car aucune fusion ne colle deux 256.'
		]
	},
	tradeoff: {
		gain: [
			'Tout texte s’encode : les 256 identifiants d’octet couvrent n’importe quelle chaîne UTF-8, emoji et code compris.',
			'Le texte courant prend peu de tokens : dans `cl100k_base`, les 44 caractères de "The quick brown fox jumps over the lazy dog." font 10 tokens.'
		],
		cost: [
			'Le modèle reçoit des identifiants, sans les lettres : pour compter, inverser ou épeler, il s’appuie sur ce qu’il a retenu de chaque token.',
			'Un texte éloigné du corpus d’entraînement coûte plus cher : la version française de la phrase du renard fait 58 caractères et 18 tokens dans `cl100k_base`.',
			'Un autre tokenizer donne un autre compte pour le même texte. D’après la doc d’Anthropic, Claude 4.7 et les modèles suivants produisent "approximately 30 percent more tokens" (environ 30 % de tokens en plus) pour le même texte que les modèles d’avant.'
		]
	},
	task: {
		prompt: 'Clone `karpathy/minbpe` et lance `BasicTokenizer().train("aaabdaaabac", 259)`. Avant de les exécuter, prédis le résultat de `encode("aaab")`, `encode("aaaab")` et `encode("abac")`. Lance-les ensuite et explique chaque résultat.',
		hint: 'Les fusions apprises sont, dans l’ordre : (97, 97) vers 256, (256, 97) vers 257, (257, 98) vers 258. L’encodage les applique dans cet ordre, sans chevauchement.',
		answer: [
			'`encode("aaab")` renvoie `[258]` : 97 97 97 98, puis 256 97 98, puis 257 98, puis 258. Un seul token pour 4 caractères.',
			'`encode("aaaab")` renvoie `[256, 256, 98]`. La première fusion change les quatre 97 en deux 256. Aucune fusion n’a été apprise pour (256, 256) ni pour (256, 98), donc l’encodage s’arrête à 3 tokens.',
			'`encode("abac")` renvoie `[97, 98, 97, 99]`. Ce texte se trouve dans la chaîne d’entraînement, mais aucune fusion ne couvre « ab » ou « ac » : chaque octet reste un token.',
			'Un « a » de plus a fait passer 1 token à 3. Les vrais tokenizers montrent le même effet : dans `cl100k_base`, "strawberry" fait 3 tokens en début de ligne et 1 seul après une espace.'
		]
	},
	quiz: [
		{
			q: 'Dans `cl100k_base`, " strawberry" est le token unique 73700. Pourquoi un modèle se trompe-t-il souvent sur le nombre de r ?',
			options: [
				'Le tokenizer supprime les lettres répétées avant que le texte arrive au modèle',
				'Le modèle reçoit un identifiant et doit se rappeler l’orthographe derrière',
				'Le modèle voit les lettres mais ne compte chaque lettre distincte qu’une fois',
				'Le modèle lit le texte à l’envers, donc les lettres doubles fusionnent'
			],
			answer: 1,
			why: 'Le modèle ne reçoit que des identifiants entiers. Les lettres d’un token ne sont pas dans son entrée : ce qu’il sait de l’orthographe vient des textes d’entraînement où le mot était épelé.'
		},
		{
			q: 'On entraîne un tokenizer minbpe avec `vocab_size=259`. Combien de fusions apprend-il ?',
			options: ['259', '3', '256', 'Autant que le texte en demande'],
			answer: 1,
			why: '`num_merges = vocab_size - 256`. Les 256 valeurs d’octet sont toujours dans le vocabulaire, et chaque fusion ajoute un identifiant par-dessus.'
		},
		{
			q: 'Tu passes un prompt d’un ancien modèle Claude à Claude 4.7. Que te dit la doc d’Anthropic sur le comptage des tokens ?',
			options: [
				'Garder les anciens comptes, le même texte coûtant les mêmes tokens',
				'Recompter le prompt avec le modèle que tu vas utiliser',
				'Diviser l’ancien compte par 1,3 pour avoir le nouveau',
				'Compter les caractères, les tokens ne servant plus'
			],
			answer: 1,
			why: 'Claude 4.7 et les suivants utilisent un nouveau tokenizer qui produit environ 30 % de tokens en plus pour le même texte, selon le contenu. La doc demande de recompter avec le modèle visé au lieu de reprendre les anciens comptes.'
		}
	],
	recall: {
		q: 'Que fait l’entraînement BPE à chaque tour, et avec combien d’identifiants minbpe démarre-t-il ?',
		a: 'Il démarre avec 256 identifiants, un par octet. À chaque tour, il cherche la paire d’identifiants voisins la plus fréquente et lui donne le prochain identifiant (256, 257, ...).'
	},
	sources: [
		{ title: 'karpathy/minbpe, README', url: `${MINBPE}/README.md` },
		{ title: 'karpathy/minbpe, minbpe/basic.py', url: `${MINBPE}/minbpe/basic.py` },
		{ title: 'openai/tiktoken, README (sorties ci-dessus avec tiktoken 0.14.0, cl100k_base)', url: 'https://github.com/openai/tiktoken/blob/4e71bbe0c078468e00fefbf94b39849389f346e5/README.md' },
		{ title: 'Doc Claude, Token counting, lue le 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/token-counting' }
	]
};
