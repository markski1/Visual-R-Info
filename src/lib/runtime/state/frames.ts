import type { RepeatStatement, Statement, WhileStatement } from '../../language/ast/index.js';
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
	readonly statement: WhileStatement;
}

export interface RepeatFrame extends BaseFrame<'repeat'> {
	readonly statement: RepeatStatement;
	remaining: number;
}

export type ExecutionFrame = BlockFrame | WhileFrame | RepeatFrame;
