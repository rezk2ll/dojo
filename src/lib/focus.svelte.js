const KEY = 'dojo:focus';

/** Focus mode hides the header and the chapter sidebar, leaving only the current section. */
export const focus = $state({ on: false });

export function initFocus() {
	try {
		focus.on = localStorage.getItem(KEY) === '1';
	} catch {
		// Blocked storage: focus mode starts off.
	}
}

export function toggleFocus() {
	focus.on = !focus.on;
	try {
		localStorage.setItem(KEY, focus.on ? '1' : '0');
	} catch {
		// Blocked storage: the choice lasts for this tab only.
	}
}
