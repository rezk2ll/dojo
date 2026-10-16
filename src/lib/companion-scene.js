import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * @typedef {import('./companion.svelte.js').Mood} Mood
 * @typedef {import('./companion.svelte.js').Cue} Cue
 * @typedef {import('./companion.svelte.js').Eyes} Eyes
 */

/** A damped spring, so every motion eases in and settles instead of snapping. */
function spring(stiffness = 170, damping = 22, x = 0) {
	return {
		x,
		v: 0,
		to: x,
		/** @param {number} dt */
		step(dt) {
			this.v += (stiffness * (this.to - this.x) - damping * this.v) * dt;
			this.x += this.v * dt;
		}
	};
}

const REST = { yaw: -0.42, pitch: 0.22 };
// Places it can hide, in pixels from its home corner at the medium size. Spaced so one is always clear of the pointer.
const SPOTS = [
	[0, 0],
	[-230, 0],
	[0, -220],
	[-230, -220]
];
const DODGE = 140;
// A tap on a touch screen is a short visit, not a pointer that stays.
const TOUCH_STAYS = 2500;
const SLEEP_AFTER = 120_000;
const GROUND = -0.82;
const NEEDS_YOU = 0xffb347;
const FACE = 256;

/**
 * Draws the companion into `canvas` and animates it until `dispose` is called.
 * @param {HTMLCanvasElement} canvas
 * @param {{ color: string, still: boolean, touch: boolean }} options
 */
