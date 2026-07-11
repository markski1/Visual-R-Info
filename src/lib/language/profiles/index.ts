/** Perfil estable que implementará el primer MVP. */
export const RINFO_CORE_PROFILE = 'rinfo-core-v1' as const;

/** Perfil CMRE: el lenguaje se analiza; el scheduler concurrente pertenece al runtime futuro. */
export const CMRE_PROFILE = 'cmre-v1' as const;

export type LanguageProfile =
	typeof RINFO_CORE_PROFILE | 'rinfo-compat-legacy' | typeof CMRE_PROFILE;
