import { describe, expect, it } from 'vitest';

import { parseScenario, serializeScenario } from './scenario-file.js';

describe('archivos de escenario', () => {
	it('serializa y recupera las esquinas del escenario', () => {
		const source = serializeScenario([
			{ coordinate: { avenue: 4, street: 7 }, contents: { flowers: 2, papers: 1 } }
		]);
		expect(parseScenario(source)).toEqual({
			ok: true,
			value: {
				version: 1,
				city: { width: 100, height: 100 },
				corners: [{ coordinate: { avenue: 4, street: 7 }, contents: { flowers: 2, papers: 1 } }]
			}
		});
	});

	it.each([
		['JSON inválido', '{'],
		['versión desconocida', '{"version":2,"city":{"width":100,"height":100},"corners":[]}'],
		['ciudad incorrecta', '{"version":1,"city":{"width":20,"height":20},"corners":[]}'],
		[
			'esquina repetida',
			'{"version":1,"city":{"width":100,"height":100},"corners":[{"coordinate":{"avenue":1,"street":1},"contents":{"flowers":0,"papers":0}},{"coordinate":{"avenue":1,"street":1},"contents":{"flowers":0,"papers":0}}]}'
		]
	])('rechaza %s', (_name, source) => {
		expect(parseScenario(source)).toMatchObject({ ok: false });
	});
});
