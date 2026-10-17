/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'curl',
	part: 'Texte et données',
	title: 'curl',
	minutes: 10,
	hook: [
		'Tu viens de déployer le service `orders`, il écoute sur `http://localhost:8080`. Le navigateur affiche une page blanche, alors tu testes chaque endpoint depuis le terminal avec curl. Si tu ne lui demandes pas d’échouer, curl sort avec 0 même quand le serveur répond 404.',
		'Les endpoints : `/health` renvoie `ok`. `/docs` répond 301 avec `Location: /docs/`. `/export/orders.csv` renvoie un fichier CSV. `GET /api/orders` exige l’en-tête `Authorization: Bearer abc123`. `POST /api/orders` crée une commande à partir de JSON. `/api/orders/42` accepte POST et DELETE. `/missing` renvoie 404. Tape chaque URL en entier, avec `http://`.'
	],
	terms: [
		{ term: 'Code de statut', def: 'Le nombre à trois chiffres sur la première ligne de la réponse : 200 pour OK, 301 pour déplacé, 404 pour introuvable.' },
		{ term: 'En-tête', def: 'Une ligne `Nom: valeur` envoyée avant le corps, par le client dans la requête ou par le serveur dans la réponse.' },
		{ term: 'Méthode', def: 'Le verbe au début d’une requête HTTP : GET, HEAD, POST, DELETE. curl envoie GET tant qu’aucune option ne le change.' },
		{ term: 'Code de sortie', def: 'Le nombre que curl rend au shell en se terminant. `0` veut dire que le transfert a marché, `22` veut dire que `--fail` a vu un statut de 400 ou plus.' }
	],
	reps: [
		{
			prompt: 'Récupère `http://localhost:8080/health` et affiche les en-têtes de la réponse au-dessus du corps.',
			accept: [
				'curl -i http://localhost:8080/health',
				'curl --include http://localhost:8080/health',
				'curl --show-headers http://localhost:8080/health',
				'curl http://localhost:8080/health -i',
				'curl http://localhost:8080/health --include',
				'curl http://localhost:8080/health --show-headers'
			],
			why: '`-i` écrit la ligne de statut et les en-têtes de la réponse dans la même sortie que le corps. Depuis curl 8.10.0, son nom long est `--show-headers`, et l’ancien nom `--include` marche encore.'
		},
		{
			prompt: 'Demande à `http://localhost:8080/health` ses en-têtes seulement, avec une requête HEAD.',
			accept: [
				'curl -I http://localhost:8080/health',
				'curl --head http://localhost:8080/health',
				'curl http://localhost:8080/health -I',
				'curl http://localhost:8080/health --head'
			],
			why: '`-I` envoie la méthode HEAD : le serveur renvoie les en-têtes sans corps. `-X HEAD` change seulement le mot dans la ligne de requête, et la doc de curl dit qu’une vraie requête HEAD demande `--head`.'
		},
		{
			prompt: '`http://localhost:8080/docs` répond 301. Récupère-la de façon que curl suive la redirection et affiche la page finale.',
			accept: [
				'curl -L http://localhost:8080/docs',
				'curl --location http://localhost:8080/docs',
				'curl http://localhost:8080/docs -L',
				'curl http://localhost:8080/docs --location'
			],
			why: 'Avec `-L`, curl lit l’en-tête `Location:` d’une réponse 3xx et renvoie la requête à cette adresse. Sans cette option, curl affiche le corps vide du 301 et s’arrête.'
		},
		{
			prompt: 'Télécharge `http://localhost:8080/export/orders.csv` dans un fichier nommé `orders-2026.csv`, avec une option de curl (pas de redirection du shell).',
			accept: [
				'curl -o orders-2026.csv http://localhost:8080/export/orders.csv',
				'curl --output orders-2026.csv http://localhost:8080/export/orders.csv',
				'curl http://localhost:8080/export/orders.csv -o orders-2026.csv',
				'curl http://localhost:8080/export/orders.csv --output orders-2026.csv'
			],
			why: '`-o orders-2026.csv` écrit le corps dans ce fichier au lieu de stdout. `-O` garderait le nom distant, `orders.csv`.'
		},
		{
			prompt: 'Liste les commandes : fais un GET sur `http://localhost:8080/api/orders` avec l’en-tête `Authorization: Bearer abc123`.',
			accept: [
				"curl -H 'Authorization: Bearer abc123' http://localhost:8080/api/orders",
				'curl -H "Authorization: Bearer abc123" http://localhost:8080/api/orders',
				"curl --header 'Authorization: Bearer abc123' http://localhost:8080/api/orders",
				'curl --header "Authorization: Bearer abc123" http://localhost:8080/api/orders',
				"curl http://localhost:8080/api/orders -H 'Authorization: Bearer abc123'",
				'curl http://localhost:8080/api/orders -H "Authorization: Bearer abc123"'
			],
			why: '`-H` ajoute un en-tête à la requête. Les guillemets gardent `Authorization: Bearer abc123` en un seul argument, parce qu’il contient des espaces.'
		},
		{
			prompt: 'Marque la commande 42 comme payée : envoie le champ de formulaire `status=paid` à `http://localhost:8080/api/orders/42` en POST.',
			accept: [
				'curl -d status=paid http://localhost:8080/api/orders/42',
				"curl -d 'status=paid' http://localhost:8080/api/orders/42",
				'curl -d "status=paid" http://localhost:8080/api/orders/42',
				'curl --data status=paid http://localhost:8080/api/orders/42',
				"curl --data 'status=paid' http://localhost:8080/api/orders/42",
				'curl -X POST -d status=paid http://localhost:8080/api/orders/42',
				"curl -X POST -d 'status=paid' http://localhost:8080/api/orders/42",
				'curl http://localhost:8080/api/orders/42 -d status=paid'
			],
			why: '`-d status=paid` met la donnée dans le corps de la requête et passe la méthode en POST, avec `Content-Type: application/x-www-form-urlencoded`. `-X POST` est permis mais ne change rien ici.'
		},
		{
			prompt: 'Supprime la commande 42 avec une requête DELETE vers `http://localhost:8080/api/orders/42`.',
			accept: [
				'curl -X DELETE http://localhost:8080/api/orders/42',
				'curl --request DELETE http://localhost:8080/api/orders/42',
				'curl http://localhost:8080/api/orders/42 -X DELETE',
				'curl http://localhost:8080/api/orders/42 --request DELETE'
			],
			why: '`-X DELETE` remplace le mot GET par DELETE. curl n’a pas d’option dédiée à DELETE, donc tu passes par `-X`.'
		},
		{
			prompt: 'Crée une commande : envoie en POST le corps `{"item":"mug","qty":2}` à `http://localhost:8080/api/orders`, avec l’option unique qui règle aussi `Content-Type` et `Accept` sur `application/json`.',
			accept: [
				`curl --json '{"item":"mug","qty":2}' http://localhost:8080/api/orders`,
				`curl http://localhost:8080/api/orders --json '{"item":"mug","qty":2}'`,
				`curl -X POST --json '{"item":"mug","qty":2}' http://localhost:8080/api/orders`
			],
			why: '`--json` envoie le texte comme corps d’un POST et ajoute `Content-Type: application/json` et `Accept: application/json`. L’option existe depuis curl 7.82.0, et elle ne vérifie pas que le texte est du JSON valide.'
		},
		{
			prompt: 'Affiche seulement le code de statut de `http://localhost:8080/missing` : pas de corps, pas de barre de progression.',
			accept: [
				"curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/missing",
				'curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/missing',
				'curl -s -o /dev/null -w %{http_code} http://localhost:8080/missing',
				"curl -so /dev/null -w '%{http_code}' http://localhost:8080/missing",
				"curl -s -w '%{http_code}' -o /dev/null http://localhost:8080/missing",
				"curl -o /dev/null -s -w '%{http_code}' http://localhost:8080/missing",
				"curl --silent --output /dev/null --write-out '%{http_code}' http://localhost:8080/missing",
				"curl -s -o /dev/null -w '%{response_code}' http://localhost:8080/missing",
				"curl http://localhost:8080/missing -s -o /dev/null -w '%{http_code}'"
			],
			why: '`-s` cache la barre de progression, `-o /dev/null` jette le corps, et `-w \'%{http_code}\'` affiche le statut après le transfert. Ici tu lis `404`, et curl sort quand même avec 0.'
		},
		{
			prompt: 'Dans un script de déploiement, récupère `http://localhost:8080/health` de façon que curl sorte avec un code non nul sur un statut de 400 ou plus, sans barre de progression, mais avec son message d’erreur.',
			accept: [
				'curl -fsS http://localhost:8080/health',
				'curl -sSf http://localhost:8080/health',
				'curl -fSs http://localhost:8080/health',
				'curl -sfS http://localhost:8080/health',
				'curl -Ssf http://localhost:8080/health',
				'curl -Sfs http://localhost:8080/health',
				'curl -f -s -S http://localhost:8080/health',
				'curl --fail --silent --show-error http://localhost:8080/health'
			],
			why: 'Avec `-f`, curl sort avec 22 et n’affiche aucun corps quand le statut vaut 400 ou plus. `-s` cache la barre de progression et les erreurs, puis `-S` remet le message d’erreur, par exemple `curl: (22) The requested URL returned error: 404`.'
		}
	],
	quiz: [],
	recall: {
		q: 'curl reçoit un 404 sur `/missing`. Quelle option le fait sortir avec un code non nul, et lequel ?',
		a: '`-f` (`--fail`). curl n’affiche pas le corps et sort avec le code 22 pour tout statut de 400 ou plus. Sans elle, curl sort avec 0.'
	},
	sources: [{ title: 'Page de manuel de curl', url: 'https://curl.se/docs/manpage.html' }]
}
