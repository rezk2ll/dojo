const SW = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'En production',
	title: 'Projet final : du git push à l’alerte',
	minutes: 10,
	hook: [
		'Il y a quarante jours, tu déployais en ssh et à la main. Aujourd’hui, tu câbles toute la chaîne pour une petite appli web : **un git push finit par tourner dans Kubernetes**, et si ça casse, quelqu’un est appelé.',
		'Pas de nouvel outil aujourd’hui. Seulement des choix, et les raisons derrière.'
	],
	terms: [
		{ term: 'Repo de l’appli', def: 'Contient le code, le Dockerfile et le workflow CI. Un push ici construit une image.' },
		{ term: 'Repo de config', def: 'Contient les values Helm par environnement. Argo CD le surveille. Un commit ici, c’est un déploiement.' },
		{ term: 'Tag immuable', def: 'Un tag d’image qui ne bouge jamais, comme `sha-ad132f5`. Contrairement à `main` ou `latest`, il désigne toujours la même image.' },
		{ term: 'Promotion', def: 'Faire passer la même image de staging à la production en changeant une valeur dans Git, jamais en la reconstruisant.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'push["git push sur main"] --> ci["CI : tests, build"]',
					'ci -->|"image sha-ad132f5"| reg[("Registry")]',
					'class reg ext'
				],
				highlight: ['push', 'ci', 'reg'],
				note: 'La CI lance les tests, construit l’image une seule fois et la pousse avec un **tag immuable** tiré du commit. Fail fast : un test rouge n’atteint jamais la registry.'
			},
			{
				add: [
					'ci -->|"commit du nouveau tag"| cfg[("Repo de config : values Helm")]'
				],
				highlight: ['cfg'],
				note: 'La CI **ne déploie pas**. Elle commite le nouveau tag dans le fichier de values de staging, dans le repo de config. Ce commit est la demande de déploiement, relue et annulable.'
			},
			{
				add: [
					'subgraph k8s["Cluster Kubernetes"]',
					'argo["Argo CD"]',
					'app["Appli : Deployment, Service, Ingress"]',
					'end',
					'argo -->|"tire"| cfg',
					'argo -->|"helm template, sync"| app',
					'app -.->|"tire l’image"| reg'
				],
				highlight: ['argo', 'app'],
				note: 'Argo CD voit le commit, rend le **chart Helm** avec les nouvelles values et synchronise. Le Deployment fait un rolling update, freiné par sa readiness probe.'
			},
			{
				add: [
					'prom["Prometheus : taux d’erreur, latence"]',
					'oncall["Astreinte"]',
					'prom -->|"scrape"| app',
					'prom -->|"alerte burn rate"| oncall',
					'class oncall ext'
				],
				highlight: ['prom', 'oncall'],
				note: 'Prometheus surveille les **symptômes**. Si la nouvelle version brûle l’error budget, l’astreinte est appelée et fait un rollback avec `git revert` sur le repo de config. Argo CD fait le reste.'
			}
		]
	},
	example: {
		title: 'ci/docker-publish.yml',
		repo: 'actions/starter-workflows',
		url: `${SW}/ci/docker-publish.yml#L8-L83`,
		lang: 'yaml',
		code: `on:
  schedule:
    - cron: $cron-daily
  push:
    branches: [ $default-branch ]
    # Publish semver tags as releases.
    tags: [ 'v*.*.*' ]
  pull_request:
    branches: [ $default-branch ]

env:
  # Use docker.io for Docker Hub if empty
  REGISTRY: ghcr.io
  # github.repository as <account>/<repo>
  IMAGE_NAME: \${{ github.repository }}
…
      # Extract metadata (tags, labels) for Docker
      # https://github.com/docker/metadata-action
      - name: Extract Docker metadata
        id: meta
        uses: docker/metadata-action@96383f45573cb7f253c731d3b3ab81c87ef81934 # v5.0.0
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}

      # Build and push Docker image with Buildx (don't push on PR)
      # https://github.com/docker/build-push-action
      - name: Build and push Docker image
        id: build-and-push
        uses: docker/build-push-action@0565240e2d4ab88bba5387d719585280857ece09 # v5.0.0
        with:
          context: .
          push: \${{ github.event_name != 'pull_request' }}
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max`,
		notes: [
			'Le modèle officiel de GitHub pour « construire une image et la pousser dans une registry ». `$default-branch` et `$cron-daily` sont des variables que GitHub remplit quand tu choisis le modèle.',
			'`push` vaut false sur les pull requests : une PR construit l’image pour prouver que le build passe, mais ne la publie jamais.',
			'Sans entrée `tags`, metadata-action utilise ses [tags par défaut](https://github.com/docker/metadata-action/blob/96383f45573cb7f253c731d3b3ab81c87ef81934/README.md#L415-L423) : un push sur `main` reçoit le tag `main`, qui **bouge** à chaque push. Pour du GitOps, ajoute `tags: type=sha` pour obtenir un tag immuable `sha-ad132f5`.',
			'Chaque action tierce est épinglée sur un **SHA de commit complet**, pour la même raison que tu épingles les digests d’images : un tag sur le repo de quelqu’un d’autre peut être déplacé.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque déploiement est un commit dans le repo de config : qui, quoi, quand, et un rollback en une ligne.',
			'L’image est construite une fois puis promue, donc la production fait tourner exactement les octets que staging a testés.',
			'La CI ne détient jamais d’accès au cluster, et la personne appelée a un premier geste clair : revert.'
		],
		cost: [
			'Deux repos et un bot qui commite dans l’un d’eux. Plus de pièces mobiles qu’un `helm upgrade` depuis la CI.',
			'Un déploiement prend maintenant un run CI plus une sync Argo CD. Des minutes, pas des secondes.',
			'L’alerte ne vaut que le SLO qui est derrière. Choisis le chiffre avec la personne qui porte le produit.'
		]
	},
	task: {
		prompt: 'Le kata. Prends une petite appli web (n’importe quel langage, un port HTTP, une route `/healthz`) et livre-la de bout en bout. 1. Dockerfile. 2. Une CI qui teste, construit et pousse une image. 3. Un chart Helm. 4. Une Application Argo CD. 5. Une alerte. Note chaque choix que tu fais, et pourquoi.',
		hint: 'Descends la chaîne et vérifie chaque maillon avant le suivant : l’image tourne-t-elle en local, le chart se rend-il avec `helm template`, Argo CD affiche-t-il Synced, l’alerte sonne-t-elle quand tu casses l’appli exprès ?',
		answer: [
			'**Image** : Dockerfile multi-stage, petite image de base, utilisateur non root, un `.dockerignore`. Taguée `sha-<commit>` dans la registry, jamais seulement `latest`.',
			'**CI** : sur les pull requests, lance les tests et construis sans pousser. Sur `main`, construis, pousse, puis commite le nouveau tag dans `values-staging.yaml` du repo de config.',
			'**Chart** : Deployment à 2 replicas, requests et limits, readiness probe sur `/healthz`, un Service et un Ingress. Un PodDisruptionBudget pour que les drains de nœuds gardent un pod debout.',
			'**GitOps** : une Application Argo CD par environnement, sync automatique, prune et self-heal activés. La promotion en production est une pull request qui recopie le tag.',
			'**Alerte** : appelle quand le taux de 5xx brûle l’error budget sur une fenêtre longue et une courte, avec un `runbook_url` dont la première étape est « revert du dernier commit de config ».',
			'**Casse-la exprès** : déploie une version qui répond 500, regarde l’alerte sonner, fais le rollback avec `git revert`, et écris un court postmortem sans reproche de ton propre exercice.'
		]
	},
	quiz: [
		{
			q: 'Dans une pipeline GitOps, pourquoi la CI doit-elle taguer les images avec le SHA du commit plutôt que seulement avec `main` ou `latest` ?',
			options: [
				'Parce que les registries refusent le tag `latest` poussé par la CI',
				'Parce qu’un tag SHA ne bouge jamais, donc la config désigne une image précise à restaurer',
				'Parce que les tags SHA laissent le registry stocker des images plus petites',
				'Parce que Kubernetes ne sait pas tirer des tags nommés comme une branche'
			],
			answer: 1,
			why: 'Un tag de branche pointe vers une nouvelle image à chaque push, donc le même fichier de values peut vouloir dire deux déploiements différents. Un tag immuable fait de Git un vrai registre de ce qui tourne.'
		},
		{
			q: 'La nouvelle version est en ligne et l’alerte d’error budget sonne. Avec le montage de ce kata, quel est le rollback sûr le plus rapide ?',
			options: [
				'`kubectl rollout undo` sur le Deployment, puis surveiller les pods',
				'`git revert` du commit de tag dans le repo de config, Argo CD synchronise',
				'Reconstruire l’ancienne version depuis les sources et la pousser',
				'Supprimer les pods pour que Kubernetes les redémarre dans un état propre'
			],
			answer: 1,
			why: 'Avec le self-heal actif, un rollback via `kubectl` est annulé, parce que Git désigne toujours le mauvais tag. Annuler le commit change l’état voulu, et Argo CD l’applique.'
		},
		{
			q: 'Staging est validé. Comment la même release doit-elle arriver en production ?',
			options: [
				'Reconstruire l’image depuis le même commit avec les réglages de production',
				'Mettre dans les values de production le tag qu’a fait tourner staging, via une pull request',
				'Copier les pods qui tournent du cluster de staging vers la production',
				'Pousser l’image à nouveau avec le tag `prod` et laisser la production la tirer'
			],
			answer: 1,
			why: 'On construit une fois, on promeut la même image. Une reconstruction peut tirer d’autres dépendances, et la production ferait tourner des octets que personne n’a testés.'
		}
	],
	takeaway: 'Un push construit une image immuable, un commit dans Git la déploie, Argo CD l’applique, et une alerte sur les symptômes dit à un humain quand faire un revert. Chaque étape est un choix que tu sais expliquer.',
	sources: [
		{ title: 'Doc GitHub, Publishing Docker images', url: 'https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images' },
		{ title: 'Doc Helm', url: 'https://helm.sh/docs/' },
		{ title: 'Doc Argo CD, Getting started', url: 'https://argo-cd.readthedocs.io/en/stable/getting_started/' },
		{ title: 'Workbook SRE de Google, Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
		{ title: 'DORA', url: 'https://dora.dev/' }
	]
};
