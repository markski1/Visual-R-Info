import type {
	AreaDeclaration,
	BinaryExpression,
	CallStatement,
	Expression,
	ParameterDeclaration,
	ProcessDeclaration,
	ProgramNode,
	Statement,
	VariableDeclaration
} from '../ast/index.js';
import type { Diagnostic } from '../diagnostics/index.js';
import type { SourceSpan } from '../source/index.js';

export type SemanticType = 'numero' | 'boolean' | 'area' | `robot:${string}` | 'unknown';
export type SymbolKind = 'variable' | 'parameter' | 'process' | 'area' | 'robot-type';

export interface SymbolEntry {
	readonly name: string;
	readonly kind: SymbolKind;
	readonly type: SemanticType;
	readonly span: SourceSpan;
	readonly scope: string;
}

export interface SymbolTable {
	readonly symbols: readonly SymbolEntry[];
}

export interface SemanticAnalysisResult {
	readonly symbols: SymbolTable;
	readonly diagnostics: readonly Diagnostic[];
}

interface ProcessSignature {
	readonly declaration: ProcessDeclaration;
	readonly parameters: readonly ParameterDeclaration[];
}

export function analyzeSemantics(program: ProgramNode): SemanticAnalysisResult {
	return new SemanticAnalyzer(program).analyze();
}

class Scope {
	private readonly entries = new Map<string, SymbolEntry>();

	public constructor(
		public readonly name: string,
		private readonly parent?: Scope
	) {}

	public declare(entry: SymbolEntry): SymbolEntry | undefined {
		const previous = this.entries.get(entry.name);
		if (previous !== undefined) return previous;
		this.entries.set(entry.name, entry);
		return undefined;
	}

	public resolve(name: string): SymbolEntry | undefined {
		return this.entries.get(name) ?? this.parent?.resolve(name);
	}
}

class SemanticAnalyzer {
	private readonly diagnostics: Diagnostic[] = [];
	private readonly symbols: SymbolEntry[] = [];
	private readonly declarations = new Scope('programa');
	private readonly main = new Scope('principal', this.declarations);
	private readonly processes = new Map<string, ProcessSignature>();
	private readonly robotTypes = new Set<string>();

	public constructor(private readonly program: ProgramNode) {}

	public analyze(): SemanticAnalysisResult {
		// Primero se registran los nombres globales para permitir referencias a procesos y tipos declarados más adelante.
		this.declareTopLevel();
		for (const area of this.program.areas) this.analyzeArea(area);
		for (const process of this.program.processes) this.analyzeProcess(process);
		for (const robot of this.program.robots) {
			// Los robots CMRE pueden referenciar las instancias declaradas en el bloque principal.
			const scope = new Scope(`robot:${robot.name.name}`, this.main);
			this.declareVariables(robot.variables, scope);
			this.analyzeStatements(robot.body, scope);
		}
		this.analyzeStatements(this.program.body, this.main);

		return {
			symbols: { symbols: this.symbols },
			diagnostics: this.diagnostics
		};
	}

	private declareTopLevel(): void {
		for (const process of this.program.processes) {
			this.declare(this.declarations, {
				name: process.name.name,
				kind: 'process',
				type: 'unknown',
				span: process.name.span,
				scope: this.declarations.name
			});
			this.processes.set(process.name.name, {
				declaration: process,
				parameters: process.parameters
			});
		}

		for (const area of this.program.areas) {
			this.declare(this.declarations, {
				name: area.name.name,
				kind: 'area',
				type: 'area',
				span: area.name.span,
				scope: this.declarations.name
			});
		}

		for (const robot of this.program.robots) {
			this.robotTypes.add(robot.name.name);
			this.declare(this.declarations, {
				name: robot.name.name,
				kind: 'robot-type',
				type: `robot:${robot.name.name}`,
				span: robot.name.span,
				scope: this.declarations.name
			});
		}

		this.declareVariables(this.program.variables, this.main);
	}

