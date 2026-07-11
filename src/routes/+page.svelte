<script lang="ts">
	import { Bot, Check, Pause, Play, RotateCcw, StepForward, Terminal } from '@lucide/svelte';
	import {
		Bot,
		Check,
		ExternalLink,
		FolderOpen,
		Gauge,
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
		type RInfoRuntime,
		type RuntimeEvent,
		type RuntimeSnapshot
	} from '$lib/runtime/index.js';

	const SAMPLE = `programa recorrido
areas
  ciudad: AreaC(1,1,100,100)
robots
  robot explorador
  variables
    lado: numero
  comenzar
    lado:=0
    repetir 4
      repetir 4
        mover
      derecha
      lado:=lado+1
    Informar(lado)
  fin
variables
  Rinfo: explorador
comenzar
  AsignarArea(Rinfo,ciudad)
  Iniciar(Rinfo,10,10)
fin`;

	let source = $state(SAMPLE);
	let analysis: AnalysisResult = $state(analyze(SAMPLE));
	let runtime: RInfoRuntime | undefined = $state();
	let snapshot: RuntimeSnapshot | undefined = $state();
	let activeSpan: SourceSpan | undefined = $state();
	let running = $state(false);
	let statusMessage = $state('Programa válido. Listo para ejecutar.');
	let runtimeError = $state('');
	let editor: { reveal(span: SourceSpan): void };
	let analysisTimer: ReturnType<typeof setTimeout> | undefined;
	let executionTimer: ReturnType<typeof setTimeout> | undefined;
	let analyzedSource = SAMPLE;
	let workspace: HTMLElement;
	let fileInput: HTMLInputElement;
	let settingsDialog: HTMLDialogElement;
	let executionDelay = $state(140);
	type Theme = 'light' | 'dark' | 'system';
	let theme: Theme = $state('system');
	const themeOptions = [
		{ value: 'light', label: 'Claro', icon: Sun },
		{ value: 'dark', label: 'Oscuro', icon: Moon },
		{ value: 'system', label: 'Sistema', icon: Monitor }
	] as const;
	let splitX = $state(36);
	let splitCity = $state(72);
	let splitY = $state(58);
	let resizeAxis: 'editor' | 'city' | 'right' | undefined;

	const orientationLabels = {
		north: 'Norte',
		east: 'Este',
		south: 'Sur',
		west: 'Oeste'
	} as const;
	const statusLabels = {
		ready: 'Listo',
		running: 'Ejecutando',
		blocked: 'En espera',
		finished: 'Finalizado',
		failed: 'Con error'
	} as const;

	const errors = $derived(analysis.diagnostics.filter(({ severity }) => severity === 'error'));
	const selectedRobot = $derived(snapshot?.robots[0]);
	const executionFinished = $derived(
		snapshot !== undefined && runtime?.state.status === 'finished'
	);

	$effect(() => {
		scheduleAnalysis(source);
	});

	onMount(() => {
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
			activeSpan = undefined;
			runtimeError = '';
			statusMessage = analysis.program
				? 'Programa válido. Listo para ejecutar.'
				: `${analysis.diagnostics.length} problema${analysis.diagnostics.length === 1 ? '' : 's'} por revisar.`;
		}, 250);
	}

	onDestroy(() => {
		clearTimeout(analysisTimer);
		clearTimeout(executionTimer);
	});

	function validate(): void {
		clearTimeout(analysisTimer);
		analysis = analyze(source);
		analyzedSource = source;
		statusMessage = analysis.program
			? 'No encontramos errores. El programa está listo.'
			: `Encontramos ${analysis.diagnostics.length} problema${analysis.diagnostics.length === 1 ? '' : 's'}.`;
		const first = analysis.diagnostics.find(({ span }) => span !== undefined)?.span;
		if (first !== undefined) editor.reveal(first);
	}

	function prepareRuntime(): RInfoRuntime | undefined {
		if (runtime !== undefined) return runtime;
		analysis = analyze(source);
		if (analysis.program === undefined) {
			statusMessage = 'Corregí los errores antes de ejecutar.';
			return undefined;
		}
		const created = createRuntime(analysis.program);
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
		if (prepared === undefined) return;
		handleEvents(prepared.step());
		snapshot = prepared.getSnapshot();
	}

	function run(): void {
		const prepared = prepareRuntime();
		if (prepared === undefined || running) return;
		running = true;
		statusMessage = 'Ejecutando…';
		const tick = () => {
			if (!running || runtime === undefined) return;
			handleEvents(runtime.step());
			snapshot = runtime.getSnapshot();
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
		stopExecution();
		if (runtime === undefined) {
			prepareRuntime();
			return;
		}
		runtime.reset();
		snapshot = runtime.getSnapshot();
		activeSpan = undefined;
		runtimeError = '';
		statusMessage = 'Ejecución reiniciada.';
	}

	function stopExecution(): void {
		running = false;
		clearTimeout(executionTimer);
	}

	function handleEvents(events: readonly RuntimeEvent[]): void {
		for (const event of events) {
			if (event.kind === 'instruction-started') {
				activeSpan = event.span;
				editor.reveal(event.span);
				statusMessage = `Ejecutando línea ${event.span.start.line}.`;
			} else if (event.kind === 'robot-moved') {
				statusMessage = `El robot avanzó hasta (${event.to.avenue}, ${event.to.street}).`;
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

	function startResize(axis: 'editor' | 'city' | 'right', event: PointerEvent): void {
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
				Math.max(180, bounds.height - 146),
				Math.max(180, event.clientY - bounds.top)
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

	function closeSettingsFromBackdrop(event: MouseEvent): void {
		if (event.target === event.currentTarget) settingsDialog.close();
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

<svelte:window ondragover={allowFileDrop} ondrop={dropFile} />

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
			<Button variant="ghost" size="sm" onclick={() => fileInput.click()}
				><FolderOpen /> Abrir</Button
			>
			<Button variant="ghost" size="sm" onclick={saveFile}><Save /> Guardar</Button>
			<Button variant="outline" size="sm" onclick={validate}><Check /> Validar</Button>
			<Button
				variant={running ? 'secondary' : 'default'}
				size="sm"
				onclick={running ? pause : run}
				disabled={!running && (errors.length > 0 || executionFinished)}
				>{#if running}<Pause /> Pausar{:else}<Play /> Ejecutar{/if}</Button
			>
			<Button variant="outline" size="sm" onclick={step} disabled={running || errors.length > 0}
				><StepForward /> Paso</Button
			>
			<Button variant="ghost" size="sm" onclick={reset}><RotateCcw /> Reset</Button>
		</div>
	</header>

	<section
		class="workspace bg-border min-h-0 flex-1"
		style={`--split-x: ${splitX}%; --split-city: ${splitCity}%; --split-y: ${splitY}%;`}
		bind:this={workspace}
	>
		<section class="panel-editor bg-background min-h-[480px] min-w-0 overflow-hidden lg:min-h-0">
			<div
				class="border-border flex h-9 items-center justify-between border-b px-3 text-xs font-semibold"
			>
				<span>programa.ri</span>
				<span class={errors.length ? 'text-destructive' : 'text-muted-foreground'}
					>{errors.length ? `${errors.length} errores` : 'Sin errores'}</span
				>
			</div>
			<div class="h-[calc(100%-2.25rem)]">
				<CodeEditor
					bind:this={editor}
					value={source}
					diagnostics={analysis.diagnostics}
					{activeSpan}
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
				<CityCanvas {snapshot} lastAction={statusMessage} {theme} />
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
					{#each analysis.diagnostics as diagnostic (`${diagnostic.code}:${diagnostic.span?.start.offset ?? -1}`)}
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
			{#if selectedRobot}
				<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
					<dt class="text-muted-foreground">Robot</dt>
					<dd class="font-medium">{selectedRobot.id}</dd>
					<dt class="text-muted-foreground">Posición</dt>
					<dd>({selectedRobot.state.position.avenue}, {selectedRobot.state.position.street})</dd>
					<dt class="text-muted-foreground">Orientación</dt>
					<dd>{orientationLabels[selectedRobot.state.orientation]}</dd>
					<dt class="text-muted-foreground">Estado</dt>
					<dd>{statusLabels[selectedRobot.state.status]}</dd>
					<dt class="text-muted-foreground">Bolsa</dt>
					<dd>🌸 {selectedRobot.state.bag.flowers} · 📄 {selectedRobot.state.bag.papers}</dd>
				</dl>
				<div class="border-border mt-4 border-t pt-3">
					<p class="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wide uppercase">
						Variables
					</p>
					{#each Object.entries(selectedRobot.variables) as [name, value] (name)}
						<div class="flex justify-between py-1 font-mono text-xs">
							<span>{name}</span><span>{String(value)}</span>
						</div>
					{:else}<p class="text-muted-foreground text-xs">Sin variables.</p>{/each}
				</div>
			{:else}<p class="text-muted-foreground text-xs">
					Ejecutá o avanzá un paso para inspeccionar el robot.
				</p>{/if}
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
			class="resize-handle resize-handle-right"
			role="separator"
			aria-label="Cambiar alto de los paneles"
			aria-orientation="horizontal"
			onpointerdown={(event) => startResize('right', event)}
			onpointermove={resize}
			onpointerup={stopResize}
		></div>
	</section>

	<dialog
		bind:this={settingsDialog}
		class="bg-popover text-popover-foreground border-border m-auto w-[min(34rem,calc(100%-2rem))] rounded-lg border p-0 shadow-2xl backdrop:bg-black/50"
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
				<div class="flex items-center justify-between gap-4">
					<div class="flex items-center gap-2">
						<Gauge size={16} />
						<label for="execution-speed" class="text-sm font-semibold">Velocidad de ejecución</label
						>
					</div>
					<output for="execution-speed" class="text-muted-foreground shrink-0 font-mono text-xs"
						>{executionDelay} ms</output
					>
				</div>
				<input
					id="execution-speed"
					type="range"
					min="40"
					max="500"
					step="10"
					bind:value={executionDelay}
					class="execution-speed accent-primary w-full"
				/>
				<p class="text-muted-foreground text-xs">
					Un intervalo menor hace que la ejecución automática avance más rápido.
				</p>
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
					UNLP.<br>Desarrollado por Markski en TypeScript con SvelteKit.<br>Integra CodeMirror
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
			</section>
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
			grid-template-rows: minmax(180px, var(--split-y)) 6px minmax(140px, 1fr);
			gap: 0;
			overflow: hidden;
		}
		.panel-editor {
			grid-column: 1;
			grid-row: 1 / 4;
		}
		.panel-city {
			grid-column: 3;
			grid-row: 1 / 4;
		}
		.panel-diagnostics {
			grid-column: 5;
			grid-row: 3;
		}
		.panel-inspector {
			grid-column: 5;
			grid-row: 1;
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
		.resize-handle-right {
			grid-column: 5;
			grid-row: 2;
			cursor: row-resize;
		}
		.resize-handle-right::after {
			inset: -3px 0;
		}
	}
</style>
