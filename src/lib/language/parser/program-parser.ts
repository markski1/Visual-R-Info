import {
	createNodeId,
	type AreaDeclaration,
	type AreaType,
	type AssignmentStatement,
	type BlockStatement,
	type CallStatement,
	type ErrorStatement,
	type IdentifierBinding,
	type IfStatement,
	type ParameterDeclaration,
	type ParameterMode,
	type ProcessDeclaration,
	type ProgramNode,
	type RepeatStatement,
	type RobotCommand,
	type RobotCommandStatement,
	type RobotDeclaration,
	type Statement,
	type VariableDeclaration,
	type WhileStatement
} from '../ast/index.js';
import type { Diagnostic } from '../diagnostics/index.js';
import { TokenKind, type Token, type TokenKind as TokenKindType } from '../lexer/token.js';
import type { SourcePosition, SourceSpan } from '../source/index.js';
import { Parser } from './expression-parser.js';

export interface ProgramParseResult {
	readonly program: ProgramNode;
	readonly diagnostics: readonly Diagnostic[];
}

const ROBOT_COMMANDS: Partial<Record<TokenKindType, RobotCommand>> = {
	[TokenKind.Move]: 'mover',
	[TokenKind.TurnRight]: 'derecha',
	[TokenKind.TakeFlower]: 'tomarFlor',
	[TokenKind.TakePaper]: 'tomarPapel',
	[TokenKind.DropFlower]: 'depositarFlor',
	[TokenKind.DropPaper]: 'depositarPapel'
};

const CALL_TOKENS = new Set<TokenKindType>([
	TokenKind.SetPosition,
	TokenKind.Inform,
	TokenKind.AssignArea,
	TokenKind.StartRobot,
	TokenKind.Random,
	TokenKind.LockCorner,
	TokenKind.UnlockCorner,
	TokenKind.SendMessage,
	TokenKind.ReceiveMessage
]);

export function parseProgram(tokens: readonly Token[]): ProgramParseResult {
	return new ProgramParser(tokens).parse();
}

class ProgramParser {
	private readonly cursor: Parser;

	public constructor(tokens: readonly Token[]) {
		this.cursor = new Parser(tokens);
	}

	public parse(): ProgramParseResult {
		const start = this.expect(TokenKind.Program, 'El programa debe comenzar con `programa`.');
		const name = this.parseBinding('Falta el nombre del programa después de `programa`.');

		const processes = this.parseProcessesSection();
		const areas = this.parseAreasSection();
		const robots = this.parseRobotsSection();
		const variables = this.parseVariablesSection(true);
		const { statements: body, end } = this.parseRequiredBlock('principal');

		while (!this.cursor.isAt(TokenKind.EndOfFile)) {
			const token = this.cursor.advanceToken();
			this.cursor.addDiagnostic(
				token,
				`No se esperaba \`${token.lexeme}\` después del final del programa.`
			);
		}

		const span = spanBetween(start.span.start, end);
		const program: ProgramNode = {
			kind: 'Program',
			id: createNodeId('Program', span),
			span,
			name,
			processes,
			areas,
			robots,
			variables,
			body
		};

		return { program, diagnostics: this.cursor.getDiagnostics() };
	}

	private parseProcessesSection(): ProcessDeclaration[] {
		const declarations: ProcessDeclaration[] = [];
		if (!this.consume(TokenKind.Processes)) return declarations;

		while (this.cursor.isAt(TokenKind.Process)) {
			declarations.push(this.parseProcessDeclaration());
		}
		return declarations;
	}

	private parseProcessDeclaration(): ProcessDeclaration {
		const start = this.cursor.advanceToken();
		const name = this.parseBinding('Falta el nombre del proceso.');
		const parameters = this.parseParameters();
		const variables = this.parseVariablesSection(false);
		const { statements: body, end } = this.parseRequiredBlock(`del proceso \`${name.name}\``);
		const span = spanBetween(start.span.start, end);
		return {
			kind: 'ProcessDeclaration',
			id: createNodeId('ProcessDeclaration', span),
			span,
			name,
			parameters,
			variables,
			body
		};
	}

