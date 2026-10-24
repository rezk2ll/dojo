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
					{ q: 'Tu pars du starter workflow. Quel changement donne un tag immuable à chaque push sur `main` ?', options: ['Rien : les tags par défaut ne bougent déjà jamais', 'Mettre `push: true` sur les pull requests', 'Renommer la branche en `latest`', 'Ajouter `tags: type=sha` à metadata-action'], answer: 3, why: 'Sans entrée `tags`, metadata-action tague un push sur `main` en `main`. `type=sha` ajoute un tag comme `sha-ad132f5`.' },
					{ q: 'Avec `tags: type=sha`, deux commits sont poussés sur `main` à dix minutes d’écart. Que contient la registry ?', options: ['Deux images, un tag `sha-` pour chaque commit', 'Une image, dont le tag a bougé vers le second commit', 'Une image, car le second push écrase le premier', 'Deux images, toutes deux taguées `main` seulement'], answer: 0, why: 'Chaque tag vient de son commit, donc chaque build garde son propre nom. La première image reste là pour revenir en arrière.' },
					{ q: 'Comment vérifies-tu ce maillon avant le suivant ?', options: ['Attendre qu’Argo CD synchronise', 'Relire le Dockerfile', 'Lancer l’image en local et appeler `/healthz`', 'La pousser et espérer'], answer: 2, why: 'Vérifie chaque maillon avant le suivant : l’image tourne-t-elle en local ?' }
				]
			},
			{
				title: 'Branche la CI',
				questions: [
					{ q: 'Que fait la CI sur une pull request ?', options: ['Elle teste et construit, sans pousser l’image', 'Elle construit, pousse et déploie en production', 'Rien avant le merge', 'Elle pousse l’image taguée `pr`'], answer: 0, why: 'Une PR vérifie que l’image se construit, et ne la publie jamais.' },
					{ q: 'Le commit de tag de la CI arrive dans le repo de config. Que se passe-t-il ensuite, sans que personne lance de commande ?', options: ['La CI lance `helm upgrade` sur staging', 'La registry pousse l’image vers les nœuds', 'Argo CD voit le commit, rend le chart avec les nouvelles values et synchronise staging', 'Rien tant que personne ne clique sur déployer'], answer: 2, why: 'Argo CD surveille le repo de config. Le Deployment fait ensuite un rolling update, filtré par sa readiness probe.' },
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
					{ q: 'Staging a fait tourner `sha-ad132f5` pendant une journée. Pourquoi ne pas reconstruire l’image depuis le même commit pour la production ?', options: ['Les registries refusent une seconde image pour un même commit', 'Argo CD ne déploie que des images vues en staging', 'Un rebuild prend plus de temps qu’une synchro', 'Un rebuild pourrait tirer des dépendances différentes, donc la production ne ferait pas tourner les octets testés en staging'], answer: 3, why: 'Construire une fois et promouvoir le même tag garantit que la production fait tourner exactement ce que staging a testé.' }
				]
			},
			{
				title: 'Alerte et exercice',
				questions: [
					{ q: 'Sur quoi l’unique alerte doit-elle appeler ?', options: ['CPU au-dessus de 80 %', 'Le taux de 5xx qui brûle l’error budget, sur une fenêtre longue et une courte', 'Chaque redémarrage de pod, puisque chaque redémarrage veut dire une erreur pour un utilisateur', 'Disque au-dessus de 85 %'], answer: 1, why: 'Appelle sur un symptôme que ressentent les utilisateurs, et sur la vitesse à laquelle le budget brûle.' },
					{ q: 'Pendant l’exercice, l’astreinte a fait le revert du commit de tag. Qu’est-ce qui remet l’ancienne image dans le cluster ?', options: ['Argo CD synchronise l’ancien tag depuis le repo de config', 'La CI reconstruit l’ancienne image', 'Le kubelet remarque le revert dans Git', 'L’astreinte lance `helm rollback` à la main'], answer: 0, why: 'Le revert change l’état désiré dans Git. Argo CD le récupère et le Deployment revient à l’ancien tag.' },
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
	lab: {
		minutes: 45,
		goal: 'Faire tourner toute la chaîne sur ta machine avec Docker et Git : construire une fois, déployer par un commit, repérer une mauvaise release, revenir en arrière avec `git revert`.',
		steps: [
			'Prépare deux repos et un registry : `mkdir -p ~/capstone-lab/{app,config} && git -C ~/capstone-lab/app init -b main && git -C ~/capstone-lab/config init -b main`, puis `docker run -d --rm --name capstone-registry -p 5001:5000 registry:2`.',
			'Dans `app`, écris `server.py` (une appli `http.server` sur le port 8000 qui répond 200 et `hello`), un `Dockerfile` (`FROM python:3.12-alpine`, copie le fichier, `USER nobody`, lance-le) et `ci.sh`. `ci.sh` vérifie `python3 -m py_compile server.py`, construit et pousse `localhost:5001/web:sha-<commit>`, et commite `tag: sha-<commit>` dans `../config/values-staging.yaml`. Commite l’appli, puis lance `bash ci.sh`.',
			'Dans `config`, écris `deploy.sh`, qui joue le rôle d’Argo CD : il lit le tag dans `values-staging.yaml` et remplace le conteneur `capstone-web` par un conteneur de cette image, sur `-p 8081:8000`. Écris `alert.sh`, qui joue le rôle de Prometheus : il affiche `PAGE` quand `localhost:8081/` ne répond pas 200. Lance `bash deploy.sh`, puis `bash alert.sh`.',
			'Livre une mauvaise release : dans `server.py`, renvoie 500 sur tous les chemins sauf `/healthz`. Commite, lance `bash ci.sh` dans `app`, puis `bash deploy.sh` et `bash alert.sh` dans `config`.',
			'Reviens en arrière dans `config` : `git revert --no-edit HEAD`, puis `bash deploy.sh` et `bash alert.sh`. Écris un postmortem sans blâme de trois lignes sur l’exercice. Nettoie avec `docker rm -f capstone-web && docker stop capstone-registry && rm -rf ~/capstone-lab`.'
		],
		done: [
			'`curl -s localhost:5001/v2/web/tags/list` liste deux tags `sha-`, un par commit de l’appli.',
			'Après la mauvaise release, `curl -s -o /dev/null -w "%{http_code}" localhost:8081/healthz` affiche toujours 200, mais `alert.sh` affiche `PAGE`.',
			'Après le revert, `values-staging.yaml` nomme de nouveau le premier tag et `alert.sh` affiche `ok`, sans reconstruction.',
			'`git log --oneline` dans `config` montre un commit par déploiement, avec le revert au-dessus.',
			'`docker exec capstone-web id` affiche `uid=65534(nobody)`.'
		],
		solution: [
			'`server.py` : un `BaseHTTPRequestHandler` dont le `do_GET` met `code = 200`, puis appelle `self.send_response(code)`, `self.end_headers()` et `self.wfile.write(b"hello\\n")`. Sers-le avec `HTTPServer(("", 8000), Handler).serve_forever()`. La mauvaise release, c’est `code = 200 if self.path == "/healthz" else 500`.',
			'`ci.sh` : `set -euo pipefail`, `python3 -m py_compile server.py`, `tag=sha-$(git rev-parse --short HEAD)`, `docker build -t localhost:5001/web:$tag .`, `docker push localhost:5001/web:$tag`, puis `cd ../config && echo "tag: $tag" > values-staging.yaml && git add values-staging.yaml && git commit -m "staging: $tag"`.',
			'`deploy.sh` : `set -euo pipefail`, `tag=$(sed -n "s/^tag: //p" values-staging.yaml)`, `docker rm -f capstone-web 2>/dev/null || true`, puis `docker run -d --name capstone-web -p 8081:8000 localhost:5001/web:$tag`. La CI ne le lance jamais : le déploiement suit le repo de config.',
			'`alert.sh` : `code=$(curl -s -o /dev/null -w "%{http_code}" localhost:8081/)`, puis `[ "$code" = 200 ] && echo ok || echo "PAGE: / returned $code"`. Il surveille ce que reçoivent les utilisateurs. `/healthz` reste vert dans la mauvaise release, donc une sonde seule n’aurait pas déclenché d’alerte.',
			'Le retour arrière ne reconstruit rien : l’ancienne image est toujours dans le registry sous son tag immuable, et le revert y fait de nouveau pointer la config. Sur la vraie stack, `deploy.sh` est une Application Argo CD avec self-heal et `alert.sh` est une règle de burn rate dans Prometheus.'
		]
	},
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
