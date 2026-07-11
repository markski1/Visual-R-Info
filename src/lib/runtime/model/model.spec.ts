import { describe, expect, it } from 'vitest';

import {
	City,
	areaContains,
	createArea,
	createCoordinate,
	createRobot,
	createScenario,
	type Coordinate,
	type RuntimeArea
} from './index.js';

const origin: Coordinate = { avenue: 1, street: 1 };
const fullCity: RuntimeArea = {
	name: 'ciudad',
	type: 'AreaC',
	minAvenue: 1,
	minStreet: 1,
	maxAvenue: 100,
	maxStreet: 100
};

describe('modelo de escenario', () => {
	it('valida los límites de la ciudad y de las áreas', () => {
		expect(createCoordinate(1, 100)).toEqual({ ok: true, value: { avenue: 1, street: 100 } });
		expect(createCoordinate(0, 1)).toMatchObject({ ok: false, error: { code: 'RUN001' } });
		expect(
			createArea('inversa', 'AreaP', { minAvenue: 5, minStreet: 1, maxAvenue: 2, maxStreet: 4 })
		).toMatchObject({ ok: false, error: { code: 'RUN004' } });
		expect(areaContains(fullCity, { avenue: 100, street: 100 })).toBe(true);
	});

	it('guarda solamente las esquinas no vacías y devuelve copias estables', () => {
		const city = new City();
		expect(city.set(origin, { flowers: 2, papers: 1 }).ok).toBe(true);
		expect(city.entries()).toEqual([[origin, { flowers: 2, papers: 1 }]]);

		const removedFlower = city.remove(origin, 'flower');
		expect(removedFlower).toMatchObject({ ok: true, value: { flowers: 1, papers: 1 } });
		expect(city.set(origin, { flowers: 0, papers: 0 }).ok).toBe(true);
		expect(city.entries()).toEqual([]);
		expect(city.set({ avenue: 101, street: 1 }, { flowers: 1, papers: 0 })).toMatchObject({
			ok: false,
			error: { code: 'RUN001' }
		});
	});

	it('rechaza cantidades negativas y tomar un objeto inexistente', () => {
		const city = new City();
		expect(city.set(origin, { flowers: -1, papers: 0 })).toMatchObject({
			ok: false,
			error: { code: 'RUN002' }
		});
		expect(city.remove(origin, 'paper')).toMatchObject({ ok: false, error: { code: 'RUN003' } });
		expect(city.add(origin, 'flower', -1)).toMatchObject({
			ok: false,
			error: { code: 'RUN002' }
		});
	});

	it('clona la ciudad sin compartir sus mutaciones', () => {
		const city = new City();
		city.add(origin, 'paper', 2);
		const copy = city.clone();
		copy.remove(origin, 'paper');
		expect(city.get(origin).papers).toBe(2);
		expect(copy.get(origin).papers).toBe(1);
	});

	it('crea robots orientados al norte y exige una posición dentro de sus áreas', () => {
		const areas = new Map([[fullCity.name, fullCity]]);
		const robot = createRobot(
			{ id: 'Rinfo', typeName: 'robot1', position: origin, assignedAreas: ['ciudad'] },
			areas
		);
		expect(robot).toMatchObject({
			ok: true,
			value: { orientation: 'north', bag: { flowers: 0, papers: 0 }, status: 'ready' }
		});

		const smallArea = { ...fullCity, maxAvenue: 2, maxStreet: 2 };
		expect(
			createRobot(
				{
					id: 'R2',
					typeName: 'robot1',
					position: { avenue: 3, street: 1 },
					assignedAreas: ['ciudad']
				},
				new Map([['ciudad', smallArea]])
			)
		).toMatchObject({ ok: false, error: { code: 'RUN004' } });
	});

	it('arma un escenario determinista y rechaza nombres repetidos', () => {
		const scenario = createScenario({
			areas: [fullCity],
			corners: [{ coordinate: origin, contents: { flowers: 3, papers: 0 } }],
			robots: [{ id: 'Rinfo', typeName: 'robot1', position: origin, assignedAreas: ['ciudad'] }]
		});
		expect(scenario).toMatchObject({ ok: true, value: { randomSeed: 1 } });
		if (scenario.ok) {
			expect(scenario.value.city.get(origin)).toEqual({ flowers: 3, papers: 0 });
			expect(scenario.value.robots.get('Rinfo')?.position).toEqual(origin);
		}

		expect(createScenario({ areas: [fullCity, fullCity], robots: [] })).toMatchObject({
			ok: false,
			error: { code: 'RUN004' }
		});
	});
});
