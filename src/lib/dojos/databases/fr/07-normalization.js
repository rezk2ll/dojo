const LEMMY = 'https://github.com/LemmyNet/lemmy/blob/fc640cf86a130bc897d83dbd06d84c3c7d9b16e3/migrations';
const MOVE = `${LEMMY}/2022-10-06-183632_move_blocklist_to_db/up.sql`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'normalization',
	part: 'Les données et les questions',
	title: 'La normalisation',
	minutes: 10,
	hook: [
		'Un client change son email dans son profil. La facture suivante part quand même à l’ancienne adresse. La table `orders` avait **sa propre copie de l’email**, et rien ne l’a mise à jour.',
		'C’est une **anomalie de mise à jour** : un même fait rangé à deux endroits, modifié à un seul. Elle a deux sœurs. L’**anomalie d’insertion** : tu ne peux pas enregistrer un fait tant qu’aucune autre ligne n’existe pour le porter. L’**anomalie de suppression** : tu supprimes la dernière commande, et l’adresse du client part avec.',
		'La normalisation est le remède, et l’idée tient en une ligne : **un fait, à un seul endroit**. William Kent le formule ainsi : un enregistrement est en deuxième et troisième forme normale « if every field is either part of the key or provides a (single-valued) fact about exactly the whole key and nothing else » (si chaque champ fait partie de la clé, ou dit un fait sur toute la clé et rien d’autre). Les formes normales ne sont que des noms pour ces vérifications.'
	],
	terms: [
		{ term: 'Anomalie', def: 'Un changement que la forme de la table rend difficile ou faux : un fait à mettre à jour dans plein de lignes (mise à jour), impossible à ranger pour l’instant (insertion), ou qui disparaît avec une autre ligne (suppression).' },
		{ term: 'Dépendance fonctionnelle', def: 'La colonne B dépend de la colonne A quand une valeur de A va toujours avec une seule valeur de B. Un entrepôt a une seule adresse : `warehouse` détermine `address`.' },
		{ term: '1NF', def: 'Première forme normale : chaque colonne contient une seule valeur. Pas de liste séparée par des virgules, pas de colonnes `tag1`, `tag2`, `tag3`.' },
		{ term: '2NF', def: 'Deuxième forme normale : avec une clé composée, aucune colonne n’est un fait sur une partie seulement de la clé.' },
		{ term: '3NF', def: 'Troisième forme normale : aucune colonne hors de la clé n’est un fait sur une autre colonne hors de la clé.' },
		{ term: 'Décomposition', def: 'Couper une table en deux, reliées par une clé, pour que chaque fait vive dans une seule table. Une jointure redonne les lignes d’origine.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['tags["post.tags = \'sql,db\'"] -->|"1NF"| pt[("post_tag : post_id, tag")]'],
				highlight: ['tags', 'pt'],
				note: '**Une valeur par colonne.** Une liste séparée par des virgules ne peut pas porter une clé étrangère par tag, et trouver tous les posts tagués `db` oblige à chercher dans des chaînes. Kent : « First normal form excludes variable repeating fields and groups. » (la première forme normale exclut les champs et groupes répétés). Une ligne par post et par tag règle les deux.'
			},
			{
				add: ['inv[("inventory : part, warehouse, quantity, warehouse_address")]'],
				highlight: ['inv'],
				note: '**Un fait sur une partie de la clé.** C’est l’exemple de Kent lui-même. La clé est `(part, warehouse)`. `quantity` dépend des deux, mais `warehouse_address` ne dépend que de l’entrepôt. L’adresse est donc répétée sur chaque ligne de cet entrepôt.'
			},
			{
				add: ['inv -->|"l’adresse change"| upd["Mettre à jour chaque ligne de l’entrepôt"]', 'inv -->|"entrepôt vide"| lost["Plus de ligne pour garder son adresse"]'],
				highlight: ['upd', 'lost'],
				note: '**Les anomalies.** Quand l’adresse change, chaque ligne doit changer, et en rater une laisse deux adresses pour un seul entrepôt. Et selon Kent : « If at some point in time there are no parts stored in the warehouse, there may be no record in which to keep the warehouse’s address. » (si l’entrepôt est vide, il peut ne rester aucune ligne pour garder son adresse).'
			},
			{
				add: ['inv --> stock[("stock : part, warehouse, quantity")]', 'inv --> wh[("warehouse : warehouse, address")]'],
				highlight: ['stock', 'wh'],
				note: '**Couper selon ce dont parle le fait (2NF).** La quantité parle d’une pièce dans un entrepôt, elle reste donc avec la clé complète. L’adresse parle d’un entrepôt, elle part dans une table dont la clé est l’entrepôt. Une ligne par entrepôt, un seul endroit à modifier, et un entrepôt vide garde sa ligne.'
			},
			{
				add: ['emp[("employee : employee, department, location")] --> emp2[("employee : employee, department")]', 'emp --> dept[("department : department, location")]'],
				highlight: ['emp', 'dept'],
				note: '**Un fait sur une autre colonne hors clé (3NF).** La clé est `employee`. Si chaque service est installé à un seul endroit, `location` est un fait sur le service, pas sur l’employé. Elle part dans la table des services, et déménager un service devient une seule mise à jour.'
			}
		]
	},
	example: {
		title: 'Lemmy migrations/2022-10-06-183632_move_blocklist_to_db/up.sql : une ligne par instance',
		repo: 'LemmyNet/lemmy',
		url: `${MOVE}#L3-L94`,
		lang: 'sql',
		code: `CREATE TABLE instance (
    id serial PRIMARY KEY,
    domain varchar(255) NOT NULL UNIQUE,
    published timestamp NOT NULL DEFAULT now(),
    updated timestamp NULL
);
…
INSERT INTO instance (DOMAIN)
SELECT DISTINCT
    substring(p.actor_id FROM '(?:.*://)?(?:www\\.)?([^/?]*)')
FROM (
    SELECT
        actor_id
    FROM
        site
    UNION
    SELECT
        actor_id
    FROM
        person
    UNION
    SELECT
        actor_id
    FROM
        community) AS p;
…
ALTER TABLE person
    ADD COLUMN instance_id int REFERENCES instance ON UPDATE CASCADE ON DELETE CASCADE;
…
UPDATE
    person
SET
    instance_id = i.id
FROM
    instance i
WHERE
    substring(actor_id FROM '(?:.*://)?(?:www\\.)?([^/?]*)') = i.domain;
…
ALTER TABLE person
    ALTER COLUMN instance_id SET NOT NULL;
…
CREATE TABLE federation_blocklist (
    id serial PRIMARY KEY,
    instance_id int REFERENCES instance ON UPDATE CASCADE ON DELETE CASCADE NOT NULL UNIQUE,
    published timestamp NOT NULL DEFAULT now(),
    updated timestamp NULL
);`,
		notes: [
			'**Le fait n’avait pas de maison.** Lemmy est un forum fédéré : les personnes et les communautés viennent de plein de serveurs. Avant cette migration, il n’y a pas de table des serveurs : la migration doit extraire chaque domaine des URL `actor_id`, où il est répété sur chaque personne et chaque communauté de ce serveur. Aucune ligne ne pouvait porter un fait sur le serveur lui-même : une anomalie d’insertion.',
			'**Décomposer, puis pointer dessus.** La migration crée une ligne `instance` par domaine distinct (`domain ... UNIQUE`), ajoute `instance_id` avec une clé étrangère sur `site`, `person` et `community`, la remplit avec `UPDATE ... FROM instance`, et seulement ensuite la passe en `NOT NULL`. Le [fichier complet](' + MOVE + '#L30-L79) fait pareil pour les trois tables.',
			'**Les nouveaux faits ont une seule place.** Les listes d’autorisation et de blocage référencent `instance_id`, donc bloquer un serveur tient en une ligne. Une [migration plus tardive](' + LEMMY + '/2023-02-13-221303_add_instance_software_and_version/up.sql#L1-L6) ajoute `software` et `version` à `instance` : deux colonnes sur une ligne par serveur, pas une copie sur chaque utilisateur.',
			'**La normalisation s’arrête quelque part.** `actor_id` contient toujours l’URL complète, domaine compris, donc le domaine est désormais écrit à deux endroits. Et la migration qui ajoute [`instance_block`](' + LEMMY + '/2023-08-09-101305_user_instance_block/up.sql#L1-L50) copie aussi `community.instance_id` dans `post_aggregates`, et son trigger la remplit pour chaque nouveau post. Cette copie est voulue : c’est le chapitre de demain.'
		]
	},
	tradeoff: {
		gain: [
			'Un seul endroit pour changer un fait. Pas de tâche qui traque chaque copie, et pas deux lignes qui se contredisent.',
			'Les contraintes peuvent faire leur travail : une clé étrangère sur `instance_id`, un `UNIQUE` sur `domain`. Une copie dans une colonne texte ne vérifie rien.',
			'Le schéma accueille facilement de nouveaux faits. Un nouvel attribut d’un entrepôt ou d’un serveur, c’est une colonne sur une table.',
			'Les lignes sont étroites, donc les écritures touchent moins de données, et une mise à jour change une ligne au lieu de milliers.'
		],
		cost: [
			'Les lectures ont besoin de jointures. Une page qui affiche des posts avec le nom de leur serveur joint maintenant trois tables.',
			'Poussé trop loin, un schéma se découpe en plein de petites tables, et chaque écran simple le paie en jointures.',
			'Toute copie n’est pas une erreur. Une facture doit garder l’adresse à laquelle elle a été envoyée, même après le déménagement du client. C’est un autre fait, et le normaliser fait perdre l’historique.',
			'Changer un schéma existant veut dire une migration avec un backfill, souvent sur plusieurs releases (expand et contract).'
		]
	},
	task: {
		prompt: 'Ta boutique a une seule table : `order_lines(order_id, product_id, quantity, product_name, unit_price, customer_id, customer_email, shipped_to)`, de clé `(order_id, product_id)`. Pour chaque colonne, dis de quoi elle est un fait. Puis découpe-la en tables qui contiennent chacune un seul type de fait.',
		hint: 'Pour chaque colonne, demande-toi : dépend-elle de toute la clé, de `order_id` seul, de `product_id` seul, ou d’une autre colonne hors clé ?',
		answer: [
			'`quantity` dépend de toute la clé : elle reste dans `order_lines(order_id, product_id, quantity, unit_price)`.',
			'`product_name` ne dépend que de `product_id` (une entorse à la 2NF) : déplace-la dans `products(product_id, name, price)`.',
			'`customer_id` et `shipped_to` ne dépendent que de `order_id` (2NF) : déplace-les dans `orders(order_id, customer_id, shipped_to)`.',
			'`customer_email` dépend de `customer_id`, une colonne hors clé de la commande (une entorse à la 3NF) : déplace-la dans `customers(customer_id, email)`. Le bug de facture du début disparaît.',
			'Garde exprès `unit_price` sur la ligne et `shipped_to` sur la commande : elles disent ce qui était vrai au moment de la commande, ce que le prix actuel du produit ou l’adresse actuelle du client ne peuvent pas te dire.'
		]
	},
	quiz: [
		{
			q: '`enrollment(student_id, course_id, grade, course_room)` a pour clé `(student_id, course_id)`. Quelle règle `course_room` enfreint-elle ?',
			options: [
				'La deuxième forme normale : la salle est un fait sur le cours seul',
				'La première forme normale : une salle n’est pas une valeur atomique',
				'La troisième forme normale : la salle est un fait sur la note',
				'Aucune : chaque colonne ici dépend de la clé complète'
			],
			answer: 0,
			why: 'La salle dépend de `course_id`, qui n’est qu’une partie de la clé. Elle est répétée pour chaque étudiant du cours, et change dans plein de lignes quand le cours déménage. Sa place est dans `courses(course_id, room)`.'
		},
		{
			q: 'Tu supprimes la dernière commande d’un client, et son numéro de téléphone disparaît de la base. Que s’est-il passé ?',
			options: [
				'Une anomalie de mise à jour : le numéro a changé dans une ligne mais pas dans les autres',
				'Une anomalie de suppression : le numéro n’était rangé que sur les lignes de commande',
				'Une anomalie d’insertion : le numéro n’a jamais été écrit au départ',
				'Une mise à jour perdue : deux transactions ont écrit le client en même temps'
			],
			answer: 1,
			why: 'Le numéro de téléphone est un fait sur le client, rangé avec chaque commande. Sans commande, plus aucune ligne ne le porte. Une table `customers` dont la clé est le client le garde, qu’il ait des commandes ou non.'
		},
		{
			q: 'Ta table `invoices` garde l’adresse de facturation telle qu’elle était le jour de la vente, à côté de `customer_id`. Est-ce une erreur de normalisation ?',
			options: [
				'Oui, elle enfreint la 3NF et devrait être lue dans `customers` avec une jointure',
				'Oui, toute colonne qui copie une autre table est une donnée redondante',
				'Non, car l’adresse sur la facture est un autre fait que l’adresse actuelle',
				'Non, car les formes normales ne valent que pour les clés composées'
			],
			answer: 2,
			why: 'L’adresse actuelle du client et l’adresse où une facture a été envoyée sont deux faits. Quand le client déménage, l’ancienne facture ne doit pas changer. La normalisation, c’est un fait à un seul endroit, pas l’interdiction de ranger des valeurs qui se ressemblent.'
		}
	],
	takeaway: 'Range chaque fait une seule fois, dans la table de la chose qu’il décrit : chaque colonne est un fait sur la clé, toute la clé, et rien d’autre. Ne copie que quand la copie est un autre fait, comme un prix au moment de la vente.',
	sources: [
		{ title: 'PostgreSQL docs, Foreign Keys (tutorial)', url: 'https://www.postgresql.org/docs/current/tutorial-fk.html' },
		{ title: 'PostgreSQL docs, Constraints', url: 'https://www.postgresql.org/docs/current/ddl-constraints.html' },
		{ title: 'William Kent, A Simple Guide to Five Normal Forms in Relational Database Theory (Communications of the ACM, 1983)', url: 'https://doi.org/10.1145/358024.358054' }
	]
};
