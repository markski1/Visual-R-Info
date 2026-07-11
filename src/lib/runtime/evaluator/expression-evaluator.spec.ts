import { describe, expect, it } from 'vitest';

import type { Expression } from '../../language/ast/index.js';
import { lex } from '../../language/lexer/index.js';
import { parseExpression } from '../../language/parser/index.js';
import { City } from '../model/city.js';
import type { RobotState } from '../model/robot.js';
import { Environment } from '../state/environment.js';
import { evaluateExpression } from './expression-evaluator.js';

function expressionFrom(sourceExpression: string): Expression {
	const lexical = lex(sourceExpression);
	const parsed = parseExpression(lexical.tokens);
	expect([...lexical.diagnostics, ...parsed.diagnostics]).toEqual([]);
	return parsed.expression;
}

const robot: RobotState = {
	id: 'R',
	typeName: 'tipo',
	position: { avenue: 4, street: 7 },
	orientation: 'north',
	bag: { flowers: 1, papers: 0 },
	assignedAreas: ['ciudad'],
	status: 'ready'
};

describe('evaluador de expresiones', () => {
	it('evalúa precedencia, variables y división entera', () => {
		const environment = new Environment();
		environment.declare('valor', 5);
		expect(evaluateExpression(expressionFrom('valor+7/2'), { environment })).toEqual({
			ok: true,
			value: 8
		});
	});

	it('evalúa sensores contra el robot y la ciudad activos', () => {
		const environment = new Environment();
		const city = new City();
		city.add(robot.position, 'flower', 2);
		expect(evaluateExpression(expressionFrom('PosAv'), { environment, city, robot })).toEqual({
			ok: true,
			value: 4
		});
		expect(
			evaluateExpression(expressionFrom('HayFlorEnLaEsquina'), { environment, city, robot })
		).toEqual({ ok: true, value: true });
		expect(
			evaluateExpression(expressionFrom('HayPapelEnLaBolsa'), { environment, city, robot })
		).toEqual({ ok: true, value: false });
	});

	it('informa división por cero con el rango de la expresión', () => {
		const expression = expressionFrom('10/0');
		const result = evaluateExpression(expression, { environment: new Environment() });
		expect(result).toMatchObject({ ok: false, error: { code: 'RUN005', span: expression.span } });
	});

	it('cortocircuita operadores booleanos', () => {
		const expression = expressionFrom('F & HayFlorEnLaEsquina');
		expect(evaluateExpression(expression, { environment: new Environment() })).toEqual({
			ok: true,
			value: false
		});
	});

	it('evalúa operadores unarios y comparaciones', () => {
		const environment = new Environment();
		expect(evaluateExpression(expressionFrom('~F & (-2 < 0)'), { environment })).toEqual({
			ok: true,
			value: true
		});
	});

	it('rechaza overflow y sensores fuera del contexto de un robot', () => {
		const environment = new Environment();
		expect(evaluateExpression(expressionFrom('9007199254740992'), { environment })).toMatchObject({
			ok: false,
			error: { code: 'RUN006' }
		});
		expect(evaluateExpression(expressionFrom('PosCa'), { environment })).toMatchObject({
			ok: false,
			error: { code: 'RUN011' }
		});
	});
});
