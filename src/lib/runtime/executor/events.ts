import type { Statement } from '../../language/ast/index.js';
import type { SourceSpan } from '../../language/source/index.js';
import type { Coordinate, Orientation, RuntimeError } from '../model/index.js';
import type { RuntimeValue } from '../state/index.js';

interface RuntimeEventBase<Kind extends string> {
	readonly kind: Kind;
	readonly robotId: string;
	readonly span: SourceSpan;
}

export interface InstructionStartedEvent extends RuntimeEventBase<'instruction-started'> {
	readonly nodeId: Statement['id'];
	readonly statementKind: Statement['kind'];
}

export interface RobotMovedEvent extends RuntimeEventBase<'robot-moved'> {
	readonly from: Coordinate;
	readonly to: Coordinate;
}

export interface RobotTurnedEvent extends RuntimeEventBase<'robot-turned'> {
	readonly from: Orientation;
	readonly to: Orientation;
}

export interface ObjectChangedEvent extends RuntimeEventBase<'object-taken' | 'object-dropped'> {
	readonly object: 'flower' | 'paper';
}

export interface OutputEvent extends RuntimeEventBase<'output'> {
	readonly values: readonly RuntimeValue[];
}

export interface RuntimeErrorEvent extends RuntimeEventBase<'runtime-error'> {
	readonly error: RuntimeError;
}

export interface ProgramFinishedEvent {
	readonly kind: 'program-finished';
}

export type RuntimeEvent =
	| InstructionStartedEvent
	| RobotMovedEvent
	| RobotTurnedEvent
	| ObjectChangedEvent
	| OutputEvent
	| RuntimeErrorEvent
	| ProgramFinishedEvent;
