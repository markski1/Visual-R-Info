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
export function createNodeId(kind: string, span: SourceSpan): string {
	return `${kind}:${span.start.offset}:${span.end.offset}`;
}

export type RInfoPrimitiveType = 'numero' | 'boolean';
export type ParameterMode = 'E' | 'S' | 'ES';
export type AreaType = 'AreaC' | 'AreaP' | 'AreaPC';

export interface IdentifierBinding {
	readonly name: string;
	readonly span: SourceSpan;
}

export interface VariableDeclaration extends BaseNode<'VariableDeclaration'> {
	readonly names: readonly IdentifierBinding[];
	readonly typeName: string;
}

export interface ParameterDeclaration extends BaseNode<'ParameterDeclaration'> {
	readonly mode: ParameterMode;
	readonly name: IdentifierBinding;
	readonly typeName: RInfoPrimitiveType;
}

export interface ProcessDeclaration extends BaseNode<'ProcessDeclaration'> {
	readonly name: IdentifierBinding;
	readonly parameters: readonly ParameterDeclaration[];
	readonly variables: readonly VariableDeclaration[];
	readonly body: readonly Statement[];
}

export interface AreaDeclaration extends BaseNode<'AreaDeclaration'> {
	readonly name: IdentifierBinding;
	readonly areaType: AreaType;
	readonly arguments: readonly Expression[];
}

export interface RobotDeclaration extends BaseNode<'RobotDeclaration'> {
	readonly name: IdentifierBinding;
	readonly variables: readonly VariableDeclaration[];
	readonly body: readonly Statement[];
}

export interface AssignmentStatement extends BaseNode<'AssignmentStatement'> {
	readonly target: IdentifierBinding;
	readonly value: Expression;
}

export interface CallStatement extends BaseNode<'CallStatement'> {
	readonly callee: IdentifierBinding;
	readonly arguments: readonly Expression[];
}

export type RobotCommand =
	'mover' | 'derecha' | 'tomarFlor' | 'tomarPapel' | 'depositarFlor' | 'depositarPapel';

export interface RobotCommandStatement extends BaseNode<'RobotCommandStatement'> {
	readonly command: RobotCommand;
}

export interface IfStatement extends BaseNode<'IfStatement'> {
	readonly condition: Expression;
	readonly thenBranch: readonly Statement[];
	readonly elseBranch?: readonly Statement[];
}

export interface WhileStatement extends BaseNode<'WhileStatement'> {
	readonly condition: Expression;
	readonly body: readonly Statement[];
}

export interface RepeatStatement extends BaseNode<'RepeatStatement'> {
	readonly count: Expression;
	readonly body: readonly Statement[];
}

export interface BlockStatement extends BaseNode<'BlockStatement'> {
	readonly statements: readonly Statement[];
}

export type ErrorStatement = BaseNode<'ErrorStatement'>;

export type Statement =
	| AssignmentStatement
	| CallStatement
	| RobotCommandStatement
	| IfStatement
	| WhileStatement
	| RepeatStatement
	| BlockStatement
	| ErrorStatement;

export interface ProgramNode extends BaseNode<'Program'> {
	readonly name: IdentifierBinding;
	readonly processes: readonly ProcessDeclaration[];
	readonly areas: readonly AreaDeclaration[];
	readonly robots: readonly RobotDeclaration[];
	readonly variables: readonly VariableDeclaration[];
	readonly body: readonly Statement[];
}
