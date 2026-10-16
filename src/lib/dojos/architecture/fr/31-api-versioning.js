const REPO = 'https://github.com/kubernetes/kubernetes/blob/8d9877ea2fe0c69580c5d730bccab6dc16a5c841';
const COMMUNITY = 'https://github.com/kubernetes/community/blob/440e496d3a172234d81728df1bfe43849b589adf';
const APISERVER = `${REPO}/staging/src/k8s.io/apiserver/pkg`;
const FLOW = `${REPO}/staging/src/k8s.io/api/flowcontrol/v1beta3`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'api-versioning',
	part: 'Fait pour durer',
	title: 'Conception et versionnement d’API',
	minutes: 10,
	hook: [
		'Ton API de facturation renvoie `amount` sur chaque facture. Un nouveau collègue veut l’appeler `total`, parce que c’est ce que c’est. Tu renommes, tu déploies, et **chaque client qui lit `amount` casse** le soir même : l’appli mobile, l’export comptable, trois scripts de clients que tu n’as jamais vus.',
		'Tu ne peux pas les mettre à jour à leur place. L’appli mobile passe par les stores. Les scripts appartiennent à d’autres entreprises. Donc **n’importe quelle version de client peut tomber sur n’importe quelle version de serveur**, et les deux doivent continuer à marcher.',
		'Les appelants d’une API sont des gens et des programmes que tu ne contrôles pas. Pour changer l’API sans les casser, tu as deux moyens : ajouter des champs au lieu de les modifier, et laisser le client demander ce que le serveur sait faire. Pour retirer une ancienne forme, tu la **déprécies, tu comptes ses appels, puis tu la supprimes**. Kubernetes fait les trois dans le code.'
	],
	terms: [
		{ term: 'Changement rétrocompatible', def: 'Les anciens consommateurs continuent de marcher sans rien changer de leur côté : un nouvel endpoint, un nouveau champ optionnel. Supprimer, renommer ou changer le type d’un champ, ou lui donner un nouveau sens, est un changement cassant.' },
		{ term: 'Tolerant reader (lecteur tolérant)', def: 'Un consommateur qui ne lit que les champs dont il a besoin et ignore le reste. Le fournisseur peut alors ajouter des champs sans demander à personne.' },
		{ term: 'Négociation de capacités', def: 'Le serveur liste ce qu’il sait faire, et le client vérifie la liste avant d’utiliser une fonctionnalité. Un même client marche alors avec des serveurs d’âges différents.' },
		{ term: 'Dépréciation', def: 'Annoncer que quelque chose va disparaître pendant que ça marche encore. Ensuite, compter qui l’appelle encore, et le supprimer à une date donnée (le sunset).' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['client["kubectl ou un contrôleur"] -->|"GET /apis"| api["kube-apiserver"]', 'api --> disc["Discovery : chaque group version servie"]'],
				highlight: ['client', 'api', 'disc'],
				note: 'Avant d’utiliser une ressource, un client peut interroger l’**API Discovery**. Le serveur liste chaque group version et chaque ressource qu’il sert, et le client fait sa négociation de capacités sur cette liste. Un client qui a besoin de `flowcontrol.apiserver.k8s.io/v1` vérifie d’abord qu’elle est là.'
			},
			{
				add: ['oldc["Ancien client : flowcontrol v1beta3"] -->|"GET FlowSchema"| api', 'newc["Nouveau client : flowcontrol v1"] -->|"GET FlowSchema"| api', 'api --> etcd[("etcd : un seul objet stocké")]', 'class etcd ext'],
				highlight: ['oldc', 'newc', 'etcd'],
				note: 'Les deux clients lisent le même objet dans etcd. La doc de Kubernetes : « all the different versions are actually representations of the same persisted data » (toutes les versions sont en fait des représentations des mêmes données persistées). Quand PriorityLevelConfiguration a renommé `assuredConcurrencyShares` en `nominalConcurrencyShares`, le renommage est sorti dans une **nouvelle version** (v1beta3), et v1beta2 a gardé l’ancien nom.'
			},
			{
				add: ['api -->|"Warning: 299, deprecated in v1.29+"| oldc'],
				highlight: ['oldc'],
				note: 'v1beta3 est dépréciée à partir de v1.29, et chaque requête vers elle reçoit un en-tête de réponse standard `Warning`. Le statut et le corps ne changent pas, donc les anciens clients marchent toujours. kubectl affiche l’avertissement sur stderr.'
			},
			{
				add: ['api -->|"apiserver_requested_deprecated_apis = 1"| metrics[("métriques et journal d’audit")]'],
				highlight: ['metrics'],
				note: 'La même requête met aussi à jour une jauge étiquetée avec le groupe, la version, la ressource et `removed_release`, et ajoute `k8s.io/deprecated` à l’événement d’audit. L’admin peut voir **qui appelle encore l’ancienne forme** avant la mise à jour qui la supprime.'
			},
			{
				add: ['api -.->|"v1.32 : plus servie"| gone["routes v1beta3"]'],
				highlight: ['gone'],
				note: 'En v1.32, une release connue à l’avance, le serveur arrête de servir v1beta3. Les objets stockés via cette version restent lisibles via v1. Un admin qui n’était pas prêt peut définir une variable d’environnement pour servir les API supprimées pendant une release de plus.'
			}
		]
	},
	example: {
		title: 'staging/src/k8s.io/apiserver/pkg/endpoints/installer.go : chaque route dépréciée avertit et est comptée',
		repo: 'kubernetes/kubernetes',
		url: `${APISERVER}/endpoints/installer.go#L782-L815`,
		lang: 'go',
		code: `		// accumulate endpoint-level warnings
		var (
			warnings       []string
			deprecated     bool
			removedRelease string
		)

		{
			versionedPtrWithGVK := versionedPtr.DeepCopyObject()
			versionedPtrWithGVK.GetObjectKind().SetGroupVersionKind(fqKindToRegister)
			currentMajor, currentMinor, _ := deprecation.MajorMinor(versioninfo.Get())
			deprecated = deprecation.IsDeprecated(versionedPtrWithGVK, currentMajor, currentMinor)
			if deprecated {
				removedRelease = deprecation.RemovedRelease(versionedPtrWithGVK)
				warnings = append(warnings, deprecation.WarningMessage(versionedPtrWithGVK))
			}
		}

		switch action.Verb {
		case request.MethodGet: // Get a resource.
…
				handler = metrics.InstrumentRouteFunc(action.Verb, group, version, resource, subresource, requestScope, metrics.APIServerComponent, deprecated, removedRelease, handler)
			}
			handler = utilwarning.AddWarningsHandler(handler, warnings)`,
		notes: [
			'Les dates viennent du type. FlowSchema v1beta3 dit seulement `introduced=1.26` et nomme son remplaçant. Un générateur en tire [`APILifecycleDeprecated` 1.29 et `APILifecycleRemoved` 1.32](' + FLOW + '/zz_generated.prerelease-lifecycle.go#L28-L50) : « introduite plus trois mineures », puis « dépréciée plus trois mineures ». Le calendrier de dépréciation est donc du code Go que l’API server lit.',
			'Les lignes 12 à 15 tournent quand une route est installée. `IsDeprecated` compare ces dates avec la version en cours. `WarningMessage` construit un texte comme « is deprecated in v1.29+, unavailable in v1.32+; use flowcontrol.apiserver.k8s.io/v1 FlowSchema ». L’enregistreur l’écrit dans un [en-tête `Warning` avec le code 299](' + APISERVER + '/endpoints/filters/warning.go#L101-L111).',
			'La ligne 22 passe `deprecated` et `removedRelease` à l’enveloppe de métriques. Ensuite, [`MonitorRequest`](' + APISERVER + '/endpoints/metrics/metrics.go#L588-L594) met `apiserver_requested_deprecated_apis` à 1 pour ce groupe, cette version et cette ressource, et ajoute `k8s.io/deprecated` et `k8s.io/removed-release` à l’événement d’audit. La métrique est déclarée STABLE, donc tes tableaux de bord peuvent compter dessus d’une release à l’autre.',
			'La suppression se fait dans un autre fichier. [`ShouldServeForVersion`](' + APISERVER + '/server/deleted_kinds.go#L150-L171) arrête de servir un kind dès que la release en cours atteint sa release de suppression. Un admin peut définir `KUBE_APISERVER_SERVE_REMOVED_APIS_FOR_ONE_RELEASE` pour « kick the can one release down the road » (repousser le problème d’une release), et pas plus loin.',
			'Le [guide des changements d’API](' + COMMUNITY + '/contributors/devel/sig-architecture/api_changes.md?plain=1#L115-L141) définit un changement compatible : « Any API call ... that succeeded before your change must succeed after your change » (tout appel qui réussissait avant ton changement doit réussir après), et « Existing clients need not be aware of your change » (les clients existants n’ont pas à connaître ton changement). Ajouter un champ optionnel passe. En renommer un, non : ça attend une nouvelle version.'
		]
	},
	tradeoff: {
		gain: [
			'Un client écrit pour v1beta3 a continué de marcher pendant trois releases après la sortie de v1, et son propriétaire a pu migrer à son rythme.',
			'La dépréciation atteint l’appelant, pas seulement la doc : un en-tête sur chaque réponse, une métrique et une entrée d’audit pour l’opérateur.',
			'Les changements additifs ne demandent aucune coordination : un nouveau champ optionnel sort avec le serveur seul, et les lecteurs tolérants l’ignorent.'
		],
		cost: [
			'L’API server de Kubernetes convertit les objets entre toutes les versions qu’il sert, et chaque conversion est du code à garder et à tester.',
			'Un mauvais nom de champ reste dans sa version jusqu’à ce que toute cette version soit supprimée.',
			'Chaque vérification de capacité ajoute un `if` dans le client, et quelqu’un doit le tester contre les anciens et les nouveaux serveurs.',
			'Sans compteur par route ni date de suppression publiée, une API peut rester « dépréciée » pour toujours.'
		]
	},
	task: {
		prompt: 'Ton API de facturation (`/v1/invoices`) doit renommer `amount` en `total`, et ajouter un champ optionnel `currency`. Les anciens clients doivent continuer de marcher pendant six mois. Écris le plan en quatre lignes : ce que tu livres maintenant, ce que voit un ancien client, comment tu sais que les anciens clients sont partis, et ce que tu fais le jour de la suppression.',
		hint: 'Sépare d’abord les deux changements. Lequel est additif ? Pour l’autre, reprends la séquence de Kubernetes : nouvelle version à côté de l’ancienne, avertir, mesurer, supprimer.',
		answer: [
			'Maintenant : ajoute `currency` à `/v1` comme champ optionnel, puisqu’il ne casse personne. Livre `/v2/invoices` avec `total`, qui lit les mêmes lignes que `/v1`, pour que les deux soient des vues d’une même facture.',
			'Ancien client : `/v1` répond toujours avec `amount`, plus un en-tête `Deprecation` et un en-tête `Sunset` qui porte la date de suppression. Son code ne change pas et rien ne casse.',
			'Mesurer : compte les appels à `/v1` par clé d’API. Écris aux propriétaires des clés qui l’appellent encore, quelques semaines avant la date, pas le jour même.',
			'Jour de la suppression : quand le compteur est à zéro (ou que la date est passée et que chaque propriétaire a été prévenu), réponds sur `/v1` avec `410 Gone` et un lien vers la note de migration. Garde cette réponse un moment plutôt qu’un simple 404.'
		]
	},
	quiz: [
		{
			q: 'Quel changement sur une version d’API existante est rétrocompatible pour les clients qui l’appellent déjà ?',
			options: [
				'Renommer `amount` en `total`, puisque tous les nouveaux clients préfèrent ce nom',
				'Répondre 404 pour une facture supprimée au lieu de 200 avec `deleted: true`',
				'Ajouter un champ optionnel `currency` que les anciens clients peuvent simplement ignorer',
				'Faire passer `status` d’un nombre à une chaîne comme « paid »'
			],
			answer: 2,
			why: 'Seul l’ajout laisse chaque lecteur existant fonctionner, tant que les lecteurs sont tolérants. Un renommage, un nouveau code de statut pour le même cas ou un nouveau type cassent tous un client qui avait raison hier.'
		},
		{
			q: 'Un client appelle une version d’API Kubernetes dépréciée mais encore servie. Qu’est-ce qui change dans la réponse ?',
			options: [
				'Le statut devient 299, et le corps est le même objet',
				'Un en-tête `Warning` est ajouté. Le statut et le corps restent les mêmes',
				'Le serveur répond avec la version de remplacement de l’objet',
				'Rien jusqu’à la release de suppression, où il commence à répondre 410'
			],
			answer: 1,
			why: 'L’avertissement voyage dans un en-tête standard `Warning` (299 est le warn-code de l’en-tête, pas le statut HTTP). Le statut et le corps ne changent pas, donc un ancien client continue de marcher pendant qu’une personne qui lit la sortie de kubectl est prévenue.'
		},
		{
			q: 'Avant de passer à la release qui arrête de servir une version d’API, que doit vérifier un admin de cluster ?',
			options: [
				'Que les types Go portent un tag `deprecated` dans le code source',
				'Que les notes de release annonçaient la version comme dépréciée depuis un moment',
				'Que la nouvelle version renvoie exactement les mêmes champs que l’ancienne',
				'Que `apiserver_requested_deprecated_apis` ne montre aucun appel pour cette version'
			],
			answer: 3,
			why: 'Un tag et une note de release disent ce que le projet a l’intention de faire. Seule la métrique (ou le journal d’audit) dit si quelque chose dans ce cluster en dépend encore.'
		}
	],
	recall: {
		q: 'Quelles sont les trois étapes que suit Kubernetes pour retirer FlowSchema v1beta3, et que produit chacune ?',
		a: 'Déprécier : à partir de v1.29, chaque appel reçoit un en-tête `Warning` avec le code 299. Mesurer : la jauge `apiserver_requested_deprecated_apis` et une entrée d’audit `k8s.io/deprecated`. Supprimer : v1.32 ne sert plus v1beta3.'
	},
	sources: [
		{ title: 'Kubernetes, flowcontrol v1beta3 types.go', url: `${FLOW}/types.go#L120-L129` },
		{ title: 'Kubernetes, apiserver deprecation.go (IsDeprecated, WarningMessage)', url: `${APISERVER}/endpoints/deprecation/deprecation.go#L61-L134` },
		{ title: 'Kubernetes, apiserver metrics.go (STABLE metric)', url: `${APISERVER}/endpoints/metrics/metrics.go#L64-L71` },
		{ title: 'Kubernetes, apiserver deleted_kinds.go (serve removed APIs for one release)', url: `${APISERVER}/server/deleted_kinds.go#L53-L56` },
		{ title: 'Kubernetes, Deprecation Policy', url: 'https://kubernetes.io/docs/reference/using-api/deprecation-policy/' },
		{ title: 'Kubernetes, Deprecated API Migration Guide', url: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/' },
		{ title: 'Kubernetes blog, Warning: Helpful Warnings Ahead', url: 'https://kubernetes.io/blog/2020/09/03/warnings/' },
		{ title: 'Martin Fowler, TolerantReader', url: 'https://martinfowler.com/bliki/TolerantReader.html' },
		{ title: 'RFC 9745, The Deprecation HTTP Response Header Field (with Sunset, RFC 8594)', url: 'https://datatracker.ietf.org/doc/html/rfc9745' }
	]
};
