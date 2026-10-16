<script>
	import { onMount } from 'svelte';
	import { companion, react } from '#lib/companion.svelte.js';

	const SIZE = 52;
	// Resting angle: the top and two sides show, like the cubes everywhere else on the site.
	const REST = { x: -20, y: -32 };

	/** @type {HTMLElement | undefined} */
	let anchor = $state();
	let tilt = $state({ ...REST });
	let look = $state({ x: 0, y: 0 });
	let blink = $state(false);

	onMount(() => {
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		let target = { ...REST };
		let eyes = { x: 0, y: 0 };
		let frame = 0;

		// Eases toward the pointer instead of snapping, and stops the loop once it has caught up.
		function step() {
			const k = still ? 1 : 0.12;
			tilt = { x: tilt.x + (target.x - tilt.x) * k, y: tilt.y + (target.y - tilt.y) * k };
			look = { x: look.x + (eyes.x - look.x) * k * 1.5, y: look.y + (eyes.y - look.y) * k * 1.5 };
			const moving = Math.abs(target.x - tilt.x) + Math.abs(target.y - tilt.y) > 0.05;
			frame = moving ? requestAnimationFrame(step) : 0;
		}

		/** @param {PointerEvent} e */
		function follow(e) {
			if (!anchor) return;
			const r = anchor.getBoundingClientRect();
			const dx = e.clientX - (r.left + r.width / 2);
			const dy = e.clientY - (r.top + r.height / 2);
			const d = Math.hypot(dx, dy) || 1;
			// Far away the cube turns a little; the eyes do most of the looking.
			const reach = Math.min(1, d / 600);
			target = { x: REST.x - (dy / d) * 14 * reach, y: REST.y + (dx / d) * 22 * reach };
			eyes = { x: (dx / d) * reach, y: (dy / d) * reach };
			if (!frame) frame = requestAnimationFrame(step);
		}

		/** @type {ReturnType<typeof setTimeout>} */
		let timer;
		const blinkLater = () => {
			timer = setTimeout(() => {
				blink = true;
				setTimeout(() => (blink = false), 140);
				blinkLater();
			}, 2500 + Math.random() * 4000);
		};
		blinkLater();

		addEventListener('pointermove', follow, { passive: true });
		return () => {
			removeEventListener('pointermove', follow);
			cancelAnimationFrame(frame);
			clearTimeout(timer);
		};
	});

	const faces = ['front', 'back', 'right', 'left', 'top', 'bottom'];
</script>

<div bind:this={anchor} class="companion" style="--s: {SIZE}px" aria-hidden="true">
	<div class="bob">
		{#key companion.beat}
			<button class="react {companion.mood}" tabindex="-1" onclick={() => react(true)}>
				<div class="cube" style="transform: rotateX({tilt.x}deg) rotateY({tilt.y}deg)">
					{#each faces as f (f)}
						<div class="face {f}">
							{#if f === 'front'}
								<svg viewBox="-20 -20 40 40" class="size-full">
									{#each [-7, 7] as ex (ex)}
										<g transform="translate({ex + look.x * 2.2} {-3 + look.y * 2})">
											{#if companion.mood === 'happy'}
												<path d="M-3.2 1.2 Q0 -3.2 3.2 1.2" fill="none" stroke="var(--background)" stroke-width="1.9" stroke-linecap="round" />
											{:else}
												<ellipse rx="3.1" ry={blink ? 0.4 : 3.6} fill="var(--background)" />
												<circle r="1.6" cx={look.x * 1.1} cy={look.y * 1.1 + 0.3} fill="var(--foreground)" opacity={blink ? 0 : 1} />
											{/if}
											{#if companion.mood === 'sad'}
												<path d={ex < 0 ? 'M-3.5 -6 L2.5 -7.6' : 'M-2.5 -7.6 L3.5 -6'} stroke="var(--background)" stroke-width="1.5" stroke-linecap="round" />
											{/if}
										</g>
									{/each}
									<path
										d={companion.mood === 'happy' ? 'M-6 6 Q0 13 6 6' : companion.mood === 'sad' ? 'M-4.5 10 Q0 6 4.5 10' : 'M-3.5 7 Q0 9.5 3.5 7'}
										fill={companion.mood === 'happy' ? 'var(--background)' : 'none'}
										stroke="var(--background)"
										stroke-width="1.8"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
									{#if companion.mood === 'happy'}
										<circle cx="-11" cy="4.5" r="2.4" fill="var(--background)" opacity="0.35" />
										<circle cx="11" cy="4.5" r="2.4" fill="var(--background)" opacity="0.35" />
									{/if}
								</svg>
							{/if}
						</div>
					{/each}
				</div>
			</button>
		{/key}
	</div>
</div>

<style>
	.companion {
		position: fixed;
		right: 1.25rem;
		bottom: 5.5rem;
		z-index: 40;
		width: var(--s);
		height: var(--s);
		perspective: 500px;
		pointer-events: none;
	}
	.bob,
	.react,
	.cube {
		width: 100%;
		height: 100%;
		transform-style: preserve-3d;
	}
	.bob {
		animation: bob 3.2s ease-in-out infinite;
	}
	.react {
		display: block;
		pointer-events: auto;
		cursor: pointer;
		background: none;
		border: 0;
		padding: 0;
	}
	.react.happy {
		animation: hop 0.9s cubic-bezier(0.3, 0.7, 0.4, 1);
	}
	.react.sad {
		animation: droop 0.8s ease-in-out;
	}
	.face {
		position: absolute;
		inset: 0;
		border: 1.5px solid var(--background);
		border-radius: 6px;
		background: var(--brand);
		backface-visibility: hidden;
	}
	.front {
		transform: translateZ(calc(var(--s) / 2));
	}
	.back {
		transform: rotateY(180deg) translateZ(calc(var(--s) / 2));
	}
	.right {
		transform: rotateY(90deg) translateZ(calc(var(--s) / 2));
		background: color-mix(in oklch, var(--brand) 72%, black);
	}
	.left {
		transform: rotateY(-90deg) translateZ(calc(var(--s) / 2));
		background: color-mix(in oklch, var(--brand) 72%, black);
	}
	.top {
		transform: rotateX(90deg) translateZ(calc(var(--s) / 2));
		background: color-mix(in oklch, var(--brand) 60%, white);
	}
	.bottom {
		transform: rotateX(-90deg) translateZ(calc(var(--s) / 2));
	}
	.cube {
		position: relative;
	}
	/* A filter would flatten the 3D cube, so the shadow is its own blurred ellipse. */
	.companion::after {
		content: '';
		position: absolute;
		left: 15%;
		right: 15%;
		bottom: -18px;
		height: 8px;
		border-radius: 50%;
		background: oklch(0 0 0 / 0.14);
		filter: blur(3px);
	}

	@keyframes bob {
		50% {
			transform: translateY(-5px);
		}
	}
	@keyframes hop {
		35% {
			transform: translateY(-26px) rotateY(200deg) scale(1.05);
		}
		65% {
			transform: translateY(0) rotateY(360deg) scale(0.96, 1.04);
		}
		80% {
			transform: translateY(-6px) rotateY(360deg);
		}
		100% {
			transform: translateY(0) rotateY(360deg);
		}
	}
	@keyframes droop {
		20% {
			transform: translateY(3px) rotateZ(-9deg);
		}
		45% {
			transform: translateY(4px) rotateZ(8deg);
		}
		70% {
			transform: translateY(4px) rotateZ(-4deg);
		}
		100% {
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bob,
		.react.happy,
		.react.sad {
			animation: none;
		}
	}
</style>