	private parseParameters(): ParameterDeclaration[] {
		const parameters: ParameterDeclaration[] = [];
		if (!this.consume(TokenKind.LeftParenthesis)) return parameters;

		while (
			!this.cursor.isAt(TokenKind.RightParenthesis) &&
			!this.cursor.isAt(TokenKind.EndOfFile)
		) {
			const start = this.cursor.getCurrentToken();
			const mode = this.parseParameterMode();
			const name = this.parseBinding('Falta el nombre del parámetro.');
			this.expect(TokenKind.Colon, 'Falta `:` entre el parámetro y su tipo.');
			const typeToken = this.cursor.getCurrentToken();
			const typeName = this.parsePrimitiveType();
			const span = spanBetween(
				start.span.start,
				typeToken.kind === TokenKind.NumberType || typeToken.kind === TokenKind.BooleanType
					? typeToken.span.end
					: name.span.end
			);
			parameters.push({
				kind: 'ParameterDeclaration',
				id: createNodeId('ParameterDeclaration', span),
				span,
				mode,
				name,
				typeName
			});

			if (!this.consume(TokenKind.Semicolon) && !this.consume(TokenKind.Comma)) break;
		}

		this.expect(TokenKind.RightParenthesis, 'Falta `)` al final de los parámetros.');
		return parameters;
	}

	private parseAreasSection(): AreaDeclaration[] {
		const declarations: AreaDeclaration[] = [];
		this.expect(TokenKind.Areas, 'Falta la sección `areas`.');

		while (this.cursor.isAt(TokenKind.Identifier)) {
			declarations.push(this.parseAreaDeclaration());
		}
		return declarations;
	}

	private parseAreaDeclaration(): AreaDeclaration {
		const name = this.parseBinding('Falta el nombre del área.');
		this.expect(TokenKind.Colon, 'Falta `:` entre el área y su tipo.');
		const areaToken = this.cursor.getCurrentToken();
		let areaType: AreaType = 'AreaC';
		if (
			areaToken.kind === TokenKind.AreaC ||
			areaToken.kind === TokenKind.AreaP ||
			areaToken.kind === TokenKind.AreaPC
		) {
			areaType = areaToken.lexeme as AreaType;
			this.cursor.advanceToken();
		} else {
			this.cursor.addDiagnostic(
				areaToken,
				'Se esperaba un tipo de área: `AreaC`, `AreaP` o `AreaPC`.'
			);
		}
		const { arguments: args, end } = this.parseArguments();
		const span = spanBetween(name.span.start, end);
		return {
			kind: 'AreaDeclaration',
			id: createNodeId('AreaDeclaration', span),
			span,
			name,
			areaType,
			arguments: args
		};
	}

	private parseRobotsSection(): RobotDeclaration[] {
		const declarations: RobotDeclaration[] = [];
		this.expect(TokenKind.Robots, 'Falta la sección `robots`.');

		while (this.cursor.isAt(TokenKind.Robot)) {
			declarations.push(this.parseRobotDeclaration());
		}
		if (declarations.length === 0) {
			this.cursor.addDiagnostic(
				this.cursor.getCurrentToken(),
				'La sección `robots` debe declarar al menos un tipo de robot.'
			);
		}
		return declarations;
	}

	private parseRobotDeclaration(): RobotDeclaration {
		const start = this.cursor.advanceToken();
		const name = this.parseBinding('Falta el nombre del tipo de robot.');
		const variables = this.parseVariablesSection(false);
		const { statements: body, end } = this.parseRequiredBlock(`del robot \`${name.name}\``);
		const span = spanBetween(start.span.start, end);
		return {
			kind: 'RobotDeclaration',
			id: createNodeId('RobotDeclaration', span),
			span,
			name,
			variables,
			body
		};
	}

	private parseVariablesSection(required: boolean): VariableDeclaration[] {
		const declarations: VariableDeclaration[] = [];
		if (!this.consume(TokenKind.Variables)) {
			if (required) {
				this.cursor.addDiagnostic(this.cursor.getCurrentToken(), 'Falta la sección `variables`.');
			}
			return declarations;
		}

		while (this.cursor.isAt(TokenKind.Identifier)) {
			declarations.push(this.parseVariableDeclaration());
		}
		return declarations;
	}

	private parseVariableDeclaration(): VariableDeclaration {
		const start = this.cursor.getCurrentToken();
		const names: IdentifierBinding[] = [this.parseBinding('Falta el nombre de la variable.')];
		while (this.consume(TokenKind.Comma)) {
			names.push(this.parseBinding('Falta un nombre después de `,`.'));
		}
		this.expect(TokenKind.Colon, 'Falta `:` entre la variable y su tipo.');
		const typeToken = this.cursor.getCurrentToken();
		const typeName = this.parseTypeName();
		const span = spanBetween(start.span.start, typeToken.span.end);
		return {
			kind: 'VariableDeclaration',
			id: createNodeId('VariableDeclaration', span),
			span,
			names,
			typeName
		};
	}

	private parseRequiredBlock(context: string): { statements: Statement[]; end: SourcePosition } {
		this.expect(TokenKind.Begin, `Falta \`comenzar\` antes del cuerpo ${context}.`);
		const statements = this.parseStatementsUntil(new Set([TokenKind.End]));
		const endToken = this.expect(
			TokenKind.End,
			`Falta \`fin\` para cerrar el cuerpo ${context}.`,
			'PAR002'
		);
		return { statements, end: endToken.span.end };
	}

