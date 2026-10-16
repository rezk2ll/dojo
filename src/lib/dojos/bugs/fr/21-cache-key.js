const RAILS = 'https://github.com/rails/rails';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cache-key',
	part: 'L’état et le temps',
	title: 'Une clé de rate limit sans le contrôleur',
	minutes: 10,
	hook: [
		'Un contrôleur Rails peut limiter la fréquence des appels d’un client : `rate_limit to: 10, within: 5.minutes`. Les compteurs vivent dans le cache Rails. Un contrôleur qui a plusieurs limites donne un `name:` à chacune, une option ajoutée quelques jours avant ce correctif.',
		'Prends deux contrôleurs qui déclarent chacun `rate_limit to: 10, within: 5.minutes, name: "long-term"`. Un client envoie 6 requêtes au premier, puis 5 au second. **Sa 11e requête reçoit `429 Too Many Requests`**, alors qu’aucun contrôleur n’en a vu plus de 6.'
	],
	terms: [
		{ term: 'Rate limit', def: 'Un plafond sur le nombre de requêtes d’un client dans une fenêtre de temps. Au-delà, le serveur répond 429.' },
		{ term: 'store.increment', def: 'Ajoute 1 au compteur rangé sous une clé dans le cache, le crée s’il manque, et renvoie la nouvelle valeur.' },
		{ term: 'controller_path', def: 'Le nom de chemin d’un contrôleur : `"sessions"` pour `SessionsController`, `"admin/users"` pour `Admin::UsersController`.' },
		{ term: 'Clé de cache', def: 'La chaîne sous laquelle une valeur est rangée. Deux bouts de code qui construisent la même clé lisent et écrivent la même valeur.' }
	],
	bug: {
		title: 'Include controller path into cache keys for rate limiters (#52961)',
		repo: 'rails/rails',
		url: `${RAILS}/blob/cde7ffee3067820ddc67d5150b8bfad4183ec226/actionpack/lib/action_controller/metal/rate_limiting.rb#L51-L68`,
		fix: `${RAILS}/commit/9c41f5828cd4134469ee57a2a3b523a27f93a630`,
		lang: 'ruby',
		code: `  #     class SessionsController < ApplicationController
  #       rate_limit to: 3, within: 2.seconds, name: "short-term"
  #       rate_limit to: 10, within: 5.minutes, name: "long-term"
  #     end
  def rate_limit(to:, within:, by: -> { request.remote_ip }, with: -> { head :too_many_requests }, store: cache_store, name: controller_path, **options)
    before_action -> { rate_limiting(to: to, within: within, by: by, with: with, store: store, name: name) }, **options
  end
end

private
  def rate_limiting(to:, within:, by:, with:, store:, name:)
    count = store.increment("rate-limit:#{name}:#{instance_exec(&by)}", 1, expires_in: within)
    if count && count > to
      ActiveSupport::Notifications.instrument("rate_limit.action_controller", request: request) do
        instance_exec(&with)
      end
    end
  end`,
		lines: [5, 12],
		diff: `-      def rate_limit(to:, within:, by: -> { request.remote_ip }, with: -> { head :too_many_requests }, store: cache_store, name: controller_path, **options)
+      def rate_limit(to:, within:, by: -> { request.remote_ip }, with: -> { head :too_many_requests }, store: cache_store, name: nil, **options)
         before_action -> { rate_limiting(to: to, within: within, by: by, with: with, store: store, name: name) }, **options
 …
       def rate_limiting(to:, within:, by:, with:, store:, name:)
-        count = store.increment("rate-limit:#{name}:#{instance_exec(&by)}", 1, expires_in: within)
+        cache_key = ["rate-limit", controller_path, name, instance_exec(&by)].compact.join(":")
+        count = store.increment(cache_key, 1, expires_in: within)
         if count && count > to`,
		notes: [
			'La ligne 12 range le compteur sous `"rate-limit:#{name}:#{ip}"` : la clé ne contient que le nom et l’IP. Avec le nom par défaut de la ligne 5, `controller_path`, chaque contrôleur a sa clé. Avec `name: "long-term"`, tous les contrôleurs qui choisissent ce nom écrivent sous `rate-limit:long-term:203.0.113.5`.',
			'Les deux contrôleurs ont `to: 10` et le même nom. Depuis 203.0.113.5, 6 requêtes au premier et 5 au second appellent toutes `store.increment` sur une seule clé, qui renvoie 1 jusqu’à 11. À la 11e, la ligne 13 compare `11 > 10`, et le client reçoit 429 d’un contrôleur qui n’a compté que 5 de ses requêtes.',
			'Le correctif assemble la clé morceau par morceau : `["rate-limit", controller_path, name, ...].compact.join(":")`. Le contrôleur qui traite la requête fournit maintenant `controller_path`, donc deux contrôleurs ne partagent jamais une clé. Le nom par défaut vaut maintenant `nil`, et `compact` le retire : `rate-limit:sessions:203.0.113.5`.',
			'L’auteur de l’option `name:` a remarqué le bug après le merge. La [pull request](' + RAILS + '/pull/52961) dit : "So if someone uses `name: "long-term"` rate limiter in `FooController` and `name: "long-term"` in `BarController`, they both will share the same key." (les deux contrôleurs partagent la même clé).'
		]
	},
	quiz: [
		{
			q: '`PostsController` et `CommentsController` déclarent tous deux `rate_limit to: 10, within: 1.minute, name: "burst"`. Quelle clé utilise une requête de 198.51.100.7 dans chacun ?',
			options: [
				'rate-limit:posts:198.51.100.7 et rate-limit:comments:198.51.100.7',
				'rate-limit:burst:198.51.100.7 dans les deux contrôleurs',
				'rate-limit:posts:burst et rate-limit:comments:burst',
				'Une clé aléatoire par requête, donc rien n’est partagé'
			],
			answer: 1,
			why: 'La clé boguée est `"rate-limit:#{name}:#{ip}"`. Le nom et l’IP sont les mêmes dans les deux contrôleurs, donc les deux construisent `rate-limit:burst:198.51.100.7`.'
		},
		{
			q: 'Les deux contrôleurs ont `to: 10` et le nom partagé. Un client envoie 4 requêtes à Posts, puis 7 à Comments. Quelle requête est refusée en premier ?',
			options: ['Aucune, chaque contrôleur reste sous 10', 'La 7e requête à Comments', 'La 10e requête à Posts', 'La 1re requête à Comments'],
			answer: 1,
			why: 'Le compteur partagé atteint 11 à la 11e requête au total, qui est la 7e à Comments. `11 > 10`, donc elle reçoit 429.'
		},
		{
			q: 'Tu relis du code qui range des valeurs dans un cache partagé. Que vérifies-tu sur la clé ?',
			options: [
				'Qu’elle est plus courte que la taille de clé maximale du cache',
				'Qu’elle contient chaque entrée qui change la valeur rangée',
				'Qu’elle n’utilise que des minuscules et des deux-points',
				'Qu’elle est construite une fois au démarrage puis réutilisée'
			],
			answer: 1,
			why: 'Si deux appelants qui devraient avoir des valeurs séparées construisent la même clé, chacun lit et modifie la valeur de l’autre. Ici, le contrôleur manquait dans la clé.'
		}
	],
	recall: {
		q: 'Quel morceau manquait dans la clé de rate limit, et qu’ont partagé deux contrôleurs avec le même `name:` ?',
		a: 'La clé n’avait pas le chemin du contrôleur. Les deux construisaient `rate-limit:long-term:<ip>`, donc ils comptaient dans un seul compteur, et un client recevait 429 après 11 requêtes réparties entre eux.'
	},
	sources: [
		{ title: 'rails, pull request #52961', url: `${RAILS}/pull/52961` },
		{ title: 'rails, pull request #52960, qui a ajouté name:', url: `${RAILS}/pull/52960` }
	]
};
