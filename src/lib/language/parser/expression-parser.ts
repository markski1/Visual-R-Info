import {
	createNodeId,
	type BinaryExpression,
	type BinaryOperator,
	type BooleanLiteralExpression,
	type ErrorExpression,
	type Expression,
	type IdentifierExpression,
	type IntegerLiteralExpression,
	type ParenthesizedExpression,
	type RobotSensor,
	type RobotSensorExpression,
	type UnaryExpression
} from '../ast/index.js';
import type { Diagnostic } from '../diagnostics/index.js';
import { TokenKind, type Token, type TokenKind as TokenKindType } from '../lexer/token.js';
import type { SourcePosition, SourceSpan } from '../source/index.js';

export interface ExpressionParseResult {
	readonly expression: Expression;
	readonly diagnostics: readonly Diagnostic[];
}

const BINARY_OPERATORS: Partial<Record<TokenKindType, BinaryOperator>> = {
	[TokenKind.Plus]: '+',
	[TokenKind.Minus]: '-',
	[TokenKind.Star]: '*',
	[TokenKind.Slash]: '/',
	[TokenKind.Equal]: '=',
	[TokenKind.NotEqual]: '<>',
	[TokenKind.Less]: '<',
	[TokenKind.LessEqual]: '<=',
	[TokenKind.Greater]: '>',
	[TokenKind.GreaterEqual]: '>=',
	[TokenKind.And]: '&',
	[TokenKind.Or]: '|'
};

const ROBOT_SENSORS: Partial<Record<TokenKindType, RobotSensor>> = {
	[TokenKind.PositionAvenue]: 'PosAv',
	[TokenKind.PositionStreet]: 'PosCa',
	[TokenKind.FlowerAtCorner]: 'HayFlorEnLaEsquina',
	[TokenKind.PaperAtCorner]: 'HayPapelEnLaEsquina',
	[TokenKind.FlowerInBag]: 'HayFlorEnLaBolsa',
	[TokenKind.PaperInBag]: 'HayPapelEnLaBolsa'
};

export function parseExpression(tokens: readonly Token[]): ExpressionParseResult {
	const parser = new Parser(tokens);
	const expression = parser.parseExpression();
	parser.reportTrailingTokens();
	return { expression, diagnostics: parser.getDiagnostics() };
}

/** Cursor compartido por los analizadores de expresiones y de programas. */
export class Parser {
	private index = 0;
	private readonly diagnostics: Diagnostic[] = [];
	private readonly tokens: readonly Token[];

	public constructor(tokens: readonly Token[]) {
		this.tokens = withEndOfFile(tokens);
	}

	public parseExpression(): Expression {
		return this.parseBinaryExpression(1);
	}

	/** Comprueba tokens sobrantes al analizar una expresión aislada. */
	public reportTrailingTokens(): void {
		while (!this.at(TokenKind.EndOfFile)) {
			const token = this.advance();
			this.report(token, `No se esperaba ${describeToken(token)} después de la expresión.`);
		}
	}

	public getDiagnostics(): readonly Diagnostic[] {
		return this.diagnostics;
	}

	public report(token: Token, message: string, code = 'PAR001'): void {
		this.diagnostics.push({
			code,
			phase: 'parser',
			severity: 'error',
			message,
			span: token.span
		});
	}

	private parseBinaryExpression(minimumPrecedence: number): Expression {
		let left = this.parsePrefixExpression();

		// Precedencia ascendente: al pedir `precedence + 1` a la derecha, operadores iguales quedan asociados a la izquierda.
		while (true) {
			const operatorToken = this.current();
			const operator = BINARY_OPERATORS[operatorToken.kind];
			const precedence = binaryPrecedence(operatorToken.kind);
			if (operator === undefined || precedence < minimumPrecedence) break;

			this.advance();
			const right = this.parseBinaryExpression(precedence + 1);
			const span = spanBetween(left.span.start, right.span.end);
			left = {
				kind: 'BinaryExpression',
				id: createNodeId('BinaryExpression', span),
				span,
				operator,
				left,
				right
			} satisfies BinaryExpression;
		}

		return left;
	}

	private parsePrefixExpression(): Expression {
		const token = this.current();

		if (token.kind === TokenKind.Minus || token.kind === TokenKind.Not) {
			this.advance();
			const operand = this.parsePrefixExpression();
			const span = spanBetween(token.span.start, operand.span.end);
			return {
				kind: 'UnaryExpression',
				id: createNodeId('UnaryExpression', span),
				span,
				operator: token.kind === TokenKind.Minus ? '-' : '~',
				operand
			} satisfies UnaryExpression;
		}

		if (token.kind === TokenKind.Integer) {
			this.advance();
			return this.nodeFromToken(token, {
				kind: 'IntegerLiteralExpression',
				raw: token.lexeme
			}) satisfies IntegerLiteralExpression;
		}

		if (token.kind === TokenKind.True || token.kind === TokenKind.False) {
			this.advance();
			return this.nodeFromToken(token, {
				kind: 'BooleanLiteralExpression',
				value: token.kind === TokenKind.True
			}) satisfies BooleanLiteralExpression;
		}

		if (token.kind === TokenKind.Identifier) {
			this.advance();
			return this.nodeFromToken(token, {
				kind: 'IdentifierExpression',
				name: token.lexeme
			}) satisfies IdentifierExpression;
		}

		const sensor = ROBOT_SENSORS[token.kind];
		if (sensor !== undefined) {
			this.advance();
			return this.nodeFromToken(token, {
				kind: 'RobotSensorExpression',
				sensor
			}) satisfies RobotSensorExpression;
		}

		if (token.kind === TokenKind.LeftParenthesis) {
			return this.parseParenthesizedExpression();
		}

		this.report(token, `Se esperaba una expresión, pero apareció ${describeToken(token)}.`);
		// Avanzar sólo si no estamos frente a un delimitador permite que el parser de programa retome desde la siguiente instrucción.
		if (!this.at(TokenKind.EndOfFile) && !isExpressionBoundary(token.kind)) this.advance();

		if (canStartExpression(this.current().kind)) {
			return this.parsePrefixExpression();
		}

		return this.errorExpression(token.span);
	}

