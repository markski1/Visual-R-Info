import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { analyze } from '../../language/index.js';
import { loadProgramScenario } from './program-loader.js';

describe('cargador de programas', () => {
	it('construye áreas y robots desde el bloque principal', () => {
		const source = readFileSync(
			new URL('../../../../tests/fixtures/valid/programa-completo.ri', import.meta.url),
			'utf8'
		);
		const analysis = analyze(source);
		expect(analysis.program).toBeDefined();
		if (analysis.program === undefined) return;
		const scenario = loadProgramScenario(analysis.program, {
			corners: [{ coordinate: { avenue: 1, street: 1 }, contents: { flowers: 2, papers: 0 } }],
			randomSeed: 42
		});
		expect(scenario).toMatchObject({
			ok: true,
			value: {
				randomSeed: 42
			}
		});
		if (!scenario.ok) return;
		expect(scenario.value.areas.get('ciudad')).toMatchObject({ maxAvenue: 100, maxStreet: 100 });
		expect(scenario.value.robots.get('Rinfo')).toMatchObject({
			typeName: 'robot1',
			position: { avenue: 1, street: 1 },
			assignedAreas: ['ciudad']
		});
		expect(scenario.value.city.get({ avenue: 1, street: 1 }).flowers).toBe(2);
	});

	it('rechaza robots sin iniciar', () => {
		const result = analyze(`programa incompleto
areas
  ciudad: AreaC(1,1,100,100)
robots
  robot tipo
  comenzar
    derecha
  fin
variables
  R: tipo
comenzar
  AsignarArea(R,ciudad)
fin`);
		expect(result.program).toBeDefined();
		if (result.program !== undefined) {
			expect(loadProgramScenario(result.program)).toMatchObject({
				ok: false,
				error: { code: 'RUN014' }
			});
		}
	});
});
