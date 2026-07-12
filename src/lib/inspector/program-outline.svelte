<script lang="ts">
	import type {
		Expression,
		Statement,
		ValidatedProgram,
		VariableDeclaration
	} from '$lib/language/index.js';

	let { program }: { program?: ValidatedProgram } = $props();

	function expressionLabel(expression: Expression): string {
		switch (expression.kind) {
			case 'IntegerLiteralExpression':
				return expression.raw;
			case 'BooleanLiteralExpression':
				return expression.value ? 'V' : 'F';
			case 'IdentifierExpression':
				return expression.name;
			case 'RobotSensorExpression':
				return expression.sensor;
			case 'ParenthesizedExpression':
				return `(${expressionLabel(expression.expression)})`;
			case 'UnaryExpression':
				return `${expression.operator}${expressionLabel(expression.operand)}`;
			case 'BinaryExpression':
				return `${expressionLabel(expression.left)} ${expression.operator} ${expressionLabel(expression.right)}`;
			case 'ErrorExpression':
				return 'expresión con error';
		}
	}

	function statementLabel(statement: Statement): string {
		switch (statement.kind) {
			case 'AssignmentStatement':
				return `${statement.target.name} := ${expressionLabel(statement.value)}`;
			case 'CallStatement':
				return `${statement.callee.name}(${statement.arguments.map(expressionLabel).join(', ')})`;
			case 'RobotCommandStatement':
				return statement.command;
			case 'IfStatement':
				return `si (${expressionLabel(statement.condition)})`;
			case 'WhileStatement':
				return `mientras (${expressionLabel(statement.condition)})`;
			case 'RepeatStatement':
				return `repetir ${expressionLabel(statement.count)}`;
			case 'BlockStatement':
				return 'bloque comenzar … fin';
			case 'ErrorStatement':
				return 'instrucción con error';
		}
	}

	function variableLabel(declaration: VariableDeclaration): string {
		return `${declaration.names.map(({ name }) => name).join(', ')}: ${declaration.typeName}`;
	}
</script>

<details class="border-border bg-muted/30 mt-3 rounded-md border p-3">
	<summary class="cursor-pointer text-xs font-semibold"> [Avanzado] Analisis AST </summary>
	{#if program}
		<div class="text-muted-foreground mt-3 text-[11px] leading-relaxed">
			<p>Estructura AST desde el analizador.</p>
			<ul class="mt-3 space-y-1 border-l pl-3">
				<li>
					<details open>
						<summary class="cursor-pointer font-semibold">programa {program.ast.name.name}</summary>
						<div class="mt-2 space-y-2">
							{#if program.ast.processes.length}
								<details>
									<summary class="cursor-pointer">Procesos ({program.ast.processes.length})</summary
									>
									<ul class="mt-1 space-y-1 border-l pl-3">
										{#each program.ast.processes as process (process.id)}
											<li>
												<details>
													<summary class="cursor-pointer">
														proceso {process.name.name}({process.parameters
															.map(
																(parameter) =>
																	`${parameter.mode} ${parameter.name.name}: ${parameter.typeName}`
															)
															.join('; ')})
													</summary>
													{@render statements(process.body)}
												</details>
											</li>
										{/each}
									</ul>
								</details>
							{/if}
							{#if program.ast.areas.length}
								<details>
									<summary class="cursor-pointer">Áreas ({program.ast.areas.length})</summary>
									<ul class="mt-1 space-y-1 border-l pl-3">
										{#each program.ast.areas as area (area.id)}
											<li>
												{area.name.name}: {area.areaType}({area.arguments
													.map(expressionLabel)
													.join(', ')})
											</li>
										{/each}
									</ul>
								</details>
							{/if}
							<details>
								<summary class="cursor-pointer">Robots ({program.ast.robots.length})</summary>
								<ul class="mt-1 space-y-1 border-l pl-3">
									{#each program.ast.robots as robot (robot.id)}
										<li>
											<details>
												<summary class="cursor-pointer">robot {robot.name.name}</summary>
												{#if robot.variables.length}
													<p class="mt-1">
														Variables: {robot.variables.map(variableLabel).join(' · ')}
													</p>
												{/if}
												{@render statements(robot.body)}
											</details>
										</li>
									{/each}
								</ul>
							</details>
							{#if program.ast.variables.length}
								<p>Variables principales: {program.ast.variables.map(variableLabel).join(' · ')}</p>
							{/if}
							<details>
								<summary class="cursor-pointer">Bloque principal</summary>
								{@render statements(program.ast.body)}
							</details>
						</div>
					</details>
				</li>
			</ul>
		</div>
	{:else}
		<p class="text-muted-foreground mt-2 text-xs">
			Corregí los errores para ver cómo se estructura el programa.
		</p>
	{/if}
</details>

{#snippet statements(entries: readonly Statement[])}
	{#if entries.length}
		<ul class="mt-2 space-y-1 border-l pl-3">
			{#each entries as statement (statement.id)}
				<li>
					{#if statement.kind === 'IfStatement'}
						<details>
							<summary class="cursor-pointer">{statementLabel(statement)}</summary>
							<p class="mt-1">Si es verdadero:</p>
							{@render statements(statement.thenBranch)}
							{#if statement.elseBranch}
								<p class="mt-1">Si no:</p>
								{@render statements(statement.elseBranch)}
							{/if}
						</details>
					{:else if statement.kind === 'WhileStatement' || statement.kind === 'RepeatStatement'}
						<details>
							<summary class="cursor-pointer">{statementLabel(statement)}</summary>
							{@render statements(statement.body)}
						</details>
					{:else if statement.kind === 'BlockStatement'}
						<details>
							<summary class="cursor-pointer">{statementLabel(statement)}</summary>
							{@render statements(statement.statements)}
						</details>
					{:else}
						<span>{statementLabel(statement)}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="mt-2">Sin instrucciones.</p>
	{/if}
{/snippet}
