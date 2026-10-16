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
