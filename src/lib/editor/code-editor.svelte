<script lang="ts">
	import {
		acceptCompletion,
		autocompletion,
		type CompletionContext
	} from '@codemirror/autocomplete';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { bracketMatching } from '@codemirror/language';
	import { setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
	import { StateEffect, StateField } from '@codemirror/state';
	import {
		Decoration,
		EditorView,
		hoverTooltip,
		keymap,
		lineNumbers,
		type Tooltip,
		ViewPlugin,
		WidgetType
	} from '@codemirror/view';
	import { onMount } from 'svelte';

	import type { Diagnostic } from '$lib/language/diagnostics/index.js';
	import { lex, TokenKind } from '$lib/language/lexer/index.js';
	import type { SourceSpan } from '$lib/language/source/index.js';

	let {
		value,
		diagnostics = [],
		activeLines = [],
		colorMarkers = [],
		onchange
	}: {
		value: string;
		diagnostics?: readonly Diagnostic[];
		activeLines?: readonly { robotId: string; span: SourceSpan; colorIndex: number }[];
		colorMarkers?: readonly {
			offset: number;
			kind: 'robot' | 'area';
			colorIndex: number;
		}[];
		onchange: (value: string) => void;
	} = $props();

	let host: HTMLDivElement;
	let view: EditorView | undefined;
	let applyingExternalChange = false;

	const setActiveLines = StateEffect.define<typeof activeLines>();
	const setColorMarkers = StateEffect.define<typeof colorMarkers>();
	const executionLines = StateField.define<ReturnType<typeof Decoration.set>>({
		create: () => Decoration.none,
		update(current, transaction) {
			current = current.map(transaction.changes);
			for (const effect of transaction.effects) {
				if (!effect.is(setActiveLines)) continue;
				const lines: { from: number; robotIds: string[]; colorIndices: number[] }[] = [];
				for (const active of effect.value) {
					const position = Math.min(active.span.start.offset, transaction.state.doc.length);
					const line = transaction.state.doc.lineAt(position);
					const existing = lines.find(({ from }) => from === line.from);
					if (existing === undefined) {
						lines.push({
							from: line.from,
							robotIds: [active.robotId],
							colorIndices: [active.colorIndex]
						});
					} else {
						existing.robotIds.push(active.robotId);
						existing.colorIndices.push(active.colorIndex);
					}
				}
				return Decoration.set(
					lines.map((line) =>
						Decoration.line({
							class: 'cm-rinfo-executing-line',
							attributes: {
								style: executionLineStyle(line.colorIndices),
								title: `${line.robotIds.join(', ')} ejecutando esta línea`
							}
						}).range(line.from)
					),
					true
				);
			}
			return current;
		},
		provide: (field) => EditorView.decorations.from(field)
	});

	const colorMarkerField = StateField.define<ReturnType<typeof Decoration.set>>({
		create: () => Decoration.none,
		update(current, transaction) {
			current = current.map(transaction.changes);
			for (const effect of transaction.effects) {
				if (!effect.is(setColorMarkers)) continue;
				return Decoration.set(
					effect.value.map((marker) =>
						Decoration.widget({
							widget: new ColorMarkerWidget(marker.kind, marker.colorIndex),
							side: 1
						}).range(Math.min(marker.offset, transaction.state.doc.length))
					)
				);
			}
			return current;
		},
		provide: (field) => EditorView.decorations.from(field)
	});

	class ColorMarkerWidget extends WidgetType {
		private readonly kind: 'robot' | 'area';
		private readonly colorIndex: number;

		public constructor(kind: 'robot' | 'area', colorIndex: number) {
			super();
			this.kind = kind;
			this.colorIndex = colorIndex;
		}

		public toDOM(): HTMLElement {
			const marker = document.createElement('span');
			marker.className = `cm-rinfo-color cm-rinfo-${this.kind}-${(this.colorIndex % 5) + 1}`;
			marker.title = this.kind === 'robot' ? 'Color del robot' : 'Color del área';
			return marker;
		}
	}

	const syntaxColors = ViewPlugin.fromClass(
		class {
			decorations;
			constructor(editor: EditorView) {
				this.decorations = colorize(editor.state.doc.toString());
			}
			update(update: { docChanged: boolean; state: EditorView['state'] }) {
				if (update.docChanged) this.decorations = colorize(update.state.doc.toString());
			}
		},
		{ decorations: (plugin) => plugin.decorations }
	);

	const completions = [
		'programa',
		'procesos',
		'proceso',
		'areas',
		'robots',
		'robot',
		'variables',
		'comenzar',
		'fin',
		'si',
		'sino',
		'mientras',
		'repetir',
		'numero',
		'boolean',
		'mover',
		'derecha',
		'tomarFlor',
		'tomarPapel',
		'depositarFlor',
		'depositarPapel',
		'HayFlorEnLaEsquina',
		'HayPapelEnLaEsquina',
		'HayFlorEnLaBolsa',
		'HayPapelEnLaBolsa',
		'PosAv',
		'PosCa',
		'Pos',
		'Random',
		'Informar',
		'AsignarArea',
		'Iniciar',
		'AreaC',
		'AreaP',
		'AreaPC',
		'bloquearEsquina',
		'liberarEsquina',
		'enviarMensaje',
		'recibirMensaje'
	].map((label) => ({ label, type: /^[A-Z]/.test(label) ? 'function' : 'keyword' }));

	const functionDocumentation: Readonly<Record<string, string>> = {
		mover: 'Avanza una esquina en la orientación actual del robot.',
		derecha: 'Gira el robot 90° hacia la derecha.',
		tomarFlor: 'Guarda una flor de la esquina actual en la bolsa.',
		tomarPapel: 'Guarda un papel de la esquina actual en la bolsa.',
		depositarFlor: 'Deja una flor de la bolsa en la esquina actual.',
		depositarPapel: 'Deja un papel de la bolsa en la esquina actual.',
		HayFlorEnLaEsquina: 'Indica si hay al menos una flor en la esquina actual.',
		HayPapelEnLaEsquina: 'Indica si hay al menos un papel en la esquina actual.',
		HayFlorEnLaBolsa: 'Indica si el robot tiene al menos una flor en la bolsa.',
		HayPapelEnLaBolsa: 'Indica si el robot tiene al menos un papel en la bolsa.',
		PosAv: 'Devuelve la avenida de la posición actual del robot.',
		PosCa: 'Devuelve la calle de la posición actual del robot.',
		Pos: 'Traslada el robot a la avenida y calle indicadas dentro de su área.',
		Random: 'Guarda en una variable un número aleatorio dentro del rango indicado.',
		Informar: 'Muestra los valores indicados en la salida del programa.',
		AsignarArea: 'Asigna un área declarada a un robot antes de iniciarlo.',
		Iniciar: 'Inicia la ejecución de un robot en la posición indicada.',
		AreaC: 'Declara un área compartida por varios robots.',
		AreaP: 'Declara un área privada para un único robot.',
		AreaPC: 'Declara un área privada con acceso controlado.',
		bloquearEsquina: 'Reserva una esquina para que otros robots esperen antes de usarla.',
		liberarEsquina: 'Libera una esquina que este robot había reservado.',
		enviarMensaje: 'Envía un valor a otro robot.',
		recibirMensaje: 'Recibe un valor enviado por otro robot; espera si todavía no llegó.'
	};

	const booleanKinds: ReadonlySet<string> = new Set([TokenKind.True, TokenKind.False]);
	const commandKinds: ReadonlySet<string> = new Set([
		TokenKind.AreaC,
		TokenKind.AreaP,
		TokenKind.AreaPC,
		TokenKind.Move,
		TokenKind.TurnRight,
		TokenKind.TakeFlower,
		TokenKind.TakePaper,
		TokenKind.DropFlower,
		TokenKind.DropPaper,
		TokenKind.PositionAvenue,
		TokenKind.PositionStreet,
		TokenKind.SetPosition,
		TokenKind.FlowerAtCorner,
		TokenKind.PaperAtCorner,
		TokenKind.FlowerInBag,
		TokenKind.PaperInBag,
		TokenKind.Inform,
		TokenKind.AssignArea,
		TokenKind.StartRobot,
		TokenKind.Random,
		TokenKind.LockCorner,
		TokenKind.UnlockCorner,
		TokenKind.SendMessage,
		TokenKind.ReceiveMessage
	]);
	const operatorKinds: ReadonlySet<string> = new Set([
		TokenKind.Assign,
		TokenKind.Colon,
		TokenKind.Plus,
		TokenKind.Minus,
		TokenKind.Star,
		TokenKind.Slash,
		TokenKind.Equal,
		TokenKind.NotEqual,
		TokenKind.Less,
		TokenKind.LessEqual,
		TokenKind.Greater,
		TokenKind.GreaterEqual,
		TokenKind.Not,
		TokenKind.And,
		TokenKind.Or,
		TokenKind.LeftParenthesis,
		TokenKind.RightParenthesis,
		TokenKind.Comma,
		TokenKind.Semicolon
	]);
	const colorMarkerTheme = Object.fromEntries(
		(['robot', 'area'] as const).flatMap((kind) =>
			Array.from({ length: 5 }, (_, index) => [
				`.cm-rinfo-${kind}-${index + 1}`,
				{ backgroundColor: `var(--${kind}-${index + 1})` }
			])
		)
	);

	function executionLineStyle(colorIndices: readonly number[]): string {
		const colors = colorIndices
			.map((index) => `var(--robot-${(index % 5) + 1})`)
			.filter((color, index, all) => all.indexOf(color) === index);
		if (colors.length === 1) {
			return `background: color-mix(in srgb, ${colors[0]} 22%, var(--syntax-background)); box-shadow: inset 4px 0 0 ${colors[0]};`;
		}
		const section = 100 / colors.length;
		const stops = colors
			.map(
				(color, index) =>
					`color-mix(in srgb, ${color} 22%, var(--syntax-background)) ${index * section}% ${(index + 1) * section}%`
			)
			.join(', ');
		return `background: linear-gradient(90deg, ${stops}); box-shadow: inset 4px 0 0 ${colors[0]};`;
	}

	function documentationTooltip(view: EditorView, pos: number): Tooltip | null {
		const line = view.state.doc.lineAt(pos);
		const offset = pos - line.from;
		const before = line.text.slice(0, offset).match(/[\p{L}_][\p{L}\p{N}_]*$/u)?.[0] ?? '';
		const after = line.text.slice(offset).match(/^[\p{L}\p{N}_]*/u)?.[0] ?? '';
		const name = `${before}${after}`;
		const description = functionDocumentation[name];
		if (description === undefined || name.length === 0) return null;
		const from = pos - before.length;
		return {
			pos: from,
			end: from + name.length,
			above: true,
			create: () => {
				const dom = document.createElement('div');
				dom.className = 'cm-rinfo-tooltip';
				dom.textContent = description;
				return { dom };
			}
		};
	}

	onMount(() => {
		view = new EditorView({
			parent: host,
			doc: value,
			extensions: [
				lineNumbers(),
				history(),
				bracketMatching(),
				syntaxColors,
				executionLines,
				colorMarkerField,
				hoverTooltip(documentationTooltip, { hoverTime: 250, hideOnChange: true }),
				keymap.of([
					{ key: 'Tab', run: acceptCompletion },
					...defaultKeymap,
					...historyKeymap,
					indentWithTab
				]),
				autocompletion({ override: [completeRInfo] }),
				EditorView.lineWrapping,
				EditorView.updateListener.of((update) => {
					if (update.docChanged && !applyingExternalChange) onchange(update.state.doc.toString());
				}),
				EditorView.theme({
					'&': {
						height: '100%',
						fontSize: '13px',
						backgroundColor: 'var(--syntax-background)',
						color: 'var(--syntax-foreground)'
					},
					'.cm-editor, .cm-scroller': { backgroundColor: 'var(--syntax-background)' },
					'&.cm-focused .cm-cursor, &.cm-focused .cm-dropCursor': {
						borderLeftColor: 'var(--syntax-foreground) !important'
					},
					'&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
						backgroundColor: 'var(--syntax-selection)'
					},
					'.cm-scroller': { fontFamily: '"JetBrains Mono", "Cascadia Code", monospace' },
					'.cm-content': {
						padding: '12px 0',
						caretColor: 'var(--syntax-foreground)'
					},
					'.cm-gutters': {
						backgroundColor: 'var(--syntax-background)',
						color: 'var(--syntax-comment)',
						border: 'none'
					},
					'.cm-rinfo-executing-line': { transition: 'background 80ms linear' },
					'.cm-tooltip.cm-tooltip-hover': {
						maxWidth: '18rem',
						border: '1px solid var(--border)',
						borderRadius: '0',
						backgroundColor: 'var(--popover)',
						color: 'var(--popover-foreground)',
						boxShadow: '0 0.5rem 1.25rem rgb(0 0 0 / 18%)'
					},
					'.cm-tooltip-hover .cm-rinfo-tooltip': {
						padding: '0.5rem 0.625rem',
						fontFamily: 'var(--font-mono)',
						fontSize: '0.75rem',
						lineHeight: '1.4'
					},
					'.cm-rinfo-color': {
						display: 'inline-block',
						width: '0.7rem',
						height: '0.7rem',
						marginLeft: '0.4rem',
						border: '1px solid var(--syntax-foreground)',
						verticalAlign: '-0.05rem'
					},
					...colorMarkerTheme,
					'.tok-keyword': { color: 'var(--syntax-keyword)', fontWeight: '600' },
					'.tok-command': { color: 'var(--syntax-command)' },
					'.tok-number': { color: 'var(--syntax-number)' },
					'.tok-boolean': { color: 'var(--syntax-boolean)', fontWeight: '600' },
					'.tok-operator': { color: 'var(--syntax-operator)' },
					'.tok-comment': { color: 'var(--syntax-comment)', fontStyle: 'italic' }
				})
			]
		});
		refreshDecorations();
		return () => view?.destroy();
	});

	$effect(() => {
		if (view === undefined || view.state.doc.toString() === value) return;
		applyingExternalChange = true;
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
		applyingExternalChange = false;
	});

	$effect(() => {
		refreshDecorations(diagnostics, activeLines, colorMarkers);
	});

	export function reveal(span: SourceSpan): void {
		if (view === undefined) return;
		const from = Math.min(span.start.offset, view.state.doc.length);
		const to = Math.min(span.end.offset, view.state.doc.length);
		view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
		view.focus();
	}

	function refreshDecorations(
		currentDiagnostics: readonly Diagnostic[] = diagnostics,
		currentActiveLines: typeof activeLines = activeLines,
		currentColorMarkers: typeof colorMarkers = colorMarkers
	): void {
		if (view === undefined) return;
		const docLength = view.state.doc.length;
		const lint: CmDiagnostic[] = currentDiagnostics
			.filter(({ span }) => span !== undefined)
			.map((diagnostic) => ({
				from: Math.min(diagnostic.span!.start.offset, docLength),
				to: Math.min(diagnostic.span!.end.offset, docLength),
				severity: diagnostic.severity === 'info' ? 'info' : diagnostic.severity,
				message: diagnostic.message
			}));
		const effects: StateEffect<unknown>[] = [
			setActiveLines.of(currentActiveLines),
			setColorMarkers.of(currentColorMarkers)
		];
		view.dispatch(setDiagnostics(view.state, lint), { effects });
	}

	function completeRInfo(context: CompletionContext) {
		const word = context.matchBefore(/[\p{L}_][\p{L}\p{N}_]*/u);
		if (word === null || (word.from === word.to && !context.explicit)) return null;
		return { from: word.from, options: completions };
	}

	function colorize(source: string) {
		const result = lex(source);
		const ranges: { from: number; to: number; value: ReturnType<typeof Decoration.mark> }[] = [];
		for (const token of result.tokens) {
			if (token.kind === 'EndOfFile' || token.span.start.offset === token.span.end.offset) continue;
			let className = '';
			if (token.kind === TokenKind.Integer) className = 'tok-number';
			else if (booleanKinds.has(token.kind)) className = 'tok-boolean';
			else if (commandKinds.has(token.kind)) className = 'tok-command';
			else if (operatorKinds.has(token.kind)) className = 'tok-operator';
			else if (token.kind !== TokenKind.Identifier) className = 'tok-keyword';
			if (className)
				ranges.push({
					from: token.span.start.offset,
					to: token.span.end.offset,
					value: Decoration.mark({ class: className })
				});
		}
		for (const trivia of result.trivia) {
			if (trivia.kind === 'Comment')
				ranges.push({
					from: trivia.span.start.offset,
					to: trivia.span.end.offset,
					value: Decoration.mark({ class: 'tok-comment' })
				});
		}
		ranges.sort((a, b) => a.from - b.from || a.to - b.to);
		return Decoration.set(
			ranges.map(({ from, to, value }) => value.range(from, to)),
			true
		);
	}
</script>

<div class="h-full min-h-0 overflow-hidden" bind:this={host}></div>
