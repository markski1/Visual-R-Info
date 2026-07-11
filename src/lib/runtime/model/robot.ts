import { areaContains, type RuntimeArea } from './area.js';
import type { Coordinate } from './coordinate.js';
import { failure, success, type RuntimeResult } from './result.js';

export type Orientation = 'north' | 'east' | 'south' | 'west';
export type RobotStatus = 'ready' | 'running' | 'blocked' | 'finished' | 'failed';

export interface RobotBag {
	readonly flowers: number;
	readonly papers: number;
}

export interface RobotState {
	readonly id: string;
	readonly typeName: string;
	readonly position: Coordinate;
	readonly orientation: Orientation;
	readonly bag: RobotBag;
	readonly assignedAreas: readonly string[];
	readonly status: RobotStatus;
}

export interface RobotInitialState {
	readonly id: string;
	readonly typeName: string;
	readonly position: Coordinate;
	readonly orientation?: Orientation;
	readonly bag?: RobotBag;
	readonly assignedAreas: readonly string[];
}

export function createRobot(
	initial: RobotInitialState,
	areas: ReadonlyMap<string, RuntimeArea>
): RuntimeResult<RobotState> {
	if (initial.id.trim().length === 0 || initial.typeName.trim().length === 0) {
		return failure('RUN004', 'Cada robot necesita un nombre de instancia y un tipo.');
	}
	const bag = initial.bag ?? { flowers: 0, papers: 0 };
	if (!isBag(bag))
		return failure('RUN002', 'La bolsa del robot sólo admite cantidades enteras no negativas.');
	if (initial.assignedAreas.length === 0) {
		return failure('RUN004', `El robot \`${initial.id}\` no tiene un área asignada.`);
	}
	for (const areaName of initial.assignedAreas) {
		const area = areas.get(areaName);
		if (area === undefined) return failure('RUN004', `El área \`${areaName}\` no existe.`);
	}
	if (!isPositionAllowed(initial.position, initial.assignedAreas, areas)) {
		return failure(
			'RUN004',
			`La posición inicial del robot \`${initial.id}\` queda fuera de sus áreas.`
		);
	}
	return success({
		...initial,
		orientation: initial.orientation ?? 'north',
		bag,
		status: 'ready'
	});
}

function isPositionAllowed(
	position: Coordinate,
	assignedAreas: readonly string[],
	areas: ReadonlyMap<string, RuntimeArea>
): boolean {
	return assignedAreas.some((name) => {
		const area = areas.get(name);
		return area !== undefined && areaContains(area, position);
	});
}

function isBag(bag: RobotBag): boolean {
	return (
		Number.isSafeInteger(bag.flowers) &&
		bag.flowers >= 0 &&
		Number.isSafeInteger(bag.papers) &&
		bag.papers >= 0
	);
}
