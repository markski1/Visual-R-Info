import type { ValidatedProgram } from '../../language/analysis/index.js';
import type { VariableDeclaration } from '../../language/ast/index.js';
import { type Scenario, type RobotState } from '../model/index.js';
import { failure, success, type RuntimeResult } from '../model/result.js';
import { Environment, type RuntimeValue } from './environment.js';
import type { BlockFrame, ExecutionFrame } from './frames.js';

export type ExecutionStatus = 'ready' | 'running' | 'paused' | 'finished' | 'failed';

export interface RobotExecutionContext {
	state: RobotState;
	readonly environment: Environment;
	readonly frames: ExecutionFrame[];
}

export interface ExecutionState {
	status: ExecutionStatus;
	stepCount: number;
	randomSeed: number;
	readonly city: Scenario['city'];
	readonly areas: Scenario['areas'];
	readonly robots: Map<string, RobotExecutionContext>;
	readonly output: RuntimeValue[];
	/** Estado compartido de CMRE (Concurrent Multi Robot Environment). */
	readonly locks: Map<string, string>;
	readonly messages: RuntimeMessage[];
}

export interface RuntimeMessage {
	readonly sender: string;
	readonly recipient: string;
	readonly value: RuntimeValue;
}

export function createExecutionState(
	program: ValidatedProgram,
	scenario: Scenario
): RuntimeResult<ExecutionState> {
	const mainEnvironment = new Environment();
	declareVariables(mainEnvironment, program.ast.variables);
	const declarations = new Map(program.ast.robots.map((robot) => [robot.name.name, robot]));
	const robots = new Map<string, RobotExecutionContext>();

	for (const [id, state] of scenario.robots) {
		const declaration = declarations.get(state.typeName);
		if (declaration === undefined) {
			return failure(
				'RUN012',
				`El escenario usa el tipo de robot \`${state.typeName}\`, que no existe en este programa.`
			);
		}
		const environment = new Environment(mainEnvironment);
		declareVariables(environment, declaration.variables);
		robots.set(id, {
			state: cloneRobotState(state),
			environment,
			frames: [blockFrame(declaration.body, environment)]
		});
	}

	return success({
		status: 'ready',
		stepCount: 0,
		randomSeed: scenario.randomSeed,
		city: scenario.city.clone(),
		areas: new Map(scenario.areas),
		robots,
		output: [],
		locks: new Map(),
		messages: []
	});
}

function blockFrame(statements: BlockFrame['statements'], environment: Environment): BlockFrame {
	return { kind: 'block', statements, environment, nextStatement: 0 };
}

function declareVariables(
	environment: Environment,
	declarations: readonly VariableDeclaration[]
): void {
	for (const declaration of declarations) {
		if (declaration.typeName !== 'numero' && declaration.typeName !== 'boolean') continue;
		const initial = declaration.typeName === 'numero' ? 0 : false;
		for (const binding of declaration.names) environment.declare(binding.name, initial);
	}
}

function cloneRobotState(state: RobotState): RobotState {
	return {
		...state,
		position: { ...state.position },
		bag: { ...state.bag },
		assignedAreas: [...state.assignedAreas]
	};
}
