<script lang="ts">
	import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { bracketMatching } from '@codemirror/language';
	import { setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
	import { StateEffect, StateField } from '@codemirror/state';
	import { Decoration, EditorView, keymap, lineNumbers, ViewPlugin } from '@codemirror/view';
	import { onMount } from 'svelte';

	import type { Diagnostic } from '$lib/language/diagnostics/index.js';
	import { lex, TokenKind } from '$lib/language/lexer/index.js';
	import type { SourceSpan } from '$lib/language/source/index.js';

	let {
		value,
		diagnostics = [],
		activeSpan,
		onchange
	}: {
		value: string;
		diagnostics?: readonly Diagnostic[];
		activeSpan?: SourceSpan;
		onchange: (value: string) => void;
	} = $props();

	let host: HTMLDivElement;
	let view: EditorView | undefined;
	let applyingExternalChange = false;

	const setActiveSpan = StateEffect.define<SourceSpan | undefined>();
	const activeLine = StateField.define<ReturnType<typeof Decoration.set>>({
		create: () => Decoration.none,
		update(current, transaction) {
			current = current.map(transaction.changes);
			for (const effect of transaction.effects) {
				if (!effect.is(setActiveSpan)) continue;
				if (effect.value === undefined) return Decoration.none;
				const position = Math.min(effect.value.start.offset, transaction.state.doc.length);
				const line = transaction.state.doc.lineAt(position);
				return Decoration.set([
					Decoration.line({ class: 'cm-rinfo-current-line' }).range(line.from)
				]);
			}
			return current;
		},
		provide: (field) => EditorView.decorations.from(field)
	});

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

	onMount(() => {
		view = new EditorView({
			parent: host,
			doc: value,
			extensions: [
				lineNumbers(),
				history(),
				bracketMatching(),
				syntaxColors,
				activeLine,
				keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
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
					'.cm-cursor, .cm-dropCursor': {
						borderLeftColor: 'var(--syntax-foreground) !important'
					},
					'&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
						backgroundColor: 'var(--syntax-selection)'
					},
					'.cm-scroller': { fontFamily: '"JetBrains Mono", "Cascadia Code", monospace' },
					'.cm-content': { padding: '12px 0' },
					'.cm-gutters': {
						backgroundColor: 'var(--syntax-background)',
						color: 'var(--syntax-comment)',
						border: 'none'
					},
					'.cm-rinfo-current-line': { backgroundColor: 'var(--syntax-active-line)' },
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
		refreshDecorations(diagnostics, activeSpan);
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
		currentSpan: SourceSpan | undefined = activeSpan
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
		view.dispatch(setDiagnostics(view.state, lint), { effects: setActiveSpan.of(currentSpan) });
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
