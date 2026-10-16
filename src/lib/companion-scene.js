import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** @typedef {'idle' | 'happy' | 'sad'} Mood */

/** A damped spring: every motion eases in, overshoots a little and settles, like a soft toy. */
function spring(stiffness = 170, damping = 18, x = 0) {
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

// The resting pose shows the top and the right side, like the flat cubes on the site.
const REST = { yaw: -0.5, pitch: 0.32 };

/**
 * Draws the companion into `canvas` and animates it until `dispose` is called.
 * @param {HTMLCanvasElement} canvas
 * @param {{ color: string, still: boolean }} options
 */
export function createScene(canvas, { color, still }) {
	const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	// Neutral keeps the dojo's color close to its hex; filmic curves wash it out to pastel.
	renderer.toneMapping = THREE.NeutralToneMapping;
	renderer.toneMappingExposure = 0.9;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;

	const scene = new THREE.Scene();
	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	scene.environmentIntensity = 0.55;
	pmrem.dispose();

	const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
	camera.position.set(0, 0.55, 4.6);
	camera.lookAt(0, 0.05, 0);

	const sun = new THREE.DirectionalLight(0xffffff, 1.6);
	sun.position.set(1.5, 4, 2.5);
	sun.castShadow = true;
	sun.shadow.mapSize.set(512, 512);
	sun.shadow.radius = 6;
	Object.assign(sun.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 10 });
	scene.add(sun, new THREE.HemisphereLight(0xfff6ea, 0x8a7f74, 0.5));

	const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.16 }));
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -0.62;
	ground.receiveShadow = true;
	scene.add(ground);

	// root moves and squashes, body turns: squash stays vertical while the cube spins.
	const root = new THREE.Group();
	const body = new THREE.Group();
	root.add(body);
	scene.add(root);

	const skin = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35, sheen: 0.3 });
	const cube = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 6, 0.17), skin);
	cube.castShadow = true;
	body.add(cube);

	const white = new THREE.MeshPhysicalMaterial({ color: 0xfbf8f3, roughness: 0.18, clearcoat: 1 });
	const ink = new THREE.MeshPhysicalMaterial({ color: 0x2a2622, roughness: 0.15, clearcoat: 1 });
	const blush = new THREE.MeshBasicMaterial({ color: 0xff8f8f, transparent: true, opacity: 0, depthWrite: false });

	const eyes = [-0.19, 0.19].map((x) => {
		const socket = new THREE.Group();
		socket.position.set(x, 0.09, 0.5);
		const ball = new THREE.Mesh(new THREE.SphereGeometry(0.115, 32, 16), white);
		ball.scale.set(1, 1.18, 0.42);
		const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.058, 24, 12), ink);
		pupil.scale.z = 0.5;
		const glint = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
		socket.add(ball, pupil, glint);
		body.add(socket);
		return { socket, pupil, glint };
	});

	const cheeks = [-0.3, 0.3].map((x) => {
		const c = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), blush);
		c.position.set(x, -0.08, 0.503);
		body.add(c);
		return c;
	});

	const mouth = new THREE.Mesh(new THREE.BufferGeometry(), ink);
	body.add(mouth);
	let drawn = { smile: NaN, open: NaN };
	function shapeMouth(/** @type {number} */ smile, /** @type {number} */ open) {
		if (Math.abs(smile - drawn.smile) < 0.01 && Math.abs(open - drawn.open) < 0.01) return;
		drawn = { smile, open };
		const w = 0.12 + 0.03 * Math.max(0, smile);
		const curve = new THREE.QuadraticBezierCurve3(
			new THREE.Vector3(-w, -0.15, 0.505),
			new THREE.Vector3(0, -0.15 - 0.13 * smile, 0.505),
			new THREE.Vector3(w, -0.15, 0.505)
		);
		mouth.geometry.dispose();
		mouth.geometry = new THREE.TubeGeometry(curve, 24, 0.022 + 0.022 * open, 10, false);
	}

	const s = {
		yaw: spring(90, 13, REST.yaw),
		pitch: spring(90, 13, REST.pitch),
		roll: spring(120, 9),
		y: spring(160, 11),
		squash: spring(260, 12),
		lookX: spring(140, 16),
		lookY: spring(140, 16),
		lid: spring(400, 30),
		smile: spring(80, 12, 0.35),
		open: spring(80, 12),
		blush: spring(60, 12)
	};
	const springs = Object.values(s);

	let pointer = { x: 0, y: 0, at: performance.now() };
	/** @type {{ mood: Mood, at: number } | undefined} */
	let reaction;
	let spins = 0;
	let nextBlink = performance.now() + 2500;
	let nextGlance = 0;

	/** @param {number} x @param {number} y Pointer position relative to the cube, in pixels. */
	function look(x, y) {
		pointer = { x, y, at: performance.now() };
	}

	/** @param {Mood} mood */
	function react(mood) {
		reaction = { mood, at: performance.now() };
		if (mood === 'happy') spins += 1;
	}

	/** @param {string} next */
	function setColor(next) {
		skin.color.set(next);
	}

	function aim(/** @type {number} */ now) {
		const d = Math.hypot(pointer.x, pointer.y) || 1;
		const reach = Math.min(1, d / 500);
		let dx = (pointer.x / d) * reach;
		let dy = (pointer.y / d) * reach;
		// A pointer that has not moved for a while gets a lazy look around instead.
		if (now - pointer.at > 4000) {
			if (now > nextGlance) nextGlance = now + 1800 + Math.random() * 2500;
			const phase = Math.floor(nextGlance / 1000) % 3;
			dx = [-0.6, 0.5, 0][phase];
			dy = [0.1, -0.2, 0.3][phase];
		}
		s.yaw.to = REST.yaw + dx * 0.55 + spins * Math.PI * 2;
		s.pitch.to = REST.pitch + dy * 0.35;
		s.lookX.to = dx;
		s.lookY.to = -dy;
	}

	/** Moods are short scripts over time: anticipation, action, settle. */
	function perform(/** @type {number} */ now) {
		const t = reaction ? (now - reaction.at) / 1000 : Infinity;
		s.y.to = 0;
		s.squash.to = 0;
		s.roll.to = 0;
		s.smile.to = 0.35;
		s.open.to = 0;
		s.blush.to = 0;
		if (reaction?.mood === 'happy' && t < 2.4) {
			s.smile.to = 1;
			s.open.to = 0.7;
			s.blush.to = 1;
			if (t < 0.14) s.squash.to = 0.22;
			else if (t < 0.42) {
				s.y.to = 0.75;
				s.squash.to = -0.14;
			} else if (t < 0.62) s.squash.to = 0.18;
		} else if (reaction?.mood === 'sad' && t < 2.6) {
			s.smile.to = -0.75;
			s.y.to = -0.07;
			s.squash.to = 0.08;
			s.pitch.to += 0.22;
			s.lookY.to = -0.8;
			s.roll.to = t < 0.25 ? -0.22 : t < 0.55 ? 0.17 : t < 0.85 ? -0.08 : 0;
		}
		const sleepy = reaction?.mood === 'sad' && t < 2.6 ? 0.42 : 0;
		if (now > nextBlink) {
			s.lid.to = 1;
			if (now > nextBlink + 110) {
				nextBlink = now + 2200 + Math.random() * 4000;
				s.lid.to = sleepy;
			}
		} else s.lid.to = sleepy;
	}

	let last = performance.now();
	let frame = 0;
	function tick(/** @type {number} */ now) {
		frame = requestAnimationFrame(tick);
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;
		aim(now);
		perform(now);
		// Small fixed steps keep the springs stable when a frame comes late.
		for (let left = dt; left > 0; left -= 1 / 240) for (const sp of springs) sp.step(Math.min(left, 1 / 240));
		if (still) for (const sp of springs) sp.x = sp.to;

		const breathe = still ? 0 : Math.sin(now / 900) * 0.012;
		const float = still ? 0 : Math.sin(now / 1300) * 0.035;
		root.position.y = s.y.x + float;
		root.scale.set(1 + s.squash.x * 0.5 + breathe, 1 - s.squash.x + breathe, 1 + s.squash.x * 0.5 + breathe);
		root.rotation.z = s.roll.x;
		body.rotation.set(s.pitch.x, s.yaw.x, 0, 'YXZ');

		for (const e of eyes) {
			e.socket.scale.y = Math.max(0.08, 1 - 0.92 * s.lid.x);
			e.pupil.position.set(s.lookX.x * 0.045, s.lookY.x * 0.05 - 0.005, 0.03);
			e.glint.position.set(e.pupil.position.x + 0.022, e.pupil.position.y + 0.025, 0.06);
		}
		blush.opacity = Math.max(0, s.blush.x) * 0.55;
		for (const c of cheeks) c.visible = blush.opacity > 0.01;
		shapeMouth(s.smile.x, Math.max(0, s.open.x));
		renderer.render(scene, camera);
	}

	/** @param {number} w @param {number} h CSS pixels. */
	function resize(w, h) {
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
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
				if (o instanceof THREE.Mesh) o.geometry.dispose();
			});
			for (const m of [skin, white, ink, blush]) m.dispose();
			scene.environment?.dispose();
			renderer.dispose();
		}
	};
}
