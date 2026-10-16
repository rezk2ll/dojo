const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04';
const SELECTOR = `${RAILS}/activerecord/lib/active_record/middleware/database_selector`;
const LB = 'https://github.com/gitlabhq/gitlabhq/blob/28f70ed3725bbc2bb6cbfa635ab6dd9bfa57af9a/lib/gitlab/database/load_balancing';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'replication',
	part: 'La garder en marche',
	title: 'La réplication et son retard',
	minutes: 10,
	hook: [
		'Un utilisateur modifie son profil, clique sur Enregistrer, et la page se recharge avec **l’ancien nom**. Il clique encore. Le support reçoit un ticket : « le site n’enregistre pas ».',
		'Rien n’a été perdu. L’écriture est allée au primaire. La page après la redirection a lu sur un réplica qui avait **quelques centaines de millisecondes de retard**, et n’avait pas encore rejoué ce commit.',
		'Le primaire envoie son WAL en continu à chaque réplica, qui le rejoue un peu plus tard. `synchronous_commit` décide si un commit attend ce rejeu, `pg_stat_replication` affiche le retard, et Rails renvoie vers le primaire l’utilisateur qui vient d’écrire.'
	],
	terms: [
		{ term: 'Réplication asynchrone', def: 'Le réglage par défaut de PostgreSQL : un commit revient dès que le primaire a flushé son propre WAL. Les réplicas rattrapent un peu plus tard.' },
		{ term: 'Réplication synchrone', def: 'Un commit attend aussi des standbys désignés. `synchronous_commit` choisit jusqu’où : écrit (`remote_write`), flushé (`on`), ou rejoué et visible (`remote_apply`).' },
		{ term: 'Retard de réplication', def: 'De combien un réplica est en retard, en octets de WAL ou en secondes. Affiché par réplica dans `pg_stat_replication` sur le primaire.' },
		{ term: 'Lire ses propres écritures', def: 'Une promesse faite à un utilisateur : après qu’il a écrit, sa lecture suivante le voit. Les réplicas seuls ne la tiennent pas ; l’appli doit router pour ça.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['save["Enregistrer : UPDATE users SET name"] -->|"COMMIT"| prim[("Primaire")]'],
				highlight: ['save', 'prim'],
				note: 'Le commit est un enregistrement WAL flushé sur le primaire (jour 15). Avec les réglages par défaut, l’appli a sa réponse tout de suite. Aucun réplica n’a été consulté.'
			},
			{
				add: ['prim -->|"flux de WAL"| rep[("Réplica")]'],
				highlight: ['rep'],
				note: 'Le primaire envoie le WAL au réplica par une connexion, au fur et à mesure qu’il l’écrit. Le réplica l’écrit, le flushe et le rejoue, et répond pendant ce temps aux requêtes en lecture seule. La doc parle d’« a small delay between committing a transaction in the primary and the changes becoming visible in the standby » (un petit délai entre le commit sur le primaire et la visibilité sur le standby), « typically under one second » (en général moins d’une seconde) si le réplica suit.'
			},
			{
				add: ['page["Page suivante : SELECT name"] -.->|"avant le rejeu"| rep'],
				highlight: ['page'],
				note: 'La redirection tombe sur le réplica pendant ce délai et lit l’ancienne ligne. Sur le primaire, `pg_stat_replication` montre l’écart par réplica : `write_lag`, `flush_lag` et `replay_lag`. Tes lectures dépendent de `replay_lag`, car une requête sur le réplica ne voit une ligne qu’après son rejeu.'
			},
			{
				add: ['sync["synchronous_commit = remote_apply"] -.->|"le commit attend le rejeu"| prim'],
				highlight: ['sync'],
				note: 'Avec un standby synchrone et `remote_apply`, le commit ne revient qu’une fois que ce standby l’a rejoué. Chaque commit paie alors un aller-retour réseau, et la doc prévient que ces commits « may never be completed if any one of the synchronous standbys should crash » (peuvent ne jamais aboutir si un standby synchrone tombe).'
			},
			{
				add: ['stick["Rails : écrit il y a moins de 2 s"] -->|"lit sur le primaire"| prim'],
				highlight: ['stick'],
				note: 'L’appli peut aussi envoyer au primaire les lectures d’un utilisateur pendant une courte fenêtre après son écriture. Rails le fait avec une minuterie. GitLab le fait par position dans le WAL, et ne revient à un réplica qu’une fois qu’il a rattrapé.'
			}
		]
	},
	example: {
		title: 'activerecord/lib/active_record/middleware/database_selector/resolver.rb : les lectures vont au primaire pendant 2 secondes après une écriture',
		repo: 'rails/rails',
		url: `${SELECTOR}/resolver.rb#L17-L88`,
		lang: 'ruby',
		code: `      # By default the Resolver class will send read traffic to the replica
      # if it's been 2 seconds since the last write.
      class Resolver # :nodoc:
        SEND_TO_REPLICA_DELAY = 2.seconds

        def self.call(context, options = {})
          new(context, options)
        end

        def initialize(context, options = {})
          @context = context
          @options = options
          @delay = @options && @options[:delay] ? @options[:delay] : SEND_TO_REPLICA_DELAY
          @instrumenter = ActiveSupport::Notifications.instrumenter
        end

        attr_reader :context, :delay, :instrumenter

        def read(&blk)
          if read_from_primary?
            read_from_primary(&blk)
          else
            read_from_replica(&blk)
          end
        end

        def write(&blk)
          write_to_primary(&blk)
        end
…
          def write_to_primary
            ActiveRecord::Base.connected_to(role: ActiveRecord.writing_role, prevent_writes: false) do
              instrumenter.instrument("database_selector.active_record.wrote_to_primary") do
                yield
              ensure
                context.update_last_write_timestamp
              end
            end
          end

          def read_from_primary?
            !time_since_last_write_ok?
          end

          def send_to_replica_delay
            delay
          end

          def time_since_last_write_ok?
            Time.now - context.last_write_timestamp >= send_to_replica_delay
          end`,
		notes: [
			'Lignes 19 à 29 : le [middleware](' + SELECTOR + '.rb#L72-L84) appelle `read` quand `reading_request?` est vrai (GET, HEAD ou QUERY) et `write` pour toute autre requête. `read` choisit ensuite le primaire tant que moins de `delay` (2 secondes, ligne 4) s’est écoulé depuis la dernière écriture de cet utilisateur.',
			'Lignes 35 et 36 : `write_to_primary` met à jour l’horodatage dans un `ensure` : une écriture qui a levé une exception compte quand même. [`Session`](' + SELECTOR + '/resolver/session.rb#L34-L40) le stocke en millisecondes sous `session[:last_write]`. Chaque utilisateur a sa propre session : la fenêtre ne s’applique qu’à celui qui a écrit, dans ce navigateur.',
			'Le guide : « Rails guarantees "read your own write" and will send your GET or HEAD request to the writer if it\'s within the `delay` window. » (Rails garantit de lire sa propre écriture dans la fenêtre `delay`). Il dit aussi que Rails « doesn\'t guarantee "read a recent write" for other users » (ne garantit rien pour les autres utilisateurs), et que tu [dois ajuster le délai](' + RAILS + '/guides/source/active_record_multiple_databases.md?plain=1#L330-L334) « based on your database infrastructure ». Avec un réplica en retard de 3 secondes, une fenêtre de 2 secondes envoie l’utilisateur sur des données périmées pendant 1 seconde.',
			'GitLab mesure le réplica au lieu d’utiliser une minuterie. `stick` (dans les sources) enregistre « the latest WAL pointer from the primary » (le dernier pointeur WAL du primaire) pour un utilisateur. Plus tard, [`caught_up?`](' + LB + '/host.rb#L274-L281) demande à un réplica son retard sur ce pointeur, avec `pg_wal_lsn_diff` contre `pg_last_wal_replay_lsn()`, et n’accepte le réplica que si l’écart est nul ou négatif.',
			'GitLab calcule aussi le retard en secondes, avec [`now() - pg_last_xact_replay_timestamp()`](' + LB + '/host.rb#L57-L59). Cet horodatage est le moment où le dernier commit rejoué a été généré sur le primaire : sur un primaire calme, le chiffre grimpe alors que le réplica ne manque de rien.'
		]
	},
	tradeoff: {
		gain: [
			'Les lectures se répartissent sur les réplicas, et le primaire garde sa capacité pour les écritures.',
			'Un réplica a des données presque à jour si le primaire meurt.',
			'La réplication asynchrone ne coûte rien au commit : le primaire n’attend jamais le réseau.'
		],
		cost: [
			'Asynchrone veut dire qu’un crash peut perdre des commits : « The amount of data loss is proportional to the replication delay at the time of failover. » (la perte est proportionnelle au retard au moment du basculement).',
			'Synchrone veut dire que chaque commit attend un aller-retour, et qu’un standby synchrone mort peut bloquer les commits jusqu’à ce qu’un autre prenne sa place.',
			'Chaque chemin de lecture doit maintenant choisir : le primaire pour la fraîcheur, un réplica pour la charge. Un mauvais choix affiche une page périmée, sans aucune erreur.',
			'Un import massif ou une longue requête sur le réplica peut faire passer le retard de quelques millisecondes à plusieurs minutes.'
		]
	},
	task: {
		prompt: 'Après Enregistrer, ton appli redirige et le GET suivant va sur un réplica, sauf si la fenêtre de 2 secondes de Rails s’applique. `pg_stat_replication` montre un `replay_lag` autour de 0,4 s, et de 6 s pendant l’import nocturne. Qui voit des données périmées, et quand ? Puis donne deux corrections et ce que chacune coûte.',
		hint: 'Compare le retard à la fenêtre pour l’utilisateur qui a écrit, puis pour tous les autres.',
		answer: [
			'En temps normal : 0,4 s de retard tient dans la fenêtre de 2 s, donc l’utilisateur qui a enregistré lit sur le primaire et voit le nouveau nom. Les autres peuvent lire des données vieilles de 0,4 s au plus, ce qui passe en général.',
			'Pendant l’import : 6 s de retard dépassent la fenêtre. Entre 2 s et 6 s après Enregistrer, le GET de l’utilisateur va sur un réplica qui n’a pas rejoué l’écriture : il voit l’ancien nom. Tous les autres voient des données vieilles de 6 s.',
			'Correction 1 : élargir la fenêtre, `delay: 10.seconds`. Simple, mais plus de lectures tapent le primaire, et ça reste un pari sur le pire retard.',
			'Correction 2 : suivre la position dans le WAL comme GitLab. Après l’écriture, stocke `pg_current_wal_lsn()` pour l’utilisateur ; avant d’utiliser un réplica, vérifie `pg_wal_lsn_diff(stored, pg_last_wal_replay_lsn()) <= 0` sur lui. Exact, au prix d’une requête de plus et d’un endroit où stocker la position.',
			'Correction 3, pour les rares écritures qui comptent : `SET LOCAL synchronous_commit = remote_apply` dans cette transaction, avec un standby synchrone. Le commit attend que le standby montre le changement. Ça coûte de la latence sur ces commits, et ils bloquent si le standby est tombé.'
		]
	},
	quiz: [
		{
			q: 'La réplication est asynchrone, le défaut. Le primaire plante une seconde après qu’un commit a répondu au client. Que peut-il arriver à ce commit ?',
			options: [
				'Il peut manquer sur le réplica qui est promu à la place du primaire planté',
				'Il est en sûreté sur chaque réplica, car le commit a attendu leur réponse',
				'Il est aussi annulé sur le primaire, pour que les deux serveurs concordent',
				'Il sera rejoué plus tard sur le réplica, depuis les fichiers WAL du primaire planté'
			],
			answer: 0,
			why: 'La doc : « If the primary server crashes then some transactions that were committed may not have been replicated to the standby server, causing data loss. » Un commit asynchrone n’attend que le flush du primaire lui-même (jour 15).'
		},
		{
			q: 'Avec le resolver par défaut de Rails, l’utilisateur A publie un commentaire. Une demi-seconde plus tard, l’utilisateur B charge la page depuis un réplica en retard d’1 s. Que voit B ?',
			options: [
				'Le nouveau commentaire, car l’écriture de A garde tout le site sur le primaire',
				'Le nouveau commentaire, car Rails attend le réplica avant de répondre',
				'Une erreur, car le réplica refuse les lectures tant qu’il est en retard',
				'La page sans le commentaire, car B lui-même n’a rien écrit récemment'
			],
			answer: 3,
			why: 'La fenêtre est par session : seul l’utilisateur qui a écrit est envoyé au primaire. Le guide dit que Rails « doesn\'t guarantee "read a recent write" for other users within the delay window ». B lit le réplica, une seconde en retard.'
		},
		{
			q: 'Tu règles `synchronous_commit = remote_apply` avec un seul standby synchrone désigné. Le serveur de ce standby meurt. Qu’arrive-t-il aux nouveaux commits sur le primaire ?',
			options: [
				'Ils continuent en asynchrone jusqu’à ce que le standby revienne et rattrape',
				'Ils attendent, car aucun standby synchrone ne peut confirmer le rejeu',
				'Ils échouent tout de suite avec une erreur qui demande au client de réessayer',
				'Ils sont validés sur le primaire et rejoués sur le standby à son redémarrage'
			],
			answer: 1,
			why: 'La doc prévient que ces commits « may never be completed if any one of the synchronous standbys should crash », et conseille de désigner plusieurs standbys synchrones possibles dans `synchronous_standby_names` pour qu’un autre prenne le relais.'
		}
	],
	recall: {
		q: 'Pendant combien de temps Rails envoie-t-il au primaire les lectures d’un utilisateur qui vient d’écrire, et quand voit-il quand même des données périmées ?',
		a: 'Pendant 2 secondes (`delay`), mesurées dans la session de cet utilisateur. Si le retard de rejeu dépasse la fenêtre, comme les 6 s pendant un import, ses lectures repartent vers un réplica qui n’a pas encore rejoué l’écriture.'
	},
	sources: [
		{ title: 'Doc PostgreSQL, Log-Shipping Standby Servers (réplication en streaming et synchrone)', url: 'https://www.postgresql.org/docs/current/warm-standby.html' },
		{ title: 'Doc PostgreSQL, synchronous_commit', url: 'https://www.postgresql.org/docs/current/runtime-config-wal.html#GUC-SYNCHRONOUS-COMMIT' },
		{ title: 'Doc PostgreSQL, pg_stat_replication', url: 'https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-REPLICATION-VIEW' },
		{ title: 'Rails Guides, Multiple Databases with Active Record', url: 'https://guides.rubyonrails.org/active_record_multiple_databases.html' },
		{ title: 'Source GitLab, lib/gitlab/database/load_balancing', url: `${LB}/sticking.rb` },
		{ title: 'Source GitLab, Sticking#stick', url: `${LB}/sticking.rb#L111-L120` }
	]
};
