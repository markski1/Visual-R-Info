import { describe, expect, it } from 'vitest';

import { analyze } from '../../language/index.js';
import { createRuntime } from './runtime.js';

const COMPLETE_PROGRAM = `programa ejecucion
procesos
  proceso sumar(ES valor: numero)
  comenzar
    valor:=valor+1
  fin
areas
  ciudad: AreaC(1,1,100,100)
robots
  robot tipo
  variables
    n: numero
  comenzar
    n:=0
    repetir 2
      mover
    sumar(n)
    si (n=1)
      derecha
    mover
    tomarFlor
    depositarFlor
    Random(n,5,5)
    mientras (n<7)
      n:=n+1
    Informar(n)
  fin
variables
  R: tipo
comenzar
  AsignarArea(R,ciudad)
  Iniciar(R,1,1)
fin`;

describe('ejecutor', () => {
	it('ejecuta procesos, control de flujo y primitivas hasta terminar', () => {
		const analysis = analyze(COMPLETE_PROGRAM);
		expect(analysis.diagnostics).toEqual([]);
		if (analysis.program === undefined) return;
		const created = createRuntime(analysis.program, {
			corners: [{ coordinate: { avenue: 2, street: 3 }, contents: { flowers: 1, papers: 0 } }]
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const result = created.value.run();
		expect(result.status).toBe('finished');
		expect(created.value.state.robots.get('R')?.state).toMatchObject({
			position: { avenue: 2, street: 3 },
			orientation: 'east',
			bag: { flowers: 0, papers: 0 },
			status: 'finished'
		});
		expect(created.value.state.city.get({ avenue: 2, street: 3 }).flowers).toBe(1);
		expect(created.value.state.output).toEqual([7]);
		expect(result.events.map(({ kind }) => kind)).toEqual(
			expect.arrayContaining([
				'robot-moved',
				'robot-turned',
				'object-taken',
				'object-dropped',
				'output'
			])
		);
	});

	it('cada step ejecuta una sola instrucción visible con su rango fuente', () => {
		const analysis = analyze(COMPLETE_PROGRAM);
		if (analysis.program === undefined) throw new Error('El programa de prueba debe ser válido.');
		const created = createRuntime(analysis.program, {
			corners: [{ coordinate: { avenue: 2, street: 3 }, contents: { flowers: 1, papers: 0 } }]
		});
		if (!created.ok) throw new Error(created.error.message);
		const first = created.value.step();
		expect(first).toHaveLength(1);
		expect(first[0]).toMatchObject({
			kind: 'instruction-started',
			robotId: 'R',
			statementKind: 'AssignmentStatement',
			span: { start: { line: 14 } }
		});
		expect(created.value.state.stepCount).toBe(1);

		const second = created.value.step();
		expect(second.filter(({ kind }) => kind === 'instruction-started')).toHaveLength(1);
		expect(second[0]).toMatchObject({
			statementKind: 'RepeatStatement',
			span: { start: { line: 15 } }
		});
		expect(created.value.state.stepCount).toBe(2);
	});

	it('detiene la ejecución ante un movimiento fuera de la ciudad', () => {
		const source = COMPLETE_PROGRAM.replace('Iniciar(R,1,1)', 'Iniciar(R,1,100)');
		const analysis = analyze(source);
		if (analysis.program === undefined) throw new Error('El programa de prueba debe ser válido.');
		const created = createRuntime(analysis.program);
		if (!created.ok) throw new Error(created.error.message);
		created.value.step();
		created.value.step();
		const events = created.value.step();
		expect(events.at(-1)).toMatchObject({
			kind: 'runtime-error',
			error: { code: 'RUN001' }
		});
		expect(created.value.state.status).toBe('failed');
	});
});