	private parseStatementsUntil(stops: ReadonlySet<TokenKindType>): Statement[] {
		const statements: Statement[] = [];
		while (
			!stops.has(this.cursor.getCurrentToken().kind) &&
			!this.cursor.isAt(TokenKind.EndOfFile)
		) {
			statements.push(this.parseStatement());
		}
		return statements;
	}

	private parseStatement(): Statement {
		const token = this.cursor.getCurrentToken();
		const command = ROBOT_COMMANDS[token.kind];
		if (command !== undefined) {
			this.cursor.advanceToken();
			return this.commandNode(token, command);
		}

		if (token.kind === TokenKind.Identifier) return this.parseIdentifierStatement();
		if (CALL_TOKENS.has(token.kind)) return this.parseCallStatement();
		if (token.kind === TokenKind.If) return this.parseIfStatement();
		if (token.kind === TokenKind.While) return this.parseWhileStatement();
		if (token.kind === TokenKind.Repeat) return this.parseRepeatStatement();
		if (token.kind === TokenKind.Begin) return this.parseExplicitBlock();

		this.cursor.addDiagnostic(token, `No se reconoce \`${token.lexeme}\` como una instrucción.`);
		this.cursor.advanceToken();
		return this.errorStatement(token.span);
	}

	private parseIdentifierStatement(): Statement {
		const nameToken = this.cursor.advanceToken();
		const binding = bindingFrom(nameToken);
		if (this.consume(TokenKind.Assign)) {
			const value = this.cursor.parseExpression();
			const span = spanBetween(nameToken.span.start, value.span.end);
			return {
				kind: 'AssignmentStatement',
				id: createNodeId('AssignmentStatement', span),
				span,
				target: binding,
				value
			} satisfies AssignmentStatement;
		}

		const { arguments: args, end } = this.cursor.isAt(TokenKind.LeftParenthesis)
			? this.parseArguments()
			: { arguments: [], end: nameToken.span.end };
		return this.callNode(binding, args, end);
	}

	private parseCallStatement(): CallStatement {
		const callee = bindingFrom(this.cursor.advanceToken());
		const { arguments: args, end } = this.parseArguments();
		return this.callNode(callee, args, end);
	}

	private parseArguments(): {
		arguments: import('../ast/index.js').Expression[];
		end: SourcePosition;
	} {
		const args: import('../ast/index.js').Expression[] = [];
		const opening = this.expect(TokenKind.LeftParenthesis, 'Falta `(` al comenzar los argumentos.');
		if (!this.cursor.isAt(TokenKind.RightParenthesis)) {
			do {
				args.push(this.cursor.parseExpression());
			} while (this.consume(TokenKind.Comma));
		}
		const closing = this.expect(
			TokenKind.RightParenthesis,
			'Falta `)` al final de los argumentos.'
		);
		return {
			arguments: args,
			end: closing.kind === TokenKind.RightParenthesis ? closing.span.end : opening.span.end
		};
	}

	private parseIfStatement(): IfStatement {
		const start = this.cursor.advanceToken();
		const condition = this.cursor.parseExpression();
		const thenBranch = this.parseIndentedBody(start, '`si`');
		let elseBranch: Statement[] | undefined;
		if (this.cursor.isAt(TokenKind.Else)) {
			const elseToken = this.cursor.advanceToken();
			elseBranch = this.parseIndentedBody(elseToken, '`sino`');
		}
		const end = branchEnd(elseBranch ?? thenBranch, condition.span.end);
		const span = spanBetween(start.span.start, end);
		return {
			kind: 'IfStatement',
			id: createNodeId('IfStatement', span),
			span,
			condition,
			thenBranch,
			...(elseBranch === undefined ? {} : { elseBranch })
		};
	}

	private parseWhileStatement(): WhileStatement {
		const start = this.cursor.advanceToken();
		const condition = this.cursor.parseExpression();
		const body = this.parseIndentedBody(start, '`mientras`');
		const span = spanBetween(start.span.start, branchEnd(body, condition.span.end));
		return {
			kind: 'WhileStatement',
			id: createNodeId('WhileStatement', span),
			span,
			condition,
			body
		};
	}

	private parseRepeatStatement(): RepeatStatement {
		const start = this.cursor.advanceToken();
		const count = this.cursor.parseExpression();
		const body = this.parseIndentedBody(start, '`repetir`');
		const span = spanBetween(start.span.start, branchEnd(body, count.span.end));
		return {
			kind: 'RepeatStatement',
			id: createNodeId('RepeatStatement', span),
			span,
			count,
			body
		};
	}

