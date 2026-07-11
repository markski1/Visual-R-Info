import type { ValidatedProgram } from '../../language/analysis/index.js';
import type {
	CallStatement,
	ProcessDeclaration,
	RobotCommand,
	Statement,
	VariableDeclaration
} from '../../language/ast/index.js';
import { evaluateExpression } from '../evaluator/index.js';
import { loadProgramScenario, type ScenarioSettings } from '../loader/index.js';
import {
	areaContains,
	createCoordinate,
	failure,
	success,
	type Coordinate,
	type ObjectKind,
	type Orientation,
	type RuntimeArea,
	type Scenario,
	type RuntimeResult
} from '../model/index.js';
import {
	createExecutionState,
	Environment,
	type BlockFrame,
	type ExecutionFrame,
	type ExecutionState,
	type RobotExecutionContext,
	type RuntimeValue
} from '../state/index.js';
import type { RuntimeEvent } from './events.js';

export interface RunOptions {
	readonly maxSteps?: number;
}

export interface RunResult {
	readonly events: readonly RuntimeEvent[];
	readonly status: ExecutionState['status'];
	readonly steps: number;
}

export interface RuntimeSnapshot {
	readonly status: ExecutionState['status'];
	readonly stepCount: number;
	readonly corners: ReturnType<ExecutionState['city']['entries']>;
	readonly areas: readonly RuntimeArea[];
	readonly robots: readonly {
		readonly id: string;
		readonly state: RobotExecutionContext['state'];
		readonly variables: Readonly<Record<string, RuntimeValue>>;
	}[];
	readonly output: readonly RuntimeValue[];
	readonly locks: readonly (readonly [string, string])[];
	readonly pendingMessages: number;
}

export function createRuntime(
	program: ValidatedProgram,
	settings: ScenarioSettings = {}
): RuntimeResult<RInfoRuntime> {
	const scenario = loadProgramScenario(program, settings);
	if (!scenario.ok) return scenario;
	const state = createExecutionState(program, scenario.value);
	if (!state.ok) return state;
	return success(new RInfoRuntime(program, scenario.value, state.value));
}

export class RInfoRuntime {
	private readonly processes: ReadonlyMap<string, ProcessDeclaration>;
	private nextRobot = 0;

	public constructor(
		private readonly program: ValidatedProgram,
		private readonly scenario: Scenario,
		public state: ExecutionState
	) {
		this.processes = new Map(program.ast.processes.map((process) => [process.name.name, process]));
	}

	/** Ejecuta una sola línea visible y devuelve los cambios que la UI debe animar. */
	public step(): readonly RuntimeEvent[] {
		if (this.state.status === 'finished' || this.state.status === 'failed') return [];
		this.state.status = 'running';
		while (true) {
			const selected = this.selectRobot();
			if (selected === undefined) {
				this.state.status = 'finished';
				return [{ kind: 'program-finished' }];
			}
			const [robotId, robot] = selected;
			if (robot.state.status === 'ready' || robot.state.status === 'blocked') {
				robot.state = { ...robot.state, status: 'running' };
			}
			const instruction = this.nextInstruction(robot);
			if (instruction === undefined) {
				robot.state = { ...robot.state, status: 'finished' };
				continue;
			}
			const events = this.executeInstruction(
				robotId,
				robot,
				instruction.statement,
				instruction.environment,
				instruction.sourceFrame
			);
			this.state.stepCount += 1;
			const unfinished = [...this.state.robots.values()].filter(
				(candidate) => candidate.frames.length > 0
			);
			if (
				unfinished.length > 0 &&
				unfinished.every((candidate) => candidate.state.status === 'blocked')
			) {
				this.state.status = 'failed';
				events.push({
					kind: 'runtime-error',
					error: {
						code: 'RUN024',
						message:
							'Todos los robots quedaron esperando. Revisá los mensajes y bloqueos del programa.'
					}
				});
			}
			return events;
		}
	}

	public run(options: RunOptions = {}): RunResult {
		const maxSteps = options.maxSteps ?? 10_000;
		const events: RuntimeEvent[] = [];
		while (this.state.status !== 'finished' && this.state.status !== 'failed') {
			if (this.state.stepCount >= maxSteps) {
				this.state.status = 'failed';
				events.push({
					kind: 'runtime-error',
					error: {
						code: 'RUN020',
						message: `La ejecución superó el límite de ${maxSteps} pasos. Revisá si hay un ciclo que no termina.`
					}
				});
				break;
			}
			events.push(...this.step());
		}
		return { events, status: this.state.status, steps: this.state.stepCount };
	}

