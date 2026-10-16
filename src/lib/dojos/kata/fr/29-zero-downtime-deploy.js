/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'zero-downtime-deploy',
	part: 'Fiabilité',
	title: 'Déployer sans interruption',
	minutes: 10,
	hook: [
		'Une application de livraison de repas renomme la colonne `orders.address` en `orders.shipping_address`. La migration et le nouveau code partent ensemble, un jour de semaine à 11 h.',
		'La migration passe en premier et prend une seconde. Le nouveau code se déploie ensuite sur 40 serveurs, 4 par 4. Pendant 9 minutes, les serveurs encore sur l’ancien code envoient `SELECT address FROM orders`, et PostgreSQL rejette chacune de ces requêtes car la colonne n’existe plus.',
		'L’équipe veut désormais des mises en production qui changent le schéma et le code sans une seule requête en échec.'
	],
	terms: [
		{ term: 'Déploiement progressif', def: 'Les serveurs reçoivent la nouvelle version quelques-uns à la fois, pendant que les autres continuent de servir. Un moment, l’ancien et le nouveau code tournent côte à côte sur la même base.' },
		{ term: 'Expand and contract', def: 'Un changement de schéma découpé en étapes. On ajoute d’abord la nouvelle forme à côté de l’ancienne, on y migre le code et les données, et seulement ensuite on retire l’ancienne.' },
		{ term: 'Backfill', def: 'Une tâche qui remplit une nouvelle colonne pour les lignes qui existaient avant elle, par petits lots.' }
	],
	kata: {
		brief: [
			'Une application de livraison de repas tourne sur 40 serveurs applicatifs identiques derrière un répartiteur de charge. En journée, le trafic est de 2 000 requêtes par seconde, et un serveur en tient 60 au maximum.',
			'Une mise en production doit renommer `orders.address` en `orders.shipping_address` et la passer en `NOT NULL`. La table `orders` de PostgreSQL contient **50 millions de lignes**.',
			'Aucune requête ne doit échouer pendant la mise en production. Si le nouveau code se comporte mal, l’équipe doit pouvoir revenir à l’ancien code en 10 minutes. Dans cet énoncé, un lot de backfill de 10 000 lignes prend 0,2 seconde.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit quelles versions du code tournent en même temps pendant le déploiement, et que chacune marche avec le schéma du moment.',
			'Ton design découpe le renommage en étapes, et dit quelle mise en production livre chaque étape.',
			'Ton design dit combien de serveurs sortent du pool à la fois, et que les autres tiennent 2 000 requêtes par seconde.',
			'Ton design dit comment les 50 millions de lignes existantes reçoivent la nouvelle colonne, et en combien de temps.',
			'Ton design ajoute `NOT NULL` sans long verrou qui bloque les écritures sur `orders`.',
			'Ton design dit comment revenir à l’ancien code à chaque étape.'
		],
		sample: [
			'Un renommage en une étape ne peut pas marcher avec un déploiement progressif : pendant le déploiement, l’ancien et le nouveau code interrogent la même table, et chacun attend un nom de colonne différent. La réponse utilise expand and contract sur trois mises en production.',
			'Mise en production 1, expand. La migration lance `SET lock_timeout = \'2s\'` puis `ALTER TABLE orders ADD COLUMN shipping_address text`. Sans valeur par défaut, PostgreSQL ne réécrit pas la table, donc le verrou `ACCESS EXCLUSIVE` ne dure qu’un instant. Sans `lock_timeout`, l’`ALTER` attendrait sans limite derrière une longue requête de reporting. Le nouveau code écrit les deux colonnes et lit `shipping_address`, ou `address` quand elle est NULL.',
			'Le déploiement. Le répartiteur arrête d’envoyer de nouvelles requêtes à 4 serveurs, attend 30 secondes que leurs requêtes en cours se terminent, puis ils redémarrent sur le nouveau code. 36 serveurs × 60 = 2 160 requêtes par seconde, juste au-dessus des 2 000 du trafic. 10 lots d’environ une minute font 10 minutes. Revenir en arrière, c’est redéployer l’ancien code, qui ignore la nouvelle colonne.',
			'Le backfill. Une tâche lance `UPDATE orders SET shipping_address = address WHERE id BETWEEN $1 AND $2 AND shipping_address IS NULL` par tranches de 10 000 ids. Ça fait 5 000 lots à 0,2 seconde, environ **17 minutes**. Chaque lot est sa propre transaction, donc aucune ligne ne reste verrouillée plus d’une fraction de seconde.',
			'Le NOT NULL. `ADD CONSTRAINT shipping_address_set CHECK (shipping_address IS NOT NULL) NOT VALID` saute le parcours des lignes existantes. `VALIDATE CONSTRAINT shipping_address_set` parcourt ensuite la table avec un simple verrou `SHARE UPDATE EXCLUSIVE`, et les insertions et mises à jour continuent. Enfin, `SET NOT NULL` saute son propre parcours : la doc de PostgreSQL dit qu’une contrainte CHECK valide qui « proves no NULL can exist » suffit.',
			'La mise en production 2 livre du code qui lit et écrit seulement `shipping_address`. La 3, une semaine plus tard, lance `ALTER TABLE orders DROP COLUMN address`. PostgreSQL ne fait que masquer une colonne supprimée, donc c’est rapide. La doc dit que la place est « reclaimed over time as existing rows are updated » (récupérée au fil des mises à jour de lignes).',
			'Le retour en arrière a des limites. Le code d’origine insère des commandes sans `shipping_address`, donc il casse dès que `NOT NULL` est posé : la réponse lance cette étape seulement après une journée sans souci sur la mise en production 1. Après la 3, revenir à la 1 demande de restaurer la colonne `address` depuis une sauvegarde.',
			'Le prix : un renommage prend trois mises en production et une semaine, et la 1 embarque du code qui écrit deux colonnes et lit avec un repli.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse, comment `NOT NULL` arrive-t-il sur 50 millions de lignes sans bloquer les écritures ?',
		a: 'Une contrainte CHECK ajoutée en `NOT VALID`, puis `VALIDATE CONSTRAINT` sous un verrou `SHARE UPDATE EXCLUSIVE`, puis `SET NOT NULL`, qui saute son parcours car la CHECK valide prouve l’absence de NULL.'
	},
	sources: [
		{ title: 'Documentation PostgreSQL, ALTER TABLE', url: 'https://www.postgresql.org/docs/current/sql-altertable.html' },
		{ title: 'Documentation PostgreSQL, Explicit Locking (modes de verrou de table)', url: 'https://www.postgresql.org/docs/current/explicit-locking.html' },
		{ title: 'Documentation PostgreSQL, Client Connection Defaults (lock_timeout)', url: 'https://www.postgresql.org/docs/current/runtime-config-client.html' }
	]
};
