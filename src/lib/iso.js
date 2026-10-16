export const SLOPE = Math.tan(Math.PI / 6);

/** Ground point (x, y) to screen, in the 30° isometric view. */
export const iso = (/** @type {number} */ x, /** @type {number} */ y) => ({ X: x - y, Y: (x + y) * SLOPE });

/**
 * The three visible faces of a box standing on the ground at (cx, cy).
 * @param {number} cx @param {number} cy @param {number} h height @param {number} a half width
 */
export function faces(cx, cy, h, a) {
	const b = a * SLOPE;
	const t = cy - h;
	const pts = (/** @type {number[][]} */ p) => p.map((q) => q.join(',')).join(' ');
	return {
		top: pts([[cx, t - b], [cx + a, t], [cx, t + b], [cx - a, t]]),
		left: pts([[cx - a, t], [cx, t + b], [cx, cy + b], [cx - a, cy]]),
		right: pts([[cx, t + b], [cx + a, t], [cx + a, cy], [cx, cy + b]])
	};
}