	public pause(): void {
		if (this.state.status === 'running') this.state.status = 'paused';
	}

	public reset(): void {
		const reset = createExecutionState(this.program, this.scenario);
		if (!reset.ok) return;
		this.state = reset.value;
		this.nextRobot = 0;
	}

	public getSnapshot(): RuntimeSnapshot {
		return {
			status: this.state.status,
			stepCount: this.state.stepCount,
			corners: this.state.city
				.entries()
				.map(([coordinate, contents]) => [{ ...coordinate }, { ...contents }] as const),
			areas: [...this.state.areas.values()].map((area) => ({ ...area })),
			robots: [...this.state.robots].map(([id, robot]) => ({
				id,
				state: {
					...robot.state,
					position: { ...robot.state.position },
					bag: { ...robot.state.bag },
					assignedAreas: [...robot.state.assignedAreas]
				},
				variables: robot.environment.snapshot()
			})),
			output: [...this.state.output],
			locks: [...this.state.locks],
			pendingMessages: this.state.messages.length
		};
	}

	private selectRobot(): readonly [string, RobotExecutionContext] | undefined {
		const active = [...this.state.robots].filter(([, robot]) => robot.frames.length > 0);
		if (active.length === 0) return undefined;
		const selected = active[this.nextRobot % active.length];
		this.nextRobot = (this.nextRobot + 1) % active.length;
		return selected;
	}

	private nextInstruction(robot: RobotExecutionContext):
		| {
				readonly statement: Statement;
				readonly environment: Environment;
				readonly sourceFrame?: BlockFrame;
		  }
		| undefined {
		while (robot.frames.length > 0) {
			const frame = robot.frames.at(-1) as ExecutionFrame;
			if (frame.kind === 'block') {
				const statement = frame.statements[frame.nextStatement++];
				if (statement !== undefined)
					return { statement, environment: frame.environment, sourceFrame: frame };
				robot.frames.pop();
				continue;
			}
			if (frame.kind === 'while')
				return { statement: frame.statement, environment: frame.environment };
			frame.remaining -= 1;
			if (frame.remaining <= 0) {
				robot.frames.pop();
				continue;
			}
			return { statement: frame.statement, environment: frame.environment };
		}
		return undefined;
	}

	private executeInstruction(
		robotId: string,
		robot: RobotExecutionContext,
		statement: Statement,
		environment: Environment,
		sourceFrame?: BlockFrame
	): RuntimeEvent[] {
		const events: RuntimeEvent[] = [
			{
				kind: 'instruction-started',
				robotId,
				span: statement.span,
				nodeId: statement.id,
				statementKind: statement.kind
			}
		];
		const result = this.executeStatement(
			robotId,
			robot,
			statement,
			environment,
			events,
			sourceFrame
		);
		if (!result.ok) {
			this.state.status = 'failed';
			robot.state = { ...robot.state, status: 'failed' };
			events.push({
				kind: 'runtime-error',
				robotId,
				span: result.error.span ?? statement.span,
				error: result.error
			});
		}
		return events;
	}

