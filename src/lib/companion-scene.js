import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** @typedef {'idle' | 'happy' | 'sad'} Mood */

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
const FACE = 256;

/**
 * Draws the companion into `canvas` and animates it until `dispose` is called.
 * @param {HTMLCanvasElement} canvas
 * @param {{ color: string, still: boolean }} options
 */
export function createScene(canvas, { color, still }) {
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
	ground.position.y = -0.82;
	ground.receiveShadow = true;
	scene.add(ground);

	const tint = new THREE.Color(color);
	const glowColor = () => tint.clone().lerp(new THREE.Color(0xffffff), 0.3);

	// A light ring on the ground: the cube hovers over it instead of sitting.
	const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.011, 8, 96), new THREE.MeshBasicMaterial({ color: tint, transparent: true }));
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

	// A status light on top, the same color as the eyes.
	const led = new THREE.Mesh(new THREE.CircleGeometry(0.035, 24), new THREE.MeshBasicMaterial({ color: tint, toneMapped: false }));
	led.rotation.x = -Math.PI / 2;
	led.position.set(0.3, 0.502, 0.3);
	body.add(led);

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
		oy: spring(70, 14)
	};
	const springs = Object.values(s);

	let scale = 1;
	let pointer = { x: -1e4, y: -1e4, at: performance.now() };
	let spot = SPOTS[0];
	/** @type {{ mood: Mood, at: number } | undefined} */
	let reaction;
	let turns = 0;
	let nextBlink = performance.now() + 2500;
	let nextScan = performance.now() + 5000;

	/** @param {number} x @param {number} y Pointer position in the viewport, in pixels. */
	function look(x, y) {
		pointer = { x, y, at: performance.now() };
	}

	/** Moves out of the pointer's way, and back home once the pointer leaves. Returns the pointer relative to the cube. */
	function dodge() {
		// offsetLeft ignores the translate, so this stays the home corner while it moves.
		const hx = canvas.offsetLeft + canvas.offsetWidth / 2;
		const hy = canvas.offsetTop + canvas.offsetHeight / 2;
		// Far spots would leave a phone screen at the large size, so they stop at its edge.
		const place = (/** @type {number[]} */ [x, y]) => [Math.max(x * scale, -canvas.offsetLeft), Math.max(y * scale, -canvas.offsetTop)];
		const from = (/** @type {number[]} */ p) => {
			const [x, y] = place(p);
			return Math.hypot(pointer.x - hx - x, pointer.y - hy - y);
		};
		if (from(spot) < DODGE * scale) spot = SPOTS.reduce((a, b) => (from(b) > from(a) ? b : a));
		else if (spot !== SPOTS[0] && from(SPOTS[0]) > (DODGE + 40) * scale) spot = SPOTS[0];
		[s.ox.to, s.oy.to] = place(spot);
		return { x: pointer.x - hx - s.ox.x, y: pointer.y - hy - s.oy.x };
	}

	/** @param {Mood} mood */
	function react(mood) {
		reaction = { mood, at: performance.now() };
		if (mood === 'happy') turns += 1;
	}

	/** @param {string} next */
	function setColor(next) {
		tint.set(next);
		ring.material.color.copy(tint);
		halo.material.color.copy(tint);
		led.material.color.copy(tint);
	}

	function aim(/** @type {number} */ now) {
		const p = dodge();
		const d = Math.hypot(p.x, p.y) || 1;
		const reach = Math.min(1, d / 500);
		let dx = (p.x / d) * reach;
		let dy = (p.y / d) * reach;
		if (now - pointer.at > 5000) {
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
		s.y.to = 0;
		s.roll.to = 0;
		s.happy.to = 0;
		s.sad.to = 0;
		s.glow.to = 1;
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
		if (now > nextBlink) {
			s.lid.to = 1;
			if (now > nextBlink + 90) {
				nextBlink = now + 2600 + Math.random() * 4000;
				s.lid.to = 0;
			}
		} else s.lid.to = 0;
	}

	/** Pill eyes for idle, arcs for happy, slanted and dim for sad. */
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

		const happy = Math.min(1, Math.max(0, s.happy.x));
		const sad = Math.min(1, Math.max(0, s.sad.x));
		const open = Math.max(0.06, 1 - s.lid.x);
		ctx.shadowColor = hex;
		ctx.shadowBlur = 22 * Math.max(0.3, s.glow.x);
		ctx.globalAlpha = Math.min(1, 0.45 + 0.55 * s.glow.x);
		ctx.fillStyle = ctx.strokeStyle = hex;
		for (const side of [-1, 1]) {
			const cx = FACE / 2 + side * 46 + s.lookX.x * 22;
			const cy = FACE / 2 - 4 + s.lookY.x * 16;
			ctx.save();
			ctx.translate(cx, cy);
			if (happy > 0.5) {
				ctx.lineWidth = 13;
				ctx.lineCap = 'round';
				ctx.beginPath();
				ctx.arc(0, 12, 20, Math.PI * 1.15, Math.PI * 1.85);
				ctx.stroke();
			} else {
				ctx.rotate(side * -0.32 * sad);
				const w = 30;
				const h = 54 * open * (1 - 0.45 * sad);
				ctx.beginPath();
				ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) / 2);
				ctx.fill();
			}
			ctx.restore();
		}

		// Now and then a soft line sweeps the screen, like it is thinking.
		const scan = (now - nextScan) / 700;
		if (scan > 0 && scan < 1 && !still) {
			ctx.shadowBlur = 0;
			ctx.globalAlpha = 0.18 * Math.sin(scan * Math.PI);
			ctx.fillRect(0, scan * FACE - 3, FACE, 6);
		} else if (scan >= 1) nextScan = now + 6000 + Math.random() * 6000;
		ctx.restore();
		faceTexture.needsUpdate = true;
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

		const hover = still ? 0 : Math.sin(now / 1100) * 0.04;
		root.position.y = s.y.x + hover;
		// It leans into the direction it flies, and straightens up as it stops.
		root.rotation.z = s.roll.x + Math.max(-0.5, Math.min(0.5, (-s.ox.v * 0.0004) / scale));
		root.rotation.x = Math.max(-0.4, Math.min(0.4, (s.oy.v * 0.0004) / scale));
		body.rotation.set(s.pitch.x, s.yaw.x, 0, 'YXZ');
		canvas.style.translate = `${s.ox.x.toFixed(1)}px ${s.oy.x.toFixed(1)}px`;

		// The ring brightens as the cube comes closer and on a right answer.
		const near = 1 - (root.position.y + 0.1) / 0.5;
		ring.material.opacity = Math.min(1, (0.35 + 0.35 * near) * s.glow.x);
		halo.material.opacity = Math.min(1, (0.25 + 0.2 * near) * s.glow.x);
		led.material.color.copy(tint).multiplyScalar(0.6 + 0.4 * Math.sin(now / 600) ** 2);
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