	private analyzeArea(area: AreaDeclaration): void {
		if (area.arguments.length !== 4) {
			this.report(
				'SEM005',
				`El área \`${area.name.name}\` necesita cuatro coordenadas.`,
				area.span
			);
		}
		for (const argument of area.arguments) {
			this.requireType(
				this.expressionType(argument, this.declarations),
				'numero',
				argument.span,
				'Las coordenadas del área deben ser numéricas.'
			);
		}
	}

	private analyzeProcess(process: ProcessDeclaration): void {
		// Cada proceso tiene su propio ámbito, que puede consultar las declaraciones globales pero no las variables de otro robot.
		const scope = new Scope(`proceso:${process.name.name}`, this.declarations);
		for (const parameter of process.parameters) {
			this.declare(scope, {
				name: parameter.name.name,
				kind: 'parameter',
				type: parameter.typeName,
				span: parameter.name.span,
				scope: scope.name
			});
		}
		this.declareVariables(process.variables, scope);
		this.analyzeStatements(process.body, scope);
	}

	private declareVariables(declarations: readonly VariableDeclaration[], scope: Scope): void {
		for (const declaration of declarations) {
			const type = this.resolveDeclaredType(declaration.typeName, declaration.span);
			for (const name of declaration.names) {
				this.declare(scope, {
					name: name.name,
					kind: 'variable',
					type,
					span: name.span,
					scope: scope.name
				});
			}
		}
	}

	private resolveDeclaredType(typeName: string, span: SourceSpan): SemanticType {
		if (typeName === 'numero' || typeName === 'boolean') return typeName;
		if (this.robotTypes.has(typeName)) return `robot:${typeName}`;
		this.report('SEM001', `El tipo \`${typeName}\` no fue declarado.`, span);
		return 'unknown';
	}

	private declare(scope: Scope, entry: SymbolEntry): void {
		const previous = scope.declare(entry);
		if (previous !== undefined) {
			this.diagnostics.push({
				code: 'SEM002',
				phase: 'semantic',
				severity: 'error',
				message: `El nombre \`${entry.name}\` ya está declarado en este ámbito.`,
				span: entry.span,
				related: [{ message: 'La primera declaración está acá.', span: previous.span }]
			});
			return;
		}
		this.symbols.push(entry);
	}

	private analyzeStatements(statements: readonly Statement[], scope: Scope): void {
		for (const statement of statements) this.analyzeStatement(statement, scope);
	}

	private analyzeStatement(statement: Statement, scope: Scope): void {
		switch (statement.kind) {
			case 'AssignmentStatement': {
				const target = this.resolveValue(statement.target.name, statement.target.span, scope);
				const value = this.expressionType(statement.value, scope);
				if (target !== undefined) {
					this.requireType(
						value,
						target.type,
						statement.value.span,
						`No podés asignar un valor ${typeLabel(value)} a \`${statement.target.name}\`, que es ${typeLabel(target.type)}.`
					);
				}
				break;
			}
			case 'CallStatement':
				this.analyzeCall(statement, scope);
				break;
			case 'IfStatement':
				this.requireType(
					this.expressionType(statement.condition, scope),
					'boolean',
					statement.condition.span,
					'La condición de `si` debe ser booleana.'
				);
				this.analyzeStatements(statement.thenBranch, scope);
				if (statement.elseBranch !== undefined) this.analyzeStatements(statement.elseBranch, scope);
				break;
			case 'WhileStatement':
				this.requireType(
					this.expressionType(statement.condition, scope),
					'boolean',
					statement.condition.span,
					'La condición de `mientras` debe ser booleana.'
				);
				this.analyzeStatements(statement.body, scope);
				break;
			case 'RepeatStatement':
				this.requireType(
					this.expressionType(statement.count, scope),
					'numero',
					statement.count.span,
					'La cantidad de `repetir` debe ser numérica.'
				);
				this.analyzeStatements(statement.body, scope);
				break;
			case 'BlockStatement':
				this.analyzeStatements(statement.statements, scope);
				break;
			case 'RobotCommandStatement':
			case 'ErrorStatement':
				break;
		}
	}

