const REACT = 'https://github.com/facebook/react';
const PARENT = '012b371cde3157a8dd46535839fbcda6c2bed1a0';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'missing-timeout',
	part: 'L’état et le temps',
	title: 'Un fetch sans timeout',
	minutes: 10,
	hook: [
		'L’extension navigateur React DevTools lit les source maps pour relier le code des composants à tes fichiers. Quand elle ne trouve pas un fichier parmi ce que la page a déjà chargé, le panneau DevTools demande à un content script de la page d’aller le chercher.',
		'Le content script fait un fetch de l’URL et renvoie un seul message : `fetch-file-with-cache-complete` avec le texte, ou `fetch-file-with-cache-error`. Le panneau attend ce message et n’a **aucun autre moyen de terminer**. Trouve l’appel qui peut le faire attendre pour toujours.'
	],
	terms: [
		{ term: 'Content script', def: 'Du code d’extension qui tourne dans la page inspectée et parle au reste de l’extension avec `chrome.runtime.sendMessage`.' },
		{ term: 'AbortSignal', def: 'Un objet que tu passes à `fetch` dans `signal`. Quand il se déclenche, le fetch s’arrête et sa promesse est rejetée.' },
		{ term: 'Promesse en attente', def: 'Une promesse ni résolue ni rejetée. Le code chaîné dessus avec `.then` ne s’exécute pas.' }
	],
	bug: {
		title: '[DevTools] fix: dedupe file fetch requests and define a timeout (#34566)',
		repo: 'facebook/react',
		url: `${REACT}/blob/${PARENT}/packages/react-devtools-extensions/src/contentScripts/fileFetcher.js#L3-L48`,
		fix: `${REACT}/commit/24a2ba03fb2e1b59844d98a1ce68dce1e502d8ad`,
		lang: 'javascript',
		code: `function fetchResource(url) {
…
  const resolve = value => {
    chrome.runtime.sendMessage({
      source: 'react-devtools-fetch-resource-content-script',
      payload: {
        type: 'fetch-file-with-cache-complete',
        url,
        value,
      },
    });
  };

  fetch(url, {cache: 'force-cache'}).then(
    response => {
      if (response.ok) {
        response
          .text()
          .then(text => resolve(text))
          .catch(error => reject(null));
      } else {
        reject(null);
      }
    },
    error => reject(null),
  );
}

chrome.runtime.onMessage.addListener(message => {
  if (
    message?.source === 'devtools-page' &&
    message?.payload?.type === 'fetch-file-with-cache'
  ) {
    fetchResource(message.payload.url);
  }
});`,
		lines: [14],
		diff: `   };

-  fetch(url, {cache: 'force-cache'}).then(
+  fetch(url, {cache: 'force-cache', signal: AbortSignal.timeout(60000)}).then(
     response => {
       if (response.ok) {`,
		notes: [
			'`fetch` n’a pas de timeout à lui, et la ligne 14 ne passe que `cache: \'force-cache\'`. Si le serveur accepte la connexion sans jamais répondre, la promesse reste en attente. Ni le handler de succès de la ligne 15 ni `error => reject(null)` à la ligne 25 ne s’exécutent : aucun message ne repart vers le panneau.',
			'Côté panneau, `fetchFileWithCaching` renvoie `new Promise((resolve, reject) => ...)` et ne la règle que depuis un listener `onMessage` qui guette les deux types de réponse ([fetchFileWithCaching.js](' + REACT + '/blob/' + PARENT + '/packages/react-devtools-extensions/src/main/fetchFileWithCaching.js#L81-L109)). Un fetch qui ne finit jamais laisse cette promesse en attente elle aussi, et le listener reste enregistré.',
			'Le correctif ajoute `signal: AbortSignal.timeout(60000)` à la ligne 14, qui se déclenche au bout de 60 secondes. Le fetch est alors rejeté avec une `TimeoutError`, la ligne 25 s’exécute, et le panneau reçoit `fetch-file-with-cache-error`. Le signal couvre aussi la lecture du corps : si la réponse cale à mi-chemin, `response.text()` est rejeté vers le `.catch` de la ligne 20.',
			'Le message du commit : "this adds a timeout of 60 seconds to all fetch requests initiated by fileFetcher content script." La même pull request empêche aussi le panneau d’envoyer deux fois la même URL pendant qu’une requête est en cours.'
		]
	},
	quiz: [
		{
			q: 'Le serveur accepte la connexion et ne répond jamais. Qu’envoie le content script bogué au panneau ?',
			options: [
				'Rien : ni `resolve` ni `reject` ne sont appelés',
				'Un message d’erreur après le timeout par défaut de 30 secondes du navigateur',
				'Un message complete avec une chaîne vide comme texte',
				'Un message d’erreur dès que `force-cache` ne trouve rien'
			],
			answer: 0,
			why: 'Les deux messages partent de handlers chaînés sur la promesse du fetch. Une promesse qui reste en attente n’en exécute aucun.'
		},
		{
			q: 'Pourquoi un timeout sur le fetch suffit-il à débloquer le panneau ?',
			options: [
				'Le timeout fait relancer la requête depuis le cache du navigateur',
				'Il change l’attente en rejet, et le rejet envoie déjà l’erreur',
				'Le panneau lit la valeur du timeout et arrête d’écouter tout seul',
				'`AbortSignal.timeout` ferme le content script et son listener'
			],
			answer: 1,
			why: 'Le code transforme déjà un rejet en `fetch-file-with-cache-error`. Le timeout n’a qu’à transformer « en attente pour toujours » en rejet.'
		},
		{
			q: 'Comment tester que ce code ne peut pas rester bloqué ?',
			options: [
				'Le pointer vers une URL qui renvoie 404 et vérifier l’erreur',
				'Le pointer vers une URL dont le nom ne se résout pas en DNS',
				'Le pointer vers un serveur qui accepte la requête et ne répond jamais',
				'Le pointer vers un gros fichier et mesurer le temps pris'
			],
			answer: 2,
			why: 'Un 404 et un échec DNS sont rejetés vite et marchaient déjà. Seul un serveur muet montre que le timeout se déclenche et qu’un message revient quand même.'
		}
	],
	recall: {
		q: 'Le serveur accepte la connexion et ne répond jamais. Qu’envoie le content script corrigé au panneau, et quand ?',
		a: '`fetch-file-with-cache-error`, au bout de 60 secondes. `AbortSignal.timeout(60000)` fait rejeter le fetch, et le handler `error => reject(null)` déjà présent envoie le message d’erreur.'
	},
	sources: [
		{ title: 'react, pull request #34566', url: `${REACT}/pull/34566` },
		{ title: 'MDN : AbortSignal.timeout()', url: 'https://developer.mozilla.org/fr/docs/Web/API/AbortSignal/timeout_static' }
	]
};
