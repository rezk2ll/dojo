const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04';
const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const QM = `${RAILS}/activerecord/lib/active_record/relation/query_methods.rb`;
const QS = `${DJANGO}/docs/ref/models/querysets.txt`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'n-plus-one',
	part: 'La garder en marche',
	title: 'Le N+1 et l’ORM',
	minutes: 10,
	hook: [
		'La page des commandes s’affiche tout de suite sur ton portable, avec cinq commandes de test. En production, avec cinquante commandes sur la page, elle met deux secondes. Le log montre **le même `SELECT` cinquante fois**, chaque fois avec un id différent.',
		'La coupable est une ligne innocente du template : `order.customer.name`. On dirait la lecture d’un champ. Avec un ORM paresseux, **c’est une requête**, lancée la première fois que chaque commande touche à son client.',
		'Une requête pour la liste, plus une par ligne : **N+1**. Chaque requête est rapide. Cinquante allers-retours, non. La solution : dire à l’ORM dès le départ ce que tu vas toucher, pour qu’il le charge en **une jointure ou une requête de plus**. Rails et Django proposent les deux façons, et chacune a son coût.'
	],
	terms: [
		{ term: 'Requêtes N+1', def: 'Une requête charge N lignes parentes, puis le code lance une requête de plus par ligne pour charger un objet lié. N+1 requêtes là où 1 ou 2 suffiraient.' },
		{ term: 'Chargement paresseux', def: 'L’ORM ne charge une association que quand le code la lit pour la première fois. C’est le comportement par défaut de Rails et de Django. Très bien pour un enregistrement, un piège dans une boucle.' },
		{ term: 'Chargement anticipé', def: 'Dire à l’ORM, avant que la requête parte, de quelles associations tu auras besoin, pour qu’il les charge pour toutes les lignes d’un coup.' },
		{ term: 'Preload (requête séparée)', def: 'Une deuxième requête, `WHERE id IN (...)` avec les ids de la première, puis l’association se fait en mémoire. `preload` en Rails, `prefetch_related` en Django.' },
		{ term: 'Chargement par jointure', def: 'Une seule requête avec un `LEFT OUTER JOIN` qui ramène les colonnes liées. `eager_load` en Rails, `select_related` en Django.' },
		{ term: 'Strict loading', def: 'Un mode où un chargement paresseux lève une erreur au lieu de lancer une requête. `strict_loading` en Rails, `FETCH_RAISE` en Django.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['list["Book.limit(10)"] -->|"1 requête"| db[("PostgreSQL")]'],
				highlight: ['list', 'db'],
				note: '**La liste.** L’exemple du guide Rails charge 10 livres en une requête. Jusque-là, tout va bien : un aller-retour, dix lignes.'
			},
			{
				add: ['loop["Boucle : book.author.last_name"] -->|"10 requêtes, WHERE id = ?"| db'],
				highlight: ['loop'],
				note: '**Le N.** Chaque `book.author` est un chargement paresseux, donc chacun est sa propre requête. Le guide fait le compte : 1 + 10 = **11 requêtes**. Avec 1 000 livres, c’est 1 001, et rien dans le code n’a l’air faux.'
			},
			{
				add: ['pre["Book.includes(:author)"] -->|"2 requêtes, WHERE id IN (...)"| db'],
				highlight: ['pre'],
				note: '**Preload.** Avec `includes` et aucune condition sur les auteurs, Rails lance la requête des livres, puis un seul `SELECT authors.* ... WHERE authors.id IN (1,2,...,10)`. Deux requêtes, quel que soit N. C’est aussi ce que fait `prefetch_related` en Django.'
			},
			{
				add: ['ej["includes + where(authors: ...)"] -->|"1 requête, LEFT OUTER JOIN"| db'],
				highlight: ['ej'],
				note: '**Jointure.** Ajoute une condition sur la table des auteurs et `includes` bascule sur un seul `LEFT OUTER JOIN`, parce que le filtre a besoin des deux tables dans la même requête. `select_related` en Django fait toujours une jointure, et ne suit que les clés étrangères et les relations un-à-un.'
			},
			{
				add: ['strict["strict_loading"] -.->|"le chargement paresseux lève une erreur"| loop'],
				highlight: ['strict'],
				note: '**Fais du bruit.** En mode strict loading, le chargement paresseux de la boucle lève `ActiveRecord::StrictLoadingViolationError` au lieu de lancer une requête. Le N+1 apparaît dans un test, pas en production.'
			}
		]
	},
	example: {
		title: 'activerecord/lib/active_record/relation.rb : comment includes choisit entre une jointure et une deuxième requête',
		repo: 'rails/rails',
		url: `${RAILS}/activerecord/lib/active_record/relation.rb#L1296-L1527`,
		lang: 'ruby',
		code: `    # Returns true if relation needs eager loading.
    def eager_loading?
      @should_eager_load ||=
        eager_load_values.any? ||
        includes_values.any? && (joined_includes_values.any? || references_eager_loaded_tables?)
    end
…
    def preload_associations(records) # :nodoc:
      preload = preload_values
      preload += includes_values unless eager_loading?
      scope = strict_loading_value ? StrictLoadingScope : nil
      preload.each do |associations|
        ActiveRecord::Associations::Preloader.new(records: records, associations: associations, scope: scope).call
      end
    end
…
      def exec_main_query(async: false)
        if @none
          if async
            return FutureResult.wrap([])
          else
            return []
          end
        end

        skip_query_cache_if_necessary do
          if where_clause.contradiction?
            [].freeze
          elsif eager_loading?
            model.with_connection do |c|
              apply_join_dependency do |relation, join_dependency|
                if relation.null_relation?
                  [].freeze
                else
                  relation = join_dependency.apply_column_aliases(relation)
                  @_join_dependency = join_dependency
                  c.select_all(relation.arel, "#{model.name} Eager Load", async: async)
                end
              end
            end
          else
            model.with_connection do |c|
              model._query_by_sql(c, arel, async: async)
            end
          end
        end
      end`,
		notes: [
			'**Un seul aiguillage.** `eager_loading?` est vrai si tu as appelé `eager_load`, ou si tu as appelé `includes` et que la requête fait aussi une jointure sur cette association ou référence une table qu’elle ne joint pas. Alors `exec_main_query` construit une seule requête avec jointure, loguée sous `"Book Eager Load"`. Sinon, elle lance la requête simple et les associations attendent `preload_associations`.',
			'**La deuxième requête est une liste IN.** `preload_associations` ajoute `includes_values` à la liste à précharger, sauf si la relation fait un chargement par jointure. Le preloader lance ensuite [`scope.where(destination_key_name => keys)`](' + RAILS + '/activerecord/lib/active_record/associations/preloader/association.rb#L42-L58) : une seule requête pour tous les ids qu’il a collectés, que Rails traduit en `WHERE ... IN (...)`.',
			'**Pourquoi ne pas toujours joindre.** Le [commentaire de `includes`](' + QM + '#L190-L209) le dit : "a join can result in many rows that contain redundant data and it performs poorly at scale" (une jointure peut produire beaucoup de lignes redondantes et passe mal à l’échelle). Joins les livres aux auteurs, et les colonnes de chaque auteur se répètent sur chaque ligne de livre. Joins un `has_many`, et les lignes parentes se multiplient (jour 4).',
			'**Django trace la même ligne.** Sa [doc](' + QS + '#L1189-L1205) dit que `select_related` "is limited to single-valued relationships" (se limite aux relations à valeur unique), tandis que `prefetch_related` "does a separate lookup for each relationship, and does the \'joining\' in Python" (fait une requête séparée par relation et la jointure en Python). Elle [prévient](' + QS + '#L1367-L1371) aussi qu’un gros queryset peut produire "a large \'IN\' clause".',
			'**Attrape-le au lieu de le chasser.** En Rails, [`strict_loading`](' + QM + '#L1392-L1400) fait qu’une relation va "raise an error if the record tries to lazily load an association" (lever une erreur si l’enregistrement tente un chargement paresseux). Django 6.1 ajoute les [fetch modes](' + DJANGO + '/docs/topics/db/fetch-modes.txt#L84-L119) : `FETCH_PEERS` charge un champ manquant pour tout le lot, si bien que la plupart des N+1 deviennent "two queries without much effort" (deux requêtes sans grand effort), et `FETCH_RAISE` lève une erreur à la place.'
		]
	},
	tradeoff: {
		gain: [
			'La page lance 2 ou 3 requêtes quel que soit le nombre de lignes, au lieu d’une par ligne. Le coût ne grandit plus avec N.',
			'Tu choisis la forme : une jointure quand tu filtres sur la table liée, une requête `IN` séparée quand une jointure répéterait ou multiplierait les lignes.',
			'Le strict loading transforme une page lente que tu découvres en production en une erreur que tu découvres dans un test.'
		],
		cost: [
			'Il faut savoir, dans le contrôleur, ce que le template va toucher. Change le template, et la liste à précharger devient fausse, dans un sens ou dans l’autre.',
			'Précharger ce que tu ne lis jamais lance quand même la requête et construit les objets. Trop anticiper, c’est aussi du gaspillage.',
			'Une jointure sur une relation « plusieurs » répète les colonnes du parent sur chaque ligne enfant, et une condition dessus filtre aussi les enfants chargés : Rails prévient que `includes(:posts).where(posts: { name: ... })` ne charge que les posts qui correspondent.',
			'Un preload sur des milliers de parents envoie des milliers d’ids dans une seule liste `IN`, qui a son propre coût.'
		]
	},
	task: {
		prompt: 'Une vue Django liste 20 commandes. Le template affiche le `customer.name` de chaque commande (une clé étrangère) et parcourt `order.items.all()` (une clé étrangère inverse, plusieurs lignes par commande). Compte les requêtes telles quelles. Puis corrige le queryset, recompte, et écris le SQL de chaque requête attendue.',
		hint: 'Compte une requête pour la liste, puis une par commande pour chaque relation que le template lit en paresseux. Ensuite, choisis pour chaque relation la méthode capable de la suivre.',
		answer: [
			'Tel quel : 1 requête pour les commandes, 20 pour les clients, 20 pour les lignes. 41 requêtes.',
			'`customer` est à valeur unique, donc `select_related("customer")` le joint dans la première requête : `SELECT orders.*, customers.* FROM orders JOIN customers ON ...`. Aucune requête de plus pour les clients.',
			'`items` est une relation « plusieurs », que `select_related` ne sait pas suivre. `prefetch_related("items")` lance une requête de plus : `SELECT * FROM items WHERE order_id IN (...)` avec les 20 ids de commande, et rattache les lignes aux commandes en Python.',
			'Résultat : `Order.objects.select_related("customer").prefetch_related("items")[:20]` lance 2 requêtes au lieu de 41. Vérifie-le dans un test avec `assertNumQueries(2)`, ou avec le nombre de requêtes dans tes logs (jour 30).'
		]
	},
	quiz: [
		{
			q: 'En Rails, combien de requêtes lance `Book.includes(:author).where(authors: { country: "FR" }).to_a` ?',
			options: [
				'Une, avec un LEFT OUTER JOIN, parce que la condition nomme la table des auteurs',
				'Deux : les livres d’abord, puis les auteurs en une requête avec une liste IN',
				'Une par livre, parce qu’une condition repasse le préchargement en paresseux',
				'Deux : les auteurs qui passent la condition, puis leurs livres avec IN'
			],
			answer: 0,
			why: 'Une condition en hash sur la table incluse la référence, donc `eager_loading?` devient vrai et `includes` construit une seule requête avec jointure. Sans la condition, le même `includes` préchargerait en deux requêtes.'
		},
		{
			q: 'En Django, une page affiche chaque pizza avec la liste de ses garnitures (un many-to-many). Quel appel supprime le N+1 ?',
			options: [
				'`select_related("toppings")`, qui joint les garnitures dans la requête des pizzas',
				'`prefetch_related("toppings")`, qui les charge en une requête de plus avec IN',
				'`only("toppings")`, qui demande à la requête de ne lire que la colonne toppings',
				'`defer("toppings")`, qui repousse chaque garniture après le rendu du template'
			],
			answer: 1,
			why: 'La doc limite `select_related` aux relations à valeur unique : clé étrangère et un-à-un. Un many-to-many demande `prefetch_related`, qui fait une requête séparée et la jointure en Python.'
		},
		{
			q: 'Un enregistrement lance `user.strict_loading!(mode: :n_plus_one_only)`. Quelle ligne lève une erreur ?',
			options: [
				'`user.address.city`, car tout chargement paresseux sur un enregistrement strict lève',
				'`user.comments.to_a`, car un has_many est toujours un N+1 dans ce mode',
				'`user.comments.first.likes.to_a`, un chargement paresseux à travers une collection',
				'Aucune : ce mode se contente de loguer les N+1 qu’il trouve dans le code'
			],
			answer: 2,
			why: 'En mode `:n_plus_one_only`, charger une association depuis un seul enregistrement est permis. Le guide Rails montre l’erreur sur `user.comments.first.likes.to_a`, l’accès qui se répéterait pour chaque commentaire dans une boucle.'
		}
	],
	takeaway: 'Lire une association paresseuse dans une boucle, c’est une requête par ligne : annonce ce que tu vas toucher, joins les relations à valeur unique, précharge les relations « plusieurs », et active le strict loading pour que le prochain N+1 fasse échouer un test.',
	sources: [
		{ title: 'Rails Guides, Active Record Query Interface : Eager Loading Associations', url: 'https://guides.rubyonrails.org/active_record_querying.html#eager-loading-associations' },
		{ title: 'Doc Django, QuerySet API reference : prefetch_related()', url: 'https://docs.djangoproject.com/en/stable/ref/models/querysets/#prefetch-related' },
		{ title: 'Doc Django, Fetch modes', url: 'https://docs.djangoproject.com/en/dev/topics/db/fetch-modes/' },
		{ title: 'Source Rails, ActiveRecord::Relation', url: `${RAILS}/activerecord/lib/active_record/relation.rb` }
	]
};
