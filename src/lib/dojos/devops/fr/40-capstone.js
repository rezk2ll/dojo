const SW = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'En production',
	title: 'Projet final : du git push à l’alerte',
	minutes: 10,
	hook: [
		'Il y a quarante jours, tu déployais en ssh et à la main. Dans ce kata, tu câbles toute la chaîne pour une petite appli web : **un git push finit par tourner dans Kubernetes**, et si ça casse, quelqu’un est appelé.',
		'Chaque outil de la chaîne vient d’un chapitre précédent. Pour chaque maillon, tu notes le choix que tu fais et pourquoi.'
	],
	terms: [
		{ term: 'Repo de l’appli', def: 'Contient le code, le Dockerfile et le workflow CI. Un push ici construit une image.' },
		{ term: 'Repo de config', def: 'Contient les values Helm par environnement. Argo CD le surveille, et chaque commit ici déclenche un déploiement.' },
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
				note: 'La CI lance les tests, construit l’image une seule fois et la pousse avec un **tag immuable** tiré du commit. Si un test échoue, la CI s’arrête avant le build, et rien n’arrive dans la registry.'
			},
			{
				add: [
					'ci -->|"commit du nouveau tag"| cfg[("Repo de config : values Helm")]'
				],
				highlight: ['cfg'],
				note: 'La CI **ne déploie pas**. Elle commite le nouveau tag dans le fichier de values de staging, dans le repo de config. Ce commit demande le déploiement : un collègue peut le relire, et `git revert` l’annule.'
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
				note: 'Prometheus surveille les **symptômes**. Si la nouvelle version brûle l’error budget, l’astreinte est appelée et fait un rollback avec `git revert` sur le repo de config. Argo CD remet alors l’ancien tag dans le cluster.'
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
			'Voici le modèle officiel de GitHub pour « construire une image et la pousser dans une registry ». Aux lignes 3 et 5, `$cron-daily` et `$default-branch` sont des variables que GitHub remplit quand tu choisis le modèle.',
			'La ligne 32 met `push` à false sur les pull requests : une PR construit l’image pour vérifier que le build passe, et ne la publie jamais.',
			'La ligne 33 prend ses tags dans metadata-action (ligne 21). Sans entrée `tags`, metadata-action utilise ses [tags par défaut](https://github.com/docker/metadata-action/blob/96383f45573cb7f253c731d3b3ab81c87ef81934/README.md#L415-L423) : un push sur `main` reçoit le tag `main`, qui **bouge** à chaque push. Pour du GitOps, ajoute `tags: type=sha` pour obtenir un tag immuable `sha-ad132f5`.',
			'Les lignes 21 et 29 épinglent chaque action tierce sur un **SHA de commit complet**, pour la même raison que tu épingles les digests d’images : un tag sur le repo de quelqu’un d’autre peut être déplacé.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque déploiement est un commit dans le repo de config : qui, quoi, quand, et un rollback en une ligne.',
			'L’image est construite une fois puis promue, donc la production fait tourner exactement les octets que staging a testés.',
			'La CI ne détient jamais d’accès au cluster, et la première action de la personne appelée est un `git revert`.'
		],
		cost: [
			'Deux repos et un bot qui commite dans l’un d’eux remplacent une seule étape `helm upgrade` dans la CI.',
			'Un déploiement prend maintenant un run CI plus une sync Argo CD, soit plusieurs minutes.',
			'L’alerte appelle selon l’objectif de SLO que tu choisis, donc un mauvais objectif appelle trop souvent ou trop tard. Choisis le chiffre avec la personne qui porte le produit.'
		]
	},
	task: {
		prompt: 'Le kata. Prends une petite appli web (n’importe quel langage, un port HTTP, une route `/healthz`) et livre-la de bout en bout. 1. Dockerfile. 2. Une CI qui teste, construit et pousse une image. 3. Un chart Helm. 4. Une Application Argo CD. 5. Une alerte. Note chaque choix que tu fais, et pourquoi.',
		hint: 'Descends la chaîne et vérifie chaque maillon avant le suivant : l’image tourne-t-elle en local, le chart se rend-il avec `helm template`, Argo CD affiche-t-il Synced, l’alerte sonne-t-elle quand tu casses l’appli exprès ?',
		answer: [
			'Image : Dockerfile multi-stage, petite image de base, utilisateur non root, un `.dockerignore`. Taguée `sha-<commit>` dans la registry, jamais seulement `latest`.',
			'CI : sur les pull requests, lance les tests et construis sans pousser. Sur `main`, construis, pousse, puis commite le nouveau tag dans `values-staging.yaml` du repo de config.',
			'Chart : Deployment à 2 replicas, requests et limits, readiness probe sur `/healthz`, un Service et un Ingress. Un PodDisruptionBudget pour que les drains de nœuds gardent un pod debout.',
			'GitOps : une Application Argo CD par environnement, sync automatique, prune et self-heal activés. La promotion en production est une pull request qui recopie le tag.',
			'Alerte : appelle quand le taux de 5xx brûle l’error budget sur une fenêtre longue et une courte, avec un `runbook_url` dont la première étape est « revert du dernier commit de config ».',
			'Casse-la exprès : déploie une version qui répond 500, regarde l’alerte sonner, fais le rollback avec `git revert`, et écris un court postmortem sans reproche de ton propre exercice.'
		],
		steps: [
			{
				title: 'Construis l’image',
				questions: [
					{ q: 'Quelle forme de Dockerfile convient au kata ?', options: ['Un seul stage avec toute la chaîne de build, lancé en root', 'Multi-stage, petite base, utilisateur non root, avec un `.dockerignore`', 'Une image de base que tu mets à jour à la main dans le conteneur', 'N’importe laquelle, Kubernetes la reconstruit'], answer: 1, why: 'Les outils de build restent dans le stage builder, l’image finale est petite, et elle ne tourne pas en root.' },
					{ q: 'Quel tag reçoit la registry pour un push sur `main` ?', options: ['`latest` seulement', '`main` seulement', '`prod`', '`sha-<commit>`, un tag immuable'], answer: 3, why: 'Un tag SHA ne bouge jamais, donc la config désigne exactement une image à lancer ou vers laquelle revenir.' },
					{ q: 'Pourquoi un tag `main` seul pose-t-il problème en GitOps ?', options: ['Il bouge à chaque push, donc le même fichier de values peut vouloir dire deux déploiements', 'Les registries refusent les noms de branche', 'Kubernetes garde un tag de branche en cache et ne tire jamais une image plus récente', 'Il grossit l’image'], answer: 0, why: 'Le tag par défaut de metadata-action pour `main` bouge. Ajoute `tags: type=sha` pour un tag immuable.' },
					{ q: 'Comment vérifies-tu ce maillon avant le suivant ?', options: ['Attendre qu’Argo CD synchronise', 'Relire le Dockerfile', 'Lancer l’image en local et appeler `/healthz`', 'La pousser et espérer'], answer: 2, why: 'Vérifie chaque maillon avant le suivant : l’image tourne-t-elle en local ?' }
				]
			},
			{
				title: 'Branche la CI',
				questions: [
					{ q: 'Que fait la CI sur une pull request ?', options: ['Elle teste et construit, sans pousser l’image', 'Elle construit, pousse et déploie en production', 'Rien avant le merge', 'Elle pousse l’image taguée `pr`'], answer: 0, why: 'Une PR vérifie que l’image se construit, et ne la publie jamais.' },
					{ q: 'Sur `main`, après le build et le push, quelle est la dernière étape de la CI ?', options: ['`helm upgrade` sur staging avec le nouveau tag, via un kubeconfig de staging','`kubectl apply` du chart', 'Commiter le nouveau tag dans `values-staging.yaml` du repo de config', 'Appeler l’astreinte pour dire qu’un déploiement a eu lieu'], answer: 2, why: 'La CI ne déploie pas. Son commit demande le déploiement, et un collègue peut le relire ou le revert.' },
					{ q: 'Un test échoue. Qu’est-ce qui arrive dans la registry ?', options: ['L’image, taguée `broken`', 'Rien : la CI s’arrête avant le build', 'La moitié des couches', 'L’image, mais pas le tag'], answer: 1, why: 'Les tests passent d’abord. Un échec arrête la CI avant tout build ou push.' },
					{ q: 'Pourquoi épingler chaque action tierce sur un SHA de commit complet ?', options: ['Les SHA tournent plus vite', 'GitHub l’exige', 'Ça cache l’action aux autres', 'Un tag sur le repo de quelqu’un d’autre peut être déplacé'], answer: 3, why: 'Même raison que pour épingler les digests d’image : un SHA désigne toujours le même code.' }
				]
			},
			{
				title: 'Package et déploie',
				questions: [
					{ q: 'Que met-on dans le template de Deployment du chart ?', options: ['2 replicas, requests et limits, une readiness probe sur `/healthz`', '1 replica, aucune probe, et tous les réglages écrits en dur dans le template', 'Un tag `latest` en dur', 'Le kubeconfig cluster-admin'], answer: 0, why: 'Deux copies, des ressources que le scheduler peut compter, et du trafic seulement quand l’appli répond.' },
					{ q: 'Quel objet garde un pod debout pendant le drain d’un nœud ?', options: ['Un ResourceQuota', 'Un HorizontalPodAutoscaler', 'Un PodDisruptionBudget', 'Un Ingress'], answer: 2, why: 'Un PDB limite combien de pods un drain peut évincer à la fois.' },
					{ q: 'Comment est réglé le côté Argo CD ?', options: ['Une Application pour tous les environnements, sync manuelle', 'Une Application par environnement, sync automatique, prune et self-heal activés', 'Pas d’Application : la CI lance `kubectl`', 'Une Application par Pod'], answer: 1, why: 'Chaque environnement suit son propre fichier de values, et Git gagne sur les modifications à la main.' },
					{ q: 'Comment une release arrive-t-elle en production ?', options: ['Reconstruire l’image avec les réglages de production', 'Repousser l’image taguée `prod`', 'Copier les pods de staging', 'Une pull request qui recopie le tag testé dans les values de production'], answer: 3, why: 'La promotion déplace la même image. Un rebuild pourrait tirer des dépendances différentes.' }
				]
			},
			{
				title: 'Alerte et exercice',
				questions: [
					{ q: 'Sur quoi l’unique alerte doit-elle appeler ?', options: ['CPU au-dessus de 80 %', 'Le taux de 5xx qui brûle l’error budget, sur une fenêtre longue et une courte', 'Chaque redémarrage de pod, puisque chaque redémarrage veut dire une erreur pour un utilisateur', 'Disque au-dessus de 85 %'], answer: 1, why: 'Appelle sur un symptôme que ressentent les utilisateurs, et sur la vitesse à laquelle le budget brûle.' },
					{ q: 'Quelle est la première étape de son runbook ?', options: ['Revert du dernier commit de config', 'Se connecter en SSH à un nœud', 'Supprimer les pods', 'Reconstruire depuis les sources'], answer: 0, why: 'Le dernier commit de config est la cause probable, et le revert est une seule commande sûre.' },
					{ q: 'Avec le self-heal activé, pourquoi ne pas revenir en arrière avec `kubectl rollout undo` ?', options: ['Il ne ramène que le ReplicaSet, et le Service garde les nouveaux endpoints', 'Il faut être root', 'Argo CD l’annule, parce que Git désigne toujours le mauvais tag', 'Ça supprime le Service'], answer: 2, why: 'Change l’état voulu avec `git revert`, et Argo CD resynchronise l’ancien tag.' },
					{ q: 'Qu’est-ce qui clôt l’exercice ?', options: ['Supprimer l’alerte pour qu’elle se taise', 'Désactiver le self-heal', 'Un long rapport qui nomme le coupable', 'Un court postmortem sans reproche de ton propre exercice'], answer: 3, why: 'Note ce qui s’est passé et ce qu’il faut changer, sans reproche. C’est un entraînement pour le vrai.' }
				]
			}
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
			why: 'Un tag de branche pointe vers une nouvelle image à chaque push, donc le même fichier de values peut vouloir dire deux déploiements différents. Avec un tag immuable, le fichier de values dans Git désigne exactement l’image qui tourne.'
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
			why: 'La promotion recopie le tag de l’image que staging a testée. Une reconstruction peut tirer d’autres dépendances, et la production ferait tourner des octets que personne n’a testés.'
		}
	],
	recall: {
		q: 'Dans cette chaîne, que commite la CI après un push sur `main`, et comment l’astreinte annule-t-elle une mauvaise release ?',
		a: 'La CI commite le tag d’image immuable, comme `sha-ad132f5`, dans le fichier de values de staging du repo de config, et Argo CD le synchronise. Pour annuler, l’astreinte lance `git revert` sur ce commit.'
	},
	sources: [
		{ title: 'Doc GitHub, Publishing Docker images', url: 'https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images' },
		{ title: 'Doc Helm', url: 'https://helm.sh/docs/' },
		{ title: 'Doc Argo CD, Getting started', url: 'https://argo-cd.readthedocs.io/en/stable/getting_started/' },
		{ title: 'Workbook SRE de Google, Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
		{ title: 'DORA', url: 'https://dora.dev/' }
	]
};
