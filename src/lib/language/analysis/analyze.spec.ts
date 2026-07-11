import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CMRE_PROFILE } from '../profiles/index.js';
import { analyze } from './analyze.js';

describe('analyze', () => {
	it('produce un ValidatedProgram para un programa completo válido', () => {
		const source = readFileSync(
			new URL('../../../../tests/fixtures/valid/programa-completo.ri', import.meta.url),
			'utf8'
		);
		const result = analyze(source);

		expect(result.diagnostics).toEqual([]);
		expect(result.program).toBeDefined();
		expect(result.program?.ast.name.name).toBe('ejemploCompleto');
		expect(result.program?.symbols.symbols.map(({ name }) => name)).toEqual(
			expect.arrayContaining(['girar', 'ciudad', 'robot1', 'Rinfo', 'cantidad', 'veces', 'flores'])
		);
	});

	it('acepta selección, alternativa, repetición y bloques explícitos', () => {
		const source = readFileSync(
			new URL('../../../../tests/fixtures/valid/control-completo.ri', import.meta.url),
			'utf8'
		);
		const result = analyze(source);

		expect(result.diagnostics).toEqual([]);
		expect(result.program).toBeDefined();
		expect(result.ast.robots[0].body.map(({ kind }) => kind)).toEqual([
			'AssignmentStatement',
			'IfStatement'
		]);
	});

	it('analiza un programa CMRE completo con dos robots y mensajería', () => {
		const source = readFileSync(
			new URL('../../../../tests/fixtures/valid/cmre-completo.ri', import.meta.url),
			'utf8'
		);
		const result = analyze(source, { profile: CMRE_PROFILE });

		expect(result.diagnostics).toEqual([]);
		expect(result.program).toBeDefined();
		expect(result.program?.profile).toBe(CMRE_PROFILE);
		expect(result.ast.robots).toHaveLength(2);
		expect(
			result.ast.robots.flatMap(({ body }) =>
				body.flatMap((statement) =>
					statement.kind === 'CallStatement' ? [statement.callee.name] : []
				)
			)
		).toEqual(['Random', 'bloquearEsquina', 'enviarMensaje', 'liberarEsquina', 'recibirMensaje']);
	});

	it('detecta duplicados, usos no declarados y errores de tipos en una sola pasada', () => {
		const source = readFileSync(
			new URL('../../../../tests/fixtures/invalid-semantic/errores.ri', import.meta.url),
			'utf8'
		);
		const result = analyze(source);
		const codes = result.diagnostics.map(({ code }) => code);

		expect(result.program).toBeUndefined();
		expect(codes).toContain('SEM001');
		expect(codes).toContain('SEM002');
		expect(codes.filter((code) => code === 'SEM003').length).toBeGreaterThanOrEqual(2);
	});

	it('valida modos y tipos al invocar procesos', () => {
		const source = `programa llamadas
procesos
  proceso guardar(S valor: numero)
  comenzar
    valor:=1
  fin
areas
  ciudad: AreaC(1,1,100,100)
robots
  robot robot1
  comenzar
    guardar(1)
  fin
variables
  Rinfo: robot1
comenzar
  AsignarArea(Rinfo,ciudad)
  Iniciar(Rinfo,1,1)
fin`;
		const result = analyze(source);

		expect(result.program).toBeUndefined();
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: 'SEM006', phase: 'semantic' })])
		);
	});

	it('impide que un proceso acceda a variables del programa principal', () => {
		const source = `programa alcance
procesos
  proceso modificar
  comenzar
    global:=1
  fin
areas
  ciudad: AreaC(1,1,100,100)
robots
  robot robot1
  comenzar
    mover
  fin
variables
  global: numero
  Rinfo: robot1
comenzar
  AsignarArea(Rinfo,ciudad)
  Iniciar(Rinfo,1,1)
fin`;
		const result = analyze(source);

		expect(result.program).toBeUndefined();
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'SEM001',
					message: 'La variable `global` no fue declarada.'
				})
			])
		);
	});

	it('no ejecuta semántica cuando la estructura sintáctica está rota', () => {
		const result = analyze('programa roto');

		expect(result.program).toBeUndefined();
		expect(result.diagnostics.some(({ phase }) => phase === 'parser')).toBe(true);
		expect(result.diagnostics.some(({ phase }) => phase === 'semantic')).toBe(false);
	});
});
