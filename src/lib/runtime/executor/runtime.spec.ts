import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { analyze } from '../../language/index.js';
import { createRuntime, type RuntimeOptions } from './runtime.js';
import type { ScenarioSettings } from '../loader/program-loader.js';

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

function runtimeFrom(
	source: string,
	settings: ScenarioSettings = {},
	options: RuntimeOptions = {}
) {
	const analysis = analyze(source);
	if (!analysis.program) throw new Error(JSON.stringify(analysis.diagnostics));
	const created = createRuntime(analysis.program, settings, options);
	if (!created.ok) throw new Error(created.error.message);
	return created.value;
}

describe('ejecutor', () => {
	it('ejecuta procesos, control de flujo y primitivas hasta terminar', () => {
		const runtime = runtimeFrom(COMPLETE_PROGRAM, {
			corners: [{ coordinate: { avenue: 2, street: 3 }, contents: { flowers: 1, papers: 0 } }]
		});

		const result = runtime.run();
		expect(result.status).toBe('finished');
		expect(runtime.state.robots.get('R')?.state).toMatchObject({
			position: { avenue: 2, street: 3 },
			orientation: 'east',
			bag: { flowers: 0, papers: 0 },
			status: 'finished'
		});
		expect(runtime.state.city.get({ avenue: 2, street: 3 }).flowers).toBe(1);
		expect(runtime.getSnapshot().areas).toEqual([
			{
				name: 'ciudad',
				type: 'AreaC',
				minAvenue: 1,
				minStreet: 1,
				maxAvenue: 100,
				maxStreet: 100
			}
		]);
		expect(runtime.state.output).toEqual([7]);
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
		const runtime = runtimeFrom(COMPLETE_PROGRAM, {
			corners: [{ coordinate: { avenue: 2, street: 3 }, contents: { flowers: 1, papers: 0 } }]
		});
		const first = runtime.step();
		expect(first).toHaveLength(1);
		expect(first[0]).toMatchObject({
			kind: 'instruction-started',
			robotId: 'R',
			statementKind: 'AssignmentStatement',
			span: { start: { line: 14 } }
		});
		expect(runtime.state.stepCount).toBe(1);

		const second = runtime.step();
		expect(second.filter(({ kind }) => kind === 'instruction-started')).toHaveLength(1);
		expect(second[0]).toMatchObject({
			statementKind: 'RepeatStatement',
			span: { start: { line: 15 } }
		});
		expect(runtime.state.stepCount).toBe(2);
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
		const runtime = runtimeFrom(source);
		const result = runtime.run();
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
		const runtime = runtimeFrom(source);
		runtime.step();
		runtime.step();
		const events = runtime.step();
		expect(events.at(-1)).toMatchObject({
			kind: 'runtime-error',
			error: { code: 'RUN001' }
		});
		expect(runtime.state.status).toBe('failed');
	});

	it('produce snapshots desacoplados y vuelve al estado inicial con reset', () => {
		const runtime = runtimeFrom(COMPLETE_PROGRAM, {
			corners: [{ coordinate: { avenue: 2, street: 3 }, contents: { flowers: 1, papers: 0 } }]
		});
		const initial = runtime.getSnapshot();
		runtime.run();
		expect(initial.robots[0].state.position).toEqual({ avenue: 1, street: 1 });
		runtime.reset();
		expect(runtime.getSnapshot()).toMatchObject({
			status: 'ready',
			stepCount: 0,
			output: [],
			pendingMessages: 0
		});
		expect(runtime.state.city.get({ avenue: 2, street: 3 }).flowers).toBe(1);
	});

	it('emite un error pedagógico al superar el límite de pasos', () => {
		const source = COMPLETE_PROGRAM.replace(
			'    mientras (n<7)\n      n:=n+1',
			'    mientras (V)\n      derecha'
		);
		const runtime = runtimeFrom(source, {
			corners: [{ coordinate: { avenue: 2, street: 3 }, contents: { flowers: 1, papers: 0 } }]
		});
		const result = runtime.run({ maxSteps: 30 });
		expect(result.status).toBe('failed');
		expect(result.events.at(-1)).toMatchObject({
			kind: 'runtime-error',
			error: { code: 'RUN020' }
		});
	});

	it('aplica el límite de pasos también al avanzar de a un paso', () => {
		const source = COMPLETE_PROGRAM.replace(
			'    mientras (n<7)\n      n:=n+1',
			'    mientras (V)\n      derecha'
		);
		const runtime = runtimeFrom(source, {}, { maxSteps: 3 });
		runtime.step();
		runtime.step();
		runtime.step();
		expect(runtime.step()).toContainEqual(
			expect.objectContaining({
				kind: 'runtime-error',
				error: expect.objectContaining({ code: 'RUN020' })
			})
		);
		expect(runtime.state.status).toBe('failed');
	});

	it('intercala robots CMRE y entrega mensajes aunque el receptor espere primero', () => {
		const source = readFileSync(
			new URL('../../../../tests/fixtures/valid/cmre-completo.ri', import.meta.url),
			'utf8'
		);
		const runtime = runtimeFrom(source, { randomSeed: 9 });
		const result = runtime.run();
		expect(result.status).toBe('finished');
		const sent = result.events.find(({ kind }) => kind === 'message-sent');
		const received = result.events.find(({ kind }) => kind === 'message-received');
		expect(sent).toMatchObject({ kind: 'message-sent', robotId: 'R1', peerId: 'R2' });
		expect(received).toMatchObject({ kind: 'message-received', robotId: 'R2', peerId: 'R1' });
		if (sent?.kind === 'message-sent' && received?.kind === 'message-received') {
			expect(received.value).toBe(sent.value);
		}
		expect(runtime.state.robots.get('R2')?.environment.snapshot()).toEqual({
			recibido: received?.kind === 'message-received' ? received.value : 0
		});
		expect(runtime.state.locks.size).toBe(0);
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
		const runtime = runtimeFrom(source);
		const result = runtime.run();
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
		const runtime = runtimeFrom(source);
		expect(runtime.run().status).toBe('finished');
		expect(runtime.state.output).toEqual([5, 100]);
	});
});
