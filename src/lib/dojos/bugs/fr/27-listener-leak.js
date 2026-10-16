const SVELTE = 'https://github.com/sveltejs/svelte';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'listener-leak',
	part: 'Les ressources',
	title: 'Un lecteur audio qui écrivait encore après sa disparition',
	minutes: 10,
	hook: [
		'Une app Svelte 5 affiche un élément `<audio>` dans `{#if player.playingAudio}`, avec `bind:currentTime={player.playingAudio.currentTime}`. L’utilisateur lance la lecture, puis masque le lecteur. Chrome lève **"Cannot set properties of null"**.',
		'Le ticket précise : "This error does not appear in Firefox." (l’erreur n’apparaît pas dans Firefox). La fonction ci-dessous est ce que donne `bind:currentTime` une fois compilé. Elle tourne à la création de l’élément. `teardown` enregistre ce qu’il faut défaire quand l’élément est retiré.'
	],
	terms: [
		{ term: 'Binding', def: '`bind:currentTime={x}` garde `x` et la position de lecture synchronisés, dans les deux sens. `set` écrit la position dans `x`.' },
		{ term: 'teardown', def: 'Svelte appelle la fonction passée à `teardown` quand l’effet est détruit, ici quand le bloc `{#if}` retire l’élément.' },
		{ term: 'timeupdate', def: 'Un événement qu’un élément média déclenche quand sa position de lecture change.' }
	],
	bug: {
		title: 'fix: remove listener on `bind_current_time` teardown (#15013)',
		repo: 'sveltejs/svelte',
		url: `${SVELTE}/blob/dfa97a5e643655d919a7c6ff80fb3841fe1111f9/packages/svelte/src/internal/client/dom/elements/bindings/media.js#L22-L56`,
		fix: `${SVELTE}/commit/360ee70dcbc4a338fce749b8916b46a69ad209cb`,
		lang: 'javascript',
		code: `export function bind_current_time(media, get, set = get) {
	/** @type {number} */
	var raf_id;
	/** @type {number} */
	var value;

	// Ideally, listening to timeupdate would be enough, but it fires too infrequently for the currentTime
	// binding, which is why we use a raf loop, too. We additionally still listen to timeupdate because
	// the user could be scrubbing through the video using the native controls when the media is paused.
	var callback = () => {
		cancelAnimationFrame(raf_id);

		if (!media.paused) {
			raf_id = requestAnimationFrame(callback);
		}

		var next_value = media.currentTime;
		if (value !== next_value) {
			set((value = next_value));
		}
	};

	raf_id = requestAnimationFrame(callback);
	media.addEventListener('timeupdate', callback);

	render_effect(() => {
		var next_value = Number(get());

		if (value !== next_value && !isNaN(/** @type {any} */ (next_value))) {
			media.currentTime = value = next_value;
		}
	});

	teardown(() => cancelAnimationFrame(raf_id));
}`,
		lines: [34],
		diff: ` 	});

-	teardown(() => cancelAnimationFrame(raf_id));
+	teardown(() => {
+		cancelAnimationFrame(raf_id);
+		media.removeEventListener('timeupdate', callback);
+	});
 }`,
		notes: [
			'**Deux choses démarrent, une seule s’arrête.** La fonction lance une boucle `requestAnimationFrame` et ajoute un écouteur `timeupdate`. Le teardown n’annule que la boucle. L’écouteur reste sur l’élément après que Svelte l’a retiré de la page.',
			'**Comment l’erreur arrive.** L’utilisateur masque le lecteur, donc `player.playingAudio` devient `null` et le `{#if}` retire l’`<audio>`. Dans Chrome, l’élément déclenche encore `timeupdate`. `callback` tourne, lit un nouveau `currentTime` et appelle `set`, qui écrit dans `player.playingAudio.currentTime`. `playingAudio` vaut maintenant `null` : "Cannot set properties of null".',
			'**L’écouteur relance la boucle.** `cancelAnimationFrame(raf_id)` arrête la boucle au teardown. L’écouteur appelle `callback`, et `callback` relance la boucle si `media.paused` est faux. Un seul écouteur oublié suffit donc à faire revenir les deux.',
			'**Le correctif.** Le teardown appelle aussi `media.removeEventListener(\'timeupdate\', callback)`. Ça marche parce que `callback` est le même objet fonction que celui passé à `addEventListener`.',
			'**Comment ça s’est vu.** Un utilisateur a ouvert le [ticket #15008](' + SVELTE + '/issues/15008) avec un lien vers le playground : "Press play and then hide the player." (lance la lecture puis masque le lecteur).'
		]
	},
	quiz: [
		{
			q: 'Une fois l’`<audio>` retiré, qu’est-ce qui peut encore appeler `set` ?',
			options: [
				'Le render_effect, quand get() change',
				'L’écouteur timeupdate, via callback',
				'La frame planifiée avant le teardown',
				'Rien, Svelte bloque tous les appels à set'
			],
			answer: 1,
			why: 'Le teardown annule la frame et Svelte détruit le render_effect. L’écouteur timeupdate n’a jamais été retiré, donc l’élément peut encore appeler callback, et callback appelle set.'
		},
		{
			q: 'Pourquoi `removeEventListener(\'timeupdate\', callback)` marche-t-il dans le correctif ?',
			options: [
				'Il retire tous les écouteurs de l’élément',
				'callback est la même fonction que celle ajoutée',
				'Svelte garde une liste d’écouteurs par élément',
				'On ne peut ajouter un écouteur timeupdate qu’une fois'
			],
			answer: 1,
			why: 'removeEventListener a besoin du même nom d’événement et du même objet fonction. Ici callback est une variable visible, donc le teardown peut passer exactement la fonction ajoutée.'
		},
		{
			q: 'Tu relis une fonction d’initialisation. Quelle vérification trouve ce genre de fuite ?',
			options: [
				'Compter les appels à setTimeout dans le fichier',
				'Associer chaque addEventListener à un retrait dans le nettoyage',
				'Vérifier que chaque callback est une fonction fléchée',
				'Vérifier que l’élément a un attribut id'
			],
			answer: 1,
			why: 'Chaque chose qu’une initialisation lance (un écouteur, un minuteur, une boucle de frames, un abonnement) a besoin d’un arrêt dans le nettoyage. Ici la boucle en avait un, l’écouteur non.'
		}
	],
	takeaway: 'Dans chaque fonction d’initialisation, liste ce qu’elle lance et vérifie que le nettoyage arrête chaque élément de la liste. Un écouteur resté sur un élément retiré peut encore exécuter ton code et écrire dans un état qui n’existe plus.',
	sources: [
		{ title: 'svelte, pull request #15013', url: `${SVELTE}/pull/15013` },
		{ title: 'Ticket #15008 : écriture sur null', url: `${SVELTE}/issues/15008` }
	]
};
