import type { BinaryOperator, Expression, RobotSensor } from '../../language/ast/index.js';
import type { SourceSpan } from '../../language/source/index.js';
import type { City, RobotState } from '../model/index.js';
import { failure, success, type RuntimeResult } from '../model/result.js';
import type { Environment, RuntimeValue } from '../state/environment.js';

export interface EvaluationContext {
	readonly environment: Environment;
	readonly city?: City;
	readonly robot?: RobotState;
}

export function evaluateExpression(
	expression: Expression,
	context: EvaluationContext
): RuntimeResult<RuntimeValue> {
	switch (expression.kind) {
		case 'IntegerLiteralExpression': {
			const value = Number(expression.raw);
			return Number.isSafeInteger(value)
				? success(value)
				: failure(
						'RUN006',
						`El número \`${expression.raw}\` queda fuera del rango admitido.`,
						expression.span
					);
		}
		case 'BooleanLiteralExpression':
			return success(expression.value);
		case 'IdentifierExpression': {
			const cell = context.environment.resolve(expression.name);
			return cell === undefined
				? failure(
						'RUN007',
						`La variable \`${expression.name}\` no está disponible.`,
						expression.span
					)
				: success(cell.value);
		}
		case 'RobotSensorExpression':
			return evaluateSensor(expression.sensor, context, expression.span);
		case 'ParenthesizedExpression':
			return evaluateExpression(expression.expression, context);
		case 'UnaryExpression': {
			const operand = evaluateExpression(expression.operand, context);
			if (!operand.ok) return operand;
			if (expression.operator === '-' && typeof operand.value === 'number')
				return checkedInteger(-operand.value, expression);
			if (expression.operator === '~' && typeof operand.value === 'boolean')
				return success(!operand.value);
			return incompatible(expression.operator, expression);
		}
		case 'BinaryExpression': {
			const left = evaluateExpression(expression.left, context);
			if (!left.ok) return left;
			if (expression.operator === '&' && left.value === false) return success(false);
			if (expression.operator === '|' && left.value === true) return success(true);
			const right = evaluateExpression(expression.right, context);
			if (!right.ok) return right;
			return evaluateBinary(expression.operator, left.value, right.value, expression);
		}
		case 'ErrorExpression':
			return failure(
				'RUN009',
				'No se puede evaluar una expresión con errores de sintaxis.',
				expression.span
			);
	}
}

function evaluateSensor(
	sensor: RobotSensor,
	context: EvaluationContext,
	span: SourceSpan
): RuntimeResult<RuntimeValue> {
	const robot = context.robot;
	if (robot === undefined)
		return failure('RUN011', `El sensor \`${sensor}\` necesita un robot activo.`, span);
	if (sensor === 'PosAv') return success(robot.position.avenue);
	if (sensor === 'PosCa') return success(robot.position.street);
	if (sensor === 'HayFlorEnLaBolsa') return success(robot.bag.flowers > 0);
	if (sensor === 'HayPapelEnLaBolsa') return success(robot.bag.papers > 0);
	if (context.city === undefined)
		return failure('RUN011', `El sensor \`${sensor}\` necesita una ciudad activa.`, span);
	const corner = context.city.get(robot.position);
	return success(sensor === 'HayFlorEnLaEsquina' ? corner.flowers > 0 : corner.papers > 0);
}

function evaluateBinary(
	operator: BinaryOperator,
	left: RuntimeValue,
	right: RuntimeValue,
	expression: Expression
): RuntimeResult<RuntimeValue> {
	if (operator === '=' || operator === '<>')
		return success(operator === '=' ? left === right : left !== right);
	if (operator === '&' || operator === '|') {
		if (typeof left !== 'boolean' || typeof right !== 'boolean')
			return incompatible(operator, expression);
		return success(operator === '&' ? left && right : left || right);
	}
	if (typeof left !== 'number' || typeof right !== 'number')
		return incompatible(operator, expression);
	switch (operator) {
		case '+':
			return checkedInteger(left + right, expression);
		case '-':
			return checkedInteger(left - right, expression);
		case '*':
			return checkedInteger(left * right, expression);
		case '/':
			if (right === 0) return failure('RUN005', 'No se puede dividir por cero.', expression.span);
			return checkedInteger(Math.trunc(left / right), expression);
		case '<':
			return success(left < right);
		case '<=':
			return success(left <= right);
		case '>':
			return success(left > right);
		case '>=':
			return success(left >= right);
		default:
			return incompatible(operator, expression);
	}
}

function checkedInteger(value: number, expression: Expression): RuntimeResult<number> {
	return Number.isSafeInteger(value)
		? success(value)
		: failure('RUN006', 'El resultado numérico queda fuera del rango admitido.', expression.span);
}

function incompatible(operator: string, expression: Expression): RuntimeResult<never> {
	return failure(
		'RUN008',
		`El operador \`${operator}\` recibió valores incompatibles.`,
		expression.span
	);
}
