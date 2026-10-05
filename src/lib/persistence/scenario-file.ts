import type { ScenarioCorner } from '../runtime/index.js';

export const SCENARIO_FILE_VERSION = 1;

export interface ScenarioFile {
	readonly version: typeof SCENARIO_FILE_VERSION;
	readonly city: {
		readonly width: 100;
		readonly height: 100;
	};
	readonly corners: readonly ScenarioCorner[];
}

export type ScenarioFileResult =
	| { readonly ok: true; readonly value: ScenarioFile }
	| { readonly ok: false; readonly message: string };

export function serializeScenario(corners: readonly ScenarioCorner[]): string {
	const scenario: ScenarioFile = {
		version: SCENARIO_FILE_VERSION,
		city: { width: 100, height: 100 },
		corners
	};
	return `${JSON.stringify(scenario, undefined, 2)}\n`;
}

export function parseScenario(source: string): ScenarioFileResult {
	let value: unknown;
	try {
		value = JSON.parse(source);
	} catch {
		return { ok: false, message: 'El archivo de escenario no contiene JSON válido.' };
	}
	if (!isRecord(value) || value.version !== SCENARIO_FILE_VERSION)
		return {
			ok: false,
			message: `El escenario debe usar la versión ${SCENARIO_FILE_VERSION}.`
		};
	if (!isRecord(value.city) || value.city.width !== 100 || value.city.height !== 100)
		return {
			ok: false,
			message: 'El escenario debe definir una ciudad de 100 avenidas por 100 calles.'
		};
	if (!Array.isArray(value.corners))
		return { ok: false, message: 'El escenario debe incluir una lista de esquinas.' };

	const corners: ScenarioCorner[] = [];
	const coordinates = new Set<string>();
	for (const [index, corner] of value.corners.entries()) {
		const parsed = parseCorner(corner, index + 1);
		if (!parsed.ok) return parsed;
		const key = `${parsed.value.coordinate.avenue}:${parsed.value.coordinate.street}`;
		if (coordinates.has(key))
			return {
				ok: false,
				message: `La esquina (${parsed.value.coordinate.avenue}, ${parsed.value.coordinate.street}) está repetida.`
			};
		coordinates.add(key);
		corners.push(parsed.value);
	}

	return {
		ok: true,
		value: {
			version: SCENARIO_FILE_VERSION,
			city: { width: 100, height: 100 },
			corners
		}
	};
}

function parseCorner(
	value: unknown,
	index: number
):
	| { readonly ok: true; readonly value: ScenarioCorner }
	| { readonly ok: false; readonly message: string } {
	if (!isRecord(value) || !isRecord(value.coordinate) || !isRecord(value.contents))
		return { ok: false, message: `La esquina ${index} no tiene un formato válido.` };
	const { avenue, street } = value.coordinate;
	const { flowers, papers } = value.contents;
	if (!isCoordinate(avenue) || !isCoordinate(street))
		return {
			ok: false,
			message: `La esquina ${index} debe usar avenidas y calles enteras entre 1 y 100.`
		};
	if (!isQuantity(flowers) || !isQuantity(papers))
		return {
			ok: false,
			message: `La esquina ${index} debe tener cantidades enteras no negativas.`
		};
	return {
		ok: true,
		value: {
			coordinate: { avenue, street },
			contents: { flowers, papers }
		}
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isCoordinate(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100;
}

function isQuantity(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
