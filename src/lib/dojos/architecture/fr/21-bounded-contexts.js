const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const PARSER = `${REPO}/app/lib/activitypub/parser/status_parser.rb`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'bounded-contexts',
	part: 'Domaines et frontières',
	title: 'Bounded contexts et context maps',
	minutes: 10,
	hook: [
		'Tu cliques sur l’étoile d’un post venu d’un autre serveur Mastodon. Ton serveur enregistre un favourite sur un status. Entre les serveurs, ce même clic voyage sous forme de **Like d’une Note**.',
		'Un mot peut aussi avoir deux sens. Dans le vocabulaire ActivityStreams, `summary` est « a natural language summarization of the object » (un résumé en langage naturel de l’objet). Mastodon affiche `summary` comme l’avertissement de contenu placé avant un post, et chaque côté a raison dans sa propre frontière.',
		'Le DDD appelle cette frontière un **bounded context** : la zone où un modèle et un vocabulaire font foi. Une context map montre comment les contextes sont reliés, et lequel doit s’adapter à l’autre. Mastodon en contient une, et tu peux la lire dans son code.'
	],
	terms: [
		{ term: 'Bounded context', def: 'Bounded context (contexte délimité) : une frontière à l’intérieur de laquelle chaque terme a exactement un sens. Souvent un service ou une équipe.' },
		{ term: 'Published language', def: 'Langage publié : un format partagé et documenté que plusieurs contextes acceptent de parler à la frontière, comme une forme de message que tous les serveurs envoient.' },
		{ term: 'Conformist', def: 'Conformiste : le contexte en aval (celui qui reçoit) reprend le modèle de l’amont tel quel, parce qu’il n’a pas son mot à dire ou que traduire coûte trop cher.' },
		{ term: 'Anti-corruption layer', def: 'Couche anti-corruption : une couche de traduction dans le contexte en aval, qui réécrit le modèle de l’amont avec ses propres termes. Le reste de son code ne voit jamais les mots étrangers.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['remote["Autre serveur : Note, Like, Person"]', 'masto["Contexte Mastodon : Status, Favourite, Account, visibility"]', 'class remote ext'],
				highlight: ['remote', 'masto'],
				note: 'Le modèle de Mastodon stocke des statuses avec un `text`, un `spoiler_text` et une `visibility`. L’autre serveur peut faire tourner n’importe quel logiciel, et il promet seulement de parler le langage commun.'
			},
			{
				add: ['pl["Published language : ActivityPub et ActivityStreams 2.0, W3C"]', 'remote -->|"JSON vers l’inbox"| pl'],
				highlight: ['pl'],
				note: 'Ici, le published language, ce sont ActivityPub et le vocabulaire ActivityStreams, deux Recommandations du W3C. Ils définissent `Note`, `Like`, `Person`, `summary`, `to` et `cc`. Aucun serveur ne les possède, et tous les serveurs savent les lire.'
			},
			{
				add: ['aclin["ACL entrante : Activity.factory, StatusParser"]', 'pl --> aclin', 'aclin -->|"Status, Favourite"| masto'],
				highlight: ['aclin'],
				note: 'La couche anti-corruption entrante commence par une factory : elle choisit une classe par type d’activité et ignore les types inconnus. Un `Like` reçu crée un `Favourite`. Le parser de statuses range `content` dans `text`, `summary` dans `spoiler_text`, et réduit les listes `to` et `cc` à l’une des quatre visibilités. Derrière cette couche, le code de Mastodon ne manipule que des statuses.'
			},
			{
				add: ['aclout["Serializers sortants : Status vers Note, Favourite vers Like"]', 'masto --> aclout', 'aclout -->|"JSON ActivityPub"| remote'],
				highlight: ['aclout'],
				note: 'Les serializers traduisent dans l’autre sens. `NoteSerializer` écrit un status sous forme de `Note`, ou de `Question` quand il contient un sondage. `LikeSerializer` écrit un favourite sous forme de `Like` : l’autre serveur ne voit jamais le mot « favourite ».'
			},
			{
				add: ['toot["toot : extensions, documentées par Mastodon"]', 'masto -.->|"focalPoint, blurhash, discoverable"| toot', 'toot -.->|"utilisées telles quelles"| remote'],
				highlight: ['toot'],
				note: 'ActivityStreams n’a pas de mot pour certaines fonctionnalités. Mastodon ajoute alors ses propres termes sous `http://joinmastodon.org/ns#` et les documente. Un serveur qui veut les points focaux de Mastodon doit utiliser `toot:focalPoint` exactement comme Mastodon le définit. Ce serveur est conformiste : il ne peut pas modifier le terme.'
			}
		]
	},
	example: {
		title: 'app/lib/activitypub/parser/status_parser.rb : leurs mots en entrée, les nôtres en sortie',
		repo: 'mastodon/mastodon',
		url: `${PARSER}#L40-L111`,
		lang: 'ruby',
		code: `  def text
    if @object['content'].present?
      @object['content']
    elsif content_language_map?
      @object['contentMap'].values.first
    end
  end
  …
  def spoiler_text
    if @object['summary'].present?
      @object['summary']
    elsif summary_language_map?
      @object['summaryMap'].values.first
    end
  end
  …
  def visibility
    if audience_to.any? { |to| ActivityPub::TagManager.instance.public_collection?(to) }
      :public
    elsif audience_cc.any? { |cc| ActivityPub::TagManager.instance.public_collection?(cc) }
      :unlisted
    elsif audience_to.include?(@options[:followers_collection])
      :private
    else
      :direct
    end
  end`,
		notes: [
			'Les lignes 1 à 15 lisent les champs ActivityStreams `content` et `summary`, et renvoient les mots de Mastodon `text` et `spoiler_text`. Le [handler `Create`](' + REPO + '/app/lib/activitypub/activity/create.rb#L101-L123) construit les paramètres du status à partir du parser : aucun code du modèle ne lit le JSON brut.',
			'Les lignes 17 à 27 calculent `visibility`, un champ qui n’existe pas dans ActivityPub. ActivityPub n’a que des listes d’adresses, et le parser les lit dans l’ordre pour choisir l’une des quatre valeurs. Une adresse qu’il ne reconnaît pas tombe dans la dernière branche, `:direct`.',
			'La factory [associe chaque type d’activité à une classe](' + REPO + '/app/lib/activitypub/activity.rb#L24-L65) et renvoie `nil` pour les autres : une activité inconnue ne fait rien. Mastodon prend en charge `Note` et `Question`, et convertit `Article`, `Page`, `Event` et les médias. Sa doc ActivityPub dit qu’ils « are converted as best as possible » (sont convertis du mieux possible), avec l’`url` ajoutée à la fin.',
			'Le mot « like » traverse la frontière dans les deux sens : un `Like` reçu crée un favourite, et [`LikeSerializer` envoie un favourite sous forme de `Like`](' + REPO + '/app/serializers/activitypub/like_serializer.rb#L3-L22). Les termes `toot:` sont déclarés dans le contexte JSON-LD, dans `context_helper.rb`.'
		]
	},
	tradeoff: {
		gain: [
			'L’ACL arrête le vocabulaire ActivityStreams au bord. Les timelines, les filtres et les notifications ne connaissent que `visibility`, jamais `to` et `cc`.',
			'Grâce au published language, Mastodon parle à des logiciels qu’il n’a jamais vus. Tout serveur qui parle ActivityPub peut suivre, liker et répondre.',
			'Un serveur qui reprend `toot:focalPoint` tel quel n’a ni conception ni code de mapping à écrire.'
		],
		cost: [
			'L’ACL, c’est du code à écrire, à tester et à garder synchronisé. Le parser de Mastodon a des solutions de repli pour les maps de langues, les types convertis et les listes d’adresses, et chacune est une règle à maintenir.',
			'Mastodon ne peut pas ajouter un champ à `Note` pour tous les serveurs. Il peut seulement ajouter une extension `toot:` et espérer que les autres serveurs la lisent.',
			'La traduction fait perdre une partie du sens. Un long `Article` venu d’un moteur de blog arrive en status court avec un lien, et un vrai résumé placé dans `summary` s’affiche sur Mastodon comme un avertissement de contenu.'
		]
	},
	task: {
		prompt: 'Certains serveurs se mettent à envoyer des posts adressés à une nouvelle collection, « abonnés mutuels uniquement ». Mastodon n’a pas de visibilité de ce genre. Dessine la context map de ce changement et choisis : Mastodon doit-il **se conformer** (ajouter une nouvelle visibilité) ou traduire (associer cette audience à une visibilité existante dans son ACL) ? Dis où le code changerait dans chaque cas.',
		hint: 'Lis d’abord la dernière branche de `visibility` : que fait Mastodon aujourd’hui d’une adresse qu’il ne reconnaît pas ? Puis demande-toi ce que chaque requête de timeline devrait apprendre.',
		answer: [
			'Aujourd’hui : la nouvelle collection n’est ni publique ni la collection des abonnés, donc le parser renvoie `:direct` (le handler `Create` peut ensuite requalifier le post en `:limited`). Le post arrive quand même, mais peut-être à moins de gens que ce que l’auteur voulait.',
			'Se conformer : tu ajoutes une valeur à la colonne `visibility` de `Status`, puis tu apprends à chaque timeline, chaque contrôle de permission et chaque serializer ce qu’elle veut dire. Mastodon prend en charge un concept dont ses utilisateurs n’ont peut-être pas besoin.',
			'Traduire : tu gardes les visibilités existantes et tu associes la nouvelle collection exprès dans `StatusParser#visibility`, probablement à `:private`. Seule l’ACL change.',
			'Dans les deux cas, ce sont les autres serveurs qui ont décidé du changement. Ils sont en amont, et Mastodon est en aval pour les posts entrants : c’est à Mastodon de s’adapter.',
			'Une bonne réponse dit quand revoir le choix : si les utilisateurs de Mastodon demandent à poster pour leurs mutuels, ajouter la visibilité vaut son coût.'
		]
	},
	quiz: [
		{
			q: 'Un service en aval reçoit un modèle de l’amont et le transforme dans ses propres termes avant que le moindre code métier ne le voie. Qu’est-ce que c’est ?',
			options: ['Anti-corruption layer', 'Published language', 'Conformist', 'Shared kernel'],
			answer: 0,
			why: 'Une anti-corruption layer est une traduction qui appartient au côté aval. Un conformiste utiliserait le modèle de l’amont tel quel. Un published language est le format commun à la frontière, et la traduction se trouve derrière lui.'
		},
		{
			q: 'Un serveur distant envoie à Mastodon un type d’activité que `ActivityPub::Activity.factory` ne connaît pas. Que se passe-t-il ?',
			options: [
				'Mastodon le stocke comme un message direct',
				'Mastodon rejette toute la livraison à l’inbox et le serveur réessaie indéfiniment',
				'Mastodon le convertit en status avec un lien',
				'La factory renvoie `nil`, donc rien n’est exécuté'
			],
			answer: 3,
			why: 'La factory associe les types connus à des classes et renvoie `nil` sinon. L’appelant exécute `activity&.perform` : une activité inconnue ne fait rien et n’atteint jamais le modèle.'
		},
		{
			q: 'Dans ActivityStreams, `summary` est « a natural language summarization of the object ». Mastodon l’affiche comme un avertissement de contenu. Qu’est-ce que ça montre ?',
			options: [
				'Mastodon enfreint la spec ActivityPub et devrait ranger l’avertissement dans un champ à lui',
				'Un même mot peut avoir des sens différents dans deux contextes, et la traduction à la frontière choisit le sens',
				'ActivityStreams devrait renommer le champ, car un nom pour deux sens est un bug de la spec',
				'Les avertissements de contenu font partie du vocabulaire du W3C, et `summary` est le champ prévu pour eux'
			],
			answer: 1,
			why: 'Chaque contexte donne au mot son propre sens. Le parser de Mastodon range `summary` dans `spoiler_text` exprès, et sa doc le dit. Une context map montre ce choix à toute l’équipe.'
		}
	],
	recall: {
		q: 'Où Mastodon traduit-il un post ActivityPub entrant dans ses propres mots, et que font `to` et `cc` à l’arrivée ?',
		a: 'Dans sa couche anti-corruption : `Activity.factory` et `StatusParser`. Le parser réduit les listes d’adresses `to` et `cc` à une seule valeur de `visibility` : `:public`, `:unlisted`, `:private` ou `:direct`.'
	},
	sources: [
		{ title: 'Martin Fowler, BoundedContext', url: 'https://martinfowler.com/bliki/BoundedContext.html' },
		{ title: 'Evans, DDD Reference: Published Language, Conformist, Anticorruption Layer', url: 'https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf' },
		{ title: 'W3C, Activity Vocabulary', url: 'https://www.w3.org/TR/activitystreams-vocabulary/' },
		{ title: 'Mastodon docs, ActivityPub', url: 'https://docs.joinmastodon.org/spec/activitypub/' },
		{ title: 'Mastodon, status_parser.rb', url: `${PARSER}#L40-L111` },
		{ title: 'Mastodon, activity.rb : types pris en charge et convertis', url: `${REPO}/app/lib/activitypub/activity.rb#L9-L10` },
		{ title: 'Mastodon, activity/like.rb', url: `${REPO}/app/lib/activitypub/activity/like.rb#L3-L13` },
		{ title: 'Mastodon, context_helper.rb : termes toot', url: `${REPO}/app/helpers/context_helper.rb#L22-L24` }
	]
};
