import type { AreaType } from '../../language/ast/index.js';
import type { Coordinate } from './coordinate.js';
import { createCoordinate } from './coordinate.js';
import { failure, success, type RuntimeResult } from './result.js';

export interface AreaBounds {
	readonly minAvenue: number;
	readonly minStreet: number;
	readonly maxAvenue: number;
	readonly maxStreet: number;
}

export interface RuntimeArea extends AreaBounds {
	readonly name: string;
	readonly type: AreaType;
}

export function createArea(
	name: string,
	type: AreaType,
	bounds: AreaBounds
): RuntimeResult<RuntimeArea> {
	if (name.trim().length === 0) return failure('RUN004', 'El área necesita un nombre.');
	const minimum = createCoordinate(bounds.minAvenue, bounds.minStreet);
	if (!minimum.ok) return minimum;
	const maximum = createCoordinate(bounds.maxAvenue, bounds.maxStreet);
	if (!maximum.ok) return maximum;
	if (bounds.minAvenue > bounds.maxAvenue || bounds.minStreet > bounds.maxStreet) {
		return failure('RUN004', `El área \`${name}\` tiene sus límites invertidos.`);
	}
	return success({ name, type, ...bounds });
}

export function areaContains(area: RuntimeArea, coordinate: Coordinate): boolean {
	return (
		coordinate.avenue >= area.minAvenue &&
		coordinate.avenue <= area.maxAvenue &&
		coordinate.street >= area.minStreet &&
		coordinate.street <= area.maxStreet
	);
}
