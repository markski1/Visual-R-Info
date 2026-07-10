import { describe, expect, it } from 'vitest';

import { RINFO_CORE_PROFILE } from './index.js';

describe('language boundary', () => {
	it('expone el perfil productivo del MVP', () => {
		expect(RINFO_CORE_PROFILE).toBe('rinfo-core-v1');
	});
});
