const REACT = 'https://github.com/facebook/react';
const PARENT = '012b371cde3157a8dd46535839fbcda6c2bed1a0';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'missing-timeout',
	part: 'State and time',
	title: 'A fetch that never has to answer',
	minutes: 10,
	hook: [
		'The React DevTools browser extension reads source maps to map component code back to your files. When it cannot find a file among what the page already loaded, the DevTools panel asks a content script in the page to fetch it.',
		'The content script fetches the URL and sends back one message: `fetch-file-with-cache-complete` with the text, or `fetch-file-with-cache-error`. The panel waits for that message and has **no other way to finish**. Find the call that can keep it waiting forever.'
	],
	terms: [
		{ term: 'Content script', def: 'Extension code that runs inside the inspected page and talks to the rest of the extension with `chrome.runtime.sendMessage`.' },
		{ term: 'AbortSignal', def: 'An object you pass to `fetch` as `signal`. When it fires, the fetch stops and its promise rejects.' },
		{ term: 'Pending promise', def: 'A promise that is neither resolved nor rejected. Code chained on it with `.then` does not run.' }
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
			'**`fetch` has no timeout of its own.** The call passes only `cache: \'force-cache\'`. If the server accepts the connection and never sends a response, the promise stays pending. Neither the success handler nor `error => reject(null)` runs, so no message goes back to the panel.',
			'**The panel waits on that message alone.** On the panel side, `fetchFileWithCaching` returns `new Promise((resolve, reject) => ...)` and settles it only from an `onMessage` listener that looks for the two reply types ([fetchFileWithCaching.js](' + REACT + '/blob/' + PARENT + '/packages/react-devtools-extensions/src/main/fetchFileWithCaching.js#L81-L109)). A fetch that never ends leaves that promise pending too, and the listener stays registered.',
			'**The fix.** `AbortSignal.timeout(60000)` fires after 60 seconds. The fetch then rejects with a `TimeoutError`, the `error => reject(null)` branch runs, and the panel gets `fetch-file-with-cache-error`. The signal also covers reading the body, so a response that stalls halfway makes `response.text()` reject into the `.catch`.',
			'**What the commit says.** "this adds a timeout of 60 seconds to all fetch requests initiated by fileFetcher content script." The same pull request also stops the panel from sending the same URL twice while a request is in flight.'
		]
	},
	quiz: [
		{
			q: 'The server accepts the connection and never answers. What does the buggy content script send to the panel?',
			options: [
				'Nothing: neither `resolve` nor `reject` is ever called',
				'An error message after the browser\'s default 30 second timeout',
				'A complete message with an empty string as the text',
				'An error message as soon as `force-cache` misses'
			],
			answer: 0,
			why: 'Both messages are sent from handlers chained on the fetch promise. A promise that stays pending runs none of them.'
		},
		{
			q: 'Why is a timeout on the fetch enough to unblock the panel?',
			options: [
				'The timeout makes the browser retry the request from its cache',
				'It turns the hang into a rejection, which already sends the error',
				'The panel reads the timeout value and stops listening by itself',
				'`AbortSignal.timeout` closes the content script and its listener'
			],
			answer: 1,
			why: 'The code already turns a rejection into `fetch-file-with-cache-error`. The timeout only has to turn "pending forever" into a rejection.'
		},
		{
			q: 'How would you test that this code cannot hang?',
			options: [
				'Point it at a URL that returns 404 and check for an error',
				'Point it at a URL that does not resolve in DNS',
				'Point it at a server that accepts the request and never responds',
				'Point it at a large file and measure how long it takes'
			],
			answer: 2,
			why: 'A 404 and a DNS failure both reject quickly and already worked. Only a server that stays silent shows that the timeout fires and a message still comes back.'
		}
	],
	takeaway: 'For every network call, find what makes it stop if the other side never answers. With `fetch`, that is a `signal`, such as `AbortSignal.timeout(ms)`. Test it with a server that accepts the request and stays silent.',
	sources: [
		{ title: 'react pull request #34566', url: `${REACT}/pull/34566` },
		{ title: 'MDN: AbortSignal.timeout()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static' }
	]
};
