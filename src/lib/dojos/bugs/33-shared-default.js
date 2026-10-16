const LARAVEL = 'https://github.com/laravel/framework';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'shared-default',
	part: 'Logic',
	title: 'A locale that stays set',
	minutes: 10,
	hook: [
		'In Laravel 13, `Notification::locale(\'es\')->send($ana, new InvoicePaid)` sends one notification in Spanish. After a change in pull request #61904, the next call, `Notification::send($bob, new InvoicePaid)`, **also went out in Spanish**. So did `$cat->notify(new InvoicePaid)`. A preferred locale set on the user did not win either.',
		'The `Notification` facade forwards every call to one `ChannelManager` object, the same one for the whole process. In a queue worker that process handles many users in a row.'
	],
	terms: [
		{ term: 'Facade', def: 'A Laravel class with static methods that forward each call to one object taken from the service container.' },
		{ term: 'Singleton', def: 'An object the container creates once and returns to every caller for the rest of the process.' },
		{ term: 'tap()', def: 'A Laravel helper. `tap($value, $callback)` calls the callback with the value, then returns the value.' }
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
			'**One caller writes, every caller reads.** `locale()` stores the value in `$this->locale` and returns the manager. The manager is a singleton, so that field is shared by every `send` in the process. Line 19 passes it to the sender on each send and never clears it.',
			'**The sequence that breaks.** `Notification::locale(\'es\')->send($ana, ...)` sets the field to `es`. `Notification::send($bob, ...)` does not call `locale()`, so the field still holds `es` and Bob gets Spanish. The pull request adds that the sender checks this locale before `HasLocalePreference`, "so it also overrides the notifiable\'s own preferred locale".',
			'**The fix.** `tap` hands the current locale to the sender, then sets `$this->locale` back to `null` before returning. The locale now applies to the one send it was chained to, "the same way `Mail::to()->locale()` works", as the pull request puts it.',
			'**How it was found.** [Pull request #61959](' + LARAVEL + '/pull/61959) shows the three calls above and says: "In a queue worker or on Octane that means unrelated users get notifications in the wrong language." Its new test sends a French notification, then two more, and checks that only the first one contains "bonjour".'
		]
	},
	quiz: [
		{
			q: 'You call `Notification::locale(\'fr\')->send($a, $n)`, then `Notification::send($b, $n)`. In the buggy code, which locale does `$b` get?',
			options: [
				'The app default locale, since `locale()` was not called',
				'French, because the manager still holds `fr`',
				'The preferred locale of `$b`, if it has one',
				'English, because `send` resets the locale'
			],
			answer: 1,
			why: 'The field on the shared manager was set to `fr` by the first call and nothing cleared it. Line 19 passes it to the sender again.'
		},
		{
			q: 'Why did tests that send a single notification not catch this?',
			options: [
				'They run without a queue worker, so locales are ignored',
				'The leak needs a second send in the same process',
				'The facade is mocked in tests, so `locale()` does nothing',
				'Tests always set the app locale to English first'
			],
			answer: 1,
			why: 'The first send is correct. The wrong locale shows up on the next send that reuses the same manager, so a test needs two sends in a row.'
		},
		{
			q: 'A fluent method on a shared object stores an option for the next call. What is the safest design?',
			options: [
				'Store the option in a static field instead of an instance field',
				'Return a new object that holds the option, or clear it after use',
				'Document that callers must reset the option themselves',
				'Read the option from the environment on each call'
			],
			answer: 1,
			why: 'A new object per call, or a reset right after the call, keeps the option from reaching callers that never asked for it. The fix here does the reset.'
		}
	],
	takeaway: 'When a method on a singleton stores an option such as a locale, a timeout or a recipient, check where that option is cleared. If nothing clears it, every later caller in the same process gets it too.',
	sources: [
		{ title: 'laravel/framework pull request #61959', url: `${LARAVEL}/pull/61959` },
		{ title: 'Pull request #61904, which started passing the locale on every send', url: `${LARAVEL}/pull/61904` }
	]
};
