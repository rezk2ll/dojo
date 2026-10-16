const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04/activerecord/lib/active_record';
const OPT = `${RAILS}/locking/optimistic.rb`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'optimistic-locking',
	part: 'Plusieurs à la fois',
	title: 'Le verrouillage optimiste',
	minutes: 10,
	hook: [
		'Deux agents du support ouvrent la même fiche client. L’un corrige le téléphone, l’autre l’adresse. Les deux cliquent sur Enregistrer. **Le second enregistrement efface en silence la première correction**, et personne ne voit d’erreur.',
		'L’écriture la plus tardive a écrasé la première : on appelle ça une mise à jour perdue. Un verrou de ligne (jour 20) l’empêcherait, mais l’agent garde le formulaire ouvert cinq minutes. Le verrou devrait tenir sur deux requêtes HTTP, et tous les autres écrivains de cette ligne attendraient pendant tout ce temps.',
		'Avec le verrouillage optimiste, chaque ligne porte un numéro de version. **Une écriture ne réussit que si la version est toujours celle que tu as lue.** Si quelqu’un a enregistré avant toi, ton UPDATE ne modifie aucune ligne, et l’appli sait que sa copie est périmée.'
	],
	terms: [
		{ term: 'Mise à jour perdue', def: 'Deux écrivains lisent la même ligne, la modifient tous les deux, et l’écriture la plus tardive écrase la première comme si elle n’avait jamais eu lieu.' },
		{ term: 'Colonne de version', def: 'Un entier stocké sur la ligne (Rails l’appelle `lock_version`). Chaque mise à jour réussie lui ajoute un.' },
		{ term: 'Compare-and-set', def: 'Un UPDATE dont la clause WHERE contient la valeur attendue. Il n’écrit que si la ligne a toujours cette valeur, en une seule instruction atomique.' },
		{ term: 'Objet périmé', def: 'Une copie d’une ligne en mémoire dont la version ne correspond plus à la base. L’enregistrer doit échouer plutôt qu’écraser.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['a["L’agent A lit id 1"] -->|"lock_version = 3"| row[("ligne customers")]', 'b["L’agent B lit id 1"] -->|"lock_version = 3"| row'],
				highlight: ['a', 'b', 'row'],
				note: 'Les deux agents lisent la version 3, sans prendre de verrou. Chacun garde la version qu’il a vue, en mémoire ou dans un champ caché du formulaire. Ils peuvent maintenant éditer aussi longtemps qu’ils veulent.'
			},
			{
				add: ['a -->|"UPDATE ... SET lock_version = 4 WHERE id = 1 AND lock_version = 3"| row'],
				highlight: ['a', 'row'],
				note: 'A enregistre en premier. La clause WHERE correspond toujours, donc la base met la ligne à jour et la version passe à 4. Elle répond une ligne modifiée, et Rails ne lit que ce compte pour savoir que l’enregistrement a marché.'
			},
			{
				add: ['b -->|"même UPDATE, WHERE lock_version = 3"| row', 'row -->|"0 ligne"| err["StaleObjectError"]'],
				highlight: ['b', 'err'],
				note: 'B enregistre avec la version 3. La ligne dit maintenant 4, donc la clause WHERE ne trouve rien et aucune ligne ne change. Rails transforme ce zéro en `ActiveRecord::StaleObjectError`, et la correction d’adresse de B n’est pas écrite.'
			},
			{
				add: ['err --> retry["Recharger, fusionner ou demander à l’utilisateur, puis réessayer"]'],
				highlight: ['retry'],
				note: 'La base a seulement refusé l’écriture. Ton code recharge la ligne, puis réessaie, fusionne les deux modifications, ou montre à B ce qui a changé. Personne n’a attendu de verrou, et la correction de A est toujours dans la ligne.'
			}
		]
	},
	example: {
		title: 'activerecord/lib/active_record/locking/optimistic.rb : la vérification de version dans chaque save',
		repo: 'rails/rails',
		url: `${OPT}#L122-L194`,
		lang: 'ruby',
		code: `        def _update_row(attribute_names, attempted_action = "update")
          return super unless locking_enabled?
          return super if attempted_action == "touch" && _skip_locking_column_on_touch?

          begin
            locking_column = self.class.locking_column
            lock_attribute_was = @attributes[locking_column]

            update_constraints = _query_constraints_hash

            attribute_names = attribute_names.dup if attribute_names.frozen?
            attribute_names << locking_column

            if self[locking_column].nil?
              raise(<<-MSG.squish)
                For optimistic locking, locking_column ('#{locking_column}') can't be nil.
                Are you missing a default value or validation on '#{locking_column}'?
              MSG
            end

            self[locking_column] += 1

            affected_rows = self.class._update_record(
              attributes_with_values(attribute_names),
              update_constraints
            )

            if affected_rows != 1
              raise ActiveRecord::StaleObjectError.new(self, attempted_action)
            end

            affected_rows

          # If something went wrong, revert the locking_column value.
          rescue Exception
            @attributes[locking_column] = lock_attribute_was
            raise
          end
        end
…
        def _query_constraints_hash
          return super unless locking_enabled?

          locking_column = self.class.locking_column
          super.merge(locking_column => _lock_value_for_database(locking_column))
        end`,
		notes: [
			'Les lignes 41 à 46 mettent l’ancienne version dans le WHERE : `_query_constraints_hash` ajoute `lock_version => <value read>` à côté de la clé primaire. La ligne 21 met la version plus un dans la liste SET. [`_build_update_manager`](' + RAILS + '/persistence.rb#L289-L303) transforme les contraintes en clause WHERE, et une seule instruction vérifie et écrit.',
			'Les lignes 28 à 30 font confiance au compte que renvoie la base : tout ce qui n’est pas 1 lève `StaleObjectError`. Le code ne relit pas la ligne pour comparer. Les lignes 35 à 37 remettent la version en mémoire, pour qu’un nouvel essai reparte de la version lue. [`destroy_row`](' + OPT + '#L166-L174) applique la même règle aux suppressions.',
			'Deux enregistrements ne peuvent pas passer la vérification tous les deux. En Read Committed, le mode par défaut de PostgreSQL, un second UPDATE sur une ligne en cours de modification attend que le premier finisse. Ensuite, d’après la [doc sur l’isolation](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED), PostgreSQL réévalue la clause WHERE sur la nouvelle version de la ligne. La version 3 ne correspond plus, donc B ne met rien à jour.',
			'Entre deux requêtes HTTP, le formulaire doit transporter la version. Le [commentaire du module](' + OPT + '#L42-L43) recommande d’ajouter `lock_version` en champ caché du formulaire. Sans ce champ, la seconde requête recharge la ligne, lit la nouvelle version, et la vérification passe.',
			'Les écritures en masse sautent la vérification. [`update_all`](' + RAILS + '/relation.rb#L620-L629) avec un hash incrémente `lock_version` pour périmer les formulaires ouverts, mais il n’ajoute aucune version à sa clause WHERE. Il ne lève jamais `StaleObjectError`. Avec une chaîne SQL brute, il n’incrémente même pas la version.'
		]
	},
	tradeoff: {
		gain: [
			'Aucun verrou n’est tenu entre la lecture et l’écriture, donc un utilisateur peut garder un formulaire ouvert une heure sans que personne ne l’attende.',
			'L’écrivain en retard reçoit une erreur qu’il peut afficher, au lieu d’effacer en silence le travail d’un autre.',
			'Ça coûte une colonne entière et une condition de plus dans la clause WHERE. Ça marche avec tous les niveaux d’isolation et tous les poolers de connexions.'
		],
		cost: [
			'Sous forte contention, la plupart des écritures échouent et réessaient. Une ligne chaude (un stock, un solde) s’en sort mieux avec un verrou de ligne ou un `UPDATE ... SET n = n - 1` atomique.',
			'Le `StaleObjectError` remonte jusqu’à l’utilisateur ou l’appelant. Quelqu’un doit décider ce que veut dire un conflit : réessayer, fusionner, ou montrer les deux versions.',
			'Chaque chemin d’écriture doit passer par la vérification. Un UPDATE en SQL brut, un `update_all` en masse, ou une seconde appli qui ignore la colonne peut encore écraser une ligne plus récente.'
		]
	},
	task: {
		prompt: 'Dans `psql`, crée `docs(id int primary key, body text, lock_version int not null default 0)` et insère la ligne 1. Ouvre deux sessions. Les deux lisent la ligne 1. La session A enregistre « draft A », puis la session B enregistre « draft B ». Écris l’UPDATE exact que chaque session envoie, le nombre de lignes que chacune obtient, et ce que B doit faire ensuite.',
		hint: 'Les deux sessions lisent `lock_version = 0`. Mets cette valeur dans la clause WHERE et donne-lui un de plus dans la liste SET.',
		answer: [
			'Session A : `UPDATE docs SET body = \'draft A\', lock_version = 1 WHERE id = 1 AND lock_version = 0;` répond `UPDATE 1`. La ligne est maintenant en version 1.',
			'Session B : `UPDATE docs SET body = \'draft B\', lock_version = 1 WHERE id = 1 AND lock_version = 0;` répond `UPDATE 0`. Rien n’a changé : la ligne dit 1, pas 0.',
			'B ne doit pas relancer la même instruction à l’aveugle. Il relit la ligne (maintenant « draft A », version 1), fusionne ou demande à l’utilisateur, et envoie un nouvel UPDATE avec `WHERE lock_version = 1`.',
			'Si les deux sessions tournent dans des transactions ouvertes et que l’UPDATE de B démarre avant le commit de A, B attend sur le verrou de ligne de A. Quand A valide, PostgreSQL revérifie la clause WHERE de B sur la nouvelle version de la ligne, trouve la version 1, et répond quand même `UPDATE 0`.'
		]
	},
	quiz: [
		{
			q: 'Un save Rails lève `StaleObjectError`. Qu’est-ce que la base a vu, en vrai ?',
			options: [
				'Un UPDATE dont la clause WHERE sur `lock_version` n’a trouvé aucune ligne',
				'Un deadlock entre deux transactions sur la même ligne de client',
				'Un verrou de ligne tenu trop longtemps par un `SELECT ... FOR UPDATE`',
				'Une violation d’index unique sur la colonne entière `lock_version`'
			],
			answer: 0,
			why: 'Le verrouillage optimiste ne prend aucun verrou. Rails envoie un seul UPDATE avec l’ancienne version dans la clause WHERE, et lève une erreur quand le nombre de lignes modifiées n’est pas 1.'
		},
		{
			q: 'Des utilisateurs éditent une page de wiki dans un formulaire pendant plusieurs minutes. Pourquoi le verrouillage optimiste convient-il mieux ici que `SELECT ... FOR UPDATE` ?',
			options: [
				'Un verrou de ligne se prend plus vite, mais PostgreSQL le lâche au bout d’une minute',
				'Un verrou de ligne bloquerait chaque lecteur de la page jusqu’à l’enregistrement',
				'Un verrou de ligne vit dans une transaction, qui ne peut pas rester ouverte entre requêtes',
				'Un verrou de ligne ne marche qu’en Serializable, que la plupart des applis n’utilisent pas'
			],
			answer: 2,
			why: 'Un verrou de ligne se termine avec sa transaction, et une transaction vit sur une seule connexion. La garder ouverte pendant qu’une personne tape bloquerait une connexion et ferait attendre tous les autres écrivains. Les simples lecteurs ne sont pas bloqués (jour 18), ce qui élimine la deuxième option.'
		},
		{
			q: 'Des centaines de paiements par seconde décrémentent `stock` sur la même ligne produit, chacun avec une vérification de version optimiste. Que se passe-t-il ?',
			options: [
				'Chaque décrément attend son tour sur un verrou, donc tous réussissent lentement',
				'La plupart des essais trouvent une version plus récente, échouent et réessaient',
				'PostgreSQL fusionne les décréments concurrents en une seule écriture combinée',
				'La colonne de version déborde vite et la ligne passe en lecture seule'
			],
			answer: 1,
			why: 'Sur une ligne chaude, presque chaque écrivain trouve une version plus récente, obtient zéro ligne et réessaie. Un `UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock > 0` atomique n’a besoin d’aucune version.'
		}
	],
	recall: {
		q: 'Rails envoie `UPDATE ... WHERE id = 1 AND lock_version = 3` et la base répond 0 ligne. Que s’est-il passé, et que doit faire l’appli ?',
		a: 'Un autre écrivain a enregistré avant et a fait passer la ligne au-delà de la version 3. Rails lève `StaleObjectError`, et l’appli recharge la ligne, puis réessaie, fusionne, ou montre à l’utilisateur ce qui a changé.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Transaction Isolation', url: 'https://www.postgresql.org/docs/current/transaction-iso.html' },
		{ title: 'Rails API, ActiveRecord::Locking::Optimistic', url: 'https://api.rubyonrails.org/classes/ActiveRecord/Locking/Optimistic.html' },
		{ title: 'Rails API, ActiveRecord::Locking::Pessimistic', url: 'https://api.rubyonrails.org/classes/ActiveRecord/Locking/Pessimistic.html' }
	]
};
