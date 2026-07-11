import { City, type CornerContents } from './city.js';
import type { Coordinate } from './coordinate.js';
import { createArea, type RuntimeArea } from './area.js';
import { createRobot, type RobotInitialState, type RobotState } from './robot.js';
import { failure, success, type RuntimeResult } from './result.js';

export interface ScenarioCorner {
	readonly coordinate: Coordinate;
	readonly contents: CornerContents;
}

export interface ScenarioDefinition {
	readonly areas: readonly RuntimeArea[];
	readonly corners?: readonly ScenarioCorner[];
	readonly robots: readonly RobotInitialState[];
	readonly randomSeed?: number;
}

export interface Scenario {
	readonly city: City;
	readonly areas: ReadonlyMap<string, RuntimeArea>;
	readonly robots: ReadonlyMap<string, RobotState>;
	readonly randomSeed: number;
}

export function createScenario(definition: ScenarioDefinition): RuntimeResult<Scenario> {
	const areas = new Map<string, RuntimeArea>();
	for (const area of definition.areas) {
		if (areas.has(area.name)) return failure('RUN004', `El área \`${area.name}\` está repetida.`);
		const validated = createArea(area.name, area.type, area);
		if (!validated.ok) return validated;
		areas.set(area.name, validated.value);
	}

	const city = new City();
	for (const corner of definition.corners ?? []) {
		const result = city.set(corner.coordinate, corner.contents);
		if (!result.ok) return result;
	}

	const robots = new Map<string, RobotState>();
	for (const initial of definition.robots) {
		if (robots.has(initial.id))
			return failure('RUN004', `El robot \`${initial.id}\` está repetido.`);
		const result = createRobot(initial, areas);
		if (!result.ok) return result;
		robots.set(initial.id, result.value);
	}

	const randomSeed = definition.randomSeed ?? 1;
	if (!Number.isSafeInteger(randomSeed))
		return failure('RUN004', 'La semilla aleatoria debe ser un entero seguro.');
	return success({ city, areas, robots, randomSeed });
}