export function createScene(canvas, { color, still, touch }) {
	const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	renderer.toneMapping = THREE.NeutralToneMapping;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;

	const scene = new THREE.Scene();
	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	pmrem.dispose();

	const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
	camera.position.set(0, 0.45, 4.4);
	camera.lookAt(0, -0.05, 0);

	const sun = new THREE.DirectionalLight(0xffffff, 1.4);
	sun.position.set(-1.5, 4, 3);
	sun.castShadow = true;
	sun.shadow.mapSize.set(512, 512);
	sun.shadow.radius = 8;
	Object.assign(sun.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 10 });
	const rim = new THREE.DirectionalLight(0xffffff, 0.8);
	rim.position.set(2.5, 1, -2);
	scene.add(sun, rim);

	const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.12 }));
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = GROUND;
	ground.receiveShadow = true;
	scene.add(ground);

	const tint = new THREE.Color(color);
	const amber = new THREE.Color(NEEDS_YOU);
	const glowColor = () => tint.clone().lerp(new THREE.Color(0xffffff), 0.3);

	// A dashed light ring on the ground: the cube hovers over it, and its spin shows the answer combo.
	const ringMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true });
	const ring = new THREE.Group();
	for (let i = 0; i < 6; i++) {
		const arc = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.011, 8, 24, (Math.PI / 3) * 0.78), ringMat);
		arc.rotation.z = (i * Math.PI) / 3;
		ring.add(arc);
	}
	ring.rotation.x = Math.PI / 2;
	ring.position.y = -0.8;
	const halo = new THREE.Mesh(
		new THREE.PlaneGeometry(1.5, 1.5),
		new THREE.MeshBasicMaterial({ map: radial(), color: tint, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
	);
	halo.rotation.x = -Math.PI / 2;
	halo.position.y = -0.805;
	scene.add(ring, halo);

	const root = new THREE.Group();
	const body = new THREE.Group();
	root.add(body);
	scene.add(root);

	const shell = new THREE.MeshPhysicalMaterial({ color: 0x23272d, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.18 });
	const cube = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 5, 0.09), shell);
	cube.castShadow = true;
	body.add(cube);

	// The face is a small screen redrawn every frame, so any expression is just a drawing.
	const faceCanvas = document.createElement('canvas');
	faceCanvas.width = faceCanvas.height = FACE;
	const ctx = /** @type {CanvasRenderingContext2D} */ (faceCanvas.getContext('2d'));
	const faceTexture = new THREE.CanvasTexture(faceCanvas);
	faceTexture.colorSpace = THREE.SRGBColorSpace;
	const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true, toneMapped: false }));
	screen.position.z = 0.502;
	body.add(screen);

	// A status light on top, the same color as the eyes, amber when today's lesson is still waiting.
	const led = new THREE.Mesh(new THREE.CircleGeometry(0.035, 24), new THREE.MeshBasicMaterial({ color: tint, toneMapped: false }));
	led.rotation.x = -Math.PI / 2;
	led.position.set(0.3, 0.502, 0.3);
	body.add(led);

	// Each dojo dresses it a little: a turning gear for DevOps, blueprint paper on the screen for Architecture.
	const gearMat = new THREE.MeshPhysicalMaterial({ color: tint, metalness: 0.7, roughness: 0.3 });
	const gear = new THREE.Mesh(gearGeometry(), gearMat);
	// Upright and half sunk into the lid: the camera sits almost level, so a flat gear would read as a bar.
	gear.position.set(-0.22, 0.5, 0);
	gear.castShadow = true;
	gear.visible = false;
	body.add(gear);
	let outfit = '';
	/** @type {Eyes} */
	let eyes = 'pill';

	const s = {
		yaw: spring(110, 20, REST.yaw),
		pitch: spring(110, 20, REST.pitch),
		roll: spring(140, 16),
		y: spring(120, 16),
		lookX: spring(180, 24),
		lookY: spring(180, 24),
		lid: spring(500, 40),
		happy: spring(90, 18),
		sad: spring(90, 18),
		glow: spring(60, 14, 1),
		ox: spring(70, 14),
		oy: spring(70, 14),
		sleep: spring(30, 11),
		focus: spring(90, 18),
		spin: spring(20, 9, 0.25)
	};
	const springs = Object.values(s);

	let scale = 1;
	let pointer = { x: -1e4, y: -1e4, at: performance.now() };
	let spot = SPOTS[0];
	/** @type {{ mood: Mood, at: number } | undefined} */
	let reaction;
	/** @type {{ name: Cue, at: number, dropped?: boolean } | undefined} */
	let cued;
	/** @type {{ mesh: THREE.Mesh, v: number, at: number } | undefined} */
	let drop;
	let read = { until: 0, dir: 0 };
	let turns = 0;
	let combo = 0;
	let streak = { days: 0, needsYou: false };
	/** @type {string | undefined} */
	let offer;
	let nextBlink = performance.now() + 2500;
	let nextScan = performance.now() + 5000;
	let activeAt = performance.now();

	function wake() {
		const now = performance.now();
		// A small start, like being woken up.
		if (now - activeAt > SLEEP_AFTER) s.y.v += 2.5;
		activeAt = now;
	}

	/** @param {number} x @param {number} y Mouse position in the viewport, in pixels. */
	function look(x, y) {
		// Browsers also fire pointermove when the page moves under a still mouse; only real moves count.
		if (Math.hypot(x - pointer.x, y - pointer.y) < 2) return;
		wake();
		if (!touch) pointer = { x, y, at: performance.now() };
	}

	/** @param {number} x @param {number} y A tap on a touch screen, in viewport pixels. */
	function poke(x, y) {
		wake();
		pointer = { x, y, at: performance.now() };
	}

	/** @param {number} dy Pixels scrolled since the last call. */
	function scrolled(dy) {
		wake();
		read = { until: performance.now() + 900, dir: Math.sign(dy) };
	}

	/** @param {Cue} name */
	function cue(name) {
		wake();
		cued = { name, at: performance.now() };
		if (name === 'done') turns += 1;
		if (name === 'caught') turns += 2;
	}

	/** Moves out of the pointer's way, and back home once the pointer leaves. Returns the pointer relative to the cube. */
	function dodge(/** @type {number} */ now) {
		// offsetLeft ignores the translate, so this stays the home corner while it moves.
		const hx = canvas.offsetLeft + canvas.offsetWidth / 2;
		const hy = canvas.offsetTop + canvas.offsetHeight / 2;
		// Far spots would leave a phone screen at the large size, so they stop at its edge.
		const place = (/** @type {number[]} */ [x, y]) => [Math.max(x * scale, -canvas.offsetLeft), Math.max(y * scale, -canvas.offsetTop)];
		const from = (/** @type {number[]} */ p) => {
			const [x, y] = place(p);
			return Math.hypot(pointer.x - hx - x, pointer.y - hy - y);
		};
		// With something to offer it waits at home, so it can be clicked.
		if (offer || (touch && now - pointer.at > TOUCH_STAYS)) spot = SPOTS[0];
		else if (from(spot) < DODGE * scale) spot = SPOTS.reduce((a, b) => (from(b) > from(a) ? b : a));
		else if (spot !== SPOTS[0] && from(SPOTS[0]) > (DODGE + 40) * scale) spot = SPOTS[0];
		[s.ox.to, s.oy.to] = place(spot);
		return { x: pointer.x - hx - s.ox.x, y: pointer.y - hy - s.oy.x };
	}

	/** @param {Mood} mood */
	function react(mood) {
		wake();
		reaction = { mood, at: performance.now() };
		if (mood === 'happy') turns += 1;
	}

	/** @param {string} next */
	function setColor(next) {
		tint.set(next);
		gearMat.color.copy(tint);
	}

	function aim(/** @type {number} */ now) {
		const p = dodge(now);
		const d = Math.hypot(p.x, p.y) || 1;
		const reach = Math.min(1, d / 500);
		let dx = (p.x / d) * reach;
		let dy = (p.y / d) * reach;
		if (now < read.until) {
			// Reading along: it looks at the page, up or down with the scroll.
			dx = -0.55;
			dy = read.dir * 0.6;
		} else if (now - pointer.at > 5000) {
			// Nobody is moving the mouse: it scans the room slowly.
			dx = Math.sin(now / 2400) * 0.5;
			dy = -0.15;
		}
		s.yaw.to = REST.yaw + dx * 0.45 + turns * Math.PI * 2;
		s.pitch.to = REST.pitch + dy * 0.28;
		s.lookX.to = dx;
		s.lookY.to = dy;
	}

	function perform(/** @type {number} */ now) {
		const t = reaction ? (now - reaction.at) / 1000 : Infinity;
		const c = cued ? (now - cued.at) / 1000 : Infinity;
		const asleep = now - activeAt > SLEEP_AFTER;
		s.sleep.to = asleep ? 1 : 0;
		s.y.to = 0;
		s.roll.to = 0;
		s.happy.to = 0;
		s.sad.to = 0;
		s.glow.to = 0.85 + Math.min(streak.days, 10) * 0.035;
		s.focus.to = combo >= 3 ? 1 : 0;
		s.spin.to = combo >= 3 ? 3.2 : 0.25;
		if (cued?.name === 'glance' && c < 1.2) {
			// A new section: a quick look at the page.
			s.lookX.to = -0.75;
			s.yaw.to -= 0.25;
		}
		if (cued?.name === 'nod' && c < 1.1) s.pitch.to += Math.sin(c * 11.5) * 0.22 * (1 - c / 1.1);
		if (cued?.name === 'done' && c < 1.6) {
			// A victory loop around its spot, then a little cube drops by the ring.
			const a = (Math.min(c, 1.4) / 1.4) * Math.PI * 2;
			// Home sits in the bottom right corner, so the loop swings left, where there is room.
			s.ox.to += -(1 - Math.cos(a)) * 55 * scale;
			s.oy.to += -Math.sin(a) * 40 * scale;
			s.happy.to = 1;
			s.glow.to = 1.8;
		}
		if (cued?.name === 'caught' && c < 1.8) {
			// Caught: a double spin and a jump, then it shows its new star eyes.
			s.happy.to = 1;
			s.glow.to = 2;
			s.y.to = c < 0.6 ? 0.3 : 0.05;
		}
		if (cued?.name === 'done' && c >= 1.4 && !cued.dropped) {
			cued.dropped = true;
			dropCube(now);
		}
		if (reaction?.mood === 'happy' && t < 2.2) {
			s.happy.to = 1;
			s.glow.to = 1.8;
			s.y.to = t < 0.5 ? 0.22 : 0.05;
		} else if (reaction?.mood === 'sad' && t < 2.4) {
			s.sad.to = 1;
			s.glow.to = 0.55;
			s.y.to = -0.1;
			s.pitch.to += 0.18;
			s.lookY.to = 0.7;
			// A short head shake, like a quiet "no".
			s.yaw.to += t < 0.9 ? Math.sin(t * 14) * 0.16 * (1 - t / 0.9) : 0;
		}
		if (asleep) {
			s.y.to = -0.26;
			s.pitch.to = REST.pitch + 0.25;
			s.lookX.to = 0;
			s.lookY.to = 0.3;
			s.glow.to = 0.45 + 0.25 * Math.sin(now / 1600);
		}
		if (now > nextBlink && !asleep) {
			s.lid.to = 1;
			if (now > nextBlink + 90) {
				nextBlink = now + 2600 + Math.random() * 4000;
				s.lid.to = 0;
			}
		} else s.lid.to = 0;
	}

	/** One eye in the chosen style, centred on the origin. `h` is how open it is, from 0 to 1. */
	function eye(/** @type {number} */ side, /** @type {number} */ h, /** @type {number} */ sad) {
		ctx.beginPath();
		if (eyes === 'visor') {
			// One bar across both eyes, so only the left one draws it.
			if (side > 0) return;
			const bh = 26 * h;
			ctx.roundRect(-24, -bh / 2, 140, bh, bh / 2);
			ctx.fill();
			return;
		}
		ctx.rotate(side * -0.32 * sad);
		if (eyes === 'round') ctx.ellipse(0, 0, 22, 22 * h, 0, 0, Math.PI * 2);
		else if (eyes === 'square') ctx.roundRect(-20, -20 * h, 40, 40 * h, 6);
		else if (eyes === 'heart') {
			ctx.scale(1.5, 1.5 * Math.max(h, 0.01));
			ctx.moveTo(0, 18);
			ctx.bezierCurveTo(-30, -2, -18, -26, 0, -10);
			ctx.bezierCurveTo(18, -26, 30, -2, 0, 18);
		} else if (eyes === 'star') {
			ctx.scale(1, Math.max(h, 0.01));
			for (let i = 0; i < 10; i++) {
				const r = i % 2 ? 11 : 26;
				const a = (i * Math.PI) / 5 - Math.PI / 2;
				ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
			}
			ctx.closePath();
		} else {
			const eh = 54 * h;
			ctx.roundRect(-15, -eh / 2, 30, eh, Math.min(30, eh) / 2);
		}
		ctx.fill();
	}

	/** Eyes in the chosen style for idle, arcs for happy, slanted and dim for sad. */
	function drawFace(/** @type {number} */ now) {
		const glow = glowColor();
		const hex = `#${glow.getHexString()}`;
		ctx.clearRect(0, 0, FACE, FACE);
		ctx.save();
		ctx.beginPath();
		ctx.roundRect(4, 4, FACE - 8, FACE - 8, 34);
		const bg = ctx.createRadialGradient(FACE / 2, FACE / 2, 10, FACE / 2, FACE / 2, FACE * 0.7);
		bg.addColorStop(0, '#15191e');
		bg.addColorStop(1, '#090b0d');
		ctx.fillStyle = bg;
		ctx.fill();
		ctx.clip();

		if (outfit === 'architecture') {
			ctx.strokeStyle = hex;
			ctx.globalAlpha = 0.13;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			for (let x = 16; x < FACE; x += 24) {
				ctx.moveTo(x, 0);
				ctx.lineTo(x, FACE);
				ctx.moveTo(0, x);
				ctx.lineTo(FACE, x);
			}
			ctx.stroke();
		}

		const happy = Math.min(1, Math.max(0, s.happy.x));
		const sad = Math.min(1, Math.max(0, s.sad.x));
		const open = Math.max(0.06, 1 - s.lid.x);
		ctx.shadowColor = hex;
		ctx.shadowBlur = 22 * Math.max(0.3, s.glow.x);
		ctx.globalAlpha = Math.min(1, 0.45 + 0.55 * s.glow.x);
		ctx.fillStyle = ctx.strokeStyle = hex;
		ctx.lineCap = 'round';
		const sleep = Math.min(1, Math.max(0, s.sleep.x));
		const focus = Math.min(1, Math.max(0, s.focus.x));
		if (sleep > 0.5) {
			// Closed eyes, and a few z drifting up.
			ctx.lineWidth = 9;
			for (const side of [-1, 1]) {
				ctx.beginPath();
				ctx.arc(FACE / 2 + side * 46, FACE / 2 - 8, 18, Math.PI * 0.2, Math.PI * 0.8);
				ctx.stroke();
			}
			ctx.font = 'bold 30px system-ui, sans-serif';
			for (let i = 0; i < 3; i++) {
				const k = (now / 2600 + i / 3) % 1;
				ctx.globalAlpha = Math.sin(k * Math.PI) * 0.8;
				ctx.fillText('z', 170 + k * 34 + i * 4, 90 - k * 60);
			}
		}
		for (const side of sleep > 0.5 ? [] : [-1, 1]) {
			const cx = FACE / 2 + side * 46 + s.lookX.x * 22;
			const cy = FACE / 2 - 4 + s.lookY.x * 16;
			ctx.save();
			ctx.translate(cx, cy);
			// Hearts and stars stay themselves when happy, they just grow a little.
			const keepsShape = eyes === 'heart' || eyes === 'star';
			if (happy > 0.5 && !keepsShape) {
				ctx.lineWidth = 13;
				ctx.lineCap = 'round';
				ctx.beginPath();
				ctx.arc(0, 12, 20, Math.PI * 1.15, Math.PI * 1.85);
				ctx.stroke();
			} else {
				if (happy > 0.5) ctx.scale(1.2, 1.2);
				eye(side, open * (1 - 0.45 * sad) * (1 - 0.45 * focus), sad);
				if (focus > 0.5) {
					// A flat brow line: the look of someone on a roll.
					ctx.lineWidth = 7;
					ctx.beginPath();
					ctx.moveTo(-20, -26);
					ctx.lineTo(20, -26);
					ctx.stroke();
				}
			}
			ctx.restore();
		}
		if (offer) {
			// A badge in the corner, like an app with something waiting.
			ctx.globalAlpha = 1;
			ctx.shadowBlur = 14 + 10 * Math.sin(now / 400) ** 2;
			ctx.beginPath();
			ctx.arc(200, 58, 40, 0, Math.PI * 2);
			ctx.fill();
			ctx.shadowBlur = 0;
			ctx.fillStyle = '#090b0d';
			ctx.font = `bold ${offer.length > 2 ? 34 : 48}px system-ui, sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(offer, 200, 61);
			ctx.fillStyle = hex;
		}

		// Now and then a soft line sweeps the screen, like it is thinking.
		const scan = (now - nextScan) / 700;
		if (scan > 0 && scan < 1 && !still && sleep < 0.5) {
			ctx.shadowBlur = 0;
			ctx.globalAlpha = 0.18 * Math.sin(scan * Math.PI);
			ctx.fillRect(0, scan * FACE - 3, FACE, 6);
		} else if (scan >= 1) nextScan = now + 6000 + Math.random() * 6000;
		ctx.restore();
		faceTexture.needsUpdate = true;
	}

	function dropCube(/** @type {number} */ now) {
		if (drop) removeDrop();
		const mesh = new THREE.Mesh(
			new RoundedBoxGeometry(0.2, 0.2, 0.2, 3, 0.03),
			new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.4, clearcoat: 0.6, transparent: true })
		);
		mesh.castShadow = true;
		mesh.position.set(0.58, still ? GROUND + 0.1 : 1.1, 0.25);
		mesh.rotation.y = 0.6;
		scene.add(mesh);
		drop = { mesh, v: 0, at: now };
	}

	function removeDrop() {
		if (!drop) return;
		scene.remove(drop.mesh);
		drop.mesh.geometry.dispose();
		/** @type {THREE.Material} */ (drop.mesh.material).dispose();
		drop = undefined;
	}

	/** Falls, bounces twice, rests a few seconds and fades. */
	function moveDrop(/** @type {number} */ now, /** @type {number} */ dt) {
		if (!drop) return;
		const { mesh } = drop;
		const floor = GROUND + 0.1;
		drop.v -= 9 * dt;
		mesh.position.y += drop.v * dt;
		if (mesh.position.y < floor) {
			mesh.position.y = floor;
			drop.v = Math.abs(drop.v) > 0.6 ? -drop.v * 0.35 : 0;
		}
		const age = (now - drop.at) / 1000;
		/** @type {THREE.MeshPhysicalMaterial} */ (mesh.material).opacity = Math.max(0, Math.min(1, 7 - age));
		if (age > 7) removeDrop();
	}

	let last = performance.now();
	let frame = 0;
	function tick(/** @type {number} */ now) {
		frame = requestAnimationFrame(tick);
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;
		aim(now);
		perform(now);
		for (let left = dt; left > 0; left -= 1 / 240) for (const sp of springs) sp.step(Math.min(left, 1 / 240));
		if (still) for (const sp of springs) sp.x = sp.to;
		moveDrop(now, dt);

		const hover = still ? 0 : Math.sin(now / 1100) * 0.04 * (1 - Math.max(0, s.sleep.x));
		root.position.y = s.y.x + hover;
		// It leans into the direction it flies, and straightens up as it stops.
		root.rotation.z = s.roll.x + Math.max(-0.5, Math.min(0.5, (-s.ox.v * 0.0004) / scale));
		root.rotation.x = Math.max(-0.4, Math.min(0.4, (s.oy.v * 0.0004) / scale));
		body.rotation.set(s.pitch.x, s.yaw.x, 0, 'YXZ');
		canvas.style.translate = `${s.ox.x.toFixed(1)}px ${s.oy.x.toFixed(1)}px`;

		// The ring brightens as the cube comes closer and on a right answer.
		const near = 1 - (root.position.y + 0.1) / 0.5;
		ringMat.opacity = Math.min(1, (0.35 + 0.35 * near) * s.glow.x);
		if (!still) ring.rotation.z += s.spin.x * dt;
		if (!still) gear.rotation.z += dt * 0.8;
		halo.material.opacity = Math.min(1, (0.25 + 0.2 * near) * s.glow.x);
		if (streak.needsYou) {
			const pulse = Math.sin(now / 500) ** 2;
			led.material.color.set(NEEDS_YOU).multiplyScalar(0.5 + 0.5 * pulse);
			ringMat.color.copy(tint).lerp(amber, 0.4 + 0.6 * pulse);
			halo.material.color.copy(ringMat.color);
		} else {
			led.material.color.copy(tint).multiplyScalar(0.6 + 0.4 * Math.sin(now / 600) ** 2);
			ringMat.color.copy(tint);
			halo.material.color.copy(tint);
		}
		drawFace(now);
		renderer.render(scene, camera);
	}

	/** @param {number} px Side of the square canvas in CSS pixels. */
	function resize(px) {
		scale = px / 150;
		renderer.setSize(px, px, false);
	}

	const pause = () => {
		if (document.hidden) cancelAnimationFrame(frame);
		else {
			last = performance.now();
			frame = requestAnimationFrame(tick);
		}
	};
	document.addEventListener('visibilitychange', pause);
	frame = requestAnimationFrame(tick);

	return {
		look,
		poke,
		wake,
		scrolled,
		cue,
		/** @param {number} n Right answers in a row. */
		setCombo(n) {
			combo = n;
		},
		/** @param {{ days: number, needsYou: boolean }} next */
		setStreak(next) {
			streak = next;
		},
		/** @param {string | undefined} label Shown on the screen, for example the number of cards due. */
		setOffer(label) {
			offer = label;
		},
		/** @param {string} dojo The dojo id, or '' on the hub. */
		setOutfit(dojo) {
			outfit = dojo;
			gear.visible = dojo === 'devops';
		},
		/** @param {Eyes} next */
		setEyes(next) {
			eyes = next;
		},
		react,
		setColor,
		resize,
		dispose() {
			cancelAnimationFrame(frame);
			document.removeEventListener('visibilitychange', pause);
			scene.traverse((o) => {
				if (o instanceof THREE.Mesh) {
					o.geometry.dispose();
					o.material.map?.dispose();
					o.material.dispose();
				}
			});
			scene.environment?.dispose();
			renderer.dispose();
		}
	};
}

/** A soft round glow, for the light the ring throws on the ground. */
function radial() {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
	const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
	grad.addColorStop(0, 'rgba(255,255,255,0.9)');
	grad.addColorStop(0.45, 'rgba(255,255,255,0.25)');
	grad.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grad;
	g.fillRect(0, 0, 128, 128);
	return new THREE.CanvasTexture(c);
}

function gearGeometry() {
	const shape = new THREE.Shape();
	const teeth = 8;
	shape.moveTo(0.135, 0);
	for (let i = 0; i < teeth * 2; i++) {
		const r = i % 2 ? 0.1 : 0.135;
		const a0 = (i / (teeth * 2)) * Math.PI * 2;
		const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
		shape.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
		shape.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
	}
	const hole = new THREE.Path();
	hole.absarc(0, 0, 0.04, 0, Math.PI * 2, true);
	shape.holes.push(hole);
	return new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
}
