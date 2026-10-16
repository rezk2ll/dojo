/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'db-failover',
	part: 'Fiabilité',
	title: 'La bascule d’une base de données',
	minutes: 10,
	hook: [
		'3 h 04 du matin. L’alimentation du serveur PostgreSQL primaire d’une boutique en ligne lâche. Les deux réplicas tournent toujours. Les 12 serveurs applicatifs visent encore la machine morte, et chaque paiement échoue sur une erreur de connexion.',
		'L’astreinte se réveille à 3 h 11, se connecte à 3 h 19 et promeut un réplica à la main à 3 h 26. La boutique a perdu 22 minutes de commandes, et personne ne sait si les dernières commandes avant la panne étaient arrivées sur le réplica.',
		'La boutique veut que la prochaine bascule se fasse sans personne, en moins de 30 secondes.'
	],
	terms: [
		{ term: 'Clé de leader', def: 'Une clé dans un petit stockage de coordination, comme etcd, que seul le primaire en place a le droit de tenir. Elle a une durée de vie, et le primaire doit la renouveler avant qu’elle expire.' },
		{ term: 'Réplication synchrone', def: 'Le primaire annonce un commit réussi seulement quand un réplica confirme qu’il a reçu le changement. Une écriture que le client a vue réussir se trouve alors sur deux machines.' },
		{ term: 'Split brain', def: 'Deux serveurs acceptent des écritures en tant que primaire en même temps. Leurs données divergent, et il faut jeter un des côtés ou fusionner à la main.' }
	],
	kata: {
		brief: [
			'Une boutique en ligne fait tourner un primaire PostgreSQL et deux réplicas en streaming, chacun sur son serveur, dans un seul datacenter. 12 serveurs applicatifs envoient 400 écritures par seconde en pointe et lisent sur les réplicas.',
			'Le primaire meurt à 3 h du matin, personne n’est debout. Les écritures peuvent être refusées pendant **30 secondes au plus**, de la panne jusqu’à la première écriture acceptée par le nouveau primaire.',
			'Une commande que le client a vue confirmée ne doit pas se perdre. L’ancien primaire peut redémarrer tout seul, et il ne doit plus prendre d’écritures. Les serveurs applicatifs doivent trouver le nouveau primaire sans que personne ne touche à leur configuration.'
		],
		minutes: 10,
		checklist: [
			'Ton design nomme le composant qui décide que le primaire est mort, et au bout de combien de secondes.',
			'Ton design additionne les secondes entre la panne et la première écriture acceptée, et le total reste sous 30.',
			'Ton schéma montre comment les 12 serveurs applicatifs atteignent le nouveau primaire sans changer leur configuration.',
			'Ton design dit si un commit confirmé juste avant la panne peut se perdre, et pourquoi.',
			'Ton design dit ce qui empêche l’ancien primaire de prendre des écritures quand il redémarre.',
			'Ton design dit ce que fait l’application des écritures qui échouent pendant la bascule.'
		],
		sample: [
			'Chaque serveur de base fait tourner Patroni à côté de PostgreSQL, et trois petites machines font tourner etcd. Le primaire tient une clé de leader dans etcd, avec une durée de vie (`ttl`), et la renouvelle toutes les `loop_wait` secondes. Quand la clé expire, un réplica la prend et promeut son PostgreSQL.',
			'Le calcul du temps. Patroni impose `loop_wait + 2 * retry_timeout <= ttl`, et `ttl` ne descend pas sous 20. La réponse choisit `ttl: 20`, `loop_wait: 5` et `retry_timeout: 7` : 5 + 14 = 19. Au pire, le primaire a renouvelé sa clé juste avant la panne, et elle expire 20 secondes plus tard. Un réplica le voit à sa boucle suivante, 5 secondes plus tard au maximum.',
			'Les serveurs applicatifs se connectent à HAProxy, pas directement à une base. HAProxy appelle `GET /primary` sur chaque Patroni toutes les secondes. Patroni n’y répond 200 que sur le nœud qui tourne en primaire et tient la clé de leader. Avec `inter 1s rise 2`, le nouveau primaire reçoit du trafic environ 2 secondes après son premier 200.',
			'Total : 20 + 5 + 2 = **27 secondes**, il reste environ 3 secondes pour la promotion elle-même. À 400 écritures par seconde, 27 secondes font environ 10 800 écritures refusées. L’application rejoue chaque écriture ratée toutes les 2 secondes pendant 30 secondes, puis affiche une erreur au client.',
			'Les commits perdus. Avec la réplication asynchrone par défaut, la doc de Patroni borne la perte à `maximum_lag_on_failover` octets plus ce qui a été écrit pendant les `ttl` dernières secondes. La réponse active `synchronous_mode`. Patroni ne promeut alors un réplica que s’il est sûr que ce réplica a tous les commits renvoyés comme réussis à un client.',
			'Le prix de `synchronous_mode` : chaque commit attend la confirmation d’un réplica, donc chaque écriture du paiement prend un aller-retour réseau de plus. Si le réplica synchrone plante, les commits bloquent jusqu’à ce que Patroni change de mode, jusqu’à `ttl` secondes dans le pire cas.',
			'L’ancien primaire. Quand il redémarre, un autre nœud tient la clé de leader, donc son `GET /primary` ne renvoie pas 200 et HAProxy ne lui envoie aucune écriture.',
			'Les délais courts ont aussi un coût. Patroni n’ignore un souci d’accès à etcd que s’il dure moins de `retry_timeout`, soit 7 secondes ici. Une coupure réseau plus longue peut rétrograder un primaire en bonne santé et refuser des écritures pour une bascule inutile.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse, quels réglages fixent la durée de la bascule, et quel est le pire cas ?',
		a: '`ttl: 20` et `loop_wait: 5`, plus HAProxy qui vérifie chaque seconde : 20 + 5 + 2 = 27 secondes avant que le nouveau primaire accepte des écritures.'
	},
	sources: [
		{ title: 'Documentation Patroni, Dynamic configuration settings', url: 'https://patroni.readthedocs.io/en/latest/dynamic_configuration.html' },
		{ title: 'Documentation Patroni, Replication modes', url: 'https://patroni.readthedocs.io/en/latest/replication_modes.html' },
		{ title: 'Documentation Patroni, REST API (points de contrôle de santé)', url: 'https://patroni.readthedocs.io/en/latest/rest_api.html' }
	]
};
