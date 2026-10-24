const STARTER = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'registries-and-tags',
	part: 'Les conteneurs',
	title: 'Registries, tags et digests',
	minutes: 10,
	hook: [
		'Tu connais les dépôts apt : un serveur garde les paquets, tu fixes `nginx=1.24.0-1` pour que chaque serveur ait le même build. Une **registry** garde les images de la même façon.',
		'`myapp:latest` ressemble à une version, mais quiconque peut pousser peut faire pointer `latest` vers une nouvelle image. Deux serveurs qui ont tiré `latest` à une semaine d’écart peuvent faire tourner du code différent sous le même nom.',
		'`latest` et `1.4.2` sont des tags : un push peut les déplacer vers une autre image. Un digest est un hash du contenu de l’image, et il désigne toujours les mêmes octets.'
	],
	terms: [
		{ term: 'Registry', def: 'Un serveur qui stocke et sert des images : Docker Hub, GitHub Container Registry (`ghcr.io`), la registry de ton cloud, ou une que tu héberges. Chaque nom d’image qu’elle contient, comme `ghcr.io/acme/myapp`, est un repository.' },
		{ term: 'Tag', def: 'Un nom lisible pour une version, comme `1.4.2` ou `latest`. Les tags sont modifiables : un push peut faire pointer le même tag vers une nouvelle image.' },
		{ term: 'Digest', def: 'Un hash `sha256:...` du contenu de l’image. Deux images au même digest ont les mêmes octets. Un digest ne peut pas être déplacé vers un autre contenu.' },
		{ term: 'Pinning', def: 'Désigner une image par une version exacte, idéalement par digest (`myapp@sha256:...`), pour que chaque pull récupère la même image.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'ci["La CI build l’image"] -->|docker push| reg[("Registry : ghcr.io/acme/myapp")]'
				],
				highlight: ['ci', 'reg'],
				note: 'La CI construit l’image et la pousse dans une registry. Les serveurs et les clusters la **tirent** de là, au lieu de recevoir des tarballs par scp.'
			},
			{
				add: [
					'dg["sha256:aaa..."]',
					'reg --> dg',
					't1["tag 1.4.2"] -.-> dg',
					'tl["tag latest"] -.-> dg'
				],
				highlight: ['dg', 't1', 'tl'],
				note: 'La registry range le contenu par **digest**. Chaque tag est un nom qui pointe vers un digest. Pour l’instant `1.4.2` et `latest` pointent vers la même image.'
			},
			{
				add: [
					'dg2["sha256:bbb..."]',
					'reg --> dg2',
					't2["tag 1.5.0"] -.-> dg2',
					'tl -.->|déplacé| dg2'
				],
				highlight: ['dg2', 'tl'],
				note: 'Release suivante : tu pousses `1.5.0`, et **`latest` bouge**. Tout ce qui tire `latest` à partir de maintenant récupère du nouveau code. Le `latest` d’hier et celui d’aujourd’hui sont deux images différentes.'
			},
			{
				add: [
					'srv["Le serveur tire myapp@sha256:aaa..."]',
					'srv -->|toujours les mêmes octets| dg',
					'class srv ext'
				],
				highlight: ['srv'],
				note: 'Tire **par digest** et tu obtiens exactement cette image, pour toujours, quoi qu’il arrive aux tags. Pour revenir en arrière, tu redéploies le digest précédent.'
			}
		]
	},
	example: {
		title: 'ci/docker-publish.yml',
		repo: 'actions/starter-workflows',
		url: `${STARTER}/ci/docker-publish.yml#L8-L98`,
		lang: 'yaml',
		code: `on:
  schedule:
    - cron: $cron-daily
  push:
    branches: [ $default-branch ]
    # Publish semver tags as releases.
    tags: [ 'v*.*.*' ]
…
env:
  # Use docker.io for Docker Hub if empty
  REGISTRY: ghcr.io
  # github.repository as <account>/<repo>
  IMAGE_NAME: \${{ github.repository }}
…
      - name: Extract Docker metadata
        id: meta
        uses: docker/metadata-action@96383f45573cb7f253c731d3b3ab81c87ef81934 # v5.0.0
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
…
          tags: \${{ steps.meta.outputs.tags }}
…
      - name: Sign the published Docker image
…
          TAGS: \${{ steps.meta.outputs.tags }}
          DIGEST: \${{ steps.build-and-push.outputs.digest }}
…
        run: echo "\${TAGS}" | xargs -I {} cosign sign --yes {}@\${DIGEST}`,
		notes: [
			'GitHub fournit ce workflow de démarrage pour publier une image. Les lignes 11 et 13 la poussent sur `ghcr.io`, la registry de GitHub, sous le nom du dépôt.',
			'Les lignes 15 à 19 prennent les tags de `docker/metadata-action` avec ses valeurs par défaut : un push sur une branche donne un tag au nom de la branche, un tag Git `v1.2.3` donne `v1.2.3` **et `latest`**, un run nocturne donne `nightly`. Son [README](https://github.com/docker/metadata-action/blob/96383f45573cb7f253c731d3b3ab81c87ef81934/README.md#latest-tag) montre que `v2.0.8-beta.67` reçoit aussi `latest` de cette façon : `latest` peut donc pointer vers une bêta.',
			'La ligne 28 signe `tag@digest` pour chaque tag. Un tag peut passer plus tard sur une autre image, et la signature reste liée au digest construit.',
			'La ligne 17 fixe une action tierce par SHA de commit complet, avec la version en commentaire. Le workflow fait ça pour chaque action tierce (seule `actions/checkout@v4`, celle de GitHub, utilise un tag), comme quand tu fixes une image par digest.'
		]
	},
	tradeoff: {
		gain: [
			'Un digest désigne exactement une image : les mêmes octets en staging et en prod, et une cible de rollback nette.',
			'Les tags comme `1.4.2` restent lisibles pour les humains et dans les notes de release.',
			'Une registry donne à chaque serveur et chaque cluster un seul endroit d’où tirer, avec du contrôle d’accès.'
		],
		cost: [
			'Les digests sont longs et illisibles, donc il faut de l’outillage (sortie de la CI, Renovate ou Dependabot) pour les mettre à jour.',
			'Fixer une image de base par digest veut dire que tu ne reçois plus les correctifs de sécurité automatiquement. Quelqu’un doit la mettre à jour.',
			'La registry fait maintenant partie de ton chemin de déploiement : si elle tombe ou te limite, plus rien de nouveau ne démarre.'
		]
	},
	task: {
		prompt: 'Tes serveurs de prod lancent `docker pull acme/api:latest && docker compose up -d` depuis une tâche cron. Lundi, deux serveurs sur cinq se comportent différemment des autres. Explique ce qui s’est sans doute passé, et change le déploiement pour que ça ne puisse plus arriver.',
		hint: 'Vers quoi pointait `latest` quand chaque serveur a tiré pour la dernière fois ? Quel nom désignerait toujours la même image ?',
		answer: [
			'Quelqu’un a poussé une nouvelle image sur `latest` entre deux pulls. Les serveurs qui ont tiré avant et après font tourner **des images différentes sous le même nom**.',
			'Arrête de déployer `latest`. La CI tague chaque build avec quelque chose d’unique (le tag Git ou le SHA du commit) et note le **digest** renvoyé par le push.',
			'Le déploiement utilise `acme/api@sha256:...` (ou au moins un tag de version immuable), écrit dans Git, pour que chaque serveur tire la même image.',
			'Pour revenir en arrière, remets le digest précédent et redéploie.'
		],
		steps: [
			{
				title: 'Lis le symptôme',
				questions: [
					{ q: 'Les cinq serveurs ont lancé `docker pull acme/api:latest`. Font-ils donc tourner la même image ?', options: ['Oui : même nom, même image', 'Oui, s’ils ont tiré le même jour', 'Non : `latest` a pu pointer vers des images différentes au moment de chaque pull', 'Non : chaque serveur construit sa propre image'], answer: 2, why: 'Un tag est un nom qui bouge. Le même nom peut désigner des images différentes à des moments différents.' },
					{ q: 'Que tire la tâche cron à chaque passage ?', options: ['Ce vers quoi pointe `latest` à cet instant', 'L’image que le serveur a déjà', 'Le digest le plus récent de la version stable', 'L’image nommée dans Git'], answer: 0, why: 'Tirer un tag, c’est demander à la registry vers quoi pointe le tag maintenant.' },
					{ q: 'Qui peut déplacer `acme/api:latest` ?', options: ['Seulement l’équipe de Docker Hub', 'Personne une fois poussé', 'Seulement le serveur qui le tire', 'Toute personne qui peut pousser dans le dépôt'], answer: 3, why: 'Toute personne qui peut pousser peut faire pointer `latest` vers une nouvelle image.' },
					{ q: 'Qu’est-ce qui te montrerait l’image que chaque serveur fait vraiment tourner ?', options: ['Le nom du tag', 'Le digest de l’image sur chaque serveur', 'Le planning du cron', 'La taille du fichier compose'], answer: 1, why: 'Un digest est un hash du contenu. Deux images avec le même digest ont les mêmes octets.' }
				]
			},
			{
				title: 'Nomme la cause',
				questions: [
					{ q: 'Que s’est-il sans doute passé avant lundi ?', options: ['Deux serveurs ont un disque corrompu', 'La registry a servi une image au hasard', 'Quelqu’un a poussé une nouvelle image sur `latest` entre les pulls des serveurs', 'Le fichier compose a changé sur deux serveurs'], answer: 2, why: 'Les serveurs qui ont tiré avant et après le push font tourner des images différentes sous le même nom.' },
					{ q: 'Que veut dire `latest` sur une registry ?', options: ['Juste un tag, déplacé par qui le pousse', 'La dernière version stable', 'L’image au plus grand numéro de version', 'L’image que font tourner la plupart des serveurs'], answer: 0, why: '`latest` est un tag comme les autres. Il ressemble à une version, mais rien ne le garantit.' },
					{ q: 'Avec les valeurs par défaut de `docker/metadata-action`, quel tag Git peut déplacer `latest` ?', options: ['Seulement un `v1.2.3` stable', 'Seulement un push manuel', 'Seulement les push sur une branche', 'Aussi un tag comme `v2.0.8-beta.67`'], answer: 3, why: 'Son README montre qu’un tag de bêta reçoit aussi `latest`, donc `latest` peut pointer vers une bêta.' },
					{ q: 'Pourquoi est-ce difficile à voir depuis les serveurs ?', options: ['Docker cache le digest', 'Les cinq affichent le même nom d’image', 'Les serveurs n’ont pas de logs', 'Les registries suppriment les vieilles images'], answer: 1, why: 'Chaque serveur dit `acme/api:latest`. Le nom est le même, les octets non.' }
				]
			},
			{
				title: 'Change le déploiement',
				questions: [
					{ q: 'Comment la CI doit-elle taguer chaque build ?', options: ['Avec `latest` seulement', 'Avec la date de la semaine', 'Avec quelque chose d’unique, comme le tag Git ou le SHA du commit', 'Avec le nom du serveur'], answer: 2, why: 'Un tag unique par build empêche deux builds de partager un nom.' },
					{ q: 'Que doit noter la CI après le push ?', options: ['La taille de l’image', 'Le digest de l’image poussée', 'Le planning du cron', 'La liste des serveurs'], answer: 1, why: 'Le digest désigne exactement l’image construite et poussée.' },
					{ q: 'Quelle référence les serveurs doivent-ils déployer ?', options: ['`acme/api:latest`', '`acme/api`, sans tag', '`acme/api:stable`', '`acme/api@sha256:...`, écrit dans Git'], answer: 3, why: 'Un digest ne peut pas être déplacé vers un autre contenu, donc chaque serveur tire la même image.' },
					{ q: 'Quel est le coût du déploiement par digest ?', options: ['Les digests sont longs, il faut de l’outillage pour les mettre à jour', 'Les pulls deviennent plus lents', 'La registry arrête de stocker les tags', 'Tu ne peux plus revenir en arrière'], answer: 0, why: 'Les digests sont illisibles, donc la sortie de la CI, Renovate ou Dependabot les tiennent à jour.' }
				]
			},
			{
				title: 'Prévois le rollback',
				questions: [
					{ q: 'Le nouveau digest est cassé. Comment reviens-tu en arrière ?', options: ['Repousser l’ancienne image sur `latest`', 'Remettre le digest précédent dans Git et redéployer', 'Supprimer la nouvelle image de la registry', 'Attendre la tâche cron'], answer: 1, why: 'Le digest précédent désigne toujours les anciens octets, quoi qu’il soit arrivé aux tags.' },
					{ q: 'Pourquoi l’ancien digest est-il une cible de rollback sûre ?', options: ['Il désigne toujours les mêmes octets', 'Il est plus court qu’un tag', 'Les registries le gardent en haut', 'Il évite le pull'], answer: 0, why: 'Tire par digest et tu obtiens exactement cette image, pour toujours.' },
					{ q: 'Pourquoi garder le digest dans Git plutôt que seulement sur les serveurs ?', options: ['Git sait tirer des images', 'Les serveurs ne peuvent pas stocker de digest', 'Docker l’exige', 'Chaque serveur lit la même valeur, et le changement est relu'], answer: 3, why: 'Une seule valeur dans Git, c’est une seule image partout, et l’historique montre ce qui a tourné quand.' },
					{ q: 'Quelle partie du chemin de déploiement peut encore bloquer un déploiement ?', options: ['Le digest', 'Git', 'La registry, si elle tombe ou te limite', 'Le nom du tag'], answer: 2, why: 'La registry fait partie de ton chemin de déploiement. Si elle est injoignable, plus rien de nouveau ne démarre.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Quelle est la différence entre un tag d’image et un digest d’image ?',
			options: [
				'Un tag est un hash du contenu, un digest est un nom lisible qu’on peut déplacer vers un autre build',
				'Un tag est un nom qui peut bouger, un digest est un hash du contenu qui désigne toujours la même image',
				'C’est la même chose sous deux noms, l’un court et l’autre long',
				'Un digest n’existe que pour les images sur Docker Hub, les autres registres n’ont que des tags'
			],
			answer: 1,
			why: 'Un push peut faire pointer un tag vers une nouvelle image. Un digest (`sha256:...`) est calculé à partir du contenu, donc tirer par digest renvoie toujours la même image.'
		},
		{
			q: 'Tu lances `docker pull nginx` sans tag ni registry. Qu’est-ce que tu récupères ?',
			options: [
				'Une erreur, parce qu’un tag est obligatoire',
				'`docker.io/library/nginx:latest`',
				'La dernière version stable, choisie par Docker',
				'La version déjà installée sur l’hôte'
			],
			answer: 1,
			why: 'Sans registry Docker utilise Docker Hub (`docker.io`), sans namespace il utilise `library`, et sans tag il utilise `latest`.'
		},
		{
			q: 'Pourquoi le workflow de démarrage GitHub signe-t-il `tag@digest` plutôt que le tag seul ?',
			options: [
				'Parce que cosign ne sait pas lire les tags, il lui faut le digest pour trouver l’image',
				'Parce qu’un tag peut pointer vers un autre contenu, alors que le digest désigne exactement l’image construite',
				'Parce que les digests sont plus courts à stocker dans la signature que les noms de tag',
				'Pour éviter de pousser le tag deux fois quand le workflow tourne sur un push et une release'
			],
			answer: 1,
			why: 'Une signature sur un nom qui bouge ne dirait rien de ce vers quoi ce nom pointera demain. Signer le digest la lie à ces octets précis.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Faire tourner une registry sur localhost, déplacer `latest` sous les pieds d’un « serveur », et récupérer l’ancienne image par digest.',
		steps: [
			'Lance une registry locale : `docker run -d --name lab-registry -p 5001:5000 registry:2`.',
			'Construis et pousse la v1 en `1.0` et `latest` : `printf \'FROM busybox:1.36\\nCMD ["echo", "api v1"]\\n\' | docker build -t localhost:5001/api:1.0 - && docker tag localhost:5001/api:1.0 localhost:5001/api:latest && docker push localhost:5001/api:1.0 && docker push localhost:5001/api:latest`. Note le digest : `docker inspect --format \'{{index .RepoDigests 0}}\' localhost:5001/api:1.0`.',
			'Pousse la v2 en `2.0` et sous le même `latest` : `printf \'FROM busybox:1.36\\nCMD ["echo", "api v2"]\\n\' | docker build -t localhost:5001/api:2.0 - && docker tag localhost:5001/api:2.0 localhost:5001/api:latest && docker push localhost:5001/api:2.0 && docker push localhost:5001/api:latest`.',
			'Joue un serveur neuf : `docker rmi localhost:5001/api:1.0 localhost:5001/api:2.0 localhost:5001/api:latest`, puis `docker run --rm localhost:5001/api:latest`, puis `docker run --rm localhost:5001/api@sha256:...` avec le digest de l’étape 2.',
			'Liste les tags et nettoie : `curl -s http://localhost:5001/v2/api/tags/list`, puis `docker rm -f lab-registry`.'
		],
		done: [
			'`docker run --rm localhost:5001/api:latest` affiche `api v2` : le tag a bougé.',
			'`docker run --rm localhost:5001/api@sha256:...` affiche `api v1`, et la sortie du pull montre le même `Digest:` que celui que tu as noté.',
			'`curl` liste `latest`, `1.0` et `2.0` dans le dépôt `api`.'
		],
		solution: [
			'Les deux push de `latest` ont été acceptés : la registry a laissé le tag pointer vers un nouveau contenu sans rien dire.',
			'Un serveur qui a tiré `latest` après l’étape 2 fait tourner la v1, un serveur qui a tiré après l’étape 3 la v2. Même nom, octets différents.',
			'Le digest de l’étape 2 tire toujours la v1 : c’est pour ça que le déploiement fixe `acme/api@sha256:...` et qu’un rollback remet l’ancien digest.'
		]
	},
	recall: {
		q: 'Deux serveurs ont tiré `acme/api:latest` à une semaine d’écart. Pourquoi peuvent-ils faire tourner du code différent, et quelle référence leur fait tirer la même image ?',
		a: 'Un push a déplacé `latest` vers une nouvelle image entre les deux pulls. `acme/api@sha256:...`, le digest, désigne toujours les mêmes octets.'
	},
	sources: [
		{ title: 'Doc Docker, What is a registry?', url: 'https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-registry/' },
		{ title: 'Doc Docker, docker image tag (format des noms d’image)', url: 'https://docs.docker.com/reference/cli/docker/image/tag/' },
		{ title: 'Doc Docker, docker image pull (pull par digest)', url: 'https://docs.docker.com/reference/cli/docker/image/pull/' },
		{ title: 'Doc Docker, fixer les versions des images de base', url: 'https://docs.docker.com/build/building/best-practices/' },
		{ title: 'Doc GitHub, utiliser le Container registry', url: 'https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry' }
	]
};
