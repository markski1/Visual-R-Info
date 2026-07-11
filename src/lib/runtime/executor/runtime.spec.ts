import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { analyze } from '../../language/index.js';
import { CMRE_PROFILE } from '../../language/profiles/index.js';
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
		expect(created.value.getSnapshot().areas).toEqual([
			{
				name: 'ciudad',
				type: 'AreaC',
				minAvenue: 1,
				minStreet: 1,
				maxAvenue: 100,
				maxStreet: 100
			}
		]);
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

	it('distingue Pos de un movimiento para no dibujar un recorrido de teletransporte', () => {
		const source = `programa teletransporte
areas
  ciudad: AreaC(1,1,100,100)
robots
  robot viajero
  comenzar
    Pos(20,30)
  fin
variables
  R: viajero
comenzar
  AsignarArea(R,ciudad)
  Iniciar(R,1,1)
fin`;
		const analysis = analyze(source);
		if (analysis.program === undefined) throw new Error('El programa debe ser válido.');
		const created = createRuntime(analysis.program);
		if (!created.ok) throw new Error(created.error.message);
		const result = created.value.run();
		expect(result.events).toContainEqual(
			expect.objectContaining({
				kind: 'robot-moved',
				movement: 'teleport',
				from: { avenue: 1, street: 1 },
				to: { avenue: 20, street: 30 }
			})
		);
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

	it('produce snapshots desacoplados y vuelve al estado inicial con reset', () => {
		const analysis = analyze(COMPLETE_PROGRAM);
		if (analysis.program === undefined) throw new Error('El programa de prueba debe ser válido.');
		const created = createRuntime(analysis.program, {
			corners: [{ coordinate: { avenue: 2, street: 3 }, contents: { flowers: 1, papers: 0 } }]
		});
		if (!created.ok) throw new Error(created.error.message);
		const initial = created.value.getSnapshot();
		created.value.run();
		expect(initial.robots[0].state.position).toEqual({ avenue: 1, street: 1 });
		created.value.reset();
		expect(created.value.getSnapshot()).toMatchObject({
			status: 'ready',
			stepCount: 0,
			output: [],
			pendingMessages: 0
		});
		expect(created.value.state.city.get({ avenue: 2, street: 3 }).flowers).toBe(1);
	});

	it('emite un error pedagógico al superar el límite de pasos', () => {
		const source = COMPLETE_PROGRAM.replace(
			'    mientras (n<7)\n      n:=n+1',
			'    mientras (V)\n      derecha'
		);
		const analysis = analyze(source);
		if (analysis.program === undefined) throw new Error('El programa de prueba debe ser válido.');
		const created = createRuntime(analysis.program, {
			corners: [{ coordinate: { avenue: 2, street: 3 }, contents: { flowers: 1, papers: 0 } }]
		});
		if (!created.ok) throw new Error(created.error.message);
		const result = created.value.run({ maxSteps: 30 });
		expect(result.status).toBe('failed');
		expect(result.events.at(-1)).toMatchObject({
			kind: 'runtime-error',
			error: { code: 'RUN020' }
		});
	});

	it('intercala robots CMRE y entrega mensajes aunque el receptor espere primero', () => {
		const source = readFileSync(
			new URL('../../../../tests/fixtures/valid/cmre-completo.ri', import.meta.url),
			'utf8'
		);
		const analysis = analyze(source, { profile: CMRE_PROFILE });
		if (analysis.program === undefined) throw new Error('El fixture CMRE debe ser válido.');
		const created = createRuntime(analysis.program, { randomSeed: 9 });
		if (!created.ok) throw new Error(created.error.message);
		const result = created.value.run();
		expect(result.status).toBe('finished');
		const sent = result.events.find(({ kind }) => kind === 'message-sent');
		const received = result.events.find(({ kind }) => kind === 'message-received');
		expect(sent).toMatchObject({ kind: 'message-sent', robotId: 'R1', peerId: 'R2' });
		expect(received).toMatchObject({ kind: 'message-received', robotId: 'R2', peerId: 'R1' });
		if (sent?.kind === 'message-sent' && received?.kind === 'message-received') {
			expect(received.value).toBe(sent.value);
		}
		expect(created.value.state.robots.get('R2')?.environment.snapshot()).toEqual({
			recibido: received?.kind === 'message-received' ? received.value : 0
		});
		expect(created.value.state.locks.size).toBe(0);
	});

	it('detecta espera global entre robots CMRE', () => {
		const source = `programa bloqueo
areas
  ciudad: AreaC(1,1,100,100)
robots
  robot tipo1
  variables
    valor: numero
  comenzar
    recibirMensaje(valor,R2)
  fin
  robot tipo2
  variables
    valor: numero
  comenzar
    recibirMensaje(valor,R1)
  fin
variables
  R1: tipo1
  R2: tipo2
comenzar
  AsignarArea(R1,ciudad)
  AsignarArea(R2,ciudad)
  Iniciar(R1,1,1)
  Iniciar(R2,2,1)
fin`;
		const analysis = analyze(source, { profile: CMRE_PROFILE });
		if (analysis.program === undefined) throw new Error('El programa CMRE debe ser válido.');
		const created = createRuntime(analysis.program);
		if (!created.ok) throw new Error(created.error.message);
		const result = created.value.run();
		expect(result.status).toBe('failed');
		expect(result.events.at(-1)).toMatchObject({
			kind: 'runtime-error',
			error: { code: 'RUN024' }
		});
	});

	it('copia parámetros E y comparte parámetros S', () => {
		const source = `programa parametros
procesos
  proceso calcular(E entrada: numero; S salida: numero)
  comenzar
    entrada:=99
    salida:=entrada+1
  fin
areas
  ciudad: AreaC(1,1,100,100)
robots
  robot tipo
  variables
    original: numero
    resultado: numero
  comenzar
    original:=5
    calcular(original,resultado)
    Informar(original)
    Informar(resultado)
  fin
variables
  R: tipo
comenzar
  AsignarArea(R,ciudad)
  Iniciar(R,1,1)
fin`;
		const analysis = analyze(source);
		if (analysis.program === undefined)
			throw new Error('El programa de parámetros debe ser válido.');
		const created = createRuntime(analysis.program);
		if (!created.ok) throw new Error(created.error.message);
		expect(created.value.run().status).toBe('finished');
		expect(created.value.state.output).toEqual([5, 100]);
	});
});
