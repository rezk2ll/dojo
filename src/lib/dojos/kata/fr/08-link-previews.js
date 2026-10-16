/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'link-previews',
	part: 'Petits services',
	title: 'Les aperçus de liens',
	minutes: 10,
	hook: [
		'Sami colle le lien d’un article dans le chat de son équipe. Sous le message apparaît une carte avec le titre de l’article, une courte description et une photo. Personne dans le chat n’a ouvert la page.',
		'Quelqu’un a pourtant téléchargé cette page. Si c’est ton serveur, un attaquant peut coller `http://169.254.169.254/` à la place, l’adresse du service de métadonnées du cloud. OWASP rappelle que le SSRF "is often used to access and steal credentials and access tokens from metadata services" (sert souvent à voler des identifiants sur ces services).',
		'Tu conçois le service d’aperçus : récupérer le titre et l’image de n’importe quelle page publique, sans jamais joindre une adresse de ton propre réseau.'
	],
	terms: [
		{ term: 'Balises Open Graph', def: 'Des balises `<meta property="og:title">` et `og:image` dans le `<head>` d’une page, qui donnent le titre et l’image à afficher dans un aperçu.' },
		{ term: 'SSRF', def: 'Server-side request forgery : un utilisateur fait envoyer à ton serveur une requête vers l’adresse de son choix, par exemple une adresse interne.' },
		{ term: 'DNS rebinding', def: 'Un domaine répond avec une IP publique au moment où tu le vérifies, puis avec une IP interne au moment où tu te connectes.' }
	],
	kata: {
		brief: [
			'Une app de chat transporte 2 millions de messages par jour. Environ 1 message sur 10 contient un lien. 60 % de ces liens ont déjà été postés par quelqu’un dans les dernières 24 heures.',
			'Chaque lien reçoit une carte avec le titre de la page et sa description, plus une image tirée de la page. Le message doit s’afficher tout de suite. La carte doit apparaître en moins de 3 secondes.',
			'Les serveurs tournent dans un réseau cloud avec des adresses privées en `10.0.0.0/8` et l’adresse de métadonnées `169.254.169.254`. Un panneau d’administration écoute sur `10.0.4.7`. Certaines pages liées pèsent 20 Mo, et certaines n’en finissent jamais d’arriver.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit quelle machine télécharge la page : le téléphone de l’expéditeur, celui de chaque lecteur, ou tes serveurs.',
			'Ton design liste les plages d’adresses qu’un téléchargement refuse. La liste couvre `169.254.169.254` et `10.0.0.0/8`.',
			'Ton design dit comment l’adresse vérifiée est bien celle à laquelle il se connecte, pour que le DNS rebinding échoue.',
			'Ton design dit ce qui se passe quand une page publique redirige vers `http://10.0.4.7/`.',
			'Ton design fixe une limite de temps et une limite de taille pour un téléchargement.',
			'Ton design dit si un message attend sa carte.',
			'Ton design compte les téléchargements par jour une fois le cache passé.'
		],
		sample: [
			'Le serveur de chat enregistre et distribue le message tout de suite, puis met l’URL dans une file. Un worker d’aperçus télécharge la page et envoie la carte comme une mise à jour du message. Les téléphones des lecteurs ne contactent jamais le site lié, donc le site ne voit jamais leurs adresses IP.',
			'200 000 liens par jour, moins les 60 % déjà dans un cache indexé par URL pendant 24 heures, laissent 80 000 téléchargements par jour : environ 1 par seconde. Une carte en cache pèse environ 1 Ko de texte, donc une journée de cartes prend environ 80 Mo. Le worker télécharge aussi `og:image`, la réduit en une vignette de 50 Ko et la stocke. 80 000 vignettes prennent 4 Go par jour.',
			'Le worker n’accepte que `http` et `https`, sur les ports 80 et 443. Il résout le nom une seule fois et refuse l’URL si une des adresses tombe dans `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `fc00::/7` ou `fe80::/10` (la liste de refus d’OWASP, élargie de `169.254.169.254` à toute la plage link-local `169.254.0.0/16`).',
			'Le worker se connecte ensuite à l’IP qu’il a vérifiée, et envoie le nom d’origine dans l’en-tête `Host` et dans le SNI de TLS. Une deuxième résolution DNS laisserait un domaine de rebinding basculer vers `10.0.4.7` après la vérification. OWASP prévient : "A second, unchecked DNS lookup between validation and connection can bypass these checks".',
			'Le client HTTP ne suit aucune redirection tout seul. Le worker lit l’en-tête `Location` et refait les mêmes vérifications sur le nouvel hôte, 3 fois au plus. Une redirection vers `http://10.0.4.7/` échoue au contrôle des plages, et aucune carte ne s’affiche.',
			'Un téléchargement dispose de 5 secondes en tout. Le worker lit au plus 512 Ko de HTML et s’arrête après `</head>`, là où se trouvent les balises Open Graph. Il lit au plus 5 Mo d’image. Une page de 20 Mo, ou une page sans fin, coûte à un worker 5 secondes et 512 Ko.',
			'Les workers tournent en plus dans leur propre sous-réseau, derrière un pare-feu qui autorise la sortie vers internet et rien dans `10.0.0.0/8`. Un bug dans le contrôle des adresses bute alors encore sur le pare-feu. Le prix de ce design : les cartes arrivent 1 à 5 secondes après le message, et une carte en cache peut avoir 24 heures de retard si la page change.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse proposée, pourquoi le worker se connecte-t-il à l’IP qu’il a vérifiée au lieu de résoudre le nom une deuxième fois ?',
		a: 'Une deuxième résolution DNS pourrait renvoyer une adresse interne comme `10.0.4.7` après la vérification (DNS rebinding). Se connecter à l’IP vérifiée, avec le nom gardé dans `Host` et le SNI, ferme cette brèche.'
	},
	sources: [
		{ title: 'OWASP : Server Side Request Forgery Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html' },
		{ title: 'Le protocole Open Graph', url: 'https://ogp.me/' }
	]
};
