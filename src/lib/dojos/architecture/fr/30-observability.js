const DEMO = 'https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414';
const COL = 'https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/6ebbfa7fdbd74836ef0675fd13db1ba1041f09eb';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'observability',
	part: 'La boîte à patterns',
	title: 'Observabilité : logs, métriques, traces',
	minutes: 10,
	hook: [
		'Un client de ta boutique en ligne écrit : « Le paiement a mis dix secondes, puis il a échoué. » La requête est passée par le frontend, le service checkout, puis le service de paiement. Tu n’étais pas là.',
		'Tu as trois questions. **Qu’est-il arrivé à cette requête-là ?** Les logs y répondent. **Est-ce que ça touche tout le monde, et depuis quand ?** Les métriques y répondent. **Où sont passées les dix secondes ?** Les traces y répondent.',
		'Chaque outil seul te donne un morceau. L’astuce, c’est de les relier : **un même trace id sur chaque ligne de log et chaque span** d’une requête, et les mêmes noms de spans dans les métriques. Tu sautes alors d’un graphe à une ligne de log, puis à sa trace.'
	],
	terms: [
		{ term: 'Log structuré', def: 'Un événement par ligne, sous forme de champs (JSON), pas une phrase. Tu peux filtrer `level=error AND service.name=payment` au lieu de faire des grep dans de la prose.' },
		{ term: 'Trace et span', def: 'Une trace, c’est le trajet complet d’une requête. Un span, c’est une étape de ce trajet, avec un début, une durée, un parent et des attributs.' },
		{ term: 'Trace context', def: 'Le trace id et l’id du span parent, transmis de service en service dans un header (`traceparent` dans le standard W3C). C’est lui qui relie les morceaux d’une même requête.' },
		{ term: 'Métriques RED', def: 'Pour un service : Rate (requêtes par seconde), Errors (combien échouent), Duration (combien de temps elles prennent).' },
		{ term: 'SLO', def: 'Un objectif sur ce que ressentent les utilisateurs, sur une fenêtre de temps. « 99,5 % des paiements réussissent sur 28 jours. » Les 0,5 % restants sont ton error budget.' },
		{ term: 'Alerte sur symptôme', def: 'Réveille un humain quand les utilisateurs souffrent (erreurs, lenteur), pas quand une cause pourrait les faire souffrir plus tard (CPU à 80 %).' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'shop(["Client"]) --> fe["frontend"]',
					'fe -->|"trace context"| co["checkout"]',
					'co -->|"gRPC, même trace id"| pay["payment : span charge"]'
				],
				highlight: ['fe', 'co', 'pay'],
				note: '**Une trace à travers les services.** Voici la démo OpenTelemetry, une boutique en ligne. Le checkout appelle le paiement via un client gRPC [enveloppé par `otelgrpc`](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/checkout/main.go#L476), qui transmet le trace context. Les spans du paiement rejoignent la même trace.'
			},
			{
				add: ['pay -->|"OTLP : spans, logs, métriques"| col["OpenTelemetry Collector"]'],
				highlight: ['col'],
				note: '**Un seul tuyau pour les trois.** Chaque service envoie sa télémétrie en OTLP au Collector. Le Collector peut la modifier au passage : ici, il [supprime le CVV de la carte et masque le numéro de carte](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/otel-collector/otelcol-config.yml#L216-L252) avant que quoi que ce soit ne soit stocké.'
			},
			{
				add: ['col -->|"traces"| jaeger[("Jaeger")]', 'col -->|"logs"| os[("OpenSearch")]', 'class jaeger,os ext'],
				highlight: ['jaeger', 'os'],
				note: '**Traces et logs vont chacun dans leur store.** La config d’observabilité de la démo [exporte les traces vers Jaeger et les logs vers OpenSearch](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/otel-collector/otelcol-config-observability.yml#L64-L72). Une ligne de log porte le `trace_id`, donc tu sautes de l’un à l’autre.'
			},
			{
				add: ['col -->|"span_metrics : appels et durée"| prom[("Prometheus")]', 'class prom ext'],
				highlight: ['prom'],
				note: '**Des métriques RED à partir des spans.** Le connecteur `span_metrics` du Collector [lit le pipeline de traces et alimente celui des métriques](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/otel-collector/otelcol-config.yml#L254-L266). Il compte les appels par service, nom de span et statut, et enregistre leur durée. Débit, erreurs et durée, sans une ligne de code de métrique.'
			},
			{
				add: ['prom -->|"règle : les utilisateurs souffrent"| oncall(["humain d’astreinte"])'],
				highlight: ['oncall'],
				note: '**Les alertes bouclent la boucle.** La règle, c’est à toi de l’écrire : alerte sur le taux d’erreur et sur les requêtes lentes que ressentent les utilisateurs. Une métrique sur laquelle personne n’alerte est un graphe que personne ne regarde.'
			}
		]
	},
	example: {
		title: 'src/payment/charge.js, la fonction charge',
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
			'**Les trois signaux dans une seule fonction.** Un span `charge` avec des attributs métier, une ligne de log structurée, un compteur. En cas d’échec, le span enregistre l’exception et un statut `ERROR`. Le [handler gRPC](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/payment/index.js#L12-L32) pose le même statut `ERROR` sur le span serveur de la requête.',
			'**Le trace id n’est pas dans ce code.** Le [logger](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/payment/logger.js#L6-L17) est un simple pino qui écrit du JSON. L’auto-instrumentation Node, [chargée via `NODE_OPTIONS`](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/payment/Dockerfile#L40), patche pino pour [ajouter `trace_id` et `span_id`](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/7ca98fb0e7abb9068d21fc9f6e9e5399db42750a/packages/instrumentation-pino/README.md?plain=1#L65-L94) à chaque ligne écrite dans un span. Personne n’a besoin de penser à les ajouter.',
			'**Les labels restent petits.** Le compteur n’a qu’un label, la devise, une liste courte. Le `transactionId` va dans la ligne de log, jamais dans un label : une valeur de label par transaction créerait une série temporelle par transaction.',
			'**La télémétrie fuit.** Avec le flag `emitRawPii` activé ([désactivé par défaut](https://github.com/open-telemetry/opentelemetry-demo/blob/685fc4022c8a65488735d2770a76b5e6b5c6b414/src/flagd/demo.flagd.json#L86-L97)), le span porte le numéro de carte et le CVV. Le Collector les retire, mais son propre commentaire appelle ça « un filet de secours » et conseille de « préférer ne pas collecter de données sensibles dès le départ ».'
		]
	},
	tradeoff: {
		gain: [
			'Tu réponds à « que s’est-il passé ? » avec des données, plutôt qu’avec une reproduction que tu n’obtiendras peut-être jamais.',
			'Un même trace id dans les logs et les spans transforme une heure de grep en un clic.',
			'Les métriques RED par service et par span montrent d’un coup d’œil si « ça touche tout le monde », et les alertes sur symptôme te réveillent avant que les utilisateurs n’écrivent.'
		],
		cost: [
			'**Le volume coûte de l’argent.** Les logs et les traces grossissent avec le trafic. Une réponse courante : échantillonner les traces et garder les logs moins longtemps que les métriques.',
			'**La cardinalité des labels.** Un label qui contient une URL, un id utilisateur ou un id de transaction crée une série temporelle par valeur. Le store de métriques grossit jusqu’à tomber.',
			'**La fatigue d’alerte.** Les alertes sur des causes (CPU, un check raté) sonnent souvent et veulent peu dire. Les gens apprennent à ignorer les pages, y compris la vraie.'
		]
	},
	task: {
		prompt: 'Écris un SLO et une alerte pour le service de paiement de la boutique, en n’utilisant que les span metrics : `traces.span.metrics.calls` et `traces.span.metrics.duration`, par `service.name`, `span.name`, `span.kind` et `status.code`. Attention : `charge` pose un statut `ERROR` quand la carte est invalide ou expirée.',
		hint: 'Un SLO a besoin des bons événements sur l’ensemble des événements. Une carte expirée, c’est la faute du service ou celle du client ?',
		answer: [
			'SLI de disponibilité : les spans serveur du paiement dont le statut n’est pas `Error`, sur l’ensemble. Mais une carte expirée compte aussi comme `Error` aujourd’hui, donc le SLI te reprocherait les cartes de tes clients.',
			'Corrige d’abord le signal : distingue « faute de l’appelant » et « notre faute » dans le code (par exemple un type d’erreur ou un statut gRPC différent), et ajoute-le comme dimension sur le connecteur. Ensuite, ne compte que tes fautes.',
			'SLI de latence : la part des spans serveur du paiement sous 1 s, lue dans l’histogramme de durée.',
			'Objectif : 99,5 % de disponibilité et 95 % sous 1 s, sur 28 jours. Choisis des chiffres que les utilisateurs remarquent, pas des chiffres qui font joli.',
			'Déclenche la page sur le burn rate, pas sur une mauvaise minute. Le SRE workbook suggère de commencer avec 2 % du budget consommé en 1 heure ou 5 % en 6 heures pour une page, et 10 % en 3 jours pour un ticket.',
			'Ne déclenche pas de page sur le CPU ou sur un pod qui redémarre. Ce sont des causes. Regarde-les après que l’alerte sur symptôme a sonné.'
		]
	},
	quiz: [
		{
			q: 'Chaque ligne de log que ton service écrit dans un span porte `trace_id` et `span_id`. Qu’est-ce que ça te permet ?',
			options: [
				'Rejouer la requête exactement comme elle a été envoyée, avec les mêmes en-têtes et le même corps',
				'Sauter d’une ligne de log d’erreur à la trace complète de cette requête, à travers tous les services',
				'Supprimer tes métriques, puisque les logs contiennent maintenant les mêmes chiffres avec plus de détail',
				'Garantir qu’aucune ligne de log ne se perd entre ton service et le store de logs'
			],
			answer: 1,
			why: 'Le trace id est la clé partagée. Il retrouve les spans de tout le trajet à partir d’une ligne de log, et les lignes de log à partir d’un span. Il ne rejoue rien, ne remplace pas les métriques et ne rend pas la livraison fiable.'
		},
		{
			q: 'Pourquoi labelliser une métrique de requêtes par nom de span ou par template de route, comme `get_shipping/{shippingId}`, et pas par l’URL complète ?',
			options: [
				'Prometheus refuse les slashs dans les valeurs de label',
				'Les templates de route sont plus courts à taper dans les dashboards',
				'L’URL complète est déjà dans la trace, donc le store de métriques la supprimerait comme doublon',
				'Chaque URL distincte créerait une nouvelle série temporelle, et les URL peuvent contenir des données utilisateur'
			],
			answer: 3,
			why: 'Chaque combinaison unique de valeurs de labels est sa propre série temporelle. Des ids dans les URL rendent cet ensemble illimité. Une query string peut aussi contenir un terme de recherche ou un token, qui vit alors dans ton store de métriques.'
		},
		{
			q: 'Quelle alerte suit le principe « alerter sur les symptômes » ?',
			options: [
				'Plus de 2 % des paiements ont échoué avec une erreur serveur sur la dernière heure',
				'CPU au-dessus de 80 % sur les serveurs de paiement pendant 5 minutes d’affilée',
				'Le health check d’un pod de paiement a échoué une fois dans la dernière heure',
				'Un pod de paiement a redémarré trois fois dans la dernière heure après un crash'
			],
			answer: 0,
			why: 'Elle mesure ce que ressentent les utilisateurs. Le CPU, un check raté une fois et des redémarrages sont des causes ; leur place est sur un dashboard que tu ouvres après qu’une alerte sur symptôme a sonné.'
		}
	],
	takeaway: 'Mets un même trace id dans chaque ligne de log et chaque span, mesure débit, erreurs et durée par service, garde des labels petits, et ne réveille quelqu’un que quand les utilisateurs le ressentent.',
	sources: [
		{ title: 'Google SRE book, Monitoring distributed systems (the four golden signals)', url: 'https://sre.google/sre-book/monitoring-distributed-systems/' },
		{ title: 'Google SRE workbook, Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
		{ title: 'OpenTelemetry, Observability primer', url: 'https://opentelemetry.io/docs/concepts/observability-primer/' },
		{ title: 'Grafana Labs, The RED Method: how to instrument your services (Tom Wilkie)', url: 'https://grafana.com/blog/the-red-method-how-to-instrument-your-services/' },
		{ title: 'Span Metrics Connector, README', url: `${COL}/connector/spanmetricsconnector/README.md` }
	]
};
