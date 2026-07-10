import type { SourceSpan } from '../source/index.js';

export type DiagnosticPhase = 'lexer' | 'parser' | 'semantic' | 'runtime';
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface RelatedDiagnostic {
	readonly message: string;
	readonly span: SourceSpan;
}

export interface Diagnostic {
	readonly code: string;
	readonly phase: DiagnosticPhase;
	readonly severity: DiagnosticSeverity;
	readonly message: string;
	readonly span?: SourceSpan;
	readonly related?: readonly RelatedDiagnostic[];
}
