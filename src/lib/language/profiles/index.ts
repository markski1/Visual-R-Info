/** Perfil estable que implementará el primer MVP. */
export const RINFO_CORE_PROFILE = 'rinfo-core-v1' as const;

/** CMRE: Concurrent Multi Robot Environment, con scheduler determinista en el runtime. */
export const CMRE_PROFILE = 'cmre-v1' as const;

export type LanguageProfile =
	typeof RINFO_CORE_PROFILE | 'rinfo-compat-legacy' | typeof CMRE_PROFILE;
