const LARAVEL = 'https://github.com/laravel/framework';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'shared-default',
	part: 'La logique',
	title: 'Une locale qui reste en place',
	minutes: 10,
	hook: [
		'Dans Laravel 13, `Notification::locale(\'es\')->send($ana, new InvoicePaid)` envoie une notification en espagnol. Après un changement de la pull request #61904, l’appel suivant, `Notification::send($bob, new InvoicePaid)`, **partait aussi en espagnol**. Pareil pour `$cat->notify(new InvoicePaid)`. Une locale préférée réglée sur l’utilisateur ne passait pas devant non plus.',
		'La façade `Notification` transmet chaque appel à un seul objet `ChannelManager`, le même pour tout le processus. Dans un worker de file d’attente, ce processus traite beaucoup d’utilisateurs, l’un après l’autre.'
	],
	terms: [
		{ term: 'Façade', def: 'Une classe Laravel aux méthodes statiques, qui transmet chaque appel à un objet tiré du conteneur de services.' },
		{ term: 'Singleton', def: 'Un objet que le conteneur crée une fois et rend à chaque appelant jusqu’à la fin du processus.' },
		{ term: 'tap()', def: 'Un helper Laravel. `tap($value, $callback)` appelle le callback avec la valeur, puis renvoie la valeur.' }
	],
	bug: {
		title: '[13.x] Fix `Notification::locale()` being applied to later notifications (#61959)',
		repo: 'laravel/framework',
		url: `${LARAVEL}/blob/f618f7911d91ba36bc8d624749e522b77f235782/src/Illuminate/Notifications/ChannelManager.php#L32-L193`,
		fix: `${LARAVEL}/commit/1ee6d193dbb293fc0cd7334856848d0d80d50c2e`,
		lang: 'php',
		code: `/**
 * The locale used when sending notifications.
 *
 * @var string|null
 */
protected $locale;
…
public function send($notifiables, $notification)
{
    $this->resolveNotificationSender()->send($notifiables, $notification);
}
…
protected function resolveNotificationSender()
{
    $this->notificationSender ??= new NotificationSender(
        $this, $this->container->make(Bus::class), $this->container->make(Dispatcher::class)
    );

    return $this->notificationSender->locale($this->locale);
}
…
public function locale($locale)
{
    $this->locale = $locale;

    return $this;
}`,
		lines: [19],
		diff: `         $this->notificationSender ??= new NotificationSender(
             $this, $this->container->make(Bus::class), $this->container->make(Dispatcher::class)
         );

-        return $this->notificationSender->locale($this->locale);
+        return tap($this->notificationSender->locale($this->locale), function () {
+            $this->locale = null;
+        });
     }`,
		notes: [
			'**Un appelant écrit, tous les appelants lisent.** `locale()` range la valeur dans `$this->locale` et renvoie le manager. Le manager est un singleton, donc ce champ est partagé par tous les `send` du processus. La ligne 19 le passe au sender à chaque envoi et ne le vide jamais.',
			'**La séquence qui casse.** `Notification::locale(\'es\')->send($ana, ...)` met le champ à `es`. `Notification::send($bob, ...)` n’appelle pas `locale()`, donc le champ vaut toujours `es` et Bob reçoit de l’espagnol. La pull request ajoute que le sender regarde cette locale avant `HasLocalePreference`, "so it also overrides the notifiable\'s own preferred locale" (elle écrase aussi la locale préférée du destinataire).',
			'**Le correctif.** `tap` passe la locale courante au sender, puis remet `$this->locale` à `null` avant de rendre la main. La locale ne s’applique plus qu’à l’envoi auquel elle est chaînée, "the same way `Mail::to()->locale()` works", comme le dit la pull request.',
			'**Comment ça a été trouvé.** [La pull request #61959](' + LARAVEL + '/pull/61959) montre les trois appels ci-dessus et dit : "In a queue worker or on Octane that means unrelated users get notifications in the wrong language." Son nouveau test envoie une notification en français, puis deux autres, et vérifie que seule la première contient « bonjour ».'
		]
	},
	quiz: [
		{
			q: 'Tu appelles `Notification::locale(\'fr\')->send($a, $n)`, puis `Notification::send($b, $n)`. Avec le code bogué, quelle locale reçoit `$b` ?',
			options: [
				'La locale par défaut de l’appli, puisque `locale()` n’a pas été appelée',
				'Le français, parce que le manager garde toujours `fr`',
				'La locale préférée de `$b`, s’il en a une',
				'L’anglais, parce que `send` remet la locale à zéro'
			],
			answer: 1,
			why: 'Le premier appel a mis le champ du manager partagé à `fr` et rien ne l’a vidé. La ligne 19 le repasse au sender.'
		},
		{
			q: 'Pourquoi les tests qui envoient une seule notification ne l’ont-ils pas vu ?',
			options: [
				'Ils tournent sans worker de file, donc les locales sont ignorées',
				'La fuite demande un second envoi dans le même processus',
				'La façade est simulée en test, donc `locale()` ne fait rien',
				'Les tests règlent toujours la locale de l’appli en anglais d’abord'
			],
			answer: 1,
			why: 'Le premier envoi est correct. La mauvaise locale apparaît à l’envoi suivant qui réutilise le même manager, donc il faut deux envois successifs dans le test.'
		},
		{
			q: 'Une méthode fluide sur un objet partagé range une option pour l’appel suivant. Quelle conception est la plus sûre ?',
			options: [
				'Ranger l’option dans un champ statique plutôt que d’instance',
				'Renvoyer un nouvel objet qui porte l’option, ou la vider après usage',
				'Documenter que les appelants doivent remettre l’option à zéro',
				'Lire l’option dans l’environnement à chaque appel'
			],
			answer: 1,
			why: 'Un nouvel objet par appel, ou une remise à zéro juste après l’appel, empêche l’option d’atteindre des appelants qui ne l’ont jamais demandée. Le correctif ici fait la remise à zéro.'
		}
	],
	takeaway: 'Quand une méthode d’un singleton range une option comme une locale, un délai ou un destinataire, cherche où cette option est vidée. Si rien ne la vide, tous les appelants suivants du même processus la reçoivent aussi.',
	sources: [
		{ title: 'laravel/framework, pull request #61959', url: `${LARAVEL}/pull/61959` },
		{ title: 'La pull request #61904, qui a fait passer la locale à chaque envoi', url: `${LARAVEL}/pull/61904` }
	]
};
