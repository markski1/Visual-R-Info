import { describe, expect, it } from 'vitest';

import { analyze } from '../../language/analysis/index.js';
import { createScenario } from '../model/scenario.js';
import type { RuntimeArea } from '../model/area.js';
import { Environment } from './environment.js';
import { createExecutionState } from './execution-state.js';

const area: RuntimeArea = {
	name: 'ciudad',
	type: 'AreaC',
	minAvenue: 1,
	minStreet: 1,
	maxAvenue: 100,
	maxStreet: 100
};

describe('estado de ejecución', () => {
	it('comparte celdas para futuros parámetros S y ES', () => {
		const caller = new Environment();
		const declared = caller.declare('valor', 1);
		expect(declared.ok).toBe(true);
		if (!declared.ok) return;
		const process = new Environment();
		process.bind('resultado', declared.value);
		const result = process.resolve('resultado');
		expect(result).toBeDefined();
		if (result === undefined) throw new Error('No se vinculó la celda compartida.');
		result.value = 7;
		expect(caller.resolve('valor')?.value).toBe(7);
		expect(process.declare('resultado', 2)).toMatchObject({
			ok: false,
			error: { code: 'RUN010' }
		});
	});

	it('crea frames independientes y no modifica el escenario original', () => {
		const source = `programa p
areas
  ciudad: AreaC(1,1,100,100)
robots
  robot tipo
  variables
    n: numero
  comenzar
    n:=1
  fin
variables
  R: tipo
comenzar
  AsignarArea(R,ciudad)
  Iniciar(R,1,1)
fin`;
		const analysis = analyze(source);
		const scenario = createScenario({
			areas: [area],
			robots: [
				{ id: 'R', typeName: 'tipo', position: { avenue: 1, street: 1 }, assignedAreas: ['ciudad'] }
			]
		});
		expect(analysis.program).toBeDefined();
		expect(scenario.ok).toBe(true);
		if (analysis.program === undefined || !scenario.ok) return;
		const state = createExecutionState(analysis.program, scenario.value);
		expect(state.ok).toBe(true);
		if (!state.ok) return;
		expect(state.value.mainFrames).toHaveLength(1);
		const robotContext = state.value.robots.get('R');
		expect(robotContext).toBeDefined();
		if (robotContext === undefined) throw new Error('No se creó el contexto del robot.');
		expect(robotContext.frames).toHaveLength(1);
		expect(robotContext.frames[0]).toMatchObject({ kind: 'block', nextStatement: 0 });
		expect(robotContext.environment.snapshot()).toEqual({ n: 0 });
		state.value.city.add({ avenue: 1, street: 1 }, 'flower');
		expect(scenario.value.city.get({ avenue: 1, street: 1 }).flowers).toBe(0);
	});

	it('rechaza escenarios incompatibles en lugar de omitir robots', () => {
		const analysis = analyze(`programa p
areas
  ciudad: AreaC(1,1,100,100)
robots
  robot conocido
  comenzar
	  derecha
  fin
variables
  R: conocido
comenzar
	AsignarArea(R,ciudad)
	Iniciar(R,1,1)
fin`);
		const scenario = createScenario({
			areas: [area],
			robots: [
				{
					id: 'R',
					typeName: 'desconocido',
					position: { avenue: 1, street: 1 },
					assignedAreas: ['ciudad']
				}
			]
		});
		expect(analysis.program).toBeDefined();
		expect(scenario.ok).toBe(true);
		if (analysis.program !== undefined && scenario.ok) {
			expect(createExecutionState(analysis.program, scenario.value)).toMatchObject({
				ok: false,
				error: { code: 'RUN012' }
			});
		}
	});
});
