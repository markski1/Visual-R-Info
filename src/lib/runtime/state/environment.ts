import { failure, success, type RuntimeResult } from '../model/result.js';

export type RuntimeValue = number | boolean;

/** Una celda permite implementar parámetros S/ES por referencia sin copiar valores. */
export interface VariableCell {
	value: RuntimeValue;
}

export class Environment {
	private readonly bindings = new Map<string, VariableCell>();

	public constructor(private readonly parent?: Environment) {}

	public declare(name: string, value: RuntimeValue): RuntimeResult<VariableCell> {
		if (this.bindings.has(name))
			return failure('RUN010', `La variable \`${name}\` ya existe en este frame.`);
		const cell = { value };
		this.bindings.set(name, cell);
		return success(cell);
	}

	public bind(name: string, cell: VariableCell): RuntimeResult<VariableCell> {
		if (this.bindings.has(name))
			return failure('RUN010', `La variable \`${name}\` ya existe en este frame.`);
		this.bindings.set(name, cell);
		return success(cell);
	}

	public resolve(name: string): VariableCell | undefined {
		return this.bindings.get(name) ?? this.parent?.resolve(name);
	}

	public snapshot(): Readonly<Record<string, RuntimeValue>> {
		return Object.fromEntries([...this.bindings].map(([name, cell]) => [name, cell.value]));
	}
}
