const ETCD = 'https://github.com/etcd-io/etcd';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'unbounded-growth',
	part: 'Les ressources',
	title: 'Un tas de leases que seul le leader etcd vide',
	minutes: 10,
	hook: [
		'Un cluster etcd 3.4.3 de trois membres sert des clients qui utilisent des leases. Le signalement : "Leader memory is normal , but two follower node memory are very big" (la mémoire du leader est normale, celle des deux followers est énorme). Pas de fuite de goroutines, peu de charge, et un redémarrage ne règle le problème que pour un temps.',
		'Un lease est un minuteur : les clés qui y sont attachées sont supprimées quand il expire. Chaque membre garde tous les leases, mais seul le leader les fait expirer. `revokeExpiredLeases` appelle `findExpiredLeases` seulement `if le.isPrimary()`, et cette boucle est le seul code qui retire des éléments de `leaseExpiredNotifier`.'
	],
	terms: [
		{ term: 'Lease', def: 'Un objet etcd avec une durée de vie. Quand il expire ou est révoqué, les clés qui y sont attachées sont supprimées.' },
		{ term: 'Leader et follower', def: 'Les membres etcd se mettent d’accord avec Raft. Un membre est le leader (`isPrimary()` vaut vrai), les autres sont des followers qui appliquent le même journal.' },
		{ term: 'leaseExpiredNotifier', def: 'Un tas d’ID de leases triés par date d’expiration, plus une map de l’ID vers l’élément. Le leader le consulte pour trouver les leases à révoquer.' }
	],
	bug: {
		title: 'lease: fix memory leak in LeaseGrant when node is follower',
		repo: 'etcd-io/etcd',
		url: `${ETCD}/blob/3ac7a1151519af0816647d5f0757119c3f4a24ac/lease/lessor.go#L276-L305`,
		fix: `${ETCD}/commit/b1da829844837b71c37546dda24ce7150b0e771f`,
		lang: 'go',
		code: `le.mu.Lock()
defer le.mu.Unlock()

if _, ok := le.leaseMap[id]; ok {
	return nil, ErrLeaseExists
}

if l.ttl < le.minLeaseTTL {
	l.ttl = le.minLeaseTTL
}

if le.isPrimary() {
	l.refresh(0)
} else {
	l.forever()
}

le.leaseMap[id] = l
item := &LeaseWithTime{id: l.ID, time: l.expiry.UnixNano()}
le.leaseExpiredNotifier.RegisterOrUpdate(item)
l.persistTo(le.b)

leaseTotalTTLs.Observe(float64(l.ttl))
leaseGranted.Inc()

if le.isPrimary() {
	le.scheduleCheckpointIfNeeded(l)
}

return l, nil`,
		lines: [19, 20],
		diff: ` 	le.leaseMap[id] = l
-	item := &LeaseWithTime{id: l.ID, time: l.expiry.UnixNano()}
-	le.leaseExpiredNotifier.RegisterOrUpdate(item)
 	l.persistTo(le.b)

 	leaseTotalTTLs.Observe(float64(l.ttl))
 	leaseGranted.Inc()

 	if le.isPrimary() {
+		item := &LeaseWithTime{id: l.ID, time: l.expiry.UnixNano()}
+		le.leaseExpiredNotifier.RegisterOrUpdate(item)
 		le.scheduleCheckpointIfNeeded(l)
 	}`,
		notes: [
			'Les lignes 19 et 20 tournent sur le leader et sur chaque follower. Le tas ne rétrécit que dans `expireExists`, que seul le leader appelle. Sur un follower, chaque nouvel ID de lease ajoute un élément au tas et une entrée à sa map, et aucun code ne les retire.',
			'`Revoke` supprime le lease de `leaseMap` et du backend, mais laisse son élément dans le notifier. Sur le leader, `expireExists` retrouve plus tard l’ID mort et le désinscrit. Sur un follower, ça n’arrive jamais. Si les clients créent et révoquent 10 leases par seconde, chaque follower garde 864 000 éléments de leases supprimés au bout d’un jour.',
			'La ligne 15 met un lease de follower à `forever()`, donc l’élément qu’il inscrit expire dans un futur lointain. Quand un follower est promu leader, `Promote` rafraîchit chaque lease et l’inscrit à nouveau. Le nouveau leader ne lit jamais les éléments stockés par le follower.',
			'Le correctif déplace les lignes 19 et 20 dans le bloc `if le.isPrimary()` de la ligne 26. Le même commit fait remplacer le notifier par un notifier vide dans `Demote` : un leader qui repasse follower jette aussi ses éléments. Le correctif est la [pull request #11731](' + ETCD + '/pull/11731).'
		]
	},
	quiz: [
		{
			q: 'Des clients créent puis révoquent 1 000 leases avec des ID nouveaux. Combien d’éléments contient le notifier d’un follower ensuite, avant le correctif ?',
			options: ['0, car chaque révocation retire son élément', '1, car les éléments partagent un seul emplacement', '1 000, un par ID de lease', '2 000, un pour la création et un pour la révocation'],
			answer: 2,
			why: '`RegisterOrUpdate` ajoute un élément par nouvel ID. `Revoke` ne touche pas au notifier, et seul le leader retire des éléments : les 1 000 restent.'
		},
		{
			q: 'Pourquoi la mémoire du leader était-elle normale dans le signalement ?',
			options: [
				'Le leader crée moins de leases que les followers',
				'Le leader parcourt le tas et désinscrit les leases disparus',
				'Le leader stocke les leases sur disque plutôt qu’en mémoire',
				'Le leader reconstruit son notifier toutes les 500 ms'
			],
			answer: 1,
			why: '`findExpiredLeases` tourne sur le leader et appelle `expireExists`, qui désinscrit les éléments dont l’ID n’est plus dans `leaseMap`.'
		},
		{
			q: 'Tu ajoutes des éléments à une file ou une map. Que vérifier d’abord pour écarter ce genre de fuite ?',
			options: [
				'Que le code qui retire tourne sur chaque chemin qui ajoute',
				'Que la map a été créée avec une capacité assez grande',
				'Que les éléments sont de petites structs et pas des pointeurs',
				'Que la file est protégée par le même mutex que la map'
			],
			answer: 0,
			why: 'Ici, l’ajout tournait sur chaque membre et le retrait seulement sur le leader. La taille, le type des éléments ou le verrou n’empêchent pas une structure de grossir si rien n’en retire.'
		}
	],
	recall: {
		q: 'Pourquoi le `leaseExpiredNotifier` d’un follower etcd grossissait-il sans limite ?',
		a: 'Le code de création inscrivait un élément sur chaque membre, mais seul le leader exécute `expireExists`, qui retire les éléments. Le correctif n’inscrit l’élément que `if le.isPrimary()`.'
	},
	sources: [
		{ title: 'etcd, pull request #11731', url: `${ETCD}/pull/11731` },
		{ title: 'etcd, issue #11730, le signalement', url: `${ETCD}/issues/11730` }
	]
};
