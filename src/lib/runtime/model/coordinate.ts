import { failure, success, type RuntimeResult } from './result.js';

export const CITY_MIN_COORDINATE = 1;
export const CITY_MAX_COORDINATE = 100;

export interface Coordinate {
	readonly avenue: number;
	readonly street: number;
}

export function createCoordinate(avenue: number, street: number): RuntimeResult<Coordinate> {
	if (!isValidCoordinate({ avenue, street })) {
		return failure(
			'RUN001',
			`La esquina (${avenue}, ${street}) queda fuera de la ciudad, que va de 1 a 100.`
		);
	}
	return success({ avenue, street });
}

export function isValidCoordinate(coordinate: Coordinate): boolean {
	return isCityCoordinate(coordinate.avenue) && isCityCoordinate(coordinate.street);
}

export function coordinateKey(coordinate: Coordinate): string {
	return `${coordinate.avenue}:${coordinate.street}`;
}

function isCityCoordinate(value: number): boolean {
	return Number.isInteger(value) && value >= CITY_MIN_COORDINATE && value <= CITY_MAX_COORDINATE;
}
