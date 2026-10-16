const MOBY = 'https://github.com/moby/moby';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'loop-closure',
	part: 'L’état et le temps',
	title: 'Le mauvais conteneur supprimé',
	minutes: 10,
	hook: [
		'Au démarrage, le démon Docker charge chaque conteneur depuis le disque dans une map indexée par ID de conteneur. Puis il enregistre chacun dans sa propre goroutine, avec un sémaphore qui limite combien tournent en même temps. Un conteneur qui échoue à s’enregistrer doit être **retiré de la map**, pour que les étapes suivantes du démarrage l’ignorent.',
		'`go vet` a signalé deux lignes de cette boucle. La goroutine reçoit le conteneur en argument. Elle utilise aussi une autre valeur de la boucle.'
	],
	terms: [
		{ term: 'Goroutine', def: 'Une fonction que Go exécute en même temps que le code qui l’a lancée, avec `go func() { ... }()`.' },
		{ term: 'Closure', def: 'Une fonction littérale qui utilise des variables du code autour d’elle. Elle lit la variable elle-même, pas une copie.' },
		{ term: 'Variable de boucle', def: 'Le `id, c` de `for id, c := range`. Avant Go 1.22, la boucle les déclarait une seule fois et les écrasait à chaque tour.' }
	],
	bug: {
		title: 'Fix go vet issue in daemon/daemon.go',
		repo: 'moby/moby',
		url: `${MOBY}/blob/b958b430aa2bfe72ab93ae2eac72fb73c324c5c8/daemon/daemon.go#L263-L283`,
		fix: `${MOBY}/commit/7315a2bb11325bdab36d0325be5f780414e660a7`,
		lang: 'go',
		code: `for id, c := range containers {
	group.Add(1)
	go func(c *container.Container) {
		defer group.Done()
		_ = sem.Acquire(context.Background(), 1)
		defer sem.Release(1)

		if err := daemon.registerName(c); err != nil {
			logrus.Errorf("Failed to register container name %s: %s", c.ID, err)
			mapLock.Lock()
			delete(containers, id)
			mapLock.Unlock()
			return
		}
		if err := daemon.Register(c); err != nil {
			logrus.Errorf("Failed to register container %s: %s", c.ID, err)
			mapLock.Lock()
			delete(containers, id)
			mapLock.Unlock()
			return
		}`,
		lines: [11, 18],
		diff: ` 				logrus.Errorf("Failed to register container name %s: %s", c.ID, err)
 				mapLock.Lock()
-				delete(containers, id)
+				delete(containers, c.ID)
 				mapLock.Unlock()
 				return`,
		notes: [
			'**`c` est copié, `id` est partagé.** La goroutine prend `c` en paramètre, donc chacune reçoit le conteneur de son tour. `id` n’est pas un paramètre. La fonction littérale lit l’unique variable `id` de la boucle, et la boucle continue d’y écrire une nouvelle clé.',
			'**Ce qui est supprimé.** Chaque goroutine attend d’abord sur `sem.Acquire`, donc elle peut tourner bien après que la boucle a avancé. Mettons que le conteneur A échoue à `registerName` une fois la boucle finie. `id` contient alors la dernière clé visitée, disons C. Le code supprime C, un conteneur qui s’était bien enregistré, et A reste dans la map avec un nom qui n’a pas pu s’enregistrer.',
			'**Le correctif.** La map est remplie avec `containers[container.ID] = container`, donc `c.ID` est la clé de ce conteneur. `delete(containers, c.ID)` utilise le paramètre, qui appartient à cette goroutine. Le commit fait le même changement sur le second `delete` et retire `id` de la ligne `for`.',
			'**Comment ça s’est vu.** Aucun utilisateur ne l’a signalé. Le message du commit cite `go vet` : "daemon/daemon.go:273: loop variable id captured by func literal". Depuis Go 1.22, chaque tour d’une boucle `for` a ses propres variables, mais du code compilé avec un Go plus ancien, comme ici en janvier 2019, les partage.'
		]
	},
	quiz: [
		{
			q: 'Les conteneurs A, B et C sont dans la map. La boucle est finie quand `registerName(A)` échoue. Quelle clé le code bogué supprime-t-il ?',
			options: ['A, le conteneur en échec', 'La dernière clé visitée par la boucle', 'Aucune, `id` est vide après la boucle', 'Les trois, `delete` vide la map'],
			answer: 1,
			why: '`id` est une seule variable pour toute la boucle. Après le dernier tour, elle garde la dernière clé, et chaque goroutine qui tourne ensuite lit cette valeur.'
		},
		{
			q: 'Pourquoi `c` est-il juste dans la goroutine alors que `id` ne l’est pas ?',
			options: [
				'Il est passé en argument, donc chaque goroutine a sa copie',
				'C’est un pointeur, et Go ne partage jamais les pointeurs',
				'Il est lu avant que la goroutine attende le sémaphore',
				'Le mutex protège `c`, mais pas `id`'
			],
			answer: 0,
			why: 'Les arguments sont évalués quand `go func(...)(c)` s’exécute, à ce tour de la boucle. Une variable capturée est lue plus tard, quand la goroutine arrive à la ligne.'
		},
		{
			q: 'Quel outil trouve ce bug sans lancer le démon ?',
			options: [
				'`go vet`, qui signale les variables de boucle capturées',
				'`go test -count=1`, qui ignore le cache des tests',
				'`gofmt -l`, qui liste les fichiers mal formatés',
				'Le race detector, sur un démarrage normal sans erreur'
			],
			answer: 0,
			why: 'Le message du commit cite `go vet` lui-même : "loop variable id captured by func literal". Le race detector ne voit que le code qui s’exécute, et un démarrage sans erreur n’atteint jamais les lignes `delete`.'
		}
	],
	takeaway: 'Quand une goroutine ou un callback lancé dans une boucle utilise une variable de boucle, passe la valeur en argument ou lis-la sur l’élément lui-même, comme `c.ID` ici. Lance `go vet` sur du code compilé avec un Go antérieur à 1.22.',
	sources: [
		{ title: 'moby, pull request #38497', url: `${MOBY}/pull/38497` },
		{ title: 'Notes de version de Go 1.22, variables de boucle', url: 'https://go.dev/doc/go1.22#language' }
	]
};