	private parseParenthesizedExpression(): ParenthesizedExpression {
		const opening = this.advance();
		let expression: Expression;

		if (this.at(TokenKind.RightParenthesis)) {
			const closing = this.advance();
			this.report(closing, 'Se esperaba una expresión dentro de los paréntesis.');
			expression = this.errorExpression(closing.span);
			return this.parenthesizedNode(opening, expression, closing.span.end);
		}

		expression = this.parseBinaryExpression(1);
		if (this.at(TokenKind.RightParenthesis)) {
			const closing = this.advance();
			return this.parenthesizedNode(opening, expression, closing.span.end);
		}

		this.report(
			this.current(),
			'Falta `)` para cerrar la expresión. Agregalo después de la última operación.'
		);
		return this.parenthesizedNode(opening, expression, expression.span.end);
	}

	private parenthesizedNode(
		opening: Token,
		expression: Expression,
		end: SourcePosition
	): ParenthesizedExpression {
		const span = spanBetween(opening.span.start, end);
		return {
			kind: 'ParenthesizedExpression',
			id: createNodeId('ParenthesizedExpression', span),
			span,
			expression
		};
	}

	private nodeFromToken<
		Node extends
			| IntegerLiteralExpression
			| BooleanLiteralExpression
			| IdentifierExpression
			| RobotSensorExpression
	>(token: Token, fields: Omit<Node, 'id' | 'span'>): Node {
		return {
			...fields,
			id: createNodeId(fields.kind, token.span),
			span: token.span
		} as Node;
	}

	private errorExpression(span: SourceSpan): ErrorExpression {
		return {
			kind: 'ErrorExpression',
			id: createNodeId('ErrorExpression', span),
			span
		};
	}

	public at(kind: TokenKindType): boolean {
		return this.current().kind === kind;
	}

	public current(): Token {
		return this.tokens[Math.min(this.index, this.tokens.length - 1)];
	}

	public advance(): Token {
		const token = this.current();
		if (!this.at(TokenKind.EndOfFile)) this.index += 1;
		return token;
	}
}

function binaryPrecedence(kind: TokenKindType): number {
	switch (kind) {
		case TokenKind.Or:
			return 1;
		case TokenKind.And:
			return 2;
		case TokenKind.Equal:
		case TokenKind.NotEqual:
		case TokenKind.Less:
		case TokenKind.LessEqual:
		case TokenKind.Greater:
		case TokenKind.GreaterEqual:
			return 3;
		case TokenKind.Plus:
		case TokenKind.Minus:
			return 4;
		case TokenKind.Star:
		case TokenKind.Slash:
			return 5;
		default:
			return 0;
	}
}

function canStartExpression(kind: TokenKindType): boolean {
	return (
		kind === TokenKind.Integer ||
		kind === TokenKind.True ||
		kind === TokenKind.False ||
		kind === TokenKind.Identifier ||
		kind === TokenKind.PositionAvenue ||
		kind === TokenKind.PositionStreet ||
		kind === TokenKind.FlowerAtCorner ||
		kind === TokenKind.PaperAtCorner ||
		kind === TokenKind.FlowerInBag ||
		kind === TokenKind.PaperInBag ||
		kind === TokenKind.LeftParenthesis ||
		kind === TokenKind.Minus ||
		kind === TokenKind.Not
	);
}

function isExpressionBoundary(kind: TokenKindType): boolean {
	return (
		kind === TokenKind.RightParenthesis ||
		kind === TokenKind.Comma ||
		kind === TokenKind.Begin ||
		kind === TokenKind.End ||
		kind === TokenKind.Else ||
		kind === TokenKind.If ||
		kind === TokenKind.While ||
		kind === TokenKind.Repeat ||
		kind === TokenKind.Move ||
		kind === TokenKind.TurnRight ||
		kind === TokenKind.TakeFlower ||
		kind === TokenKind.TakePaper ||
		kind === TokenKind.DropFlower ||
		kind === TokenKind.DropPaper ||
		kind === TokenKind.SetPosition ||
		kind === TokenKind.Inform ||
		kind === TokenKind.AssignArea ||
		kind === TokenKind.StartRobot ||
		kind === TokenKind.Random ||
		kind === TokenKind.LockCorner ||
		kind === TokenKind.UnlockCorner ||
		kind === TokenKind.SendMessage ||
		kind === TokenKind.ReceiveMessage ||
		kind === TokenKind.Program ||
		kind === TokenKind.Processes ||
		kind === TokenKind.Process ||
		kind === TokenKind.Areas ||
		kind === TokenKind.Robots ||
		kind === TokenKind.Robot ||
		kind === TokenKind.Variables
	);
}

function spanBetween(start: SourcePosition, end: SourcePosition): SourceSpan {
	return { start, end };
}

function describeToken(token: Token): string {
	return token.kind === TokenKind.EndOfFile ? 'el final del archivo' : `\`${token.lexeme}\``;
}

function withEndOfFile(tokens: readonly Token[]): readonly Token[] {
	if (tokens.at(-1)?.kind === TokenKind.EndOfFile) return tokens;
	const end = tokens.at(-1)?.span.end ?? { offset: 0, line: 1, column: 1 };
	return [
		...tokens,
		{
			kind: TokenKind.EndOfFile,
			lexeme: '',
			span: { start: end, end }
		}
	];
}