	private executeStatement(
		robotId: string,
		robot: RobotExecutionContext,
		statement: Statement,
		environment: Environment,
		events: RuntimeEvent[],
		sourceFrame?: BlockFrame
	): RuntimeResult<undefined> {
		const context = { environment, city: this.state.city, robot: robot.state };
		switch (statement.kind) {
			case 'AssignmentStatement': {
				const value = evaluateExpression(statement.value, context);
				if (!value.ok) return value;
				const cell = environment.resolve(statement.target.name);
				if (cell === undefined)
					return failure(
						'RUN007',
						`La variable \`${statement.target.name}\` no está disponible.`,
						statement.span
					);
				cell.value = value.value;
				return success(undefined);
			}
			case 'RobotCommandStatement':
				return this.executeRobotCommand(robotId, robot, statement.command, statement, events);
			case 'CallStatement':
				return this.executeCall(robotId, robot, statement, environment, events, sourceFrame);
			case 'IfStatement': {
				const condition = evaluateExpression(statement.condition, context);
				if (!condition.ok) return condition;
				const branch = condition.value ? statement.thenBranch : (statement.elseBranch ?? []);
				if (branch.length > 0) robot.frames.push(blockFrame(branch, environment));
				return success(undefined);
			}
			case 'WhileStatement': {
				const top = robot.frames.at(-1);
				if (top?.kind !== 'while' || top.statement !== statement) {
					robot.frames.push({ kind: 'while', statement, environment });
				}
				const condition = evaluateExpression(statement.condition, context);
				if (!condition.ok) return condition;
				if (condition.value) robot.frames.push(blockFrame(statement.body, environment));
				else robot.frames.pop();
				return success(undefined);
			}
			case 'RepeatStatement': {
				const top = robot.frames.at(-1);
				if (top?.kind === 'repeat' && top.statement === statement) {
					robot.frames.push(blockFrame(statement.body, environment));
					return success(undefined);
				}
				const count = evaluateExpression(statement.count, context);
				if (!count.ok) return count;
				if (typeof count.value !== 'number' || count.value < 0)
					return failure(
						'RUN015',
						'La cantidad de repeticiones debe ser un entero no negativo.',
						statement.count.span
					);
				if (count.value > 0) {
					robot.frames.push({ kind: 'repeat', statement, environment, remaining: count.value });
					robot.frames.push(blockFrame(statement.body, environment));
				}
				return success(undefined);
			}
			case 'BlockStatement':
				robot.frames.push(blockFrame(statement.statements, environment));
				return success(undefined);
			case 'ErrorStatement':
				return failure(
					'RUN009',
					'No se puede ejecutar una instrucción con errores de sintaxis.',
					statement.span
				);
		}
	}

	private executeRobotCommand(
		robotId: string,
		robot: RobotExecutionContext,
		command: RobotCommand,
		statement: Statement,
		events: RuntimeEvent[]
	): RuntimeResult<undefined> {
		if (command === 'derecha') {
			const from = robot.state.orientation;
			const to = turnRight(from);
			robot.state = { ...robot.state, orientation: to };
			events.push({ kind: 'robot-turned', robotId, span: statement.span, from, to });
			return success(undefined);
		}
		if (command === 'mover') {
			const from = robot.state.position;
			const destination = nextCoordinate(from, robot.state.orientation);
			const coordinate = createCoordinate(destination.avenue, destination.street);
			if (!coordinate.ok)
				return { ok: false, error: { ...coordinate.error, span: statement.span } };
			if (!this.positionAllowed(robot, coordinate.value))
				return failure(
					'RUN016',
					'El robot no puede salir de las áreas que tiene asignadas.',
					statement.span
				);
			robot.state = { ...robot.state, position: coordinate.value };
			events.push({
				kind: 'robot-moved',
				robotId,
				span: statement.span,
				from,
				to: coordinate.value
			});
			return success(undefined);
		}

		const object: ObjectKind = command.endsWith('Flor') ? 'flower' : 'paper';
		const bagKey = object === 'flower' ? 'flowers' : 'papers';
		if (command.startsWith('tomar')) {
			const removed = this.state.city.remove(robot.state.position, object);
			if (!removed.ok) return { ok: false, error: { ...removed.error, span: statement.span } };
			robot.state = {
				...robot.state,
				bag: { ...robot.state.bag, [bagKey]: robot.state.bag[bagKey] + 1 }
			};
			events.push({ kind: 'object-taken', robotId, span: statement.span, object });
			return success(undefined);
		}
		if (robot.state.bag[bagKey] === 0)
			return failure(
				'RUN017',
				`El robot no tiene ${object === 'flower' ? 'flores' : 'papeles'} en la bolsa.`,
				statement.span
			);
		const added = this.state.city.add(robot.state.position, object);
		if (!added.ok) return added;
		robot.state = {
			...robot.state,
			bag: { ...robot.state.bag, [bagKey]: robot.state.bag[bagKey] - 1 }
		};
		events.push({ kind: 'object-dropped', robotId, span: statement.span, object });
		return success(undefined);
	}

