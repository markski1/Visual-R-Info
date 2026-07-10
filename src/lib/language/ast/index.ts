import type { SourceSpan } from '../source/index.js';

export interface BaseNode<Kind extends string> {
	readonly kind: Kind;
	readonly id: string;
	readonly span: SourceSpan;
}

export type UnaryOperator = '-' | '~';
export type BinaryOperator =
	'+' | '-' | '*' | '/' | '=' | '<>' | '<' | '<=' | '>' | '>=' | '&' | '|';

export type RobotSensor =
	| 'PosAv'
	| 'PosCa'
	| 'HayFlorEnLaEsquina'
	| 'HayPapelEnLaEsquina'
	| 'HayFlorEnLaBolsa'
	| 'HayPapelEnLaBolsa';

export interface IntegerLiteralExpression extends BaseNode<'IntegerLiteralExpression'> {
	/** Se conserva el texto hasta que NumericSemantics defina rango y overflow. */
	readonly raw: string;
}

export interface BooleanLiteralExpression extends BaseNode<'BooleanLiteralExpression'> {
	readonly value: boolean;
}

export interface IdentifierExpression extends BaseNode<'IdentifierExpression'> {
	readonly name: string;
}

export interface RobotSensorExpression extends BaseNode<'RobotSensorExpression'> {
	readonly sensor: RobotSensor;
}

export interface UnaryExpression extends BaseNode<'UnaryExpression'> {
	readonly operator: UnaryOperator;
	readonly operand: Expression;
}

export interface BinaryExpression extends BaseNode<'BinaryExpression'> {
	readonly operator: BinaryOperator;
	readonly left: Expression;
	readonly right: Expression;
}

export interface ParenthesizedExpression extends BaseNode<'ParenthesizedExpression'> {
	readonly expression: Expression;
}

/** Nodo de recuperación; nunca puede formar parte de un ValidatedProgram. */
export type ErrorExpression = BaseNode<'ErrorExpression'>;

export type Expression =
	| IntegerLiteralExpression
	| BooleanLiteralExpression
	| IdentifierExpression
	| RobotSensorExpression
	| UnaryExpression
	| BinaryExpression
	| ParenthesizedExpression
	| ErrorExpression;

/** El ID es reproducible para el mismo tipo de nodo y el mismo rango de fuente. */
export function createNodeId(kind: Expression['kind'], span: SourceSpan): string {
	return `${kind}:${span.start.offset}:${span.end.offset}`;
}
