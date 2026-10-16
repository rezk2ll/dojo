const DISCOURSE = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'reversibility',
	part: 'Penser en architecte',
	title: 'Les décisions réversibles : portes à sens unique et à double sens',
	minutes: 10,
	hook: [
		'Tu ne peux pas passer une semaine sur chaque décision. Tu ne peux pas non plus te permettre de bâcler les rares qui t’enferment. Il te faut donc un moyen de distinguer les deux.',
		'Dans sa lettre aux actionnaires d’Amazon déposée en 2016, Jeff Bezos les décrit comme des portes. Les **portes à sens unique** : « Si tu passes la porte et que ce que tu vois de l’autre côté ne te plaît pas, tu ne peux pas revenir là où tu étais. » Décide lentement. Les portes à double sens : « Tu peux rouvrir la porte et repasser de l’autre côté. » Décide vite.',
		'Entre le oui et le non, la plupart des décisions offrent aussi des options intermédiaires, d’un extrême à l’autre. La suppression d’un message dans Discourse, le logiciel de forum, montre les deux idées. Un message supprimé peut presque toujours être restauré. Hors messages privés et tâches de masse côté serveur, le supprimer pour de bon demande un admin, sur un site qui a activé cette option.'
	],
	terms: [
		{ term: 'Porte à sens unique', def: 'Une décision difficile ou impossible à défaire : des données supprimées, un contrat public, des données que tu n’as jamais enregistrées. Ralentis et écris un ADR.' },
		{ term: 'Porte à double sens', def: 'Une décision peu coûteuse à défaire : un flag de configuration, une colonne d’état, une bibliothèque derrière une interface. Décide et avance.' },
		{ term: 'Soft delete (suppression logique)', def: 'Marquer une ligne comme supprimée (une colonne timestamp) au lieu de la retirer. Les utilisateurs ne la voient plus, et le staff peut encore la restaurer.' },
		{ term: 'Feature flag', def: 'Un interrupteur qui active un comportement par déploiement ou par tenant. Il te permet d’annuler un rollout, tant que le désactiver ne laisse pas de nouvelles données derrière.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['active["Message visible"]', 'gone["Supprimé définitivement"]'],
				highlight: ['active', 'gone'],
				note: 'À un extrême, un message visible est dans le sujet. À l’autre, un message **supprimé définitivement** est, selon les mots de Discourse, « complètement retiré de la base de données et ne peut pas être récupéré ». Si la suppression tenait en un seul bouton, un clic de travers détruirait un message pour de bon.'
			},
			{
				add: ['active -->|"l’auteur supprime"| stub["Supprimé par l’auteur : texte remplacé"]', 'stub -.->|"l’auteur restaure"| active', 'stub -->|"après 24 h, tâche planifiée"| trashed["Soft-deleted : deleted_at rempli"]', 'active -->|"le staff supprime"| trashed', 'trashed -.->|"le staff restaure"| active'],
				highlight: ['stub', 'trashed'],
				note: 'Discourse a deux états entre les deux. Quand l’auteur supprime, seul le texte est remplacé, et l’auteur peut revenir en arrière. Un jour plus tard, par défaut, une tâche fait un soft delete : elle remplit un timestamp sur la ligne, et le staff peut restaurer le message. Quelqu’un peut annuler chacune de ces deux étapes : chacune est une porte à double sens.'
			},
			{
				add: ['trashed -->|"admin, option activée, attendre 5 min ou un second admin"| gone'],
				highlight: ['gone'],
				note: 'Trois règles gardent la porte à sens unique. Seul un admin peut l’utiliser, et seulement sur un message **déjà soft-deleted**. Un admin qui vient d’en faire le soft delete doit attendre 5 minutes, ou laisser un autre admin le faire.'
			},
			{
				add: ['flag["Réglage du site : can_permanently_delete, désactivé par défaut"] -->|"déverrouille"| gone'],
				highlight: ['flag'],
				note: 'Toute la porte est derrière un réglage du site **désactivé par défaut**, qui demande une confirmation quand tu l’actives. Tu peux le désactiver à tout moment. Les messages détruits pendant qu’il était actif restent détruits.'
			}
		]
	},
	example: {
		title: 'lib/guardian/post_guardian.rb',
		repo: 'discourse/discourse',
		url: `${DISCOURSE}/lib/guardian/post_guardian.rb#L250-L260`,
		lang: 'ruby',
		code: `  def can_permanently_delete_post?(post)
    return false if !SiteSetting.can_permanently_delete
    return false if !post
    return false if post.is_first_post?
    return false if !is_admin? || !can_edit_post?(post)
    return false if !post.deleted_at
    if post.deleted_by_id == @user.id && post.deleted_at >= Post::PERMANENT_DELETE_TIMER.ago
      return false
    end
    true
  end`,
		notes: [
			'Les lignes 2 à 9 gardent chacune la porte à sens unique. La ligne 2 vérifie d’abord le réglage du site, qui [vaut `false` par défaut](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/config/site_settings.yml#L3271-L3274).',
			'La ligne 6, `return false if !post.deleted_at`, ne laisse détruire qu’un message déjà soft-deleted. L’étape réversible passe toujours en premier.',
			'La ligne 7 utilise `PERMANENT_DELETE_TIMER`, qui vaut [5 minutes](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/app/models/post.rb#L26-L27). Le message de refus dit « Tu dois attendre … ou un autre administrateur doit le faire. » L’admin attend, ou demande à une deuxième personne.',
			'La porte à double sens tient en deux méthodes courtes : `trash!` et `recover!` ne font que remplir ou vider `deleted_at` et `deleted_by_id`. Un seul ternaire dans [`PostDestroyer`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/lib/post_destroyer.rb#L198-L199) choisit entre les deux portes : `permanent? ? @post.destroy! : @post.trash!(@user)`. Seules les gardes ci-dessus empêchent `permanent?` d’être vrai.'
		]
	},
	tradeoff: {
		gain: [
			'Tu passes du temps de conception sur les portes à sens unique, et les petites décisions comme un flag de configuration vont vite.',
			'Grâce aux options intermédiaires, un soft delete et une attente de 5 minutes, un message n’est détruit qu’après une étape réversible et une pause.'
		],
		cost: [
			'Chaque état intermédiaire, c’est du code à maintenir : les lignes soft-deleted doivent être cachées dans chaque requête, et une tâche planifiée doit faire le ménage après les suppressions des auteurs.',
			'Les lignes soft-deleted prennent toujours de la place, et elles sont toujours en base quand quelqu’un les croit disparues.',
			'Mal juger une porte coûte cher : un nom de champ dans une API publique a l’air d’un détail jusqu’à ce qu’une autre équipe en dépende.'
		]
	},
	task: {
		prompt: 'Tu gères une appli SaaS de facturation. Classe chaque décision en sens unique ou double sens, et dis ce qui la rend telle : (a) un feature flag qui montre le nouveau tableau de bord à certains clients, (b) une tâche nocturne qui supprime pour de bon les factures de plus de 10 ans, (c) renommer un champ dans le payload du webhook que reçoivent les clients, (d) changer la police des PDF de facture.',
		hint: 'Demande-toi : si on change d’avis dans un mois, qui d’autre doit changer, et quelles données restent derrière ?',
		answer: [
			'(a) Double sens : si le nouveau tableau de bord n’écrit rien que l’ancien ne sache lire. S’il stocke de nouvelles données, désactiver le flag laisse ces données derrière.',
			'(b) Sens unique : les factures supprimées ne reviennent pas. Une option intermédiaire : soft delete d’abord, purge réelle après un délai, pour qu’une mauvaise date dans la tâche soit repérée avant que les données disparaissent.',
			'(c) Presque sens unique : du code client que tu ne vois pas dépend de l’ancien nom. L’option intermédiaire : envoyer les deux champs pendant un temps, annoncer que l’ancien va disparaître, le retirer plus tard.',
			'(d) Double sens pour les nouveaux PDF : tu peux remettre l’ancienne police quand tu veux. Les factures déjà envoyées gardent la police avec laquelle elles ont été faites, et personne n’a besoin de les changer.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi Discourse ne permet-il de supprimer définitivement qu’un message déjà soft-deleted ?',
			options: [
				'La base de données ne peut pas supprimer une ligne visible, donc le soft delete la cache d’abord',
				'Les messages soft-deleted prennent plus de place, donc Discourse les nettoie avant tout le reste',
				'Les messages visibles sont en lecture seule pour les admins, seul un message caché peut être retiré',
				'Pour qu’aucun message ne soit perdu en une étape : une étape réversible passe avant l’étape irréversible'
			],
			answer: 3,
			why: 'La garde `return false if !post.deleted_at` place une porte à double sens (le soft delete) devant la porte à sens unique (la destruction). Une erreur à la première étape peut encore être rattrapée.'
		},
		{
			q: 'Un admin Discourse a fait le soft delete d’un message il y a 2 minutes et essaie maintenant de le supprimer définitivement. Que se passe-t-il ?',
			options: [
				'Refusé : il doit attendre que 5 minutes soient passées, ou un autre admin doit le faire',
				'Ça marche, les admins peuvent toujours détruire un message déjà soft-deleted',
				'Le message est restauré à la place, car un soft delete de moins de 5 minutes est annulé',
				'Discourse met la destruction en file et ne la lance vraiment qu’après 30 jours'
			],
			answer: 0,
			why: '`PERMANENT_DELETE_TIMER` vaut 5 minutes et s’applique quand c’est le même admin qui a supprimé le message. La règle impose une pause, ou la vérification d’un deuxième admin, avant la porte à sens unique.'
		},
		{
			q: 'Un site active `can_permanently_delete` pendant un mois, puis le désactive. Qu’arrive-t-il aux messages détruits pendant ce mois ?',
			options: [
				'Ils reviennent sous forme de messages soft-deleted',
				'Ils sont restaurés automatiquement depuis la sauvegarde suivante',
				'Ils restent perdus : le flag est réversible, ce qu’il a fait ne l’est pas',
				'Ils sont déplacés dans les messages privés de l’admin'
			],
			answer: 2,
			why: 'La description du réglage dit elle-même que les données supprimées définitivement « ne peuvent pas être récupérées ». Désactiver le réglage bloque seulement les nouvelles suppressions définitives.'
		}
	],
	recall: {
		q: 'Par quelles étapes un message Discourse doit-il passer avant qu’un admin puisse le supprimer définitivement ?',
		a: 'Le réglage `can_permanently_delete` doit être activé (il est désactivé par défaut), le message doit déjà être soft-deleted, et si c’est le même admin qui l’a soft-deleted, 5 minutes doivent être passées. Sinon, un autre admin doit le faire.'
	},
	sources: [
		{ title: 'Jeff Bezos, letter to Amazon shareholders (Type 1 and Type 2 decisions)', url: 'https://www.sec.gov/Archives/edgar/data/1018724/000119312516530910/d168744dex991.htm' },
		{ title: 'Discourse, post_guardian.rb: can_permanently_delete_post?', url: `${DISCOURSE}/lib/guardian/post_guardian.rb#L250-L260` },
		{ title: 'Discourse, post_destroyer.rb: destroy_stubs, the job behind author deletes', url: `${DISCOURSE}/lib/post_destroyer.rb#L21-L47` },
		{ title: 'Discourse, trashable.rb: trash! and recover!', url: `${DISCOURSE}/app/models/concerns/trashable.rb#L18-L36` },
		{ title: 'Discourse, server.en.yml: what can_permanently_delete does', url: `${DISCOURSE}/config/locales/server.en.yml#L2326` },
		{ title: 'Discourse, site_settings.yml: delete_removed_posts_after defaults to 24 hours', url: `${DISCOURSE}/config/site_settings.yml#L1512-L1516` }
	]
};
