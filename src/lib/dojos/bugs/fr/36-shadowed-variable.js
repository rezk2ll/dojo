const GO = 'https://github.com/golang/go';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'shadowed-variable',
	part: 'La logique',
	title: 'La fonction d’annulation qui reste nil',
	minutes: 10,
	hook: [
		'Un `net.Dialer` a un vieux champ `Cancel` : un canal qui interrompt la connexion quand on le ferme. Prends un programme qui y met un canal fermé seulement à l’arrêt, ne fixe aucun `Timeout`, et appelle `d.Dial("tcp", addr)` 1 000 fois. Une fois les appels revenus, **1 000 goroutines restent bloquées** dans `net`.',
		'Chaque connexion passe par `dialCtx`. Elle enveloppe le contexte, lance une goroutine d’aide pour `Cancel`, et renvoie une fonction de nettoyage. `DialContext` exécute ce nettoyage avec `defer cancel()`.'
	],
	terms: [
		{ term: 'Masquage (shadowing)', def: 'Déclarer dans un bloc intérieur une variable qui porte le même nom qu’une variable extérieure. Dans le bloc, le nom désigne la nouvelle, et l’extérieure ne change pas.' },
		{ term: ':=', def: 'La déclaration courte de Go. Dans un nouveau bloc, elle déclare tous les noms à sa gauche, même si une variable de ce nom existe hors du bloc.' },
		{ term: 'context.CancelFunc', def: 'La fonction renvoyée par `context.WithCancel`. L’appeler ferme le canal `Done()` du contexte et libère ce qui l’attend.' }
	],
	bug: {
		title: 'net: cancel2 should not be shadow',
		repo: 'golang/go',
		url: `${GO}/blob/78314e01407678a19b30bc11aba450808686155f/src/net/dial.go#L560-L593`,
		fix: `${GO}/commit/136332571bcc552b9cc3ff8ac44aeb370425e7d7`,
		lang: 'go',
		code: `func (d *Dialer) dialCtx(ctx context.Context) (context.Context, context.CancelFunc) {
	if ctx == nil {
		panic("nil context")
	}
	deadline := d.deadline(ctx, time.Now())
	var cancel1, cancel2 context.CancelFunc
	if !deadline.IsZero() {
		testHookStepTime()
		if d, ok := ctx.Deadline(); !ok || deadline.Before(d) {
			var subCtx context.Context
			subCtx, cancel1 = context.WithDeadline(ctx, deadline)
			ctx = subCtx
		}
	}
	if oldCancel := d.Cancel; oldCancel != nil {
		subCtx, cancel2 := context.WithCancel(ctx)
		go func() {
			select {
			case <-oldCancel:
				cancel2()
			case <-subCtx.Done():
			}
		}()
		ctx = subCtx
	}
	return ctx, func() {
		if cancel1 != nil {
			cancel1()
		}
		if cancel2 != nil {
			cancel2()
		}
	}
}`,
		lines: [16],
		diff: ` 	if oldCancel := d.Cancel; oldCancel != nil {
-		subCtx, cancel2 := context.WithCancel(ctx)
+		var subCtx context.Context
+		subCtx, cancel2 = context.WithCancel(ctx)
 		go func() {`,
		notes: [
			'**Deux variables nommées `cancel2`.** La ligne 6 déclare `cancel2` pour toute la fonction. La ligne 16 est dans le bloc `if`, donc son `:=` déclare un second `cancel2` qui ne vit que dans ce bloc. La goroutine de la ligne 20 appelle celui de l’intérieur. La fonction de nettoyage de la ligne 30 lit celui de l’extérieur, toujours nil.',
			'**Où ça fuit.** Reprends le programme du début : `Dial` passe `context.Background()`, et sans `Timeout` il n’y a pas d’échéance, donc `cancel1` reste nil aussi. Le nettoyage n’appelle rien. Chaque goroutine d’aide attend `oldCancel` ou `subCtx.Done()`, et aucun des deux ne se ferme avant l’arrêt. 1 000 connexions laissent 1 000 goroutines et 1 000 contextes vivants.',
			'**Pourquoi un timeout le cache.** Avec un `Timeout`, le nettoyage appelle `cancel1`. `subCtx` est un enfant de ce contexte à échéance, donc il est annulé aussi, et la goroutine se termine. Seuls les dialers avec `Cancel` et sans échéance gardent la goroutine.',
			'**Le correctif recopie la branche du dessus.** Les lignes 10 et 11 faisaient déjà ce qu’il faut : `var subCtx context.Context`, puis `=`, donc `cancel1` est bien la variable extérieure. Le correctif écrit la branche `Cancel` de la même façon. Le bug a été trouvé en lisant le code et signalé dans l’issue [#78531](' + GO + '/issues/78531), "net: dialCtx shadow var".'
		]
	},
	quiz: [
		{
			q: 'Une fois `dialCtx` terminée, quel `cancel2` voit la fonction de nettoyage ?',
			options: [
				'Celui de la ligne 16, rempli par `context.WithCancel`',
				'Celui de la ligne 6, qui vaut toujours nil',
				'Les deux, car Go fusionne les variables de même nom',
				'Aucun, la closure reçoit une copie faite à la ligne 26'
			],
			answer: 1,
			why: 'La closure est hors du bloc `if`, donc le nom `cancel2` y désigne la variable de la ligne 6. La ligne 16 a rempli une autre variable.'
		},
		{
			q: 'Quel dialer laisse fuir une goroutine par connexion avec ce code ?',
			options: [
				'Un dialer avec `Timeout` et avec `Cancel`',
				'Un dialer avec `Timeout` et sans `Cancel`',
				'Un dialer sans `Timeout` et sans `Cancel`',
				'Un dialer avec `Cancel`, sans aucune échéance'
			],
			answer: 3,
			why: 'Sans `Cancel`, aucune goroutine ne démarre. Avec un timeout, `cancel1` annule le parent de `subCtx`, donc la goroutine se termine. Seul `Cancel` sans échéance la laisse attendre.'
		},
		{
			q: 'Une variable extérieure est affectée dans un bloc `if` ou `for` en Go. Que chercher ?',
			options: [
				'Un `:=` qui la nomme à côté d’une nouvelle variable',
				'Une déclaration `var` placée au-dessus du bloc',
				'Une instruction `defer` placée dans le bloc',
				'Une instruction `go` lancée dans le bloc'
			],
			answer: 0,
			why: 'Dans un nouveau bloc, `:=` déclare tous les noms à sa gauche, donc la variable extérieure n’est jamais écrite. Ici, la branche de l’échéance deux lignes plus haut montre la forme sûre.'
		}
	],
	takeaway: 'Quand une fonction déclare une variable en haut et la remplit dans un bloc, vérifie que le bloc utilise `=` et pas `:=`. Si la ligne a aussi besoin d’une nouvelle variable, déclare-la d’abord avec `var`.',
	sources: [
		{ title: 'go, issue #78531', url: `${GO}/issues/78531` },
		{ title: 'La revue, CL 762780', url: 'https://go-review.googlesource.com/c/go/+/762780' }
	]
};
