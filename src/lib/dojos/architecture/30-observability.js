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
		'You have three questions. **What happened to this one request?** Logs answer that. **Is it everyone, and since when?** Metrics answer that. **Where did the ten seconds go?** Traces answer that.',
		'Each tool alone gives you a piece. The trick is to link them: **one trace id on every log line and every span** of a request, and the same span names in the metrics. Then you jump from a graph to a log line to its trace.'
	],
	terms: [
		{ term: 'Structured log', def: 'One event per line as fields (JSON), not a sentence. You can filter `level=error AND service.name=payment` instead of grepping prose.' },
		{ term: 'Trace and span', def: 'A trace is the whole journey of one request. A span is one step in it, with a start, a duration, a parent and attributes.' },
		{ term: 'Trace context', def: 'The trace id and parent span id, passed from service to service in a header (`traceparent` in the W3C standard). It ties the pieces of one request together.' },
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
				note: '**One trace across services.** This is the OpenTelemetry demo, an online shop. Checkout calls payment through a gRPC client [wrapped by `otelgrpc`](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/checkout/main.go#L476), which sends the trace context along. Payment\'s spans join the same trace.'
			},
			{
				add: ['pay -->|"OTLP: spans, logs, metrics"| col["OpenTelemetry Collector"]'],
				highlight: ['col'],
				note: '**One pipe for all three.** Every service sends its telemetry over OTLP to the Collector. The Collector can change it on the way: here it [deletes the card CVV and masks the card number](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/otel-collector/otelcol-config.yml#L216-L252) before anything is stored.'
			},
			{
				add: ['col -->|"traces"| jaeger[("Jaeger")]', 'col -->|"logs"| os[("OpenSearch")]', 'class jaeger,os ext'],
				highlight: ['jaeger', 'os'],
				note: '**Traces and logs go to their own stores.** The demo\'s observability config [exports traces to Jaeger and logs to OpenSearch](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/otel-collector/otelcol-config-observability.yml#L64-L72). A log line carries `trace_id`, so you jump from one to the other.'
			},
			{
				add: ['col -->|"span_metrics: calls and duration"| prom[("Prometheus")]', 'class prom ext'],
				highlight: ['prom'],
				note: '**RED metrics from spans.** The Collector\'s `span_metrics` connector [reads the trace pipeline and feeds the metrics one](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/otel-collector/otelcol-config.yml#L254-L266). It counts calls per service, span name and status, and records their duration. Rate, errors and duration, without a line of metric code.'
			},
			{
				add: ['prom -->|"rule: users are hurting"| oncall(["on-call human"])'],
				highlight: ['oncall'],
				note: '**Alerts close the loop.** The rule is yours to write: alert on the error ratio and the slow requests users feel. A metric nobody alerts on is a graph nobody looks at.'
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
			'**All three signals in one function.** A `charge` span with business attributes, one structured log line, one counter. On failure the span records the exception and an `ERROR` status. The [gRPC handler](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/payment/index.js#L12-L32) sets the same `ERROR` status on the request\'s server span.',
			'**The trace id is not in this code.** The [logger](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/payment/logger.js#L6-L17) is plain pino writing JSON. The Node auto-instrumentation, [loaded through `NODE_OPTIONS`](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/payment/Dockerfile#L40), patches pino to [add `trace_id` and `span_id`](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/7ca98fb0e7abb9068d21fc9f6e9e5399db42750a/packages/instrumentation-pino/README.md?plain=1#L65-L94) to every line written inside a span. Nobody has to remember to add them.',
			'**Labels stay small.** The counter is labelled by currency only, a short list. The `transactionId` goes in the log line, never in a label: one label value per transaction would make one time series per transaction.',
			'**Telemetry leaks.** With the `emitRawPii` flag on ([off by default](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/flagd/demo.flagd.json#L86-L97)), the span carries the card number and CVV. The Collector strips them, but its own comment calls that "a fallback" and says to "prefer not collecting sensitive data in the first place".'
		]
	},
	tradeoff: {
		gain: [
			'You answer "what happened?" from data instead of from a reproduction you may never get.',
			'One trace id across logs and spans turns an hour of grepping into one click.',
			'RED metrics per service and span show "is it everyone?" at a glance, and symptom alerts wake you before the users write in.'
		],
		cost: [
			'**Volume costs money.** Logs and traces grow with traffic. A common answer is to sample traces and keep logs for less time than metrics.',
			'**Label cardinality.** A label holding a URL, a user id or a transaction id creates one time series per value. The metric store grows until it falls over.',
			'**Alert fatigue.** Alerts on causes (CPU, one failed check) fire often and mean little. People learn to ignore pages, including the real one.'
		]
	},
	task: {
		prompt: 'Write one SLO and one alert for the shop\'s payment service, using only the span metrics: `traces.span.metrics.calls` and `traces.span.metrics.duration`, by `service.name`, `span.name`, `span.kind` and `status.code`. Careful: `charge` sets an `ERROR` status when the card is invalid or expired.',
		hint: 'An SLO needs good events over all events. Is an expired card the service\'s fault or the customer\'s?',
		answer: [
			'Availability SLI: payment server spans whose status is not `Error`, over all of them. But an expired card also counts as `Error` today, so the SLI would blame you for your customers\' cards.',
			'Fix the signal first: tell "the caller\'s fault" from "our fault" in the code (for example a different error type or gRPC status), and add that as a dimension on the connector. Then count only your faults.',
			'Latency SLI: share of payment server spans under 1 s, read from the duration histogram.',
			'Target: 99.5% available and 95% under 1 s, over 28 days. Pick numbers users notice, not numbers that look good.',
			'Page on the burn rate, not on one bad minute. The SRE workbook suggests starting with 2% of the budget spent in 1 hour or 5% in 6 hours for a page, and 10% in 3 days for a ticket.',
			'Do not page on CPU or one pod restarting. They are causes. Look at them after the symptom alert fires.'
		]
	},
	quiz: [
		{
			q: 'Every log line your service writes inside a span carries `trace_id` and `span_id`. What does that let you do?',
			options: [
				'Replay the request exactly as it was sent',
				'Jump from an error log line to the full trace of that request, across every service it touched',
				'Drop your metrics, since logs now hold the same data',
				'Guarantee that no log line is lost on the way to the log store'
			],
			answer: 1,
			why: 'The trace id is the shared key. It finds the spans of the whole journey from one log line, and the log lines from one span. It does not replay, replace metrics, or make delivery reliable.'
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
				'CPU above 80% for 5 minutes',
				'One health check failed once',
				'A pod restarted'
			],
			answer: 0,
			why: 'It measures what users feel. CPU, a single failed check and a restart are causes; they belong on a dashboard you open after a symptom alert fires.'
		}
	],
	takeaway: 'Put one trace id in every log line and span, measure rate, errors and duration per service, keep labels small, and page only when users feel it.',
	sources: [
		{ title: 'Google SRE book, Monitoring distributed systems (the four golden signals)', url: 'https://sre.google/sre-book/monitoring-distributed-systems/' },
		{ title: 'Google SRE workbook, Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
		{ title: 'OpenTelemetry, Observability primer', url: 'https://opentelemetry.io/docs/concepts/observability-primer/' },
		{ title: 'Grafana Labs, The RED Method: how to instrument your services (Tom Wilkie)', url: 'https://grafana.com/blog/the-red-method-how-to-instrument-your-services/' },
		{ title: 'Span Metrics Connector, README', url: `${COL}/connector/spanmetricsconnector/README.md` }
	]
};
