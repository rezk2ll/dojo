/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'permissions',
	part: 'Architecture',
	title: 'Un système de permissions',
	minutes: 10,
	hook: [
		'Lina est designer dans une entreprise qui utilise un outil de gestion de projets. Elle fait partie de l’équipe « Brand », qui est elle-même dans l’équipe « Marketing ». Marketing peut modifier le projet « Spring launch ». Lina ouvre un fichier de ce projet et clique sur Modifier.',
		'Avant d’ouvrir l’éditeur, l’outil doit répondre à une question : Lina peut-elle modifier ce fichier ? La réponse dépend du fichier, de son projet, de deux équipes imbriquées et de la liste des admins de son entreprise.',
		'Chaque appel d’API pose cette question, souvent plusieurs fois. Si une réponse prend 20 ms, une page qui liste 50 fichiers passe une seconde rien qu’en permissions.'
	],
	terms: [
		{ term: 'Relation tuple', def: 'Un fait stocké de la forme objet, relation, utilisateur, comme `project:p1#editor@team:t1#member` (les membres de l’équipe t1 sont éditeurs de p1).' },
		{ term: 'Check', def: 'La question « l’utilisateur U a-t-il la relation R sur l’objet O ? », à laquelle on répond en suivant les tuples de O jusqu’à U.' },
		{ term: 'Appartenance aplatie', def: 'Pour chaque utilisateur, la liste calculée d’avance de toutes ses équipes, directes ou via des équipes imbriquées.' },
		{ term: 'Problème du « new enemy »', def: 'Un utilisateur retiré d’une équipe garde l’accès, parce qu’un serveur a vérifié sur des données d’avant le retrait.' }
	],
	kata: {
		brief: [
			'L’outil compte 4 000 organisations, 200 000 utilisateurs, 400 000 projets et 30 millions de fichiers. Une équipe peut contenir des équipes, jusqu’à 4 niveaux.',
			'Un admin d’organisation peut tout modifier dans son organisation. Un projet donne le rôle éditeur ou lecteur à des utilisateurs ou à des équipes. Un fichier hérite de son projet, et peut aussi être partagé directement avec un utilisateur.',
			'L’API fait 3 000 checks de permission par seconde au pic. Chaque check doit répondre en moins de 5 ms. Ici, une lecture PostgreSQL sur index prend environ 1 ms.',
			'Conçois la façon de stocker les permissions, de répondre à un check, et le délai avant qu’un retrait soit appliqué.'
		],
		minutes: 10,
		checklist: [
			'Ton design écrit la règle « peut modifier un fichier » sous forme de chaîne : fichier, projet, équipe, utilisateur, organisation.',
			'Ton design compte les lectures du check le plus lent, équipes imbriquées comprises, et ce total tient dans 5 ms.',
			'Ton design donne la taille des données de permission, calculée à partir des 30 millions de fichiers.',
			'Ton design dit si un check lit ces données dans une base ou en mémoire.',
			'Ton design dit combien de temps après le départ de Lina de l’équipe « Brand » tous les serveurs lui refusent la modification.',
			'Ton design dit ce que fait un serveur juste après un redémarrage, avant d’avoir chargé les données.'
		],
		sample: [
			'Stocke les permissions sous forme de relation tuples, le format du papier Zanzibar de Google : `file:f1#parent@project:p1`, `project:p1#editor@team:t1#member`, `team:t1#member@team:t2#member`, `team:t2#member@user:lina`. Un utilisateur peut modifier un fichier s’il en est éditeur direct, s’il est éditeur du projet parent, ou s’il est admin de l’organisation du projet. La doc OpenFGA modélise la règle du milieu avec des dossiers : un éditeur d’un dossier `parent` est éditeur de chaque document qu’il contient.',
			'Les tuples sont surtout des fichiers : 30 millions de tuples parent, plus quelques millions pour les droits, les appartenances et les partages directs, soit environ 34 millions. À 64 octets chacun avec un index, ça fait environ 2,2 Go, assez petit pour tenir en mémoire.',
			'Parcourir les tuples dans PostgreSQL est trop lent. Le check le plus lent lit le fichier, les droits du projet, jusqu’à 4 niveaux d’équipes, et les admins de l’organisation : 7 lectures à 1 ms font 7 ms. Chacun des 3 serveurs de permissions charge donc tous les tuples en mémoire au démarrage et les suit là.',
			'Les équipes imbriquées coûtent le plus de sauts. Comme Zanzibar avec son index Leopard, garde une appartenance aplatie : pour Lina, l’ensemble {Brand, Marketing}. Le check pose alors trois questions : le fichier est-il partagé avec Lina, la liste des éditeurs du projet a-t-elle une équipe en commun avec son ensemble, est-elle admin de l’organisation ? Avec le parent du fichier, ça fait 4 lectures en mémoire et aucun appel à la base.',
			'Les écritures vont dans une table PostgreSQL `tuples`, chacune avec un numéro `seq` croissant. Les serveurs de permissions lisent les nouvelles lignes toutes les 100 ms et mettent à jour leur mémoire, y compris les ensembles aplatis de tous les membres sous une équipe modifiée. Un retrait atteint les 3 serveurs en environ une seconde.',
			'Pendant cette seconde, un serveur peut encore laisser Lina modifier. Le papier Zanzibar appelle ça le problème du « new enemy » et le règle avec un jeton appelé zookie. Ici, l’écriture renvoie son `seq`, et l’application peut passer `at_least_seq` au check suivant. Un serveur qui n’a pas encore appliqué ce `seq` l’attend avant de répondre.',
			'Le prix à payer : chaque serveur de permissions garde 2,2 Go et doit charger 34 millions de lignes avant de répondre, donc un serveur redémarré reste hors du load balancer jusqu’à la fin du chargement. Déplacer une grosse équipe sous une autre réécrit aussi l’ensemble aplati de chacun de ses membres.'
		]
	},
	quiz: [],
	recall: {
		q: 'Pourquoi la réponse garde-t-elle les tuples en mémoire, et que garde-t-elle pour les équipes imbriquées ?',
		a: 'Le check le plus lent demande 7 lectures, soit 7 ms à 1 ms par lecture PostgreSQL. En mémoire, avec un ensemble aplati d’équipes par utilisateur, un check fait 4 lectures et aucun appel à la base.'
	},
	sources: [
		{ title: 'Pang et al., Zanzibar: Google’s Consistent, Global Authorization System (USENIX ATC 2019)', url: 'https://www.usenix.org/system/files/atc19-pang.pdf' },
		{ title: 'OpenFGA, Parent-Child Objects', url: 'https://openfga.dev/docs/modeling/parent-child' }
	]
};
