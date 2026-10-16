const DISCOURSE = 'https://github.com/discourse/discourse/blob/821e9e2f9f94483a3be8d1e077cde0fd94970479';
const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04/activerecord/lib/active_record';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'denormalization',
	part: 'Les données et les questions',
	title: 'Copier des données exprès',
	minutes: 10,
	hook: [
		'Un forum liste ses tags avec un nombre à côté de chacun : « sql, 1 204 sujets ». Compter ça depuis `topic_tags` à chaque affichage, c’est une jointure et un `count` pour chaque tag, pour chaque visiteur.',
		'Alors Discourse **range le compte sur la ligne du tag**. Ça enfreint la règle d’hier : ce nombre est une deuxième copie d’un fait que `topic_tags` contient déjà. Fait exprès, pour des lectures rapides, ça s’appelle la **dénormalisation**.',
		'Chaque copie a un prix : **elle peut dériver** de sa source. La vraie question de conception n’est donc pas « copier ou pas ». C’est **qui garde la copie à jour, et qui la répare quand elle est fausse**.'
	],
	terms: [
		{ term: 'Dénormalisation', def: 'Ranger un fait une deuxième fois, exprès, pour que les lectures coûtent moins cher. L’original reste la source de vérité.' },
		{ term: 'Source de vérité', def: 'Les données à partir desquelles une copie est calculée. Si les deux ne sont pas d’accord, la source gagne et la copie est reconstruite.' },
		{ term: 'Counter cache', def: 'Un compte rangé sur la ligne parente, comme `tags.public_topic_count`, mis à jour à chaque ajout ou retrait d’une ligne enfant.' },
		{ term: 'Vue matérialisée', def: 'Une requête dont PostgreSQL range le résultat comme une table. Elle ne change que quand tu lances `REFRESH MATERIALIZED VIEW`.' },
		{ term: 'Dérive', def: 'La copie ne correspond plus à sa source, parce qu’une écriture a changé l’une et pas l’autre.' },
		{ term: 'Réconciliation', def: 'Une tâche qui recalcule la copie depuis la source et corrige les lignes qui diffèrent.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['src[("topic_tags : source de vérité")] --> count["count par tag, à chaque affichage"]'],
				highlight: ['src', 'count'],
				note: '**La voie normalisée.** Le nombre de sujets par tag est déjà dans `topic_tags`. Le lire, c’est une jointure et un `GROUP BY` (jour 5) à chaque fois. Juste, toujours frais, et trop lent pour une page que chaque visiteur charge.'
			},
			{
				add: ['src -->|"after_create +1, after_destroy -1"| cache[("tags.public_topic_count")]'],
				highlight: ['cache'],
				note: '**Tenir la copie à jour à chaque écriture.** Le modèle `TopicTag` de Discourse a des callbacks qui ajoutent ou retirent 1 aux compteurs du tag. Rails lance les callbacks de `save` et `destroy` dans la même transaction que l’écriture, donc la ligne et le compte sont validés ensemble.'
			},
			{
				add: ['bulk["update_all, SQL brut, une correction en console"] -.->|"saute les callbacks"| src', 'cache --- wrong["Le compte est faux"]'],
				highlight: ['bulk', 'wrong'],
				note: '**Comment une copie dérive.** La copie n’est juste que si **chaque** écriture passe par le code qui la met à jour. Rails dit que `update_all` « does not trigger Active Record callbacks or validations » (ne déclenche ni callbacks ni validations). Une suppression en masse, une migration ou une correction SQL à la main change la source et laisse le compteur derrière. Aucune erreur n’est levée.'
			},
			{
				add: ['job["EnsureDbConsistency, toutes les 12 heures"] -->|"recompte, corrige les lignes qui diffèrent"| cache'],
				highlight: ['job'],
				note: '**Réparer à intervalles réguliers.** Discourse lance une tâche toutes les 12 heures qui recalcule les comptes depuis la source et n’écrit que les lignes fausses. La copie peut être fausse un moment, mais jamais longtemps, et jamais pour de bon.'
			},
			{
				add: ['mv[("vue matérialisée")] -->|"REFRESH : tout recalculer"| mv2["Fraîche jusqu’à la prochaine écriture"]'],
				highlight: ['mv', 'mv2'],
				note: '**L’autre sorte de copie.** Une vue matérialisée range le résultat d’une requête. La doc : « REFRESH MATERIALIZED VIEW completely replaces the contents of a materialized view. » (remplace tout son contenu). Entre deux refresh, elle est périmée. Sans `CONCURRENTLY`, un refresh peut bloquer les lecteurs, et `CONCURRENTLY` exige un index unique sur la vue.'
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
			'**Le chemin d’écriture.** [`TopicTag`](' + DISCOURSE + '/app/models/topic_tag.rb#L7-L47) appelle `Tag.update_counters(tag.id, ...)` avec `+1` après une création et `-1` après une suppression. Rails en fait une seule instruction, [`SET comments_count = COALESCE(comments_count, 0) + 1`](' + RAILS + '/counter_cache.rb#L108-L124) : la base ajoute à la valeur actuelle, au lieu que l’appli réécrive un nombre lu plus tôt.',
			'**Rails s’attend à la dérive.** La doc de [`reset_counters`](' + RAILS + '/counter_cache.rb#L14-L16) dit qu’il sert « when adding new counter caches, or if the counter has been corrupted or modified directly by SQL » (à l’ajout d’un compteur, ou quand il a été corrompu ou modifié directement en SQL). Discourse écrit son propre recomptage, qui contient des règles qu’un simple compte raterait : seulement les sujets vivants, pas de messages privés, et pour le compte public, pas de catégories à accès restreint.',
			'**La tâche de réparation.** [`EnsureDbConsistency`](' + DISCOURSE + '/app/jobs/scheduled/ensure_db_consistency.rb#L5-L46) tourne `every 12.hours` et appelle `ensure_consistency!` sur vingt modèles, dont `Tag`. Chaque appel est entouré d’un `rescue` : un modèle qui échoue est journalisé, et les autres tournent quand même.',
			'**N’écrire que ce qui est faux.** `x.topic_count <> t.staff_topic_count` saute les tags déjà justes. Le comportement normal de PostgreSQL « always performs a physical row update regardless of whether or not the data has changed » (écrit physiquement la ligne même si rien n’a changé, jour 16), donc ce filtre garde un recomptage complet bon marché.',
			'**Zéro aussi est une valeur.** Dans le compte public, la sous-requête en `INNER JOIN` ne contient que les tags qui ont encore des sujets publics. Le `LEFT JOIN` externe depuis `tags` avec `COALESCE(..., 0)` donne 0 à tous les autres. Sans lui, le recomptage ne remettrait jamais à zéro un tag qui a perdu son dernier sujet public (les règles de NULL, jour 6).'
		]
	},
	tradeoff: {
		gain: [
			'Les lectures deviennent bon marché : une colonne sur une ligne que tu charges de toute façon, au lieu d’une jointure et d’un compte.',
			'Tu peux indexer la copie, donc « tags triés par nombre de sujets » ou « produits les plus notés » ne lit que quelques pages d’index.',
			'Une vue matérialisée calcule un rapport lourd une seule fois, et tous les lecteurs partagent le résultat.'
		],
		cost: [
			'Chaque chemin d’écriture doit mettre la copie à jour : le modèle, les scripts en masse, les migrations, la console d’admin. Oublies-en un et la copie dérive sans erreur.',
			'Il te faut une tâche de réparation, et elle coûte une vraie charge : Discourse recompte chaque tag deux fois par jour.',
			'Un compteur sur une ligne parente populaire devient un point chaud. Chaque nouvel enfant met à jour la même ligne, et les mises à jour concurrentes d’une même ligne attendent les verrous les unes des autres.',
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
		]
	},
	quiz: [
		{
			q: 'Un script de nettoyage lance `TopicTag.where(tag_id: 7).delete_all`. Que devient `tags.public_topic_count` pour le tag 7 ?',
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
			why: 'Une vue matérialisée est un résultat rangé. Elle ne change qu’au `REFRESH`, qui remplace tout son contenu. Sans `CONCURRENTLY`, ce refresh peut bloquer les lecteurs ; avec, la vue a besoin d’un index unique.'
		}
	],
	takeaway: 'Dénormalise pour rendre les lectures bon marché, mais nomme la source de vérité, mets la copie à jour dans la même transaction que la source, et fais tourner un recomptage qui corrige la dérive et te dit qu’elle a eu lieu.',
	sources: [
		{ title: 'PostgreSQL docs, REFRESH MATERIALIZED VIEW', url: 'https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html' },
		{ title: 'PostgreSQL docs, Materialized Views', url: 'https://www.postgresql.org/docs/current/rules-materializedviews.html' },
		{ title: 'Rails API, ActiveRecord::CounterCache', url: 'https://api.rubyonrails.org/classes/ActiveRecord/CounterCache/ClassMethods.html' },
		{ title: 'Rails Guides, Active Record Associations: counter_cache', url: 'https://guides.rubyonrails.org/association_basics.html#counter-cache' }
	]
};