	private analyzeCall(call: CallStatement, scope: Scope): void {
		const name = call.callee.name;
		const signature = this.processes.get(name);
		if (signature !== undefined) {
			this.checkArity(call, signature.parameters.length);
			for (const [index, parameter] of signature.parameters.entries()) {
				const argument = call.arguments[index];
				if (argument === undefined) continue;
				const actual = this.expressionType(argument, scope);
				this.requireType(
					actual,
					parameter.typeName,
					argument.span,
					`El parámetro \`${parameter.name.name}\` espera ${parameter.typeName}.`
				);
				if (parameter.mode !== 'E' && argument.kind !== 'IdentifierExpression') {
					this.report(
						'SEM006',
						`El parámetro ${parameter.mode} \`${parameter.name.name}\` necesita una variable.`,
						argument.span
					);
				}
			}
			return;
		}

		switch (name) {
			case 'Informar':
				if (call.arguments.length === 0) this.checkArity(call, 1);
				for (const argument of call.arguments) this.expressionType(argument, scope);
				return;
			case 'Pos':
				this.checkNumericArguments(call, scope, 2);
				return;
			case 'AsignarArea':
				this.checkArity(call, 2);
				this.requireRobot(call.arguments[0], scope);
				this.requireArgumentType(
					call.arguments[1],
					'area',
					scope,
					'El segundo argumento de `AsignarArea` debe ser un área.'
				);
				return;
			case 'Iniciar':
				this.checkArity(call, 3);
				this.requireRobot(call.arguments[0], scope);
				this.requireArgumentType(
					call.arguments[1],
					'numero',
					scope,
					'La avenida inicial debe ser numérica.'
				);
				this.requireArgumentType(
					call.arguments[2],
					'numero',
					scope,
					'La calle inicial debe ser numérica.'
				);
				return;
			case 'Random':
				this.checkNumericArguments(call, scope, 3);
				if (call.arguments[0]?.kind !== 'IdentifierExpression') {
					this.report(
						'SEM006',
						'El primer argumento de `Random` debe ser una variable numérica.',
						call.arguments[0]?.span ?? call.span
					);
				}
				return;
			case 'bloquearEsquina':
			case 'liberarEsquina':
				this.checkNumericArguments(call, scope, 2);
				return;
			case 'enviarMensaje':
			case 'recibirMensaje':
				this.checkArity(call, 2);
				if (call.arguments[0] !== undefined) this.expressionType(call.arguments[0], scope);
				if (name === 'recibirMensaje' && call.arguments[0]?.kind !== 'IdentifierExpression') {
					this.report(
						'SEM006',
						'El primer argumento de `recibirMensaje` debe ser una variable.',
						call.arguments[0]?.span ?? call.span
					);
				}
				this.requireRobot(call.arguments[1], scope);
				return;
		}

		this.report('SEM001', `El proceso \`${name}\` no fue declarado.`, call.callee.span);
		for (const argument of call.arguments) this.expressionType(argument, scope);
	}

	private expressionType(expression: Expression, scope: Scope): SemanticType {
		switch (expression.kind) {
			case 'IntegerLiteralExpression':
				return 'numero';
			case 'BooleanLiteralExpression':
				return 'boolean';
			case 'IdentifierExpression':
				return this.resolveValue(expression.name, expression.span, scope)?.type ?? 'unknown';
			case 'RobotSensorExpression':
				return expression.sensor === 'PosAv' || expression.sensor === 'PosCa'
					? 'numero'
					: 'boolean';
			case 'ParenthesizedExpression':
				return this.expressionType(expression.expression, scope);
			case 'UnaryExpression': {
				const operand = this.expressionType(expression.operand, scope);
				const expected = expression.operator === '-' ? 'numero' : 'boolean';
				this.requireType(
					operand,
					expected,
					expression.operand.span,
					`El operador \`${expression.operator}\` necesita un valor ${typeLabel(expected)}.`
				);
				return expected;
			}
			case 'BinaryExpression':
				return this.binaryType(expression, scope);
			case 'ErrorExpression':
				return 'unknown';
		}
	}

