/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'file-sync',
	part: 'Les données',
	title: 'Synchroniser des fichiers',
	minutes: 10,
	hook: [
		'Marc est photographe de mariage. Il garde un dossier sur son portable et le même sur son téléphone : notes clients, contrats, et clips vidéo jusqu’à 2 Go.',
		'Dans le train, sans réseau, il modifie `notes.md` sur le téléphone. Le soir, chez lui, il modifie le même fichier sur le portable avant que le téléphone ait synchronisé.',
		'Quand les deux appareils reviennent en ligne, il ne veut perdre aucune des deux modifications. Et quand il coupe la fin d’un clip, il ne veut pas renvoyer 2 Go en 4G.'
	],
	terms: [
		{ term: 'Bloc', def: 'Une tranche de taille fixe d’un fichier, nommée par le hash de ses octets : deux appareils comparent ainsi un fichier bloc par bloc.' },
		{ term: 'Vecteur de versions', def: 'Un compteur par appareil sur chaque fichier. Un appareil ajoute 1 à son propre compteur à chaque modification du fichier.' },
		{ term: 'Copie de conflit', def: 'La deuxième version d’un fichier, gardée sous un autre nom quand deux modifications ne peuvent pas être ordonnées.' }
	],
	kata: {
		brief: [
			'Un dossier synchronisé entre un portable et un téléphone : 30 Go en 8 000 fichiers. La plupart font moins de 5 Mo ; les clips vidéo vont jusqu’à 2 Go.',
			'Chaque appareil peut modifier, créer ou supprimer des fichiers hors ligne, pendant des jours. Les deux appareils sont rarement en ligne en même temps.',
			'Le téléphone est souvent en données mobiles à 10 Mbit/s. Envoyer un fichier entier de 2 Go à ce débit prend environ 27 minutes.',
			'Chaque modification faite sur un appareil arrive sur l’autre, comme le fichier lui-même ou comme une deuxième copie. Une synchronisation coupée en route reprend là où elle s’est arrêtée.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit combien de données partent quand les 3 derniers Mo d’un fichier de 2 Go changent.',
			'Ton design dit comment reprend l’envoi d’un fichier de 2 Go arrêté à 60 %.',
			'Ton design dit comment un appareil distingue « l’autre côté a une version plus récente » de « les deux côtés ont modifié ».',
			'Ton design dit ce que voit l’utilisateur après un conflit, et où chaque version est gardée.',
			'Ton design dit ce qui se passe quand un appareil supprime un fichier que l’autre a modifié hors ligne.',
			'Ton design dit ce que chaque appareil garde pour savoir ce qui a changé depuis la dernière synchronisation.'
		],
		sample: [
			'Chaque appareil fait tourner un client de synchronisation. Un petit serveur garde les blocs et l’index du dossier : le portable et le téléphone n’ont jamais besoin d’être en ligne ensemble. Les fichiers sont découpés en blocs, chacun nommé par son hash SHA-256. Le protocole de Syncthing fait pareil, avec des blocs "from 128 KiB (131072 bytes) to 16 MiB in size".',
			'La taille de bloc suit la règle de Syncthing : "the smallest block size that results in fewer than 2000 blocks" (la plus petite taille qui donne moins de 2000 blocs). Un fichier de 2 Go fait 1,86 Gio : il a des blocs de 1 Mio, environ 1 900. Sa liste de blocs compte 1 900 hash de 32 octets, environ 61 Ko.',
			'Chaque appareil garde un index : pour chaque fichier, son nom, sa taille, sa date de modification, son vecteur de versions et sa liste de blocs. Quand la taille ou la date d’un fichier change, le client le hache de nouveau et compare la nouvelle liste à celle de l’index. Il demande au serveur quels hash lui manquent et n’envoie que ceux-là.',
			'Couper les 3 derniers Mo d’un clip change 3 ou 4 blocs, environ 4 Mo, soit 3 secondes à 10 Mbit/s. Un envoi arrêté à 60 % reprend de la même façon : le serveur a déjà environ 1 140 des 1 900 blocs.',
			'Pour ordonner les modifications, le portable passe de `{laptop: 4, phone: 2}` à `{laptop: 5, phone: 2}` quand il enregistre. Une version reçue remplace la version locale seulement si chacun de ses compteurs est supérieur ou égal au compteur local. Avec `{laptop: 5, phone: 2}` d’un côté et `{laptop: 4, phone: 3}` de l’autre, aucune ne remplace l’autre : c’est un conflit.',
			'En cas de conflit, les deux versions restent. L’une est renommée selon le motif de Syncthing, `<filename>.sync-conflict-<date>-<time>-<modifiedBy>.<ext>`. Chez Syncthing, "The file with the older modification time" (le fichier modifié le plus tôt) prend le nouveau nom. Marc voit `notes.md` et `notes.sync-conflict-20261017-183000-PHONE.md` côte à côte et les fusionne à la main.',
			'Une modification l’emporte sur une suppression : si le téléphone a supprimé `contract.pdf` pendant que le portable le modifiait, le fichier revient sur le téléphone. La doc de Syncthing décrit une autre règle : quand la suppression gagne, le fichier modifié est renommé en copie de conflit.',
			'Les blocs de taille fixe ont un prix. Insérer un octet au début d’un fichier de 2 Go décale tous les blocs : les 1 900 blocs changent de hash et tout le fichier repart. Les conflits demandent aussi Marc : le design ne fusionne jamais du texte tout seul.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse proposée, comment un appareil décide-t-il que deux modifications du même fichier sont en conflit ?',
		a: 'Il compare les vecteurs de versions. Quand chaque côté a un compteur plus grand que l’autre, comme `{laptop: 5, phone: 2}` contre `{laptop: 4, phone: 3}`, aucune version ne remplace l’autre et une copie est renommée `.sync-conflict-`.'
	},
	sources: [
		{ title: 'Syncthing, Block Exchange Protocol v1 (blocs et vecteurs de versions)', url: 'https://github.com/syncthing/docs/blob/25904513a60a95e0f9a61e52d3abc0a77ab7fea9/specs/bep-v1.rst#L18-L21' },
		{ title: 'Syncthing, Block Exchange Protocol v1, choix de la taille de bloc', url: 'https://github.com/syncthing/docs/blob/25904513a60a95e0f9a61e52d3abc0a77ab7fea9/specs/bep-v1.rst#L825-L845' },
		{ title: 'Doc Syncthing, Conflicting Changes', url: 'https://github.com/syncthing/docs/blob/25904513a60a95e0f9a61e52d3abc0a77ab7fea9/users/syncing.rst#L84-L95' }
	]
};
