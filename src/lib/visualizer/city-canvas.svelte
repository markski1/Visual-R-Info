<script lang="ts">
	import { onMount } from 'svelte';
	import type { Coordinate, RuntimeSnapshot } from '$lib/runtime/index.js';

	let {
		snapshot,
		lastAction = 'Listo para ejecutar.',
		theme,
		trail = [],
		onselect
	}: {
		snapshot?: RuntimeSnapshot;
		lastAction?: string;
		theme: 'light' | 'dark' | 'system';
		trail?: readonly { robotId: string; from: Coordinate; to: Coordinate }[];
		onselect?: (coordinate: Coordinate) => void;
	} = $props();
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
			syncAndDraw(snapshot, selected, theme, trail);
		});
		resize.observe(container);
		return () => resize.disconnect();
	});

	$effect(() => {
		syncAndDraw(snapshot, selected, theme, trail);
	});

	function syncAndDraw(
		currentSnapshot: RuntimeSnapshot | undefined,
		currentSelection: { avenue: number; street: number } | undefined,
		currentTheme: 'light' | 'dark' | 'system',
		currentTrail: readonly { robotId: string; from: Coordinate; to: Coordinate }[]
	): void {
		container.dataset.theme = currentTheme;
		if (currentSnapshot === undefined) cameraInitialized = false;
		if (currentSnapshot?.robots.length && !cameraInitialized && width > 0 && height > 0) {
			initializeCamera(currentSnapshot);
		}
		draw(currentSnapshot, currentSelection, currentTrail);
	}

	function initializeCamera(currentSnapshot: RuntimeSnapshot): void {
		const positions = currentSnapshot.robots.map(({ state }) => state.position);
		const avenues = positions.map(({ avenue }) => avenue);
		const streets = positions.map(({ street }) => street);
		const minAvenue = Math.min(...avenues);
		const maxAvenue = Math.max(...avenues);
		const minStreet = Math.min(...streets);
		const maxStreet = Math.max(...streets);
		centerAvenue = (minAvenue + maxAvenue) / 2;
		centerStreet = (minStreet + maxStreet) / 2;
		if (positions.length === 1) {
			scale = 16;
		} else {
			const avenueSpan = maxAvenue - minAvenue;
			const streetSpan = maxStreet - minStreet;
			const horizontalFit = (width - 64) / (avenueSpan + 6);
			const verticalFit = (height - 64) / (streetSpan + 6);
			scale = Math.max(3, Math.min(11, horizontalFit, verticalFit));
		}
		cameraInitialized = true;
	}

	function draw(
		currentSnapshot: RuntimeSnapshot | undefined = snapshot,
		currentSelection: { avenue: number; street: number } | undefined = selected,
		currentTrail: readonly { robotId: string; from: Coordinate; to: Coordinate }[] = trail
	): void {
		if (context === null || width === 0 || height === 0) return;
		context.clearRect(0, 0, width, height);
		context.fillStyle = color('--card');
		context.fillRect(0, 0, width, height);
		const bounds = visibleBounds();
		const cityLeft = Math.min(screenX(1), screenX(100));
		const cityRight = Math.max(screenX(1), screenX(100));
		const cityTop = Math.min(screenY(1), screenY(100));
		const cityBottom = Math.max(screenY(1), screenY(100));
		context.save();
		context.beginPath();
		context.rect(cityLeft, cityTop, cityRight - cityLeft, cityBottom - cityTop);
		context.clip();
		context.strokeStyle = color('--border');
		context.lineWidth = 1;
		context.beginPath();
		for (let avenue = bounds.minAvenue; avenue <= bounds.maxAvenue; avenue++) {
			const x = screenX(avenue);
			context.moveTo(x, cityTop);
			context.lineTo(x, cityBottom);
		}
		for (let street = bounds.minStreet; street <= bounds.maxStreet; street++) {
			const y = screenY(street);
			context.moveTo(cityLeft, y);
			context.lineTo(cityRight, y);
		}
		context.stroke();
		context.restore();
		context.strokeStyle = color('--muted-foreground');
		context.lineWidth = 2;
		context.strokeRect(cityLeft, cityTop, cityRight - cityLeft, cityBottom - cityTop);
		drawAreas(currentSnapshot);

		if (currentSelection !== undefined) {
			context.fillStyle = color('--accent');
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
		drawTrail(currentSnapshot, currentTrail);
		for (const [coordinate, contents] of currentSnapshot?.corners ?? [])
			drawObjects(coordinate, contents);
		for (const robot of currentSnapshot?.robots ?? []) drawRobot(robot, currentSnapshot);
	}

	function drawAreas(currentSnapshot: RuntimeSnapshot | undefined): void {
		if (context === null) return;
		context.save();
		context.lineWidth = 3;
		context.font = '600 11px "JetBrains Mono", monospace';
		for (const [index, area] of (currentSnapshot?.areas ?? []).entries()) {
			const left = screenX(area.minAvenue);
			const right = screenX(area.maxAvenue);
			const top = screenY(area.maxStreet);
			const bottom = screenY(area.minStreet);
			const areaColor = color(`--area-${(index % 5) + 1}`);
			context.strokeStyle = areaColor;
			context.strokeRect(left, top, right - left, bottom - top);
			context.fillStyle = areaColor;
			context.fillText(area.name, left + 5, top + 14);
		}
		context.restore();
	}

	function drawTrail(
		currentSnapshot: RuntimeSnapshot | undefined,
		currentTrail: readonly { robotId: string; from: Coordinate; to: Coordinate }[]
	): void {
		if (context === null) return;
		context.save();
		context.lineWidth = 3;
		context.lineCap = 'round';
		context.lineJoin = 'round';
		for (const segment of currentTrail) {
			context.strokeStyle = robotColor(segment.robotId, currentSnapshot);
			context.beginPath();
			context.moveTo(screenX(segment.from.avenue), screenY(segment.from.street));
			context.lineTo(screenX(segment.to.avenue), screenY(segment.to.street));
			context.stroke();
		}
		context.restore();
	}

	function drawObjects(
		coordinate: { avenue: number; street: number },
		contents: { flowers: number; papers: number }
	): void {
		if (context === null) return;
		const x = screenX(coordinate.avenue);
		const y = screenY(coordinate.street);
		const both = contents.flowers > 0 && contents.papers > 0;
		const fontSize = Math.max(13, Math.min(19, scale));
		context.font = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		if (contents.flowers > 0) {
			context.fillText('🌸', x + (both ? -fontSize * 0.35 : 0), y);
		}
		if (contents.papers > 0) {
			context.fillText('📄', x + (both ? fontSize * 0.35 : 0), y);
		}
		context.fillStyle = color('--foreground');
		context.font = '600 9px Inter, sans-serif';
		context.textAlign = 'left';
		context.textBaseline = 'alphabetic';
		if (contents.flowers > 1)
			context.fillText(String(contents.flowers), x - fontSize, y - fontSize * 0.55);
		if (contents.papers > 1)
			context.fillText(String(contents.papers), x + fontSize * 0.45, y - fontSize * 0.55);
	}

	function drawRobot(
		robot: RuntimeSnapshot['robots'][number],
		currentSnapshot: RuntimeSnapshot | undefined
	): void {
		if (context === null) return;
		const x = screenX(robot.state.position.avenue);
		const y = screenY(robot.state.position.street);
		const angles = { north: -Math.PI / 2, east: 0, south: Math.PI / 2, west: Math.PI };
		context.save();
		context.translate(x, y);
		context.rotate(angles[robot.state.orientation]);
		context.fillStyle =
			robot.state.status === 'failed'
				? color('--destructive')
				: robotColor(robot.id, currentSnapshot);
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
			onselect?.(selected);
		}
	}

	function onKeydown(event: KeyboardEvent): void {
		const pan = 3;
		if (event.key === 'ArrowLeft') centerAvenue -= pan;
		else if (event.key === 'ArrowRight') centerAvenue += pan;
		else if (event.key === 'ArrowUp') centerStreet += pan;
		else if (event.key === 'ArrowDown') centerStreet -= pan;
		else if (event.key === '+' || event.key === '=') scale = Math.min(24, scale * 1.15);
		else if (event.key === '-') scale = Math.max(3, scale * 0.87);
		else return;
		event.preventDefault();
		cameraInitialized = true;
		draw();
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

	function color(variable: string): string {
		return getComputedStyle(container).getPropertyValue(variable).trim();
	}

	function robotColor(robotId: string, currentSnapshot: RuntimeSnapshot | undefined): string {
		const index = Math.max(0, currentSnapshot?.robots.findIndex(({ id }) => id === robotId) ?? 0);
		return color(`--robot-${(index % 5) + 1}`);
	}

	export function focusRobot(robotId: string): void {
		const robot = snapshot?.robots.find(({ id }) => id === robotId);
		if (robot === undefined) return;
		centerAvenue = robot.state.position.avenue;
		centerStreet = robot.state.position.street;
		cameraInitialized = true;
		draw();
	}
</script>

<div class="bg-card relative h-full min-h-[300px] overflow-hidden lg:min-h-0" bind:this={container}>
	<canvas
		bind:this={canvas}
		class="block touch-none cursor-grab outline-none focus-visible:ring-ring active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-inset"
		tabindex="0"
		aria-label="Ciudad de R-Info"
		aria-describedby="city-keyboard-help"
		onwheel={onWheel}
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		onkeydown={onKeydown}
	></canvas>
	<div
		class="bg-popover/90 text-popover-foreground pointer-events-none absolute top-3 left-3 rounded-md border px-2.5 py-1.5 text-xs shadow-sm backdrop-blur"
	>
		{selected
			? `Esquina (${selected.avenue}, ${selected.street})`
			: 'Rueda: zoom · Arrastrar: mover'}
	</div>
	<p id="city-keyboard-help" class="sr-only">
		Usá las flechas para desplazar la ciudad y más o menos para cambiar el zoom.
	</p>
	<p class="sr-only" aria-live="polite">{lastAction}</p>
</div>
