const TOKIO = 'https://github.com/tokio-rs/tokio';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'locked-twice',
	part: 'Les ressources',
	title: 'Un destructeur qui tourne sous le verrou',
	minutes: 10,
	hook: [
		'Un `JoinSet` de Tokio regroupe des tâches lancées, et `join_next()` attend la prochaine qui se termine. En septembre 2026, un signalement montre un programme qui **reste bloqué pour toujours** dans un poll de `JoinSet`. Sa dernière ligne de log : "child completing, about to wake the JoinSet entry".',
		'La méthode ci-dessous tourne à chaque poll. Elle garde le waker de l’appelant pour que le set puisse le réveiller plus tard. Quand une tâche enfant se termine, son code de réveil prend le même mutex `self.lists` pour déplacer son entrée dans la liste `notified`.',
		'Le programme utilisait son propre type de waker. Détruire l’ancien waker faisait tourner le runtime jusqu’à ce qu’une tâche enfant se termine.'
	],
	terms: [
		{ term: 'Waker', def: 'Une poignée qu’une future donne à celui qui devra la réveiller. Un exécuteur peut créer son propre type de waker, avec son propre code `Drop`.' },
		{ term: 'Drop', def: 'Rust lance le destructeur d’une valeur quand elle disparaît. Affecter une nouvelle valeur à un champ détruit l’ancienne sur cette ligne.' },
		{ term: 'Mutex', def: 'Un verrou qu’un seul thread tient à la fois. Celui-ci ne peut pas être pris deux fois par le même thread : le second `lock()` attend pour toujours.' }
	],
	bug: {
		title: 'task: drop replaced waker outside lock in JoinSet (#8554)',
		repo: 'tokio-rs/tokio',
		url: `${TOKIO}/blob/6fa334aee7b106aadc5c98d550dc4dc0a163cff3/tokio/src/util/idle_notified_set.rs#L172-L204`,
		fix: `${TOKIO}/commit/babd90dee5933869084f4c21f30a4bd47ef7733d`,
		lang: 'rust',
		code: `pub(crate) fn pop_notified(&mut self, waker: &Waker) -> Option<EntryInOneOfTheLists<'_, T>> {
    // We don't decrement the length because this call moves the entry to
    // the idle list rather than removing it.
    if self.length == 0 {
        // Fast path.
        return None;
    }

    let mut lock = self.lists.lock();

    let should_update_waker = match lock.waker.as_mut() {
        Some(cur_waker) => !waker.will_wake(cur_waker),
        None => true,
    };
    if should_update_waker {
        lock.waker = Some(waker.clone());
    }

    // Pop the entry, returning None if empty.
    let entry = lock.notified.pop_back()?;

    lock.idle.push_front(entry.clone());

    // Safety: We are holding the lock.
    entry.my_list.with_mut(|ptr| unsafe {
        *ptr = List::Idle;
    });

    drop(lock);

    // Safety: We just put the entry in the idle list, so it is in one of the lists.
    Some(EntryInOneOfTheLists { entry, set: self })
}`,
		lines: [16],
		diff: `
+        // Declare \`_old_waker\` before \`lock\` so that it is dropped after \`lock\`
+        // is released, including when returning early via \`?\`.
+        let _old_waker;
         let mut lock = self.lists.lock();
 …
         if should_update_waker {
-            lock.waker = Some(waker.clone());
+            _old_waker = lock.waker.replace(waker.clone());
         }`,
		notes: [
			'**L’affectation lance un destructeur.** `lock.waker = Some(waker.clone())` détruit le waker rangé avant. Ce drop tourne pendant que `lock` tient encore `self.lists`. Un waker maison peut y exécuter n’importe quel code. Le ticket dit qu’il faut "an unusual executor/waker cleanup adapter, not an ordinary Tokio task waker." (un adaptateur d’exécuteur inhabituel, pas un waker de tâche Tokio ordinaire).',
			'**Comment ça bloque.** Le waker du signalement fait tourner le runtime dans son `Drop`. Une tâche enfant se termine, et son `wake_by_ref` appelle `me.parent.lock()`, le même mutex. Le thread le tient déjà, dans `pop_notified`, donc le second `lock()` ne rend jamais la main. Le signalement : "The trigger hangs after the child finishes."',
			'**Le correctif.** `lock.waker.replace(...)` renvoie l’ancien waker au lieu de le détruire, et `_old_waker` le garde. Rust détruit les variables locales dans l’ordre inverse de leur déclaration : `_old_waker`, déclaré avant `lock`, est détruit après la libération du mutex. Le nouveau commentaire précise que ça couvre aussi le `return` anticipé du `?`.',
			'**Le même fichier le faisait déjà une fois.** Dans `wake_by_ref`, le code sort le waker avec `lock.waker.take()`, appelle `drop(lock)`, et seulement ensuite `waker.wake()`. Les auteurs du signalement renvoient au [ticket #5429](' + TOKIO + '/issues/5429), sur le remplacement de waker dans d’autres primitives de Tokio.',
			'**Comment ça s’est vu.** Le [ticket #8553](' + TOKIO + '/issues/8553), intitulé "JoinSet destroys a replaced parent waker under its list mutex", contenait un petit programme qui bloque, et une version témoin qui garde l’ancien waker jusqu’après le poll et qui se termine.'
		]
	},
	quiz: [
		{
			q: 'Quelle ligne peut exécuter du code que tu ne contrôles pas pendant que `self.lists` est verrouillé ?',
			options: [
				'`let mut lock = self.lists.lock();`',
				'`lock.waker = Some(waker.clone());`',
				'`let entry = lock.notified.pop_back()?;`',
				'`drop(lock);`'
			],
			answer: 1,
			why: 'L’affectation détruit l’ancien waker sur cette ligne, et le `Drop` d’un waker appartient à celui qui l’a créé. `waker.clone()` exécute aussi du code de waker, mais le signalement et le correctif portent sur le drop.'
		},
		{
			q: 'Pourquoi `let _old_waker;` vient-il avant `let mut lock`, et pas après ?',
			options: [
				'Rust exige que toute variable soit déclarée avant le premier verrou',
				'Les locales sont détruites à l’envers, donc il part après le verrou',
				'Ça force le compilateur à vérifier que le waker n’est jamais cloné',
				'Une variable déclarée plus tard ne pourrait pas être affectée dans le if'
			],
			answer: 1,
			why: 'Rust détruit les locales de la dernière déclarée à la première. `lock` est déclaré après `_old_waker`, donc le mutex est libéré d’abord et l’ancien waker est détruit sans verrou tenu, y compris au `return` anticipé du `?`.'
		},
		{
			q: 'Tu tiens un verrou et tu dois remplacer une valeur qui a un `Drop` maison. Quel est le bon schéma ?',
			options: [
				'Affecter la nouvelle valeur, puis libérer le verrou au plus vite',
				'Sortir l’ancienne valeur sous le verrou, la détruire après',
				'Prendre un verrou que le même thread a le droit de prendre deux fois',
				'Cloner l’ancienne valeur avant d’affecter, pour sauter son drop'
			],
			answer: 1,
			why: 'Sortir l’ancienne valeur (`replace`, `take`, `mem::replace`) empêche son destructeur de tourner sous le verrou. Un verrou réentrant laisserait l’enfant modifier les listes en plein milieu de `pop_notified`.'
		}
	],
	takeaway: 'Sous un verrou, cherche chaque valeur qui est détruite, y compris l’ancienne valeur d’un champ que tu affectes. Si son destructeur peut rappeler ton code, sors-la et détruis-la après avoir libéré le verrou.',
	sources: [
		{ title: 'tokio, ticket #8553', url: `${TOKIO}/issues/8553` },
		{ title: 'tokio, pull request #8554', url: `${TOKIO}/pull/8554` },
		{ title: 'tokio, ticket #5429', url: `${TOKIO}/issues/5429` }
	]
};
