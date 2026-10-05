import { describe, expect, it } from 'vitest';

import type { Expression } from '../ast/index.js';
import { lex } from '../lexer/lexer.js';
import { TokenKind } from '../lexer/token.js';
import { Parser, parseExpression } from './expression-parser.js';

describe('parseExpression', () => {
	it('respeta la precedencia aritmética y la asociatividad izquierda', () => {
		const first = parse('1 + 2 * 3');
		const second = parse('10 - 3 - 2');

		expect(first.diagnostics).toEqual([]);
		expect(expressionShape(first.expression)).toEqual([
			'+',
			['numero', '1'],
			['*', ['numero', '2'], ['numero', '3']]
		]);
		expect(second.diagnostics).toEqual([]);
		expect(expressionShape(second.expression)).toEqual([
			'-',
			['-', ['numero', '10'], ['numero', '3']],
			['numero', '2']
		]);
	});

	it('ordena operadores unarios, comparaciones y operadores lógicos', () => {
		const result = parse('~V | F & 1 < 2');

		expect(result.diagnostics).toEqual([]);
		expect(expressionShape(result.expression)).toEqual([
			'|',
			['~', ['boolean', true]],
			['&', ['boolean', false], ['<', ['numero', '1'], ['numero', '2']]]
		]);
	});

	it('usa paréntesis para cambiar la agrupación', () => {
		const result = parse('(1 + 2) * 3');

		expect(result.diagnostics).toEqual([]);
		expect(expressionShape(result.expression)).toEqual([
			'*',
			['paréntesis', ['+', ['numero', '1'], ['numero', '2']]],
			['numero', '3']
		]);
	});

	it('reconoce identificadores y sensores del robot', () => {
		const position = parse('cantidad + PosAv');
		const objects = parse('HayFlorEnLaEsquina & ~HayPapelEnLaBolsa');

		expect(expressionShape(position.expression)).toEqual([
			'+',
			['identificador', 'cantidad'],
			['sensor', 'PosAv']
		]);
		expect(expressionShape(objects.expression)).toEqual([
			'&',
			['sensor', 'HayFlorEnLaEsquina'],
			['~', ['sensor', 'HayPapelEnLaBolsa']]
		]);
		expect([...position.diagnostics, ...objects.diagnostics]).toEqual([]);
	});

	it('genera IDs y rangos reproducibles', () => {
		const first = parse('(1 + 2)');
		const second = parse('(1 + 2)');

		expect(first.expression.id).toBe(second.expression.id);
		expect(first.expression.id).toBe('ParenthesizedExpression:0:7');
		expect(first.expression.span).toEqual({
			start: { offset: 0, line: 1, column: 1 },
			end: { offset: 7, line: 1, column: 8 }
		});
	});

	it('se recupera de un operador inesperado y continúa con el operando siguiente', () => {
		const result = parse('1 + * 2');

		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({
			code: 'PAR001',
			phase: 'parser',
			severity: 'error',
			span: {
				start: { offset: 4, line: 1, column: 5 },
				end: { offset: 5, line: 1, column: 6 }
			}
		});
		expect(expressionShape(result.expression)).toEqual(['+', ['numero', '1'], ['numero', '2']]);
	});

	it('explica un paréntesis faltante sin descartar la expresión interna', () => {
		const result = parse('(1 + 2');

		expect(result.diagnostics).toEqual([
			{
				code: 'PAR001',
				phase: 'parser',
				severity: 'error',
				message: 'Falta `)` para cerrar la expresión. Agregalo después de la última operación.',
				span: {
					start: { offset: 6, line: 1, column: 7 },
					end: { offset: 6, line: 1, column: 7 }
				}
			}
		]);
		expect(expressionShape(result.expression)).toEqual([
			'paréntesis',
			['+', ['numero', '1'], ['numero', '2']]
		]);
	});

	it('informa cada token sobrante después de una expresión válida', () => {
		const result = parse('1 2 mover');

		expect(result.diagnostics.map(({ code, span }) => ({ code, span }))).toEqual([
			{
				code: 'PAR001',
				span: {
					start: { offset: 2, line: 1, column: 3 },
					end: { offset: 3, line: 1, column: 4 }
				}
			},
			{
				code: 'PAR001',
				span: {
					start: { offset: 4, line: 1, column: 5 },
					end: { offset: 9, line: 1, column: 10 }
				}
			}
		]);
	});

	it('devuelve el control antes de la instrucción siguiente al usarse dentro de un programa', () => {
		const complete = lex('1 + 2 mover');
		const parser = new Parser(complete.tokens);
		const expression = parser.parseExpression();

		expect(expressionShape(expression)).toEqual(['+', ['numero', '1'], ['numero', '2']]);
		expect(parser.current().kind).toBe(TokenKind.Move);
		expect(parser.getDiagnostics()).toEqual([]);

		const incomplete = new Parser(lex('1 + mover').tokens);
		incomplete.parseExpression();
		expect(incomplete.current().kind).toBe(TokenKind.Move);
		expect(incomplete.getDiagnostics()).toHaveLength(1);
	});
});

function parse(source: string) {
	const lexerResult = lex(source);
	expect(lexerResult.diagnostics).toEqual([]);
	return parseExpression(lexerResult.tokens);
}

function expressionShape(expression: Expression): unknown {
	switch (expression.kind) {
		case 'IntegerLiteralExpression':
			return ['numero', expression.raw];
		case 'BooleanLiteralExpression':
			return ['boolean', expression.value];
		case 'IdentifierExpression':
			return ['identificador', expression.name];
		case 'RobotSensorExpression':
			return ['sensor', expression.sensor];
		case 'UnaryExpression':
			return [expression.operator, expressionShape(expression.operand)];
		case 'BinaryExpression':
			return [
				expression.operator,
				expressionShape(expression.left),
				expressionShape(expression.right)
			];
		case 'ParenthesizedExpression':
			return ['paréntesis', expressionShape(expression.expression)];
		case 'ErrorExpression':
			return ['error'];
	}
}
