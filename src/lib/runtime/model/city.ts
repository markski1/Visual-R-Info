import { coordinateKey, isValidCoordinate, type Coordinate } from './coordinate.js';
import { failure, success, type RuntimeResult } from './result.js';

export type ObjectKind = 'flower' | 'paper';

export interface CornerContents {
	readonly flowers: number;
	readonly papers: number;
}

const EMPTY_CORNER: CornerContents = Object.freeze({ flowers: 0, papers: 0 });

/** Ciudad dispersa: las esquinas vacías no ocupan una entrada en memoria. */
export class City {
	private readonly corners = new Map<string, CornerContents>();

	public get(coordinate: Coordinate): CornerContents {
		return this.corners.get(coordinateKey(coordinate)) ?? EMPTY_CORNER;
	}

	public set(coordinate: Coordinate, contents: CornerContents): RuntimeResult<CornerContents> {
		if (!isValidCoordinate(coordinate)) {
			return failure(
				'RUN001',
				`La esquina (${coordinate.avenue}, ${coordinate.street}) queda fuera de la ciudad.`
			);
		}
		if (!isQuantity(contents.flowers) || !isQuantity(contents.papers)) {
			return failure(
				'RUN002',
				'Las cantidades de flores y papeles deben ser enteras no negativas.'
			);
		}
		const normalized = { flowers: contents.flowers, papers: contents.papers };
		const key = coordinateKey(coordinate);
		if (normalized.flowers === 0 && normalized.papers === 0) this.corners.delete(key);
		else this.corners.set(key, normalized);
		return success(normalized);
	}

	public add(coordinate: Coordinate, kind: ObjectKind, amount = 1): RuntimeResult<CornerContents> {
		if (!isQuantity(amount))
			return failure('RUN002', 'La cantidad a agregar debe ser entera y no negativa.');
		const current = this.get(coordinate);
		return this.set(coordinate, {
			flowers: current.flowers + (kind === 'flower' ? amount : 0),
			papers: current.papers + (kind === 'paper' ? amount : 0)
		});
	}

	public remove(coordinate: Coordinate, kind: ObjectKind): RuntimeResult<CornerContents> {
		const current = this.get(coordinate);
		const available = kind === 'flower' ? current.flowers : current.papers;
		if (available === 0) {
			const objectName = kind === 'flower' ? 'flores' : 'papeles';
			return failure('RUN003', `No hay ${objectName} en esta esquina.`);
		}
		return this.set(coordinate, {
			flowers: current.flowers - (kind === 'flower' ? 1 : 0),
			papers: current.papers - (kind === 'paper' ? 1 : 0)
		});
	}

	public entries(): readonly (readonly [Coordinate, CornerContents])[] {
		return [...this.corners.entries()]
			.map(([key, contents]) => {
				const [avenue, street] = key.split(':').map(Number);
				return [{ avenue, street }, contents] as const;
			})
			.sort(([left], [right]) => left.avenue - right.avenue || left.street - right.street);
	}

	public clone(): City {
		const copy = new City();
		for (const [coordinate, contents] of this.entries()) copy.set(coordinate, contents);
		return copy;
	}
}

function isQuantity(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}
