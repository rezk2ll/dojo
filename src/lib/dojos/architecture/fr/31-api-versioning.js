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
		'Une API est un **contrat avec des gens que tu ne contrôles pas**. Aujourd’hui : ce qui compte comme un changement cassant, deux façons d’évoluer sans casser (ajouter au lieu de modifier, et laisser le client demander ce que le serveur sait faire), et comment retirer une ancienne forme : **déprécier, mesurer, puis supprimer**. Kubernetes fait les trois dans le code.'
	],
	terms: [
		{ term: 'Contrat', def: 'Tout ce sur quoi un consommateur peut compter : chemins, noms et types des champs, codes de statut, forme des erreurs, et ce que chacun veut dire. Pas seulement ce que tu as écrit : ce dont les appelants dépendent vraiment.' },
		{ term: 'Changement rétrocompatible', def: 'Les anciens consommateurs continuent de marcher sans rien changer de leur côté : un nouvel endpoint, un nouveau champ optionnel. Supprimer, renommer ou changer le type d’un champ, ou lui donner un nouveau sens, est un changement cassant.' },
		{ term: 'Tolerant reader (lecteur tolérant)', def: 'Un consommateur qui ne lit que les champs dont il a besoin et ignore le reste. Le fournisseur peut alors ajouter des champs sans demander à personne.' },
		{ term: 'Négociation de capacités', def: 'Le serveur liste ce qu’il sait faire, et le client vérifie la liste avant d’utiliser une fonctionnalité. Un même client marche alors avec des serveurs d’âges différents.' },
		{ term: 'Version', def: 'Le nom d’une forme du contrat. Dans le chemin (`/apis/apps/v1`) quand la forme casse, pour que l’ancienne forme puisse tourner à côté de la nouvelle.' },
		{ term: 'Dépréciation', def: 'Annoncer que quelque chose va disparaître pendant que ça marche encore. Ensuite, compter qui l’appelle encore, et le supprimer à une date donnée (le sunset).' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['client["kubectl ou un contrôleur"] -->|"GET /apis"| api["kube-apiserver"]', 'api --> disc["Discovery : chaque group version servie"]'],
				highlight: ['client', 'api', 'disc'],
				note: '**Négociation de capacités.** Avant d’utiliser une ressource, un client peut interroger l’**API Discovery**. Le serveur liste chaque group version et chaque ressource qu’il sert. Un client qui a besoin de `flowcontrol.apiserver.k8s.io/v1` vérifie d’abord qu’elle est là.'
			},
			{
				add: ['oldc["Ancien client : flowcontrol v1beta3"] -->|"GET FlowSchema"| api', 'newc["Nouveau client : flowcontrol v1"] -->|"GET FlowSchema"| api', 'api --> etcd[("etcd : un seul objet stocké")]', 'class etcd ext'],
				highlight: ['oldc', 'newc', 'etcd'],
				note: '**Deux versions, un seul objet.** La doc le dit clairement : « all the different versions are actually representations of the same persisted data » (toutes les versions sont en fait des représentations des mêmes données persistées). Quand PriorityLevelConfiguration a renommé `assuredConcurrencyShares` en `nominalConcurrencyShares`, le renommage est sorti dans une **nouvelle version** (v1beta3), et v1beta2 a gardé l’ancien nom.'
			},
			{
				add: ['api -->|"Warning: 299, deprecated in v1.29+"| oldc'],
				highlight: ['oldc'],
				note: '**Déprécier, et prévenir l’appelant.** À partir de v1.29, une requête vers v1beta3 reçoit un en-tête de réponse standard `Warning`. Le statut et le corps ne changent pas, donc les anciens clients marchent toujours. kubectl affiche l’avertissement sur stderr.'
			},
			{
				add: ['api -->|"apiserver_requested_deprecated_apis = 1"| metrics[("métriques et journal d’audit")]'],
				highlight: ['metrics'],
				note: '**Mesurer.** La même requête met à jour une jauge étiquetée avec le groupe, la version, la ressource et `removed_release`, et ajoute `k8s.io/deprecated` à l’événement d’audit. L’admin peut voir **qui appelle encore l’ancienne forme** avant la mise à jour qui la supprime.'
			},
			{
				add: ['api -.->|"v1.32 : plus servie"| gone["routes v1beta3"]'],
				highlight: ['gone'],
				note: '**Supprimer, à une date connue à l’avance.** En v1.32, le serveur arrête de servir v1beta3. Les objets stockés via cette version restent lisibles via v1. Un admin qui n’était pas prêt peut définir une variable d’environnement pour servir les API supprimées pendant une release de plus.'
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
			'**Les dates vivent sur le type.** FlowSchema v1beta3 dit seulement [`introduced=1.26`](' + FLOW + '/types.go#L120-L129) et nomme son remplaçant. Un générateur en tire [`APILifecycleDeprecated` 1.29 et `APILifecycleRemoved` 1.32](' + FLOW + '/zz_generated.prerelease-lifecycle.go#L28-L50) : « introduite plus trois mineures », puis « dépréciée plus trois mineures ». La politique est du code, pas une page de wiki.',
			'**Déprécier.** Quand une route est installée, [`IsDeprecated`](' + APISERVER + '/endpoints/deprecation/deprecation.go#L61-L86) compare ces dates avec la version en cours. [`WarningMessage`](' + APISERVER + '/endpoints/deprecation/deprecation.go#L100-L134) construit un texte comme « is deprecated in v1.29+, unavailable in v1.32+; use flowcontrol.apiserver.k8s.io/v1 FlowSchema ». L’enregistreur l’écrit dans un [en-tête `Warning` avec le code 299](' + APISERVER + '/endpoints/filters/warning.go#L101-L111).',
			'**Mesurer.** [`MonitorRequest`](' + APISERVER + '/endpoints/metrics/metrics.go#L588-L594) met `apiserver_requested_deprecated_apis` à 1 pour ce groupe, cette version et cette ressource, et ajoute `k8s.io/deprecated` et `k8s.io/removed-release` à l’événement d’audit. La [métrique est déclarée STABLE](' + APISERVER + '/endpoints/metrics/metrics.go#L64-L71), donc les tableaux de bord peuvent compter dessus d’une release à l’autre.',
			'**Supprimer.** [`ShouldServeForVersion`](' + APISERVER + '/server/deleted_kinds.go#L150-L171) arrête de servir un kind dès que la release en cours atteint sa release de suppression. La seule échappatoire est [`KUBE_APISERVER_SERVE_REMOVED_APIS_FOR_ONE_RELEASE`](' + APISERVER + '/server/deleted_kinds.go#L53-L56), qui permet à un admin de « kick the can one release down the road » (repousser le problème d’une release), et pas plus loin.',
			'**Ce qui compte comme compatible.** Le [guide des changements d’API](' + COMMUNITY + '/contributors/devel/sig-architecture/api_changes.md?plain=1#L115-L141) le liste : « Any API call ... that succeeded before your change must succeed after your change » (tout appel qui réussissait avant ton changement doit réussir après), et « Existing clients need not be aware of your change » (les clients existants n’ont pas à connaître ton changement). Ajouter un champ optionnel passe. En renommer un, non : ça attend une nouvelle version.'
		]
	},
	tradeoff: {
		gain: [
			'Les consommateurs mettent à jour à leur rythme. Un client écrit pour v1beta3 a continué de marcher pendant trois releases après la sortie de v1.',
			'La dépréciation atteint l’appelant, pas seulement la doc : un en-tête sur chaque réponse, une métrique et une entrée d’audit pour l’opérateur.',
			'Les changements additifs ne demandent aucune coordination : un nouveau champ optionnel sort avec le serveur seul, et les lecteurs tolérants l’ignorent.'
		],
		cost: [
			'Chaque version servie est du code que tu continues de faire tourner, de convertir et de tester. L’API server de Kubernetes convertit les objets entre toutes les versions qu’il sert.',
			'Les anciennes formes ne se corrigent pas sur place. Un mauvais nom de champ reste dans sa version jusqu’à ce que toute cette version soit supprimée.',
			'Les clients se ramifient. Chaque vérification de capacité est un `if` que quelqu’un doit tester contre les anciens et les nouveaux serveurs.',
			'La suppression demande des preuves et un calendrier. Sans un compteur par route et une date publiée, « déprécié » peut durer pour toujours.'
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
			why: 'Un tag et une note de release disent ce que le projet a l’intention de faire. Seule la métrique (ou le journal d’audit) dit si quelque chose dans ce cluster en dépend encore. Déprécier, mesurer, puis supprimer.'
		}
	],
	takeaway: 'Fais évoluer un contrat en ajoutant, laisse les clients demander ce que le serveur sait faire, et ne supprime une ancienne forme qu’après avoir prévenu ses appelants et les avoir comptés jusqu’à zéro.',
	sources: [
		{ title: 'Kubernetes, Deprecation Policy', url: 'https://kubernetes.io/docs/reference/using-api/deprecation-policy/' },
		{ title: 'Kubernetes, Deprecated API Migration Guide', url: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/' },
		{ title: 'Kubernetes blog, Warning: Helpful Warnings Ahead', url: 'https://kubernetes.io/blog/2020/09/03/warnings/' },
		{ title: 'Martin Fowler, TolerantReader', url: 'https://martinfowler.com/bliki/TolerantReader.html' },
		{ title: 'RFC 9745, The Deprecation HTTP Response Header Field (with Sunset, RFC 8594)', url: 'https://datatracker.ietf.org/doc/html/rfc9745' }
	]
};
