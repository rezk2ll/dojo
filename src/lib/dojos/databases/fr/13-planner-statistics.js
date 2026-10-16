const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const SELFUNCS = `${PG}/src/backend/utils/adt/selfuncs.c`;
const DOCS = `${PG}/doc/src/sgml`;
const CLAUSESEL = `${PG}/src/backend/optimizer/path/clausesel.c`;
const ANALYZE = `${PG}/src/backend/commands/analyze.c`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'planner-statistics',
	part: 'Dans le moteur',
	title: 'Comment le planificateur devine',
	minutes: 10,
	hook: [
		'Ta table d’expéditions a une ville et un code postal. Une requête demande `city = \'city7\' AND zip = \'zip107\'`. `EXPLAIN ANALYZE` affiche `rows=10` estimé, `rows=1000` réel. Le plan a été construit pour cent fois moins de lignes qu’il n’en a reçu.',
		'Le planificateur ne compte jamais les lignes avant de planifier. **Il devine à partir de statistiques** : un échantillon de la table, les valeurs les plus fréquentes de chaque colonne, un histogramme pour le reste. La plupart du temps, il tombe juste. Sinon, tu obtiens une boucle imbriquée sur 1 000 lignes qu’il croyait être 10, ou un parcours séquentiel là où un index suffirait.',
		'Aujourd’hui : ce que stocke `ANALYZE`, comment un `=` devient un nombre de lignes, et pourquoi **deux colonnes qui varient ensemble** trompent le planificateur tant que tu ne le lui dis pas avec `CREATE STATISTICS`.'
	],
	terms: [
		{ term: 'ANALYZE', def: 'Lit un échantillon aléatoire de la table et range des statistiques par colonne dans `pg_statistic`. L’autovacuum le lance en arrière-plan. L’échantillon fait 300 lignes par point de cible de statistiques : 30 000 lignes par défaut.' },
		{ term: 'Sélectivité', def: 'La part des lignes qu’une condition garde, de 0 à 1. Lignes estimées = lignes de la table × sélectivité.' },
		{ term: 'Liste MCV', def: 'Most common values : jusqu’à 100 valeurs de la colonne (la cible de statistiques par défaut), avec la part des lignes de chacune. Pour un `=` sur l’une d’elles, le planificateur connaît directement sa part.' },
		{ term: 'Histogramme', def: 'Des bornes de seaux qui découpent les valeurs hors de la liste MCV en groupes de même nombre de lignes. Sert pour `<`, `>` et les intervalles.' },
		{ term: 'n_distinct', def: 'Le nombre estimé de valeurs distinctes. Pour une valeur hors de la liste MCV, le planificateur partage ce que laissent les MCV entre les autres valeurs distinctes.' },
		{ term: 'Statistiques étendues', def: 'Des statistiques sur plusieurs colonnes, créées avec `CREATE STATISTICS` et remplies par `ANALYZE` : dépendances fonctionnelles, nombres de valeurs distinctes et listes MCV sur des groupes de colonnes.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['tbl[("shipments, 1 million de lignes")] -->|"ANALYZE lit un échantillon de 30 000 lignes"| stats[("pg_statistic, une ligne par colonne")]'],
				highlight: ['tbl', 'stats'],
				note: '**Les statistiques viennent d’un échantillon.** Pour les grosses tables, `ANALYZE` « takes a random sample of the table contents, rather than examining every row » (prend un échantillon au lieu de tout lire). Les résultats sont approximatifs et bougent un peu à chaque passage. Lis-les par la vue `pg_stats`, plus lisible que le catalogue brut.'
			},
			{
				add: ['stats --> mcv["Liste MCV : valeurs fréquentes et leur part des lignes"]', 'stats --> hist["Histogramme : des seaux qui ont chacun le même nombre de lignes"]'],
				highlight: ['mcv', 'hist'],
				note: '**Deux formes pour deux questions.** La liste MCV répond à « combien de lignes ont exactement cette valeur ? » pour les valeurs fréquentes. L’histogramme couvre le reste, et le planificateur suppose que les valeurs se répartissent uniformément dans chaque seau. Les valeurs de la liste MCV sont exclues de l’histogramme, donc rien n’est compté deux fois.'
			},
			{
				add: ['q["WHERE city = \'city7\'"] --> eqsel["eqsel : dans la liste MCV ? prends sa part, sinon partage le reste"]', 'mcv --> eqsel'],
				highlight: ['q', 'eqsel'],
				note: '**Un `=` devient un nombre.** `eqsel` regarde d’abord la liste MCV. Une correspondance donne la part exacte mesurée par `ANALYZE`. Pas de correspondance : prends ce que laissent les MCV et les NULL, et divise-le par le nombre d’autres valeurs distinctes. Sans aucune statistique, il se rabat sur 1 divisé par le nombre estimé de valeurs distinctes.'
			},
			{
				add: ['two["WHERE city = \'city7\' AND zip = \'zip107\'"] -->|"1/100 fois 1/1000"| low["Estimé : 10 lignes. Réel : 1000"]'],
				highlight: ['two', 'low'],
				note: '**Deux conditions sont multipliées.** Le planificateur les traite comme indépendantes, donc il multiplie leurs sélectivités. Mais chaque code postal appartient à une seule ville : dès que `zip = \'zip107\'` est vrai, la condition sur la ville n’enlève plus rien. La doc : « an assumption that does not hold when column values are correlated » (une hypothèse fausse quand les colonnes sont corrélées).'
			},
			{
				add: ['ext["CREATE STATISTICS (dependencies) ON city, zip"] -->|"zip décide city"| fixed["Estimé : 995 lignes"]', 'ext -.-> two'],
				highlight: ['ext', 'fixed'],
				note: '**Dis au planificateur que les colonnes vont ensemble.** Un objet de statistiques `dependencies` mesure à quel point une colonne décide l’autre. Après le prochain `ANALYZE`, le planificateur « adjusts the per-condition selectivity estimates using the dependency coefficients » (corrige chaque condition avec le coefficient de dépendance), et l’estimation tombe près des 1 000 réelles.'
			}
		]
	},
	example: {
		title: 'src/backend/utils/adt/selfuncs.c : var_eq_const, l’estimation de colonne = constante',
		repo: 'postgres/postgres',
		url: `${SELFUNCS}#L338-L456`,
		lang: 'c',
		code: `	if (vardata->isunique && vardata->rel && vardata->rel->tuples >= 1.0)
	{
		selec = 1.0 / vardata->rel->tuples;
	}
	else if (HeapTupleIsValid(vardata->statsTuple) &&
			 statistic_proc_security_check(vardata,
										   (opfuncoid = get_opcode(oproid))))
…
		if (match)
		{
			/*
			 * Constant is "=" to this common value.  We know selectivity
			 * exactly (or as exactly as ANALYZE could calculate it, anyway).
			 */
			selec = sslot.numbers[i];
		}
		else
		{
			/*
			 * Comparison is against a constant that is neither NULL nor any
			 * of the common values.  Its selectivity cannot be more than
			 * this:
			 */
			double		sumcommon = 0.0;
			double		otherdistinct;

			for (i = 0; i < sslot.nnumbers; i++)
				sumcommon += sslot.numbers[i];
			selec = 1.0 - sumcommon - nullfrac;
			CLAMP_PROBABILITY(selec);

			/*
			 * and in fact it's probably a good deal less. We approximate that
			 * all the not-common values share this remaining fraction
			 * equally, so we divide by the number of other distinct values.
			 */
			otherdistinct = get_variable_numdistinct(vardata, &isdefault) -
				sslot.nnumbers;
			if (otherdistinct > 1)
				selec /= otherdistinct;

…
	else
	{
		/*
		 * No ANALYZE stats available, so make a guess using estimated number
		 * of distinct values and assuming they are equally common. (The guess
		 * is unlikely to be very good, but we do know a few special cases.)
		 */
		selec = 1.0 / get_variable_numdistinct(vardata, &isdefault);
	}`,
		notes: [
			'**Une colonne unique n’a pas besoin de statistiques.** Si un index unique couvre la colonne, l’estimation est d’une ligne : `1.0 / vardata->rel->tuples`. C’est pour ça qu’une recherche par clé primaire est toujours bien planifiée, même sur une table jamais analysée.',
			'**Une correspondance dans la liste MCV est « as exactly as ANALYZE could calculate it »** (aussi exacte qu’ANALYZE a pu la calculer). `selec = sslot.numbers[i]` est la part mesurée de cette valeur. Les [Row Estimation Examples](' + DOCS + '/planstats.sgml#L166-L181) de la doc déroulent le même cas : `CRAAAA` a une part de 0,003, donc 10 000 lignes × 0,003 donnent `rows=30`.',
			'**Une valeur hors de la liste partage les restes.** `1.0 - sumcommon - nullfrac`, divisé par les autres valeurs distinctes. La doc écrit la formule [(1 - sum(mcv_freqs))/(num_distinct - num_mcv)](' + DOCS + '/planstats.sgml#L203-L216), en supposant que la part hors MCV « is evenly distributed » (se répartit uniformément). Une valeur rare et une valeur absente reçoivent la même estimation.',
			'**Plusieurs conditions sont multipliées.** L’en-tête de [clausesel.c](' + CLAUSESEL + '#L66-L71) le dit sans détour : les statistiques étendues passent d’abord, puis les clauses restantes sont estimées « by taking the product of their selectivities, but that\'s only right if they have independent probabilities » (par le produit, ce qui n’est juste que si elles sont indépendantes).',
			'**La taille de l’échantillon est une formule.** [analyze.c](' + ANALYZE + '#L1930-L1939) fixe `minrows = 300 * stats->attstattarget`, d’après un article sur l’erreur des histogrammes. Monte la cible avec `ALTER TABLE ... ALTER COLUMN ... SET STATISTICS` et tu obtiens une liste MCV plus longue, plus de seaux et un plus gros échantillon, au prix d’un `ANALYZE` plus lent et d’une planification un peu plus lente.'
		]
	},
	tradeoff: {
		gain: [
			'Planifier coûte des microsecondes au lieu d’un parcours : le planificateur lit quelques centaines de nombres, pas la table.',
			'Pour les colonnes déséquilibrées, la liste MCV donne la part exacte des valeurs qui comptent le plus, donc `status = \'refunded\'` et `status = \'paid\'` obtiennent des plans différents.',
			'Quand l’estimation est fausse, tu peux la corriger sans toucher à la requête : lance `ANALYZE`, monte la cible de statistiques, ou ajoute un objet de statistiques.'
		],
		cost: [
			'Les statistiques vieillissent. Après un gros chargement ou une grosse suppression, les plans s’appuient sur l’ancienne forme des données jusqu’au prochain `ANALYZE`.',
			'Les colonnes corrélées sont sous-estimées par défaut, et l’erreur s’aggrave à chaque condition et à chaque jointure en plus.',
			'Un échantillon rate les valeurs rares. Une valeur présente dans 0,01 % des lignes peut ne pas apparaître dans 30 000 lignes tirées, et reçoit la part moyenne des restes.',
			'Les dépendances fonctionnelles n’aident que pour `=` et `IN` sur des constantes, et supposent que les conditions sont compatibles. L’exemple de la doc : `city = \'San Francisco\' AND zip = \'90210\'` reçoit quand même une estimation non nulle.'
		]
	},
	task: {
		prompt: 'Une table `orders` a 1 000 000 de lignes. `pg_stats` pour `status` affiche `null_frac = 0`, `n_distinct = 5`, `most_common_vals = {paid,refunded,pending}`, `most_common_freqs = {0.90,0.06,0.03}`. Sur papier : combien de lignes le planificateur attend-il pour `status = \'refunded\'` ? Pour `status = \'disputed\'` ? Ensuite, une table `invoices` a `country` (50 valeurs distinctes, bien réparties) et `currency` (20, bien réparties), et chaque pays utilise une seule devise. Estime `country = \'FR\' AND currency = \'EUR\'` comme le fait le planificateur, et dis de quoi la vraie réponse est proche.',
		hint: 'Suis `var_eq_const` : la valeur est-elle dans la liste MCV ? Sinon, que reste-t-il après les MCV, et combien d’autres valeurs distinctes se le partagent ?',
		answer: [
			'`refunded` est dans la liste MCV : sélectivité 0,06, donc 1 000 000 × 0,06 = 60 000 lignes.',
			'`disputed` n’y est pas : il reste 1 - (0.90 + 0.06 + 0.03) - 0 = 0,01, partagé entre 5 - 3 = 2 autres valeurs distinctes, soit 0,005, ou 5 000 lignes. La vérification du code la garde sous la plus petite part des MCV (0,03), ce qui est déjà le cas. Si `disputed` n’existe pas du tout, l’estimation reste 5 000.',
			'Deux colonnes : 1/50 × 1/20 = 1/1 000, donc environ 1 000 lignes. Mais FR implique EUR, donc la condition sur la devise n’enlève rien : le vrai nombre est proche de 1/50, environ 20 000 lignes. Le planificateur est 20 fois trop bas.',
			'Correction : `CREATE STATISTICS invoices_country_currency (dependencies) ON country, currency FROM invoices; ANALYZE invoices;`. Dans un test où le code postal décide entièrement la ville, l’estimation est passée de 10 lignes à 995 pour 1 000 réelles.'
		]
	},
	quiz: [
		{
			q: '`WHERE status = \'paid\'`, et `paid` est dans la liste MCV avec une fréquence de 0,9. La table a 2 millions de lignes. Qu’estime le planificateur ?',
			options: [
				'2 000 000 divisé par n_distinct, pareil pour toutes les valeurs',
				'1 800 000 lignes : la fréquence de la liste MCV fois les lignes',
				'Il lit l’index pour compter les lignes paid avant de planifier',
				'Une ligne, parce qu’une égalité sur une colonne rend un résultat'
			],
			answer: 1,
			why: 'Quand la constante correspond à une MCV, `var_eq_const` prend directement la part mesurée de cette valeur. Diviser par n_distinct n’est que le repli pour une colonne sans statistiques, et une ligne est la règle pour une colonne unique.'
		},
		{
			q: 'Après un import nocturne qui double la taille d’une table, les plans sur cette table se dégradent jusqu’au lendemain matin. Quelle est la cause la plus probable ?',
			options: [
				'L’import a laissé les index invalides jusqu’à la fin d’un REINDEX dans la nuit',
				'Le planificateur garde chaque plan en cache une journée et réutilise les anciens',
				'Les statistiques décrivent encore les anciennes données jusqu’au prochain ANALYZE',
				'Les grosses tables font toujours passer le planificateur aux parcours séquentiels'
			],
			answer: 2,
			why: '`pg_statistic` est mis à jour par `ANALYZE` (manuel ou par l’autovacuum), pas à chaque écriture. D’ici là, les listes MCV et les histogrammes décrivent les données d’avant l’import. Lance `ANALYZE` juste après un chargement en masse.'
		},
		{
			q: 'Une requête filtre sur `brand = \'X\' AND model = \'Y\'`, et chaque modèle appartient à une seule marque. L’estimation est bien trop basse. Qu’est-ce qui corrige le mieux ?',
			options: [
				'Un index composite sur (brand, model), pour que le planificateur compte les lignes',
				'Monter la cible de statistiques des deux colonnes à 10000, pour des échantillons plus gros',
				'Réécrire la requête avec OR au lieu de AND, pour que les sélectivités s’additionnent',
				'Un objet de statistiques `dependencies` sur (brand, model), puis ANALYZE'
			],
			answer: 3,
			why: 'L’erreur vient du produit de deux sélectivités, comme si les colonnes étaient indépendantes. Des échantillons plus gros par colonne n’y changent rien. Un index accélère le parcours mais ne dit pas au planificateur que les colonnes sont corrélées. Un objet de statistiques `dependencies`, si.'
		}
	],
	takeaway: 'Le planificateur estime les lignes à partir d’un échantillon : la part MCV pour les valeurs fréquentes, une part égale du reste pour les autres, un histogramme pour les intervalles, et un produit pour plusieurs conditions. Garde les statistiques à jour, et déclare les colonnes corrélées avec CREATE STATISTICS.',
	sources: [
		{ title: 'Doc PostgreSQL 18, Statistics Used by the Planner', url: 'https://www.postgresql.org/docs/18/planner-stats.html' },
		{ title: 'Doc PostgreSQL 18, Row Estimation Examples', url: 'https://www.postgresql.org/docs/18/row-estimation-examples.html' },
		{ title: 'Doc PostgreSQL 18, ANALYZE', url: 'https://www.postgresql.org/docs/18/sql-analyze.html' },
		{ title: 'Doc PostgreSQL 18, CREATE STATISTICS', url: 'https://www.postgresql.org/docs/18/sql-createstatistics.html' }
	]
};
