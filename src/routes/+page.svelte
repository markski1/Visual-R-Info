<script lang="ts">
	import {
		Bot,
		Check,
		ExternalLink,
		FolderOpen,
		Monitor,
		Moon,
		Pause,
		Play,
		RotateCcw,
		Save,
		Settings,
		StepForward,
		Sun,
		Terminal,
		X
	} from '@lucide/svelte';
	import { onDestroy, onMount } from 'svelte';

	import CodeEditor from '$lib/editor/code-editor.svelte';
	import { DEFAULT_EXAMPLE, EXAMPLE_PROGRAMS } from '$lib/examples.js';
	import CityCanvas from '$lib/visualizer/city-canvas.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		analyze,
		type AnalysisResult,
		type Diagnostic,
		type SourceSpan
	} from '$lib/language/index.js';
	import {
		createRuntime,
		type Coordinate,
		type RInfoRuntime,
		type RuntimeEvent,
		type RuntimeSnapshot,
		type ScenarioCorner
	} from '$lib/runtime/index.js';

	const STORAGE_KEY = 'visual-r-info-workspace-v1';
	type TrailSegment = { robotId: string; from: Coordinate; to: Coordinate };

	let source = $state(DEFAULT_EXAMPLE.source);
	let analysis: AnalysisResult = $state(analyze(DEFAULT_EXAMPLE.source));
	let runtime: RInfoRuntime | undefined = $state();
	let snapshot: RuntimeSnapshot | undefined = $state();
	let activeLines: { robotId: string; span: SourceSpan; colorIndex: number }[] = $state([]);
	let running = $state(false);
	let statusMessage = $state('Programa válido. Listo para ejecutar.');
	let runtimeError = $state('');
	let editor: { reveal(span: SourceSpan): void };
	let analysisTimer: ReturnType<typeof setTimeout> | undefined;
	let executionTimer: ReturnType<typeof setTimeout> | undefined;
	let analyzedSource = DEFAULT_EXAMPLE.source;
	let workspace: HTMLElement;
	let fileInput: HTMLInputElement;
	let settingsDialog: HTMLDialogElement;
	let welcomeDialog: HTMLDialogElement;
	let executionSpeed = $state(340);
	const executionDelay = $derived(540 - executionSpeed);
	let scenarioCorners: ScenarioCorner[] = $state([]);
	let trail: TrailSegment[] = $state([]);
	let selectedCoordinate = $state<Coordinate>({ avenue: 1, street: 1 });
	let avenueInput = $state('1');
	let streetInput = $state('1');
	let objectKind: 'flower' | 'paper' = $state('flower');
	let objectQuantity = $state(1);
	let storageReady = $state(false);
	let shortcutModifier = $state('Alt');
	let selectedExampleId = $state(DEFAULT_EXAMPLE.id);
	let storageTimer: ReturnType<typeof setTimeout> | undefined;
	type Theme = 'light' | 'dark' | 'system';
	let theme: Theme = $state('system');
	const themeOptions = [
		{ value: 'light', label: 'Claro', icon: Sun },
		{ value: 'dark', label: 'Oscuro', icon: Moon },
		{ value: 'system', label: 'Sistema', icon: Monitor }
	] as const;
	let splitX = $state(36);
	let splitCity = $state(72);
	let splitY = $state(84);
	let resizeAxis: 'editor' | 'city' | 'diagnostics' | undefined;

	const orientationLabels = {
		north: 'Norte',
		east: 'Este',
		south: 'Sur',
		west: 'Oeste'
	} as const;
	const orientationDegrees = { north: -90, east: 0, south: 90, west: 180 } as const;
	const statusLabels = {
		ready: 'Listo',
		running: 'Ejecutando',
		blocked: 'En espera',
		finished: 'Finalizado',
		failed: 'Con error'
	} as const;

	const errors = $derived(analysis.diagnostics.filter(({ severity }) => severity === 'error'));
	const executionFinished = $derived(
		snapshot !== undefined && runtime?.state.status === 'finished'
	);
	const executionStarted = $derived(
		snapshot !== undefined &&
			(snapshot.stepCount > 0 || snapshot.status === 'finished' || snapshot.status === 'failed')
	);
	const scenarioEditable = $derived(snapshot === undefined || snapshot.stepCount === 0);
	const selectedExample = $derived(
		EXAMPLE_PROGRAMS.find(({ id }) => id === selectedExampleId) ?? DEFAULT_EXAMPLE
	);
	const editorColorMarkers = $derived.by(() => {
		const program = analysis.program;
		if (program === undefined) return [];
		const areas = program.ast.areas.map((area, colorIndex) => ({
			offset: area.name.span.end.offset,
			kind: 'area' as const,
			colorIndex
		}));
		const robots = program.ast.variables
			.filter((declaration) =>
				program.ast.robots.some((robot) => robot.name.name === declaration.typeName)
			)
			.flatMap((declaration) => declaration.names)
			.map((robot, colorIndex) => ({
				offset: robot.span.end.offset,
				kind: 'robot' as const,
				colorIndex
			}));
		return [...areas, ...robots].sort((left, right) => left.offset - right.offset);
	});

	$effect(() => {
		scheduleAnalysis(source);
	});

	$effect(() => {
		const currentSource = source;
		const currentCorners = scenarioCorners;
		if (!storageReady) return;
		clearTimeout(storageTimer);
		storageTimer = setTimeout(() => {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ source: currentSource, corners: currentCorners })
			);
		}, 300);
	});

	onMount(() => {
		restoreWorkspace();
		shortcutModifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌥' : 'Alt';
		const savedTheme = localStorage.getItem('visual-r-info-theme');
		if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
			theme = savedTheme;
		}
		const media = matchMedia('(prefers-color-scheme: dark)');
		const followSystemTheme = () => {
			if (theme === 'system') applyTheme(theme);
		};
		media.addEventListener('change', followSystemTheme);
		applyTheme(theme);
		welcomeDialog.showModal();
		return () => media.removeEventListener('change', followSystemTheme);
	});

	function scheduleAnalysis(currentSource: string): void {
		if (currentSource === analyzedSource) return;
		clearTimeout(analysisTimer);
		analysisTimer = setTimeout(() => {
			analysis = analyze(currentSource);
			analyzedSource = currentSource;
			stopExecution();
			runtime = undefined;
			snapshot = undefined;
			trail = [];
			activeLines = [];
			runtimeError = '';
			statusMessage = analysis.program
				? 'Programa válido. Listo para ejecutar.'
				: `${analysis.diagnostics.length} problema${analysis.diagnostics.length === 1 ? '' : 's'} por revisar.`;
		}, 250);
	}

	onDestroy(() => {
		clearTimeout(analysisTimer);
		clearTimeout(executionTimer);
		clearTimeout(storageTimer);
	});

	function validate(): void {
		clearTimeout(analysisTimer);
		const sourceChanged = analyzedSource !== source;
		analysis = analyze(source);
		analyzedSource = source;
		if (sourceChanged) clearRuntime();
		statusMessage = analysis.program
			? 'No encontramos errores. El programa está listo.'
			: `Encontramos ${analysis.diagnostics.length} problema${analysis.diagnostics.length === 1 ? '' : 's'}.`;
		const first = analysis.diagnostics.find(({ span }) => span !== undefined)?.span;
		if (first !== undefined) editor.reveal(first);
	}

	function prepareRuntime(): RInfoRuntime | undefined {
		if (runtime !== undefined && analyzedSource === source) return runtime;
		if (analyzedSource !== source) clearRuntime();
		analysis = analyze(source);
		analyzedSource = source;
		if (analysis.program === undefined) {
			statusMessage = 'Corregí los errores antes de ejecutar.';
			return undefined;
		}
		const created = createRuntime(analysis.program, { corners: scenarioCorners });
		if (!created.ok) {
			runtimeError = created.error.message;
			statusMessage = 'No se pudo preparar la ejecución.';
			return undefined;
		}
		runtime = created.value;
		snapshot = runtime.getSnapshot();
		runtimeError = '';
		return runtime;
	}

	function step(): void {
		stopExecution();
		const prepared = prepareRuntime();
		if (
			prepared === undefined ||
			prepared.state.status === 'finished' ||
			prepared.state.status === 'failed'
		)
			return;
		handleEvents(prepared.step());
		snapshot = prepared.getSnapshot();
		pruneFinishedRobotLines(snapshot);
	}

	function run(): void {
		const prepared = prepareRuntime();
		if (
			prepared === undefined ||
			running ||
			prepared.state.status === 'finished' ||
			prepared.state.status === 'failed'
		)
			return;
		running = true;
		statusMessage = 'Ejecutando…';
		const tick = () => {
			if (!running || runtime === undefined) return;
			handleEvents(runtime.step());
			snapshot = runtime.getSnapshot();
			pruneFinishedRobotLines(snapshot);
			if (runtime.state.status === 'finished' || runtime.state.status === 'failed') {
				running = false;
				return;
			}
			executionTimer = setTimeout(tick, executionDelay);
		};
		tick();
	}

	function pause(): void {
		if (runtime !== undefined) runtime.pause();
		stopExecution();
		statusMessage = 'Ejecución pausada.';
	}

	function reset(): void {
		scenarioCorners = [];
		clearRuntime();
		prepareRuntime();
		runtimeError = '';
		statusMessage = 'Ejecución reiniciada y objetos manuales eliminados.';
	}

	function stopExecution(): void {
		running = false;
		clearTimeout(executionTimer);
	}

	function handleEvents(events: readonly RuntimeEvent[]): void {
		for (const event of events) {
			if (event.kind === 'instruction-started') {
				activeLines = [
					...activeLines.filter(({ robotId }) => robotId !== event.robotId),
					{ robotId: event.robotId, span: event.span, colorIndex: robotColorIndex(event.robotId) }
				];
				statusMessage = `Ejecutando línea ${event.span.start.line}.`;
			} else if (event.kind === 'robot-moved') {
				if (event.movement === 'walk') {
					trail = [...trail, { robotId: event.robotId, from: event.from, to: event.to }];
					statusMessage = `El robot avanzó hasta (${event.to.avenue}, ${event.to.street}).`;
				} else {
					statusMessage = `El robot se posicionó en (${event.to.avenue}, ${event.to.street}).`;
				}
			} else if (event.kind === 'robot-turned') {
				statusMessage = 'El robot giró a la derecha.';
			} else if (event.kind === 'output') {
				statusMessage = `Informar: ${event.values.join(', ')}`;
			} else if (event.kind === 'runtime-error') {
				runtimeError = event.error.message;
				statusMessage = 'La ejecución se detuvo por un error.';
			} else if (event.kind === 'program-finished') {
				statusMessage = 'Programa finalizado.';
			}
		}
	}

	function revealDiagnostic(diagnostic: Diagnostic): void {
		if (diagnostic.span !== undefined) editor.reveal(diagnostic.span);
	}

	function robotColorIndex(robotId: string): number {
		if (runtime === undefined) return 0;
		return Math.max(0, [...runtime.state.robots.keys()].indexOf(robotId));
	}

	function pruneFinishedRobotLines(currentSnapshot: RuntimeSnapshot): void {
		activeLines = activeLines.filter(({ robotId }) => {
			const robot = currentSnapshot.robots.find(({ id }) => id === robotId);
			return (
				robot !== undefined && robot.state.status !== 'finished' && robot.state.status !== 'failed'
			);
		});
	}

	function startResize(axis: 'editor' | 'city' | 'diagnostics', event: PointerEvent): void {
		resizeAxis = axis;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function resize(event: PointerEvent): void {
		if (resizeAxis === undefined) return;
		const bounds = workspace.getBoundingClientRect();
		if (resizeAxis === 'editor') {
			const pixels = Math.min(
				Math.max(360, bounds.width - 592),
				Math.max(360, event.clientX - bounds.left)
			);
			splitX = (pixels / bounds.width) * 100;
		} else if (resizeAxis === 'city') {
			const editorEnd = (splitX / 100) * bounds.width;
			const pixels = Math.min(
				bounds.width - 286,
				Math.max(editorEnd + 306, event.clientX - bounds.left)
			);
			splitCity = (pixels / bounds.width) * 100;
		} else {
			const pixels = Math.min(
				Math.max(240, bounds.height - 78),
				Math.max(240, event.clientY - bounds.top)
			);
			splitY = (pixels / bounds.height) * 100;
		}
	}

	function stopResize(event: PointerEvent): void {
		resizeAxis = undefined;
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	}

	function saveFile(): void {
		const programName = /\bprograma\s+([\p{L}\p{N}_-]+)/u.exec(source)?.[1] ?? 'programa';
		const url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `${programName}.ri`;
		link.click();
		URL.revokeObjectURL(url);
		statusMessage = `Archivo ${link.download} guardado.`;
	}

	async function loadFile(file: File | undefined): Promise<void> {
		if (file === undefined) return;
		if (!file.name.toLocaleLowerCase().endsWith('.ri')) {
			runtimeError = 'Sólo se pueden abrir archivos con extensión .ri.';
			statusMessage = 'El archivo arrastrado no es un programa R-Info.';
			return;
		}
		source = await file.text();
		scenarioCorners = [];
		trail = [];
		runtimeError = '';
		statusMessage = `Archivo ${file.name} cargado.`;
		fileInput.value = '';
	}

	function allowFileDrop(event: DragEvent): void {
		if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
	}

	function dropFile(event: DragEvent): void {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		void loadFile(event.dataTransfer.files[0]);
	}

	function selectCoordinate(coordinate: Coordinate): void {
		selectedCoordinate = coordinate;
		avenueInput = String(coordinate.avenue);
		streetInput = String(coordinate.street);
	}

	function addObjects(): void {
		if (!scenarioEditable) {
			runtimeError = 'Reiniciá la ejecución antes de modificar los objetos de la ciudad.';
			return;
		}
		const avenues = coordinateRange(avenueInput);
		const streets = coordinateRange(streetInput);
		if (avenues === undefined || streets === undefined) {
			runtimeError = 'La avenida y la calle deben ser números entre 1 y 100, o *.';
			return;
		}
		if (avenueInput.trim() === '*' && streetInput.trim() === '*') {
			runtimeError = 'Usá * sólo en la avenida o en la calle, no en ambas a la vez.';
			return;
		}
		if (!Number.isSafeInteger(objectQuantity) || objectQuantity < 1) {
			runtimeError = 'La cantidad debe ser un entero mayor que cero.';
			return;
		}

		const corners = scenarioCorners.map((corner) => ({
			coordinate: { ...corner.coordinate },
			contents: { ...corner.contents }
		}));
		for (const avenue of avenues) {
			for (const street of streets) {
				const index = corners.findIndex(
					(corner) => corner.coordinate.avenue === avenue && corner.coordinate.street === street
				);
				const current = corners[index] ?? {
					coordinate: { avenue, street },
					contents: { flowers: 0, papers: 0 }
				};
				const updated = {
					coordinate: current.coordinate,
					contents: {
						flowers: current.contents.flowers + (objectKind === 'flower' ? objectQuantity : 0),
						papers: current.contents.papers + (objectKind === 'paper' ? objectQuantity : 0)
					}
				};
				if (index === -1) corners.push(updated);
				else corners[index] = updated;
			}
		}
		scenarioCorners = corners;
		rebuildRuntime();
		runtimeError = '';
		const objectName = objectKind === 'flower' ? 'flores' : 'papeles';
		statusMessage = `${objectQuantity} ${objectName} agregados al escenario.`;
	}

	function coordinateRange(value: string): readonly number[] | undefined {
		if (value.trim() === '*') return Array.from({ length: 100 }, (_, index) => index + 1);
		const coordinate = Number(value);
		if (!Number.isInteger(coordinate) || coordinate < 1 || coordinate > 100) return undefined;
		return [coordinate];
	}

	function rebuildRuntime(): void {
		clearRuntime();
		prepareRuntime();
	}

	function clearRuntime(): void {
		stopExecution();
		runtime = undefined;
		snapshot = undefined;
		activeLines = [];
		trail = [];
	}

	function loadExample(): void {
		const example = EXAMPLE_PROGRAMS.find(({ id }) => id === selectedExampleId) ?? DEFAULT_EXAMPLE;
		source = example.source;
		scenarioCorners = [];
		rebuildRuntime();
		settingsDialog.close();
		statusMessage = `Ejemplo “${example.name}” cargado.`;
	}

	function handleShortcut(event: KeyboardEvent): void {
		if (!event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
		if (settingsDialog.open || welcomeDialog.open) return;
		const key = event.code.startsWith('Key')
			? event.code.slice(3).toLocaleLowerCase()
			: event.key.toLocaleLowerCase();
		if (!['e', 'p', 'r', 's', 'o'].includes(key)) return;
		event.preventDefault();
		if (key === 'e') {
			if (running) pause();
			else run();
		} else if (key === 'p') step();
		else if (key === 'r') reset();
		else if (key === 's') saveFile();
		else fileInput.click();
	}

	function restoreWorkspace(): void {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored !== null) {
			try {
				const workspace = JSON.parse(stored) as { source?: unknown; corners?: unknown };
				if (typeof workspace.source === 'string') source = workspace.source;
				if (isStoredCorners(workspace.corners)) scenarioCorners = workspace.corners;
			} catch {
				localStorage.removeItem(STORAGE_KEY);
			}
		}
		storageReady = true;
		queueMicrotask(rebuildRuntime);
	}

	function isStoredCorners(value: unknown): value is ScenarioCorner[] {
		return (
			Array.isArray(value) &&
			value.every((corner: unknown) => {
				if (typeof corner !== 'object' || corner === null) return false;
				const candidate = corner as {
					coordinate?: { avenue?: unknown; street?: unknown };
					contents?: { flowers?: unknown; papers?: unknown };
				};
				return (
					Number.isInteger(candidate.coordinate?.avenue) &&
					Number.isInteger(candidate.coordinate?.street) &&
					Number.isInteger(candidate.contents?.flowers) &&
					Number.isInteger(candidate.contents?.papers) &&
					(candidate.coordinate?.avenue as number) >= 1 &&
					(candidate.coordinate?.avenue as number) <= 100 &&
					(candidate.coordinate?.street as number) >= 1 &&
					(candidate.coordinate?.street as number) <= 100 &&
					(candidate.contents?.flowers as number) >= 0 &&
					(candidate.contents?.papers as number) >= 0
				);
			})
		);
	}

	function closeSettingsFromBackdrop(event: MouseEvent): void {
		if (event.target === event.currentTarget) settingsDialog.close();
	}

	function closeWelcomeFromBackdrop(event: MouseEvent): void {
		if (event.target === event.currentTarget) welcomeDialog.close();
	}

	function applyTheme(nextTheme: Theme): void {
		theme = nextTheme;
		localStorage.setItem('visual-r-info-theme', nextTheme);
		const dark =
			nextTheme === 'dark' ||
			(nextTheme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
		document.documentElement.classList.toggle('dark', dark);
	}
</script>

<svelte:window ondragover={allowFileDrop} ondrop={dropFile} onkeydown={handleShortcut} />

<svelte:head><title>Visual R-Info</title></svelte:head>

<main
	class="bg-muted text-foreground flex min-h-svh min-w-0 flex-col lg:h-dvh lg:min-h-0 lg:overflow-hidden"
>
	<header
		class="bg-background border-border flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1 shadow-sm sm:px-4 lg:flex-nowrap lg:overflow-hidden"
	>
		<div class="mr-auto flex items-center gap-2">
			<h1 class="text-sm font-bold tracking-tight">Visual R-Info</h1>
			<Button
				variant="outline"
				size="sm"
				title="Configuración"
				aria-label="Abrir configuración"
				onclick={() => settingsDialog.showModal()}><Settings /> Configuración</Button
			>
		</div>
		<div class="flex flex-wrap items-center gap-1.5">
			<input
				class="hidden"
				type="file"
				accept=".ri,text/plain"
				bind:this={fileInput}
				onchange={(event) => void loadFile(event.currentTarget.files?.[0])}
			/>
			<div class="flex min-w-0 items-center gap-2 px-1">
				<label for="execution-speed" class="text-muted-foreground text-xs whitespace-nowrap"
					>Velocidad</label
				>
				<input
					id="execution-speed"
					type="range"
					min="40"
					max="500"
					step="10"
					bind:value={executionSpeed}
					aria-label="Intervalo entre pasos de ejecución"
					aria-valuetext={`${executionDelay} milisegundos entre pasos`}
					class="execution-speed accent-primary w-24 sm:w-32"
				/>
			</div>
			{#if executionStarted}
				<Button variant="outline" size="sm" onclick={reset}><RotateCcw /> Reset</Button>
			{:else}
				<Button variant="outline" size="sm" onclick={validate}><Check /> Validar</Button>
			{/if}
			<Button
				variant={running ? 'secondary' : 'default'}
				size="sm"
				onclick={running ? pause : run}
				disabled={!running && (errors.length > 0 || executionFinished)}
				>{#if running}<Pause /> Pausar{:else}<Play /> Ejecutar{/if}</Button
			>
			<Button
				variant="outline"
				size="sm"
				onclick={step}
				disabled={running || errors.length > 0 || executionFinished}><StepForward /> Paso</Button
			>
		</div>
	</header>

	<section
		class="workspace bg-border min-h-0 flex-1"
		style={`--split-x: ${splitX}%; --split-city: ${splitCity}%; --split-y: ${splitY}%;`}
		bind:this={workspace}
	>
		<section class="panel-editor bg-background min-h-[480px] min-w-0 overflow-hidden lg:min-h-0">
			<div class="border-border flex h-9 items-center justify-between gap-3 border-b px-3 text-xs">
				<span>programa.ri</span>
				<div class="flex items-center gap-1">
					<Button variant="ghost" size="xs" onclick={() => fileInput.click()}
						><FolderOpen /> Abrir</Button
					>
					<Button variant="ghost" size="xs" onclick={saveFile}><Save /> Guardar</Button>
				</div>
			</div>
			<div class="h-[calc(100%-2.25rem)]">
				<CodeEditor
					bind:this={editor}
					value={source}
					diagnostics={analysis.diagnostics}
					{activeLines}
					colorMarkers={editorColorMarkers}
					onchange={(next) => (source = next)}
				/>
			</div>
		</section>

		<section class="panel-city bg-card min-h-[400px] min-w-0 overflow-hidden lg:min-h-0">
			<div class="border-border flex h-9 items-center justify-between gap-3 border-b px-3 text-xs">
				<span class="min-w-0 truncate font-medium">{statusMessage}</span>
				<span class="text-muted-foreground shrink-0"
					>{snapshot ? `${snapshot.stepCount} pasos` : 'Listo'}</span
				>
			</div>
			<div class="h-[calc(100%-2.25rem)]">
				<CityCanvas
					{snapshot}
					lastAction={statusMessage}
					{theme}
					{trail}
					onselect={selectCoordinate}
				/>
			</div>
		</section>

		<section
			class="panel-diagnostics bg-background min-h-[200px] min-w-0 overflow-auto p-3 lg:min-h-0"
		>
			<div class="mb-2 flex items-center gap-2 text-xs font-semibold">
				<Terminal size={14} /> Diagnósticos y salida
			</div>
			{#if runtimeError}
				<p
					class="border-destructive/30 bg-destructive/10 text-destructive mb-2 rounded-md border p-2 text-xs"
				>
					{runtimeError}
				</p>
			{/if}
			{#if analysis.diagnostics.length}
				<ul class="space-y-1">
					{#each analysis.diagnostics as diagnostic, index (`${diagnostic.code}:${diagnostic.span?.start.offset ?? -1}:${index}`)}
						<li>
							<button
								class="hover:bg-muted w-full rounded px-2 py-1.5 text-left text-xs"
								onclick={() => revealDiagnostic(diagnostic)}
								><span class="text-destructive font-mono font-semibold">{diagnostic.code}</span> · {diagnostic.message}
								{diagnostic.span ? `— línea ${diagnostic.span.start.line}` : ''}</button
							>
						</li>
					{/each}
				</ul>
			{:else if snapshot?.output.length}
				<div class="space-y-1 font-mono text-xs">
					{#each snapshot.output as value, index (`${index}:${String(value)}`)}<p>
							&gt; {String(value)}
						</p>{/each}
				</div>
			{:else}
				<p class="text-muted-foreground text-xs">{statusMessage}</p>
			{/if}
		</section>

		<aside class="panel-inspector bg-background min-h-[220px] min-w-0 overflow-auto p-3 lg:min-h-0">
			<div class="mb-3 flex items-center gap-2 text-xs font-semibold">
				<Bot size={14} /> Inspector
			</div>
			{#if snapshot?.robots.length}
				<div class="space-y-3">
					{#each snapshot.robots as robot, robotIndex (robot.id)}
						<section class="border-border bg-muted/35 rounded-md border p-3">
							<div class="mb-3 flex items-center gap-2">
								<span
									class="robot-preview"
									style={`--robot-color: var(--robot-${(robotIndex % 5) + 1}); transform: rotate(${orientationDegrees[robot.state.orientation]}deg);`}
								></span>
								<span class="text-xs font-semibold">{robot.id}</span>
							</div>
							<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
								<dt class="text-muted-foreground">Posición</dt>
								<dd>({robot.state.position.avenue}, {robot.state.position.street})</dd>
								<dt class="text-muted-foreground">Orientación</dt>
								<dd>{orientationLabels[robot.state.orientation]}</dd>
								<dt class="text-muted-foreground">Estado</dt>
								<dd>{statusLabels[robot.state.status]}</dd>
								<dt class="text-muted-foreground">Bolsa</dt>
								<dd>🌸 {robot.state.bag.flowers} · 📄 {robot.state.bag.papers}</dd>
							</dl>
							<div class="border-border mt-3 border-t pt-2">
								<p
									class="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase"
								>
									Variables
								</p>
								{#each Object.entries(robot.variables) as [name, value] (name)}
									<div class="flex justify-between py-1 font-mono text-xs">
										<span>{name}</span><span>{String(value)}</span>
									</div>
								{:else}<p class="text-muted-foreground text-xs">Sin variables.</p>{/each}
							</div>
						</section>
					{/each}
				</div>
			{:else}<p class="text-muted-foreground text-xs">
					Ejecutá o avanzá un paso para inspeccionar el robot.
				</p>{/if}
			<section class="border-border mt-4 space-y-3 border-t pt-3">
				<div>
					<h3 class="text-xs font-semibold">Objetos en la ciudad</h3>
					<p class="text-muted-foreground mt-1 text-[11px]">
						Esquina seleccionada: {selectedCoordinate.avenue}, {selectedCoordinate.street}. Usá *
						para completar una avenida o calle entera.
					</p>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<label class="space-y-1 text-[11px]">
						<span class="text-muted-foreground">Elemento</span>
						<select
							bind:value={objectKind}
							disabled={!scenarioEditable}
							class="border-input bg-background h-8 w-full border px-2 text-xs"
						>
							<option value="flower">Flores</option>
							<option value="paper">Papeles</option>
						</select>
					</label>
					<label class="space-y-1 text-[11px]">
						<span class="text-muted-foreground">Cantidad</span>
						<input
							type="number"
							min="1"
							step="1"
							bind:value={objectQuantity}
							disabled={!scenarioEditable}
							class="border-input bg-background h-8 w-full border px-2 text-xs"
						/>
					</label>
					<label class="space-y-1 text-[11px]">
						<span class="text-muted-foreground">Avenida</span>
						<input
							inputmode="numeric"
							bind:value={avenueInput}
							disabled={!scenarioEditable}
							class="border-input bg-background h-8 w-full border px-2 text-xs"
						/>
					</label>
					<label class="space-y-1 text-[11px]">
						<span class="text-muted-foreground">Calle</span>
						<input
							inputmode="numeric"
							bind:value={streetInput}
							disabled={!scenarioEditable}
							class="border-input bg-background h-8 w-full border px-2 text-xs"
						/>
					</label>
				</div>
				<Button
					variant="outline"
					size="sm"
					class="w-full"
					disabled={!scenarioEditable}
					onclick={addObjects}>Agregar</Button
				>
			</section>
		</aside>

		<div
			class="resize-handle resize-handle-editor"
			role="separator"
			aria-label="Cambiar ancho del editor"
			aria-orientation="vertical"
			onpointerdown={(event) => startResize('editor', event)}
			onpointermove={resize}
			onpointerup={stopResize}
		></div>
		<div
			class="resize-handle resize-handle-city"
			role="separator"
			aria-label="Cambiar ancho de la ciudad"
			aria-orientation="vertical"
			onpointerdown={(event) => startResize('city', event)}
			onpointermove={resize}
			onpointerup={stopResize}
		></div>
		<div
			class="resize-handle resize-handle-diagnostics"
			role="separator"
			aria-label="Cambiar alto de los paneles"
			aria-orientation="horizontal"
			onpointerdown={(event) => startResize('diagnostics', event)}
			onpointermove={resize}
			onpointerup={stopResize}
		></div>
	</section>

	<dialog
		bind:this={settingsDialog}
		class="bg-popover text-popover-foreground border-border m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100%-2rem))] overflow-y-auto rounded-lg border p-0 shadow-2xl backdrop:bg-black/50"
		onclick={closeSettingsFromBackdrop}
		onclose={() => settingsDialog.blur()}
	>
		<div class="border-border flex items-center justify-between border-b px-5 py-4">
			<div class="flex items-center gap-3">
				<div
					class="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md"
				>
					<Settings size={16} />
				</div>
				<div>
					<h2 class="text-sm font-semibold">Configuración</h2>
					<p class="text-muted-foreground text-xs">Personalizá tu entorno de trabajo.</p>
				</div>
			</div>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Cerrar configuración"
				onclick={() => settingsDialog.close()}><X /></Button
			>
		</div>
		<div class="space-y-4 p-5">
			<section class="bg-muted/50 border-border space-y-3 rounded-md border p-4">
				<h3 class="text-sm font-semibold">Apariencia</h3>
				<div class="grid grid-cols-3 gap-2" role="group" aria-label="Tema de la interfaz">
					{#each themeOptions as option (option.value)}
						{@const ThemeIcon = option.icon}
						<Button
							variant={theme === option.value ? 'default' : 'outline'}
							class="h-16 flex-col gap-1"
							onclick={() => applyTheme(option.value)}><ThemeIcon /> {option.label}</Button
						>
					{/each}
				</div>
			</section>
			<section class="bg-muted/50 border-border space-y-3 rounded-md border p-4">
				<div>
					<h3 class="text-sm font-semibold">Programas de ejemplo</h3>
					<p class="text-muted-foreground mt-1 text-xs">
						Reemplazan el código y limpian la ciudad actual.
					</p>
				</div>
				<select
					bind:value={selectedExampleId}
					class="border-input bg-background h-9 w-full border px-2 text-xs"
				>
					{#each EXAMPLE_PROGRAMS as example (example.id)}
						<option value={example.id}>{example.name}</option>
					{/each}
				</select>
				<p class="text-muted-foreground text-xs leading-relaxed">{selectedExample.description}</p>
				<Button variant="outline" size="sm" class="w-full" onclick={loadExample}
					>Cargar ejemplo</Button
				>
			</section>
			<section class="bg-primary text-primary-foreground space-y-3 rounded-md p-4">
				<div>
					<h3 class="font-heading text-base font-bold">Visual R-Info</h3>
					<p class="text-primary-foreground/70 text-xs">
						Entorno educativo para programación R-Info
					</p>
				</div>
				<p class="text-sm leading-relaxed">
					Basado en el lenguaje y el entorno educativo R-Info de la Facultad de Informática de la
					UNLP.<br />Desarrollado por Markski en TypeScript con SvelteKit.<br />Integra CodeMirror
					como editor de código y una interfaz construida con Tailwind CSS y shadcn-svelte.
				</p>
				<div class="flex flex-wrap gap-2">
					<Button
						variant="secondary"
						size="sm"
						href="https://github.com/markski1/visual-r-info"
						target="_blank"
						rel="noreferrer"><ExternalLink /> Proyecto en GitHub</Button
					>
					<Button
						variant="secondary"
						size="sm"
						href="https://www.info.unlp.edu.ar/wp-content/uploads/2024/01/GuiaIAI2024.pdf"
						target="_blank"
						rel="noreferrer"><ExternalLink /> Guía IAI 2024</Button
					>
					<Button
						variant="secondary"
						size="sm"
						href="https://www.info.unlp.edu.ar/wp-content/uploads/2021/02/Guia_IAI_2021_V2.pdf"
						target="_blank"
						rel="noreferrer"><ExternalLink /> Guía IAI 2021</Button
					>
				</div>
				<p class="text-sm leading-relaxed">
					Email: <a href="mailto:me@markski.ar">me@markski.ar</a><br />
					Discord: markski.ar
				</p>
			</section>
		</div>
	</dialog>

	<dialog
		bind:this={welcomeDialog}
		class="bg-popover text-popover-foreground border-border m-auto w-[min(32rem,calc(100%-2rem))] rounded-lg border p-0 shadow-2xl backdrop:bg-black/50"
		onclick={closeWelcomeFromBackdrop}
	>
		<div class="space-y-5 p-6">
			<div class="space-y-2">
				<h2 class="font-heading text-lg font-bold">Bienvenido a Visual R-Info</h2>
				<p class="text-muted-foreground text-sm leading-relaxed">
					Un entorno web para aprender con R-Info.
				</p>
			</div>
			<section class="bg-muted/50 border-border rounded-md border p-4">
				<h3 class="mb-3 text-sm font-semibold">Atajos de teclado</h3>
				<dl class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-xs">
					<dt><kbd>{shortcutModifier} E</kbd></dt>
					<dd>Ejecutar o pausar</dd>
					<dt><kbd>{shortcutModifier} P</kbd></dt>
					<dd>Avanzar un paso</dd>
					<dt><kbd>{shortcutModifier} R</kbd></dt>
					<dd>Reiniciar la ejecución</dd>
					<dt><kbd>{shortcutModifier} S</kbd></dt>
					<dd>Guardar el archivo .ri</dd>
					<dt><kbd>{shortcutModifier} O</kbd></dt>
					<dd>Abrir un archivo .ri</dd>
				</dl>
			</section>
			<p class="text-muted-foreground text-xs">
				Basado en R-Info, el entorno educativo de la Facultad de Informática de la UNLP.
			</p>
			<Button class="w-full" onclick={() => welcomeDialog.close()}>Empezar</Button>
		</div>
	</dialog>
</main>

<style>
	.workspace {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1px;
	}

	.resize-handle {
		display: none;
		touch-action: none;
		background: rgb(0 0 0 / 10%);
	}

	.execution-speed::-webkit-slider-thumb {
		border-radius: 0;
	}

	.execution-speed::-moz-range-thumb {
		border-radius: 0;
	}

	kbd {
		border: 1px solid var(--border);
		background: var(--background);
		padding: 0.125rem 0.375rem;
		font-family: var(--font-mono);
		box-shadow: 0 1px 0 var(--border);
	}

	.robot-preview {
		display: inline-block;
		width: 1rem;
		height: 0.75rem;
		background: var(--robot-color);
		clip-path: polygon(100% 50%, 0 0, 22% 50%, 0 100%);
		transform-origin: center;
	}

	@media (min-width: 64rem) {
		:global(html),
		:global(body) {
			height: 100%;
			overflow: hidden;
		}
		.workspace {
			grid-template-columns:
				minmax(360px, var(--split-x)) 6px
				minmax(300px, calc(var(--split-city) - var(--split-x) - 6px)) 6px
				minmax(280px, 1fr);
			grid-template-rows: minmax(240px, var(--split-y)) 6px minmax(72px, 1fr);
			gap: 0;
			overflow: hidden;
		}
		.panel-editor {
			grid-column: 1;
			grid-row: 1;
		}
		.panel-city {
			grid-column: 3;
			grid-row: 1 / 4;
		}
		.panel-diagnostics {
			grid-column: 1;
			grid-row: 3;
		}
		.panel-inspector {
			grid-column: 5;
			grid-row: 1 / 4;
		}
		.resize-handle {
			display: block;
			position: relative;
			z-index: 5;
		}
		.resize-handle::after {
			position: absolute;
			content: '';
		}
		.resize-handle:hover,
		.resize-handle:active {
			background: var(--primary);
		}
		.resize-handle-editor {
			grid-column: 2;
			grid-row: 1 / 4;
			cursor: col-resize;
		}
		.resize-handle-editor::after,
		.resize-handle-city::after {
			inset: 0 -3px;
		}
		.resize-handle-city {
			grid-column: 4;
			grid-row: 1 / 4;
			cursor: col-resize;
		}
		.resize-handle-diagnostics {
			grid-column: 1;
			grid-row: 2;
			cursor: row-resize;
		}
		.resize-handle-diagnostics::after {
			inset: -3px 0;
		}
	}
</style>
