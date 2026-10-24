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
		],
		steps: [
			{
				title: 'Retrouve les fusions apprises',
				questions: [
					{ q: 'Combien de fusions `train("aaabdaaabac", 259)` apprend-il ?', options: ['3', '259', '256', '11'], answer: 0, why: '`num_merges = vocab_size - 256` : 259 donne 3 fusions par-dessus les 256 identifiants d’octet.' },
					{ q: 'Quelle paire devient l’identifiant 256 ?', options: ['(97, 98), « ab »', '(97, 97), « aa »', '(98, 100), « bd »', '(97, 99), « ac »'], answer: 1, why: '« aa » apparaît 4 fois dans le texte d’entraînement, plus que toute autre paire : il reçoit le premier nouvel identifiant.' },
					{ q: 'Que construit la fusion 2 ?', options: ['257 = (256, 97), « aaa »', '257 = (100, 256), « daa »', '257 = (256, 256), « aaaa »', '257 = (256, 98), « aab »'], answer: 0, why: 'L’entraînement recompte les paires sur la nouvelle liste, 256 97 98 100 256 97 98 97 99. « aa » suivi de « a » apparaît deux fois et devient 257, comme dans le diagramme.' },
					{ q: 'Que construit la fusion 3 ?', options: ['258 = (98, 100), « bd »', '258 = (97, 99), « ac »', '258 = (257, 98), « aaab »', '258 = (256, 97), « aaa »'], answer: 2, why: '« aaa » suivi de « b » vient ensuite. Puis l’entraînement s’arrête : on a demandé 3 fusions.' }
				]
			},
			{
				title: 'Prédis `encode("aaab")`',
				questions: [
					{ q: 'De quelle liste d’identifiants part `encode("aaab")` ?', options: ['[256, 97, 98]', '[97, 97, 97, 98]', '[258]', '[97, 98]'], answer: 1, why: 'L’encodage part des octets UTF-8 bruts, comme l’entraînement. Chacun des 4 caractères fait un octet.' },
					{ q: 'Dans quel ordre `encode` applique-t-il les fusions ?', options: ['La paire la plus fréquente de l’entrée d’abord', 'Première apprise, première appliquée : 256, puis 257, puis 258', 'Le token le plus long d’abord : 258, puis 257, puis 256', 'De gauche à droite, la première paire venue'], answer: 1, why: '`min(... self.merges.get(p, float("inf")))` prend la paire au plus petit numéro de fusion : les fusions rejouent l’ordre de l’entraînement.' },
					{ q: 'Que vaut la liste après la fusion 1 ?', options: ['[256, 97, 98]', '[97, 256, 98]', '[257, 98]', '[256, 256]'], answer: 0, why: 'Les deux premiers 97 deviennent 256. Le troisième « a » et le « b » restent des octets pour l’instant.' },
					{ q: 'Que renvoie `encode("aaab")` ?', options: ['[257, 98]', '[256, 97, 98]', '[258]', '[97, 97, 97, 98]'], answer: 2, why: '256 97 98 devient 257 98, puis 258. Un seul token pour 4 caractères.' }
				]
			},
			{
				title: 'Prédis `encode("aaaab")`',
				questions: [
					{ q: 'Que fait la fusion 1 sur `[97, 97, 97, 97, 98]` ?', options: ['[256, 97, 97, 98]', '[256, 256, 98]', '[257, 97, 98]', '[97, 97, 256, 98]'], answer: 1, why: 'Chaque « aa » de la liste est remplacé, sans chevauchement. Quatre 97 deviennent deux 256.' },
					{ q: 'Pourquoi la fusion 2 ne peut-elle pas s’appliquer ensuite ?', options: ['Elle demande (256, 97), et aucun 97 ne suit plus un 256', 'Elle ne tourne qu’à l’entraînement, jamais dans `encode`', 'Elle demande un texte qui commence par « b »', 'L’encodage s’arrête toujours après la première fusion'], answer: 0, why: 'La fusion 2 joint un 256 et un 97. La fusion 1 a déjà pris les deux 97.' },
					{ q: 'Que renvoie `encode("aaaab")` ?', options: ['[97, 258]', '[256, 256, 98]', '[257, 97, 98]', '[256, 258]'], answer: 1, why: 'Aucune fusion n’a été apprise pour (256, 256) ni pour (256, 98) : l’encodage s’arrête à 3 tokens.' },
					{ q: 'Qu’est-ce qui arrête `encode` ?', options: ['La liste fait moins de 4 identifiants', 'Chaque fusion a été essayée une fois', 'La liste ne contient que des identifiants au-dessus de 255', 'Aucune paire de la liste ne correspond à une fusion apprise'], answer: 3, why: '`if pair not in self.merges: break` termine la boucle quand il ne reste aucune paire apprise.' }
				]
			},
			{
				title: 'Explique les résultats',
				questions: [
					{ q: 'Que renvoie `encode("abac")` ?', options: ['[257, 99]', '[256, 97, 99]', '[97, 98, 97, 99]', '[258]'], answer: 2, why: 'Chaque octet reste un token : aucune des paires apprises n’apparaît dans « abac ».' },
					{ q: '« abac » se trouve dans le texte d’entraînement. Pourquoi ses octets ne fusionnent-ils pas ?', options: ['Aucune fusion apprise ne couvre « ab » ou « ac »', 'Le tokenizer ne fusionne qu’en début de chaîne', 'L’encodage saute le texte déjà vu à l’entraînement', 'Seules les paires d’une même lettre peuvent fusionner'], answer: 0, why: 'Seules 3 fusions ont été apprises, et aucune n’est « ab » ou « ac ». Avoir vu le texte à l’entraînement ne suffit pas.' },
					{ q: 'Un « a » de plus a fait passer « aaab » de 1 token à 3. Qu’est-ce que ça montre ?', options: ['Un texte plus long prend toujours moins de tokens', 'Les lettres répétées forment toujours un seul token', 'Le tokenizer compte des caractères, pas des paires', 'Un petit changement du texte peut beaucoup changer les tokens'], answer: 3, why: 'Les tokens suivent les fusions apprises, pas les lettres. Un caractère peut casser une chaîne de fusions.' },
					{ q: 'Comment `cl100k_base` découpe-t-il "strawberry" ?', options: ['1 token partout où il apparaît', '10 tokens, un par lettre', '3 tokens après une espace, 1 en début de ligne', '1 token après une espace, 3 en début de ligne'], answer: 3, why: '" strawberry" avec son espace devant est l’identifiant 73700. En début de ligne, il fait "str", "aw", "berry".' }
				]
			}
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
