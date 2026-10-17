/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'docker',
	part: 'Outils d’exploitation',
	title: 'docker',
	minutes: 10,
	hook: [
		'Avant de mettre une nouvelle config nginx en production, tu essaies l’image `nginx:1.27` sur ton portable. Tu la lances en conteneur nommé `web`, avec le port 80 du conteneur publié sur le port 8080 de ta machine : `curl http://localhost:8080` l’atteint.',
		'Les répétitions suivent `web` de `docker run` jusqu’à `docker rm`. Tu lances aussi `alpine:3.20` une fois pour afficher le fichier `/etc/alpine-release`, qui contient la version d’Alpine. Tu as téléchargé les deux images plus tôt.'
	],
	terms: [
		{ term: 'Image', def: 'Un modèle en lecture seule avec un nom et un tag, comme `nginx:1.27`. `docker run` en crée un conteneur.' },
		{ term: 'Conteneur', def: 'Un processus lancé à partir d’une image, avec son propre système de fichiers et un nom, comme `web`. Il reste sur le disque après son arrêt, jusqu’à ce que tu le supprimes.' },
		{ term: 'Port publié', def: 'Un port de l’hôte que Docker redirige vers un port du conteneur. `-p 8080:80` envoie le port 8080 de l’hôte vers le port 80 du conteneur.' }
	],
	reps: [
		{
			prompt: 'Lance `nginx:1.27` en arrière-plan, en conteneur nommé `web`, avec le port 8080 de l’hôte envoyé vers le port 80 du conteneur.',
			accept: [
				'docker run -d --name web -p 8080:80 nginx:1.27',
				'docker run -d -p 8080:80 --name web nginx:1.27',
				'docker run --name web -d -p 8080:80 nginx:1.27',
				'docker run --name web -p 8080:80 -d nginx:1.27',
				'docker run -p 8080:80 -d --name web nginx:1.27',
				'docker run -p 8080:80 --name web -d nginx:1.27',
				'docker run --detach --name web --publish 8080:80 nginx:1.27',
				'docker run -d --name=web -p 8080:80 nginx:1.27',
				'docker container run -d --name web -p 8080:80 nginx:1.27'
			],
			why: '`-d` lance le conteneur en arrière-plan et affiche son ID, `--name web` lui donne un nom, `-p 8080:80` publie le port 80 du conteneur sur le port 8080 de l’hôte. Les options viennent avant le nom de l’image ; ce qui suit l’image est la commande à lancer dedans.'
		},
		{
			prompt: 'Liste les conteneurs qui tournent.',
			accept: ['docker ps', 'docker container ls', 'docker container ps', 'docker container list'],
			why: '`docker ps` affiche une ligne par conteneur en marche, avec ses ports publiés dans la colonne `PORTS`. C’est un alias de `docker container ls`.'
		},
		{
			prompt: 'Affiche les 20 dernières lignes des logs de `web`.',
			accept: [
				'docker logs --tail 20 web',
				'docker logs -n 20 web',
				'docker logs --tail=20 web',
				'docker logs web --tail 20',
				'docker logs web -n 20',
				'docker container logs --tail 20 web'
			],
			why: '`--tail 20` (forme courte `-n 20`) ne garde que les 20 dernières lignes. Sa valeur par défaut est `all`.'
		},
		{
			prompt: 'Suis les logs de `web` en direct pendant que tu lances `curl http://localhost:8080` dans un autre terminal.',
			accept: [
				'docker logs -f web',
				'docker logs --follow web',
				'docker logs web -f',
				'docker container logs -f web',
				'docker container logs --follow web'
			],
			why: '`-f` laisse `docker logs` tourner et affiche chaque nouvelle ligne, ici une ligne de log d’accès par requête curl. Ctrl-C arrête la commande, pas le conteneur.'
		},
		{
			prompt: 'Ouvre un shell `sh` interactif dans le conteneur `web` en marche.',
			accept: [
				'docker exec -it web sh',
				'docker exec -ti web sh',
				'docker exec -i -t web sh',
				'docker exec -t -i web sh',
				'docker exec --interactive --tty web sh',
				'docker container exec -it web sh'
			],
			why: '`exec` démarre un nouveau processus dans un conteneur en marche. `-i` garde stdin ouvert pour que `sh` reçoive ce que tu tapes, et `-t` alloue un terminal, ce qui fait afficher une invite à `sh`.'
		},
		{
			prompt: 'Arrête le conteneur `web`.',
			accept: ['docker stop web', 'docker container stop web'],
			why: '`docker stop web` envoie SIGTERM au processus principal, puis SIGKILL après un délai de grâce, 10 secondes par défaut sous Linux. Le conteneur existe encore ensuite.'
		},
		{
			prompt: '`docker ps` n’affiche plus `web`. Liste tous les conteneurs, y compris ceux qui sont arrêtés.',
			accept: ['docker ps -a', 'docker ps --all', 'docker container ls -a', 'docker container ls --all', 'docker container ps -a'],
			why: '`-a` affiche tous les conteneurs ; par défaut, `docker ps` ne montre que ceux qui tournent. `web` apparaît avec un statut comme `Exited (0) 5 seconds ago`.'
		},
		{
			prompt: 'Supprime le conteneur arrêté `web`, pour libérer le nom avant le prochain lancement.',
			accept: ['docker rm web', 'docker container rm web', 'docker container remove web'],
			why: '`docker rm web` supprime le conteneur et son système de fichiers. L’image `nginx:1.27` reste. Pour supprimer un conteneur en marche, tu ajoutes `-f`, qui le tue d’abord avec SIGKILL.'
		},
		{
			prompt: 'Lance `cat /etc/alpine-release` dans un nouveau conteneur `alpine:3.20` que Docker supprime dès qu’il se termine.',
			accept: [
				'docker run --rm alpine:3.20 cat /etc/alpine-release',
				'docker container run --rm alpine:3.20 cat /etc/alpine-release'
			],
			why: '`--rm` supprime le conteneur et ses volumes anonymes quand il se termine. Sans cette option, chaque lancement ponctuel laisse un conteneur arrêté que `docker ps -a` liste.'
		},
		{
			prompt: 'Liste seulement les images locales du dépôt `nginx`.',
			accept: ['docker images nginx', 'docker image ls nginx', 'docker image list nginx'],
			why: '`docker images nginx` liste les images locales dont le dépôt est `nginx`, une ligne par tag, avec l’ID et la taille. Sans argument, la commande liste toutes les images locales.'
		}
	],
	quiz: [],
	recall: {
		q: 'Dans `docker run -p 8080:80 nginx:1.27`, quel nombre est le port de l’hôte ?',
		a: '8080. La forme est `HOST:CONTAINER` : le port 8080 de l’hôte mène au port 80 du conteneur.'
	},
	sources: [
		{ title: 'docker container run', url: 'https://docs.docker.com/reference/cli/docker/container/run/' },
		{ title: 'docker container ls', url: 'https://docs.docker.com/reference/cli/docker/container/ls/' },
		{ title: 'docker container logs', url: 'https://docs.docker.com/reference/cli/docker/container/logs/' },
		{ title: 'docker container exec', url: 'https://docs.docker.com/reference/cli/docker/container/exec/' },
		{ title: 'docker container stop', url: 'https://docs.docker.com/reference/cli/docker/container/stop/' },
		{ title: 'docker container rm', url: 'https://docs.docker.com/reference/cli/docker/container/rm/' },
		{ title: 'docker image ls', url: 'https://docs.docker.com/reference/cli/docker/image/ls/' }
	]
}
