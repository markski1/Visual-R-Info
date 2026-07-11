import type { Expression, ProcessDeclaration, Statement } from '../../language/ast/index.js';
import type { Environment } from './environment.js';

interface BaseFrame<Kind extends string> {
	readonly kind: Kind;
	readonly environment: Environment;
}

export interface BlockFrame extends BaseFrame<'block'> {
	readonly statements: readonly Statement[];
	/** Índice de la próxima instrucción; el scheduler lo actualiza explícitamente. */
	nextStatement: number;
}

export interface WhileFrame extends BaseFrame<'while'> {
	readonly condition: Expression;
	readonly body: readonly Statement[];
}

export interface RepeatFrame extends BaseFrame<'repeat'> {
	readonly body: readonly Statement[];
	remaining: number;
}

export interface ProcessFrame extends BaseFrame<'process'> {
	readonly declaration: ProcessDeclaration;
}

export type ExecutionFrame = BlockFrame | WhileFrame | RepeatFrame | ProcessFrame;
