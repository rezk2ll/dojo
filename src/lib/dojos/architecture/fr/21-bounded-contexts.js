const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const PARSER = `${REPO}/app/lib/activitypub/parser/status_parser.rb`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'bounded-contexts',
	part: 'Domaines et frontières',
	title: 'Bounded contexts et context maps',
	minutes: 10,
	hook: [
		'Tu cliques sur l’étoile d’un post venu d’un autre serveur Mastodon. Pour ton serveur, c’est un **favourite** sur un **status**. Sur le réseau, entre serveurs, c’est un **Like** d’une **Note**. Le même clic, deux vocabulaires.',
		'Même un seul mot peut changer de sens. Dans le vocabulaire ActivityStreams, `summary` est « a natural language summarization of the object » (un résumé en langage naturel de l’objet). Pour Mastodon, c’est l’**avertissement de contenu** affiché avant un post. Les deux ont raison, **chacun dans sa propre frontière**.',
		'Le DDD appelle cette frontière un **bounded context** : la zone où un modèle et un vocabulaire font foi. Une **context map** montre ensuite comment les contextes sont reliés, et qui doit s’adapter à qui. Aujourd’hui, on en lit une dans Mastodon.'
	],
	terms: [
		{ term: 'Bounded context', def: 'Bounded context (contexte délimité) : une frontière à l’intérieur de laquelle chaque terme a exactement un sens. Souvent un service ou une équipe.' },
		{ term: 'Upstream / downstream', def: 'Amont / aval : les changements en amont touchent l’aval, pas l’inverse. La source des événements ou de l’API est en amont.' },
		{ term: 'Published language', def: 'Langage publié : un format partagé et documenté que plusieurs contextes acceptent de parler à la frontière, comme une forme de message que tous les serveurs envoient.' },
		{ term: 'Conformist', def: 'Conformiste : l’aval adopte simplement le modèle de l’amont tel quel, parce qu’il n’a pas son mot à dire ou que traduire n’en vaut pas la peine.' },
		{ term: 'Anti-corruption layer', def: 'Couche anti-corruption : une couche de traduction côté aval qui transforme le modèle de l’amont dans ses propres termes, pour que les mots étrangers restent à la porte.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['remote["Autre serveur : Note, Like, Person"]', 'masto["Contexte Mastodon : Status, Favourite, Account, visibility"]', 'class remote ext'],
				highlight: ['remote', 'masto'],
				note: 'Deux contextes, deux modèles. Mastodon stocke des statuses avec un `text`, un `spoiler_text` et une `visibility`. L’autre serveur peut faire tourner n’importe quel logiciel. Il promet seulement de parler le langage commun.'
			},
			{
				add: ['pl["Published language : ActivityPub et ActivityStreams 2.0, W3C"]', 'remote -->|"JSON vers l’inbox"| pl'],
				highlight: ['pl'],
				note: '**Published language.** ActivityPub et le vocabulaire ActivityStreams sont des Recommandations du W3C. Ils définissent `Note`, `Like`, `Person`, `summary`, `to` et `cc`. Aucun serveur ne les possède, et tous les serveurs savent les lire.'
			},
			{
				add: ['aclin["ACL entrante : Activity.factory, StatusParser"]', 'pl --> aclin', 'aclin -->|"Status, Favourite"| masto'],
				highlight: ['aclin'],
				note: '**Anti-corruption layer, en entrée.** Une factory choisit une classe par type d’activité, et un type inconnu est ignoré. Un `Like` devient un `Favourite`. Le parser de statuses traduit `content` en `text`, `summary` en `spoiler_text`, et les listes `to` et `cc` en l’une des quatre visibilités. Passé cette couche, le code de Mastodon ne voit que des statuses.'
			},
			{
				add: ['aclout["Serializers sortants : Status vers Note, Favourite vers Like"]', 'masto --> aclout', 'aclout -->|"JSON ActivityPub"| remote'],
				highlight: ['aclout'],
				note: 'La même couche, en sortie. `NoteSerializer` écrit un status sous forme de `Note`, ou de `Question` quand il contient un sondage. `LikeSerializer` écrit un favourite sous forme de `Like`. L’autre serveur ne voit jamais le mot « favourite ».'
			},
			{
				add: ['toot["toot : extensions, documentées par Mastodon"]', 'masto -.->|"focalPoint, blurhash, discoverable"| toot', 'toot -.->|"utilisées telles quelles"| remote'],
				highlight: ['toot'],
				note: '**Conformiste, par conception.** Certaines fonctionnalités n’ont pas de mot dans ActivityStreams. Mastodon ajoute ses propres termes sous `http://joinmastodon.org/ns#` et les documente. Un serveur qui veut les points focaux de Mastodon doit utiliser `toot:focalPoint` exactement comme Mastodon le définit. Il n’y a rien à négocier.'
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
			'**En entrée :** les champs ActivityStreams, `content`, `summary`, `to`, `cc`. **En sortie :** les mots de Mastodon, `text`, `spoiler_text`, `visibility`. Le [handler `Create`](' + REPO + '/app/lib/activitypub/activity/create.rb#L101-L123) construit les paramètres du status à partir du parser, donc aucun code du modèle ne lit le JSON brut.',
			'`visibility` est la traduction la plus tranchée. ActivityPub n’a pas de champ de ce genre, seulement des listes d’adresses. Le parser les lit dans l’ordre et choisit l’une des quatre valeurs. Tout ce qu’il ne reconnaît pas tombe dans la dernière branche, `:direct`.',
			'La couche choisit aussi ce qu’elle garde. La factory [associe chaque type d’activité à une classe](' + REPO + '/app/lib/activitypub/activity.rb#L24-L65) et renvoie `nil` pour le reste, donc les activités inconnues ne font rien. `Note` et `Question` sont [pris en charge, tandis que `Article`, `Page`, `Event` et les médias sont convertis](' + REPO + '/app/lib/activitypub/activity.rb#L9-L10) : la [doc ActivityPub](https://docs.joinmastodon.org/spec/activitypub/) de Mastodon dit qu’ils « are converted as best as possible » (sont convertis du mieux possible), avec l’`url` ajoutée à la fin.',
			'Les deux sens d’un même mot : [un `Like` arrive et crée un favourite](' + REPO + '/app/lib/activitypub/activity/like.rb#L3-L13), et [`LikeSerializer` envoie un favourite sous forme de `Like`](' + REPO + '/app/serializers/activitypub/like_serializer.rb#L3-L22). Les termes `toot:` se trouvent dans [le contexte JSON-LD](' + REPO + '/app/helpers/context_helper.rb#L22-L24).'
		]
	},
	tradeoff: {
		gain: [
			'Une ACL garde le vocabulaire étranger au bord. Les timelines, les filtres et les notifications ne connaissent que `visibility`, jamais `to` et `cc`.',
			'Un published language permet à Mastodon de parler à des logiciels qu’il n’a jamais vus. Tout serveur qui parle ActivityPub peut suivre, liker et répondre.',
			'Conformiste, c’est l’intégration la moins chère qui soit : un serveur qui adopte `toot:focalPoint` tel quel n’a besoin ni de conception ni de mapping.'
		],
		cost: [
			'Une ACL, c’est du code à écrire, à tester et à garder synchronisé. Le parser de Mastodon a des solutions de repli pour les maps de langues, les types convertis et les listes d’adresses, et chacune est une règle à maintenir.',
			'Un published language évolue lentement. Mastodon ne peut pas ajouter un champ à `Note` pour tout le monde. Il peut seulement ajouter une extension et espérer que les autres la lisent.',
			'La traduction perd du sens. Un long `Article` venu d’un moteur de blog arrive sous forme de status court avec un lien, et un post dont l’auteur voulait que `summary` soit un résumé s’affiche sur Mastodon derrière un avertissement de contenu.'
		]
	},
	task: {
		prompt: 'Certains serveurs se mettent à envoyer des posts adressés à une nouvelle collection, « abonnés mutuels uniquement ». Mastodon n’a pas de visibilité de ce genre. Dessine la context map de ce changement et choisis : Mastodon doit-il **se conformer** (ajouter une nouvelle visibilité) ou **traduire** (associer cette nouvelle audience à une visibilité existante dans son ACL) ? Dis où le code changerait dans chaque cas.',
		hint: 'Lis d’abord la dernière branche de `visibility` : que fait Mastodon aujourd’hui d’une adresse qu’il ne reconnaît pas ? Puis demande-toi ce que chaque requête de timeline devrait apprendre.',
		answer: [
			'**Aujourd’hui :** la nouvelle collection n’est ni publique ni la collection des abonnés, donc le parser renvoie `:direct` (le handler `Create` peut ensuite requalifier le post en `:limited`). Ça marche par accident, et c’est peut-être plus restreint que ce que l’auteur voulait.',
			'**Se conformer :** ajouter une valeur à la colonne `visibility` de `Status`, puis apprendre à chaque timeline, chaque permission et chaque serializer ce qu’elle veut dire. Mastodon adopte un concept dont il n’a peut-être pas besoin.',
			'**Traduire :** garder les visibilités existantes et associer la nouvelle collection exprès, dans `StatusParser#visibility`, probablement à `:private`. Un seul endroit change, et c’est l’ACL.',
			'Dans les deux cas, le changement vient de l’amont : ce sont les autres serveurs qui l’ont décidé. Mastodon est en aval pour les posts entrants, donc c’est à Mastodon de bouger.',
			'Une bonne réponse nomme le signal qui ferait revoir la décision : si les utilisateurs de Mastodon commencent à demander à poster pour leurs mutuels, se conformer devient rentable.'
		]
	},
	quiz: [
		{
			q: 'Un service en aval reçoit un modèle de l’amont et le transforme dans ses propres termes avant que le moindre code métier ne le voie. Qu’est-ce que c’est ?',
			options: ['Anti-corruption layer', 'Published language', 'Conformist', 'Shared kernel'],
			answer: 0,
			why: 'Une anti-corruption layer est une traduction qui appartient au côté aval. Le conformiste utiliserait le modèle de l’amont tel quel. Un published language est le format commun à la frontière, pas la traduction derrière.'
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
			why: 'La factory associe les types connus à des classes et renvoie `nil` sinon. L’appelant exécute `activity&.perform`, donc une activité inconnue ne fait rien. C’est l’ACL qui décide de ce qui peut entrer dans le modèle.'
		},
		{
			q: 'Dans ActivityStreams, `summary` est « a natural language summarization of the object ». Mastodon l’affiche comme un avertissement de contenu. Qu’est-ce que ça montre ?',
			options: [
				'Mastodon enfreint la spec ActivityPub',
				'Le même mot peut avoir des sens différents dans deux bounded contexts, et c’est la traduction à la frontière qui décide lequel s’applique',
				'ActivityStreams devrait renommer le champ',
				'Les avertissements de contenu font partie du vocabulaire du W3C'
			],
			answer: 1,
			why: 'Chaque contexte donne au mot son propre sens. Le parser de Mastodon traduit `summary` en `spoiler_text` exprès, et sa doc le dit. Une context map rend ce choix visible.'
		}
	],
	takeaway: 'Chaque mot a un contexte d’origine. Là où un mot franchit une frontière, décide exprès : te conformer, traduire, ou t’accorder sur un published language.',
	sources: [
		{ title: 'Martin Fowler, BoundedContext', url: 'https://martinfowler.com/bliki/BoundedContext.html' },
		{ title: 'Evans, DDD Reference: Published Language, Conformist, Anticorruption Layer', url: 'https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf' },
		{ title: 'W3C, Activity Vocabulary', url: 'https://www.w3.org/TR/activitystreams-vocabulary/' },
		{ title: 'Mastodon docs, ActivityPub', url: 'https://docs.joinmastodon.org/spec/activitypub/' },
		{ title: 'Mastodon, status_parser.rb', url: `${PARSER}#L40-L111` }
	]
};
