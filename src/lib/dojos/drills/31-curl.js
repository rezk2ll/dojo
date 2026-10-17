/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'curl',
	part: 'Text and data',
	title: 'curl',
	minutes: 10,
	hook: [
		'You just deployed the `orders` service and it listens on `http://localhost:8080`. The browser shows a blank page, so you test each endpoint from the terminal with curl. curl exits with 0 even when the server answers 404, unless you ask it to fail.',
		'The endpoints: `/health` returns `ok`. `/docs` answers 301 with `Location: /docs/`. `/export/orders.csv` returns a CSV file. `GET /api/orders` needs the header `Authorization: Bearer abc123`. `POST /api/orders` creates an order from JSON. `/api/orders/42` accepts POST and DELETE. `/missing` returns 404. Type every URL in full, with `http://`.'
	],
	terms: [
		{ term: 'Status code', def: 'The three-digit number the server puts on the first line of its answer: 200 for OK, 301 for moved, 404 for not found.' },
		{ term: 'Header', def: 'A `Name: value` line sent before the body, by the client in the request or by the server in the response.' },
		{ term: 'Method', def: 'The verb at the start of an HTTP request: GET, HEAD, POST, DELETE. curl sends GET unless an option changes it.' },
		{ term: 'Exit code', def: 'The number curl returns to the shell when it ends. `0` means the transfer worked; `22` means `--fail` saw a status of 400 or more.' }
	],
	reps: [
		{
			prompt: 'Fetch `http://localhost:8080/health` and print the response headers above the body.',
			accept: [
				'curl -i http://localhost:8080/health',
				'curl --include http://localhost:8080/health',
				'curl --show-headers http://localhost:8080/health',
				'curl http://localhost:8080/health -i',
				'curl http://localhost:8080/health --include',
				'curl http://localhost:8080/health --show-headers'
			],
			why: '`-i` writes the status line and the response headers to the same output as the body. Since curl 8.10.0 its long name is `--show-headers`; the old name `--include` still works.'
		},
		{
			prompt: 'Ask `http://localhost:8080/health` for its headers only, with a HEAD request.',
			accept: [
				'curl -I http://localhost:8080/health',
				'curl --head http://localhost:8080/health',
				'curl http://localhost:8080/health -I',
				'curl http://localhost:8080/health --head'
			],
			why: '`-I` sends the HEAD method, so the server returns the headers and no body. `-X HEAD` only changes the word in the request line; the curl docs say a proper HEAD request needs `--head`.'
		},
		{
			prompt: '`http://localhost:8080/docs` answers 301. Fetch it so that curl follows the redirect and prints the final page.',
			accept: [
				'curl -L http://localhost:8080/docs',
				'curl --location http://localhost:8080/docs',
				'curl http://localhost:8080/docs -L',
				'curl http://localhost:8080/docs --location'
			],
			why: '`-L` makes curl read the `Location:` header of a 3xx answer and send the request again to that place. Without it, curl prints the empty 301 body and stops.'
		},
		{
			prompt: 'Download `http://localhost:8080/export/orders.csv` into a file named `orders-2026.csv`, with a curl option (no shell redirect).',
			accept: [
				'curl -o orders-2026.csv http://localhost:8080/export/orders.csv',
				'curl --output orders-2026.csv http://localhost:8080/export/orders.csv',
				'curl http://localhost:8080/export/orders.csv -o orders-2026.csv',
				'curl http://localhost:8080/export/orders.csv --output orders-2026.csv'
			],
			why: '`-o orders-2026.csv` writes the body to that file instead of stdout. `-O` would keep the remote name, `orders.csv`.'
		},
		{
			prompt: 'List the orders: GET `http://localhost:8080/api/orders` with the header `Authorization: Bearer abc123`.',
			accept: [
				"curl -H 'Authorization: Bearer abc123' http://localhost:8080/api/orders",
				'curl -H "Authorization: Bearer abc123" http://localhost:8080/api/orders',
				"curl --header 'Authorization: Bearer abc123' http://localhost:8080/api/orders",
				'curl --header "Authorization: Bearer abc123" http://localhost:8080/api/orders',
				"curl http://localhost:8080/api/orders -H 'Authorization: Bearer abc123'",
				'curl http://localhost:8080/api/orders -H "Authorization: Bearer abc123"'
			],
			why: '`-H` adds one header to the request. The quotes keep `Authorization: Bearer abc123` as one argument, because it contains spaces.'
		},
		{
			prompt: 'Mark order 42 as paid: send the form field `status=paid` to `http://localhost:8080/api/orders/42` as a POST.',
			accept: [
				'curl -d status=paid http://localhost:8080/api/orders/42',
				"curl -d 'status=paid' http://localhost:8080/api/orders/42",
				'curl -d "status=paid" http://localhost:8080/api/orders/42',
				'curl --data status=paid http://localhost:8080/api/orders/42',
				"curl --data 'status=paid' http://localhost:8080/api/orders/42",
				'curl -X POST -d status=paid http://localhost:8080/api/orders/42',
				"curl -X POST -d 'status=paid' http://localhost:8080/api/orders/42",
				'curl http://localhost:8080/api/orders/42 -d status=paid'
			],
			why: '`-d status=paid` puts the data in the request body and switches the method to POST, with `Content-Type: application/x-www-form-urlencoded`. `-X POST` is allowed but changes nothing here.'
		},
		{
			prompt: 'Delete order 42 with a DELETE request to `http://localhost:8080/api/orders/42`.',
			accept: [
				'curl -X DELETE http://localhost:8080/api/orders/42',
				'curl --request DELETE http://localhost:8080/api/orders/42',
				'curl http://localhost:8080/api/orders/42 -X DELETE',
				'curl http://localhost:8080/api/orders/42 --request DELETE'
			],
			why: '`-X DELETE` replaces the method word GET with DELETE. curl has no dedicated option for DELETE, so `-X` is the way to send it.'
		},
		{
			prompt: 'Create an order: POST the body `{"item":"mug","qty":2}` to `http://localhost:8080/api/orders`, with the one option that also sets `Content-Type` and `Accept` to `application/json`.',
			accept: [
				`curl --json '{"item":"mug","qty":2}' http://localhost:8080/api/orders`,
				`curl http://localhost:8080/api/orders --json '{"item":"mug","qty":2}'`,
				`curl -X POST --json '{"item":"mug","qty":2}' http://localhost:8080/api/orders`
			],
			why: '`--json` sends the text as the body of a POST and adds `Content-Type: application/json` and `Accept: application/json`. It was added in curl 7.82.0, and it does not check that the text is valid JSON.'
		},
		{
			prompt: 'Print only the status code of `http://localhost:8080/missing`: no body, no progress meter.',
			accept: [
				"curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/missing",
				'curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/missing',
				'curl -s -o /dev/null -w %{http_code} http://localhost:8080/missing',
				"curl -so /dev/null -w '%{http_code}' http://localhost:8080/missing",
				"curl -s -w '%{http_code}' -o /dev/null http://localhost:8080/missing",
				"curl -o /dev/null -s -w '%{http_code}' http://localhost:8080/missing",
				"curl --silent --output /dev/null --write-out '%{http_code}' http://localhost:8080/missing",
				"curl -s -o /dev/null -w '%{response_code}' http://localhost:8080/missing",
				"curl http://localhost:8080/missing -s -o /dev/null -w '%{http_code}'"
			],
			why: '`-s` hides the progress meter, `-o /dev/null` throws the body away, and `-w \'%{http_code}\'` prints the status after the transfer. Here it prints `404`, and curl still exits with 0.'
		},
		{
			prompt: 'In a deploy script, fetch `http://localhost:8080/health` so that curl exits non-zero on a status of 400 or more, shows no progress meter, and still prints its error message.',
			accept: [
				'curl -fsS http://localhost:8080/health',
				'curl -sSf http://localhost:8080/health',
				'curl -fSs http://localhost:8080/health',
				'curl -sfS http://localhost:8080/health',
				'curl -Ssf http://localhost:8080/health',
				'curl -Sfs http://localhost:8080/health',
				'curl -f -s -S http://localhost:8080/health',
				'curl --fail --silent --show-error http://localhost:8080/health'
			],
			why: '`-f` makes curl exit with 22 and print no body when the status is 400 or more. `-s` hides the progress meter and the errors, and `-S` brings the error message back, for example `curl: (22) The requested URL returned error: 404`.'
		}
	],
	quiz: [],
	recall: {
		q: 'curl gets a 404 from `/missing`. Which option makes it exit non-zero, and with which code?',
		a: '`-f` (`--fail`). curl prints no body and exits with code 22 for any status of 400 or more. Without it, curl exits with 0.'
	},
	sources: [{ title: 'curl man page', url: 'https://curl.se/docs/manpage.html' }]
}
