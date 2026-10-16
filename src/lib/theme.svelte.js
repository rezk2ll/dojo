// Same key as the inline script in app.html, which applies the theme before first paint.
const KEY = 'dojo:theme';

export const theme = $state({ dark: false });

/** Call from onMount. Follows the OS setting until the reader picks a theme. */
export function initTheme() {
	theme.dark = document.documentElement.classList.contains('dark');
	matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
		if (!saved()) apply(e.matches);
	});
}

export function toggleTheme() {
	apply(!theme.dark);
	try {
		localStorage.setItem(KEY, theme.dark ? 'dark' : 'light');
	} catch {
		// Blocked storage: the choice lasts for this tab only.
	}
}

function saved() {
	try {
		return localStorage.getItem(KEY);
	} catch {
		return null;
	}
}

/** @param {boolean} dark */
function apply(dark) {
	theme.dark = dark;
	document.documentElement.classList.toggle('dark', dark);
}