	private binaryType(expression: BinaryExpression, scope: Scope): SemanticType {
		const left = this.expressionType(expression.left, scope);
		const right = this.expressionType(expression.right, scope);
		if (['+', '-', '*', '/'].includes(expression.operator)) {
			this.requireType(
				left,
				'numero',
				expression.left.span,
				`El operador \`${expression.operator}\` necesita números.`
			);
			this.requireType(
				right,
				'numero',
				expression.right.span,
				`El operador \`${expression.operator}\` necesita números.`
			);
			return 'numero';
		}
		if (expression.operator === '&' || expression.operator === '|') {
			this.requireType(
				left,
				'boolean',
				expression.left.span,
				`El operador \`${expression.operator}\` necesita valores booleanos.`
			);
			this.requireType(
				right,
				'boolean',
				expression.right.span,
				`El operador \`${expression.operator}\` necesita valores booleanos.`
			);
			return 'boolean';
		}

		if (expression.operator === '=' || expression.operator === '<>') {
			if (left !== 'unknown' && right !== 'unknown' && left !== right) {
				this.report(
					'SEM003',
					'Los dos lados de la comparación deben tener el mismo tipo.',
					expression.span
				);
			}
			return 'boolean';
		}

		this.requireType(
			left,
			'numero',
			expression.left.span,
			'Las comparaciones de orden necesitan números.'
		);
		this.requireType(
			right,
			'numero',
			expression.right.span,
			'Las comparaciones de orden necesitan números.'
		);
		return 'boolean';
	}

	private resolveValue(name: string, span: SourceSpan, scope: Scope): SymbolEntry | undefined {
		const symbol = scope.resolve(name);
		if (symbol === undefined || (symbol.kind !== 'variable' && symbol.kind !== 'parameter')) {
			this.report('SEM001', `La variable \`${name}\` no fue declarada.`, span);
			return undefined;
		}
		return symbol;
	}

	private checkNumericArguments(call: CallStatement, scope: Scope, count: number): void {
		this.checkArity(call, count);
		for (const argument of call.arguments) {
			this.requireType(
				this.expressionType(argument, scope),
				'numero',
				argument.span,
				`Los argumentos de \`${call.callee.name}\` deben ser numéricos.`
			);
		}
	}

	private requireRobot(expression: Expression | undefined, scope: Scope): void {
		if (expression === undefined) return;
		const actual = this.expressionType(expression, scope);
		if (actual !== 'unknown' && !actual.startsWith('robot:')) {
			this.report('SEM003', 'Se esperaba una variable robot.', expression.span);
		}
	}

	private requireArgumentType(
		expression: Expression | undefined,
		expected: SemanticType,
		scope: Scope,
		message: string
	): void {
		if (expression === undefined) return;
		let actual: SemanticType;
		if (expected === 'area' && expression.kind === 'IdentifierExpression') {
			const symbol = scope.resolve(expression.name);
			if (symbol === undefined) {
				this.report('SEM001', `El área \`${expression.name}\` no fue declarada.`, expression.span);
				return;
			}
			actual = symbol.type;
		} else {
			actual = this.expressionType(expression, scope);
		}
		this.requireType(actual, expected, expression.span, message);
	}

	private checkArity(call: CallStatement, expected: number): void {
		if (call.arguments.length !== expected) {
			this.report(
				'SEM005',
				`\`${call.callee.name}\` espera ${expected} argumento${expected === 1 ? '' : 's'}, pero recibió ${call.arguments.length}.`,
				call.span
			);
		}
	}

	private requireType(
		actual: SemanticType,
		expected: SemanticType,
		span: SourceSpan,
		message: string
	): void {
		if (actual !== 'unknown' && expected !== 'unknown' && actual !== expected) {
			this.report('SEM003', message, span);
		}
	}

	private report(code: string, message: string, span: SourceSpan): void {
		this.diagnostics.push({ code, phase: 'semantic', severity: 'error', message, span });
	}
}

function typeLabel(type: SemanticType): string {
	if (type === 'numero') return 'numérico';
	if (type === 'boolean') return 'booleano';
	if (type === 'area') return 'de área';
	if (type.startsWith('robot:')) return 'robot';
	return 'desconocido';
}
