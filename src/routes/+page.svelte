<script lang="ts">
	import { Bot, Check, Pause, Play, RotateCcw, StepForward, Terminal } from '@lucide/svelte';
	import { onDestroy } from 'svelte';

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
	let splitY = $state(64);
	let resizeAxis: 'x' | 'y' | undefined;

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

	$effect(() => {
		scheduleAnalysis(source);
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
			executionTimer = setTimeout(tick, 140);
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

	function startResize(axis: 'x' | 'y', event: PointerEvent): void {
		resizeAxis = axis;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function resize(event: PointerEvent): void {
		if (resizeAxis === undefined) return;
		const bounds = workspace.getBoundingClientRect();
		if (resizeAxis === 'x') {
			const pixels = Math.min(
				Math.max(360, bounds.width - 346),
				Math.max(360, event.clientX - bounds.left)
			);
			splitX = (pixels / bounds.width) * 100;
		} else {
			const pixels = Math.min(
				Math.max(300, bounds.height - 186),
				Math.max(300, event.clientY - bounds.top)
			);
			splitY = (pixels / bounds.height) * 100;
		}
	}

	function stopResize(event: PointerEvent): void {
		resizeAxis = undefined;
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	}
</script>

<svelte:head><title>Visual R-Info</title></svelte:head>

<main class="flex min-h-svh flex-col bg-[#ece8de] text-[#252722]">
	<header
		class="flex min-h-14 flex-wrap items-center gap-2 border-b border-black/10 bg-[#f8f6f0] px-3 py-2 shadow-sm sm:px-4"
	>
		<div class="mr-auto">
			<h1 class="text-sm font-bold tracking-tight">Visual R-Info</h1>
			<p class="text-[10px] text-black/55">Adaptación web del entorno educativo R-Info</p>
		</div>
		<div class="flex flex-wrap items-center gap-1.5">
			<Button variant="outline" size="sm" onclick={validate}><Check /> Validar</Button>
			<Button size="sm" onclick={run} disabled={running || errors.length > 0}
				><Play /> Ejecutar</Button
			>
			<Button variant="outline" size="sm" onclick={pause} disabled={!running}
				><Pause /> Pausa</Button
			>
			<Button variant="outline" size="sm" onclick={step} disabled={running || errors.length > 0}
				><StepForward /> Paso</Button
			>
			<Button variant="ghost" size="sm" onclick={reset}><RotateCcw /> Reset</Button>
		</div>
	</header>

	<section
		class="workspace min-h-0 flex-1 bg-black/10"
		style={`--split-x: ${splitX}%; --split-y: ${splitY}%;`}
		bind:this={workspace}
	>
		<section class="panel-editor min-h-[480px] bg-[#fbfaf6] lg:min-h-0">
			<div
				class="flex h-9 items-center justify-between border-b border-black/10 px-3 text-xs font-semibold"
			>
				<span>programa.ri</span>
				<span class={errors.length ? 'text-red-700' : 'text-[#2f6656]'}
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

		<section class="panel-city min-h-[400px] bg-[#f7f4ed] lg:min-h-0">
			<div
				class="flex h-9 items-center justify-between border-b border-black/10 px-3 text-xs font-semibold"
			>
				<span>Ciudad</span><span class="font-normal text-black/50">100 × 100</span>
			</div>
			<div class="h-[calc(100%-2.25rem)]"><CityCanvas {snapshot} lastAction={statusMessage} /></div>
		</section>

		<section class="panel-diagnostics min-h-[200px] overflow-auto bg-[#f8f6f0] p-3 lg:min-h-0">
			<div class="mb-2 flex items-center gap-2 text-xs font-semibold">
				<Terminal size={14} /> Diagnósticos y salida
			</div>
			{#if runtimeError}
				<p class="mb-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800">
					{runtimeError}
				</p>
			{/if}
			{#if analysis.diagnostics.length}
				<ul class="space-y-1">
					{#each analysis.diagnostics as diagnostic (`${diagnostic.code}:${diagnostic.span?.start.offset ?? -1}`)}
						<li>
							<button
								class="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-black/5"
								onclick={() => revealDiagnostic(diagnostic)}
								><span class="font-mono font-semibold text-red-700">{diagnostic.code}</span> · {diagnostic.message}
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
				<p class="text-xs text-black/55">{statusMessage}</p>
			{/if}
		</section>

		<aside class="panel-inspector min-h-[220px] overflow-auto bg-[#f8f6f0] p-3 lg:min-h-0">
			<div class="mb-3 flex items-center gap-2 text-xs font-semibold">
				<Bot size={14} /> Inspector
			</div>
			{#if selectedRobot}
				<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
					<dt class="text-black/50">Robot</dt>
					<dd class="font-medium">{selectedRobot.id}</dd>
					<dt class="text-black/50">Posición</dt>
					<dd>({selectedRobot.state.position.avenue}, {selectedRobot.state.position.street})</dd>
					<dt class="text-black/50">Orientación</dt>
					<dd>{orientationLabels[selectedRobot.state.orientation]}</dd>
					<dt class="text-black/50">Estado</dt>
					<dd>{statusLabels[selectedRobot.state.status]}</dd>
					<dt class="text-black/50">Bolsa</dt>
					<dd>🌸 {selectedRobot.state.bag.flowers} · 📄 {selectedRobot.state.bag.papers}</dd>
				</dl>
				<div class="mt-4 border-t border-black/10 pt-3">
					<p class="mb-2 text-[11px] font-semibold tracking-wide text-black/50 uppercase">
						Variables
					</p>
					{#each Object.entries(selectedRobot.variables) as [name, value] (name)}
						<div class="flex justify-between py-1 font-mono text-xs">
							<span>{name}</span><span>{String(value)}</span>
						</div>
					{:else}<p class="text-xs text-black/45">Sin variables.</p>{/each}
				</div>
			{:else}<p class="text-xs text-black/50">
					Ejecutá o avanzá un paso para inspeccionar el robot.
				</p>{/if}
		</aside>

		<div
			class="resize-handle resize-handle-x"
			role="separator"
			aria-label="Cambiar ancho de los paneles"
			aria-orientation="vertical"
			onpointerdown={(event) => startResize('x', event)}
			onpointermove={resize}
			onpointerup={stopResize}
		></div>
		<div
			class="resize-handle resize-handle-y"
			role="separator"
			aria-label="Cambiar alto de los paneles"
			aria-orientation="horizontal"
			onpointerdown={(event) => startResize('y', event)}
			onpointermove={resize}
			onpointerup={stopResize}
		></div>
	</section>

	<footer
		class="flex min-h-7 items-center justify-between border-t border-black/10 bg-[#f8f6f0] px-3 text-[11px] text-black/60"
	>
		<span>{statusMessage}</span><span>{snapshot ? `${snapshot.stepCount} pasos` : 'Listo'}</span>
	</footer>
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

	@media (min-width: 64rem) {
		.workspace {
			grid-template-columns: var(--split-x) 6px minmax(340px, 1fr);
			grid-template-rows: var(--split-y) 6px minmax(180px, 1fr);
			gap: 0;
		}
		.panel-editor {
			grid-column: 1;
			grid-row: 1;
		}
		.panel-city {
			grid-column: 3;
			grid-row: 1;
		}
		.panel-diagnostics {
			grid-column: 1;
			grid-row: 3;
		}
		.panel-inspector {
			grid-column: 3;
			grid-row: 3;
		}
		.resize-handle {
			display: block;
			position: relative;
			z-index: 5;
		}
		.resize-handle::after {
			position: absolute;
			content: '';
			inset: -3px;
		}
		.resize-handle:hover,
		.resize-handle:active {
			background: #568879;
		}
		.resize-handle-x {
			grid-column: 2;
			grid-row: 1 / 4;
			cursor: col-resize;
		}
		.resize-handle-y {
			grid-column: 1 / 4;
			grid-row: 2;
			cursor: row-resize;
		}
	}
</style>