	private executeCall(
		robotId: string,
		robot: RobotExecutionContext,
		call: CallStatement,
		environment: Environment,
		events: RuntimeEvent[],
		sourceFrame?: BlockFrame
	): RuntimeResult<undefined> {
		const context = { environment, city: this.state.city, robot: robot.state };
		if (call.callee.name === 'Informar') {
			const values: RuntimeValue[] = [];
			for (const argument of call.arguments) {
				const value = evaluateExpression(argument, context);
				if (!value.ok) return value;
				values.push(value.value);
			}
			this.state.output.push(...values);
			events.push({ kind: 'output', robotId, span: call.span, values });
			return success(undefined);
		}
		if (call.callee.name === 'Pos') {
			const position = this.numericArguments(call.arguments, call, environment, robot, 2);
			if (!position.ok) return position;
			const coordinate = createCoordinate(position.value[0], position.value[1]);
			if (!coordinate.ok) return { ok: false, error: { ...coordinate.error, span: call.span } };
			if (!this.positionAllowed(robot, coordinate.value))
				return failure(
					'RUN016',
					'La posición indicada queda fuera de las áreas del robot.',
					call.span
				);
			const from = robot.state.position;
			robot.state = { ...robot.state, position: coordinate.value };
			events.push({ kind: 'robot-moved', robotId, span: call.span, from, to: coordinate.value });
			return success(undefined);
		}
		if (call.callee.name === 'Random') {
			const target = call.arguments[0];
			if (target?.kind !== 'IdentifierExpression')
				return failure(
					'RUN007',
					'`Random` necesita una variable como primer argumento.',
					call.span
				);
			const bounds = this.numericArguments(call.arguments.slice(1), call, environment, robot, 2);
			if (!bounds.ok) return bounds;
			if (bounds.value[0] > bounds.value[1])
				return failure('RUN018', 'El mínimo de `Random` no puede superar al máximo.', call.span);
			const cell = environment.resolve(target.name);
			if (cell === undefined)
				return failure('RUN007', `La variable \`${target.name}\` no está disponible.`, target.span);
			cell.value = this.randomInteger(bounds.value[0], bounds.value[1]);
			return success(undefined);
		}
		if (call.callee.name === 'bloquearEsquina' || call.callee.name === 'liberarEsquina') {
			const coordinates = this.numericArguments(call.arguments, call, environment, robot, 2);
			if (!coordinates.ok) return coordinates;
			const coordinate = createCoordinate(coordinates.value[0], coordinates.value[1]);
			if (!coordinate.ok) return { ok: false, error: { ...coordinate.error, span: call.span } };
			const key = `${coordinate.value.avenue}:${coordinate.value.street}`;
			const owner = this.state.locks.get(key);
			if (call.callee.name === 'bloquearEsquina') {
				if (owner !== undefined && owner !== robotId) {
					return this.blockRobot(robotId, robot, call, sourceFrame, events, 'lock');
				}
				this.state.locks.set(key, robotId);
				events.push({
					kind: 'corner-locked',
					robotId,
					span: call.span,
					coordinate: coordinate.value
				});
				return success(undefined);
			}
			if (owner !== robotId)
				return failure(
					'RUN021',
					'El robot sólo puede liberar una esquina que haya bloqueado.',
					call.span
				);
			this.state.locks.delete(key);
			events.push({
				kind: 'corner-unlocked',
				robotId,
				span: call.span,
				coordinate: coordinate.value
			});
			return success(undefined);
		}
		if (call.callee.name === 'enviarMensaje') {
			const recipient = robotName(call.arguments[1]);
			if (recipient === undefined || !this.state.robots.has(recipient))
				return failure(
					'RUN022',
					'`enviarMensaje` necesita un robot destinatario válido.',
					call.span
				);
			const value = call.arguments[0];
			if (value === undefined)
				return failure('RUN019', 'Falta el mensaje que se quiere enviar.', call.span);
			const evaluated = evaluateExpression(value, context);
			if (!evaluated.ok) return evaluated;
			this.state.messages.push({ sender: robotId, recipient, value: evaluated.value });
			events.push({
				kind: 'message-sent',
				robotId,
				span: call.span,
				peerId: recipient,
				value: evaluated.value
			});
			return success(undefined);
		}
		if (call.callee.name === 'recibirMensaje') {
			const target = call.arguments[0];
			const sender = robotName(call.arguments[1]);
			if (target?.kind !== 'IdentifierExpression' || sender === undefined)
				return failure(
					'RUN022',
					'`recibirMensaje` necesita una variable y un robot emisor.',
					call.span
				);
			const messageIndex = this.state.messages.findIndex(
				(message) => message.recipient === robotId && message.sender === sender
			);
			if (messageIndex < 0) {
				return this.blockRobot(robotId, robot, call, sourceFrame, events, 'message');
			}
			const [message] = this.state.messages.splice(messageIndex, 1);
			const cell = environment.resolve(target.name);
			if (cell === undefined)
				return failure('RUN007', `La variable \`${target.name}\` no está disponible.`, target.span);
			cell.value = message.value;
			events.push({
				kind: 'message-received',
				robotId,
				span: call.span,
				peerId: sender,
				value: message.value
			});
			return success(undefined);
		}

		const process = this.processes.get(call.callee.name);
		if (process !== undefined) return this.callProcess(process, call, robot, environment);
		return failure(
			'RUN013',
			`La operación \`${call.callee.name}\` todavía no está disponible en este runtime.`,
			call.span
		);
	}

