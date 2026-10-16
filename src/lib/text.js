/** Escapes HTML, then renders `code`, **bold** and [links](https://…). Chapter text is ours, not user input. */
export function fmt(/** @type {string} */ s) {
	/** @type {string[]} */
	const code = [];
	// Code is set aside first so a `*` or `]` inside it cannot open bold or close a link.
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/`([^`]+)`/g, (_, c) => `\0${code.push(c) - 1}\0`)
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
		.replace(/\0(\d+)\0/g, (_, i) => `<code>${code[i]}</code>`);
}

/** Case-insensitive search over chapter text as the reader sees it, so link targets and markup never match. */
export function matcher(/** @type {string} */ query) {
	const q = query.trim().toLowerCase();
	const seen = (/** @type {string} */ s) => s.replace(/\]\([^)]*\)/g, '').replace(/[*`[]/g, '').toLowerCase();
	return (/** @type {string[]} */ texts) => !q || texts.some((s) => seen(s).includes(q));
}

/** Fisher-Yates: a random sort comparator does not give every order the same chance. @template T @param {T[]} items */
export function shuffle(items) {
	const a = [...items];
	for (let j = a.length - 1; j > 0; j--) {
		const k = Math.floor(Math.random() * (j + 1));
		[a[j], a[k]] = [a[k], a[j]];
	}
	return a;
}
