const NPM = 'https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident';
const ISSUE = 'https://github.com/dominictarr/event-stream/issues/116';
const NODEMON = 'https://github.com/remy/nodemon/issues/1442';
const COPAY = 'https://github.com/bitpay/wallet/issues/9346';
const ES = 'https://github.com/dominictarr/event-stream/commit';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'event-stream-2018',
	part: 'Sécurité',
	title: 'npm event-stream 2018 : le nouveau mainteneur et la charge cachée',
	minutes: 10,
	hook: [
		'Mardi 20 novembre 2018. Tu maintiens une appli Node.js et tu la lances en développement avec nodemon. Depuis le 29 octobre, plusieurs utilisateurs signalent la même chose dans une issue du dépôt nodemon.',
		'Sous Node.js 11, nodemon affiche au démarrage `[DEP0106] DeprecationWarning: crypto.createDecipher is deprecated.` Le même script lancé avec `node` n’affiche rien. Ton terminal montre cet avertissement, lui aussi.',
		'À 19 h 00 UTC, un utilisateur nommé FallingSnow publie la pile d’appels. L’appel part de `node_modules/flatmap-stream/index.min.js`, chargé par la ligne 11 de `node_modules/event-stream/index.js`.'
	],
	terms: [
		{ term: 'Dépendance transitive', def: 'Un paquet que ton projet installe parce qu’une de tes dépendances en a besoin. Tu ne l’as jamais écrit dans ton propre `package.json`.' },
		{ term: 'Plage caret', def: 'Une règle de version comme `^0.1.0` dans `package.json`. npm installe la version la plus récente qui la respecte, donc chaque installation neuve reçoit le dernier correctif publié.' },
		{ term: 'Mainteneur', def: 'Un compte npm qui a le droit de publier de nouvelles versions d’un paquet.' },
		{ term: 'Charge', def: 'La partie du code malveillant qui fait le mal. Ici elle est chiffrée, pour qu’un lecteur ne voie pas ce qu’elle fait.' }
	],
	incident: {
		org: 'npm',
		title: 'Details about the event-stream incident',
		date: '2018-11-20',
		url: NPM,
		steps: [
			{
				situation: [
					'Tu as la pile d’appels. Une bibliothèque de flux, flatmap-stream, appelle `crypto.createDecipher`, une fonction Node.js qui déchiffre des données.',
					'Le fichier de la pile est `index.min.js`, un fichier minifié. Le paquet contient aussi un fichier source lisible.'
				],
				q: 'Que vérifies-tu en premier ?',
				options: [
					'Lancer l’appli avec `--no-deprecation` pour faire taire l’avertissement',
					'Mettre Node.js à jour, puisque l’avertissement arrive avec Node.js 11',
					'Comparer le fichier minifié avec la source lisible du paquet',
					'Demander au mainteneur de nodemon d’arrêter `crypto.createDecipher`'
				],
				answer: 2,
				why: 'FallingSnow a « followed the stack traces until I ran into some very strange code that looked like an obfuscated payload ». Ce code était « not found in the unminified source of flatmap-stream@0.1.1 but found in the minified source ». Masquer l’avertissement aurait masqué le seul signe de l’attaque.'
			},
			{
				situation: [
					'Le fichier minifié lit un bloc chiffré en AES dans `./test/data`, un fichier qui ressemble à une donnée de test. Personne n’arrive encore à le déchiffrer.',
					'L’historique d’event-stream montre qu’un nouveau mainteneur, right9ctrl, a fait un premier commit le 4 septembre 2018. Le 9 septembre, il a ajouté `flatmap-stream` avec la plage `^0.1.0` et publié event-stream 3.3.6. Ton appli demande `event-stream` `^3.3.4`.'
				],
				q: 'Tu ne sais pas encore ce que fait la charge. Que fais-tu de ton appli ?',
				options: [
					'Supprimer `node_modules` et relancer `npm install` pour repartir à neuf',
					'Figer `event-stream` sur 3.3.4 exactement et reconstruire',
					'Attendre que quelqu’un déchiffre la charge avant de toucher à quoi que ce soit',
					'Demander à l’auteur d’origine de retirer le nouveau mainteneur'
				],
				answer: 1,
				why: 'L’issue demande aux développeurs de « update your event-stream dependency to `event-stream@3.3.4` », la dernière version de l’auteur d’origine (juillet 2016). Avec `^3.3.4`, un `npm install` neuf prend encore 3.3.6, et `^0.1.0` prend encore flatmap-stream 0.1.1. L’auteur d’origine a écrit le 22 novembre : « I no longer have publish rights to this module on npm. »'
			},
			{
				situation: [
					'Lundi 26 novembre, 18 h 24 UTC. Un utilisateur nommé maths22 déchiffre la première charge. La clé est le `npm_package_description` du projet qui installe le paquet, et celle qui marche est « A Secure Bitcoin Wallet ».',
					'Le code déchiffré ne tourne que si `process.argv[2]` correspond à `build:.*-release`. Il ajoute alors du code à `@zxing/library/.../ReedSolomonDecoder.js` dans `node_modules`, puis remet le fichier d’origine à la sortie du processus. Cette description est celle du portefeuille Bitcoin Copay et de son fork copay-dash.'
				],
				q: 'Tu connais la cible. Que fais-tu ensuite ?',
				options: [
					'Ouvrir une issue sur le dépôt de Copay avec la charge décodée',
					'Publier un fork propre de flatmap-stream sous un autre nom',
					'Continuer à écrire dans l’issue event-stream jusqu’à ce que Copay la voie',
					'Signaler le paquet à npm et laisser npm gérer la suite'
				],
				answer: 0,
				why: 'Douze minutes plus tard, à 18 h 36 UTC, l’issue 9346 « `event-stream` dependency attack steals wallets from users of copay » était ouverte sur le dépôt de Copay. npm pouvait retirer le paquet du registre, mais seul Copay pouvait dire quelles applis publiées contenaient le code. L’équipe sécurité de npm avait été prévenue le matin même.'
			},
			{
				situation: [
					'Tu es maintenant dans l’équipe Copay. La charge s’est exécutée quand un de tes scripts de build de release tournait, et elle a modifié le code avant qu’il soit empaqueté dans l’appli.',
					'Pendant le build, la charge a écrit dans un fichier de `node_modules`. À la sortie, elle a remis le fichier et ses dates avec `utimesSync`.'
				],
				q: 'Où regardes-tu pour savoir quelles versions sont touchées ?',
				options: [
					'Dans l’historique git du dépôt Copay',
					'Dans `package.json`, pour voir si Copay liste flatmap-stream',
					'Dans un build neuf fait aujourd’hui à partir du code actuel',
					'Dans les bundles de chaque version publiée de l’appli'
				],
				answer: 3,
				why: 'La charge laissait les sources intactes, donc seuls les bundles construits gardaient le code. La première réponse de Copay disait que le code « was not deployed in any platform ». Le même commentaire continue : « Further examination of the code was relieved we did release some platforms with the affected code. » Copay a confirmé les versions 5.0.2 à 5.1.0.'
			},
			{
				situation: [
					'La seconde charge regarde le solde de chaque portefeuille. Au-dessus de 100 Bitcoin ou de 1000 Bitcoin Cash, elle envoie les données du compte et les clés privées vers un serveur distant. La version 5.2.0, sans la dépendance, part vers les magasins d’applis.',
					'Tu ne sais pas encore si une clé a été volée.'
				],
				q: 'Que dis-tu aux utilisateurs de Copay ?',
				options: [
					'Mettez à jour vers 5.2.0, qui retire le code et protège les clés',
					'N’ouvrez pas 5.0.2 à 5.1.0, mettez à jour et videz vers un nouveau portefeuille',
					'Restaurez le portefeuille dans 5.2.0 avec sa phrase de douze mots',
					'Attendez la fin de l’enquête avant de faire quoi que ce soit'
				],
				answer: 1,
				why: 'Copay a écrit : « If you are using any version from 5.0.2 to 5.1.0, you should not run or open the Copay app. » Les utilisateurs devaient envoyer tous leurs fonds vers un nouveau portefeuille avec `Send Max`, « and not by restoring using the wallet\'s twelve word phrase ». Un portefeuille neuf garde les fonds sous des clés que la charge n’a jamais vues.'
			}
		],
		outcome: [
			'L’attaque a commencé par de l’ingénierie sociale. L’auteur d’origine d’event-stream a écrit : « he emailed me and said he wanted to maintain the module, so I gave it to him. » Le nouveau mainteneur a ajouté flatmap-stream en dépendance. Sa version 0.1.1 portait une charge dans le seul fichier minifié.',
			'La charge ne tournait que dans les builds de release de Copay, et elle modifiait l’appli empaquetée. Le code final récupérait les données du compte et les clés privées des portefeuilles au-dessus de 100 BTC ou 1000 BCH. Copay l’a livré dans les versions 5.0.2 à 5.1.0.',
			'L’équipe sécurité de npm a été prévenue le matin du 26 novembre. Elle a retiré flatmap-stream et event-stream 3.3.6 du registre, et a pris la propriété d’event-stream. Copay a publié 5.2.0 et a fait fermer les serveurs de collecte.',
			'Copay a listé ses correctifs : versionner ses dépendances dans le dépôt pour voir un diff à chaque mise à jour, figer `package-lock` pour chaque version majeure, limiter l’accès réseau de l’appli avec une Content Security Policy à partir de 5.3.0, et geler les classes critiques pour qu’aucun code ne les réécrive.'
		]
	},
	quiz: [
		{
			q: 'event-stream 3.3.6 est sorti le 9 septembre 2018 avec `"flatmap-stream": "^0.1.0"`. Comment les applis ont-elles reçu la 0.1.1 malveillante ?',
			options: [
				'npm met à jour chaque paquet installé toutes les nuits',
				'event-stream 3.3.6 figeait flatmap-stream sur 0.1.1 exactement',
				'Une installation neuve prend la version la plus récente qui respecte `^0.1.0`',
				'npm audit a remplacé 0.1.0 par 0.1.1 comme correctif de sécurité'
			],
			answer: 2,
			why: 'Une plage caret sur 0.1.x accepte tout correctif 0.1 plus récent. Chaque installation sans entrée dans un lockfile la résout à nouveau, donc la 0.1.1 arrivait dans chaque nouvelle installation d’event-stream 3.3.6.'
		},
		{
			q: 'Pourquoi la charge ne faisait-elle rien sur la machine d’un développeur ordinaire ?',
			options: [
				'Sa clé était le `npm_package_description` de Copay',
				'Elle comparait l’adresse IP de la machine à une liste',
				'Elle attendait 30 jours après l’installation',
				'Elle ne tournait que sous Node.js avant la 11'
			],
			answer: 0,
			why: 'npm remplit `npm_package_description` à partir du projet en cours de build. Seul « A Secure Bitcoin Wallet » déchiffrait la charge en code valide, et ce code testait ensuite `process.argv[2]` contre `build:.*-release`.'
		},
		{
			q: 'Quel correctif de Copay rend visible en revue de code une dépendance modifiée ?',
			options: [
				'Une Content Security Policy dans l’appli',
				'Geler les classes critiques contre la réécriture',
				'Faire fermer les serveurs de collecte',
				'Versionner les dépendances dans le dépôt'
			],
			answer: 3,
			why: 'Avec les fichiers des dépendances dans le dépôt, une mise à jour apparaît comme un diff que quelqu’un peut lire. Copay précise que ce sera « practical sometimes, be definitely not always » (pratique parfois, pas toujours).'
		}
	],
	recall: {
		q: 'Quel paquet portait la charge d’event-stream, et quelle appli visait-il ?',
		a: 'flatmap-stream 0.1.1, ajouté à event-stream 3.3.6 par un nouveau mainteneur. Il visait le portefeuille Copay, versions 5.0.2 à 5.1.0.'
	},
	sources: [
		{ title: 'Blog npm, Details about the event-stream incident', url: NPM },
		{ title: 'dominictarr/event-stream, issue 116, I don\'t know what to say.', url: ISSUE },
		{ title: 'remy/nodemon, issue 1442, Deprecation warning at start', url: NODEMON },
		{ title: 'bitpay/wallet, issue 9346, event-stream dependency attack steals wallets from users of copay', url: COPAY },
		{ title: 'event-stream, commit e316336, add flat map', url: `${ES}/e3163361fed01384c986b9b4c18feb1fc42b8285` },
		{ title: 'README de node-semver, Caret Ranges', url: 'https://github.com/npm/node-semver/blob/6e05b7637396ac66522cff8731f07cfe0ef49a29/README.md#L342-L360' }
	]
};
