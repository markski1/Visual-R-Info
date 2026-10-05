import type { ValidatedProgram } from '../../language/analysis/analyze.js';
import type { CallStatement, Expression } from '../../language/ast/index.js';
import { evaluateExpression } from '../evaluator/expression-evaluator.js';
import {
	createArea,
	createScenario,
	failure,
	type RuntimeResult,
	type Scenario,
	type ScenarioCorner
} from '../model/index.js';
import { Environment } from '../state/environment.js';

export interface ScenarioSettings {
	readonly corners?: readonly ScenarioCorner[];
	readonly randomSeed?: number;
}

interface RobotSetup {
	readonly id: string;
	readonly typeName: string;
	readonly areas: string[];
	position?: { readonly avenue: number; readonly street: number };
}

/** Convierte las declaraciones y el bloque principal en el estado inicial ejecutable. */
export function loadProgramScenario(
	program: ValidatedProgram,
	settings: ScenarioSettings = {}
): RuntimeResult<Scenario> {
	const environment = new Environment();
	const areas = [];
	for (const declaration of program.ast.areas) {
		if (declaration.arguments.length !== 4) {
			return failure(
				'RUN014',
				`El área \`${declaration.name.name}\` necesita cuatro coordenadas.`,
				declaration.span
			);
		}
		const coordinates: number[] = [];
		for (const argument of declaration.arguments) {
			const coordinate = constantNumber(argument, environment);
			if (!coordinate.ok) return coordinate;
			coordinates.push(coordinate.value);
		}
		const [minAvenue, minStreet, maxAvenue, maxStreet] = coordinates as [
			number,
			number,
			number,
			number
		];
		const area = createArea(declaration.name.name, declaration.areaType, {
			minAvenue,
			minStreet,
			maxAvenue,
			maxStreet
		});
		if (!area.ok) return area;
		areas.push(area.value);
	}

	const robotTypes = new Set(program.ast.robots.map(({ name }) => name.name));
	const robots = new Map<string, RobotSetup>();
	for (const declaration of program.ast.variables) {
		if (!robotTypes.has(declaration.typeName)) continue;
		for (const binding of declaration.names) {
			robots.set(binding.name, { id: binding.name, typeName: declaration.typeName, areas: [] });
		}
	}

	for (const statement of program.ast.body) {
		if (statement.kind !== 'CallStatement') {
			return failure(
				'RUN013',
				'El bloque principal sólo puede configurar áreas e iniciar robots.',
				statement.span
			);
		}
		const applied = applySetupCall(statement, robots, environment);
		if (!applied.ok) return applied;
	}

	const initialRobots = [];
	for (const robot of robots.values()) {
		if (robot.position === undefined)
			return failure('RUN014', `Falta iniciar el robot \`${robot.id}\`.`);
		if (robot.areas.length === 0)
			return failure('RUN014', `Falta asignarle un área al robot \`${robot.id}\`.`);
		initialRobots.push({
			id: robot.id,
			typeName: robot.typeName,
			position: robot.position,
			assignedAreas: robot.areas
		});
	}

	return createScenario({ areas, robots: initialRobots, ...settings });
}

function applySetupCall(
	call: CallStatement,
	robots: Map<string, RobotSetup>,
	environment: Environment
): RuntimeResult<undefined> {
	const robotName = identifierName(call.arguments[0]);
	const robot = robotName === undefined ? undefined : robots.get(robotName);
	if (robot === undefined)
		return failure('RUN014', 'La configuración referencia un robot inexistente.', call.span);

	if (call.callee.name === 'AsignarArea') {
		const areaName = identifierName(call.arguments[1]);
		if (areaName === undefined)
			return failure('RUN014', '`AsignarArea` necesita el nombre de un área.', call.span);
		if (!robot.areas.includes(areaName)) robot.areas.push(areaName);
		return { ok: true, value: undefined };
	}
	if (call.callee.name === 'Iniciar') {
		if (robot.position !== undefined)
			return failure('RUN014', `El robot \`${robot.id}\` fue iniciado más de una vez.`, call.span);
		const avenue = constantNumber(call.arguments[1], environment);
		if (!avenue.ok) return avenue;
		const street = constantNumber(call.arguments[2], environment);
		if (!street.ok) return street;
		robot.position = { avenue: avenue.value, street: street.value };
		return { ok: true, value: undefined };
	}
	return failure(
		'RUN013',
		`\`${call.callee.name}\` no se puede ejecutar en el bloque principal.`,
		call.span
	);
}

function constantNumber(
	expression: Expression | undefined,
	environment: Environment
): RuntimeResult<number> {
	if (expression === undefined)
		return failure('RUN014', 'Falta una coordenada en la configuración.');
	const result = evaluateExpression(expression, { environment });
	if (!result.ok) return result;
	return typeof result.value === 'number'
		? { ok: true, value: result.value }
		: failure('RUN014', 'Las coordenadas deben ser numéricas.', expression.span);
}

function identifierName(expression: Expression | undefined): string | undefined {
	return expression?.kind === 'IdentifierExpression' ? expression.name : undefined;
}