	private parseIndentedBody(owner: Token, label: string): Statement[] {
		if (this.cursor.isAt(TokenKind.Begin)) return [this.parseExplicitBlock()];
		const first = this.cursor.getCurrentToken();
		if (
			first.kind === TokenKind.EndOfFile ||
			first.span.start.line <= owner.span.start.line ||
			first.span.start.column <= owner.span.start.column
		) {
			this.cursor.addDiagnostic(first, `Falta una instrucción indentada después de ${label}.`);
			return [];
		}

		const statements: Statement[] = [];
		while (
			!this.cursor.isAt(TokenKind.EndOfFile) &&
			!this.cursor.isAt(TokenKind.End) &&
			!this.cursor.isAt(TokenKind.Else) &&
			this.cursor.getCurrentToken().span.start.column > owner.span.start.column
		) {
			statements.push(this.parseStatement());
		}
		return statements;
	}

	private parseExplicitBlock(): BlockStatement {
		const start = this.cursor.advanceToken();
		const statements = this.parseStatementsUntil(new Set([TokenKind.End]));
		const end = this.expect(TokenKind.End, 'Falta `fin` para cerrar el bloque.', 'PAR002');
		const span = spanBetween(start.span.start, end.span.end);
		return {
			kind: 'BlockStatement',
			id: createNodeId('BlockStatement', span),
			span,
			statements
		};
	}

	private parseBinding(message: string): IdentifierBinding {
		const token = this.expect(TokenKind.Identifier, message);
		return bindingFrom(token);
	}

	private parseParameterMode(): ParameterMode {
		const token = this.cursor.getCurrentToken();
		if (token.kind === TokenKind.InputParameter) {
			this.cursor.advanceToken();
			return 'E';
		}
		if (token.kind === TokenKind.OutputParameter) {
			this.cursor.advanceToken();
			return 'S';
		}
		if (token.kind === TokenKind.InputOutputParameter) {
			this.cursor.advanceToken();
			return 'ES';
		}
		this.cursor.addDiagnostic(token, 'Se esperaba el modo `E`, `S` o `ES` del parámetro.');
		return 'E';
	}

	private parsePrimitiveType(): 'numero' | 'boolean' {
		const token = this.cursor.getCurrentToken();
		if (token.kind === TokenKind.NumberType || token.kind === TokenKind.BooleanType) {
			this.cursor.advanceToken();
			return token.lexeme as 'numero' | 'boolean';
		}
		this.cursor.addDiagnostic(token, 'Se esperaba el tipo `numero` o `boolean`.');
		return 'numero';
	}

	private parseTypeName(): string {
		const token = this.cursor.getCurrentToken();
		if (
			token.kind === TokenKind.NumberType ||
			token.kind === TokenKind.BooleanType ||
			token.kind === TokenKind.Identifier
		) {
			this.cursor.advanceToken();
			return token.lexeme;
		}
		this.cursor.addDiagnostic(token, 'Falta un tipo después de `:`.');
		return '<error>';
	}

	private expect(kind: TokenKindType, message: string, code = 'PAR001'): Token {
		const token = this.cursor.getCurrentToken();
		if (token.kind === kind) return this.cursor.advanceToken();
		this.cursor.addDiagnostic(token, message, code);
		return { kind, lexeme: '', span: { start: token.span.start, end: token.span.start } };
	}

	private consume(kind: TokenKindType): boolean {
		if (!this.cursor.isAt(kind)) return false;
		this.cursor.advanceToken();
		return true;
	}

	private commandNode(token: Token, command: RobotCommand): RobotCommandStatement {
		return {
			kind: 'RobotCommandStatement',
			id: createNodeId('RobotCommandStatement', token.span),
			span: token.span,
			command
		};
	}

	private callNode(
		callee: IdentifierBinding,
		args: import('../ast/index.js').Expression[],
		end: SourcePosition
	): CallStatement {
		const span = spanBetween(callee.span.start, end);
		return {
			kind: 'CallStatement',
			id: createNodeId('CallStatement', span),
			span,
			callee,
			arguments: args
		};
	}

	private errorStatement(span: SourceSpan): ErrorStatement {
		return { kind: 'ErrorStatement', id: createNodeId('ErrorStatement', span), span };
	}
}

function bindingFrom(token: Token): IdentifierBinding {
	return { name: token.lexeme || '<error>', span: token.span };
}

function spanBetween(start: SourcePosition, end: SourcePosition): SourceSpan {
	return { start, end };
}

function branchEnd(statements: readonly Statement[], fallback: SourcePosition): SourcePosition {
	return statements.at(-1)?.span.end ?? fallback;
}
