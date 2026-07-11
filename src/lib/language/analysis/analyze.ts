import type { ProgramNode } from '../ast/index.js';
import type { Diagnostic, DiagnosticPhase } from '../diagnostics/index.js';
import { lex, type Token } from '../lexer/index.js';
import { parseProgram } from '../parser/index.js';
import { RINFO_CORE_PROFILE, type LanguageProfile } from '../profiles/index.js';
import { analyzeSemantics, type SymbolTable } from '../semantics/index.js';

export interface AnalysisOptions {
	readonly profile?: LanguageProfile;
}

export interface ValidatedProgram {
	readonly profile: LanguageProfile;
	readonly source: string;
	readonly ast: ProgramNode;
	readonly symbols: SymbolTable;
}

export interface AnalysisResult {
	readonly ast: ProgramNode;
	readonly tokens: readonly Token[];
	readonly diagnostics: readonly Diagnostic[];
	readonly program?: ValidatedProgram;
}

const PHASE_ORDER: Readonly<Record<DiagnosticPhase, number>> = {
	lexer: 0,
	parser: 1,
	semantic: 2,
	runtime: 3
};

export function analyze(source: string, options: AnalysisOptions = {}): AnalysisResult {
	const profile = options.profile ?? RINFO_CORE_PROFILE;
	const lexical = lex(source);
	const parsed = parseProgram(lexical.tokens);
	const syntaxDiagnostics = [...lexical.diagnostics, ...parsed.diagnostics];
	const hasSyntaxErrors = syntaxDiagnostics.some(({ severity }) => severity === 'error');
	const semantic = hasSyntaxErrors
		? { symbols: { symbols: [] }, diagnostics: [] }
		: analyzeSemantics(parsed.program);
	const diagnostics = [...syntaxDiagnostics, ...semantic.diagnostics].sort(compareDiagnostics);
	const hasErrors = diagnostics.some(({ severity }) => severity === 'error');

	return {
		ast: parsed.program,
		tokens: lexical.tokens,
		diagnostics,
		...(hasErrors
			? {}
			: {
					program: {
						profile,
						source,
						ast: parsed.program,
						symbols: semantic.symbols
					} satisfies ValidatedProgram
				})
	};
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
	const offsetDifference =
		(left.span?.start.offset ?? Number.MAX_SAFE_INTEGER) -
		(right.span?.start.offset ?? Number.MAX_SAFE_INTEGER);
	if (offsetDifference !== 0) return offsetDifference;
	return PHASE_ORDER[left.phase] - PHASE_ORDER[right.phase];
}
