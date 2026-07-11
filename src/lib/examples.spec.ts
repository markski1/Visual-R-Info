import { describe, expect, it } from 'vitest';

import { analyze } from './language/index.js';
import { createRuntime } from './runtime/index.js';
import { EXAMPLE_PROGRAMS } from './examples.js';

describe('programas de ejemplo', () => {
	for (const example of EXAMPLE_PROGRAMS) {
		it(`${example.name} analiza y termina correctamente`, () => {
			const analysis = analyze(example.source);
			expect(analysis.diagnostics).toEqual([]);
			if (analysis.program === undefined) return;
			const runtime = createRuntime(analysis.program);
			expect(runtime.ok).toBe(true);
			if (!runtime.ok) return;
			expect(runtime.value.run({ maxSteps: 1_000 }).status).toBe('finished');
		});
	}
});
