/** Ubicación en el fuente. El offset es UTF-16 y base cero; línea y columna empiezan en uno. */
export interface SourcePosition {
	readonly offset: number;
	readonly line: number;
	readonly column: number;
}

/** Rango semiabierto: incluye `start` y excluye `end`. */
export interface SourceSpan {
	readonly start: SourcePosition;
	readonly end: SourcePosition;
}
