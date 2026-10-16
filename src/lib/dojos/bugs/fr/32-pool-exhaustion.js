const GO = 'https://github.com/golang/go';
const PARENT = '478f4b67543824c039d2f7afec6af88a59148db2';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pool-exhaustion',
	part: 'Les ressources',
	title: 'Une connexion comptée mais jamais rangée',
	minutes: 10,
	hook: [
		'Go 1.2 a ajouté `SetMaxOpenConns` à `database/sql`. Sur un site à fort trafic, des connexions fuyaient "every few days" (tous les quelques jours). Le message du commit en donne la conséquence : "If SetMaxOpenConns is used, the application **eventually deadlocks**. Otherwise, the number of open connections just keep growing indefinitely."',
		'Quand un appelant veut une connexion et qu’aucune n’est libre, une goroutine en arrière-plan en ouvre une nouvelle. Une fois prête, le code la compte dans `numOpen` et la confie à `putConnDBLocked` : à un appelant qui attend, ou à la liste des connexions libres. Le commentaire de `putConnDBLocked` parle d’une troisième issue.'
	],
	terms: [
		{ term: 'Pool de connexions', def: 'Un ensemble de connexions ouvertes à la base, que les appelants empruntent et rendent, pour ne pas en ouvrir une à chaque requête.' },
		{ term: 'Liste libre', def: 'Les connexions ouvertes qu’aucun appelant ne tient en ce moment, rangées dans `freeConn` (2 au plus par défaut).' },
		{ term: 'numOpen', def: 'Le compte des connexions ouvertes du pool. Avec `SetMaxOpenConns(n)`, les appelants attendent dès qu’il atteint n.' }
	],
	bug: {
		title: 'database/sql: Fix connection leak and potential deadlock',
		repo: 'golang/go',
		url: `${GO}/blob/${PARENT}/src/pkg/database/sql/sql.go#L576-L793`,
		fix: `${GO}/commit/37db8804691f0a5e618cbc041909895c9709263c`,
		lang: 'go',
		code: `// Open one new connection
func (db *DB) openNewConnection() {
	ci, err := db.driver.Open(db.dsn)
	db.mu.Lock()
	defer db.mu.Unlock()
	if db.closed {
		if err == nil {
			ci.Close()
		}
		return
	}
	db.pendingOpens--
	if err != nil {
		db.putConnDBLocked(nil, err)
		return
	}
	dc := &driverConn{
		db: db,
		ci: ci,
	}
	db.addDepLocked(dc, dc)
	db.numOpen++
	db.putConnDBLocked(dc, err)
}
…
// If a connRequest was fullfilled or the *driverConn was placed in the
// freeConn list, then true is returned, otherwise false is returned.
func (db *DB) putConnDBLocked(dc *driverConn, err error) bool {
	if db.connRequests.Len() > 0 {
…
		return true
	} else if err == nil && !db.closed && db.maxIdleConnsLocked() > 0 && db.maxIdleConnsLocked() > db.freeConn.Len() {
		dc.listElem = db.freeConn.PushFront(dc)
		return true
	}
	return false
}`,
		lines: [23, 21, 22],
		diff: ` 		ci: ci,
 	}
-	db.addDepLocked(dc, dc)
-	db.numOpen++
-	db.putConnDBLocked(dc, err)
+	if db.putConnDBLocked(dc, err) {
+		db.addDepLocked(dc, dc)
+		db.numOpen++
+	} else {
+		ci.Close()
+	}
 }`,
		notes: [
			'La ligne 36 renvoie `false` quand personne n’attend et que la liste libre est pleine. La ligne 23 ignore cette valeur, alors que la ligne 22 a déjà ajouté la connexion à `numOpen`. La connexion n’est alors dans aucune liste, et personne ne la ferme.',
			'D’après le rapport, un appelant demande une connexion, aucune n’est libre, et la goroutine d’ouverture lance une connexion. Pendant qu’elle attend le réseau, 3 connexions occupées reviennent : la première va à l’appelant en attente, les 2 suivantes remplissent la liste libre (2 par défaut). La nouvelle connexion arrive sans appelant ni place libre, la ligne 36 renvoie `false`, et la connexion est perdue.',
			'Chaque connexion perdue reste dans `numOpen` pour toujours. Avec `SetMaxOpenConns(10)`, après 10 pertes, `numOpen` vaut 10 alors qu’il ne reste aucune vraie connexion. `conn()` attend dès que `db.numOpen >= db.maxOpen` et n’ouvre rien de neuf, donc **chaque requête attend**. Sans limite, les connexions perdues s’empilent sur le serveur de base de données.',
			'Le correctif ne compte la connexion que si `putConnDBLocked` renvoie `true`, et la ferme sinon. L’auteur du rapport, sur [l’issue #6593](' + GO + '/issues/6593) : "it calls putConnDBLocked() without checking the return value, assuming the connection will either fulfill a pending request or be added to the idle queue, but that\'s not always the case."'
		]
	},
	quiz: [
		{
			q: 'La limite de connexions libres est 2. Quand la nouvelle connexion est prête, personne n’attend et 2 connexions sont libres. Que se passe-t-il dans le code bogué ?',
			options: [
				'Elle remplace la plus ancienne connexion libre, qui est fermée',
				'Elle est comptée dans `numOpen`, puis lâchée sans être fermée',
				'Elle est fermée tout de suite, et `numOpen` ne bouge pas',
				'Elle attend dans la goroutine d’ouverture qu’un appelant la demande'
			],
			answer: 1,
			why: '`numOpen++` s’exécute d’abord, puis `putConnDBLocked` renvoie `false` car la liste libre est pleine. Rien ne ferme `ci` et le pool ne garde aucune référence vers elle.'
		},
		{
			q: 'Avec `SetMaxOpenConns(10)`, pourquoi l’appli finit-elle bloquée plutôt que juste lente ?',
			options: [
				'La base refuse les connexions après 10 requêtes en échec',
				'La goroutine d’ouverture panique à la onzième connexion',
				'`numOpen` vaut 10 à cause des pertes, donc tout appelant attend',
				'La liste libre dépasse 10 et bloque le mutex'
			],
			answer: 2,
			why: 'La limite se compare à `numOpen`, qui compte encore les connexions perdues. Une fois à 10, les appelants attendent une connexion qui ne sera ni rendue ni ouverte.'
		},
		{
			q: 'Une fonction confie une ressource à un pool et renvoie un booléen. Que doit faire l’appelant ?',
			options: [
				'Tester le booléen et fermer la ressource si le pool l’a refusée',
				'Ignorer le booléen, le pool ferme ce qu’il ne garde pas',
				'Relancer l’appel en boucle jusqu’à ce que le pool accepte',
				'Compter la ressource d’abord, pour ne jamais dépasser la limite'
			],
			answer: 0,
			why: 'Ici le pool ne ferme pas ce qu’il refuse. L’appelant possède la ressource tant que le pool n’a pas dit oui : il ne doit la compter que sur `true` et la fermer sur `false`.'
		}
	],
	recall: {
		q: 'Dans `database/sql` de Go 1.2, que devenait une nouvelle connexion quand `putConnDBLocked` renvoyait `false`, et pourquoi l’appli finissait-elle bloquée ?',
		a: 'Personne ne la fermait et aucune liste ne la gardait, mais `numOpen` l’avait déjà comptée. Avec `SetMaxOpenConns(10)`, 10 pertes laissaient `numOpen` à 10 sans aucune vraie connexion, et tout appelant attendait. Le correctif compte la connexion seulement sur `true` et la ferme sur `false`.'
	},
	sources: [
		{ title: 'go, issue #6593', url: `${GO}/issues/6593` },
		{ title: 'Revue de code 14611045', url: 'https://golang.org/cl/14611045' }
	]
};
