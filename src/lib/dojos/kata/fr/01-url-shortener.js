/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'url-shortener',
	part: 'Petits services',
	title: 'Un raccourcisseur d’URL',
	minutes: 10,
	hook: [
		'Une équipe marketing imprime un QR code sur 20 000 flyers. Il pointe vers `https://sho.rt/k3Xa9Qz`. Derrière, l’URL longue fait 180 caractères de paramètres de suivi.',
		'Six mois plus tard, la page de la campagne déménage. L’équipe change la cible dans ton service, et tous les flyers marchent encore. Une semaine après, quelqu’un signale un lien comme du phishing, et tu le désactives.',
		'Ces deux changements ne marchent que si chaque scan passe encore par ton serveur.'
	],
	terms: [
		{ term: 'Code court', def: 'Les quelques caractères après le domaine, comme `k3Xa9Qz`. Le service associe chaque code à une URL longue.' },
		{ term: 'Base62', def: 'Écrire une valeur avec les 62 caractères `0-9`, `a-z` et `A-Z`. Un code de n caractères a 62 puissance n valeurs possibles.' },
		{ term: '302 Found', def: 'Le statut HTTP qui dit au navigateur que la cible est temporaire. Le navigateur suit l’en-tête `Location` et réutilise l’URL courte la fois suivante.' }
	],
	kata: {
		brief: [
			'Une équipe colle une URL longue et reçoit une URL courte. Quiconque ouvre l’URL courte est redirigé vers la longue. Le propriétaire d’un lien peut changer sa cible ou le désactiver.',
			'Le service doit garder **100 millions de liens** sur 5 ans. Chaque lien est ouvert 100 fois en moyenne : 100 lectures pour une écriture. Au pic, le trafic vaut 10 fois la moyenne.',
			'Une redirection doit répondre en moins de 50 ms. Une URL longue fait 200 caractères en moyenne, 2 000 au plus. L’équipe veut aussi un nombre de clics par lien, qui peut avoir quelques minutes de retard.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit combien de caractères a un code, et combien de codes cette longueur donne.',
			'Ton design dit ce qui se passe quand un nouveau lien tire un code qui existe déjà.',
			'Ton design nomme le statut HTTP de la redirection, et dit si un deuxième clic arrive encore à ton serveur.',
			'Ton schéma montre le chemin de lecture d’une redirection, et rien sur ce chemin n’attend une écriture.',
			'Ton design dit où un clic est compté, et combien de clics tu perds si un serveur plante.',
			'Ton design donne le stockage pour 100 millions de liens et les lectures par seconde au pic.'
		],
		sample: [
			'D’abord les chiffres. 5 ans font 157,7 millions de secondes : 100 millions de liens, c’est 0,63 écriture par seconde en moyenne et environ 6 au pic. Les lectures sont 100 fois plus nombreuses : 63 par seconde en moyenne, **630 par seconde au pic**. Un primaire PostgreSQL avec un réplica en lecture tient cette charge.',
			'Le stockage : une ligne contient le code, l’URL longue, le propriétaire, une date de création et un drapeau actif. Compte environ 500 octets par ligne avec l’index. 100 millions de lignes font environ 50 Go, qui tiennent sur un disque.',
			'Les codes font 7 caractères base62 tirés au hasard. 62 puissance 7 donne environ 3 500 milliards de codes. Avec 100 millions de liens en table, un nouveau code tombe sur un code pris 0,003 % du temps. L’appli insère avec `INSERT ... ON CONFLICT (code) DO NOTHING RETURNING code`. PostgreSQL ne renvoie que les lignes vraiment insérées : un résultat vide veut dire collision, et l’appli tire un autre code.',
			'Le hasard a un prix : deux insertions peuvent tomber sur le même code, donc l’insertion a besoin de cette nouvelle tentative. Un compteur écrit en base62 ne collisionne jamais, mais n’importe qui liste alors tous les liens en comptant à partir de `aaaaaaa`.',
			'La redirection est un `302 Found` avec l’URL longue dans `Location`. La RFC 9110 dit "A 301 response is heuristically cacheable" : sur un 301, le navigateur peut sauter ton serveur au clic suivant. Avec un 302, une cible changée ou un lien désactivé s’applique dès le clic suivant.',
			'Le prix du 302 : chaque clic est une requête chez toi, 630 par seconde au pic. Chaque serveur d’appli garde en mémoire les 100 000 codes les plus ouverts, environ 30 Mo à 300 octets chacun, et demande le reste au réplica. Quand un propriétaire modifie son lien, il est retiré de ces caches.',
			'Le comptage des clics : chaque serveur d’appli ajoute 1 à un compteur en mémoire par code. Une fois par minute, il écrit les totaux dans une table `clicks` et repart de zéro. Si un serveur plante, les clics de sa dernière minute sont perdus, ce que l’énoncé accepte.'
		]
	},
	quiz: [],
	recall: {
		q: 'Combien de caractères font les codes de la réponse, et à quelle fréquence un nouveau code collisionne avec 100 millions de liens en table ?',
		a: '7 caractères base62, environ 3 500 milliards de codes. Un nouveau code tiré au hasard tombe sur un code pris 0,003 % du temps, et l’insertion réessaie.'
	},
	sources: [
		{ title: 'RFC 9110, HTTP Semantics, 15.4 Redirection 3xx', url: 'https://www.rfc-editor.org/rfc/rfc9110#section-15.4' },
		{ title: 'Documentation PostgreSQL, INSERT (ON CONFLICT et RETURNING)', url: 'https://www.postgresql.org/docs/current/sql-insert.html' }
	]
};
