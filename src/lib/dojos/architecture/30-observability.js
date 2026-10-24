const DEMO = 'https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414';
const COL = 'https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/6ebbfa7fdbd74836ef0675fd13db1ba1041f09eb';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'observability',
	part: 'The pattern toolbox',
	title: 'Observability: logs, metrics, traces',
	minutes: 10,
	hook: [
		'A customer of your online shop writes: "Checkout took ten seconds, then my payment failed." The request went through the frontend, the checkout service, then the payment service. You were not there.',
		'Logs answer "what happened to this one request?". Metrics answer "is it everyone, and since when?". Traces answer "where did the ten seconds go?".',
		'To answer all three for one request, you link the tools: **one trace id on every log line and every span** of a request, and the same span names in the metrics. Then you jump from a graph to a log line to its trace.'
	],
	terms: [
		{ term: 'Trace and span', def: 'A trace records the path of one request through every service. A span is one step in it, with a start, a duration, a parent and attributes.' },
		{ term: 'RED metrics', def: 'For a service: Rate (requests per second), Errors (how many fail), Duration (how long they take).' },
		{ term: 'SLO', def: 'A target for what users feel, over a window. "99.5% of payments succeed over 28 days." The 0.5% left is your error budget.' },
		{ term: 'Symptom alert', def: 'Page a human when users are hurting (errors, slowness), not when a cause might hurt them later (CPU at 80%).' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'shop(["Shopper"]) --> fe["frontend"]',
					'fe -->|"trace context"| co["checkout"]',
					'co -->|"gRPC, same trace id"| pay["payment: charge span"]'
				],
				highlight: ['fe', 'co', 'pay'],
				note: 'In the OpenTelemetry demo, an online shop, checkout calls payment through a gRPC client [wrapped by `otelgrpc`](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/checkout/main.go#L476), which sends the trace context (the trace id and the parent span id) along. Payment\'s spans join the same trace.'
			},
			{
				add: ['pay -->|"OTLP: spans, logs, metrics"| col["OpenTelemetry Collector"]'],
				highlight: ['col'],
				note: 'Every service sends all three signals over OTLP to the Collector. The Collector can change it on the way: here it [deletes the card CVV and masks the card number](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/otel-collector/otelcol-config.yml#L216-L252) before anything is stored.'
			},
			{
				add: ['col -->|"traces"| jaeger[("Jaeger")]', 'col -->|"logs"| os[("OpenSearch")]', 'class jaeger,os ext'],
				highlight: ['jaeger', 'os'],
				note: 'The demo\'s observability config [exports traces to Jaeger and logs to OpenSearch](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/otel-collector/otelcol-config-observability.yml#L64-L72). A log line carries `trace_id`, so you can jump from a log line in OpenSearch to its trace in Jaeger.'
			},
			{
				add: ['col -->|"span_metrics: calls and duration"| prom[("Prometheus")]', 'class prom ext'],
				highlight: ['prom'],
				note: 'The Collector\'s `span_metrics` connector [reads the trace pipeline and feeds the metrics one](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/otel-collector/otelcol-config.yml#L254-L266). It counts calls per service, span name and status, and records their duration. That gives rate, errors and duration (RED) without a line of metric code.'
			},
			{
				add: ['prom -->|"rule: users are hurting"| oncall(["on-call human"])'],
				highlight: ['oncall'],
				note: 'You write the alert rule yourself: alert on the error ratio and on the slow requests users feel. Without an alert, someone has to be looking at the graph to notice the problem.'
			}
		]
	},
	example: {
		title: 'src/payment/charge.js, the charge function',
		repo: 'open-telemetry/opentelemetry-demo',
		url: `${DEMO}/src/payment/charge.js#L13-L116`,
		lang: 'js',
		code: `const tracer = trace.getTracer('payment');
const meter = metrics.getMeter('payment');
const transactionsCounter = meter.createCounter('demo.payment.transactions', {
  unit: '{transaction}',
});
…
module.exports.charge = async request => {
  const span = tracer.startSpan('charge');

  try {
    …
    const card = cardValidator(number);
    const { card_type: cardType, valid } = card.getCardDetails();

    const loyalty_level = random(LOYALTY_LEVEL);

    span.setAttributes({
      'demo.payment.card_type': cardType,
      'demo.payment.card_valid': valid,
      'demo.user_context.loyalty_level': loyalty_level,
      ...(emitRawPii && {
        'demo.payment.card_number': number,
        'demo.payment.card_cvv': cvv
      })
    });

    if (!valid) {
      throw new Error('Credit card info is invalid.');
    }
    …
    const { units, nanos, currencyCode } = request.amount;
    logger.info({ transactionId, cardType, lastFourDigits, amount: { units, nanos, currencyCode }, loyalty_level }, 'Transaction complete.');
    transactionsCounter.add(1, { 'demo.payment.currency': currencyCode });

    return { transactionId };
  } catch (err) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.setAttribute(ATTR_ERROR_TYPE, err.name || 'Error');

    throw err;
  } finally {
    span.end();
  }
};`,
		notes: [
			'This function emits all three signals: the `charge` span on line 8, one structured log line on line 32, and one counter on line 33. On failure, lines 37 to 39 record the exception and an `ERROR` status on the span. The [gRPC handler](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/payment/index.js#L12-L32) sets the same `ERROR` status on the request\'s server span.',
			'This code never writes the trace id: the logger is plain pino writing JSON. The Node auto-instrumentation, loaded through `NODE_OPTIONS`, patches pino to [add `trace_id` and `span_id`](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/7ca98fb0e7abb9068d21fc9f6e9e5399db42750a/packages/instrumentation-pino/README.md?plain=1#L65-L94) to every line written inside a span, so nobody has to add them by hand.',
			'Line 33 labels the counter by currency only, a short list. The `transactionId` goes in the log line on line 32, never in a label: one label value per transaction would make one time series per transaction.',
			'Lines 21 to 24 can leak card data. With the `emitRawPii` flag on ([off by default](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/flagd/demo.flagd.json#L86-L97)), the span carries the card number and CVV. The Collector strips them, but its own comment calls that "a fallback" and says to "prefer not collecting sensitive data in the first place".'
		]
	},
	tradeoff: {
		gain: [
			'You answer "what happened?" from data instead of from a reproduction you may never get.',
			'With one trace id across logs and spans, you open a request\'s trace from its log line in one click instead of grepping each service\'s logs.',
			'RED metrics per service and span show "is it everyone?" at a glance, and symptom alerts wake you before the users write in.'
		],
		cost: [
			'Logs and traces grow with traffic, and storing them costs money. A common answer is to sample traces and keep logs for less time than metrics.',
			'A label holding a URL, a user id or a transaction id creates one time series per value, so the metric store grows until it falls over.',
			'Alerts on causes (CPU, one failed check) fire often and rarely mean users are affected. People learn to ignore pages, including the real one.'
		]
	},
	task: {
		prompt: 'Write one SLO and one alert for the shop\'s payment service, using only the span metrics: `traces.span.metrics.calls` and `traces.span.metrics.duration`, by `service.name`, `span.name`, `span.kind` and `status.code`. Careful: `charge` sets an `ERROR` status when the card is invalid or expired.',
		hint: 'An SLO needs good events over all events. Is an expired card the service\'s fault or the customer\'s?',
		answer: [
			'Availability SLI: payment server spans whose status is not `Error`, over all of them. But an expired card also counts as `Error` today, so the SLI would blame you for your customers\' cards.',
			'Fix the signal first: tell "the caller\'s fault" from "our fault" in the code (for example a different error type or gRPC status), and add that as a dimension on the connector. Then count only your faults.',
			'Latency SLI: share of payment server spans under 1 s, read from the duration histogram.',
			'Target: 99.5% available and 95% under 1 s, over 28 days.',
			'Page on the burn rate, the speed at which the error budget is spent, instead of on one bad minute. The SRE workbook suggests starting with 2% of the budget spent in 1 hour or 5% in 6 hours for a page, and 10% in 3 days for a ticket.',
			'Do not page on CPU or one pod restarting: they are causes, and you look at them after the symptom alert fires.'
		],
		steps: [
			{
				title: 'Pick the good events',
				questions: [
					{ q: 'What ratio does an SLO need?', options: ['Good events over all events', 'Errors over CPU time', 'Spans over log lines', 'Calls per pod'], answer: 0, why: 'An SLI is the share of events that went well, and the SLO is a target for it.' },
					{ q: 'Which spans make the first availability SLI?', options: ['Every span of the whole shop', 'Payment server spans whose status is not `Error`, over all of them', 'Only checkout\'s client spans', 'Spans that carry a `transactionId`'], answer: 1, why: 'The SLO is for the payment service, so you count the requests it served.' },
					{ q: 'What status does `charge` set today for an expired card?', options: ['`Ok`', '`Unset`', '`Error`', 'No span is created'], answer: 2, why: 'The task warns that `charge` sets `ERROR` when the card is invalid or expired.' },
					{ q: 'So what is wrong with that first SLI?', options: ['It counts too few spans', 'It needs a log line per span', 'It cannot be read from span metrics', 'It blames the service for its customers\' cards'], answer: 3, why: 'An expired card is the customer\'s problem, and the SLI counts it as yours.' }
				]
			},
			{
				title: 'Fix the signal',
				questions: [
					{ q: 'What do you fix first?', options: ['Tell "the caller\'s fault" from "our fault" in the code', 'Lower the target until it passes', 'Drop the availability SLI', 'Alert on CPU instead'], answer: 0, why: 'The SLI can only be as honest as the signal under it.' },
					{ q: 'How can the code tell the two apart?', options: ['A longer timeout', 'A different error type or gRPC status', 'A log line with the card number', 'A retry on every failure'], answer: 1, why: 'Different errors give different values, and the metrics can then split on them.' },
					{ q: 'Where does that distinction go next?', options: ['Into the card number attribute', 'Into the liveness probe', 'As a dimension on the span metrics connector', 'Into a separate pod'], answer: 2, why: 'A new dimension on the connector shows it in the metrics, so you count only your faults.' },
					{ q: 'The new dimension is in place. Which payment spans count as bad events in the availability SLI now?', options: ['Every span with an `Error` status', 'Only spans slower than 1 s', 'None: errors never count', 'Only `Error` spans marked as our fault, not the card\'s'], answer: 3, why: 'An expired card is a good event for the service: it answered correctly. Only failures the service caused spend the budget.' }
				]
			},
			{
				title: 'Write the SLO',
				questions: [
					{ q: 'What is the latency SLI?', options: ['The share of payment server spans under 1 s, from the duration histogram', 'The average duration of every span', 'The slowest call of each day', 'CPU time per call'], answer: 0, why: 'A share under a threshold reads straight from the histogram, and it says how many users waited.' },
					{ q: 'Which target does the chapter propose?', options: ['100% available, always', '99.5% available and 95% under 1 s, over 28 days', '99.5% available over 1 hour', '95% available and 99.5% under 1 s'], answer: 1, why: 'Two targets, one window: 99.5% available, 95% under 1 s, over 28 days.' },
					{ q: 'With 99.5% available over 28 days, what is the error budget?', options: ['5% of payments', '0.05% of payments', '0.5% of payments', '99.5% of payments'], answer: 2, why: 'The 0.5% left over is the error budget.' },
					{ q: 'Why set the SLO over a window like 28 days?', options: ['Metrics expire after 28 days', 'Prometheus requires that window', 'It makes alerts fire faster', 'An SLO is a target over a window, so one bad minute does not break it'], answer: 3, why: 'The window is what lets you spend a budget instead of failing on every blip.' }
				]
			},
			{
				title: 'Write the alert',
				questions: [
					{ q: 'What do you page on?', options: ['The burn rate', 'One bad minute', 'CPU at 80%', 'One pod restarting'], answer: 0, why: 'The burn rate says users are hurting fast enough to spend the budget.' },
					{ q: 'What is the burn rate?', options: ['The CPU used by the payment pods', 'The speed at which the error budget is spent', 'The number of requests per second', 'The share of spans that are sampled'], answer: 1, why: 'A high burn rate means the budget will run out well before the window ends.' },
					{ q: 'Which thresholds does the SRE workbook suggest as a start for a page?', options: ['10% of the budget in 3 days', '50% of the budget in 1 minute', '2% of the budget in 1 hour, or 5% in 6 hours', '1% of the budget in 28 days'], answer: 2, why: 'For a page, the workbook suggests 2% of the budget in 1 hour or 5% in 6 hours. 10% in 3 days is the threshold for a ticket.' },
					{ q: 'Payments burn 10% of the budget over 3 days, and no page threshold is crossed. What does the workbook suggest?', options: ['Page at once', 'Nothing: it is within budget', 'Turn the SLO off', 'Open a ticket for working hours'], answer: 3, why: 'A slow burn still needs fixing, but not at 3 a.m. 10% in 3 days is the workbook\'s threshold for a ticket.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Every log line your service writes inside a span carries `trace_id` and `span_id`. What does that let you do?',
			options: [
				'Replay the request exactly as it was sent, with the same headers and body',
				'Jump from an error log line to the full trace of that request, across every service',
				'Drop your metrics, since the logs now hold the same numbers with more detail',
				'Guarantee that no log line is lost between your service and the log store'
			],
			answer: 1,
			why: 'Logs and spans share the trace id, so it finds the spans of the whole journey from one log line, and the log lines from one span. It does not replay, replace metrics, or make delivery reliable.'
		},
		{
			q: 'Why label a request metric by span name or route template, like `get_shipping/{shippingId}`, and not by the full URL?',
			options: [
				'Prometheus rejects slashes in label values',
				'Route templates are shorter to type in dashboards',
				'The full URL is already in the trace, so the metric store would drop it as a duplicate',
				'Each distinct URL would create a new time series, and URLs can carry user data'
			],
			answer: 3,
			why: 'Every unique set of label values is its own time series. Ids in URLs make that set unbounded. A query string can also hold a search term or a token, which then lives in your metric store.'
		},
		{
			q: 'Which alert follows "alert on symptoms"?',
			options: [
				'More than 2% of payments failed with a server error over the last hour',
				'CPU above 80% on the payment servers for 5 minutes in a row',
				'The health check of one payment pod failed once in the last hour',
				'A payment pod restarted three times in the last hour after a crash'
			],
			answer: 0,
			why: 'Users see every failed payment, so this alert fires when they are affected. CPU, a single failed check and restarts are causes; they belong on a dashboard you open after a symptom alert fires.'
		}
	],
	recall: {
		q: 'A payment failed after ten seconds. Which signal answers which question, and what links the three?',
		a: 'Logs say what happened to the request, metrics say whether it is everyone and since when, and traces show where the ten seconds went. The trace id on every log line and span links them.'
	},
	sources: [
		{ title: 'Google SRE book, Monitoring distributed systems (the four golden signals)', url: 'https://sre.google/sre-book/monitoring-distributed-systems/' },
		{ title: 'Google SRE workbook, Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
		{ title: 'OpenTelemetry, Observability primer', url: 'https://opentelemetry.io/docs/concepts/observability-primer/' },
		{ title: 'Grafana Labs, The RED Method: how to instrument your services (Tom Wilkie)', url: 'https://grafana.com/blog/the-red-method-how-to-instrument-your-services/' },
		{ title: 'Span Metrics Connector, README', url: `${COL}/connector/spanmetricsconnector/README.md` },
		{ title: 'OpenTelemetry demo, src/payment/logger.js (pino)', url: `${DEMO}/src/payment/logger.js#L6-L17` },
		{ title: 'OpenTelemetry demo, src/payment/Dockerfile (auto-instrumentation through NODE_OPTIONS)', url: `${DEMO}/src/payment/Dockerfile#L40` }
	]
};
