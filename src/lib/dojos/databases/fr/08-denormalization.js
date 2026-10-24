const DISCOURSE = 'https://github.com/discourse/discourse/blob/821e9e2f9f94483a3be8d1e077cde0fd94970479';
const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04/activerecord/lib/active_record';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'denormalization',
	part: 'Les données et les questions',
	title: 'La dénormalisation : copier des données exprès',
	minutes: 10,
	hook: [
		'Un forum liste ses tags avec un nombre à côté de chacun : « sql, 1 204 sujets ». Compter ça depuis `topic_tags` à chaque affichage, c’est une jointure et un `count` pour chaque tag, pour chaque visiteur.',
		'Alors Discourse **range le compte sur la ligne du tag**. Ça enfreint la règle d’hier : ce nombre est une deuxième copie d’un fait que `topic_tags` contient déjà. Ranger une telle copie exprès, pour lire plus vite, s’appelle la dénormalisation.',
		'Une copie peut dériver de sa source : une écriture change l’une et pas l’autre. Chaque copie a donc besoin d’un code qui la met à jour à chaque écriture, et d’une tâche qui trouve et corrige les lignes fausses.'
	],
	terms: [
		{ term: 'Dénormalisation', def: 'Ranger un fait une deuxième fois, exprès, pour que les lectures coûtent moins cher. L’original reste la source de vérité.' },
		{ term: 'Source de vérité', def: 'Les données à partir desquelles une copie est calculée. Si les deux ne sont pas d’accord, la source gagne et la copie est reconstruite.' },
		{ term: 'Counter cache', def: 'Un compte rangé sur la ligne parente, comme `tags.public_topic_count`, mis à jour à chaque ajout ou retrait d’une ligne enfant.' },
		{ term: 'Dérive', def: 'La copie ne correspond plus à sa source, parce qu’une écriture a changé l’une et pas l’autre.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['src[("topic_tags : source de vérité")] --> count["count par tag, à chaque affichage"]'],
				highlight: ['src', 'count'],
				note: 'Dans le schéma normalisé, le nombre de sujets par tag est déjà dans `topic_tags`. Le lire, c’est une jointure et un `GROUP BY` (jour 5) à chaque fois. Le résultat est toujours juste, et la requête est trop lente pour une page que chaque visiteur charge.'
			},
			{
				add: ['src -->|"after_create +1, after_destroy -1"| cache[("tags.public_topic_count")]'],
				highlight: ['cache'],
				note: 'Le modèle `TopicTag` de Discourse a des callbacks qui ajoutent ou retirent 1 aux compteurs du tag. Rails lance les callbacks de `save` et `destroy` dans la même transaction que l’écriture, donc la ligne et le compte sont validés ensemble.'
			},
			{
				add: ['bulk["update_all, SQL brut, une correction en console"] -.->|"saute les callbacks"| src', 'cache --- wrong["Le compte est faux"]'],
				highlight: ['bulk', 'wrong'],
				note: 'La copie n’est juste que si **chaque** écriture passe par le code qui la met à jour. Rails dit que `update_all` « does not trigger Active Record callbacks or validations » (ne déclenche ni callbacks ni validations). Une suppression en masse, une migration ou une correction SQL à la main change la source et laisse le compteur derrière, sans lever d’erreur.'
			},
			{
				add: ['job["EnsureDbConsistency, toutes les 12 heures"] -->|"recompte, corrige les lignes qui diffèrent"| cache'],
				highlight: ['job'],
				note: 'Discourse lance toutes les 12 heures une tâche qui recalcule les comptes depuis la source et n’écrit que les lignes fausses. Un compte qui dérive reste faux jusqu’au passage suivant, au plus 12 heures plus tard.'
			},
			{
				add: ['mv[("vue matérialisée")] -->|"REFRESH : tout recalculer"| mv2["Fraîche jusqu’à la prochaine écriture"]'],
				highlight: ['mv', 'mv2'],
				note: 'La vue matérialisée est une deuxième sorte de copie : PostgreSQL range le résultat d’une requête comme une table. La doc : « REFRESH MATERIALIZED VIEW completely replaces the contents of a materialized view. » (remplace tout son contenu). Entre deux refresh, elle est périmée. Sans `CONCURRENTLY`, un refresh peut bloquer les lecteurs, et `CONCURRENTLY` exige un index unique sur la vue.'
			}
		]
	},
	example: {
		title: 'app/models/tag.rb : Discourse recompte les sujets par tag et corrige les lignes qui ont dérivé',
		repo: 'discourse/discourse',
		url: `${DISCOURSE}/app/models/tag.rb#L83-L126`,
		lang: 'ruby',
		code: `  def self.ensure_consistency!
    update_topic_counts
  end

  def self.update_topic_counts
    DB.exec <<~SQL
      UPDATE tags t
         SET staff_topic_count = x.topic_count
        FROM (
             SELECT COUNT(topics.id) AS topic_count, tags.id AS tag_id
               FROM tags
          LEFT JOIN topic_tags ON tags.id = topic_tags.tag_id
          LEFT JOIN topics ON topics.id = topic_tags.topic_id
                          AND topics.deleted_at IS NULL
                          AND topics.archetype != 'private_message'
           GROUP BY tags.id
        ) x
       WHERE x.tag_id = t.id
         AND x.topic_count <> t.staff_topic_count
    SQL
…
    DB.exec <<~SQL
      UPDATE tags t
      SET public_topic_count = x.topic_count
      FROM (
        WITH tags_with_public_topics AS (
          SELECT
            COUNT(topics.id) AS topic_count,
            tags.id AS tag_id
          FROM tags
          INNER JOIN topic_tags ON tags.id = topic_tags.tag_id
          INNER JOIN topics ON topics.id = topic_tags.topic_id AND topics.deleted_at IS NULL AND topics.archetype != 'private_message'
          INNER JOIN categories ON categories.id = topics.category_id AND NOT categories.read_restricted
          GROUP BY tags.id
        )
        SELECT
          COALESCE(tags_with_public_topics.topic_count, 0 ) AS topic_count,
          tags.id AS tag_id
        FROM tags
        LEFT JOIN tags_with_public_topics ON tags_with_public_topics.tag_id = tags.id
      ) x
      WHERE x.tag_id = t.id
      AND x.topic_count <> t.public_topic_count;
    SQL`,
		notes: [
			'À l’écriture, [`TopicTag`](' + DISCOURSE + '/app/models/topic_tag.rb#L7-L47) appelle `Tag.update_counters(tag.id, ...)` avec `+1` après une création et `-1` après une suppression. Rails en fait une seule instruction, `SET comments_count = COALESCE(comments_count, 0) + 1` : la base ajoute à la valeur actuelle, au lieu que l’appli réécrive un nombre lu plus tôt.',
			'La doc Rails de [`reset_counters`](' + RAILS + '/counter_cache.rb#L14-L16) dit qu’il sert « when adding new counter caches, or if the counter has been corrupted or modified directly by SQL » (à l’ajout d’un compteur, ou quand il a été corrompu ou modifié directement en SQL). Discourse écrit son propre recomptage, avec des règles qu’un simple compte raterait : il ne compte que les sujets vivants, écarte les messages privés et, pour le compte public, les catégories à accès restreint.',
			'Les lignes 1 à 3 sont le point d’entrée de la tâche de réparation. [`EnsureDbConsistency`](' + DISCOURSE + '/app/jobs/scheduled/ensure_db_consistency.rb#L5-L46) tourne `every 12.hours` et appelle `ensure_consistency!` sur vingt modèles, dont `Tag`. Chaque appel est entouré d’un `rescue` : un modèle qui échoue est journalisé, et les autres tournent quand même.',
			'La ligne 19, `x.topic_count <> t.staff_topic_count`, saute les tags déjà justes. Le comportement normal de PostgreSQL « always performs a physical row update regardless of whether or not the data has changed » (écrit physiquement la ligne même si rien n’a changé, jour 16), donc ce filtre garde un recomptage complet bon marché.',
			'Lignes 26 à 35 : dans le compte public, la sous-requête en `INNER JOIN` ne contient que les tags qui ont encore des sujets publics. Aux lignes 36 à 40, le `LEFT JOIN` externe depuis `tags` avec `COALESCE(..., 0)` donne 0 à tous les autres. Sans lui, le recomptage ne remettrait jamais à zéro un tag qui a perdu son dernier sujet public (les règles de NULL, jour 6).'
		]
	},
	tradeoff: {
		gain: [
			'Une lecture charge une colonne sur une ligne que tu charges de toute façon, au lieu de lancer une jointure et un compte.',
			'Tu peux indexer la copie, donc « tags triés par nombre de sujets » ou « produits les plus notés » ne lit que quelques pages d’index.',
			'Une vue matérialisée calcule un rapport lourd une seule fois, et tous les lecteurs partagent le résultat.'
		],
		cost: [
			'Chaque chemin d’écriture doit mettre la copie à jour : le modèle, les scripts en masse, les migrations, la console d’admin. Si tu en oublies un, la copie dérive sans erreur.',
			'Il te faut une tâche de réparation, et elle coûte une vraie charge : Discourse recompte chaque tag deux fois par jour.',
			'Un compteur sur une ligne parente populaire est un point chaud. Chaque nouvel enfant met à jour la même ligne, et les mises à jour concurrentes d’une même ligne attendent les verrous les unes des autres.',
			'Une vue matérialisée est périmée entre deux refresh, et un refresh sans `CONCURRENTLY` peut bloquer les lecteurs qu’elle devait aider.'
		]
	},
	task: {
		prompt: 'Ta boutique affiche « 4,5 étoiles, 2 avis » sur chaque fiche produit. Ajoute une copie à `products(id, name)` pour que la fiche n’ait pas besoin de joindre `reviews(id, product_id, rating)`. Dis quelles colonnes tu ajoutes, quelles écritures doivent les mettre à jour, et écris le SQL qui trouve et corrige la dérive.',
		hint: 'Peux-tu garder une moyenne juste avec seulement des mises à jour en +1 et -1 ? Que dois-tu ranger à la place ?',
		answer: [
			'Ajoute `reviews_count int NOT NULL DEFAULT 0` et `rating_sum int NOT NULL DEFAULT 0`, pas une moyenne. Une somme et un compte s’ajustent à chaque insertion ou suppression. La fiche calcule `rating_sum::numeric / NULLIF(reviews_count, 0)`.',
			'Écritures à couvrir : ajouter un avis (+1, +note), en supprimer un (-1, -note), et changer une note (ajouter la différence). Fais-le dans la même transaction que l’écriture de l’avis, en un seul `UPDATE products SET reviews_count = reviews_count + 1, rating_sum = rating_sum + $1 WHERE id = $2`.',
			'Réparation : `UPDATE products p SET reviews_count = x.n, rating_sum = x.s FROM (SELECT p2.id, count(r.id) AS n, COALESCE(sum(r.rating), 0) AS s FROM products p2 LEFT JOIN reviews r ON r.product_id = p2.id GROUP BY p2.id) x WHERE x.id = p.id AND (p.reviews_count <> x.n OR p.rating_sum <> x.s)`.',
			'Lance-la à intervalles réguliers, et journalise le nombre de lignes corrigées. Ce nombre devrait être zéro. Quand il ne l’est pas, un chemin d’écriture a oublié la copie, et le journal te dit depuis quand.'
		],
		steps: [
			{
				title: 'Choisis les colonnes',
				questions: [
					{ q: 'Quelles colonnes ajoutes-tu à `products` ?', options: ['`avg_rating numeric`', '`reviews_count int` et `rating_sum int`', '`last_rating int`', '`review_ids int[]`'], answer: 1, why: 'Un compte et une somme suffisent pour afficher « 4,5 étoiles, 2 avis » sans jointure.' },
					{ q: 'Pourquoi ranger une somme et un compte plutôt que la moyenne elle-même ?', options: ['Une somme et un compte s’ajustent à chaque insertion ou suppression', 'PostgreSQL ne sait pas ranger une colonne numeric', 'Une moyenne prend plus de place que deux entiers', 'Les moyennes sont toujours calculées par l’app'], answer: 0, why: 'Ajouter ou retirer un avis, c’est +1 et +note. La moyenne se calcule à partir d’eux à l’affichage de la fiche.' },
					{ q: 'Comment la fiche calcule-t-elle les étoiles ?', options: ['`avg(rating)` sur `reviews`', '`rating_sum / reviews_count`, deux entiers', '`rating_sum::numeric / NULLIF(reviews_count, 0)`', '`reviews_count / rating_sum`'], answer: 2, why: 'La conversion garde les décimales, donc 9 sur 2 affiche 4,5 et pas 4.' },
					{ q: 'Pourquoi le `NULLIF(reviews_count, 0)` ?', options: ['Pour arrondir le résultat', 'Pour cacher les produits à un seul avis', 'Pour rendre la colonne nullable', 'Un produit sans avis diviserait par zéro'], answer: 3, why: '`NULLIF` change le 0 en NULL, et diviser par NULL donne NULL au lieu d’une erreur.' }
				]
			},
			{
				title: 'Liste les écritures',
				questions: [
					{ q: 'Quelqu’un poste un avis à 4 étoiles. Qu’est-ce qui change sur le produit ?', options: ['`reviews_count + 1`, `rating_sum + 4`', '`reviews_count + 4`', '`rating_sum + 1`', 'Rien jusqu’à la tâche de la nuit'], answer: 0, why: 'Un avis de plus, quatre étoiles de plus dans la somme.' },
					{ q: 'Un avis à 5 étoiles est supprimé. Qu’est-ce qui change ?', options: ['`reviews_count - 1` seulement', '`rating_sum - 5` seulement', 'Rien, les suppressions sont rares', '`reviews_count - 1`, `rating_sum - 5`'], answer: 3, why: 'Les deux copies viennent des mêmes lignes, donc les deux reculent.' },
					{ q: 'Un auteur passe sa note de 3 à 5. Qu’est-ce qui change ?', options: ['`reviews_count + 1`, `rating_sum + 5`', '`rating_sum + 2`, le compte ne bouge pas', '`rating_sum + 5`, le compte ne bouge pas', 'Rien, la ligne d’avis est la même'], answer: 1, why: 'Ajoute la différence. Le nombre d’avis n’a pas changé.' },
					{ q: 'Quand la mise à jour du produit tourne-t-elle ?', options: ['Dans la même transaction que l’écriture de l’avis', 'Dans une tâche de fond une minute plus tard', 'Seulement quand la fiche est affichée', 'Une fois par jour, avec la réparation'], answer: 0, why: 'Ainsi l’avis et les compteurs sont validés ensemble, comme les callbacks Rails dans la transaction du save.' }
				]
			},
			{
				title: 'Écris la mise à jour sans risque',
				questions: [
					{ q: 'Quelle instruction met les compteurs à jour pour un nouvel avis ?', options: ['`UPDATE products SET reviews_count = 3, rating_sum = 13 WHERE id = $2`, avec des valeurs lues avant', '`UPDATE products SET reviews_count = reviews_count + 1, rating_sum = rating_sum + $1 WHERE id = $2`', '`INSERT INTO products (reviews_count) VALUES (1)`', '`UPDATE products SET reviews_count = count(*) WHERE id = $2`'], answer: 1, why: 'La base ajoute à la valeur actuelle, comme Rails avec `update_counters`, au lieu que l’app réécrive un nombre lu plus tôt.' },
					{ q: 'Deux avis du produit 7 arrivent en même temps. Chaque processus de l’app lit `reviews_count = 2` et écrit `reviews_count = 3`. Que vaut le compte une fois les deux validés ?', options: ['4', 'Une erreur sur la deuxième écriture', '3 : un avis manque au compte', '2'], answer: 2, why: 'Chaque processus a réécrit un nombre lu avant que l’autre valide. Avec `reviews_count = reviews_count + 1`, la base ajoute à la valeur actuelle et les deux comptent.' },
					{ q: 'Un produit populaire reçoit beaucoup d’avis en même temps. Que coûte le compteur ?', options: ['Rien, les compteurs sont gratuits', 'Chaque avis met à jour la même ligne, et ces mises à jour attendent les verrous les unes des autres', 'La table des avis grossit deux fois plus vite', 'Les lecteurs voient un compte NULL'], answer: 1, why: 'Un compteur sur une ligne parente chargée est un point chaud.' },
					{ q: 'Quelle donnée gagne quand le compteur et `reviews` ne sont pas d’accord ?', options: ['Le compteur, il est plus récent', 'Celle écrite en dernier', 'L’app décide à chaque fois', '`reviews`, la source de vérité'], answer: 3, why: 'La source gagne et la copie est reconstruite à partir d’elle.' }
				]
			},
			{
				title: 'Trouve et corrige la dérive',
				questions: [
					{ q: 'À partir de quoi la requête de réparation recompte-t-elle ?', options: ['`reviews`, avec une `LEFT JOIN` depuis `products`', '`products` seule', 'Les journaux de l’app', 'Une vue matérialisée de `products`'], answer: 0, why: 'Le recomptage lit la source de vérité et la compare à la copie.' },
					{ q: 'Pourquoi une `LEFT JOIN` et `COALESCE(sum(r.rating), 0)` ?', options: ['Pour accélérer la requête', 'Pour sauter les produits sans avis', 'Pour qu’un produit qui a perdu son dernier avis repasse à 0', 'Parce que `sum` ne tourne pas sur une jointure interne'], answer: 2, why: 'Avec une jointure interne, ce produit n’a aucune ligne dans le recomptage et garde ses nombres périmés. `sum` de rien vaut NULL, donc `COALESCE` donne 0.' },
					{ q: 'Juste après un passage planifié, un nouveau chemin d’écriture se met à oublier les compteurs. Combien de temps les cartes affichent-elles de faux nombres ?', options: ['Pour toujours : la réparation ne fait que journaliser', 'Jusqu’au passage planifié suivant, qui les réécrit', 'Jusqu’à ce que le produit reçoive un nouvel avis', 'Pas du tout : la carte lit `reviews`'], answer: 1, why: 'Une copie qui dérive reste fausse jusqu’au recomptage suivant. Un nouvel avis ne fait qu’ajouter à la valeur fausse. Discourse lance son job toutes les 12 heures, donc sa dérive peut durer jusqu’à 12 heures.' },
					{ q: 'La réparation planifiée journalise le nombre de lignes corrigées. Quel nombre attends-tu ?', options: ['Le nombre de produits', 'Le nombre de nouveaux avis du jour', 'À peu près la moitié des produits', 'Zéro'], answer: 3, why: 'Tout autre nombre veut dire qu’un chemin d’écriture a oublié la copie, et le journal te dit depuis quand.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un script de nettoyage lance `TopicTag.where(tag_id: 7).delete_all`. Qu’arrive-t-il à `tags.public_topic_count` pour le tag 7 ?',
			options: [
				'Il garde son ancienne valeur jusqu’à ce que le prochain recomptage le corrige',
				'Il baisse du nombre de lignes supprimées, grâce aux callbacks',
				'La suppression échoue, parce que le compteur fait encore référence à ces lignes',
				'PostgreSQL le recalcule tout de suite, comme il le fait pour les index'
			],
			answer: 0,
			why: '`delete_all` envoie une seule instruction SQL et ne lance aucun callback, donc le `after_destroy` qui décrémente le compteur ne se déclenche jamais. Le compteur a dérivé, et seul un recomptage comme `EnsureDbConsistency` le remet d’aplomb.'
		},
		{
			q: 'Pourquoi le recomptage de Discourse se termine-t-il par `AND x.topic_count <> t.public_topic_count` ?',
			options: [
				'Pour éviter une division par zéro pour les tags sans sujets',
				'Parce que `UPDATE ... FROM` a besoin d’une inégalité pour joindre deux tables',
				'Pour ne réécrire que les tags qui ont dérivé, pas tous à chaque passage',
				'Pour sauter les tags qu’une autre transaction a verrouillés'
			],
			answer: 2,
			why: 'Sans ça, chaque passage réécrirait chaque tag, et chaque `UPDATE` dans PostgreSQL laisse une nouvelle version de ligne derrière lui, même pour la même valeur. Avec ça, un passage où rien n’a dérivé n’écrit rien.'
		},
		{
			q: 'Un tableau de bord lit une vue matérialisée qu’un cron rafraîchit chaque nuit avec `REFRESH MATERIALIZED VIEW` (sans `CONCURRENTLY`). Qu’est-ce qui est vrai ?',
			options: [
				'Les lecteurs voient toujours des données en direct, le refresh ne refait que les index',
				'Entre deux refresh, elle montre les données de la veille, et un refresh peut bloquer les lectures',
				'La vue se met à jour seule après chaque écriture dans les tables qu’elle lit',
				'Chaque refresh n’ajoute que les lignes modifiées depuis le refresh précédent'
			],
			answer: 1,
			why: 'PostgreSQL range le résultat de la vue, qui ne change qu’au `REFRESH`. Ce `REFRESH` remplace tout son contenu. Sans `CONCURRENTLY`, ce refresh peut bloquer les lecteurs ; avec, la vue a besoin d’un index unique.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Tenir un compteur d’avis sur `products`, le faire dériver avec une seule suppression brute, et le réparer par un recomptage.',
		steps: [
			'Lance un PostgreSQL jetable : `docker run -d --name pg-denorm -e POSTGRES_PASSWORD=lab postgres:18`, attends quelques secondes, puis `docker exec -it pg-denorm psql -U postgres`.',
			'Crée les tables avec la copie : `CREATE TABLE products (id int PRIMARY KEY, name text, reviews_count int NOT NULL DEFAULT 0, rating_sum int NOT NULL DEFAULT 0); CREATE TABLE reviews (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, product_id int REFERENCES products, rating int); INSERT INTO products (id, name) VALUES (1, \'mug\'), (2, \'tea\');`',
			'Poste deux avis pour le mug comme il faut, chacun dans une transaction : `BEGIN; INSERT INTO reviews (product_id, rating) VALUES (1, 5); UPDATE products SET reviews_count = reviews_count + 1, rating_sum = rating_sum + 5 WHERE id = 1; COMMIT;` puis pareil avec la note 4. Affiche la fiche : `SELECT name, reviews_count, rating_sum::numeric / NULLIF(reviews_count, 0) AS stars FROM products ORDER BY id;`',
			'Fais-le dériver comme le ferait un script de nettoyage : `DELETE FROM reviews WHERE rating = 4;` et affiche de nouveau la fiche.',
			'Lance deux fois de suite la requête de réparation de l’exercice, puis affiche la fiche une dernière fois. Quitte avec `\\q` et nettoie avec `docker rm -f pg-denorm`.'
		],
		done: [
			'Avant la suppression, le mug affiche `2` avis et `4.5000000000000000` étoiles, et le thé une case d’étoiles vide (NULL).',
			'Après la suppression brute, le mug affiche toujours `2` avis : la copie a dérivé sans erreur.',
			'La première réparation affiche `UPDATE 1`, la seconde `UPDATE 0`, et le mug affiche maintenant `1` avis et `5.0000000000000000` étoiles.'
		],
		solution: [
			'Réparation : `UPDATE products p SET reviews_count = x.n, rating_sum = x.s FROM (SELECT p2.id, count(r.id) AS n, COALESCE(sum(r.rating), 0) AS s FROM products p2 LEFT JOIN reviews r ON r.product_id = p2.id GROUP BY p2.id) x WHERE x.id = p.id AND (p.reviews_count <> x.n OR p.rating_sum <> x.s);`',
			'Le second passage ne corrige rien, grâce au filtre `<>`. En production, journalise ce nombre : tout autre chose que zéro veut dire qu’un chemin d’écriture a oublié la copie.'
		]
	},
	recall: {
		q: 'Un script supprime des lignes avec `delete_all`. Pourquoi le `tags.public_topic_count` de Discourse est-il faux ensuite, et qu’est-ce qui le corrige ?',
		a: '`delete_all` ne lance aucun callback, donc le `-1` ne s’exécute jamais. La tâche `EnsureDbConsistency` recompte depuis `topic_tags` toutes les 12 heures et réécrit les tags dont le compte diffère.'
	},
	sources: [
		{ title: 'Rails, counter_cache.rb update_counters', url: `${RAILS}/counter_cache.rb#L108-L124` },
		{ title: 'PostgreSQL docs, REFRESH MATERIALIZED VIEW', url: 'https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html' },
		{ title: 'PostgreSQL docs, Materialized Views', url: 'https://www.postgresql.org/docs/current/rules-materializedviews.html' },
		{ title: 'Rails API, ActiveRecord::CounterCache', url: 'https://api.rubyonrails.org/classes/ActiveRecord/CounterCache/ClassMethods.html' },
		{ title: 'Rails Guides, Active Record Associations: counter_cache', url: 'https://guides.rubyonrails.org/association_basics.html#counter-cache' }
	]
};
