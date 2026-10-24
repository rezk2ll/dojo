/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'first-kata',
	part: 'Le métier d’architecte',
	title: 'Ton premier kata : un design complet en 15 minutes',
	minutes: 15,
	hook: [
		'Ted Neward a demandé : « Alors comment sommes-nous censés former de grands architectes, s’ils n’ont l’occasion de concevoir une architecture que moins d’une demi-douzaine de fois dans leur carrière ? » Un vrai système prend des années, donc un architecte en conçoit environ six dans sa carrière.',
		'Sa réponse, c’est le **kata d’architecture** : un court énoncé inventé, un temps limité, un petit groupe qui conçoit sur papier, présente, et les autres votent. Les règles disent que le modérateur joue « tout le monde sauf toi » : le client, le chef, le chef de projet, l’exploitation.',
		'Tu fais ce premier kata **seul, sur papier, en 15 minutes**. Chaque étape s’appuie sur un jour que tu as déjà fait, sans nouvelle théorie.'
	],
	terms: [
		{ term: 'Kata', def: 'Un énoncé d’entraînement : une description, les utilisateurs, les exigences, un peu de contexte en plus. Assez petit pour être esquissé d’une traite.' },
		{ term: 'Modérateur', def: 'Répond à tes questions en jouant le client, le chef et l’exploitation. Seul, tu écris tes questions à la place.' },
		{ term: 'Hypothèse', def: 'Les règles autorisent des hypothèses sur des technologies que tu connais mal, tant que tu les annonces en présentant. Les mauvaises hypothèses, jamais vérifiées avec le client, valent un pouce vers le bas.' },
		{ term: 'Vote des pairs', def: 'Pouce en haut, « bof » ou en bas. Le pouce en haut ne demande pas des schémas finis, seulement la certitude que tu pourrais les produire avec du temps.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['brief["L’énoncé"] --> ask["Questions et hypothèses, 2 min"]'],
				highlight: ['brief', 'ask'],
				note: 'Lis l’énoncé une fois. Écris les questions que tu poserais au client, et les hypothèses que tu feras si personne ne répond. Les règles disent : « Dans le doute, demande. »'
			},
			{
				add: ['ask --> chars["Top 3 des caractéristiques, un scénario, 3 min"]'],
				highlight: ['chars'],
				note: 'Jours 2 et 3. Choisis **trois** caractéristiques, pas plus, chacune avec un pourquoi tiré de l’énoncé. Transforme la plus importante en scénario avec un chiffre.'
			},
			{
				add: ['chars --> ctx["Diagramme de contexte, 3 min"]', 'ctx --> sketch["Esquisse des conteneurs, 4 min"]'],
				highlight: ['ctx', 'sketch'],
				note: 'Jours 6 et 7. Ton système comme une seule boîte, avec ses utilisateurs et ses systèmes externes. Puis les conteneurs qui tournent dedans, et l’endroit où vivent les données.'
			},
			{
				add: ['sketch --> adr["Un ADR pour la porte à sens unique, 2 min"]'],
				highlight: ['adr'],
				note: 'Jours 4 et 5. Trouve la décision la plus coûteuse à défaire et écris-la sous forme de Y-statement, coût compris.'
			},
			{
				add: ['adr --> pitch["Pitch de 30 secondes, 1 min"]', 'pitch --> vote["Vote : haut, bof, bas"]'],
				highlight: ['pitch', 'vote'],
				note: 'Jour 39 : présente-le comme à une directrice, en 30 secondes. Puis note-toi comme le ferait un pair. Le pouce en bas veut dire que l’équipe « a fait des hypothèses majeures que tu juges sans fondement » ou « n’a jamais posé la moindre question au client ».'
			}
		]
	},
	tradeoff: {
		gain: [
			'À 15 minutes chacun, tu peux faire des dizaines de designs par an au lieu d’environ six dans une carrière.',
			'Un mauvais design de kata n’atteint aucun utilisateur, ne perd aucune donnée et ne coûte pas d’argent.',
			'Chaque kata te fait pratiquer les deux habitudes dont l’absence est la plus sanctionnée en vraie revue : poser des questions et énoncer tes hypothèses.'
		],
		cost: [
			'Un énoncé inventé n’a ni politique, ni code existant, ni équipe en place, alors que tout vrai système les a.',
			'Seul, tu n’as pas de vote, alors montre ta feuille à une personne, ou compare-la avec un vrai système que tu connais.',
			'On glisse facilement vers le style entretien d’embauche, « passer à un milliard d’utilisateurs », au lieu de ce que demande vraiment l’énoncé.'
		]
	},
	task: {
		prompt: 'Lance un minuteur de 15 minutes et fais ce kata sur une seule feuille. **Album de famille.** Un album photo partagé pour les familles. Utilisateurs : 10 000 familles de 2 à 15 personnes, des enfants aux grands-parents. Exigences : envoyer depuis un téléphone. La famille voit une nouvelle photo en moins d’une minute. Inviter un proche extérieur à la famille sur un seul album. Tout télécharger sous forme d’archive. Contexte supplémentaire : ça doit tourner sur un petit serveur domestique pour une seule famille, et comme service hébergé pour les 10 000. Une équipe de quatre développeurs. Les photos d’une famille ne doivent jamais être visibles par une autre famille.',
		hint: 'Suis les durées du diagramme : 2, 3, 3, 4, 2, 1 minutes. La tension de cet énoncé est entre « jamais visibles par une autre famille » et « inviter un proche extérieur ». Cherche la porte à sens unique à cet endroit.',
		answer: [
			'Questions, écrites, par exemple : les vidéos sont-elles concernées, et de quelle taille ? Une famille auto-hébergée peut-elle inviter quelqu’un du service hébergé ? Qui paie le stockage ?',
			'Trois caractéristiques, chacune avec un pourquoi : l’isolation des données (la phrase « jamais visibles »), la déployabilité d’un petit boîtier à un service hébergé (le même code, deux tailles), et la maîtrise des coûts (quatre devs, et les photos prennent beaucoup de stockage). La performance à 10 000 familles n’est pas un moteur principal.',
			'Un scénario avec un chiffre, par exemple : un grand-parent sur une connexion mobile lente ouvre une nouvelle photo, et la première miniature s’affiche en moins de 3 secondes.',
			'Diagramme de contexte : l’album comme une seule boîte ; les membres de la famille et le proche invité ; des boîtes externes pour le mail (invitations), les notifications push, et le stockage objet en mode hébergé.',
			'La porte à sens unique : la façon de séparer les familles. Une base par famille contre des tables partagées avec un identifiant de famille (les modèles de tenancy du jour 13). Le proche extérieur traverse cette frontière, donc le partage avec lui doit être une fonctionnalité que tu conçois exprès.',
			'Hypothèses : énonce-les à voix haute en présentant. Les pièges du pouce en bas : Kubernetes et dix microservices pour un serveur domestique, aucune question posée, l’auto-hébergement ignoré.'
		],
		steps: [
			{
				title: 'Demande, puis suppose',
				questions: [
					{ q: 'Tu lances le minuteur. Qu’écris-tu en premier sur ta feuille ?', options: ['Le schéma des conteneurs', 'Les questions que tu poserais au client', 'Le choix de la base de données', 'Le pitch de 30 secondes'], answer: 1, why: 'Les règles disent « When in doubt, ask » (dans le doute, demande). Deux minutes de questions et d’hypothèses passent avant toute boîte.' },
					{ q: 'Quelle question vaut la peine d’être posée pour cet énoncé ?', options: ['Quelle couleur de logo préfèrent les familles', 'Tabulations ou espaces', 'Les vidéos sont-elles concernées, et de quelle taille ?', 'Combien d’étoiles le repo devrait avoir'], answer: 2, why: 'Les vidéos changent le stockage, l’envoi et la taille de l’archive, donc la réponse change le design.' },
					{ q: 'Quelle question sonde la tension entre les deux déploiements ?', options: ['Une famille auto-hébergée peut-elle inviter quelqu’un du service hébergé ?', 'Quels modèles de téléphone utilisent les grands-parents ?', 'Le logo doit-il être rond ?', 'Quelle police l’album doit-il utiliser ?'], answer: 0, why: 'La maison et l’hébergé sont deux installations séparées. Qu’une invitation passe de l’une à l’autre change la frontière que tu dessines.' },
					{ q: 'Seul, qui joue le modérateur ?', options: ['Personne : tu sautes cette étape', 'Un générateur d’énoncés aléatoires', 'Le premier lecteur de ta feuille', 'Toi : tu écris les questions à la place'], answer: 3, why: 'Le modérateur joue tout le monde sauf toi. Seul, ce sont les questions écrites qui tiennent ce rôle.' }
				]
			},
			{
				title: 'Choisis trois caractéristiques',
				questions: [
					{ q: 'Quelle ligne de l’énoncé pousse l’isolation des données ?', options: ['« Les photos d’une famille ne doivent jamais être visibles par une autre famille »', '« Une équipe de quatre développeurs »', '« Tout télécharger sous forme d’archive »', '« Envoyer depuis un téléphone »'], answer: 0, why: 'Cette phrase est une règle stricte, donc l’isolation entre dans les trois premières.' },
					{ q: 'Pourquoi la déployabilité est-elle dans les trois ?', options: ['Parce que chaque kata en a besoin', 'Parce que dix microservices en ont besoin', 'Parce que les envois sont lents', 'Le même code doit tourner sur un petit serveur domestique et comme service hébergé'], answer: 3, why: 'Deux tailles très différentes à partir d’un seul code, c’est la demande inhabituelle de l’énoncé.' },
					{ q: 'Pourquoi la maîtrise des coûts est-elle là ?', options: ['L’énoncé fixe un budget en euros', 'Quatre devs, et les photos prennent beaucoup de stockage', 'Les familles paient à la photo', 'L’hébergement est gratuit'], answer: 1, why: 'Une petite équipe et un gros stockage font du coût un vrai moteur, pas un simple bonus.' },
					{ q: 'Quel scénario a le chiffre que demande l’étape ?', options: ['« L’appli doit paraître rapide pour les grands-parents. »', '« Le système tient un milliard d’utilisateurs. »', '« Un grand-parent sur une connexion mobile lente voit la première miniature en moins de 3 secondes. »', '« Les photos se chargent vite. »'], answer: 2, why: 'Un scénario nomme qui, quoi, et un chiffre que tu peux tester. Les autres sont des souhaits.' }
				]
			},
			{
				title: 'Esquisse et trouve la porte',
				questions: [
					{ q: 'Quelles boîtes sont hors de l’album sur le diagramme de contexte ?', options: ['Le mail pour les invitations, les notifications push, le stockage objet en mode hébergé', 'La base de données et le serveur web', 'Kubernetes et un service mesh', 'Les quatre développeurs'], answer: 0, why: 'Un diagramme de contexte montre le système comme une seule boîte, avec ses personnes et ses systèmes externes.' },
					{ q: 'Sur le diagramme de contexte, où va le proche invité ?', options: ['Dans la boîte de l’album', 'Hors de la boîte, comme une personne à côté des membres de la famille', 'Nulle part : ce n’est pas un utilisateur', 'Dans la boîte du mail, puisque l’invitation est un e-mail'], answer: 1, why: 'Un diagramme de contexte montre les personnes autour du système. Le proche utilise l’album, donc c’est une personne du diagramme, même avec un accès à un seul album.' },
					{ q: 'Quelle décision est la porte à sens unique ?', options: ['La taille des miniatures', 'Le fournisseur de notifications push', 'Le format de l’archive', 'La façon de séparer les familles : une base par famille ou des tables partagées avec un identifiant de famille'], answer: 3, why: 'Les modèles de tenancy du jour 13. Changer plus tard, c’est déplacer les données de chaque famille.' },
					{ q: 'Le proche invité de l’extérieur traverse cette frontière. Qu’en découle-t-il ?', options: ['Le partage avec lui doit être une fonctionnalité que tu conçois exprès', 'Il devient membre de la famille', 'Il a accès en lecture à tous les albums', 'Il lui faut son propre serveur domestique'], answer: 0, why: 'C’est la tension de l’énoncé : « jamais visibles » contre « inviter de l’extérieur ». Conçois ce passage de façon explicite.' }
				]
			},
			{
				title: 'Présente et note-toi',
				questions: [
					{ q: 'Comment écris-tu l’ADR de la porte à sens unique ?', options: ['En une page complète de pour et de contre', 'En Y-statement, coût compris', 'En liste de technologies', 'En diagramme seulement'], answer: 1, why: 'Jours 4 et 5 : un Y-statement qui nomme le choix et ce qu’il coûte.' },
					{ q: 'Comme la version pour la directrice du jour 39, que doit garder le pitch ?', options: ['Le nom de chaque conteneur', 'Seulement le gain', 'Un gain et un coût', 'Le calendrier du projet'], answer: 2, why: 'Un pitch qui ne donne que le gain cache le prix de la porte à sens unique. La directrice apprend le coût plus tard, par quelqu’un d’autre.' },
					{ q: 'Seul, personne ne vote sur ta feuille. Que fais-tu à la place ?', options: ['Tu te mets un pouce en haut', 'Tu sautes la note', 'Tu refais le kata jusqu’à ce que ça te semble bon', 'Tu la montres à une personne, ou tu la compares à un vrai système que tu connais'], answer: 3, why: 'Sans vote, tu ne vois pas tes angles morts, donc emprunte un lecteur extérieur ou un vrai design pour comparer.' },
					{ q: 'De quoi un pouce en haut a-t-il besoin ?', options: ['De la confiance que tu pourrais produire les diagrammes avec du temps', 'De diagrammes finis pour chaque conteneur', 'D’un prototype qui marche', 'De la prise en charge d’un milliard d’utilisateurs'], answer: 0, why: 'Les règles disent que le pouce en haut ne demande pas de diagrammes finis, seulement cette confiance.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Selon les règles du kata, qu’est-ce qui vaut un **pouce vers le bas** ?',
			options: ['Des hypothèses majeures sans fondement, et ne jamais poser de questions au client', 'Des schémas pas terminés', 'Choisir une base de données ou un framework qu’aucun des votants n’a jamais utilisé en production', 'Une présentation de moins de cinq minutes'],
			answer: 0,
			why: 'Les règles disent que le pouce en haut ne demande pas des schémas finis, seulement la certitude que tu pourrais les produire. Une équipe qui devine sans poser de questions au client reçoit le pouce vers le bas.'
		},
		{
			q: 'L’énoncé dit « un petit serveur domestique » **et** « hébergé pour 10 000 familles ». Quelle idée vue plus tôt convient le mieux ?',
			options: ['Un microservice par fonctionnalité, pour que chaque partie passe à l’échelle seule dans le service hébergé', 'Une appli stateless qui tourne en une seule copie sur un boîtier, ou en plusieurs copies derrière un load balancer', 'Une seule base partagée pour toutes les familles, pour que le service hébergé reste simple à exploiter', 'Une base de code différente pour chaque déploiement, une pour la maison et une pour l’hébergement'],
			answer: 1,
			why: 'Garde l’état dans la base et le stockage, pas dans l’appli. Le même code tourne alors en une copie à la maison ou en plusieurs copies dans le service hébergé. Les autres options cassent l’isolation ou doublent le travail.'
		},
		{
			q: 'Tu ne sais pas si les vidéos sont concernées. Que disent les règles ?',
			options: ['Supposer que non, laisser les vidéos hors du design et garder ce choix pour toi', 'Concevoir pour de la vidéo 8K, par sécurité, car voir trop grand n’est jamais pénalisé', 'Laisser tomber l’exigence d’envoi, puisque l’énoncé ne dit pas quels fichiers comptent', 'Demander au modérateur, et si tu fais une hypothèse, l’énoncer clairement en présentant'],
			answer: 3,
			why: '« Dans le doute, demande. » Le modérateur parle au nom du client. Si tu dois quand même faire une hypothèse, dis-le en présentant : ne jamais demander et te brûler sur une mauvaise hypothèse vaut un pouce vers le bas.'
		}
	],
	recall: {
		q: 'Quelles sont les étapes d’un kata de 15 minutes, et qu’est-ce qui vaut un pouce vers le bas ?',
		a: 'Questions et hypothèses (2 min), trois caractéristiques et un scénario (3), un diagramme de contexte (3), une esquisse des conteneurs (4), un ADR pour la porte à sens unique (2), et un pitch de 30 secondes (1). Le pouce vers le bas vient d’hypothèses majeures sans fondement, ou de n’avoir jamais posé de questions au client.'
	},
	sources: [
		{ title: 'Architectural Katas (Ted Neward)', url: 'https://www.architecturalkatas.com/' },
		{ title: 'Architectural Katas, Rules (Ted Neward)', url: 'https://www.architecturalkatas.com/rules.html' },
		{ title: 'Neal Ford, Architectural Katas (with a random brief generator)', url: 'https://nealford.com/katas/' },
		{ title: 'The Kata Log, winners and finalists of the O\'Reilly architecture katas', url: 'https://github.com/TheKataLog' }
	]
};
