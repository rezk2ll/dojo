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
		],
		steps: [
			{
				title: 'Compare le retard à la fenêtre',
				questions: [
					{ q: 'Quelle colonne de `pg_stat_replication` te dit quand une lecture sur le réplica verra l’écriture ?', options: ['`write_lag`', '`flush_lag`', '`replay_lag`', '`sync_state`'], answer: 2, why: 'Une requête sur le réplica ne voit une ligne qu’après le rejeu. Du WAL écrit ou flushé n’est pas encore visible.' },
					{ q: 'En temps normal : retard de 0,4 s, fenêtre de 2 s. Que voit l’utilisateur qui a enregistré ?', options: ['Le nouveau nom : son GET va sur le primaire', 'L’ancien nom pendant 0,4 s', 'L’ancien nom pendant 2 s', 'Une erreur jusqu’à ce que le réplica rattrape'], answer: 0, why: 'Il a écrit il y a moins de 2 s, donc Rails lit sur le primaire. Le retard tient dans la fenêtre.' },
					{ q: 'Pendant l’import, le retard est de 6 s. La fenêtre de 2 s couvre-t-elle encore celui qui a écrit ?', options: ['Oui, la fenêtre grandit avec le retard', 'Oui, Rails attend le réplica', 'Seulement s’il recharge deux fois', 'Non : de 2 s à 6 s après Enregistrer, il lit un réplica qui n’a pas rejoué l’écriture'], answer: 3, why: 'La fenêtre est un minuteur fixe. Une fois finie, les lectures repartent vers un réplica encore en retard.' },
					{ q: 'Qui d’autre voit des données périmées, et de quel âge ?', options: ['Personne, la fenêtre de celui qui a écrit couvre tout le site', 'Tous les autres : jusqu’à 0,4 s en temps normal, 6 s pendant l’import', 'Seulement les utilisateurs du même pod', 'Seulement ceux qui ont aussi écrit récemment'], answer: 1, why: 'La fenêtre est par session. Rails « doesn\'t guarantee "read a recent write" » pour les autres utilisateurs.' }
				]
			},
			{
				title: 'Corrige avec une fenêtre plus longue',
				questions: [
					{ q: 'Quelle est la première correction ?', options: ['Supprimer les réplicas', 'Activer `remote_apply` pour chaque commit', 'Élargir la fenêtre, par exemple `delay: 10.seconds`', 'Baisser `max_connections`'], answer: 2, why: 'Une fenêtre plus longue garde celui qui a écrit sur le primaire au-delà du pire retard vu jusqu’ici.' },
					{ q: 'Que coûte-t-elle ?', options: ['Plus de lectures tapent le primaire, et ça reste un pari sur le pire retard', 'Chaque commit attend un aller-retour réseau', 'Les utilisateurs perdent leur session après une écriture', 'Rien'], answer: 0, why: 'Un minuteur ne connaît pas le vrai retard. Un import plus gros pourrait encore dépasser 10 s.' },
					{ q: 'Une fenêtre plus longue aide-t-elle les autres utilisateurs ?', options: ['Oui, tout le monde lit le primaire pendant la fenêtre', 'Oui, le réplica accélère', 'Seulement pour les requêtes GET', 'Non : elle ne couvre que la session qui a écrit'], answer: 3, why: 'Chaque utilisateur a son propre horodatage `last_write`. Les autres lisent toujours le réplica.' },
					{ q: 'Où Rails garde-t-il l’heure de la dernière écriture ?', options: ['Dans un cache côté serveur', 'Dans la session de l’utilisateur, sous `session[:last_write]`', 'Dans une colonne de la table `users`', 'Dans `pg_stat_replication`'], answer: 1, why: 'La `Session` du resolver la stocke en millisecondes. C’est pourquoi la fenêtre est par utilisateur et par navigateur.' }
				]
			},
			{
				title: 'Corrige par la position dans le WAL',
				questions: [
					{ q: 'Après l’écriture, que stocke l’appli pour l’utilisateur ?', options: ['`pg_current_wal_lsn()` du primaire', '`now()` du réplica', 'Le `replay_lag` du réplica', 'L’id de la ligne écrite'], answer: 0, why: 'GitLab garde « the latest WAL pointer from the primary » (le dernier pointeur WAL du primaire). Il marque exactement ce que le réplica doit avoir rejoué.' },
					{ q: 'Avant d’utiliser un réplica, que vérifie l’appli dessus ?', options: ['`SELECT pg_is_in_recovery()`', '`now() - pg_last_xact_replay_timestamp() < 2 seconds`', '`pg_wal_lsn_diff(stored, pg_last_wal_replay_lsn()) <= 0`', '`SELECT count(*) FROM pg_stat_replication`'], answer: 2, why: 'Une différence nulle ou négative veut dire que le réplica a rejoué au-delà de l’écriture de l’utilisateur.' },
					{ q: 'Pourquoi ne pas tester avec `now() - pg_last_xact_replay_timestamp()` ?', options: ['Ça ne marche que sur le primaire', 'Sur un primaire calme, ça grandit même quand le réplica ne rate rien', 'Ça renvoie des octets, pas des secondes', 'Ça exige un standby synchrone'], answer: 1, why: 'L’horodatage est celui du dernier commit rejoué. Sans nouveaux commits, le nombre continue de monter.' },
					{ q: 'Que coûte la correction par position WAL ?', options: ['Un redémarrage du réplica', 'Chaque commit attend le rejeu', 'Une fenêtre plus large pour tout le monde', 'Une requête de plus et un endroit où stocker la position'], answer: 3, why: 'Elle est exacte, mais l’appli doit garder le LSN par utilisateur et interroger le réplica avant chaque lecture.' }
				]
			},
			{
				title: 'Pèse le commit synchrone',
				questions: [
					{ q: 'Quel réglage fait attendre un commit jusqu’à ce que le standby montre le changement ?', options: ['`synchronous_commit = on`', '`synchronous_commit = remote_apply`', '`synchronous_commit = remote_write`', '`synchronous_commit = off`'], answer: 1, why: '`on` attend le flush et `remote_write` l’écriture. Seul `remote_apply` attend le rejeu, ce que voient les lectures.' },
					{ q: 'Où le règles-tu, pour les rares écritures qui comptent ?', options: ['`SET LOCAL synchronous_commit = remote_apply` dans cette transaction', 'Dans `postgresql.conf` pour chaque commit', 'Sur le réplica', 'Dans l’option `delay` de Rails'], answer: 0, why: '`SET LOCAL` limite le coût aux transactions qui en ont besoin.' },
					{ q: 'Que paie chacun de ces commits ?', options: ['Rien, les réplicas sont rapides', 'Un verrou de table', 'Un aller-retour réseau et le temps de rejeu du standby', 'Un segment WAL entier'], answer: 2, why: 'Le commit ne répond qu’une fois que le standby l’a rejoué.' },
					{ q: 'Le seul standby synchrone meurt. Qu’arrive-t-il à ces commits ?', options: ['Ils repassent en asynchrone', 'Ils échouent tout de suite avec une erreur', 'Ils sont validés et rejoués au redémarrage', 'Ils attendent, et peuvent ne jamais finir tant qu’un autre standby ne prend pas le relais'], answer: 3, why: 'La doc prévient exactement de ça. Désigne plusieurs standbys possibles dans `synchronous_standby_names`.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Monter un primaire et un réplica en streaming, lire une ligne périmée sur le réplica, la détecter par position WAL, puis faire attendre un commit jusqu’au rejeu.',
		steps: [
			'Lance le primaire : `docker run -d --name dojo-pg -e POSTGRES_PASSWORD=dojo postgres:17`. Attends que `docker exec dojo-pg pg_isready` affiche `accepting connections`. Puis `docker exec dojo-pg psql -U postgres -c "CREATE TABLE users (id int PRIMARY KEY, name text)" -c "INSERT INTO users VALUES (1, \'Ada\')"`.',
			'Lance un réplica dans l’espace réseau du primaire, sur le port 5433 : `docker run -d --name dojo-replica --network container:dojo-pg -u postgres postgres:17 sh -c \'pg_basebackup -h localhost -U postgres -D /tmp/replica -R -X stream && exec postgres -D /tmp/replica -c port=5433\'`. Attends que `docker logs dojo-replica` affiche `started streaming WAL from primary`.',
			'Vérifie le flux depuis le primaire : `docker exec dojo-pg psql -U postgres -c "SELECT application_name, state, sync_state, replay_lag FROM pg_stat_replication"`. Lis depuis le réplica : `docker exec dojo-replica psql -p 5433 -U postgres -c "SELECT pg_is_in_recovery(), name FROM users"`.',
			'Crée du retard exprès : `docker exec dojo-replica psql -p 5433 -U postgres -c "SELECT pg_wal_replay_pause()"`. Sur le primaire : `docker exec dojo-pg psql -U postgres -At -c "UPDATE users SET name = \'Grace\' WHERE id = 1" -c "SELECT pg_current_wal_lsn()"` et note le LSN.',
			'Lis le réplica, et vérifie-le à la manière de GitLab avec ton LSN : `docker exec dojo-replica psql -p 5433 -U postgres -c "SELECT name FROM users" -c "SELECT pg_wal_lsn_diff(\'<ton lsn>\', pg_last_wal_replay_lsn())"`',
			'Rends le réplica synchrone : `docker exec dojo-pg psql -U postgres -c "ALTER SYSTEM SET synchronous_standby_names = \'walreceiver\'" -c "SELECT pg_reload_conf()"`. Puis, le rejeu toujours en pause : `docker exec dojo-pg psql -U postgres -c "SET synchronous_commit = remote_apply" -c "UPDATE users SET name = \'Lovelace\' WHERE id = 1"`.',
			'Dans un second terminal, pendant que ce commit attend : `docker exec dojo-replica psql -p 5433 -U postgres -c "SELECT pg_wal_replay_resume()"`.'
		],
		done: [
			'À l’étape 3, `pg_stat_replication` montre une ligne `walreceiver`, `streaming` et `async`, et le réplica répond `t` et `Ada`.',
			'À l’étape 5, le réplica dit encore `Ada`, et `pg_wal_lsn_diff` est au-dessus de zéro.',
			'Après l’étape 6, `pg_stat_replication` montre `sync_state` à `sync`, et l’UPDATE en `remote_apply` reste bloqué.',
			'À l’étape 7, l’UPDATE répond dès que le rejeu reprend, et le réplica lit `Lovelace`.'
		],
		solution: [
			'Le primaire a validé `Grace` sans demander au réplica : c’est la réplication asynchrone. Une lecture sur le réplica ne voit une ligne qu’après le rejeu, donc elle a servi l’ancien nom.',
			'Un `pg_wal_lsn_diff` au-dessus de zéro dit que le réplica n’a pas rejoué jusqu’à l’écriture de l’utilisateur. Une appli enverrait cette lecture au primaire.',
			'Avec `remote_apply`, le commit attend le rejeu sur le standby synchrone. Le rejeu en pause, il pourrait attendre sans fin, comme le fait un standby mort pour ces commits.',
			'Nettoie avec `docker rm -f dojo-replica dojo-pg`.'
		]
	},
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
