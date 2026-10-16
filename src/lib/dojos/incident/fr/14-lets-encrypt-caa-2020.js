const PM = 'https://community.letsencrypt.org/t/2020-02-29-caa-rechecking-bug/114591';
const BZ = 'https://bugzilla.mozilla.org/show_bug.cgi?id=1619047';
const BZ2 = 'https://bugzilla.mozilla.org/show_bug.cgi?id=1619179';
const FAQ = 'https://community.letsencrypt.org/t/revoking-certain-certificates-on-march-4/114864';
const GO = 'https://go.dev/doc/go1.22';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'lets-encrypt-caa-2020',
	part: 'Les données',
	title: 'Let’s Encrypt 2020 : la revérification CAA qui ne testait qu’un nom',
	minutes: 10,
	hook: [
		'18 février 2020. Un utilisateur écrit sur le forum de Let’s Encrypt : une demande de certificat pour beaucoup de noms de domaine a échoué à la revérification CAA, et l’erreur contient 99 sous-problèmes identiques pour un seul nom.',
		'Let’s Encrypt fait tourner Boulder, son logiciel d’autorité de certification open source. Quand Boulder valide le contrôle d’un domaine, il vérifie aussi ses enregistrements CAA. Une validation reste bonne 30 jours, mais les règles exigent un contrôle CAA dans les 8 heures avant l’émission : une validation plus ancienne demande donc une revérification.',
		'Un autre membre du forum voit une lecture plus grave de ces 99 erreurs identiques : certains enregistrements CAA ne seraient peut-être pas vérifiés du tout.'
	],
	terms: [
		{ term: 'Enregistrement CAA', def: 'Un enregistrement DNS où le propriétaire d’un domaine liste les autorités de certification autorisées à émettre des certificats pour ce domaine.' },
		{ term: 'Autorisation', def: 'La trace, dans Boulder, qu’un compte a prouvé qu’il contrôle un nom de domaine. Let’s Encrypt la réutilise pendant 30 jours.' },
		{ term: 'Baseline Requirements (BR)', def: 'Les règles que doit suivre toute autorité de certification reconnue publiquement, dont quand vérifier le CAA et en combien de temps révoquer.' },
		{ term: 'Révocation', def: 'L’autorité de certification déclare un certificat invalide avant son expiration. Les clients qui vérifient la révocation le refusent alors.' }
	],
	incident: {
		org: 'Let\'s Encrypt',
		title: '2020.02.29 CAA Rechecking Bug',
		date: '2020-02-29',
		url: PM,
		steps: [
			{
				situation: [
					'18 février. Le message du forum montre un nom avec 99 messages d’erreur identiques après une revérification CAA. Un membre pense que certains enregistrements CAA sont peut-être sautés.'
				],
				q: 'Que fais-tu de ce signalement ?',
				options: [
					'Demander plusieurs noms à revérifier et logger lesquels sont interrogés',
					'Corriger le format de l’erreur pour que chaque nom n’apparaisse qu’une fois',
					'Le fermer : un échec CAA vient du DNS du client lui-même',
					'Arrêter toute émission jusqu’à relecture complète du code CAA'
				],
				answer: 0,
				why: 'L’équipe a "checked the logs, confirmed that CAA was checked, and concluded the bug was not in the CAA checking itself but in the error message generation". Elle l’a classé en priorité normale pour le sprint suivant. Le vrai bug a été trouvé 11 jours plus tard, le 29 février, "while working on a fix for the bug".'
			},
			{
				situation: [
					'29 février, 03:08 UTC. Un ingénieur le confirme : quand une demande contient N noms à revérifier, Boulder en choisit un et le vérifie N fois. Boulder ne revérifie aucun des autres noms.',
					'Un nom qui autorisait Let’s Encrypt au moment de sa validation peut recevoir des certificats pendant 30 jours, même si son propriétaire ajoute ensuite un enregistrement CAA qui interdit Let’s Encrypt.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Couper l’émission jusqu’au déploiement d’un Boulder corrigé',
					'Continuer d’émettre et livrer le correctif au prochain déploiement',
					'Révoquer tous les certificats émis depuis le dernier déploiement',
					'Écrire à chaque client qui a un certificat à plusieurs noms'
				],
				answer: 0,
				why: 'Chaque nouveau certificat à plusieurs noms avec de vieilles validations peut sauter un contrôle CAA : chaque minute d’émission alourdit le problème. L’équipe SRE a coupé l’émission à 03:10, deux minutes après la confirmation. Un Boulder corrigé a été déployé à 05:22 UTC, et l’émission a repris.'
			},
			{
				situation: [
					'3 mars. L’équipe compte les certificats touchés encore valides : 3 048 289, sur environ 116 millions actifs, émis entre le 4 décembre 2019 et le 29 février 2020.',
					'Les BR imposent de les révoquer. L’échéance tombe le 5 mars à 03:00 UTC. Parmi les noms concernés, 443 ont aujourd’hui des enregistrements CAA qui refusent Let’s Encrypt.'
				],
				q: 'Que fais-tu avant l’échéance ?',
				options: [
					'Écrire aux clients, publier les numéros de série et un outil de test',
					'Révoquer les 3 millions de certificats aujourd’hui, avant tout renouvellement',
					'Révoquer seulement les certificats des 443 noms et clore l’incident',
					'Attendre l’échéance, puis tout révoquer en un seul lot'
				],
				answer: 0,
				why: 'Un certificat révoqué avant d’être remplacé casse le site qui l’utilise. L’équipe a écrit aux clients touchés, publié une FAQ et mis la liste des numéros de série sur letsencrypt.org/caaproblem, avec un lien vers un outil de test en ligne. Elle a aussi relevé la limite de certificats en double pour que moins de renouvellements s’y heurtent.'
			},
			{
				situation: [
					'4 mars au soir. Plus de 1,7 million de certificats touchés ont été remplacés en moins de 48 heures. Plus d’un million ne le seront sans doute pas avant l’échéance.',
					'Le 2 mars, Let’s Encrypt a demandé une exemption aux programmes de racines, dont Mozilla. Mozilla a répondu qu’il "does not grant exceptions to the BR revocation requirements" : c’est à l’autorité de décider, et d’en répondre.'
				],
				q: 'Que révoques-tu à l’échéance ?',
				options: [
					'Les remplacés et ceux que le CAA interdit ; signaler le reste',
					'Les 3 millions : les règles ne laissent pas le choix après le refus',
					'Aucun : le risque est faible et ils expirent sous 90 jours',
					'Les remplacés seulement, sans rien dire sur le million restant'
				],
				answer: 0,
				why: 'Let’s Encrypt a révoqué 1 706 505 certificats remplacés et 445 certificats prioritaires dont les enregistrements CAA interdisaient Let’s Encrypt. Pour le reste : "Rather than potentially break so many sites and cause concern for their visitors, we have determined that it is in the best interest of the health of the Internet for us to not revoke those certificates by the deadline." La décision est suivie dans le bug Bugzilla 1619179.'
			},
			{
				situation: [
					'Le bug a été commité avec un test unitaire, `TestGetValidOrderAuthorizations2`, qui passe par le code fautif avec plusieurs autorisations. Un test d’intégration couvre aussi la revérification CAA. Ces deux tests sont restés verts pendant des mois.'
				],
				q: 'Quel changement de test aurait attrapé ce bug ?',
				options: [
					'Demander plusieurs noms dans le test d’intégration et vérifier chaque autorisation rendue',
					'Faire tourner les tests existants sur une copie de la base de production',
					'Monter le seuil de couverture du code qui convertit les autorisations',
					'Ajouter un test de charge qui émet des milliers de certificats par minute'
				],
				answer: 0,
				why: 'Le test unitaire ne vérifiait "only that there were the correct number" d’autorisations, pas leur contenu. Le test d’intégration "requests a certificate with only one FQDN in it", alors que le bug demande au moins deux noms. L’équipe l’a corrigé et a vérifié qu’il "catches the bug on earlier versions of Boulder."'
			}
		],
		outcome: [
			'La cause : "a common mistake in Go: taking a reference to a loop iterator variable." Dans `authz2ModelMapToPB`, une boucle `for k, v := range m` passait `&v` à `modelToAuthzPB`, qui gardait un pointeur vers `am.IdentifierValue`. Avant Go 1.22, `v` était une seule variable réutilisée à chaque tour, donc toutes les autorisations pointaient vers le même nom de domaine.',
			'Les clés de la map contenaient toujours les bons noms : boulder-ra, le composant qui contrôle les autorisations avant l’émission, voyait donc tous les noms présents. Mais il prenait le nom à revérifier dans le champ `Identifier`, identique dans chaque entrée. Le code a été commité le 24 avril 2019 derrière un feature flag, activé en production le 23 août 2019.',
			'Sur les 3 048 289 certificats touchés, environ 1 million étaient des doublons couvrant les mêmes noms. Les certificats les plus touchés étaient ceux qui sont réémis très souvent.',
			'Les correctifs : un `TestGetValidOrderAuthorizations2` renforcé, un nouveau test unitaire pour `modelToAuthzPB`, une revue des autres bugs de variable de boucle (aucun trouvé), le linter gosec, le passage à proto3 et un contrôle automatique des logs sur le comportement CAA. Gosec aurait attrapé cette variante de l’erreur. Le contrôle des logs a coupé l’émission une fois pendant son déploiement, quand la copie des logs entre datacenters a rempli une file de messages.'
		]
	},
	quiz: [
		{
			q: 'En Go avant 1.22, pourquoi `&v` dans `for k, v := range m` faisait-il partager un seul nom à toutes les entrées ?',
			options: [
				'La boucle réutilise une seule variable `v` : chaque pointeur la vise et voit la dernière valeur',
				'Les maps Go rendent les clés dans un ordre aléatoire, donc les noms étaient mélangés',
				'Prendre `&v` copie la struct, et la copie est libérée à la fin de chaque tour',
				'La couche RPC dédoublonne les structs identiques avant d’envoyer la map à boulder-ra'
			],
			answer: 0,
			why: 'Les notes de version de Go 1.22 : "Previously, the variables declared by a “for” loop were created once and updated by each iteration." Un pointeur gardé après le tour voit les valeurs suivantes. Depuis Go 1.22, chaque tour crée de nouvelles variables.'
		},
		{
			q: 'Quelle demande de certificat déclenchait le bug ?',
			options: [
				'Une demande avec 2 noms ou plus validés il y a plus de 8 heures',
				'Une demande avec un seul nom validé dans les 8 dernières heures',
				'Une demande avec un nom qui n’a aucun enregistrement CAA',
				'Une demande pour un nom joker comme `*.example.com`'
			],
			answer: 0,
			why: 'Un nom validé dans les 8 dernières heures n’a pas besoin de revérification. Avec N noms à revérifier, Boulder vérifiait un nom N fois : il faut donc au moins deux noms. Les certificats réémis très souvent étaient les plus touchés.'
		},
		{
			q: 'Pourquoi le test unitaire commité avec le bug passait-il ?',
			options: [
				'Il comptait les autorisations rendues sans regarder le domaine de chacune',
				'Il tournait avec le feature flag coupé, donc le code fautif ne s’exécutait pas',
				'Il utilisait un faux serveur DNS qui ne renvoyait aucun enregistrement CAA',
				'Il ne demandait qu’un seul nom de domaine, donc rien ne pouvait se mélanger'
			],
			answer: 0,
			why: 'Le test créait et relisait une commande avec plusieurs autorisations : il passait bien par le code fautif. Il ne vérifiait "only that there were the correct number". Le problème du nom unique était dans le test d’intégration, à part.'
		}
	],
	recall: {
		q: 'Quelle erreur Go a causé le bug de revérification CAA de Let’s Encrypt, et combien de certificats valides a-t-elle touchés ?',
		a: 'Une référence à la variable de boucle `v` dans `for k, v := range m` : toutes les autorisations portaient le même nom de domaine. Elle a touché 3 048 289 certificats.'
	},
	sources: [
		{ title: 'Forum Let’s Encrypt : 2020.02.29 CAA Rechecking Bug', url: PM },
		{ title: 'Bugzilla 1619047 : Let’s Encrypt: CAA Rechecking bug (rapport d’incident)', url: BZ },
		{ title: 'Bugzilla 1619179 : Let’s Encrypt: Incomplete revocation for CAA rechecking bug', url: BZ2 },
		{ title: 'Forum Let’s Encrypt : Revoking certain certificates on March 4', url: FAQ },
		{ title: 'Notes de version de Go 1.22 : changements du langage', url: GO }
	]
};
