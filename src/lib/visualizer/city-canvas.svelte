<script lang="ts">
	import { onMount } from 'svelte';
	import type { RuntimeSnapshot } from '$lib/runtime/index.js';

	let {
		snapshot,
		lastAction = 'Listo para ejecutar.'
	}: { snapshot?: RuntimeSnapshot; lastAction?: string } = $props();
	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;
	let context: CanvasRenderingContext2D | null = null;
	let width = 0;
	let height = 0;
	let scale = 5.5;
	let centerAvenue = 50.5;
	let centerStreet = 50.5;
	let selected = $state<{ avenue: number; street: number }>();
	let dragging = false;
	let previous = { x: 0, y: 0 };
	let pointerStart = { x: 0, y: 0 };
	let cameraInitialized = false;

	onMount(() => {
		context = canvas.getContext('2d');
		const resize = new ResizeObserver(([entry]) => {
			width = entry.contentRect.width;
			height = entry.contentRect.height;
			const ratio = window.devicePixelRatio || 1;
			canvas.width = Math.round(width * ratio);
			canvas.height = Math.round(height * ratio);
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			context?.setTransform(ratio, 0, 0, ratio, 0, 0);
			draw();
		});
		resize.observe(container);
		return () => resize.disconnect();
	});

	$effect(() => {
		syncAndDraw(snapshot, selected);
	});

	function syncAndDraw(
		currentSnapshot: RuntimeSnapshot | undefined,
		currentSelection: { avenue: number; street: number } | undefined
	): void {
		if (currentSnapshot === undefined) cameraInitialized = false;
		const robot = currentSnapshot?.robots[0];
		if (robot !== undefined && !cameraInitialized) {
			centerAvenue = robot.state.position.avenue;
			centerStreet = robot.state.position.street;
			scale = 16;
			cameraInitialized = true;
		}
		draw(currentSnapshot, currentSelection);
	}

	function draw(
		currentSnapshot: RuntimeSnapshot | undefined = snapshot,
		currentSelection: { avenue: number; street: number } | undefined = selected
	): void {
		if (context === null || width === 0 || height === 0) return;
		context.clearRect(0, 0, width, height);
		context.fillStyle = '#f7f4ed';
		context.fillRect(0, 0, width, height);
		const bounds = visibleBounds();
		context.strokeStyle = '#d9d3c5';
		context.lineWidth = 1;
		context.beginPath();
		for (let avenue = bounds.minAvenue; avenue <= bounds.maxAvenue; avenue++) {
			const x = screenX(avenue);
			context.moveTo(x, 0);
			context.lineTo(x, height);
		}
		for (let street = bounds.minStreet; street <= bounds.maxStreet; street++) {
			const y = screenY(street);
			context.moveTo(0, y);
			context.lineTo(width, y);
		}
		context.stroke();

		if (currentSelection !== undefined) {
			context.fillStyle = 'rgba(216, 155, 52, .22)';
			context.beginPath();
			context.arc(
				screenX(currentSelection.avenue),
				screenY(currentSelection.street),
				10,
				0,
				Math.PI * 2
			);
			context.fill();
		}
		for (const [coordinate, contents] of currentSnapshot?.corners ?? [])
			drawObjects(coordinate, contents);
		for (const robot of currentSnapshot?.robots ?? []) drawRobot(robot.state);
	}

	function drawObjects(
		coordinate: { avenue: number; street: number },
		contents: { flowers: number; papers: number }
	): void {
		if (context === null) return;
		const x = screenX(coordinate.avenue);
		const y = screenY(coordinate.street);
		if (contents.flowers > 0) {
			context.fillStyle = '#d55270';
			context.beginPath();
			context.arc(x - 7, y - 7, 4, 0, Math.PI * 2);
			context.fill();
		}
		if (contents.papers > 0) {
			context.fillStyle = '#3d77a8';
			context.fillRect(x + 3, y - 11, 8, 8);
		}
		context.fillStyle = '#413d36';
		context.font = '10px Inter, sans-serif';
		if (contents.flowers > 1) context.fillText(String(contents.flowers), x - 14, y - 10);
		if (contents.papers > 1) context.fillText(String(contents.papers), x + 12, y - 5);
	}

	function drawRobot(robot: RuntimeSnapshot['robots'][number]['state']): void {
		if (context === null) return;
		const x = screenX(robot.position.avenue);
		const y = screenY(robot.position.street);
		const angles = { north: -Math.PI / 2, east: 0, south: Math.PI / 2, west: Math.PI };
		context.save();
		context.translate(x, y);
		context.rotate(angles[robot.orientation]);
		context.fillStyle = robot.status === 'failed' ? '#b63b3b' : '#2f6656';
		context.beginPath();
		context.moveTo(12, 0);
		context.lineTo(-8, -8);
		context.lineTo(-5, 0);
		context.lineTo(-8, 8);
		context.closePath();
		context.fill();
		context.restore();
	}

	function onWheel(event: WheelEvent): void {
		event.preventDefault();
		const before = worldAt(event.offsetX, event.offsetY);
		scale = Math.max(3, Math.min(24, scale * (event.deltaY < 0 ? 1.15 : 0.87)));
		const after = worldAt(event.offsetX, event.offsetY);
		centerAvenue += before.avenue - after.avenue;
		centerStreet += before.street - after.street;
		draw();
	}

	function pointerDown(event: PointerEvent): void {
		dragging = true;
		previous = { x: event.clientX, y: event.clientY };
		pointerStart = previous;
		canvas.setPointerCapture(event.pointerId);
	}

	function pointerMove(event: PointerEvent): void {
		if (!dragging) return;
		centerAvenue -= (event.clientX - previous.x) / scale;
		centerStreet += (event.clientY - previous.y) / scale;
		previous = { x: event.clientX, y: event.clientY };
		draw();
	}

	function pointerUp(event: PointerEvent): void {
		const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
		dragging = false;
		canvas.releasePointerCapture(event.pointerId);
		if (moved < 3) {
			const rect = canvas.getBoundingClientRect();
			const world = worldAt(event.clientX - rect.left, event.clientY - rect.top);
			selected = {
				avenue: Math.max(1, Math.min(100, Math.round(world.avenue))),
				street: Math.max(1, Math.min(100, Math.round(world.street)))
			};
		}
	}

	function visibleBounds() {
		return {
			minAvenue: Math.max(1, Math.floor(centerAvenue - width / scale / 2) - 1),
			maxAvenue: Math.min(100, Math.ceil(centerAvenue + width / scale / 2) + 1),
			minStreet: Math.max(1, Math.floor(centerStreet - height / scale / 2) - 1),
			maxStreet: Math.min(100, Math.ceil(centerStreet + height / scale / 2) + 1)
		};
	}

	const screenX = (avenue: number) => width / 2 + (avenue - centerAvenue) * scale;
	const screenY = (street: number) => height / 2 - (street - centerStreet) * scale;
	const worldAt = (x: number, y: number) => ({
		avenue: centerAvenue + (x - width / 2) / scale,
		street: centerStreet - (y - height / 2) / scale
	});
</script>

<div class="relative h-full min-h-[300px] overflow-hidden bg-[#f7f4ed]" bind:this={container}>
	<canvas
		bind:this={canvas}
		class="block touch-none cursor-grab active:cursor-grabbing"
		onwheel={onWheel}
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
	></canvas>
	<div
		class="pointer-events-none absolute top-3 left-3 rounded-md border bg-white/90 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur"
	>
		{selected
			? `Esquina (${selected.avenue}, ${selected.street})`
			: 'Rueda: zoom · Arrastrar: mover'}
	</div>
	<p class="sr-only" aria-live="polite">{lastAction}</p>
</div>
