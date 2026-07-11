import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { lex } from '../lexer/lexer.js';
import { parseProgram } from './program-parser.js';

describe('parseProgram', () => {
	it('construye el AST de un programa completo de R-Info', () => {
		const source = readFileSync(
			new URL('../../../../tests/fixtures/valid/programa-completo.ri', import.meta.url),
			'utf8'
		);
		const lexical = lex(source);
		const result = parseProgram(lexical.tokens);

		expect(lexical.diagnostics).toEqual([]);
		expect(result.diagnostics).toEqual([]);
		expect(result.program.name.name).toBe('ejemploCompleto');
		expect(result.program.processes).toHaveLength(1);
		expect(result.program.processes[0].parameters).toHaveLength(2);
		expect(result.program.areas).toHaveLength(1);
		expect(result.program.robots).toHaveLength(1);
		expect(result.program.robots[0].body.map(({ kind }) => kind)).toEqual([
			'AssignmentStatement',
			'CallStatement',
			'WhileStatement',
			'CallStatement'
		]);
		expect(result.program.body).toHaveLength(2);
	});

	it('mantiene varios diagnósticos cuando faltan secciones y cierres', () => {
		const source = readFileSync(
			new URL(
				'../../../../tests/fixtures/invalid-syntax/falta-secciones-y-fin.ri',
				import.meta.url
			),
			'utf8'
		);
		const result = parseProgram(lex(source).tokens);

		expect(result.diagnostics.length).toBeGreaterThanOrEqual(3);
		expect(result.diagnostics.map(({ code }) => code)).toContain('PAR002');
	});
});