	private blockRobot(
		robotId: string,
		robot: RobotExecutionContext,
		call: CallStatement,
		sourceFrame: BlockFrame | undefined,
		events: RuntimeEvent[],
		reason: 'message' | 'lock'
	): RuntimeResult<undefined> {
		if (sourceFrame === undefined)
			return failure('RUN023', 'No se pudo suspender esta instrucción de CMRE.', call.span);
		sourceFrame.nextStatement -= 1;
		robot.state = { ...robot.state, status: 'blocked' };
		events.push({ kind: 'robot-blocked', robotId, span: call.span, reason });
		return success(undefined);
	}

	private callProcess(
		process: ProcessDeclaration,
		call: CallStatement,
		robot: RobotExecutionContext,
		caller: Environment
	): RuntimeResult<undefined> {
		const environment = new Environment();
		for (const [index, parameter] of process.parameters.entries()) {
			const argument = call.arguments[index];
			if (argument === undefined)
				return failure('RUN019', `Falta el argumento \`${parameter.name.name}\`.`, call.span);
			if (parameter.mode === 'E') {
				const value = evaluateExpression(argument, {
					environment: caller,
					city: this.state.city,
					robot: robot.state
				});
				if (!value.ok) return value;
				const declared = environment.declare(parameter.name.name, value.value);
				if (!declared.ok) return declared;
			} else {
				if (argument.kind !== 'IdentifierExpression')
					return failure(
						'RUN019',
						`El parámetro ${parameter.mode} necesita una variable.`,
						argument.span
					);
				const cell = caller.resolve(argument.name);
				if (cell === undefined)
					return failure(
						'RUN007',
						`La variable \`${argument.name}\` no está disponible.`,
						argument.span
					);
				const bound = environment.bind(parameter.name.name, cell);
				if (!bound.ok) return bound;
			}
		}
		declareVariables(environment, process.variables);
		robot.frames.push(blockFrame(process.body, environment));
		return success(undefined);
	}

	private numericArguments(
		expressions: CallStatement['arguments'],
		call: CallStatement,
		environment: Environment,
		robot: RobotExecutionContext,
		count: number
	): RuntimeResult<readonly number[]> {
		if (expressions.length !== count)
			return failure('RUN019', `\`${call.callee.name}\` espera ${count} argumentos.`, call.span);
		const values: number[] = [];
		for (const argument of expressions) {
			const result = evaluateExpression(argument, {
				environment,
				city: this.state.city,
				robot: robot.state
			});
			if (!result.ok) return result;
			if (typeof result.value !== 'number')
				return failure('RUN008', 'Se esperaba un valor numérico.', argument.span);
			values.push(result.value);
		}
		return success(values);
	}

	private positionAllowed(robot: RobotExecutionContext, coordinate: Coordinate): boolean {
		return robot.state.assignedAreas.some((name) => {
			const area = this.state.areas.get(name);
			return area !== undefined && areaContains(area, coordinate);
		});
	}

	private randomInteger(minimum: number, maximum: number): number {
		this.state.randomSeed = (Math.imul(this.state.randomSeed, 1_664_525) + 1_013_904_223) >>> 0;
		return minimum + (this.state.randomSeed % (maximum - minimum + 1));
	}
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
		const value: RuntimeValue = declaration.typeName === 'numero' ? 0 : false;
		for (const binding of declaration.names) environment.declare(binding.name, value);
	}
}

function turnRight(orientation: Orientation): Orientation {
	const orientations: readonly Orientation[] = ['north', 'east', 'south', 'west'];
	return orientations[(orientations.indexOf(orientation) + 1) % orientations.length];
}

function nextCoordinate(position: Coordinate, orientation: Orientation): Coordinate {
	if (orientation === 'north') return { avenue: position.avenue, street: position.street + 1 };
	if (orientation === 'east') return { avenue: position.avenue + 1, street: position.street };
	if (orientation === 'south') return { avenue: position.avenue, street: position.street - 1 };
	return { avenue: position.avenue - 1, street: position.street };
}

function robotName(expression: CallStatement['arguments'][number] | undefined): string | undefined {
	return expression?.kind === 'IdentifierExpression' ? expression.name : undefined;
}
